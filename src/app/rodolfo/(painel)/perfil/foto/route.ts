import { sessaoNivel1DaIdentidade } from '@/lib/erp/identidade-contexto';
import { responderFotoNivel1 } from '@/lib/erp/identidade-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function atender(req: Request) { return responderFotoNivel1(req, await sessaoNivel1DaIdentidade()); }
export { atender as GET, atender as POST, atender as DELETE };
