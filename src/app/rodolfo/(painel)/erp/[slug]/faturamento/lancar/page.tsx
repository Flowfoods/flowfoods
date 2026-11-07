/** ERP, Lançar o dia de um Parceiro Flow, pelo nível 1 (2.1): escolher a loja e a data; com uma loja só, vai direto ao dia de hoje. */

import { redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { somarDias } from '@/lib/erp/contagem-campos';
import { lerDataDoLancamento } from '@/lib/erp/faturamento-campos';
import { lojasDoFaturamento } from '@/lib/erp/faturamento';
import { TelaEscolherODia } from '@/components/erp/telas/faturamento/escolher';
import { comVoltaParaAHome, voltaParaAHome } from '@/lib/erp/volta';

export const dynamic = 'force-dynamic';

export default async function ParceiroLancarODiaPage(
  props: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'faturamento.lancar');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/faturamento`;
  const { visao } = await visaoDaRequisicao(ctx);
  const lojas = (await lojasDoFaturamento(ctx.cliente, ctx.alcance)).filter((l) => l.ativa);
  const hoje = hojeNoRio();
  const loja = typeof searchParams.loja === 'string' ? searchParams.loja : undefined;
  const dataTxt = typeof searchParams.data === 'string' ? searchParams.data : undefined;
  // Decisão 518: a volta da Home (só a Home exata desta área) segue do botão "Lançar o dia" até o dia escolhido.
  const volta = voltaParaAHome(searchParams.volta, `/rodolfo/erp/${ctx.parceiro.slug}`);
  let erro: string | undefined;
  if (loja && dataTxt !== undefined) {
    const d = lerDataDoLancamento(dataTxt, hoje);
    if (!lojas.some((l) => l.id === loja)) erro = 'Escolha uma das lojas da lista.';
    else if (!d.ok) erro = d.erro;
    else redirect(comVoltaParaAHome(`${base}/${loja}/${d.data}`, volta));
  }
  if (lojas.length === 1 && dataTxt === undefined) redirect(comVoltaParaAHome(`${base}/${lojas[0].id}/${hoje}`, volta));
  return (
    <TelaEscolherODia
      base={base}
      lojas={lojas.map((l) => ({ id: l.id, nome: l.nome }))}
      lojaSugerida={visao.tipo === 'loja' && lojas.some((l) => l.id === visao.lojaId) ? visao.lojaId : loja}
      hoje={hoje}
      ontem={somarDias(hoje, -1)}
      dataDigitada={dataTxt}
      erro={erro}
      volta={volta}
      contexto={ctx.parceiro.nome}
    />
  );
}
