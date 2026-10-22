/**
 * Planilha (CSV) do relatório de compras (L.2) de um Parceiro Flow, pelo nível 1 (sessão do /rodolfo + parceiro do endereço).
 * A MESMA planilha da pessoa do parceiro: regras em `src/lib/erp/compras-relatorio-planilha.ts`.
 */

import { parceiroDoNivel1OuNada } from '@/lib/erp/contexto';
import { responderPlanilha } from '@/lib/erp/compras-relatorio-planilha';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const ctx = await parceiroDoNivel1OuNada(params.slug);
  return responderPlanilha(ctx?.cliente ?? null, ctx?.alcance ?? null, req);
}
