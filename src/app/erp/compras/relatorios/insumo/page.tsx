/**
 * ERP do parceiro — relatório de compras (L.2): histórico de um insumo. A MESMA tela do nível 1. Ver exige
 * "ver compras e notas" (por loja): sem a permissão a pessoa vai para uma tela que pode; o servidor só lê as lojas do acesso.
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { PaginaDoRelatorio } from '@/components/erp/telas/compras/relatorio-pagina';

export const dynamic = 'force-dynamic';

const COMPRAS = '/erp/compras';

export default async function ErpRelatorioPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'compras.ver');
  return (
    <PaginaDoRelatorio
      ctx={ctx}
      modo="insumo"
      caminho={`${COMPRAS}/relatorios/insumo`}
      comprasBase={COMPRAS}
      insumosBase={pode(ctx.alcance, 'insumos.ver') ? '/erp/insumos' : undefined}
      searchParams={searchParams}
    />
  );
}
