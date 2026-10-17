/**
 * ERP do parceiro — Histórico (antes → depois). Exige "ver o histórico de
 * alterações", que só vale com a rede inteira (o histórico cita toda a rede).
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { listarHistorico } from '@/lib/erp/historico';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { entidadeDoFiltro, entidadesDoFiltro, LIMITE_DO_HISTORICO, TelaHistorico } from '@/components/erp/telas/historico/tela-historico';

export const dynamic = 'force-dynamic';

export default async function ErpHistoricoPage({ searchParams }: { searchParams: { entidade?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'historico.ver');
  const verFaturamento = pode(ctx.alcance, 'faturamento.ver');
  const verDre = pode(ctx.alcance, 'dre.ver');
  const entidade =
    (verFaturamento || searchParams.entidade !== 'FaturamentoLancamento') && (verDre || searchParams.entidade !== 'Despesa') ? entidadeDoFiltro(searchParams.entidade) : undefined;
  const linhas = await listarHistorico(ctx.cliente, {
    entidades: entidadesDoFiltro(entidade),
    limite: LIMITE_DO_HISTORICO,
    // 1.5: nota e fornecedor (valores, lojas) só para quem vê compras.
    semEntidades: [...(pode(ctx.alcance, 'compras.ver') ? [] : ['NotaEntrada', 'Fornecedor']), ...(pode(ctx.alcance, 'producao.ver') ? [] : ['OrdemProducao'])],
    // 1.10: taxa, margem-alvo, preço, margem e custo do canal só para quem vê preços.
    verPrecos: pode(ctx.alcance, 'precos.ver'),
    // 2.1: valores, pedidos e clientes do faturamento só para quem vê faturamento.
    verFaturamento,
    // 2.2a: despesas, plano de contas e período só para quem vê o DRE.
    verDre,
    // 3.1: o custo do lote só para quem vê custos.
    verCustos: pode(ctx.alcance, 'insumos.ver'),
  });
  return (
    <div className="space-y-6">
      <PageHeader
        icone="historico"
        cor={COR.rede}
        titulo="Histórico"
        subtitulo="Rede Completa · toda alteração, com antes, depois, quem e quando"
      />
      <TelaHistorico linhas={linhas} entidade={entidade} hrefBase="/erp/historico" verFaturamento={verFaturamento} verDre={verDre} />
    </div>
  );
}
