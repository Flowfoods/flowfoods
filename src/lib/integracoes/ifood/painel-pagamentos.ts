/** Distribuição marginal: ocorrências de métodos, nunca pedidos únicos ou dinheiro. */
import type { CoberturaDoPainelAnalytics, MedidaAnalytics } from './painel-campos';
import { MAX_PARCELAS_DO_PAINEL } from './painel-campos';
import { inteiroExatoDoPainel, RecorteGrandeDoPainel } from './painel-resumo';

export interface OcorrenciaDePagamento { metodo: string; ocorrencias: string }
export interface PagamentosDoPainelAnalytics {
  cobertura: CoberturaDoPainelAnalytics;
  distribuicao: MedidaAnalytics<OcorrenciaDePagamento[]>;
  total: MedidaAnalytics<string>;
}

export function resumirPagamentosDoPainel(
  cobertura: CoberturaDoPainelAnalytics, linhas: readonly OcorrenciaDePagamento[], valorAusente: boolean,
): PagamentosDoPainelAnalytics {
  const motivo = cobertura.fontesSelecionadas === 0 ? 'sem-fontes'
    : !cobertura.completa ? 'cobertura-parcial' : valorAusente ? 'valor-nao-informado' : null;
  if (motivo) return { cobertura, distribuicao: { estado: 'sem-dado', motivo }, total: { estado: 'sem-dado', motivo } };
  const porMetodo = new Map<string, bigint>();
  for (const linha of linhas) {
    if (typeof linha.metodo !== 'string' || !linha.metodo.length) throw new Error('Método marginal inválido no painel.');
    porMetodo.set(linha.metodo, (porMetodo.get(linha.metodo) ?? 0n) + inteiroExatoDoPainel(linha.ocorrencias, true));
    if (porMetodo.size > MAX_PARCELAS_DO_PAINEL) throw new RecorteGrandeDoPainel();
  }
  const parcelas = [...porMetodo].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return { cobertura,
    distribuicao: { estado: 'disponivel', valor: parcelas.map(([metodo, n]) => ({ metodo, ocorrencias: n.toString() })) },
    total: { estado: 'disponivel', valor: parcelas.reduce((n, [, q]) => n + q, 0n).toString() },
  };
}
