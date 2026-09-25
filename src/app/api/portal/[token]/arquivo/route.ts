import { exigirCliente, removerArquivo, salvarArquivo } from '@/lib/portal/dados';
import { LIMITE_BYTES } from '@/lib/portal/arquivos';
import { falha, json } from '@/lib/portal/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Folga do multipart (cabeçalhos e fronteiras) sobre o limite do arquivo. */
const FOLGA_MULTIPART = 1024 * 1024;

/** Upload de um arquivo: multipart com `itemId` e `arquivo`. */
export async function POST(req: Request, { params }: { params: { token: string } }) {
  try {
    const c = await exigirCliente(params.token);

    // Recusa antes de ler o corpo: um upload de 2 GB não chega a ocupar memória.
    const tamanho = Number(req.headers.get('content-length') ?? '0');
    if (tamanho > LIMITE_BYTES + FOLGA_MULTIPART) {
      return json({ ok: false, erro: 'Arquivo acima de 50 MB.' }, 413);
    }

    const form = await req.formData();
    const itemId = form.get('itemId');
    const arquivo = form.get('arquivo');
    if (typeof itemId !== 'string' || !(arquivo instanceof File)) {
      return json({ ok: false, erro: 'Envie itemId e arquivo.' }, 400);
    }

    const salvo = await salvarArquivo(c, itemId, arquivo);
    return json({ ok: true, arquivo: salvo });
  } catch (e) {
    return falha(e);
  }
}

/** Remove um arquivo enviado por engano: `?id=<arquivoId>`. */
export async function DELETE(req: Request, { params }: { params: { token: string } }) {
  try {
    const c = await exigirCliente(params.token);
    const id = new URL(req.url).searchParams.get('id') ?? '';
    await removerArquivo(c, id);
    return json({ ok: true });
  } catch (e) {
    return falha(e);
  }
}
