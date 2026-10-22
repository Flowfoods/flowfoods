/**
 * ERP do parceiro — Metas por categoria (I.2a): a meta de cada categoria, na rede e em cada loja (a loja segue a rede ou personaliza).
 * Exige "definir metas, plano de contas e período" (que só vale com a rede inteira): o gerente de uma loja não chega aqui.
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, visaoDaRequisicao } from '@/lib/erp/contexto';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { PaginaDasMetasPorCategoria } from '@/components/erp/telas/dre/paginas';
import { acaoSalvarMetasPorCategoria } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ErpMetasPorCategoriaPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'metas.editar');
  const { visao } = await visaoDaRequisicao(ctx);
  return (
    <PaginaDasMetasPorCategoria
      c={{ cliente: ctx.cliente, alcance: ctx.alcance, bloqueio: ctx.bloqueio, contexto: rotuloDaVisao(visao), raiz: '/erp' }}
      query={searchParams}
      acoes={{ salvar: (lojaId) => acaoSalvarMetasPorCategoria.bind(null, lojaId) }}
    />
  );
}
