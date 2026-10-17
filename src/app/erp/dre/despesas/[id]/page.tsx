/**
 * ERP do parceiro — uma despesa (2.2a). O id da URL só ESCOLHE: a leitura passa pelo
 * portão da sessão e pelo alcance, então despesa de outra loja, da rede (para quem tem
 * só lojas), de outro parceiro ou inexistente é 404 — a mesma resposta.
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode, visaoDaRequisicao } from '@/lib/erp/contexto';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { PaginaDaDespesa } from '@/components/erp/telas/dre/paginas';
import { acaoDesfazerPagamento, acaoPagarDespesa, acaoPararDeRepetir, acaoRemoverDespesa } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpDespesaPage({ params, searchParams }: { params: { id: string }; searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiroDaSessao();
  if (!pode(ctx.alcance, 'dre.ver')) exigirPermissaoNaPagina(ctx, 'despesas.lancar');
  const { visao } = await visaoDaRequisicao(ctx);
  const id = params.id;
  return (
    <PaginaDaDespesa
      c={{ cliente: ctx.cliente, alcance: ctx.alcance, bloqueio: ctx.bloqueio, contexto: rotuloDaVisao(visao), raiz: '/erp' }}
      id={id}
      query={searchParams}
      acoes={{ pagar: acaoPagarDespesa.bind(null, id), desfazer: acaoDesfazerPagamento.bind(null, id), parar: acaoPararDeRepetir.bind(null, id), remover: acaoRemoverDespesa.bind(null, id) }}
    />
  );
}
