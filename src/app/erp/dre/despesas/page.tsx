/**
 * ERP do parceiro — Despesas (2.2a): a lista do mês e as contas a pagar. Ver
 * exige "ver DRE e CMV" OU "lançar despesas" (o administrativo lança sem abrir o
 * DRE). Só as lojas do acesso; a despesa da rede, só com a rede inteira.
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode, visaoDaRequisicao } from '@/lib/erp/contexto';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { PaginaDasDespesas } from '@/components/erp/telas/dre/paginas';

export const dynamic = 'force-dynamic';

export default async function ErpDespesasPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiroDaSessao();
  if (!pode(ctx.alcance, 'dre.ver')) exigirPermissaoNaPagina(ctx, 'despesas.lancar');
  const { visao, lojas } = await visaoDaRequisicao(ctx);
  return <PaginaDasDespesas c={{ cliente: ctx.cliente, alcance: ctx.alcance, bloqueio: ctx.bloqueio, contexto: rotuloDaVisao(visao), raiz: '/erp' }} lojasDoAlcance={lojas.map((l) => ({ id: l.id, nome: l.nome }))} query={searchParams} />;
}
