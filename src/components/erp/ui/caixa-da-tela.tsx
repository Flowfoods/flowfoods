'use client';

/**
 * Lugar da caixa "Como funciona" (0.6) na tela: logo abaixo do título da
 * página, antes da busca e dos filtros. O shell monta a caixa (ele conhece a
 * rota e a preferência da pessoa) e o `PageHeader` a desenha aqui — o título
 * vem primeiro, a aula depois. Fora do shell, não desenha nada.
 */

import { createContext, useContext, type ReactNode } from 'react';

export const ContextoDaCaixa = createContext<ReactNode>(null);

export function CaixaDaTela() {
  return <>{useContext(ContextoDaCaixa)}</>;
}
