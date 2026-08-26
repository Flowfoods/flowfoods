/**
 * Contabilidade de custo da IA e o teto diário.
 *
 * Tudo puro: recebe uso, tabela de preço, câmbio e a data — nunca lê relógio
 * nem `process.env`. É o que permite testar "estourou o orçamento" sem esperar
 * o dia virar.
 */

export interface UsoDeTokens {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

export interface PrecoPorMTok {
  /** USD por milhão de tokens de entrada. */
  input: number;
  /** USD por milhão de tokens de saída. */
  output: number;
}

/**
 * Preço do Claude Sonnet 5 conferido na doc da API, não de memória.
 *
 * O preço promocional de lançamento vale ATÉ 2026-08-31; depois disso volta ao
 * cheio. Por isso a data é parâmetro: uma tabela fixa passaria a subfaturar em
 * setembro sem ninguém perceber, e o teto diário viraria ficção.
 */
export const PRECO_SONNET_5_INTRO: PrecoPorMTok = { input: 2.0, output: 10.0 };
export const PRECO_SONNET_5_CHEIO: PrecoPorMTok = { input: 3.0, output: 15.0 };
export const FIM_DO_PRECO_INTRO = "2026-08-31";

/** `dataISO` no formato `AAAA-MM-DD`. Comparação lexicográfica basta nesse formato. */
export function precoSonnet5(dataISO: string): PrecoPorMTok {
  return dataISO <= FIM_DO_PRECO_INTRO ? PRECO_SONNET_5_INTRO : PRECO_SONNET_5_CHEIO;
}

/**
 * Custo em reais de uma geração.
 *
 * Tokens lidos de cache custam ~0,1x e os escritos ~1,25x o preço de entrada.
 * Hoje o pré-diagnóstico não usa cache (cada lead é um prompt diferente), mas a
 * conta já contempla: no dia em que o system prompt virar prefixo cacheado, o
 * número não passa a mentir.
 */
export function custoEmBRL(
  uso: UsoDeTokens,
  preco: PrecoPorMTok,
  cambioUsdBrl: number,
): number {
  const entradaCheia = uso.inputTokens;
  const entradaCache = (uso.cacheReadInputTokens ?? 0) * 0.1;
  const entradaEscrita = (uso.cacheCreationInputTokens ?? 0) * 1.25;

  const usd =
    ((entradaCheia + entradaCache + entradaEscrita) / 1_000_000) * preco.input +
    (uso.outputTokens / 1_000_000) * preco.output;

  return usd * cambioUsdBrl;
}

export interface EstadoDoOrcamento {
  /** Teto do dia em reais. `null` = sem `AI_DAILY_BUDGET_BRL` configurado. */
  tetoBRL: number | null;
  gastoHojeBRL: number;
}

export interface DecisaoDeOrcamento {
  pode: boolean;
  /** Texto pronto para a tela do Rodolfo. Vazio quando `pode` é `true`. */
  aviso: string;
  restanteBRL: number | null;
}

/**
 * Decide se ainda dá para gerar hoje.
 *
 * Estourar o teto DESABILITA o botão com aviso — nunca vira erro. A diferença
 * importa: erro na cara do Rodolfo no meio de um lead quente parece bug do
 * sistema; aviso é uma decisão de custo que ele entende e contorna.
 */
export function podeGerar(estado: EstadoDoOrcamento): DecisaoDeOrcamento {
  if (estado.tetoBRL === null) {
    return { pode: true, aviso: "", restanteBRL: null };
  }
  const restante = estado.tetoBRL - estado.gastoHojeBRL;
  if (restante <= 0) {
    return {
      pode: false,
      aviso:
        "O orçamento de IA de hoje acabou. O pré-diagnóstico volta amanhã — o motor e a leitura continuam funcionando normalmente.",
      restanteBRL: 0,
    };
  }
  return { pode: true, aviso: "", restanteBRL: restante };
}
