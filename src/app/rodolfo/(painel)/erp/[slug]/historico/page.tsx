/**
 * ERP — histórico do parceiro pelo nível 1: toda alteração com antes/depois
 * (princípio "alterações visíveis"). Mesma tela de /erp/historico.
 */

import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { listarHistorico } from '@/lib/erp/historico';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { entidadeDoFiltro, LIMITE_DO_HISTORICO, TelaHistorico } from '@/components/erp/telas/historico/tela-historico';

export const dynamic = 'force-dynamic';

export default async function HistoricoPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { entidade?: string };
}) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'historico.ver');
  const entidade = entidadeDoFiltro(searchParams.entidade);
  const linhas = await listarHistorico(ctx.cliente, { entidade, limite: LIMITE_DO_HISTORICO });
  return (
    <div className="space-y-6">
      <PageHeader
        icone="historico"
        cor={COR.rede}
        titulo="Histórico"
        subtitulo={`${ctx.parceiro.nome} · toda alteração, com antes, depois, quem e quando`}
      />
      <TelaHistorico linhas={linhas} entidade={entidade} hrefBase={`/rodolfo/erp/${ctx.parceiro.slug}/historico`} />
    </div>
  );
}
