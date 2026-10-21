/** ERP do parceiro — a lista do dia (3.2): uma loja no acesso vai direto para a lista dela; mais de uma, a lista com a de hoje. */

import { redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { lojasDaListaDoDia } from '@/lib/erp/producao-lista';
import { TelaLojasDoEstoque } from '@/components/erp/telas/requisicoes/lojas';

export const dynamic = 'force-dynamic';

export default async function ErpListaDoDiaPage() {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'producao.ver');
  const lojas = await lojasDaListaDoDia(ctx.cliente, ctx.alcance);
  if (lojas.length === 1) redirect(`/erp/producao/lista/${lojas[0].id}`);
  return <TelaLojasDoEstoque qual="lista" lojas={lojas} base="/erp/producao/lista" />;
}
