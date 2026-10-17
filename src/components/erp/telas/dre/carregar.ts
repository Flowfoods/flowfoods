/**
 * Escolhe o que a tela do DRE mostra (2.2a), igual no nível 1 e na pessoa do
 * parceiro: o período da URL (`?periodo=aaaa-mm-dd`, qualquer dia dentro dele,
 * conferido) e o escopo — `?rede=1` (só com a rede inteira) ou `?loja=` (só se
 * estiver no alcance), senão a visão do topo. A URL e a visão só ESCOLHEM dentro
 * do alcance: nunca concedem (a regra em `dre.ts` confere de novo).
 */

import { hojeNoRio } from '@/lib/erp/compra-campos';
import { dreDoPeriodo, type DreDoPeriodo, type PedidoDoEscopo } from '@/lib/erp/dre';
import { lerPeriodoPedido } from '@/lib/erp/periodo-campos';
import type { Alcance } from '@/lib/erp/permissoes';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import type { Visao } from '@/lib/erp/visao';

type Query = Record<string, string | string[] | undefined>;
const um = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

export function escopoPedido(alcance: Alcance, visao: Visao, lojasDoAlcance: readonly { id: string }[], query: Query): PedidoDoEscopo | null {
  if (um(query.rede) === '1' && alcance.lojas === 'todas') return { tipo: 'rede' };
  const daUrl = um(query.loja);
  if (daUrl && lojasDoAlcance.some((l) => l.id === daUrl)) return { tipo: 'loja', lojaId: daUrl };
  if (visao.tipo === 'rede') return { tipo: 'rede' };
  if (visao.tipo === 'loja') return { tipo: 'loja', lojaId: visao.lojaId };
  return null;
}

export async function carregarDre(cliente: ClienteDoParceiro, alcance: Alcance, visao: Visao, lojasDoAlcance: readonly { id: string }[], query: Query): Promise<DreDoPeriodo | null> {
  const pedido = escopoPedido(alcance, visao, lojasDoAlcance, query);
  if (!pedido) return null;
  const hoje = hojeNoRio();
  const pedida = lerPeriodoPedido(um(query.periodo), hoje);
  const d = await dreDoPeriodo(cliente, alcance, pedido, pedida.data, hoje);
  return d && { ...d, avisoDaData: pedida.aviso };
}
