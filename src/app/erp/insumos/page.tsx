/**
 * ERP do parceiro — Insumos (lista). A mesma tela do nível 1, com o cliente do
 * portão resolvido pela SESSÃO da pessoa. Ver exige "ver insumos"; "Novo
 * insumo" só aparece com "cadastrar e editar insumos" (e a action recusa do
 * mesmo jeito, venha de onde vier).
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode, visaoDaRequisicao } from '@/lib/erp/contexto';
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

const BASE = '/erp/insumos';

export default async function ErpInsumosPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'insumos.ver');
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
  const cadastra = pode(ctx.alcance, 'insumos.editar');
  // F4: muda a cada volta (filtro, página, aviso): as linhas e a barra nascem de novo, sem caixa marcada sobrando.
  const chaveDaLista = new URLSearchParams(Object.entries(searchParams).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v ? [[k, v]] : []))).toString();
  const um = (k: string) => (Array.isArray(searchParams[k]) ? (searchParams[k] as string[])[0] : (searchParams[k] as string | undefined));
  return (
    <div className="space-y-6">
      <CabecalhoDaLista
        // L.1: o subtítulo é o do CADASTRO (todos, ativos e desativados); o que os filtros deixaram aparece acima da tabela, com outro rótulo.
        subtitulo={`${subtituloDaLista(visao, pagina.totalDoCadastro.todos, INSUMOS, false)} no cadastro`}
        novoHref={cadastra ? comDe(`${BASE}/novo`, queryDosFiltros(filtros)) : undefined}
        bloqueio={ctx.bloqueio}
      >
        <div className="space-y-3">
          <FiltrosDaLista base={BASE} filtros={filtros} categorias={categorias} marcas={marcas} />
          <div className="flex flex-wrap items-start justify-between gap-2">
            <FiltrosAtivos base={BASE} filtros={filtros} categorias={categorias} />
            {/* F4: categorias num painel ao lado da lista (sem trocar de página). */}
            <PainelDeCategorias abertoDeInicio={um('painel') === 'categorias'}>
              <CategoriasNoPainel
                categorias={linhasDeCategoria}
                base={BASE}
                filtros={filtros}
                podeGerir={pode(ctx.alcance, 'insumos.categorias')}
                bloqueio={ctx.bloqueio}
                feito={um('painel') === 'categorias' ? um('feito') : undefined}
                cat={um('cat')}
                acaoCriar={acaoCriarCategoria}
                acoesDe={(id) => ({
                  renomear: acaoRenomearCategoria.bind(null, id),
                  situacao: acaoSituacaoCategoria.bind(null, id),
                  excluir: acaoExcluirCategoria.bind(null, id),
                  subir: acaoMoverCategoria.bind(null, id, 'subir'),
                  descer: acaoMoverCategoria.bind(null, id, 'descer'),
                })}
                hrefClassificar={cadastra ? `${BASE}/classificar` : undefined}
              />
            </PainelDeCategorias>
          </div>
        </div>
      </CabecalhoDaLista>
      <AvisoDaListaDeInsumos cliente={ctx.cliente} base={BASE} filtros={filtros} feito={um('painel') === 'categorias' ? undefined : searchParams.feito} referencia={searchParams.ref} podeEditar={cadastra} quantos={searchParams.n} categoria={searchParams.cat} />
      <AvisosDaLista resumo={faltam} hrefClassificar={cadastra ? `${BASE}/classificar` : undefined} aConfirmar={aConfirmar} base={BASE} jaFiltrado={filtros.conservacao === 'confirmar'} />
      <div key={chaveDaLista} className="space-y-6">
      <TelaListaInsumos
        base={BASE}
        filtros={filtros}
        {...pagina}
        novoHref={cadastra && !ctx.bloqueio ? `${BASE}/novo` : undefined}
        comAcoes={cadastra && !ctx.bloqueio}
        selecionar={cadastra && !ctx.bloqueio}
      />
      {cadastra && !ctx.bloqueio && <BarraDeCategoria categorias={categorias} acao={acaoAlterarCategoriaNaLista} de={queryDosFiltros(filtros)} />}
      </div>
    </div>
  );
}
