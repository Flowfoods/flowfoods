/** ERP, divergências (requisição × contagem) de uma loja de um Parceiro Flow, pelo nível 1 (1.8). */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { divergenciasDaLoja } from '@/lib/erp/requisicao';
import { TelaDivergencias } from '@/components/erp/telas/requisicoes/divergencias';

export const dynamic = 'force-dynamic';

export default async function ParceiroDivergenciasDaLojaPage({ params, searchParams }: { params: { slug: string; lojaId: string }; searchParams: { de?: string; ate?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'estoque.ajustar');
  const d = await divergenciasDaLoja(ctx.cliente, ctx.alcance, params.lojaId, searchParams, ctx.parceiro);
  if (!d) notFound();
  return <TelaDivergencias d={d} base={`/rodolfo/erp/${ctx.parceiro.slug}/estoque`} contexto={ctx.parceiro.nome} />;
}
