/**
 * Planilha (CSV) do relatório de compras (L.2), pela pessoa do parceiro. O parceiro vem SÓ da sessão; sem sessão 401, sem "ver
 * compras e notas" 403, e as lojas são as do acesso. Os filtros vêm da URL e são os MESMOS da tela. Regras em
 * `src/lib/erp/compras-relatorio-planilha.ts`.
 */

import { parceiroDaSessaoOuNada } from '@/lib/erp/contexto';
import { responderPlanilha } from '@/lib/erp/compras-relatorio-planilha';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const ctx = await parceiroDaSessaoOuNada();
  return responderPlanilha(ctx?.cliente ?? null, ctx?.alcance ?? null, req);
}
