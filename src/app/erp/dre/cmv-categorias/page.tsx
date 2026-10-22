/**
 * ERP do parceiro — CMV por categoria (I.2a): o CMV do DRE aberto em categorias, pelas compras. A MESMA tela do nível 1, com o cliente
 * do portão resolvido pela SESSÃO. Ver exige "ver DRE e CMV"; a rede só abre para quem tem a rede inteira, e a loja escolhida no topo
 * (ou `?loja=`) só FILTRA dentro do acesso.
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode, visaoDaRequisicao } from '@/lib/erp/contexto';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { PaginaDoCmvPorCategoria } from '@/components/erp/telas/dre/paginas';

export const dynamic = 'force-dynamic';

export default async function ErpCmvPorCategoriaPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'dre.ver');
  const { visao, lojas } = await visaoDaRequisicao(ctx);
  return (
    <PaginaDoCmvPorCategoria
      c={{ cliente: ctx.cliente, alcance: ctx.alcance, bloqueio: ctx.bloqueio, contexto: rotuloDaVisao(visao), raiz: '/erp' }}
      visao={visao}
      lojasDoAlcance={lojas}
      query={searchParams}
      pode={{ definirMetas: pode(ctx.alcance, 'metas.editar'), classificar: pode(ctx.alcance, 'insumos.ver') && pode(ctx.alcance, 'insumos.editar'), veRede: ctx.alcance.lojas === 'todas' }}
    />
  );
}
