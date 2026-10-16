/**
 * Foto da ficha técnica, para a pessoa do parceiro. O parceiro vem da SESSÃO
 * (nunca da URL) e a ficha é lida pelo portão dele: foto de outro parceiro não
 * sai daqui. Exige "ver fichas técnicas".
 */

import { exigirParceiroDaSessao, pode } from '@/lib/erp/contexto';
import { responderFoto } from '@/lib/erp/foto-resposta';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await exigirParceiroDaSessao();
  return responderFoto(ctx.cliente, params.id, pode(ctx.alcance, 'fichas.ver'));
}
