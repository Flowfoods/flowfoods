'use client';

import { useState, useEffect } from 'react';

const navLinks = [
  { label: 'Sobre',      href: '#sobre' },
  { label: 'Serviços',   href: '#servicos' },
  { label: 'Processo',   href: '#processo' },
  { label: 'Contato',    href: '#contato' },
  // Rota, nao ancora: e a unica entrada do funil que nao depende de rolar.
  { label: 'Diagnóstico', href: '/diagnostico' },
];

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/95 backdrop-blur-sm border-b border-surface-3 shadow-sm'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-6xl mx-auto px-5 md:px-8 lg:px-12">
        <div className="flex items-center justify-between h-16 md:h-20">

          {/* Logo */}
          <a href="#" className="flex flex-col leading-none">
            <span className={`font-display text-2xl md:text-3xl tracking-widest font-bold transition-colors duration-300 ${scrolled ? 'text-ink' : 'text-white'}`}>
              FLOW<span className="text-primary">FOODS</span>
            </span>
            <span className={`font-display italic text-[10px] tracking-wide transition-colors duration-300 hidden sm:block ${scrolled ? 'text-ink-5' : 'text-white/40'}`}>
              Gastronomia que flui. Negócio que cresce.
            </span>
          </a>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-7 lg:gap-9">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={`text-xs font-semibold uppercase tracking-widest hover:text-primary transition-colors duration-200 ${scrolled ? 'text-ink-4' : 'text-white/70'}`}
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Desktop CTA */}
          <a
            href="/diagnostico"
            className="hidden md:block bg-primary hover:bg-primary-dark text-white text-xs font-semibold px-5 py-2.5 uppercase tracking-widest transition-colors duration-200"
          >
            Diagnóstico gratuito
          </a>

          {/* Mobile Hamburger */}
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="md:hidden p-2 -mr-2"
            aria-label="Abrir menu"
          >
            <div className="space-y-1.5">
              <span className={`block w-6 h-0.5 transition-all duration-200 origin-center ${scrolled ? 'bg-ink' : 'bg-white'} ${menuOpen ? 'translate-y-2 rotate-45' : ''}`} />
              <span className={`block w-6 h-0.5 transition-all duration-200 ${scrolled ? 'bg-ink' : 'bg-white'} ${menuOpen ? 'opacity-0' : ''}`} />
              <span className={`block w-6 h-0.5 transition-all duration-200 origin-center ${scrolled ? 'bg-ink' : 'bg-white'} ${menuOpen ? '-translate-y-2 -rotate-45' : ''}`} />
            </div>
          </button>
        </div>
      </div>

      {/* Mobile Menu
          `max-h-0 overflow-hidden` esconde aos olhos, mas NÃO tira da ordem de
          tabulação nem da árvore de acessibilidade: com o menu fechado, quem
          navega por teclado focava links invisíveis, e um clique neles caía no
          Hero por baixo. `invisible` + `aria-hidden` resolvem os dois. */}
      <div
        aria-hidden={!menuOpen}
        className={`md:hidden overflow-hidden transition-all duration-300 bg-white border-t border-surface-3 ${menuOpen ? 'max-h-96 visible' : 'max-h-0 invisible'}`}
      >
        <nav className="flex flex-col px-5 py-6 gap-4">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="text-sm uppercase tracking-widest text-ink-4 hover:text-primary transition-colors py-1"
            >
              {link.label}
            </a>
          ))}
          <a
            href="/diagnostico"
            onClick={() => setMenuOpen(false)}
            className="mt-2 block bg-primary hover:bg-primary-dark text-white text-xs font-semibold px-5 py-3.5 uppercase tracking-widest text-center w-full transition-colors duration-200"
          >
            Diagnóstico gratuito
          </a>
        </nav>
      </div>
    </header>
  );
}
