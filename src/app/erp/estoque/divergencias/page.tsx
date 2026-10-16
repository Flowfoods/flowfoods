/** ERP do parceiro — Divergências (1.8): uma loja no acesso vai direto; mais de uma, a lista. */

import { redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { lojasDasDivergencias } from '@/lib/erp/requisicao';
import { TelaLojasDoEstoque } from '@/components/erp/telas/requisicoes/lojas';

export const dynamic = 'force-dynamic';

export default async function ErpDivergenciasPage() {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'estoque.ajustar');
  const lojas = await lojasDasDivergencias(ctx.cliente, ctx.alcance);
  if (lojas.length === 1) redirect(`/erp/estoque/${lojas[0].id}/divergencias`);
  return <TelaLojasDoEstoque qual="divergencias" lojas={lojas} base="/erp/estoque" />;
}
