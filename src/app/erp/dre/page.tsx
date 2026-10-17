/**
 * ERP do parceiro — DRE (2.2a): o resultado do período, ao vivo até ontem. A
 * MESMA tela do nível 1, com o cliente do portão resolvido pela SESSÃO. Ver exige
 * "ver DRE e CMV"; a rede só abre para quem tem a rede inteira, e a loja escolhida
 * no topo (ou `?loja=`) só FILTRA dentro do acesso. Quem tem só "lançar despesas"
 * lança, mas não abre o DRE.
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode, visaoDaRequisicao } from '@/lib/erp/contexto';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { recusaDoFechamento } from '@/lib/erp/dre-fechamento';
import { carregarDre } from '@/components/erp/telas/dre/carregar';
import { TelaDoDre } from '@/components/erp/telas/dre/dre';
import { Painel, Vazio } from '@/components/erp/ui/superficies';

export const dynamic = 'force-dynamic';

export default async function ErpDrePage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'dre.ver');
  const { visao, lojas } = await visaoDaRequisicao(ctx);
  const d = await carregarDre(ctx.cliente, ctx.alcance, visao, lojas, searchParams);
  if (!d) {
    return (
      <Painel>
        <Vazio titulo="Nenhuma loja no seu acesso.">Peça a quem cuida da equipe para incluir as lojas em que você trabalha.</Vazio>
      </Painel>
    );
  }
  return (
    <TelaDoDre
      d={d}
      base="/erp/dre"
      raiz="/erp"
      contexto={rotuloDaVisao(visao)}
      pode={{ lancarDespesa: pode(ctx.alcance, 'despesas.lancar'), definirMetas: pode(ctx.alcance, 'metas.editar'), fecharPeriodo: recusaDoFechamento(ctx.alcance) === null, verFaturamento: pode(ctx.alcance, 'faturamento.ver'), verPrecos: pode(ctx.alcance, 'precos.ver'), verCompras: pode(ctx.alcance, 'compras.ver'), verEstoque: pode(ctx.alcance, 'estoque.ver'), veRede: ctx.alcance.lojas === 'todas' }}
      bloqueio={ctx.bloqueio}
    />
  );
}
