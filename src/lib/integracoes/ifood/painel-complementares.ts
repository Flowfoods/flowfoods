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

/** Reconhece o índice documentado e as horas cheias HH:00 observadas no iFood. */
export function horaComplementarConhecida(termo: string): number | null {
  if (/^(?:[0-9]|1[0-9]|2[0-3])$/.test(termo)) return Number(termo);
  if (/^(?:[01][0-9]|2[0-3]):00$/.test(termo)) return Number(termo.slice(0, 2));
  return null;
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
    const hora = horario ? horaComplementarConhecida(linha.termo) : null;
    const termo = hora === null ? linha.termo : String(hora);
    termos.set(termo, (termos.get(termo) ?? 0n) + inteiroExatoDoPainel(linha.ocorrencias, true));
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
