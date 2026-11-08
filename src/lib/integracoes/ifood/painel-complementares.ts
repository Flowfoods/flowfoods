/** Ocorrências por horário/primeiro pedido na origem; não são clientes únicos. */
import type { CoberturaDoPainelAnalytics, MedidaAnalytics } from './painel-campos';
import { MAX_PARCELAS_DO_PAINEL } from './painel-campos';
import { inteiroExatoDoPainel, RecorteGrandeDoPainel } from './painel-resumo';

export interface OcorrenciaComplementar { termo: string; ocorrencias: string }
export interface DistribuicaoComplementarDoPainel {
  distribuicao: MedidaAnalytics<OcorrenciaComplementar[]>;
  total: MedidaAnalytics<string>;
}
export interface ComplementaresDoPainelAnalytics {
  cobertura: CoberturaDoPainelAnalytics;
  horarios: DistribuicaoComplementarDoPainel;
  primeirosPedidos: DistribuicaoComplementarDoPainel;
}

/** Só reconhece a representação canônica; "01", "24" e enums novos não viram outra hora. */
export function horaComplementarConhecida(termo: string): number | null {
  return /^(?:[0-9]|1[0-9]|2[0-3])$/.test(termo) ? Number(termo) : null;
}
function compararTermos(a: string, b: string, horario: boolean): number {
  if (horario) {
    const ha = horaComplementarConhecida(a), hb = horaComplementarConhecida(b);
    if (ha !== null && hb !== null) return ha - hb;
    if (ha !== null || hb !== null) return ha !== null ? -1 : 1;
  } else {
    const ordem = (v: string) => v === 'true' ? 0 : v === 'false' ? 1 : 2;
    const diferenca = ordem(a) - ordem(b);
    if (diferenca) return diferenca;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}
function resumir(
  cobertura: CoberturaDoPainelAnalytics, linhas: readonly OcorrenciaComplementar[], ausente: boolean, horario: boolean,
): DistribuicaoComplementarDoPainel {
  const motivo = cobertura.fontesSelecionadas === 0 ? 'sem-fontes'
    : !cobertura.completa ? 'cobertura-parcial' : ausente ? 'valor-nao-informado' : null;
  if (motivo) return { distribuicao: { estado: 'sem-dado', motivo }, total: { estado: 'sem-dado', motivo } };
  const termos = new Map<string, bigint>();
  for (const linha of linhas) {
    if (typeof linha.termo !== 'string' || !linha.termo.length) throw new Error('Termo complementar inválido no painel.');
    termos.set(linha.termo, (termos.get(linha.termo) ?? 0n) + inteiroExatoDoPainel(linha.ocorrencias, true));
    if (termos.size > MAX_PARCELAS_DO_PAINEL) throw new RecorteGrandeDoPainel();
  }
  const parcelas = [...termos].sort(([a], [b]) => compararTermos(a, b, horario));
  return {
    distribuicao: { estado: 'disponivel', valor: parcelas.map(([termo, n]) => ({ termo, ocorrencias: n.toString() })) },
    total: { estado: 'disponivel', valor: parcelas.reduce((n, [, q]) => n + q, 0n).toString() },
  };
}

export function resumirComplementaresDoPainel(
  cobertura: CoberturaDoPainelAnalytics,
  horarios: readonly OcorrenciaComplementar[], primeirosPedidos: readonly OcorrenciaComplementar[],
  ausentes: { horarios: boolean; primeirosPedidos: boolean },
): ComplementaresDoPainelAnalytics {
  return { cobertura,
    horarios: resumir(cobertura, horarios, ausentes.horarios, true),
    primeirosPedidos: resumir(cobertura, primeirosPedidos, ausentes.primeirosPedidos, false),
  };
}
