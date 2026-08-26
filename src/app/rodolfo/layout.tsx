import type { Metadata } from 'next';
import Link from 'next/link';
import { LogoutButton } from './logout-button';

export const metadata: Metadata = {
  title: 'Espaço do Rodolfo — FlowFoods',
  // Área privada não entra em buscador, nem por acidente.
  robots: 'noindex, nofollow, noarchive',
};

const NAV = [
  { href: '/rodolfo', rotulo: 'Hoje' },
  { href: '/rodolfo/leads', rotulo: 'Leads' },
  { href: '/rodolfo/barney', rotulo: 'Barney' },
  { href: '/rodolfo/inbox', rotulo: 'Inbox' },
  { href: '/rodolfo/visitas', rotulo: 'Visitas' },
  { href: '/rodolfo/metricas', rotulo: 'Métricas' },
  { href: '/rodolfo/config', rotulo: 'Config' },
];

export default function RodolfoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-footer text-surface">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-footer/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/rodolfo" className="font-display text-lg font-bold tracking-tight">
            Flow<span className="text-bright">Foods</span>
            <span className="ml-2 align-middle font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-surface/50">
              Barney
            </span>
          </Link>
          <LogoutButton />
        </div>

        {/* Rolagem horizontal em vez de quebra: em 360px cabem ~3 itens, e o
            que sai da tela continua alcançável com o polegar. */}
        <nav className="mx-auto max-w-5xl overflow-x-auto px-4">
          <ul className="flex gap-1 pb-2">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block whitespace-nowrap rounded-lg px-3 py-2 text-sm text-surface/70 transition hover:bg-white/10 hover:text-surface"
                >
                  {item.rotulo}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
