/**
 * ERP do parceiro — comparação de fornecedores (L.3). A MESMA tela do nível 1. Ver exige "ver compras e notas" (por loja): sem a
 * permissão a pessoa vai para uma tela que pode; o servidor só lê as lojas do acesso.
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { PaginaDosFornecedores } from '@/components/erp/telas/compras/comparacao-pagina';

export const dynamic = 'force-dynamic';

const COMPRAS = '/erp/compras';

export default async function ErpComparacaoDeFornecedoresPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'compras.ver');
  return (
    <PaginaDosFornecedores
      ctx={ctx}
      caminho={`${COMPRAS}/relatorios/comparar-fornecedores`}
      comprasBase={COMPRAS}
      insumosBase={pode(ctx.alcance, 'insumos.ver') ? '/erp/insumos' : undefined}
      searchParams={searchParams}
    />
  );
}
