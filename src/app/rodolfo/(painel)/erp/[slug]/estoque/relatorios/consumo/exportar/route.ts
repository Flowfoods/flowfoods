/**
 * Planilha (CSV) do consumo e conciliação de estoque (L.4) de um Parceiro Flow, pelo nível 1 (sessão do /rodolfo + parceiro do
 * endereço). A MESMA planilha da pessoa do parceiro: regras em `src/lib/erp/consumo-estoque-planilha.ts`.
 */

import { parceiroDoNivel1OuNada } from '@/lib/erp/contexto';
import { responderPlanilhaDoConsumo } from '@/lib/erp/consumo-estoque-planilha';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const ctx = await parceiroDoNivel1OuNada(params.slug);
  return responderPlanilhaDoConsumo(ctx?.cliente ?? null, ctx?.alcance ?? null, req);
}
