/** ERP, Classificar insumos de um parceiro, pelo nível 1 (lido pelo portão do parceiro do slug). */

import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { categoriasParaEscolher, garantirCategoriasPadrao } from '@/lib/erp/categorias';
import { filaDeRevisao, lotesDeClassificacao, nomesParecidos, previaDaClassificacao, resumoDoQueFalta } from '@/lib/erp/classificar';
import { TelaClassificar } from '@/components/erp/telas/insumos/classificar';
import { acaoAplicarClassificacao, acaoClassificarEmLote, acaoReverterLote } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroClassificarPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { feito?: string; n?: string; outros?: string; mantidos?: string; iguais?: string; pagina?: string };
}) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'insumos.editar');
  await garantirCategoriasPadrao(ctx.cliente, ctx.sessao.autorNome);
  const slug = ctx.parceiro.slug;
  const base = `/rodolfo/erp/${slug}/insumos`;
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
      base={base}
      podeGerir
      bloqueio={ctx.bloqueio}
      query={searchParams}
      faltam={faltam}
      previa={previa}
      lotes={lotes}
      fila={fila}
      parecidos={parecidos}
      categorias={categorias}
      acaoAplicar={acaoAplicarClassificacao.bind(null, slug)}
      acaoReverter={acaoReverterLote.bind(null, slug)}
      acaoEmLote={acaoClassificarEmLote.bind(null, slug)}
      hrefDaPagina={(p) => `${base}/classificar?pagina=${p}`}
    />
  );
}
