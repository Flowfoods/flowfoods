import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/rodolfo/auth';
import { prisma } from '@/lib/db';
import { mimeDoNome } from '@/lib/portal/audio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Download de um arquivo do cliente, só com sessão.
 *
 * Sai como anexo e `application/octet-stream`: um HTML ou SVG enviado pelo
 * formulário nunca é renderizado dentro do domínio do painel. A exceção é
 * áudio (gravado no formulário ou anexado), que vai com o tipo certo e
 * `inline` para o player do painel tocar — áudio não executa nada.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const sessao = await getServerSession(authOptions);
  if (!sessao) return new Response('Sem sessão.', { status: 401 });

  const a = await prisma.portalArquivo.findUnique({ where: { id: params.id } });
  if (!a) return new Response('Arquivo não encontrado.', { status: 404 });

  const audio = mimeDoNome(a.nomeOriginal);
  const nome = encodeURIComponent(a.nomeOriginal);

  try {
    const s = await stat(a.caminho);
    const corpo = Readable.toWeb(createReadStream(a.caminho)) as ReadableStream;
    return new Response(corpo, {
      headers: {
        'Content-Type': audio ?? 'application/octet-stream',
        'Content-Length': String(s.size),
        'Content-Disposition': `${audio ? 'inline' : 'attachment'}; filename*=UTF-8''${nome}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return new Response('O registro existe, mas o arquivo não está no disco.', { status: 410 });
  }
}
