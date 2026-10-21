/** ERP, os indicadores da produção por loja de um Parceiro Flow, pelo nível 1 (3.3). */

import { redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { lojasDaEquipe } from '@/lib/erp/producao-equipe';
import { TelaLojasDoEstoque } from '@/components/erp/telas/requisicoes/lojas';

export const dynamic = 'force-dynamic';

export default async function ParceiroIndicadoresDaProducaoPage({ params }: { params: { slug: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'producao.planejar');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/producao/indicadores`;
  const lojas = await lojasDaEquipe(ctx.cliente, ctx.alcance, 'producao.planejar');
  if (lojas.length === 1) redirect(`${base}/${lojas[0].id}`);
  return <TelaLojasDoEstoque qual="indicadores" lojas={lojas} base={base} contexto={ctx.parceiro.nome} />;
}
