'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** A chegada pelo botão de continuar anuncia e foca o bloco de preços. */
export function EtapaPrecos({ children, referencia }: { children: ReactNode; referencia: string }) {
  const painel = useRef<HTMLElement>(null);
  useEffect(() => {
    const { pathname, search, hash } = window.location;
    const continuar = new URLSearchParams(search).get('etapa') === 'precos';
    if (!continuar && hash !== '#preco-por-canal') return;
    if (continuar && hash !== '#preco-por-canal') {
      window.history.replaceState(window.history.state, '', `${pathname}${search}#preco-por-canal`);
    }
    painel.current?.focus();
  }, [referencia]);
  return (
    <section ref={painel} id="preco-por-canal" tabIndex={-1} aria-label="Preço e CMV por canal" className="order-4 scroll-mt-24 outline-none sm:order-3">
      {children}
    </section>
  );
}
