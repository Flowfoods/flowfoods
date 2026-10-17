/**
 * O que a casa diz quando uma escrita cai num período FECHADO (2.2b), em UM lugar só: a frase que o
 * servidor devolve, a saída que ela aponta (só a FlowFoods reabre) e a leitura dessa frase de volta na
 * tela, para o aviso de período fechado (`AvisoDoPeriodoFechado`) saber qual período é. Puro, sem
 * banco e sem Node: serve ao servidor e ao formulário.
 */

/** "Para mexer em Setembro de 2026, peça à FlowFoods para reabrir o período." */
export const saidaDoPeriodoFechado = (nome: string) => `Para mexer em ${nome}, peça à FlowFoods para reabrir o período.`;

/** A recusa de qualquer escrita (faturamento, despesa, nota) que cai num período fechado: o que não dá e o que fazer. */
export const fraseDoPeriodoFechado = (nome: string) => `O período ${nome} já foi fechado no DRE: não dá para lançar, corrigir nem remover nele. ${saidaDoPeriodoFechado(nome)}`;

/** O nome do período que a frase de recusa cita; null se o texto não é essa recusa (nem a do estoque). */
export function periodoDaFraseDeRecusa(texto: string | null | undefined): string | null {
  const m = /^O período (.+?) já foi fechado no DRE[:.]/.exec(texto ?? '');
  return m ? m[1] : null;
}

/** Um período fechado como a tela o recebe: datas "aaaa-mm-dd" inclusivas. */
export interface PeriodoFechadoParaAviso {
  nome: string;
  inicio: string;
  fim: string;
}

/** O período fechado que contém a data (aaaa-mm-dd), se houver. */
export const fechadoNaData = (fechados: readonly PeriodoFechadoParaAviso[], data: string): PeriodoFechadoParaAviso | null =>
  fechados.find((p) => p.inicio <= data && data <= p.fim) ?? null;

/** O primeiro período fechado que encosta no intervalo [de, ate] (datas inclusivas). */
export const fechadoNoIntervalo = (fechados: readonly PeriodoFechadoParaAviso[], de: string, ate: string): PeriodoFechadoParaAviso | null =>
  [...fechados].sort((a, b) => a.inicio.localeCompare(b.inicio)).find((p) => p.inicio <= ate && de <= p.fim) ?? null;

/** Os períodos que a tela precisa saber para avisar antes de a pessoa preencher. */
export interface AvisoDePeriodos {
  fechados: PeriodoFechadoParaAviso[];
  /** O nome do período de agora (aberto), para "lance com competência em …". */
  emCurso: string | null;
  /** Para onde vai o link "Períodos"; null quando a pessoa não abre essa tela. */
  href: string | null;
}
