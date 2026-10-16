/**
 * ERP — Insumos de um Parceiro Flow, pelo nível 1. Tudo o que esta tela lê
 * passa pelo cliente de `exigirParceiro` (portão de tenant + RLS); trocar de
 * parceiro é trocar de URL, e a URL só escolhe — o isolamento é o portão.
 */

import { exigirParceiro, exigirPermissao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { listarInsumos } from '@/lib/erp/insumos';
import { lerFiltros } from '@/lib/erp/insumo-campos';
import { FiltrosDaLista, TelaListaInsumos } from '@/components/erp/telas/insumos/lista';
import { CabecalhoDaLista } from '@/components/erp/telas/insumos/paginas';
import { subtituloDosInsumos } from '@/components/erp/telas/insumos/subtitulo';

export const dynamic = 'force-dynamic';

export default async function ParceiroInsumosPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'insumos.ver');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/insumos`;
  const filtros = lerFiltros(searchParams);
  const [pagina, { visao }] = await Promise.all([listarInsumos(ctx.cliente, filtros), visaoDaRequisicao(ctx)]);
  return (
    <div className="space-y-6">
      <CabecalhoDaLista
        subtitulo={`${ctx.parceiro.nome} · ${subtituloDosInsumos(visao, pagina.total, filtros)}`}
        novoHref={`${base}/novo`}
        bloqueio={ctx.bloqueio}
      >
        <FiltrosDaLista base={base} filtros={filtros} />
      </CabecalhoDaLista>
      <TelaListaInsumos base={base} filtros={filtros} {...pagina} novoHref={ctx.bloqueio ? undefined : `${base}/novo`} />
    </div>
  );
}
