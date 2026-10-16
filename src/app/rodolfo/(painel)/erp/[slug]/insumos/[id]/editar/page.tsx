/** ERP, editar insumo de um parceiro, pelo nível 1. */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { obterInsumo } from '@/lib/erp/insumos';
import { TelaFormInsumo } from '@/components/erp/telas/insumos/paginas';
import { acaoEditarInsumo } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroEditarInsumoPage({ params }: { params: { slug: string; id: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'insumos.editar');
  const insumo = await obterInsumo(ctx.cliente, params.id, ctx.alcance);
  if (!insumo) notFound();
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/insumos`;
  // Pré-preparo (1.3) só muda pela ficha técnica.
  if (!insumo.ativo || insumo.preparo) redirect(`${base}/${insumo.id}`);
  return (
    <TelaFormInsumo
      insumo={insumo}
      base={base}
      contexto={ctx.parceiro.nome}
      acao={acaoEditarInsumo.bind(null, ctx.parceiro.slug, insumo.id)}
      bloqueio={ctx.bloqueio}
    />
  );
}
