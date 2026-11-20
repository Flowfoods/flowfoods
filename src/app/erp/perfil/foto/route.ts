import { sessaoDaRequisicao } from '@/lib/erp/sessao';
import { responderFotoDaPessoa } from '@/lib/erp/identidade-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function atender(req: Request) { return responderFotoDaPessoa(req, await sessaoDaRequisicao()); }
export { atender as GET, atender as POST, atender as DELETE };
