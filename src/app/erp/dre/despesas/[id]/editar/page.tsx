/**
 * ERP do parceiro — editar uma despesa (2.2a). Exige "lançar despesas"; a regra confere
 * a loja de antes e a de depois, e o período fechado (valor, competência, linha e loja
 * não mudam num período fechado).
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, visaoDaRequisicao } from '@/lib/erp/contexto';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { PaginaDeEditarDespesa } from '@/components/erp/telas/dre/paginas';
import { acaoEditarDespesa } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpEditarDespesaPage({ params }: { params: { id: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'despesas.lancar');
  const { visao } = await visaoDaRequisicao(ctx);
  return <PaginaDeEditarDespesa c={{ cliente: ctx.cliente, alcance: ctx.alcance, bloqueio: ctx.bloqueio, contexto: rotuloDaVisao(visao), raiz: '/erp' }} id={params.id} acao={acaoEditarDespesa.bind(null, params.id)} />;
}
