/**
 * ERP do parceiro — o quadro de produção de uma loja (3.1). Vê quem tem "ver produção" NA loja; loja de outro parceiro ou
 * fora do acesso é 404.
 */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { quadroDaProducao } from '@/lib/erp/producao';
import { TelaQuadroDaProducao } from '@/components/erp/telas/producao/quadro';
import { fraseDoEstoque } from '@/components/erp/telas/estoque/estado';

export const dynamic = 'force-dynamic';

export default async function ErpProducaoDaLojaPage({ params, searchParams }: { params: { lojaId: string }; searchParams: { feito?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'producao.ver');
  const q = await quadroDaProducao(ctx.cliente, ctx.alcance, params.lojaId);
  if (!q) notFound();
  return <TelaQuadroDaProducao q={q} base="/erp/producao" feito={fraseDoEstoque(searchParams.feito)} pode={{ registrar: pode(ctx.alcance, 'producao.registrar', { lojaId: q.loja.id }) }} bloqueio={ctx.bloqueio} />;
}
