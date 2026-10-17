/** ERP, entregar uma requisição de um Parceiro Flow, pelo nível 1 (1.8). */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { avisoDePeriodos } from '@/lib/erp/periodo-aviso';
import { obterRequisicao } from '@/lib/erp/requisicao';
import { pendente } from '@/lib/erp/requisicao-campos';
import { TelaEntregar } from '@/components/erp/telas/requisicoes/atender';
import { acaoAtenderRequisicao } from '../../../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroEntregarRequisicaoPage({ params }: { params: { slug: string; lojaId: string; requisicaoId: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'requisicao.atender');
  const d = await obterRequisicao(ctx.cliente, ctx.alcance, params.lojaId, params.requisicaoId);
  if (!d) notFound();
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/estoque`;
  if (!pendente(d.requisicao.status) || !d.aberto || ctx.bloqueio) redirect(`${base}/${d.loja.id}/requisicoes/${d.requisicao.id}`);
  return <TelaEntregar d={d} base={base} contexto={ctx.parceiro.nome} acao={acaoAtenderRequisicao.bind(null, ctx.parceiro.slug, d.loja.id, d.requisicao.id)} periodos={await avisoDePeriodos(ctx.cliente, ctx.alcance, `/rodolfo/erp/${ctx.parceiro.slug}`)} />;
}
