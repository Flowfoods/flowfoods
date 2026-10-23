/** ERP, uma etiqueta emitida de um Parceiro Flow, pelo nível 1 (3.4): imprimir e reimprimir (cada pedido no auditLog). */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { obterEmissao } from '@/lib/erp/etiquetas';
import { TelaDaEmissao } from '@/components/erp/telas/etiquetas/emissao';
import { fraseDasEtiquetas } from '@/components/erp/telas/etiquetas/estado';
import { acaoConfirmarImpressao, acaoPedirImpressao, acaoResultadoDaImpressao } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroEmissaoPage({ params, searchParams }: { params: { slug: string; lojaId: string; etiquetaId: string }; searchParams: { feito?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'etiquetas.imprimir');
  const d = await obterEmissao(ctx.cliente, ctx.alcance, params.lojaId, params.etiquetaId);
  if (!d) notFound();
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/etiquetas`;
  return (
    <TelaDaEmissao
      d={d}
      base={base}
      contexto={ctx.parceiro.nome}
      feito={fraseDasEtiquetas(searchParams.feito)}
      pedir={acaoPedirImpressao.bind(null, ctx.parceiro.slug, d.loja.id, d.etiqueta.id)}
      resultado={acaoResultadoDaImpressao.bind(null, ctx.parceiro.slug, d.loja.id)}
      confirmar={acaoConfirmarImpressao.bind(null, ctx.parceiro.slug, d.loja.id, d.etiqueta.id)}
      hrefImpressora={`${base}/impressora`}
      bloqueio={ctx.bloqueio}
    />
  );
}
