/** ERP do parceiro — Lista do dia (3.2): uma loja no acesso vai direto à lista dela; mais de uma, a escolha da loja. */

import { redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { lojasDaProducao } from '@/lib/erp/producao';
import { TelaLojasDoEstoque } from '@/components/erp/telas/requisicoes/lojas';

export const dynamic = 'force-dynamic';

export default async function ErpListaDoDiaLojaPage() {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'producao.ver');
  const lojas = await lojasDaProducao(ctx.cliente, ctx.alcance);
  if (lojas.length === 1) redirect(`/erp/producao/${lojas[0].id}/lista`);
  return <TelaLojasDoEstoque qual="producao" destino="lista" lojas={lojas} base="/erp/producao" />;
}
