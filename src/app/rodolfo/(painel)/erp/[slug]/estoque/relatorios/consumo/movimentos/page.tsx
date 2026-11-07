/**
 * ERP, os movimentos de um número do consumo e conciliação (L.4) de um Parceiro Flow, pelo nível 1.
 */

import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { PaginaDosMovimentos } from '@/components/erp/telas/estoque/consumo-pagina';

export const dynamic = 'force-dynamic';

export default async function ParceiroMovimentosDoConsumoPage(
 props: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }
) {
 const searchParams = await props.searchParams;
 const params = await props.params;
 const ctx = await exigirParceiro(params.slug);
 exigirPermissao(ctx, 'estoque.ver');
 return <PaginaDosMovimentos ctx={ctx} bases={{ raiz: `/rodolfo/erp/${ctx.parceiro.slug}` }} searchParams={searchParams} />;
}
