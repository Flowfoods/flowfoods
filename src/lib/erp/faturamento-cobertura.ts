/**
 * Decisão 538: quantos lançamentos formam cada número do mês, para a tela do
 * Faturamento separar "sem lançamento" de "zero declarado" (Não vendeu) e de
 * "não vende". Só leitura do mês já carregado: o dado, a soma e a falta não
 * mudam.
 *
 * Um lançamento é um canal num dia, humano ou da integração. "Não vendeu"
 * conta: é zero declarado, não ausência.
 */

import type { LojaNoMes, MesDoFaturamento } from './faturamento';
import { CANAIS_EM_ORDEM, type CanalVenda } from './faturamento-campos';

export interface CoberturaDoRecorte {
  /** Lançamentos (canal × dia) de cada canal no mês. */
  porCanal: Record<CanalVenda, number>;
  /** Soma dos lançamentos de todos os canais. */
  total: number;
  /** A loja vende o canal (na rede: alguma loja ATIVA do recorte vende). */
  vende: Record<CanalVenda, boolean>;
}

/** Como a tela mostra o número de um canal: o valor (inclusive zero declarado), "sem lançamento" ou "não vende". */
export type EstadoDoCanal = 'valor' | 'sem-lancamento' | 'nao-vende';

const porCanal = <T>(f: (c: CanalVenda) => T): Record<CanalVenda, T> =>
  Object.fromEntries(CANAIS_EM_ORDEM.map((c) => [c, f(c)])) as Record<CanalVenda, T>;

const somar = (n: Record<CanalVenda, number>) => CANAIS_EM_ORDEM.reduce((s, c) => s + n[c], 0);

export function coberturaDaLoja(l: LojaNoMes): CoberturaDoRecorte {
  const lancamentos = porCanal((c) => l.dias.reduce((s, d) => s + (d.canais[c] ? 1 : 0), 0));
  return { porCanal: lancamentos, total: somar(lancamentos), vende: porCanal((c) => l.loja.canais.includes(c)) };
}

/** Na rede, "vende" é de alguma loja ATIVA: canal que só uma loja desativada vendia é "não vende" na soma. */
export function coberturaDaRede(m: MesDoFaturamento): CoberturaDoRecorte {
  const lojas = m.lojas.map((l) => ({ ativa: l.loja.ativa, c: coberturaDaLoja(l) }));
  const lancamentos = porCanal((c) => lojas.reduce((s, l) => s + l.c.porCanal[c], 0));
  return { porCanal: lancamentos, total: somar(lancamentos), vende: porCanal((c) => lojas.some((l) => l.ativa && l.c.vende[c])) };
}

/** Havendo lançamento, vale o número (zero declarado mostra R$ 0,00). Sem nenhum, "não vende" ou "sem lançamento". */
export function estadoDoCanal(c: CanalVenda, cobertura: CoberturaDoRecorte): EstadoDoCanal {
  if (cobertura.porCanal[c] > 0) return 'valor';
  return cobertura.vende[c] ? 'sem-lancamento' : 'nao-vende';
}

/** A frase da parcialidade junto do total ("Parcial · 1 lançamento faltando"); sem falta, nada. */
export function fraseDeParcial(faltas: number): string | null {
  if (faltas <= 0) return null;
  return `Parcial · ${faltas.toLocaleString('pt-BR')} ${faltas === 1 ? 'lançamento faltando' : 'lançamentos faltando'}`;
}
