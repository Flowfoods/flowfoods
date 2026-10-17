/** ERP, produção por loja de um Parceiro Flow, pelo nível 1 (3.1). */

import { redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { lojasDaProducao } from '@/lib/erp/producao';
import { TelaLojasDoEstoque } from '@/components/erp/telas/requisicoes/lojas';

export const dynamic = 'force-dynamic';

export default async function ParceiroProducaoPage({ params }: { params: { slug: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'producao.ver');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/producao`;
  const lojas = await lojasDaProducao(ctx.cliente, ctx.alcance);
  if (lojas.length === 1) redirect(`${base}/${lojas[0].id}`);
  return <TelaLojasDoEstoque qual="producao" lojas={lojas} base={base} contexto={ctx.parceiro.nome} />;
}
