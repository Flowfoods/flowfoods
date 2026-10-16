/**
 * Tema do shell do ERP (/erp e /rodolfo): claro, escuro ou o do aparelho.
 * Puro (sem Next): o layout do shell lê o cookie e põe `data-tema` no wrapper
 * `.ff-app`; "sistema" resolve no CSS (`prefers-color-scheme`), sem JS e sem
 * flash. O layout RAIZ nunca lê este cookie: o site institucional continua
 * estático.
 */

export type Tema = 'claro' | 'escuro' | 'sistema';

export const COOKIE_TEMA = 'ff_tema';
export const TEMAS: readonly Tema[] = ['claro', 'escuro', 'sistema'];
export const ROTULO_DO_TEMA: Record<Tema, string> = { claro: 'Claro', escuro: 'Escuro', sistema: 'Do aparelho' };

/** Valor do cookie → tema. Qualquer coisa fora da lista vira "sistema". */
export function lerTema(valor: string | undefined | null): Tema {
  return TEMAS.includes(valor as Tema) ? (valor as Tema) : 'sistema';
}

/** Menu lateral recolhido no desktop (escolha da pessoa, cookie `ff_menu`). */
export const COOKIE_MENU = 'ff_menu';

export function lerMenuRecolhido(valor: string | undefined | null): boolean {
  return valor === 'recolhido';
}

/** Um ano: é preferência de quem usa, não sessão. */
export const VALIDADE_DA_PREFERENCIA_S = 60 * 60 * 24 * 365;
