/** ERP do parceiro — Requisições (1.8): uma loja no acesso vai direto; mais de uma, a lista com pendentes e atrasadas. */

import { redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { lojasDasRequisicoes } from '@/lib/erp/requisicao';
import { TelaLojasDoEstoque } from '@/components/erp/telas/requisicoes/lojas';

export const dynamic = 'force-dynamic';

export default async function ErpRequisicoesPage() {
  const ctx = await exigirParceiroDaSessao();
  if (!pode(ctx.alcance, 'requisicao.atender')) exigirPermissaoNaPagina(ctx, 'requisicao.pedir');
  const lojas = await lojasDasRequisicoes(ctx.cliente, ctx.alcance);
  if (lojas.length === 1) redirect(`/erp/estoque/${lojas[0].id}/requisicoes`);
  return <TelaLojasDoEstoque qual="requisicoes" lojas={lojas} base="/erp/estoque" />;
}
