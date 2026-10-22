/**
 * ERP do parceiro — Classificar insumos (I.1a): a classificação assistida dos que ainda não têm categoria (prévia, aplicar,
 * desfazer o lote) e a fila de revisão com edição em lote. Ver e classificar em lote exigem "cadastrar e editar insumos";
 * aplicar e desfazer a classificação assistida exigem "gerir categorias de insumos" (a action confere de novo).
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { categoriasParaEscolher, garantirCategoriasPadrao } from '@/lib/erp/categorias';
import { filaDeRevisao, lotesDeClassificacao, nomesParecidos, previaDaClassificacao, resumoDoQueFalta } from '@/lib/erp/classificar';
import { TelaClassificar } from '@/components/erp/telas/insumos/classificar';
import { acaoAplicarClassificacao, acaoClassificarEmLote, acaoReverterLote } from '../actions';

export const dynamic = 'force-dynamic';

const BASE = '/erp/insumos';

export default async function ErpClassificarPage({ searchParams }: { searchParams: { feito?: string; n?: string; outros?: string; mantidos?: string; iguais?: string; sem?: string; pagina?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'insumos.ver');
  exigirPermissaoNaPagina(ctx, 'insumos.editar');
  await garantirCategoriasPadrao(ctx.cliente);
  const [faltam, previa, lotes, fila, parecidos, categorias] = await Promise.all([
    resumoDoQueFalta(ctx.cliente, ctx.alcance),
    previaDaClassificacao(ctx.cliente, ctx.alcance),
    lotesDeClassificacao(ctx.cliente),
    filaDeRevisao(ctx.cliente, ctx.alcance, Number(searchParams.pagina) || 1),
    nomesParecidos(ctx.cliente),
    categoriasParaEscolher(ctx.cliente),
  ]);
  return (
    <TelaClassificar
      contexto={ctx.parceiro.nome}
      base={BASE}
      podeGerir={pode(ctx.alcance, 'insumos.categorias')}
      bloqueio={ctx.bloqueio}
      query={searchParams}
      faltam={faltam}
      previa={previa}
      lotes={lotes}
      fila={fila}
      parecidos={parecidos}
      categorias={categorias}
      acaoAplicar={acaoAplicarClassificacao}
      acaoReverter={acaoReverterLote}
      acaoEmLote={acaoClassificarEmLote}
      hrefDaPagina={(p) => `${BASE}/classificar?pagina=${p}`}
    />
  );
}
