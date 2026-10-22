/** ERP, Remover insumo de um parceiro (L.1), pelo nível 1: lido pelo portão do parceiro do slug (de outro, 404). */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { deSeguro } from '@/lib/erp/insumo-campos';
import { lerRemocao } from '@/lib/erp/insumo-remocao';
import { TelaRemoverInsumo } from '@/components/erp/telas/insumos/remover';
import { acaoExcluirInsumo, acaoSituacaoInsumo } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroRemoverInsumoPage({ params, searchParams }: { params: { slug: string; id: string }; searchParams: { de?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'insumos.editar');
  const insumo = await lerRemocao(ctx.cliente, params.id);
  if (!insumo) notFound();
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/insumos`;
  if (insumo.preparo) redirect(`${base}/${insumo.id}`);
  return (
    <TelaRemoverInsumo
      insumo={insumo}
      base={base}
      de={deSeguro(searchParams.de)}
      contexto={ctx.parceiro.nome}
      bloqueio={ctx.bloqueio}
      acaoSituacao={acaoSituacaoInsumo.bind(null, ctx.parceiro.slug, insumo.id)}
      acaoExcluir={acaoExcluirInsumo.bind(null, ctx.parceiro.slug, insumo.id)}
    />
  );
}
