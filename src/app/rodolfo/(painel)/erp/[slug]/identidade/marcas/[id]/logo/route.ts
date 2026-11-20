import { parceiroDoNivel1OuNada } from '@/lib/erp/contexto';
import { responderLogoDaMarca } from '@/lib/erp/identidade-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Parametros = { params: Promise<{ slug: string; id: string }> };

async function atender(req: Request, { params }: Parametros) {
  const p = await params;
  return responderLogoDaMarca(req, await parceiroDoNivel1OuNada(p.slug), p.id);
}
export { atender as GET, atender as POST, atender as DELETE };
