/**
 * Planilha (CSV) da comparação de fornecedores ou de períodos (L.3), pela pessoa do parceiro. O parceiro vem SÓ da sessão; sem
 * sessão 401, sem "ver compras e notas" 403, e as lojas são as do acesso. Os filtros vêm da URL (`tela=fornecedores|periodos`) e são
 * os MESMOS da tela. Regras em `src/lib/erp/compras-comparacao-planilha.ts`.
 */

import { parceiroDaSessaoOuNada, pode } from '@/lib/erp/contexto';
import { respostaHttpDaPlanilha } from '@/lib/erp/compras-relatorio-planilha';
import { responderPlanilhaDaComparacao } from '@/lib/erp/compras-comparacao-planilha';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const ctx = await parceiroDaSessaoOuNada();
  // A permissão é conferida aqui e de novo dentro da planilha (segunda trava): sem "ver compras e notas", 403 sem dado.
  if (ctx && !pode(ctx.alcance, 'compras.ver')) return respostaHttpDaPlanilha({ ok: false, status: 403, frase: 'Seu acesso não inclui ver compras e notas.' });
  return responderPlanilhaDaComparacao(ctx?.cliente ?? null, ctx?.alcance ?? null, req);
}
