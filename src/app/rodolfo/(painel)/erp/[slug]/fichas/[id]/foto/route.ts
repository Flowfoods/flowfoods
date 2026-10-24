/** Foto da ficha técnica de um parceiro, pelo nível 1 (lida pelo portão do parceiro do slug: de outro, 404). */

import { exigirParceiro, pode } from '@/lib/erp/contexto';
import { responderFoto } from '@/lib/erp/foto-resposta';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { slug: string; id: string } }) {
  const ctx = await exigirParceiro(params.slug);
  return responderFoto(ctx.cliente, params.id, pode(ctx.alcance, 'fichas.ver'), new URL(req.url).searchParams.get('apoio'));
}
