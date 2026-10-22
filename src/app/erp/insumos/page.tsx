/**
 * ERP do parceiro — Insumos (lista). A mesma tela do nível 1, com o cliente do
 * portão resolvido pela SESSÃO da pessoa. Ver exige "ver insumos"; "Novo
 * insumo" só aparece com "cadastrar e editar insumos" (e a action recusa do
 * mesmo jeito, venha de onde vier).
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode, visaoDaRequisicao } from '@/lib/erp/contexto';
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

const BASE = '/erp/insumos';

export default async function ErpInsumosPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'insumos.ver');
  const filtros = lerFiltros(searchParams);
  const [pagina, { visao }, categorias, faltam, aConfirmar, marcas] = await Promise.all([
    listarInsumos(ctx.cliente, filtros),
    visaoDaRequisicao(ctx),
    categoriasParaEscolher(ctx.cliente, null, true),
    resumoDoQueFalta(ctx.cliente, ctx.alcance),
    contarConservacaoAConfirmar(ctx.cliente),
    marcasEmUso(ctx.cliente),
  ]);
  const cadastra = pode(ctx.alcance, 'insumos.editar');
  return (
    <div className="space-y-6">
      <CabecalhoDaLista
        // L.1: o subtítulo é o do CADASTRO (todos, ativos e desativados); o que os filtros deixaram aparece acima da tabela, com outro rótulo.
        subtitulo={`${subtituloDaLista(visao, pagina.totalDoCadastro.todos, INSUMOS, false)} no cadastro`}
        novoHref={cadastra ? `${BASE}/novo${queryDosFiltros(filtros) ? `?de=${encodeURIComponent(queryDosFiltros(filtros))}` : ''}` : undefined}
        bloqueio={ctx.bloqueio}
      >
        <div className="space-y-3">
          <FiltrosDaLista base={BASE} filtros={filtros} categorias={categorias} marcas={marcas} />
          <FiltrosAtivos base={BASE} filtros={filtros} categorias={categorias} />
        </div>
      </CabecalhoDaLista>
      <AvisoDaListaDeInsumos cliente={ctx.cliente} base={BASE} filtros={filtros} feito={searchParams.feito} referencia={searchParams.ref} podeEditar={cadastra} />
      <AvisosDaLista resumo={faltam} hrefClassificar={cadastra ? `${BASE}/classificar` : undefined} aConfirmar={aConfirmar} base={BASE} jaFiltrado={filtros.conservacao === 'confirmar'} />
      <TelaListaInsumos
        base={BASE}
        filtros={filtros}
        {...pagina}
        novoHref={cadastra && !ctx.bloqueio ? `${BASE}/novo` : undefined}
        comAcoes={cadastra && !ctx.bloqueio}
      />
    </div>
  );
}
