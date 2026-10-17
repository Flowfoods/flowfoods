/** ERP, nova produção de um Parceiro Flow, pelo nível 1 (3.1): em qual loja? */

import { redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { lojasDaProducao } from '@/lib/erp/producao';
import { TelaLojasDoEstoque } from '@/components/erp/telas/requisicoes/lojas';

export const dynamic = 'force-dynamic';

export default async function ParceiroNovaProducaoLojaPage({ params, searchParams }: { params: { slug: string }; searchParams: { ficha?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'producao.registrar');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/producao`;
  const lojas = await lojasDaProducao(ctx.cliente, ctx.alcance, { permissao: 'producao.registrar' });
  const consulta = /^[a-z0-9]{1,64}$/i.test(searchParams.ficha ?? '') ? `?ficha=${searchParams.ficha}` : '';
  if (lojas.length === 1) redirect(`${base}/${lojas[0].id}/nova${consulta}`);
  return <TelaLojasDoEstoque qual="producao" destino="nova" lojas={lojas} base={base} contexto={ctx.parceiro.nome} consulta={consulta} />;
}
