/**
 * ERP, comparação de períodos (L.3) de um Parceiro Flow, pelo nível 1. A MESMA tela da pessoa do parceiro; tudo passa pelo cliente
 * de `exigirParceiro` (portão + RLS).
 */

import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { PaginaDosPeriodos } from '@/components/erp/telas/compras/comparacao-pagina';

export const dynamic = 'force-dynamic';

export default async function ParceiroComparacaoDePeriodosPage(
 props: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }
) {
 const searchParams = await props.searchParams;
 const params = await props.params;
 const ctx = await exigirParceiro(params.slug);
 exigirPermissao(ctx, 'compras.ver');
 const raiz = `/rodolfo/erp/${ctx.parceiro.slug}`;
 return <PaginaDosPeriodos ctx={ctx} caminho={`${raiz}/compras/relatorios/comparar-periodos`} comprasBase={`${raiz}/compras`} searchParams={searchParams} />;
}
