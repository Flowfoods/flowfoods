/**
 * ERP, Insumos de um Parceiro Flow, pelo nível 1. Tudo o que esta tela lê
 * passa pelo cliente de `exigirParceiro` (portão de tenant + RLS); trocar de
 * parceiro é trocar de URL, e a URL só escolhe — o isolamento é o portão.
 */

import { exigirParceiro, exigirPermissao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { contarConservacaoAConfirmar, listarInsumos, marcasEmUso } from '@/lib/erp/insumos';
import { categoriasParaEscolher } from '@/lib/erp/categorias';
import { resumoDoQueFalta } from '@/lib/erp/classificar';
import { AvisosDaLista } from '@/components/erp/telas/insumos/aviso-classificar';
import { lerFiltros, temFiltro } from '@/lib/erp/insumo-campos';
import { FiltrosAtivos, FiltrosDaLista, TelaListaInsumos } from '@/components/erp/telas/insumos/lista';
import { AvisoDaListaDeInsumos } from '@/components/erp/telas/insumos/aviso-da-lista';
import { queryDosFiltros } from '@/lib/erp/insumo-campos';
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
  const [pagina, { visao }, categorias, faltam, aConfirmar, marcas] = await Promise.all([
    listarInsumos(ctx.cliente, filtros),
    visaoDaRequisicao(ctx),
    categoriasParaEscolher(ctx.cliente, null, true),
    resumoDoQueFalta(ctx.cliente, ctx.alcance),
    contarConservacaoAConfirmar(ctx.cliente),
    marcasEmUso(ctx.cliente),
  ]);
  return (
    <div className="space-y-6">
      <CabecalhoDaLista
        // L.1: o subtítulo é o do CADASTRO (todos, ativos e desativados); o que os filtros deixaram aparece acima da tabela, com outro rótulo.
        subtitulo={`${ctx.parceiro.nome} · ${subtituloDaLista(visao, pagina.totalDoCadastro.todos, INSUMOS, false)} no cadastro`}
        novoHref={`${base}/novo${queryDosFiltros(filtros) ? `?de=${encodeURIComponent(queryDosFiltros(filtros))}` : ''}`}
        bloqueio={ctx.bloqueio}
      >
        <div className="space-y-3">
          <FiltrosDaLista base={base} filtros={filtros} categorias={categorias} marcas={marcas} />
          <FiltrosAtivos base={base} filtros={filtros} categorias={categorias} />
        </div>
      </CabecalhoDaLista>
      <AvisoDaListaDeInsumos cliente={ctx.cliente} base={base} filtros={filtros} feito={searchParams.feito} referencia={searchParams.ref} podeEditar />
      <AvisosDaLista resumo={faltam} hrefClassificar={`${base}/classificar`} aConfirmar={aConfirmar} base={base} jaFiltrado={filtros.conservacao === 'confirmar'} />
      <TelaListaInsumos base={base} filtros={filtros} {...pagina} novoHref={ctx.bloqueio ? undefined : `${base}/novo`} comAcoes={!ctx.bloqueio} />
    </div>
  );
}
