/**
 * ERP do parceiro — as etiquetas de uma loja (3.4): "imprimir etiquetas" NA loja (fora do acesso ou de outro parceiro, 404).
 * Os lotes concluídos e as embalagens abertas dos últimos 7 dias, a fila da impressora e a busca pelo código do lote.
 */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { painelDeEtiquetas } from '@/lib/erp/etiquetas';
import { TelaPainelDeEtiquetas } from '@/components/erp/telas/etiquetas/painel';
import { fraseDasEtiquetas } from '@/components/erp/telas/etiquetas/estado';

export const dynamic = 'force-dynamic';

export default async function ErpEtiquetasDaLojaPage({ params, searchParams }: { params: { lojaId: string }; searchParams: { lote?: string; feito?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'etiquetas.imprimir');
  const p = await painelDeEtiquetas(ctx.cliente, ctx.alcance, params.lojaId, { lote: searchParams.lote });
  if (!p) notFound();
  return <TelaPainelDeEtiquetas p={p} base="/erp/etiquetas" feito={fraseDasEtiquetas(searchParams.feito)} podeAbrir />;
}
