/** ERP, editar uma despesa de um Parceiro Flow, pelo nível 1. */

import { exigirParceiro, exigirPermissao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { PaginaDeEditarDespesa } from '@/components/erp/telas/dre/paginas';
import { acaoEditarDespesa } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroEditarDespesaPage(
  props: { params: Promise<{ slug: string; id: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'despesas.lancar');
  const { visao } = await visaoDaRequisicao(ctx);
  return (
    <PaginaDeEditarDespesa
      c={{ cliente: ctx.cliente, alcance: ctx.alcance, bloqueio: ctx.bloqueio, contexto: `${ctx.parceiro.nome} · ${rotuloDaVisao(visao)}`, parceiro: ctx.parceiro.nome, raiz: `/rodolfo/erp/${ctx.parceiro.slug}` }}
      id={params.id}
      acao={acaoEditarDespesa.bind(null, params.slug, params.id)}
      query={searchParams}
    />
  );
}
