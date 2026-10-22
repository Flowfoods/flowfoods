/** ERP, CMV por categoria de um Parceiro Flow, pelo nível 1: a mesma tela da pessoa do parceiro, com todas as lojas ao alcance. */

import { exigirParceiro, exigirPermissao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { PaginaDoCmvPorCategoria } from '@/components/erp/telas/dre/paginas';

export const dynamic = 'force-dynamic';

export default async function ParceiroCmvPorCategoriaPage({ params, searchParams }: { params: { slug: string }; searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'dre.ver');
  const { visao, lojas } = await visaoDaRequisicao(ctx);
  return (
    <PaginaDoCmvPorCategoria
      c={{ cliente: ctx.cliente, alcance: ctx.alcance, bloqueio: ctx.bloqueio, contexto: `${ctx.parceiro.nome} · ${rotuloDaVisao(visao)}`, raiz: `/rodolfo/erp/${ctx.parceiro.slug}` }}
      visao={visao}
      lojasDoAlcance={lojas}
      query={searchParams}
      pode={{ definirMetas: true, classificar: true, veRede: true }}
    />
  );
}
