/**
 * ERP, relatório de compras (L.2) de um Parceiro Flow, pelo nível 1: histórico de um insumo. A MESMA tela da pessoa do parceiro; tudo passa
 * pelo cliente de `exigirParceiro` (portão + RLS).
 */

import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { PaginaDoRelatorio } from '@/components/erp/telas/compras/relatorio-pagina';

export const dynamic = 'force-dynamic';

export default async function ParceiroRelatorioPage({ params, searchParams }: { params: { slug: string }; searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'compras.ver');
  const raiz = `/rodolfo/erp/${ctx.parceiro.slug}`;
  return (
    <PaginaDoRelatorio
      ctx={ctx}
      modo="insumo"
      caminho={`${raiz}/compras/relatorios/insumo`}
      comprasBase={`${raiz}/compras`}
      insumosBase={`${raiz}/insumos`}
      searchParams={searchParams}
    />
  );
}
