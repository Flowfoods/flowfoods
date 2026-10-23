/**
 * ERP do parceiro — o histórico de impressões de uma loja (3.4): "imprimir etiquetas" NA loja (fora do acesso ou de outro
 * parceiro, 404). Período, origem e página na URL. Nenhum valor em R$.
 */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { historicoDeImpressoes } from '@/lib/erp/etiquetas';
import { TelaHistoricoDeImpressoes } from '@/components/erp/telas/etiquetas/historico';

export const dynamic = 'force-dynamic';

export default async function ErpHistoricoDeImpressoesDaLojaPage({ params, searchParams }: { params: { lojaId: string }; searchParams: { periodo?: string; de?: string; ate?: string; origem?: string; pagina?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'etiquetas.imprimir');
  const h = await historicoDeImpressoes(ctx.cliente, ctx.alcance, params.lojaId, searchParams);
  if (!h) notFound();
  return <TelaHistoricoDeImpressoes h={h} base="/erp/etiquetas" />;
}
