/**
 * ERP do parceiro — o histórico da produção de uma loja (3.3): "ver a produção" NA loja (fora do acesso ou de outro parceiro,
 * 404). Período e filtros na URL. O custo do lote só sai do servidor para quem vê custos.
 */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { historicoDaProducao } from '@/lib/erp/producao-equipe';
import { TelaHistoricoDaProducao } from '@/components/erp/telas/producao/historico-producao';

export const dynamic = 'force-dynamic';

export default async function ErpHistoricoDaProducaoDaLojaPage({ params, searchParams }: { params: { lojaId: string }; searchParams: { periodo?: string; de?: string; ate?: string; pessoa?: string; ficha?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'producao.ver');
  const h = await historicoDaProducao(ctx.cliente, ctx.alcance, params.lojaId, searchParams);
  if (!h) notFound();
  return <TelaHistoricoDaProducao h={h} base="/erp/producao" />;
}
