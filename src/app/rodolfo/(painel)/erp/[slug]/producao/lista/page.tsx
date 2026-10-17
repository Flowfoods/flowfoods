/** ERP, Lista do dia de um Parceiro Flow, pelo nível 1 (3.2): uma loja vai direto; mais de uma, a escolha da loja. */

import { redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { lojasDaProducao } from '@/lib/erp/producao';
import { TelaLojasDoEstoque } from '@/components/erp/telas/requisicoes/lojas';

export const dynamic = 'force-dynamic';

export default async function ParceiroListaDoDiaLojaPage({ params }: { params: { slug: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'producao.ver');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/producao`;
  const lojas = await lojasDaProducao(ctx.cliente, ctx.alcance);
  if (lojas.length === 1) redirect(`${base}/${lojas[0].id}/lista`);
  return <TelaLojasDoEstoque qual="producao" destino="lista" lojas={lojas} base={base} contexto={ctx.parceiro.nome} />;
}
