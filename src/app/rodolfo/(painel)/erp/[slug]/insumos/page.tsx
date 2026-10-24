/**
 * ERP, Insumos de um Parceiro Flow, pelo nível 1. Tudo o que esta tela lê
 * passa pelo cliente de `exigirParceiro` (portão de tenant + RLS); trocar de
 * parceiro é trocar de URL, e a URL só escolhe — o isolamento é o portão.
 */

import { exigirParceiro, exigirPermissao, pode, visaoDaRequisicao } from '@/lib/erp/contexto';
import { contarConservacaoAConfirmar, listarInsumos, marcasEmUso } from '@/lib/erp/insumos';
import { categoriasParaEscolher, listarCategorias } from '@/lib/erp/categorias';
import { PainelDeCategorias } from '@/components/erp/telas/insumos/painel-categorias';
import { CategoriasNoPainel } from '@/components/erp/telas/insumos/categorias-no-painel';
import { BarraDeCategoria } from '@/components/erp/telas/insumos/barra-categoria';
import {
  acaoAlterarCategoriaNaLista,
  acaoCriarCategoria,
  acaoExcluirCategoria,
  acaoMoverCategoria,
  acaoRenomearCategoria,
  acaoSituacaoCategoria,
} from './actions';
import { resumoDoQueFalta } from '@/lib/erp/classificar';
import { AvisosDaLista } from '@/components/erp/telas/insumos/aviso-classificar';
import { lerFiltros, temFiltro } from '@/lib/erp/insumo-campos';
import { FiltrosAtivos, FiltrosDaLista, TelaListaInsumos } from '@/components/erp/telas/insumos/lista';
import { AvisoDaListaDeInsumos } from '@/components/erp/telas/insumos/aviso-da-lista';
import { comDe, queryDosFiltros } from '@/lib/erp/insumo-campos';
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
  const [pagina, { visao }, categorias, faltam, aConfirmar, marcas, linhasDeCategoria] = await Promise.all([
    listarInsumos(ctx.cliente, filtros),
    visaoDaRequisicao(ctx),
    categoriasParaEscolher(ctx.cliente, null, true),
    resumoDoQueFalta(ctx.cliente, ctx.alcance),
    contarConservacaoAConfirmar(ctx.cliente),
    marcasEmUso(ctx.cliente),
    listarCategorias(ctx.cliente),
  ]);
  // F4: muda a cada volta (filtro, página, aviso): as linhas e a barra nascem de novo, sem caixa marcada sobrando.
  const chaveDaLista = new URLSearchParams(Object.entries(searchParams).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v ? [[k, v]] : []))).toString();
  const um = (k: string) => (Array.isArray(searchParams[k]) ? (searchParams[k] as string[])[0] : (searchParams[k] as string | undefined));
  const slug = ctx.parceiro.slug;
  return (
    <div className="space-y-6">
      <CabecalhoDaLista
        // L.1: o subtítulo é o do CADASTRO (todos, ativos e desativados); o que os filtros deixaram aparece acima da tabela, com outro rótulo.
        subtitulo={`${ctx.parceiro.nome} · ${subtituloDaLista(visao, pagina.totalDoCadastro.todos, INSUMOS, false)} no cadastro`}
        novoHref={comDe(`${base}/novo`, queryDosFiltros(filtros))}
        bloqueio={ctx.bloqueio}
      >
        <div className="space-y-3">
          <FiltrosDaLista base={base} filtros={filtros} categorias={categorias} marcas={marcas} />
          <div className="flex flex-wrap items-start justify-between gap-2">
            <FiltrosAtivos base={base} filtros={filtros} categorias={categorias} />
            <PainelDeCategorias abertoDeInicio={um('painel') === 'categorias'}>
              <CategoriasNoPainel
                categorias={linhasDeCategoria}
                base={base}
                filtros={filtros}
                podeGerir={pode(ctx.alcance, 'insumos.categorias')}
                bloqueio={ctx.bloqueio}
                feito={um('painel') === 'categorias' ? um('feito') : undefined}
                cat={um('cat')}
                acaoCriar={acaoCriarCategoria.bind(null, slug)}
                acoesDe={(id) => ({
                  renomear: acaoRenomearCategoria.bind(null, slug, id),
                  situacao: acaoSituacaoCategoria.bind(null, slug, id),
                  excluir: acaoExcluirCategoria.bind(null, slug, id),
                  subir: acaoMoverCategoria.bind(null, slug, id, 'subir'),
                  descer: acaoMoverCategoria.bind(null, slug, id, 'descer'),
                })}
                hrefClassificar={`${base}/classificar`}
              />
            </PainelDeCategorias>
          </div>
        </div>
      </CabecalhoDaLista>
      <AvisoDaListaDeInsumos cliente={ctx.cliente} base={base} filtros={filtros} feito={um('painel') === 'categorias' ? undefined : searchParams.feito} referencia={searchParams.ref} podeEditar quantos={searchParams.n} categoria={searchParams.cat} />
      <AvisosDaLista resumo={faltam} hrefClassificar={`${base}/classificar`} aConfirmar={aConfirmar} base={base} jaFiltrado={filtros.conservacao === 'confirmar'} />
      <div key={chaveDaLista} className="space-y-6">
      <TelaListaInsumos
        key={new URLSearchParams(Object.entries(searchParams).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v ? [[k, v]] : []))).toString()} base={base} filtros={filtros} {...pagina} novoHref={ctx.bloqueio ? undefined : `${base}/novo`} comAcoes={!ctx.bloqueio} selecionar={!ctx.bloqueio} />
      {!ctx.bloqueio && <BarraDeCategoria categorias={categorias} acao={acaoAlterarCategoriaNaLista.bind(null, slug)} de={queryDosFiltros(filtros)} />}
      </div>
    </div>
  );
}
