/**
 * Peças visuais do ERP: Kairu Dark (command center — leitura densa, divisórias
 * finas, números tabulares, cards de 14 px, botões de 7 px) com a identidade
 * FlowFoods por cima: preto e creme, vermelho como ÚNICO acento, Gelasio nos
 * títulos e números grandes, Libre Franklin no resto. Sem gradiente, sem glow,
 * sem ícone decorativo — o dado é o desenho.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';

export function Painel({
  titulo,
  acessorio,
  children,
  className = '',
  semRespiro = false,
}: {
  titulo?: string;
  acessorio?: ReactNode;
  children: ReactNode;
  className?: string;
  semRespiro?: boolean;
}) {
  return (
    <section
      className={`min-w-0 rounded-[14px] border border-white/[0.09] border-t-white/[0.16] bg-[#131211] ${className}`}
    >
      {(titulo || acessorio) && (
        <header className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-3.5">
          {titulo && (
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-surface/55">
              {titulo}
            </h2>
          )}
          {acessorio}
        </header>
      )}
      <div className={semRespiro ? '' : 'p-5'}>{children}</div>
    </section>
  );
}

export function Trilha({ itens }: { itens: { href?: string; rotulo: string }[] }) {
  return (
    <nav aria-label="Caminho" className="flex flex-wrap items-center gap-2 text-[11px] text-surface/45">
      {itens.map((i, n) => (
        <span key={n} className="flex items-center gap-2">
          {n > 0 && <span aria-hidden className="text-surface/25">/</span>}
          {i.href ? (
            <Link href={i.href} className="transition hover:text-surface">
              {i.rotulo}
            </Link>
          ) : (
            <span className="text-surface/80">{i.rotulo}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function Cabecalho({
  rotulo,
  titulo,
  descricao,
  acessorio,
}: {
  rotulo: ReactNode;
  titulo: string;
  descricao?: string;
  acessorio?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-surface/50">
          {rotulo}
        </div>
        <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight sm:text-[32px]">
          {titulo}
        </h1>
        {descricao && <p className="mt-1.5 max-w-xl text-sm text-surface/55">{descricao}</p>}
      </div>
      {acessorio}
    </div>
  );
}

export function Ponto({ tom }: { tom: 'ativo' | 'rascunho' | 'suspenso' }) {
  const cor = { ativo: 'bg-success', rascunho: 'bg-warning', suspenso: 'bg-bright' }[tom];
  return <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${cor}`} />;
}

export function Metrica({ rotulo, valor, detalhe }: { rotulo: string; valor: ReactNode; detalhe?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-[14px] border border-white/[0.09] border-t-white/[0.16] bg-[#131211] px-4 py-4 sm:px-5">
      {/* Rótulo pode quebrar em 2 linhas no celular; o número fica sempre alinhado embaixo. */}
      <div className="text-[10px] font-semibold uppercase leading-snug tracking-[0.12em] text-surface/45 sm:tracking-[0.16em]">
        {rotulo}
      </div>
      <div className="mt-auto truncate pt-2 font-display text-[26px] font-bold leading-none lining-nums tabular-nums">
        {valor}
      </div>
      {detalhe && <div className="mt-1.5 truncate text-[11px] text-surface/45">{detalhe}</div>}
    </div>
  );
}

/**
 * Aviso de situação (parceiro suspenso, aguardando liberação). Card neutro com
 * o ponto de status: sem borda colorida, sem ícone.
 */
export function Aviso({ tom, titulo, children }: { tom: 'rascunho' | 'suspenso'; titulo: string; children: ReactNode }) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-[14px] border border-white/[0.09] bg-[#131211] px-5 py-3.5 text-sm"
    >
      <span className="flex h-5 shrink-0 items-center">
        <Ponto tom={tom} />
      </span>
      <p className="min-w-0 text-surface/70">
        <span className="font-semibold text-surface">{titulo}.</span> {children}
      </p>
    </div>
  );
}

/** Linha vazia de tabela/lista, com o próximo passo dito em uma frase. */
export function Vazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="px-5 py-12 text-center">
      <p className="font-display text-lg">{titulo}</p>
      {children && <p className="mt-1 text-sm text-surface/45">{children}</p>}
    </div>
  );
}
