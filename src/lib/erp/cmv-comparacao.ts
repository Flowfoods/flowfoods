/**
 * Compra × real (2.3, decisão 166) — a comparação que o dono lê no fechamento, pura.
 *
 * diferença = real − compra = (estoque inicial − estoque final) + (entradas do livro − notas lançadas).
 * O estoque que SOBE (diferença negativa) é compra que não virou consumo: dinheiro parado na prateleira.
 */

import { percentualDaReceita, textoDosPontos } from './dre-campos';
import { fraseDaComparacao, type CmvDoDre, type ComparacaoDaLoja } from './cmv-campos';
import { formatarDinheiro } from './unidades';

/** A comparação compra × real das lojas que têm o real apurado. */
export function compararCmv(cmv: CmvDoDre, receitaDaLoja: (lojaId: string) => number): ComparacaoDaLoja[] {
  const out: ComparacaoDaLoja[] = [];
  for (const l of cmv.lojas) {
    if (!l.real) continue;
    const compra = l.compraCentavos ?? 0;
    const diferenca = l.real.centavos - compra;
    const notasNaAbertura = compra - l.real.comprasReaisCentavos;
    out.push({
      lojaId: l.lojaId,
      lojaNome: l.lojaNome,
      compraCentavos: l.compraCentavos,
      realCentavos: l.real.centavos,
      diferencaCentavos: diferenca,
      diferencaBp: percentualDaReceita(diferenca, receitaDaLoja(l.lojaId)),
      inicialCentavos: l.real.inicialCentavos,
      finalCentavos: l.real.finalCentavos,
      notasNaAberturaCentavos: notasNaAbertura,
      frase: fraseDaComparacao({ inicialCentavos: l.real.inicialCentavos, finalCentavos: l.real.finalCentavos, notasNaAberturaCentavos: notasNaAbertura }),
      semPrecoInicial: l.real.semPrecoInicial,
      semPrecoFinal: l.real.semPrecoFinal,
    });
  }
  return out.sort((a, b) => a.lojaNome.localeCompare(b.lojaNome, 'pt-BR'));
}

/** Soma de várias lojas na mesma conta (a linha da rede do painel). */
export function somarComparacoes(cs: readonly ComparacaoDaLoja[], receitaCentavos: number): Omit<ComparacaoDaLoja, 'lojaId' | 'lojaNome' | 'semPrecoInicial' | 'semPrecoFinal'> {
  const soma = (f: (c: ComparacaoDaLoja) => number) => cs.reduce((s, c) => s + f(c), 0);
  const compra = soma((c) => c.compraCentavos ?? 0);
  const real = soma((c) => c.realCentavos);
  const inicial = soma((c) => c.inicialCentavos);
  const final = soma((c) => c.finalCentavos);
  const notas = soma((c) => c.notasNaAberturaCentavos);
  return {
    compraCentavos: cs.some((c) => c.compraCentavos !== null) ? compra : null,
    realCentavos: real,
    diferencaCentavos: real - compra,
    diferencaBp: percentualDaReceita(real - compra, receitaCentavos),
    inicialCentavos: inicial,
    finalCentavos: final,
    notasNaAberturaCentavos: notas,
    frase: fraseDaComparacao({ inicialCentavos: inicial, finalCentavos: final, notasNaAberturaCentavos: notas }),
  };
}

/** "−R$ 1.850,00 · −1,5 pp" */
export function textoDaDiferenca(centavos: number, bp: number | null): string {
  const v = `${centavos < 0 ? '−' : centavos > 0 ? '+' : ''}${formatarDinheiro(Math.abs(centavos))}`;
  return bp === null ? v : `${v} · ${textoDosPontos(bp)}`;
}


// ================================================================ o painel "compra × real"

export interface LojaSemReal {
  lojaId: string;
  lojaNome: string;
  motivo: string;
  compraCentavos: number | null;
}

export interface PainelDoCmv {
  /** Cada loja com o real apurado: compra, real, diferença e a frase. */
  comparacoes: ComparacaoDaLoja[];
  /** A soma das lojas comparadas, quando são duas ou mais. */
  total: ReturnType<typeof somarComparacoes> | null;
  /** As lojas que venderam ou compraram e ficaram só pelas compras, com o motivo. */
  semReal: LojaSemReal[];
}

/** O painel de um período ENCERRADO. Loja parada (sem venda, sem nota e sem real) não aparece. */
export function painelDoCmv(cmv: CmvDoDre, receitaDaLoja: (lojaId: string) => number): PainelDoCmv {
  const comparacoes = compararCmv(cmv, receitaDaLoja);
  const semReal: LojaSemReal[] = cmv.lojas
    .filter((l) => !l.real && (receitaDaLoja(l.lojaId) > 0 || l.compraCentavos !== null))
    .map((l) => ({ lojaId: l.lojaId, lojaNome: l.lojaNome, motivo: l.motivoSemReal ?? 'não apurado', compraCentavos: l.compraCentavos }))
    .sort((a, b) => a.lojaNome.localeCompare(b.lojaNome, 'pt-BR'));
  const total = comparacoes.length > 1 ? somarComparacoes(comparacoes, comparacoes.reduce((s, c) => s + receitaDaLoja(c.lojaId), 0)) : null;
  return { comparacoes, total, semReal };
}
