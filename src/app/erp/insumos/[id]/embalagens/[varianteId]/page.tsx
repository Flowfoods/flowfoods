/**
 * ERP do parceiro — outra embalagem de compra do insumo (`nova` ou o id).
 * Insumo e embalagem lidos pelo portão da sessão: de outro parceiro, 404.
 */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { obterInsumo } from '@/lib/erp/insumos';
import { TelaEmbalagem } from '@/components/erp/telas/insumos/paginas';
import { acaoSalvarEmbalagem, acaoSituacaoEmbalagem } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpEmbalagemPage({ params }: { params: { id: string; varianteId: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'insumos.editar');
  const insumo = await obterInsumo(ctx.cliente, params.id, ctx.alcance);
  if (!insumo) notFound();
  // Pré-preparo (1.3) só muda pela ficha técnica.
  if (!insumo.ativo || insumo.preparo) redirect(`/erp/insumos/${insumo.id}`);
  const nova = params.varianteId === 'nova';
  if (!nova && !insumo.variantes.some((v) => v.id === params.varianteId)) notFound();
  const varianteId = nova ? '' : params.varianteId;
  return (
    <TelaEmbalagem
      insumo={insumo}
      varianteId={varianteId || undefined}
      base="/erp/insumos"
      acaoSalvar={acaoSalvarEmbalagem.bind(null, insumo.id, varianteId)}
      acaoSituacao={varianteId ? acaoSituacaoEmbalagem.bind(null, insumo.id, varianteId) : undefined}
      bloqueio={ctx.bloqueio}
    />
  );
}
