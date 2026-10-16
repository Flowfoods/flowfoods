/**
 * Envio da foto da ficha técnica, pela pessoa do parceiro. Sessão, "criar e
 * editar fichas" e parceiro ativo conferidos ANTES de ler o corpo; o parceiro
 * vem da SESSÃO (nunca da URL). Regras em `src/lib/erp/foto-envio.ts`.
 */

import { parceiroDaSessaoOuNada } from '@/lib/erp/contexto';
import { receberFotoDaFicha } from '@/lib/erp/foto-envio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return receberFotoDaFicha(req, await parceiroDaSessaoOuNada());
}
