'use client';

import { useState } from 'react';
import { whatsappUrl } from '@/lib/constants';

const NAV = [
  { label: 'Frentes', href: '#frentes' },
  { label: 'Como funciona', href: '#como-funciona' },
  { label: 'Entregas', href: '#entregas' },
  { label: 'Rodolfo', href: '#sobre' },
  { label: 'Contato', href: '#contato' },
];

/**
 * Cabeçalho fixo, sempre creme, com o filete vermelho no topo: a assinatura
 * editorial da FlowFoods. O "Entrar" leva ao painel privado do Rodolfo — é
 * discreto de propósito: o cliente não precisa dele, mas o Rodolfo abre o
 * painel de qualquer aparelho sem decorar endereço.
 */
export default function Header() {
  const [aberto, setAberto] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-surface/95 backdrop-blur-sm">
      <div className="h-1 w-full bg-primary" aria-hidden />
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 md:h-[72px] md:px-8">
        <a href="#" className="font-display text-2xl font-bold leading-none tracking-tight text-ink">
          Flow<span className="text-primary">Foods</span>
        </a>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-[13px] font-medium text-ink-3 transition-colors hover:text-ink"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-5 md:flex">
          <a
            href="/rodolfo/login"
            className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-5 transition-colors hover:text-ink"
          >
            Entrar
          </a>
          <a
            href={whatsappUrl('hero')}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-ink px-5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-surface transition-colors hover:bg-primary"
          >
            Falar com o Rodolfo
          </a>
        </div>

        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          className="-mr-2 flex h-11 w-11 items-center justify-center md:hidden"
          aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={aberto}
        >
          <span className="relative block h-4 w-6">
            <span className={`absolute left-0 top-0 h-0.5 w-6 bg-ink transition-transform ${aberto ? 'translate-y-[7px] rotate-45' : ''}`} />
            <span className={`absolute left-0 top-[7px] h-0.5 w-6 bg-ink transition-opacity ${aberto ? 'opacity-0' : ''}`} />
            <span className={`absolute left-0 top-[14px] h-0.5 w-6 bg-ink transition-transform ${aberto ? '-translate-y-[7px] -rotate-45' : ''}`} />
          </span>
        </button>
      </div>

      <div
        aria-hidden={!aberto}
        className={`overflow-hidden border-t border-surface-3 bg-surface transition-all duration-300 md:hidden ${aberto ? 'visible max-h-[420px]' : 'invisible max-h-0'}`}
      >
        <nav className="flex flex-col gap-1 px-5 py-4">
          {NAV.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setAberto(false)}
              className="py-3 text-base font-medium text-ink-2"
            >
              {l.label}
            </a>
          ))}
          <a
            href={whatsappUrl('hero')}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setAberto(false)}
            className="mt-2 bg-ink px-5 py-3.5 text-center text-[12px] font-semibold uppercase tracking-[0.12em] text-surface"
          >
            Falar com o Rodolfo
          </a>
          <a
            href="/rodolfo/login"
            onClick={() => setAberto(false)}
            className="py-3 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-5"
          >
            Entrar
          </a>
        </nav>
      </div>
    </header>
  );
}
