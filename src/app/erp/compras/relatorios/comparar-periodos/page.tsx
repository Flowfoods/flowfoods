/**
 * ERP do parceiro — comparação de períodos (L.3). A MESMA tela do nível 1. Ver exige "ver compras e notas" (por loja): sem a
 * permissão a pessoa vai para uma tela que pode; o servidor só lê as lojas do acesso.
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { PaginaDosPeriodos } from '@/components/erp/telas/compras/comparacao-pagina';

export const dynamic = 'force-dynamic';

const COMPRAS = '/erp/compras';

export default async function ErpComparacaoDePeriodosPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'compras.ver');
  return <PaginaDosPeriodos ctx={ctx} caminho={`${COMPRAS}/relatorios/comparar-periodos`} comprasBase={COMPRAS} searchParams={searchParams} />;
}
