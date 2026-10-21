/**
 * ERP do parceiro — Orçamento de compra (2.5). Ver exige "ver compras e notas". A conta e o que cada pessoa recebe
 * (a receita só com `dre.ver` na loja) são decididos no servidor (`orcamento.ts`); a visão do topo só ESCOLHE a loja
 * dentro do alcance (nunca concede).
 */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode, visaoDaRequisicao } from '@/lib/erp/contexto';
import { orcamentoDeCompra } from '@/lib/erp/orcamento';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { TelaOrcamento } from '@/components/erp/telas/compras/orcamento';

export const dynamic = 'force-dynamic';

export default async function ErpOrcamentoPage() {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'compras.ver');
  const { visao } = await visaoDaRequisicao(ctx);
  const dados = await orcamentoDeCompra(ctx.cliente, ctx.alcance, { lojaId: visao.tipo === 'loja' ? visao.lojaId : undefined });
  if (!dados) notFound();
  return (
    <TelaOrcamento
      dados={dados}
      contexto={rotuloDaVisao(visao)}
      lancarHref={pode(ctx.alcance, 'compras.lancar') ? '/erp/compras/nova' : undefined}
      bloqueio={ctx.bloqueio}
      planoHref={pode(ctx.alcance, 'metas.editar') ? '/erp/dre/plano' : undefined}
      faturamentoHref={pode(ctx.alcance, 'faturamento.lancar') ? '/erp/faturamento/lancar' : undefined}
    />
  );
}
