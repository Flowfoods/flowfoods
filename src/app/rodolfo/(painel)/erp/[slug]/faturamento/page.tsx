/**
 * ERP, Faturamento do mês de um Parceiro Flow, pelo nível 1. A MESMA tela da
 * pessoa do parceiro; tudo passa pelo cliente de `exigirParceiro` (portão +
 * RLS). O nível 1 alcança todas as lojas; a visão do topo só filtra. A volta da
 * Home (decisão 518) só vale a Home exata deste parceiro, `/rodolfo/erp/<slug>`.
 */

import { exigirParceiro, exigirPermissao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { carregarDoMes } from '@/components/erp/telas/faturamento/carregar';
import { TelaDoMes } from '@/components/erp/telas/faturamento/mes';
import { voltaParaAHome } from '@/lib/erp/volta';

export const dynamic = 'force-dynamic';

export default async function ParceiroFaturamentoPage(
  props: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'faturamento.ver');
  const { visao } = await visaoDaRequisicao(ctx);
  const { m, lojaAberta } = await carregarDoMes(ctx.cliente, ctx.alcance, visao, searchParams);
  return (
    <TelaDoMes
      m={m}
      base={`/rodolfo/erp/${ctx.parceiro.slug}/faturamento`}
      parceiro={ctx.parceiro.nome}
      lojaAberta={lojaAberta}
      podeLancar
      bloqueio={ctx.bloqueio}
      veRede
      volta={voltaParaAHome(searchParams.volta, `/rodolfo/erp/${ctx.parceiro.slug}`)}
    />
  );
}
