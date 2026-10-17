/** ERP, uma despesa de um Parceiro Flow, pelo nível 1. Id de outro parceiro ou inexistente: 404. */

import { exigirParceiro, exigirPermissao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { PaginaDaDespesa } from '@/components/erp/telas/dre/paginas';
import { acaoDesfazerPagamento, acaoPagarDespesa, acaoPararDeRepetir, acaoRemoverDespesa } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroDespesaPage({ params, searchParams }: { params: { slug: string; id: string }; searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'dre.ver');
  const { visao } = await visaoDaRequisicao(ctx);
  const { slug, id } = params;
  return (
    <PaginaDaDespesa
      c={{ cliente: ctx.cliente, alcance: ctx.alcance, bloqueio: ctx.bloqueio, contexto: `${ctx.parceiro.nome} · ${rotuloDaVisao(visao)}`, raiz: `/rodolfo/erp/${ctx.parceiro.slug}` }}
      id={id}
      query={searchParams}
      acoes={{ pagar: acaoPagarDespesa.bind(null, slug, id), desfazer: acaoDesfazerPagamento.bind(null, slug, id), parar: acaoPararDeRepetir.bind(null, slug, id), remover: acaoRemoverDespesa.bind(null, slug, id) }}
    />
  );
}
