'use client';

/**
 * F5 — sinal de que a tela está carregando: ao abrir um link interno ou enviar um filtro (formulário GET), um filete
 * no topo aparece se a troca passar de 150 ms (troca rápida não pisca nada: sem espera artificial) e some quando a
 * tela nova chega. Não diz "salvo" nem "salvando": é só navegação. O leitor de tela ouve "Carregando…".
 */

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const ATRASO_MS = 150;
const TETO_MS = 20_000;

function ehNavegacaoInterna(e: MouseEvent): boolean {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!a || a.target === '_blank' || a.hasAttribute('download')) return false;
  const destino = new URL(a.href, window.location.href);
  if (destino.origin !== window.location.origin) return false;
  // Âncora na mesma página ou o mesmo endereço: nada carrega.
  return destino.pathname + destino.search !== window.location.pathname + window.location.search;
}

export function IndicadorDeNavegacao() {
  const caminho = usePathname();
  const busca = useSearchParams();
  const [visivel, setVisivel] = useState(false);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const teto = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parar = () => {
    if (espera.current) clearTimeout(espera.current);
    if (teto.current) clearTimeout(teto.current);
    espera.current = teto.current = null;
    setVisivel(false);
  };

  useEffect(() => {
    const comecar = () => {
      parar();
      espera.current = setTimeout(() => setVisivel(true), ATRASO_MS);
      teto.current = setTimeout(parar, TETO_MS);
    };
    const clique = (e: MouseEvent) => ehNavegacaoInterna(e) && comecar();
    const envio = (e: SubmitEvent) => {
      const f = e.target as HTMLFormElement;
      // Só o formulário de busca/filtro (GET): o que grava (server action) já tem o "Salvando…" do botão.
      if (!e.defaultPrevented && f.method.toLowerCase() === 'get') comecar();
    };
    document.addEventListener('click', clique, true);
    document.addEventListener('submit', envio);
    return () => {
      document.removeEventListener('click', clique, true);
      document.removeEventListener('submit', envio);
    };
  }, []);

  // A tela nova chegou (endereço mudou): some.
  useEffect(() => parar(), [caminho, busca]);

  return (
    <>
      <div
        aria-hidden
        className={`pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px] origin-left bg-acao transition-opacity duration-150 ${visivel ? 'ff-carregando opacity-100' : 'opacity-0'}`}
      />
      <span className="sr-only" role="status" aria-live="polite">
        {visivel ? 'Carregando…' : ''}
      </span>
    </>
  );
}
