/**
 * Planilha (CSV) do relatório de compras (L.2), pela pessoa do parceiro. O parceiro vem SÓ da sessão; sem sessão 401, sem "ver
 * compras e notas" 403, e as lojas são as do acesso. Os filtros vêm da URL e são os MESMOS da tela. Regras em
 * `src/lib/erp/compras-relatorio-planilha.ts`.
 */

import { parceiroDaSessaoOuNada, pode } from '@/lib/erp/contexto';
import { respostaHttpDaPlanilha, responderPlanilha } from '@/lib/erp/compras-relatorio-planilha';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const ctx = await parceiroDaSessaoOuNada();
  // A permissão é conferida aqui e de novo dentro da planilha (segunda trava): sem "ver compras e notas", 403 sem dado.
  if (ctx && !pode(ctx.alcance, 'compras.ver')) return respostaHttpDaPlanilha({ ok: false, status: 403, frase: 'Seu acesso não inclui ver compras e notas.' });
  return responderPlanilha(ctx?.cliente ?? null, ctx?.alcance ?? null, req);
}
