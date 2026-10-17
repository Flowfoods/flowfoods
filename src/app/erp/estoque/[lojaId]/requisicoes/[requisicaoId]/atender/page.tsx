/** ERP do parceiro — entregar uma requisição (1.8): "atender requisição e dar baixa" NA loja. */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { avisoDePeriodos } from '@/lib/erp/periodo-aviso';
import { obterRequisicao } from '@/lib/erp/requisicao';
import { pendente } from '@/lib/erp/requisicao-campos';
import { TelaEntregar } from '@/components/erp/telas/requisicoes/atender';
import { acaoAtenderRequisicao } from '../../../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpEntregarRequisicaoPage({ params }: { params: { lojaId: string; requisicaoId: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'requisicao.atender', { lojaId: params.lojaId });
  const d = await obterRequisicao(ctx.cliente, ctx.alcance, params.lojaId, params.requisicaoId);
  if (!d) notFound();
  const aqui = `/erp/estoque/${d.loja.id}/requisicoes/${d.requisicao.id}`;
  if (!pendente(d.requisicao.status) || !d.aberto || ctx.bloqueio) redirect(aqui);
  return <TelaEntregar d={d} base="/erp/estoque" acao={acaoAtenderRequisicao.bind(null, d.loja.id, d.requisicao.id)} periodos={await avisoDePeriodos(ctx.cliente, ctx.alcance, '/erp')} />;
}
