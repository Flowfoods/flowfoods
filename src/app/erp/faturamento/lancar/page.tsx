/**
 * ERP do parceiro — Lançar o dia (2.1): escolher a loja e a data. Com uma loja
 * só no acesso, vai direto ao dia de hoje. As lojas oferecidas são só as ativas
 * em que a pessoa "lança faturamento"; a tela do dia e a action conferem de novo.
 */

import { redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode, visaoDaRequisicao } from '@/lib/erp/contexto';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { somarDias } from '@/lib/erp/contagem-campos';
import { lerDataDoLancamento } from '@/lib/erp/faturamento-campos';
import { lojasDoFaturamento } from '@/lib/erp/faturamento';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { TelaEscolherODia } from '@/components/erp/telas/faturamento/escolher';

export const dynamic = 'force-dynamic';

const BASE = '/erp/faturamento';

export default async function ErpLancarODiaPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiroDaSessao();
  // Lançar sem ver não existe: a tela do dia, o mês e o histórico são de quem vê.
  exigirPermissaoNaPagina(ctx, 'faturamento.ver');
  exigirPermissaoNaPagina(ctx, 'faturamento.lancar');
  const { visao } = await visaoDaRequisicao(ctx);
  const lojas = (await lojasDoFaturamento(ctx.cliente, ctx.alcance)).filter((l) => l.ativa && pode(ctx.alcance, 'faturamento.lancar', { lojaId: l.id }) && pode(ctx.alcance, 'faturamento.ver', { lojaId: l.id }));
  const hoje = hojeNoRio();
  const loja = typeof searchParams.loja === 'string' ? searchParams.loja : undefined;
  const dataTxt = typeof searchParams.data === 'string' ? searchParams.data : undefined;
  let erro: string | undefined;
  if (loja && dataTxt !== undefined) {
    const d = lerDataDoLancamento(dataTxt, hoje);
    if (!lojas.some((l) => l.id === loja)) erro = 'Escolha uma das lojas da lista.';
    else if (!d.ok) erro = d.erro;
    else redirect(`${BASE}/${loja}/${d.data}`);
  }
  if (lojas.length === 1 && dataTxt === undefined) redirect(`${BASE}/${lojas[0].id}/${hoje}`);
  return (
    <TelaEscolherODia
      base={BASE}
      lojas={lojas.map((l) => ({ id: l.id, nome: l.nome }))}
      lojaSugerida={visao.tipo === 'loja' && lojas.some((l) => l.id === visao.lojaId) ? visao.lojaId : loja}
      hoje={hoje}
      ontem={somarDias(hoje, -1)}
      dataDigitada={dataTxt}
      erro={erro}
      contexto={rotuloDaVisao(visao)}
    />
  );
}
