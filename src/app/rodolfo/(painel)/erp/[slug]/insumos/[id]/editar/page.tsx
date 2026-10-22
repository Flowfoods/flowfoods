/** ERP, editar insumo de um parceiro, pelo nível 1. */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { obterInsumo } from '@/lib/erp/insumos';
import { categoriasDoFormulario } from '@/lib/erp/categorias';
import { deSeguro } from '@/lib/erp/insumo-campos';
import { TelaFormInsumo } from '@/components/erp/telas/insumos/paginas';
import { acaoEditarInsumo } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroEditarInsumoPage({ params, searchParams }: { params: { slug: string; id: string }; searchParams: { de?: string; origem?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'insumos.editar');
  const insumo = await obterInsumo(ctx.cliente, params.id, ctx.alcance);
  if (!insumo) notFound();
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/insumos`;
  // Pré-preparo (1.3) só muda pela ficha técnica.
  if (!insumo.ativo || insumo.preparo) redirect(`${base}/${insumo.id}`);
  const categorias = await categoriasDoFormulario(ctx.cliente, insumo.categoria?.id);
  // L.1: de onde a pessoa veio na lista (a caneta da linha manda `origem=lista`); só os filtros conhecidos passam.
  const de = deSeguro(searchParams.de);
  return (
    <TelaFormInsumo
      insumo={insumo}
      categorias={categorias}
      base={base}
      contexto={ctx.parceiro.nome}
      acao={acaoEditarInsumo.bind(null, ctx.parceiro.slug, insumo.id)}
      bloqueio={ctx.bloqueio}
      de={de}
      origemLista={searchParams.origem === 'lista'}
    />
  );
}
