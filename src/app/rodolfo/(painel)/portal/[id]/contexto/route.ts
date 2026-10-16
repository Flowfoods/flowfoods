import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/rodolfo/auth';
import { prisma } from '@/lib/db';
import { questionario } from '@/lib/portal/questionario';
import { gerarContextoMd, nomeDoContexto } from '@/lib/portal/contexto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** O `.md` de contexto do cliente, para guardar em `clientes/<slug>/`. Só com sessão. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const sessao = await getServerSession(authOptions);
  if (!sessao) return new Response('Sem sessão.', { status: 401 });

  const cliente = await prisma.portalCliente.findUnique({
    where: { id: params.id },
    include: { respostas: true, arquivos: { orderBy: { criadoEm: 'asc' } } },
  });
  if (!cliente) return new Response('Cliente não encontrado.', { status: 404 });
  const q = questionario(cliente.questionario);
  if (!q) return new Response('Questionário não encontrado.', { status: 404 });

  const agora = new Date();
  const md = gerarContextoMd({
    nome: cliente.nome,
    slug: cliente.slug,
    q,
    respostas: cliente.respostas,
    arquivos: cliente.arquivos,
    finalizadoEm: cliente.finalizadoEm,
    ultimaAtividadeEm: cliente.ultimaAtividadeEm,
    agora,
  });

  return new Response(md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nomeDoContexto(cliente.slug, agora)}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
