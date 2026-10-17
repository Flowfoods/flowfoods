/**
 * ERP do parceiro — Plano de contas (2.2a): as linhas do DRE e os nomes da casa. Exige
 * "definir metas, plano de contas e período" (que só vale com a rede inteira).
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, visaoDaRequisicao } from '@/lib/erp/contexto';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { PaginaDoPlano } from '@/components/erp/telas/dre/paginas';
import { acaoCriarLinhaDoPlano, acaoOcultarLinhaDoPlano, acaoRenomearLinhaDoPlano } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ErpPlanoPage() {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'metas.editar');
  const { visao } = await visaoDaRequisicao(ctx);
  return <PaginaDoPlano c={{ cliente: ctx.cliente, alcance: ctx.alcance, bloqueio: ctx.bloqueio, contexto: rotuloDaVisao(visao), raiz: '/erp' }} acoes={{ criar: acaoCriarLinhaDoPlano, renomear: acaoRenomearLinhaDoPlano, ocultar: acaoOcultarLinhaDoPlano }} />;
}
