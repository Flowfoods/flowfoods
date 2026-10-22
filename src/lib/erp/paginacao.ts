/**
 * Paginação numerada de lista (L.1) — a parte PURA: quais números de página aparecem e a faixa "Mostrando 1–25 de 137".
 * Sem banco e sem Next, para ter teste com todos os cantos (0, 1, limite exato, limite mais um, última página).
 */

export type ItemDePagina = number | 'espaco';

/**
 * Os números da navegação compacta: sempre a primeira e a última página, a atual e uma de cada lado; no meio, "…" no lugar do
 * que ficou de fora (e quando só uma página ficaria escondida, ela própria aparece: "1 … 3" nunca esconde só a 2).
 * `atual` fora da faixa é ajustada. Nunca devolve página inexistente.
 */
export function paginasVisiveis(atual: number, paginas: number, vizinhos = 1): ItemDePagina[] {
  const total = Math.max(1, Math.trunc(paginas) || 1);
  const a = Math.min(Math.max(1, Math.trunc(atual) || 1), total);
  const conjunto = new Set<number>([1, total]);
  for (let p = a - vizinhos; p <= a + vizinhos; p++) if (p >= 1 && p <= total) conjunto.add(p);
  const ordenadas = [...conjunto].sort((x, y) => x - y);
  const saida: ItemDePagina[] = [];
  for (let i = 0; i < ordenadas.length; i++) {
    const p = ordenadas[i];
    const anterior = ordenadas[i - 1];
    if (anterior !== undefined) {
      if (p - anterior === 2) saida.push(anterior + 1);
      else if (p - anterior > 2) saida.push('espaco');
    }
    saida.push(p);
  }
  return saida;
}

/** A faixa mostrada: `de`–`ate` (ambos 0 quando não há resultado). `nLinhas` = quantas linhas a página tem de fato. */
export function faixaDaPagina(pagina: number, porPagina: number, nLinhas: number): { de: number; ate: number } {
  if (nLinhas <= 0) return { de: 0, ate: 0 };
  const de = (pagina - 1) * porPagina + 1;
  return { de, ate: de + nLinhas - 1 };
}
