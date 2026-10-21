/** ERP, Orçamento de compra (2.5) de um Parceiro Flow, pelo nível 1: a MESMA tela, pelo portão deste parceiro. */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { orcamentoDeCompra } from '@/lib/erp/orcamento';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { TelaOrcamento } from '@/components/erp/telas/compras/orcamento';

export const dynamic = 'force-dynamic';

export default async function ParceiroOrcamentoPage({ params }: { params: { slug: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'compras.ver');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}`;
  const { visao } = await visaoDaRequisicao(ctx);
  const dados = await orcamentoDeCompra(ctx.cliente, ctx.alcance, { lojaId: visao.tipo === 'loja' ? visao.lojaId : undefined });
  if (!dados) notFound();
  return (
    <TelaOrcamento
      dados={dados}
      contexto={`${ctx.parceiro.nome} · ${rotuloDaVisao(visao)}`}
      lancarHref={`${base}/compras/nova`}
      bloqueio={ctx.bloqueio}
      planoHref={`${base}/dre/plano`}
      faturamentoHref={`${base}/faturamento/lancar`}
    />
  );
}
