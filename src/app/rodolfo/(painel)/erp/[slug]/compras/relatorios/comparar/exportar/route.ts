/**
 * Planilha (CSV) da comparação de fornecedores ou de períodos (L.3) de um Parceiro Flow, pelo nível 1 (sessão do /rodolfo + parceiro
 * do endereço). A MESMA planilha da pessoa do parceiro: regras em `src/lib/erp/compras-comparacao-planilha.ts`.
 */

import { parceiroDoNivel1OuNada } from '@/lib/erp/contexto';
import { responderPlanilhaDaComparacao } from '@/lib/erp/compras-comparacao-planilha';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const ctx = await parceiroDoNivel1OuNada(params.slug);
  return responderPlanilhaDaComparacao(ctx?.cliente ?? null, ctx?.alcance ?? null, req);
}
