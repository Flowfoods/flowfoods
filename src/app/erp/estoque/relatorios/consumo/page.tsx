/**
 * ERP do parceiro — consumo e conciliação de estoque (L.4). A MESMA tela do nível 1. Ver exige "ver o estoque" (por loja): sem a
 * permissão a pessoa vai para uma tela que pode; o servidor só lê as lojas do acesso.
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { PaginaDoConsumo } from '@/components/erp/telas/estoque/consumo-pagina';

export const dynamic = 'force-dynamic';

export default async function ErpConsumoDoEstoquePage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'estoque.ver');
  return <PaginaDoConsumo ctx={ctx} bases={{ raiz: '/erp' }} searchParams={searchParams} />;
}
