/** ERP, lote e vencimento de uma nota de um Parceiro Flow, pelo nível 1 (3.4). A nota não muda. */

import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { lotesDaNota } from '@/lib/erp/etiquetas';
import { TelaLotesDaNota } from '@/components/erp/telas/etiquetas/lotes-da-nota';
import { fraseDasEtiquetas } from '@/components/erp/telas/etiquetas/estado';
import { acaoRegistrarLote, acaoTirarLote } from '../../../etiquetas/actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroLotesDaNotaPage({ params, searchParams }: { params: { slug: string; id: string }; searchParams: { feito?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'compras.ver');
  const n = await lotesDaNota(ctx.cliente, ctx.alcance, params.id);
  if (!n) notFound();
  return (
    <TelaLotesDaNota
      n={n}
      hrefNota={`/rodolfo/erp/${ctx.parceiro.slug}/compras/${n.id}`}
      contexto={ctx.parceiro.nome}
      feito={fraseDasEtiquetas(searchParams.feito)}
      podeRegistrar
      bloqueio={ctx.bloqueio}
      acoes={{ registrar: acaoRegistrarLote.bind(null, ctx.parceiro.slug, n.id), tirar: acaoTirarLote.bind(null, ctx.parceiro.slug, n.id) }}
      envio={`env-${randomUUID()}`}
    />
  );
}
