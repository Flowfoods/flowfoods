/**
 * ERP, concluir um lote vindo da tela da cozinha, pelo nível 1 (polimento da 3.3): a mesma tela e a mesma regra do concluir do
 * lote, num endereço debaixo de Tarefas (a aba "Tarefas" fica marcada; a conclusão volta para elas).
 */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { avisoDePeriodos } from '@/lib/erp/periodo-aviso';
import { obterOrdem } from '@/lib/erp/producao';
import { pendente } from '@/lib/erp/producao-campos';
import { TelaConcluir } from '@/components/erp/telas/producao/concluir';
import { acaoConcluirProducao } from '../../../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroConcluirDasTarefasPage({ params }: { params: { slug: string; lojaId: string; ordemId: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'producao.registrar');
  const d = await obterOrdem(ctx.cliente, ctx.alcance, params.lojaId, params.ordemId);
  if (!d) notFound();
  const lojaId = d.loja.id;
  const raiz = `/rodolfo/erp/${ctx.parceiro.slug}`;
  if (!pendente(d.ordem.status) || ctx.bloqueio) redirect(`${raiz}/producao/${lojaId}/${d.ordem.id}`);
  return <TelaConcluir d={d} base={`${raiz}/producao`} contexto={ctx.parceiro.nome} acao={acaoConcluirProducao.bind(null, ctx.parceiro.slug, lojaId, d.ordem.id)} hrefRequisicao={`${raiz}/estoque/${lojaId}/requisicoes`} periodos={await avisoDePeriodos(ctx.cliente, ctx.alcance, raiz)} bloqueio={ctx.bloqueio} gerencia voltar="tarefas" />;
}
