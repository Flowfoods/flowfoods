/**
 * O farol (2.4) — as 5 faixas, PURAS (sem banco e sem Next).
 *
 * Decisões 172 a 174. O farol responde uma pergunta só: "quanto este número está longe da meta, e para qual lado?".
 * As faixas são FIXAS no código e iguais para todo parceiro (uma régua só, que a consultoria compara entre clientes);
 * `FAIXAS_DO_FAROL` é a versão 1 e está congelada (teste de retrato): mudar um limite é a versão 2, e uma fotografia
 * de fechamento guarda a versão com que foi lida. A tabela `FarolFaixa` (limites por parceiro) continua sem uso.
 *
 * `s` é o desvio JÁ com o sentido da linha: positivo é sempre "melhor". Lê-se de cima para baixo, a primeira faixa que casar.
 * Os limites são em pontos percentuais ABSOLUTOS (não relativos à meta): 1 ponto da receita é o mesmo dinheiro em qualquer linha.
 * Duas escalas: custo, margem e resultado (pontos da receita bruta) e receita (pontos de crescimento sobre o ano passado).
 */

import type { SentidoDaLinha } from './dre-plano';

export const VERSAO_DAS_FAIXAS = 1;

export type CorDoFarol = 'AZUL' | 'VERDE' | 'AMARELO' | 'LARANJA' | 'VERMELHO';

/** Azul à esquerda, vermelho à direita: a POSIÇÃO diz a faixa mesmo em escala de cinza. */
export const CORES_DO_FAROL: readonly CorDoFarol[] = ['AZUL', 'VERDE', 'AMARELO', 'LARANJA', 'VERMELHO'];

export type EscalaDoFarol = 'custo' | 'receita';

/** O menor `s` (em pontos-base) de cada faixa; o vermelho é tudo o que fica abaixo do laranja. */
type Limites = Readonly<Record<Exclude<CorDoFarol, 'VERMELHO'>, number>>;

const congelar = <T extends object>(o: T): Readonly<T> => Object.freeze(o);

export const FAIXAS_DO_FAROL = congelar({
  versao: VERSAO_DAS_FAIXAS,
  escalas: congelar({
    custo: congelar({ AZUL: 300, VERDE: -50, AMARELO: -150, LARANJA: -300 }) as Limites,
    receita: congelar({ AZUL: 500, VERDE: -100, AMARELO: -300, LARANJA: -600 }) as Limites,
  }),
  palavras: congelar({
    AZUL: 'bem melhor que a meta',
    VERDE: 'na meta',
    AMARELO: 'um pouco pior',
    LARANJA: 'pior que a meta',
    VERMELHO: 'muito pior que a meta',
  } satisfies Record<CorDoFarol, string>),
});

/** Num custo, azul pode ser sinal de lançamento esquecido: a faixa avisa. */
export const FRASE_CONFIRA = 'confira se está tudo lançado';

/** As faixas de cada versão: a fotografia guarda a versão com que foi lida, e o fechado lê com ela (não com a de hoje). Só existe a 1. */
export type FaixasDoFarol = typeof FAIXAS_DO_FAROL;
const FAIXAS_POR_VERSAO: Readonly<Record<number, FaixasDoFarol>> = { 1: FAIXAS_DO_FAROL };
/** As faixas da versão pedida; nulo = versão que este código não conhece (o farol fica sem cor e diz isso). */
export const faixasDaVersao = (versao: number): FaixasDoFarol | null => FAIXAS_POR_VERSAO[versao] ?? null;

export interface FaixaDoDesvio {
  cor: CorDoFarol;
  /** 1 (azul) a 5 (vermelho): a casa que a régua enche. */
  posicao: 1 | 2 | 3 | 4 | 5;
  palavra: string;
  /** Só no azul de uma linha em que menos é melhor. */
  confira: string | null;
}

export const posicaoDaCor = (cor: CorDoFarol): 1 | 2 | 3 | 4 | 5 => (CORES_DO_FAROL.indexOf(cor) + 1) as 1 | 2 | 3 | 4 | 5;

/**
 * A faixa de um desvio (realizado menos meta, em pontos-base) numa escala. `sentido` diz para que lado o desvio é bom:
 * em MENOR_MELHOR, desvio negativo (gastou menos que a meta) é o lado bom.
 */
export function faixaDoDesvio(sentido: SentidoDaLinha, desvioBp: number, escala: EscalaDoFarol, faixas: FaixasDoFarol = FAIXAS_DO_FAROL): FaixaDoDesvio {
  const s = sentido === 'MAIOR_MELHOR' ? desvioBp : -desvioBp;
  const limites = faixas.escalas[escala];
  const cor: CorDoFarol = s >= limites.AZUL ? 'AZUL' : s >= limites.VERDE ? 'VERDE' : s >= limites.AMARELO ? 'AMARELO' : s >= limites.LARANJA ? 'LARANJA' : 'VERMELHO';
  return { cor, posicao: posicaoDaCor(cor), palavra: faixas.palavras[cor], confira: cor === 'AZUL' && sentido === 'MENOR_MELHOR' ? FRASE_CONFIRA : null };
}

/** A palavra com que o leitor de tela lê o farol: a faixa, o desvio e a casa da régua. */
export function rotuloDoFarol(f: { palavra: string; posicao: number; confira?: string | null }, desvioTexto: string): string {
  return `Farol: ${f.palavra}${f.confira ? `, ${f.confira}` : ''}, ${desvioTexto}, faixa ${f.posicao} de 5`;
}
