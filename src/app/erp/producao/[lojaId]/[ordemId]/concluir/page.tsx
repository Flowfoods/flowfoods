/**
 * ERP do parceiro — concluir um lote (3.1): "registrar produção" NA loja. Lote já fechado volta para o lote. 3.3: o lote com
 * outra pessoa só ela ou a gerência conclui (a tela avisa; a regra confere); vindo da tela da cozinha (`?de=tarefas`), volta
 * para ela.
 */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { avisoDePeriodos } from '@/lib/erp/periodo-aviso';
import { obterOrdem } from '@/lib/erp/producao';
import { pendente } from '@/lib/erp/producao-campos';
import { TelaConcluir } from '@/components/erp/telas/producao/concluir';
import { acaoConcluirProducao } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpConcluirLotePage({ params, searchParams }: { params: { lojaId: string; ordemId: string }; searchParams?: { de?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'producao.registrar', { lojaId: params.lojaId });
  const d = await obterOrdem(ctx.cliente, ctx.alcance, params.lojaId, params.ordemId, new Date(), ctx.sessao.userId);
  if (!d) notFound();
  const lojaId = d.loja.id;
  if (!pendente(d.ordem.status) || ctx.bloqueio) redirect(`/erp/producao/${lojaId}/${d.ordem.id}`);
  const veRequisicao = pode(ctx.alcance, 'requisicao.pedir', { lojaId }) || pode(ctx.alcance, 'requisicao.atender', { lojaId });
  return <TelaConcluir d={d} base="/erp/producao" acao={acaoConcluirProducao.bind(null, lojaId, d.ordem.id)} hrefRequisicao={veRequisicao ? `/erp/estoque/${lojaId}/requisicoes` : null} periodos={await avisoDePeriodos(ctx.cliente, ctx.alcance, '/erp')} bloqueio={ctx.bloqueio} gerencia={pode(ctx.alcance, 'producao.planejar', { lojaId })} voltar={searchParams?.de === 'tarefas' ? 'tarefas' : undefined} />;
}
