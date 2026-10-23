/**
 * ERP do parceiro — o papel de um pedido de impressão (3.4): as etiquetas em tamanho real numa folha A4. Só o pedido feito
 * para o papel desta emissão (`?pedido=`, gravado antes): abrir a página não grava nada.
 */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { papelDoPedido } from '@/lib/erp/etiquetas';
import { TelaDoPapel } from '@/components/erp/telas/etiquetas/papel';
import { acaoConfirmarImpressao } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpPapelDaEtiquetaPage({ params, searchParams }: { params: { lojaId: string; etiquetaId: string }; searchParams: { pedido?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'etiquetas.imprimir');
  const d = await papelDoPedido(ctx.cliente, ctx.alcance, params.lojaId, params.etiquetaId, searchParams.pedido);
  if (!d) notFound();
  return <TelaDoPapel d={d} base="/erp/etiquetas" confirmar={acaoConfirmarImpressao.bind(null, d.loja.id, d.etiqueta.id)} />;
}
