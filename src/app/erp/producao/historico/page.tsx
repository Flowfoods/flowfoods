/** ERP do parceiro — o histórico da produção (3.3): uma loja no acesso vai direto; mais de uma, a escolha. */

import { redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { lojasDaEquipe } from '@/lib/erp/producao-equipe';
import { TelaLojasDoEstoque } from '@/components/erp/telas/requisicoes/lojas';

export const dynamic = 'force-dynamic';

export default async function ErpHistoricoDaProducaoPage() {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'producao.ver');
  const lojas = await lojasDaEquipe(ctx.cliente, ctx.alcance, 'producao.ver');
  if (lojas.length === 1) redirect(`/erp/producao/historico/${lojas[0].id}`);
  return <TelaLojasDoEstoque qual="historico" lojas={lojas} base="/erp/producao/historico" />;
}
