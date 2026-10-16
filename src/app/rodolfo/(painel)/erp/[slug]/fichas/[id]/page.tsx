/** ERP, detalhe da ficha técnica de um parceiro, pelo nível 1 (lida pelo portão do parceiro do slug: de outro, 404). */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { obterFicha } from '@/lib/erp/fichas';
import { custoPorCanal } from '@/lib/erp/canais';
import { lerFiltrosDeFicha, queryDosFiltrosDeFicha } from '@/lib/erp/ficha-campos';
import { TelaDetalheFicha } from '@/components/erp/telas/fichas/detalhe';
import { acaoSalvarPrecos, acaoSituacaoFicha } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroFichaPage({
  params,
  searchParams,
}: {
  params: { slug: string; id: string };
  searchParams: { de?: string; feito?: string };
}) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'fichas.ver');
  const ficha = await obterFicha(ctx.cliente, params.id);
  if (!ficha) notFound();
  const base = `/rodolfo/erp/${ctx.parceiro.slug}`;
  const canais = await custoPorCanal(ctx.cliente, ficha);
  const de = queryDosFiltrosDeFicha(lerFiltrosDeFicha(Object.fromEntries(new URLSearchParams(searchParams.de ?? ''))));
  return (
    <TelaDetalheFicha
      ficha={ficha}
      base={`${base}/fichas`}
      voltar={de ? `${base}/fichas?${de}` : `${base}/fichas`}
      feito={searchParams.feito}
      contexto={ctx.parceiro.nome}
      podeEditar
      bloqueio={ctx.bloqueio}
      acaoSituacao={acaoSituacaoFicha.bind(null, ctx.parceiro.slug, ficha.id)}
      linkDoInsumo={`${base}/insumos`}
      canais={canais}
      linkDasEmbalagens={ctx.bloqueio ? undefined : `${base}/fichas/${ficha.id}/canais`}
      linkDaTaxa={`${base}/fichas/canais`}
      podeConfigurarTaxa={!ctx.bloqueio}
      acaoPrecos={ctx.bloqueio ? undefined : acaoSalvarPrecos.bind(null, ctx.parceiro.slug, ficha.id)}
    />
  );
}
