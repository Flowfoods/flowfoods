/** ERP do parceiro — Produção (3.1): uma loja no acesso vai direto ao quadro; mais de uma, a lista com pendentes e atrasados. */

import { redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { lojasDaProducao } from '@/lib/erp/producao';
import { TelaLojasDoEstoque } from '@/components/erp/telas/requisicoes/lojas';

export const dynamic = 'force-dynamic';

export default async function ErpProducaoPage() {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'producao.ver');
  const lojas = await lojasDaProducao(ctx.cliente, ctx.alcance);
  if (lojas.length === 1) redirect(`/erp/producao/${lojas[0].id}`);
  return <TelaLojasDoEstoque qual="producao" lojas={lojas} base="/erp/producao" />;
}
