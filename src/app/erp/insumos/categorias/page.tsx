/**
 * ERP do parceiro — Categorias de insumo (I.1a). Ver exige "ver insumos"; criar, renomear, reordenar, desativar e excluir exigem
 * "gerir categorias de insumos" (a rede inteira). A action confere de novo, venha de onde vier.
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
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

const BASE = '/erp/insumos';

export default async function ErpCategoriasPage({ searchParams }: { searchParams: { feito?: string; cat?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'insumos.ver');
  // A primeira vez numa casa nova: as dez padrão nascem aqui (idempotente; parceiro somente leitura não semeia).
  await garantirCategoriasPadrao(ctx.cliente);
  const [categorias, faltam] = await Promise.all([listarCategorias(ctx.cliente), resumoDoQueFalta(ctx.cliente, ctx.alcance)]);
  return (
    <TelaCategorias
      categorias={categorias}
      contexto={ctx.parceiro.nome}
      base={BASE}
      podeGerir={pode(ctx.alcance, 'insumos.categorias')}
      podeClassificar={pode(ctx.alcance, 'insumos.editar')}
      bloqueio={ctx.bloqueio}
      feito={searchParams.feito}
      nomeDaFeita={categorias.find((c) => c.id === searchParams.cat)?.nome ?? null}
      faltam={faltam}
      acaoCriar={acaoCriarCategoria}
      acoesDe={(id) => ({
        renomear: acaoRenomearCategoria.bind(null, id),
        situacao: acaoSituacaoCategoria.bind(null, id),
        excluir: acaoExcluirCategoria.bind(null, id),
        subir: acaoMoverCategoria.bind(null, id, 'subir'),
        descer: acaoMoverCategoria.bind(null, id, 'descer'),
      })}
    />
  );
}
