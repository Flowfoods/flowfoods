/** ERP, o histórico da produção por loja de um Parceiro Flow, pelo nível 1 (3.3). */

import { redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { lojasDaEquipe } from '@/lib/erp/producao-equipe';
import { TelaLojasDoEstoque } from '@/components/erp/telas/requisicoes/lojas';

export const dynamic = 'force-dynamic';

export default async function ParceiroHistoricoDaProducaoPage({ params }: { params: { slug: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'producao.ver');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/producao/historico`;
  const lojas = await lojasDaEquipe(ctx.cliente, ctx.alcance, 'producao.ver');
  if (lojas.length === 1) redirect(`${base}/${lojas[0].id}`);
  return <TelaLojasDoEstoque qual="historico" lojas={lojas} base={base} contexto={ctx.parceiro.nome} />;
}
