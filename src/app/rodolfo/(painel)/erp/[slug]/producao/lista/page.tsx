/** ERP, a lista do dia por loja de um Parceiro Flow, pelo nível 1 (3.2). */

import { redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { lojasDaListaDoDia } from '@/lib/erp/producao-lista';
import { TelaLojasDoEstoque } from '@/components/erp/telas/requisicoes/lojas';

export const dynamic = 'force-dynamic';

export default async function ParceiroListaDoDiaPage({ params }: { params: { slug: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'producao.ver');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/producao/lista`;
  const lojas = await lojasDaListaDoDia(ctx.cliente, ctx.alcance);
  if (lojas.length === 1) redirect(`${base}/${lojas[0].id}`);
  return <TelaLojasDoEstoque qual="lista" lojas={lojas} base={base} contexto={ctx.parceiro.nome} />;
}
