import { parceiroDaSessaoOuNada } from '@/lib/erp/contexto';
import { responderLogoDaMarca } from '@/lib/erp/identidade-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Parametros = { params: Promise<{ id: string }> };

async function atender(req: Request, { params }: Parametros) {
  const ctx = await parceiroDaSessaoOuNada();
  return responderLogoDaMarca(req, ctx, (await params).id);
}
export { atender as GET, atender as POST, atender as DELETE };
