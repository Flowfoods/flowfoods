/** ERP, outra embalagem de compra de um insumo do parceiro, pelo nível 1 (`nova` ou o id). */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { obterInsumo } from '@/lib/erp/insumos';
import { TelaEmbalagem } from '@/components/erp/telas/insumos/paginas';
import { acaoSalvarEmbalagem, acaoSituacaoEmbalagem } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroEmbalagemPage({ params }: { params: { slug: string; id: string; varianteId: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'insumos.editar');
  const insumo = await obterInsumo(ctx.cliente, params.id);
  if (!insumo) notFound();
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/insumos`;
  // Pré-preparo (1.3) só muda pela ficha técnica.
  if (!insumo.ativo || insumo.preparo) redirect(`${base}/${insumo.id}`);
  const nova = params.varianteId === 'nova';
  if (!nova && !insumo.variantes.some((v) => v.id === params.varianteId)) notFound();
  const varianteId = nova ? '' : params.varianteId;
  const slug = ctx.parceiro.slug;
  return (
    <TelaEmbalagem
      insumo={insumo}
      varianteId={varianteId || undefined}
      base={base}
      acaoSalvar={acaoSalvarEmbalagem.bind(null, slug, insumo.id, varianteId)}
      acaoSituacao={varianteId ? acaoSituacaoEmbalagem.bind(null, slug, insumo.id, varianteId) : undefined}
      bloqueio={ctx.bloqueio}
    />
  );
}
