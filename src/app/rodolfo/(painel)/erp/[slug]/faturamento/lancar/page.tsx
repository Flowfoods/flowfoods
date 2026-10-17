/** ERP, Lançar o dia de um Parceiro Flow, pelo nível 1 (2.1): escolher a loja e a data; com uma loja só, vai direto ao dia de hoje. */

import { redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { somarDias } from '@/lib/erp/contagem-campos';
import { lerDataDoLancamento } from '@/lib/erp/faturamento-campos';
import { lojasDoFaturamento } from '@/lib/erp/faturamento';
import { TelaEscolherODia } from '@/components/erp/telas/faturamento/escolher';

export const dynamic = 'force-dynamic';

export default async function ParceiroLancarODiaPage({ params, searchParams }: { params: { slug: string }; searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'faturamento.lancar');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/faturamento`;
  const { visao } = await visaoDaRequisicao(ctx);
  const lojas = (await lojasDoFaturamento(ctx.cliente, ctx.alcance)).filter((l) => l.ativa);
  const hoje = hojeNoRio();
  const loja = typeof searchParams.loja === 'string' ? searchParams.loja : undefined;
  const dataTxt = typeof searchParams.data === 'string' ? searchParams.data : undefined;
  let erro: string | undefined;
  if (loja && dataTxt !== undefined) {
    const d = lerDataDoLancamento(dataTxt, hoje);
    if (!lojas.some((l) => l.id === loja)) erro = 'Escolha uma das lojas da lista.';
    else if (!d.ok) erro = d.erro;
    else redirect(`${base}/${loja}/${d.data}`);
  }
  if (lojas.length === 1 && dataTxt === undefined) redirect(`${base}/${lojas[0].id}/${hoje}`);
  return (
    <TelaEscolherODia
      base={base}
      lojas={lojas.map((l) => ({ id: l.id, nome: l.nome }))}
      lojaSugerida={visao.tipo === 'loja' && lojas.some((l) => l.id === visao.lojaId) ? visao.lojaId : loja}
      hoje={hoje}
      ontem={somarDias(hoje, -1)}
      dataDigitada={dataTxt}
      erro={erro}
      contexto={ctx.parceiro.nome}
    />
  );
}
