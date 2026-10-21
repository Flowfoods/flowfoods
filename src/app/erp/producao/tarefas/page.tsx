/** ERP do parceiro — a tela da cozinha (3.3): uma loja no acesso vai direto para as tarefas dela; mais de uma, a escolha. */

import { redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { lojasDaEquipe } from '@/lib/erp/producao-equipe';
import { TelaLojasDoEstoque } from '@/components/erp/telas/requisicoes/lojas';

export const dynamic = 'force-dynamic';

export default async function ErpTarefasPage() {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'producao.registrar');
  const lojas = await lojasDaEquipe(ctx.cliente, ctx.alcance, 'producao.registrar');
  if (lojas.length === 1) redirect(`/erp/producao/tarefas/${lojas[0].id}`);
  return <TelaLojasDoEstoque qual="tarefas" lojas={lojas} base="/erp/producao/tarefas" />;
}
