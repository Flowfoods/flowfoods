/**
 * ERP, consumo e conciliação de estoque (L.4) de um Parceiro Flow, pelo nível 1. A MESMA tela da pessoa do parceiro; tudo passa pelo
 * cliente de `exigirParceiro` (portão + RLS).
 */

import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { PaginaDoConsumo } from '@/components/erp/telas/estoque/consumo-pagina';

export const dynamic = 'force-dynamic';

export default async function ParceiroConsumoDoEstoquePage(
 props: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }
) {
 const searchParams = await props.searchParams;
 const params = await props.params;
 const ctx = await exigirParceiro(params.slug);
 exigirPermissao(ctx, 'estoque.ver');
 return <PaginaDoConsumo ctx={ctx} bases={{ raiz: `/rodolfo/erp/${ctx.parceiro.slug}` }} searchParams={searchParams} />;
}
