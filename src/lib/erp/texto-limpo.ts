/**
 * Texto de uma linha digitada, limpo — puro, sem Node (serve ao navegador e ao servidor): quebra e
 * tabulação viram espaço; caracteres de controle (\p{Cc}) e de formato (\p{Cf}: zero-width, marcas
 * e isolantes bidi) somem; espaços repetidos viram um; aparado. Usado nos pedidos de acesso e nos
 * nomes e descrições do DRE (2.2a).
 */

/** Tamanho máximo lido de qualquer campo antes de limpar (o resto é lixo). */
const LEITURA_MAXIMA = 500;

/**
 * Texto de uma linha: quebra e tabulação viram espaço; caracteres de controle
 * (\p{Cc}) e de formato (\p{Cf}: zero-width, marcas e isolantes bidi) somem;
 * espaços repetidos viram um; aparado.
 */
export function limparTexto(bruto: unknown): string {
  if (typeof bruto !== 'string') return '';
  return bruto
    .slice(0, LEITURA_MAXIMA)
    .replace(/[\t\n\r\f\v\u2028\u2029]/g, ' ')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}
