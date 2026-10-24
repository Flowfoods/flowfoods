/** ERP, detalhe do insumo de um parceiro, pelo nível 1 (lido pelo portão do parceiro do slug: de outro, 404). */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { obterInsumo } from '@/lib/erp/insumos';
import { saldosDoInsumo } from '@/lib/erp/estoque';
import { ondeOInsumoEUsado } from '@/lib/erp/onde-e-usado';
import { lerFiltros, queryDosFiltros } from '@/lib/erp/insumo-campos';
import { TelaDetalheInsumo } from '@/components/erp/telas/insumos/detalhe';
import { acaoConfirmarConservacao, acaoSituacaoInsumo } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroInsumoPage({
  params,
  searchParams,
}: {
  params: { slug: string; id: string };
  searchParams: { de?: string; feito?: string };
}) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'insumos.ver');
  const insumo = await obterInsumo(ctx.cliente, params.id, ctx.alcance);
  if (!insumo) notFound();
  const saldos = await saldosDoInsumo(ctx.cliente, ctx.alcance, insumo.id);
  const ondeEUsado = await ondeOInsumoEUsado(ctx.cliente, insumo.id, insumo.unidade);
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/insumos`;
  const de = queryDosFiltros(lerFiltros(Object.fromEntries(new URLSearchParams(searchParams.de ?? ''))));
  return (
    <TelaDetalheInsumo
      insumo={insumo}
      base={base}
      voltar={de ? `${base}?${de}` : base}
      feito={searchParams.feito}
      de={de}
      contexto={ctx.parceiro.nome}
      podeEditar
      bloqueio={ctx.bloqueio}
      acaoConfirmar={acaoConfirmarConservacao.bind(null, ctx.parceiro.slug, insumo.id)}
      acaoSituacao={acaoSituacaoInsumo.bind(null, ctx.parceiro.slug, insumo.id)}
      linkDaNota={(notaId) => `/rodolfo/erp/${ctx.parceiro.slug}/compras/${notaId}`}
      historicoHref={`/rodolfo/erp/${ctx.parceiro.slug}/compras/relatorios/insumo?insumo=${insumo.id}`}
      estoque={{ saldos, base: `/rodolfo/erp/${ctx.parceiro.slug}/estoque` }}
      ondeEUsado={ondeEUsado}
    />
  );
}
