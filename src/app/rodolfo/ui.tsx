/**
 * Peças visuais do Espaço do Rodolfo.
 *
 * Paleta e tipografia do site institucional (`tailwind.config.ts`), sobre chão
 * preto: é área privada e precisa se distinguir do site público num relance —
 * abrir o admin achando que é o site é como se erra de janela.
 */

import type { ReactNode } from 'react';

export function Cartao({
  titulo,
  acessorio,
  children,
  className = '',
}: {
  titulo?: string;
  acessorio?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5 ${className}`}
    >
      {(titulo || acessorio) && (
        <header className="mb-3 flex items-baseline justify-between gap-3">
          {titulo && (
            <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-surface/55">
              {titulo}
            </h2>
          )}
          {acessorio}
        </header>
      )}
      {children}
    </section>
  );
}

export function Numero({
  valor,
  rotulo,
  detalhe,
}: {
  valor: ReactNode;
  rotulo: string;
  detalhe?: string;
}) {
  return (
    <div>
      <div className="font-display text-3xl font-bold leading-none tabular-nums">{valor}</div>
      <div className="mt-1.5 text-[11px] font-medium uppercase tracking-wider text-surface/50">
        {rotulo}
      </div>
      {detalhe && <div className="mt-0.5 text-xs text-surface/60">{detalhe}</div>}
    </div>
  );
}

type Tom = 'ok' | 'alerta' | 'erro' | 'neutro';

const TONS: Record<Tom, string> = {
  // Verde/âmbar/vermelho só no selo, nunca como fundo de bloco inteiro: o
  // vermelho da marca é o único acento forte e perde força se virar preenchimento.
  ok: 'border-success/40 bg-success/10 text-success',
  alerta: 'border-warning/40 bg-warning/10 text-warning',
  erro: 'border-bright/40 bg-bright/10 text-bright',
  neutro: 'border-white/15 bg-white/5 text-surface/70',
};

export function Selo({ tom = 'neutro', children }: { tom?: Tom; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${TONS[tom]}`}
    >
      {children}
    </span>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-surface/50">{children}</p>;
}

/** Barra de progresso. `valor`/`total` em unidades absolutas. */
export function Barra({ valor, total, tom = 'ok' }: { valor: number; total: number; tom?: Tom }) {
  const pct = total > 0 ? Math.min(100, Math.round((valor / total) * 100)) : 0;
  const cor = { ok: 'bg-success', alerta: 'bg-warning', erro: 'bg-bright', neutro: 'bg-surface/40' }[
    tom
  ];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div className={`h-full rounded-full ${cor}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
