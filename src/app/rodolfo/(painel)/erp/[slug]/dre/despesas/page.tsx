/**
 * ERP, Despesas de um Parceiro Flow, pelo nível 1. A MESMA tela da pessoa do
 * parceiro; tudo passa pelo cliente de `exigirParceiro` (portão + RLS).
 */

import { exigirParceiro, exigirPermissao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { PaginaDasDespesas } from '@/components/erp/telas/dre/paginas';

export const dynamic = 'force-dynamic';

export default async function ParceiroDespesasPage({ params, searchParams }: { params: { slug: string }; searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'dre.ver');
  const { visao, lojas } = await visaoDaRequisicao(ctx);
  const raiz = `/rodolfo/erp/${ctx.parceiro.slug}`;
  return <PaginaDasDespesas c={{ cliente: ctx.cliente, alcance: ctx.alcance, bloqueio: ctx.bloqueio, contexto: `${ctx.parceiro.nome} · ${rotuloDaVisao(visao)}`, parceiro: ctx.parceiro.nome, raiz }} lojasDoAlcance={lojas.map((l) => ({ id: l.id, nome: l.nome }))} query={searchParams} />;
}
