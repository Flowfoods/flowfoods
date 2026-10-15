/**
 * Slug (endereço na URL) a partir de um nome. Puro e sem dependência: o
 * formulário no navegador usa a mesma função que o servidor confere.
 */

/** "Valentin's Burger — Penha" → "valentins-burger-penha". */
export function gerarSlug(texto: string, max = 48): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

export const SLUG_VALIDO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
