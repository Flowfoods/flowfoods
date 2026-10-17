/**
 * ERP, Faturamento do mês de um Parceiro Flow, pelo nível 1. A MESMA tela da
 * pessoa do parceiro; tudo passa pelo cliente de `exigirParceiro` (portão +
 * RLS). O nível 1 alcança todas as lojas; a visão do topo só filtra.
 */

import { exigirParceiro, exigirPermissao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { carregarDoMes } from '@/components/erp/telas/faturamento/carregar';
import { TelaDoMes } from '@/components/erp/telas/faturamento/mes';

export const dynamic = 'force-dynamic';

export default async function ParceiroFaturamentoPage({ params, searchParams }: { params: { slug: string }; searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'faturamento.ver');
  const { visao } = await visaoDaRequisicao(ctx);
  const { m, lojaAberta } = await carregarDoMes(ctx.cliente, ctx.alcance, visao, searchParams);
  return (
    <TelaDoMes
      m={m}
      base={`/rodolfo/erp/${ctx.parceiro.slug}/faturamento`}
      contexto={`${ctx.parceiro.nome} · ${rotuloDaVisao(visao)}`}
      lojaAberta={lojaAberta}
      podeLancar
      bloqueio={ctx.bloqueio}
      veRede
    />
  );
}
