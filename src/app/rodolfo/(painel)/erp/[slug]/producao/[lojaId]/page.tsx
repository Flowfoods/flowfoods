/** ERP, quadro de produção de uma loja de um Parceiro Flow, pelo nível 1 (3.1). */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { quadroDaProducao } from '@/lib/erp/producao';
import { TelaQuadroDaProducao } from '@/components/erp/telas/producao/quadro';
import { fraseDoEstoque } from '@/components/erp/telas/estoque/estado';

export const dynamic = 'force-dynamic';

export default async function ParceiroProducaoDaLojaPage(
  props: { params: Promise<{ slug: string; lojaId: string }>; searchParams: Promise<{ feito?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'producao.ver');
  const q = await quadroDaProducao(ctx.cliente, ctx.alcance, params.lojaId);
  if (!q) notFound();
  return <TelaQuadroDaProducao q={q} base={`/rodolfo/erp/${ctx.parceiro.slug}/producao`} contexto={ctx.parceiro.nome} feito={fraseDoEstoque(searchParams.feito)} pode={{ registrar: true, planejar: true }} bloqueio={ctx.bloqueio} />;
}
