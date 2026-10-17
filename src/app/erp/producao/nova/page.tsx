/** ERP do parceiro — Nova produção (3.1): em qual loja? Uma loja onde a pessoa registra produção vai direto ao planejamento. */

import { redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { lojasDaProducao } from '@/lib/erp/producao';
import { TelaLojasDoEstoque } from '@/components/erp/telas/requisicoes/lojas';

export const dynamic = 'force-dynamic';

export default async function ErpNovaProducaoLojaPage({ searchParams }: { searchParams: { ficha?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'producao.registrar');
  const lojas = await lojasDaProducao(ctx.cliente, ctx.alcance, { permissao: 'producao.registrar' });
  const consulta = /^[a-z0-9]{1,64}$/i.test(searchParams.ficha ?? '') ? `?ficha=${searchParams.ficha}` : '';
  if (lojas.length === 1) redirect(`/erp/producao/${lojas[0].id}/nova${consulta}`);
  return <TelaLojasDoEstoque qual="producao" destino="nova" lojas={lojas} base="/erp/producao" consulta={consulta} />;
}
