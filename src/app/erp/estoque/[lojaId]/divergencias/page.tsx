/** ERP do parceiro — divergências da loja (1.8): requisição × contagem. Quem confere contagem ("ajustar saldo") NA loja. */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { divergenciasDaLoja } from '@/lib/erp/requisicao';
import { TelaDivergencias } from '@/components/erp/telas/requisicoes/divergencias';

export const dynamic = 'force-dynamic';

export default async function ErpDivergenciasDaLojaPage(
  props: { params: Promise<{ lojaId: string }>; searchParams: Promise<{ de?: string; ate?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'estoque.ajustar');
  const d = await divergenciasDaLoja(ctx.cliente, ctx.alcance, params.lojaId, searchParams);
  if (!d) notFound();
  return <TelaDivergencias d={d} base="/erp/estoque" />;
}
