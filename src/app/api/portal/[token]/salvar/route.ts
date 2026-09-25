import { exigirCliente, salvarResposta } from '@/lib/portal/dados';
import { falha, json } from '@/lib/portal/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Autosave de um item: `{ itemId, texto?, marcacao? }`.
 *
 * Aceita corpo `text/plain` também: é o que o `fetch(..., { keepalive })` do
 * fechamento de aba às vezes manda, e perder o último parágrafo digitado
 * porque o cabeçalho veio diferente seria o pior tipo de bug.
 */
export async function POST(req: Request, { params }: { params: { token: string } }) {
  try {
    const c = await exigirCliente(params.token);
    let corpo: Record<string, unknown>;
    try {
      corpo = JSON.parse(await req.text()) as Record<string, unknown>;
    } catch {
      return json({ ok: false, erro: 'Corpo inválido.' }, 400);
    }
    await salvarResposta(c, corpo);
    return json({ ok: true, salvoEm: new Date().toISOString() });
  } catch (e) {
    return falha(e);
  }
}
