/**
 * ERP do parceiro — uma etiqueta emitida (3.4): "imprimir etiquetas" NA loja (de outra loja ou parceiro, 404). O ZPL sai do
 * servidor a cada pedido de impressão (gravado antes do envio).
 */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { obterEmissao } from '@/lib/erp/etiquetas';
import { TelaDaEmissao } from '@/components/erp/telas/etiquetas/emissao';
import { fraseDasEtiquetas } from '@/components/erp/telas/etiquetas/estado';
import { acaoPedirImpressao, acaoResultadoDaImpressao } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpEmissaoPage({ params, searchParams }: { params: { lojaId: string; etiquetaId: string }; searchParams: { feito?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'etiquetas.imprimir');
  const d = await obterEmissao(ctx.cliente, ctx.alcance, params.lojaId, params.etiquetaId);
  if (!d) notFound();
  return (
    <TelaDaEmissao
      d={d}
      base="/erp/etiquetas"
      feito={fraseDasEtiquetas(searchParams.feito)}
      pedir={acaoPedirImpressao.bind(null, d.loja.id, d.etiqueta.id)}
      resultado={acaoResultadoDaImpressao.bind(null, d.loja.id)}
      hrefImpressora="/erp/etiquetas/impressora"
      bloqueio={ctx.bloqueio}
    />
  );
}
