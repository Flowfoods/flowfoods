/**
 * ERP do parceiro — os movimentos que formam um número do consumo e conciliação (L.4). Ver exige "ver o estoque" (por loja).
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { PaginaDosMovimentos } from '@/components/erp/telas/estoque/consumo-pagina';

export const dynamic = 'force-dynamic';

export default async function ErpMovimentosDoConsumoPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'estoque.ver');
  return <PaginaDosMovimentos ctx={ctx} bases={{ raiz: '/erp' }} searchParams={searchParams} />;
}
