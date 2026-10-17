/**
 * Escolhe o que a tela do mês mostra (2.1), igual no nível 1 e na pessoa do
 * parceiro: o mês da URL (`?mes=aaaa-mm`, conferido), e a loja do calendário —
 * `?loja=` (só se estiver no alcance), senão a loja do seletor do topo; a rede
 * (soma das lojas) para quem tem a rede inteira e escolheu "Rede Completa" ou
 * `?rede=1`. A visão e a URL só ESCOLHEM dentro do alcance: nunca concedem.
 */

import { lerMes } from '@/lib/erp/faturamento-campos';
import { obterMes, type LojaNoMes, type MesDoFaturamento } from '@/lib/erp/faturamento';
import type { Alcance } from '@/lib/erp/permissoes';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import type { Visao } from '@/lib/erp/visao';

type Query = Record<string, string | string[] | undefined>;
const um = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

export async function carregarDoMes(cliente: ClienteDoParceiro, alcance: Alcance, visao: Visao, query: Query): Promise<{ m: MesDoFaturamento; lojaAberta?: LojaNoMes }> {
  const m = await obterMes(cliente, alcance, { mes: lerMes(um(query.mes)) });
  const querRede = um(query.rede) === '1' && alcance.lojas === 'todas';
  if (querRede) return { m };
  const daUrl = um(query.loja);
  const id = daUrl && m.lojas.some((l) => l.loja.id === daUrl) ? daUrl : visao.tipo === 'loja' ? visao.lojaId : undefined;
  const lojaAberta = id ? m.lojas.find((l) => l.loja.id === id) : m.lojas.length === 1 ? m.lojas[0] : undefined;
  return { m, lojaAberta };
}
