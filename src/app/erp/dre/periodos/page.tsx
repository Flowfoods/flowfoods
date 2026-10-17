/**
 * ERP do parceiro — Períodos (2.2a): a regra do período (a mesma do DRE e da contagem de
 * estoque), os períodos recentes e o histórico das regras. Ver exige "ver DRE e CMV";
 * mudar a regra, "definir metas, plano de contas e período" (a rede inteira).
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode, visaoDaRequisicao } from '@/lib/erp/contexto';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { PaginaDosPeriodos } from '@/components/erp/telas/dre/paginas';
import { acaoSalvarRegraDoPeriodo } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ErpPeriodosPage() {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'dre.ver');
  const { visao } = await visaoDaRequisicao(ctx);
  return <PaginaDosPeriodos c={{ cliente: ctx.cliente, alcance: ctx.alcance, bloqueio: ctx.bloqueio, contexto: rotuloDaVisao(visao), raiz: '/erp' }} podeMudar={pode(ctx.alcance, 'metas.editar')} acao={acaoSalvarRegraDoPeriodo} />;
}
