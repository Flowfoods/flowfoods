/**
 * ERP do parceiro — lote e vencimento de uma nota (3.4): "ver compras" na loja da nota (de outra loja ou parceiro, 404);
 * registrar e tirar = "lançar nota de compra" nela. A nota não muda.
 */

import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { lotesDaNota } from '@/lib/erp/etiquetas';
import { TelaLotesDaNota } from '@/components/erp/telas/etiquetas/lotes-da-nota';
import { fraseDasEtiquetas } from '@/components/erp/telas/etiquetas/estado';
import { acaoRegistrarLote, acaoTirarLote } from '../../../etiquetas/actions';

export const dynamic = 'force-dynamic';

export default async function ErpLotesDaNotaPage({ params, searchParams }: { params: { id: string }; searchParams: { feito?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'compras.ver');
  const n = await lotesDaNota(ctx.cliente, ctx.alcance, params.id);
  if (!n) notFound();
  return (
    <TelaLotesDaNota
      n={n}
      hrefNota={`/erp/compras/${n.id}`}
      feito={fraseDasEtiquetas(searchParams.feito)}
      podeRegistrar={pode(ctx.alcance, 'compras.lancar', { lojaId: n.lojaId })}
      bloqueio={ctx.bloqueio}
      acoes={{ registrar: acaoRegistrarLote.bind(null, n.id), tirar: acaoTirarLote.bind(null, n.id) }}
      envio={`env-${randomUUID()}`}
    />
  );
}
