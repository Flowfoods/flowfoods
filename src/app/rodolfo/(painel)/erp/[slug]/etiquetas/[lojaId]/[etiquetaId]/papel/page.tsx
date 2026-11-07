/** ERP, o papel de um pedido de impressão de um Parceiro Flow, pelo nível 1 (3.4). */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { papelDoPedido } from '@/lib/erp/etiquetas';
import { TelaDoPapel } from '@/components/erp/telas/etiquetas/papel';
import { acaoConfirmarImpressao } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroPapelDaEtiquetaPage(
  props: { params: Promise<{ slug: string; lojaId: string; etiquetaId: string }>; searchParams: Promise<{ pedido?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'etiquetas.imprimir');
  const d = await papelDoPedido(ctx.cliente, ctx.alcance, params.lojaId, params.etiquetaId, searchParams.pedido);
  if (!d) notFound();
  return <TelaDoPapel d={d} base={`/rodolfo/erp/${ctx.parceiro.slug}/etiquetas`} contexto={ctx.parceiro.nome} confirmar={acaoConfirmarImpressao.bind(null, ctx.parceiro.slug, d.loja.id, d.etiqueta.id)} />;
}
