/** ERP, requisições por loja de um Parceiro Flow, pelo nível 1 (1.8). */

import { redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { lojasDasRequisicoes } from '@/lib/erp/requisicao';
import { TelaLojasDoEstoque } from '@/components/erp/telas/requisicoes/lojas';

export const dynamic = 'force-dynamic';

export default async function ParceiroRequisicoesPage({ params }: { params: { slug: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'requisicao.pedir');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/estoque`;
  const lojas = await lojasDasRequisicoes(ctx.cliente, ctx.alcance);
  if (lojas.length === 1) redirect(`${base}/${lojas[0].id}/requisicoes`);
  return <TelaLojasDoEstoque qual="requisicoes" lojas={lojas} base={base} contexto={ctx.parceiro.nome} />;
}
