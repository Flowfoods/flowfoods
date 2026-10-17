'use client';

/**
 * Link que abre a gaveta de ajuda da tela, já na seção certa (0.6). Substitui
 * a antiga caixa recolhível de cada tela (um `<details>` solto): a explicação mora no
 * registro de ajuda (`ajuda-textos.ts`), num lugar só, e a tela só aponta para
 * ela. Fora do shell (sem gaveta), não desenha nada.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { LINK_DE_TEXTO } from './estilos';

interface Contexto {
  /** Abre a gaveta da tela atual, rolando até a seção (se houver). */
  abrir: (secao?: string, origem?: HTMLElement | null) => void;
  /** A tela atual tem ajuda e o shell sabe abri-la. */
  disponivel: boolean;
}

export const ContextoDaAjuda = createContext<Contexto>({ abrir: () => {}, disponivel: false });

export function useAjuda() {
  return useContext(ContextoDaAjuda);
}

export function LinkDeAjuda({ secao, children, className = '' }: { secao?: string; children: ReactNode; className?: string }) {
  const { abrir, disponivel } = useAjuda();
  // Sem JavaScript o botão não abriria nada: nasce escondido e aparece depois de montar.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  if (!disponivel) return null;
  return (
    <button type="button" hidden={!montado} style={montado ? undefined : { display: 'none' }} aria-haspopup="dialog" onClick={(e) => abrir(secao, e.currentTarget)} className={`${LINK_DE_TEXTO} min-h-11 text-left sm:min-h-8 ${className}`}>
      {children}
    </button>
  );
}
