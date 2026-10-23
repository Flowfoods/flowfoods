/**
 * ERP, comparação de fornecedores (L.3) de um Parceiro Flow, pelo nível 1. A MESMA tela da pessoa do parceiro; tudo passa pelo
 * cliente de `exigirParceiro` (portão + RLS).
 */

import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { PaginaDosFornecedores } from '@/components/erp/telas/compras/comparacao-pagina';

export const dynamic = 'force-dynamic';

export default async function ParceiroComparacaoDeFornecedoresPage({ params, searchParams }: { params: { slug: string }; searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'compras.ver');
  const raiz = `/rodolfo/erp/${ctx.parceiro.slug}`;
  return <PaginaDosFornecedores ctx={ctx} caminho={`${raiz}/compras/relatorios/comparar-fornecedores`} comprasBase={`${raiz}/compras`} insumosBase={`${raiz}/insumos`} searchParams={searchParams} />;
}
