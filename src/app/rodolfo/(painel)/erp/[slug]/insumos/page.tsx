/**
 * ERP, Insumos de um Parceiro Flow, pelo nível 1. Tudo o que esta tela lê
 * passa pelo cliente de `exigirParceiro` (portão de tenant + RLS); trocar de
 * parceiro é trocar de URL, e a URL só escolhe — o isolamento é o portão.
 */

import { exigirParceiro, exigirPermissao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { contarConservacaoAConfirmar, listarInsumos } from '@/lib/erp/insumos';
import { categoriasParaEscolher } from '@/lib/erp/categorias';
import { resumoDoQueFalta } from '@/lib/erp/classificar';
import { AvisosDaLista } from '@/components/erp/telas/insumos/aviso-classificar';
import { lerFiltros, temFiltro } from '@/lib/erp/insumo-campos';
import { FiltrosDaLista, TelaListaInsumos } from '@/components/erp/telas/insumos/lista';
import { CabecalhoDaLista } from '@/components/erp/telas/insumos/paginas';
import { INSUMOS, subtituloDaLista } from '@/components/erp/telas/cadastro/subtitulo';

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
  const [pagina, { visao }, categorias, faltam, aConfirmar] = await Promise.all([
    listarInsumos(ctx.cliente, filtros),
    visaoDaRequisicao(ctx),
    categoriasParaEscolher(ctx.cliente, null, true),
    resumoDoQueFalta(ctx.cliente, ctx.alcance),
    contarConservacaoAConfirmar(ctx.cliente),
  ]);
  return (
    <div className="space-y-6">
      <CabecalhoDaLista
        subtitulo={`${ctx.parceiro.nome} · ${subtituloDaLista(visao, pagina.total, INSUMOS, temFiltro(filtros))}`}
        novoHref={`${base}/novo`}
        bloqueio={ctx.bloqueio}
      >
        <FiltrosDaLista base={base} filtros={filtros} categorias={categorias} />
      </CabecalhoDaLista>
      <AvisosDaLista resumo={faltam} hrefClassificar={`${base}/classificar`} aConfirmar={aConfirmar} base={base} jaFiltrado={filtros.conservacao === 'confirmar'} />
      <TelaListaInsumos base={base} filtros={filtros} {...pagina} novoHref={ctx.bloqueio ? undefined : `${base}/novo`} />
    </div>
  );
}
