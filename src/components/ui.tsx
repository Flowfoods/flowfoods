import type { ReactNode } from 'react';

/** Peças do site institucional: etiqueta em caixa alta, seção com respiro, cartão claro com borda fina. */

export function Etiqueta({ children, escura = false }: { children: ReactNode; escura?: boolean }) {
  return (
    <p
      className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${escura ? 'text-primary' : 'text-primary'}`}
    >
      {children}
    </p>
  );
}

export function Secao({
  id,
  className = '',
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`scroll-mt-20 px-5 py-16 md:px-8 md:py-24 ${className}`}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

export function Cartao({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`border border-ink/10 bg-papel p-6 md:p-7 ${className}`}>{children}</div>;
}

export function Titulo({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={`mt-4 font-display text-3xl font-bold leading-tight text-ink [text-wrap:balance] md:text-4xl ${className}`}
    >
      {children}
    </h2>
  );
}
