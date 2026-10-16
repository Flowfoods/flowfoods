/**
 * ERP do parceiro — Histórico (antes → depois). Exige "ver o histórico de
 * alterações", que só vale com a rede inteira (o histórico cita toda a rede).
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { listarHistorico } from '@/lib/erp/historico';
import { entidadeDoFiltro, LIMITE_DO_HISTORICO, TelaHistorico } from '@/app/rodolfo/erp/tela-historico';

export const dynamic = 'force-dynamic';

export default async function ErpHistoricoPage({ searchParams }: { searchParams: { entidade?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'historico.ver');
  const entidade = entidadeDoFiltro(searchParams.entidade);
  const linhas = await listarHistorico(ctx.cliente, { entidade, limite: LIMITE_DO_HISTORICO });
  return <TelaHistorico linhas={linhas} entidade={entidade} hrefBase="/erp/historico" />;
}
