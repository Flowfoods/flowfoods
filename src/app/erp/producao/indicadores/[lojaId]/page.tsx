/** ERP do parceiro — os indicadores da produção por pessoa de uma loja (3.3): "definir a lista do dia" NA loja (a gerência). */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { idsDaEquipe } from '@/lib/erp/credenciais';
import { indicadoresDaProducao } from '@/lib/erp/producao-equipe';
import { TelaIndicadores } from '@/components/erp/telas/producao/indicadores';

export const dynamic = 'force-dynamic';

export default async function ErpIndicadoresDaLojaPage({ params, searchParams }: { params: { lojaId: string }; searchParams: { periodo?: string; de?: string; ate?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'producao.planejar');
  const d = await indicadoresDaProducao(ctx.cliente, ctx.alcance, params.lojaId, searchParams, await idsDaEquipe(ctx.parceiro.id));
  if (!d) notFound();
  return <TelaIndicadores d={d} base="/erp/producao" />;
}
