/** ERP, o histórico da produção de uma loja de um Parceiro Flow, pelo nível 1 (3.3). */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { historicoDaProducao } from '@/lib/erp/producao-equipe';
import { TelaHistoricoDaProducao } from '@/components/erp/telas/producao/historico-producao';

export const dynamic = 'force-dynamic';

export default async function ParceiroHistoricoDaProducaoDaLojaPage({ params, searchParams }: { params: { slug: string; lojaId: string }; searchParams: { periodo?: string; de?: string; ate?: string; pessoa?: string; ficha?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'producao.ver');
  const h = await historicoDaProducao(ctx.cliente, ctx.alcance, params.lojaId, searchParams);
  if (!h) notFound();
  return <TelaHistoricoDaProducao h={h} base={`/rodolfo/erp/${ctx.parceiro.slug}/producao`} contexto={ctx.parceiro.nome} />;
}
