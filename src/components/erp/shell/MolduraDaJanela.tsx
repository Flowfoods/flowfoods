'use client';

/**
 * Janela de módulo (UX-MOD-2, piloto do nível 1): a moldura do espaço `@janela` no layout do parceiro. Ela enxerga as duas
 * partes da página — a de trás (o espaço principal) e a janela — e decide quando a janela NÃO abre:
 * - a página de trás já é uma das telas da janela (a tela inteira, aberta por link direto, recarga ou endereço antigo):
 *   seguir para outra tela da área, ou para a mesma com filtro, carrega a tela inteira do destino; a janela por cima da
 *   própria tela repetiria a tela, com os mesmos ids atrás e na frente;
 * - o destino é uma tela da janela de outro parceiro: carrega a tela inteira (a interceptação guardaria o parceiro de trás).
 * Links são tratados antes de navegar, sem piscar. Uma navegação sem link (a busca) que chegue assim não mostra a janela e
 * recarrega o endereço.
 *
 * Também diz à janela qual é a página de trás: Fechar volta o histórico até ela e, se o histórico não chegar lá, vai para ela.
 */

import { usePathname, useSelectedLayoutSegments } from 'next/navigation';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { caminhoDoFundo, destinoViraTelaInteira, telaAbertaNaJanela, telaDaJanela } from '@/lib/erp/janela';

interface Moldura {
  /** `/rodolfo/erp/<slug>`. */
  base: string;
  /** O caminho da página de trás. */
  fundo: string;
}

const ContextoDaMoldura = createContext<Moldura | null>(null);

export function useMolduraDaJanela(): Moldura | null {
  return useContext(ContextoDaMoldura);
}

/** O destino de um clique num link interno (botão principal, sem tecla modificadora, na mesma aba); `null` nos outros. */
export function destinoDoClique(e: Pick<MouseEvent, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'target'>): URL | null {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = (e.target as Element | null)?.closest?.('a[href]');
  if (!(a instanceof HTMLAnchorElement)) return null;
  if ((a.target && a.target !== '_self') || a.hasAttribute('download')) return null;
  const href = a.getAttribute('href') ?? '';
  if (href.startsWith('#')) return null;
  let destino: URL;
  try {
    destino = new URL(href, window.location.href);
  } catch {
    return null;
  }
  if (destino.origin !== window.location.origin || !['http:', 'https:'].includes(destino.protocol)) return null;
  return destino;
}

export function MolduraDaJanela({ base, children }: { base: string; children: ReactNode }) {
  const fundo = useSelectedLayoutSegments() ?? [];
  const janela = useSelectedLayoutSegments('janela') ?? [];
  const caminho = usePathname() ?? '';
  const tela = telaAbertaNaJanela(janela);
  const chaveDoFundo = fundo.join('/');

  // Links: antes de navegar, a carga inteira do destino (o Next não intercepta uma carga de documento).
  useEffect(() => {
    const segmentos = chaveDoFundo ? chaveDoFundo.split('/') : [];
    const aoClicar = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      const destino = destinoDoClique(e);
      if (!destino || !destinoViraTelaInteira(destino.pathname, base, segmentos)) return;
      e.preventDefault();
      e.stopPropagation();
      window.location.assign(destino.href);
    };
    document.addEventListener('click', aoClicar, true);
    return () => document.removeEventListener('click', aoClicar, true);
  }, [base, chaveDoFundo]);

  // Sem link (a busca, por exemplo): a janela chegou onde não devia. Não aparece; o endereço recarrega como tela inteira.
  // Só quando o endereço já é o da tela aberta: enquanto ele não chega, nada acontece.
  const vira = tela !== null && telaDaJanela(caminho)?.tela === tela && destinoViraTelaInteira(caminho, base, fundo);
  useEffect(() => {
    if (vira && telaDaJanela(window.location.pathname)?.tela === tela) window.location.replace(window.location.href);
  }, [vira, tela]);

  const fundoDaPagina = caminhoDoFundo(base, fundo);
  const valor = useMemo(() => ({ base, fundo: fundoDaPagina }), [base, fundoDaPagina]);
  if (vira) return null;
  return <ContextoDaMoldura.Provider value={valor}>{children}</ContextoDaMoldura.Provider>;
}
