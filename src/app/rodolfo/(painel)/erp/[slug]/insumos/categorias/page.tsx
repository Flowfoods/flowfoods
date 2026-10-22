/** ERP, Categorias de insumo de um parceiro, pelo nível 1 (lidas pelo portão do parceiro do slug). */

import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { garantirCategoriasPadrao, listarCategorias } from '@/lib/erp/categorias';
import { resumoDoQueFalta } from '@/lib/erp/classificar';
import { TelaCategorias } from '@/components/erp/telas/insumos/categorias';
import {
  acaoCriarCategoria,
  acaoExcluirCategoria,
  acaoMoverCategoria,
  acaoRenomearCategoria,
  acaoSituacaoCategoria,
} from '../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroCategoriasPage({ params, searchParams }: { params: { slug: string }; searchParams: { feito?: string; cat?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'insumos.ver');
  await garantirCategoriasPadrao(ctx.cliente);
  const slug = ctx.parceiro.slug;
  const [categorias, faltam] = await Promise.all([listarCategorias(ctx.cliente), resumoDoQueFalta(ctx.cliente, ctx.alcance)]);
  return (
    <TelaCategorias
      categorias={categorias}
      contexto={ctx.parceiro.nome}
      base={`/rodolfo/erp/${slug}/insumos`}
      podeGerir
      podeClassificar
      bloqueio={ctx.bloqueio}
      feito={searchParams.feito}
      nomeDaFeita={categorias.find((c) => c.id === searchParams.cat)?.nome ?? null}
      faltam={faltam}
      acaoCriar={acaoCriarCategoria.bind(null, slug)}
      acoesDe={(id) => ({
        renomear: acaoRenomearCategoria.bind(null, slug, id),
        situacao: acaoSituacaoCategoria.bind(null, slug, id),
        excluir: acaoExcluirCategoria.bind(null, slug, id),
        subir: acaoMoverCategoria.bind(null, slug, id, 'subir'),
        descer: acaoMoverCategoria.bind(null, slug, id, 'descer'),
      })}
    />
  );
}
