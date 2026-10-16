'use client';

/**
 * Trilha do topo além do menu: a página diz o que vem depois de "Módulo ›
 * Tela" (o insumo aberto, "Editar", a embalagem). O shell mora no layout e não
 * sabe o nome do que a página leu; a página declara com `<TrilhaDaPagina>`.
 * Vale só para o caminho em que foi declarada (trocar de tela limpa).
 */

import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';

export interface ItemDaTrilha {
  rotulo: string;
  href?: string;
}

type Extra = { caminho: string; itens: ItemDaTrilha[] } | null;

const Contexto = createContext<{ extra: Extra; definir: (e: Extra) => void }>({ extra: null, definir: () => {} });

// Antes da pintura no navegador (sem piscar); no servidor não roda.
const useAntesDaPintura = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function ProvedorDaTrilha({ children }: { children: ReactNode }) {
  const [extra, definir] = useState<Extra>(null);
  return <Contexto.Provider value={{ extra, definir }}>{children}</Contexto.Provider>;
}

/** O que a página acrescenta à trilha neste caminho. */
export function useTrilhaExtra(): ItemDaTrilha[] {
  const { extra } = useContext(Contexto);
  const caminho = usePathname();
  return extra && extra.caminho === caminho ? extra.itens : [];
}

export function TrilhaDaPagina({ itens }: { itens: ItemDaTrilha[] }) {
  const { definir } = useContext(Contexto);
  const caminho = usePathname();
  const chave = JSON.stringify(itens);
  useAntesDaPintura(() => {
    definir({ caminho, itens: JSON.parse(chave) as ItemDaTrilha[] });
    return () => definir(null);
  }, [caminho, chave, definir]);
  return null;
}
