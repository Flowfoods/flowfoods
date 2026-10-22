/** ERP, Metas por categoria de um Parceiro Flow, pelo nível 1. */

import { exigirParceiro, exigirPermissao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { PaginaDasMetasPorCategoria } from '@/components/erp/telas/dre/paginas';
import { acaoSalvarMetasPorCategoria } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroMetasPorCategoriaPage({ params, searchParams }: { params: { slug: string }; searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'metas.editar');
  const { visao } = await visaoDaRequisicao(ctx);
  const { slug } = params;
  return (
    <PaginaDasMetasPorCategoria
      c={{ cliente: ctx.cliente, alcance: ctx.alcance, bloqueio: ctx.bloqueio, contexto: `${ctx.parceiro.nome} · ${rotuloDaVisao(visao)}`, raiz: `/rodolfo/erp/${ctx.parceiro.slug}` }}
      query={searchParams}
      acoes={{ salvar: (lojaId) => acaoSalvarMetasPorCategoria.bind(null, slug, lojaId) }}
    />
  );
}
