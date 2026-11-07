/** ERP, os indicadores da produção por pessoa de uma loja de um Parceiro Flow, pelo nível 1 (3.3). */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { idsDaEquipe } from '@/lib/erp/credenciais';
import { indicadoresDaProducao } from '@/lib/erp/producao-equipe';
import { TelaIndicadores } from '@/components/erp/telas/producao/indicadores';

export const dynamic = 'force-dynamic';

export default async function ParceiroIndicadoresDaLojaPage(
  props: { params: Promise<{ slug: string; lojaId: string }>; searchParams: Promise<{ periodo?: string; de?: string; ate?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'producao.planejar');
  const d = await indicadoresDaProducao(ctx.cliente, ctx.alcance, params.lojaId, searchParams, await idsDaEquipe(ctx.parceiro.id));
  if (!d) notFound();
  return <TelaIndicadores d={d} base={`/rodolfo/erp/${ctx.parceiro.slug}/producao`} contexto={ctx.parceiro.nome} />;
}
