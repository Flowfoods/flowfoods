/**
 * Planilha (CSV) do consumo e conciliação de estoque (L.4), pela pessoa do parceiro. O parceiro vem SÓ da sessão; sem sessão 401,
 * sem "ver o estoque" 403, e as lojas são as do acesso. Os filtros vêm da URL e são os MESMOS da tela (`parte=movimentos` com `col`
 * baixa os movimentos de um número). Regras em `src/lib/erp/consumo-estoque-planilha.ts`.
 */

import { parceiroDaSessaoOuNada, pode } from '@/lib/erp/contexto';
import { respostaHttpDaPlanilha } from '@/lib/erp/compras-relatorio-planilha';
import { responderPlanilhaDoConsumo } from '@/lib/erp/consumo-estoque-planilha';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const ctx = await parceiroDaSessaoOuNada();
  // A permissão é conferida aqui e de novo dentro da planilha (segunda trava): sem "ver o estoque", 403 sem dado.
  if (ctx && !pode(ctx.alcance, 'estoque.ver')) return respostaHttpDaPlanilha({ ok: false, status: 403, frase: 'Seu acesso não inclui ver o estoque.' });
  return responderPlanilhaDoConsumo(ctx?.cliente ?? null, ctx?.alcance ?? null, req);
}
