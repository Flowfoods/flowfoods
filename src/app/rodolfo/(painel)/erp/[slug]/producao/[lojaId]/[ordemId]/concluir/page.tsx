/** ERP, concluir um lote de um Parceiro Flow, pelo nível 1 (3.1). */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { avisoDePeriodos } from '@/lib/erp/periodo-aviso';
import { obterOrdem } from '@/lib/erp/producao';
import { pendente } from '@/lib/erp/producao-campos';
import { TelaConcluir } from '@/components/erp/telas/producao/concluir';
import { acaoConcluirProducao } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroConcluirLotePage({ params, searchParams }: { params: { slug: string; lojaId: string; ordemId: string }; searchParams?: { de?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'producao.registrar');
  const d = await obterOrdem(ctx.cliente, ctx.alcance, params.lojaId, params.ordemId);
  if (!d) notFound();
  const lojaId = d.loja.id;
  const raiz = `/rodolfo/erp/${ctx.parceiro.slug}`;
  if (!pendente(d.ordem.status) || ctx.bloqueio) redirect(`${raiz}/producao/${lojaId}/${d.ordem.id}`);
  return <TelaConcluir d={d} base={`${raiz}/producao`} contexto={ctx.parceiro.nome} acao={acaoConcluirProducao.bind(null, ctx.parceiro.slug, lojaId, d.ordem.id)} hrefRequisicao={`${raiz}/estoque/${lojaId}/requisicoes`} periodos={await avisoDePeriodos(ctx.cliente, ctx.alcance, raiz)} bloqueio={ctx.bloqueio} gerencia voltar={searchParams?.de === 'tarefas' ? 'tarefas' : undefined} />;
}
