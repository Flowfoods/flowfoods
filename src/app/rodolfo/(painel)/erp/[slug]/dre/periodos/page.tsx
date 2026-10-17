/** ERP, Períodos de um Parceiro Flow, pelo nível 1: a regra do período, os recentes e o histórico. */

import { exigirParceiro, exigirPermissao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { PaginaDosPeriodos } from '@/components/erp/telas/dre/paginas';
import { acaoSalvarRegraDoPeriodo } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroPeriodosPage({ params }: { params: { slug: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'dre.ver');
  const { visao } = await visaoDaRequisicao(ctx);
  return <PaginaDosPeriodos c={{ cliente: ctx.cliente, alcance: ctx.alcance, bloqueio: ctx.bloqueio, contexto: `${ctx.parceiro.nome} · ${rotuloDaVisao(visao)}`, raiz: `/rodolfo/erp/${ctx.parceiro.slug}` }} podeMudar acao={acaoSalvarRegraDoPeriodo.bind(null, params.slug)} />;
}
