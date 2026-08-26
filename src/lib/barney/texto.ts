/**
 * Normalização de texto para casamento de regra.
 *
 * Usada por conflito de interesse e por opt-out. Nos dois casos, errar por
 * acento é errar feio: "açaí" que não casa com "acai" põe concorrente do
 * empregador na fila, e "não" que não casa com "nao" ignora um pedido de saída.
 */

/** minúsculas, sem acento, espaços colapsados. */
export function normalizar(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Igual a `normalizar`, mas também tira pontuação — para casar frase solta. */
export function normalizarFrase(s: string | null | undefined): string {
  return normalizar(s)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
