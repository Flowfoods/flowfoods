/** ERP do parceiro — os indicadores da produção por pessoa (3.3, a gerência): uma loja no acesso vai direto; mais de uma, a escolha. */

import { redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { lojasDaEquipe } from '@/lib/erp/producao-equipe';
import { TelaLojasDoEstoque } from '@/components/erp/telas/requisicoes/lojas';

export const dynamic = 'force-dynamic';

export default async function ErpIndicadoresDaProducaoPage() {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'producao.planejar');
  const lojas = await lojasDaEquipe(ctx.cliente, ctx.alcance, 'producao.planejar');
  if (lojas.length === 1) redirect(`/erp/producao/indicadores/${lojas[0].id}`);
  return <TelaLojasDoEstoque qual="indicadores" lojas={lojas} base="/erp/producao/indicadores" />;
}
