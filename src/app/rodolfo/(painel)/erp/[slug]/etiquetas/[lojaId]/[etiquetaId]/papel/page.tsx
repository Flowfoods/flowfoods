/** ERP, o papel de um pedido de impressão de um Parceiro Flow, pelo nível 1 (3.4). */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { papelDoPedido } from '@/lib/erp/etiquetas';
import { TelaDoPapel } from '@/components/erp/telas/etiquetas/papel';

export const dynamic = 'force-dynamic';

export default async function ParceiroPapelDaEtiquetaPage({ params, searchParams }: { params: { slug: string; lojaId: string; etiquetaId: string }; searchParams: { pedido?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'etiquetas.imprimir');
  const d = await papelDoPedido(ctx.cliente, ctx.alcance, params.lojaId, params.etiquetaId, searchParams.pedido);
  if (!d) notFound();
  return <TelaDoPapel d={d} base={`/rodolfo/erp/${ctx.parceiro.slug}/etiquetas`} contexto={ctx.parceiro.nome} />;
}
