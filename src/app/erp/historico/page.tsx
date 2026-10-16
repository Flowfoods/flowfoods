/**
 * ERP do parceiro — Histórico (antes → depois). Exige "ver o histórico de
 * alterações", que só vale com a rede inteira (o histórico cita toda a rede).
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { listarHistorico } from '@/lib/erp/historico';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { entidadeDoFiltro, entidadesDoFiltro, LIMITE_DO_HISTORICO, TelaHistorico } from '@/components/erp/telas/historico/tela-historico';

export const dynamic = 'force-dynamic';

export default async function ErpHistoricoPage({ searchParams }: { searchParams: { entidade?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'historico.ver');
  const entidade = entidadeDoFiltro(searchParams.entidade);
  const linhas = await listarHistorico(ctx.cliente, { entidades: entidadesDoFiltro(entidade), limite: LIMITE_DO_HISTORICO });
  return (
    <div className="space-y-6">
      <PageHeader
        icone="historico"
        cor={COR.rede}
        titulo="Histórico"
        subtitulo="Rede Completa · toda alteração, com antes, depois, quem e quando"
      />
      <TelaHistorico linhas={linhas} entidade={entidade} hrefBase="/erp/historico" />
    </div>
  );
}
