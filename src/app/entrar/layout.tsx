import type { Metadata } from 'next';
import Link from 'next/link';
import { MarcaErp } from './marca';

export const metadata: Metadata = {
  title: 'Entrar — FlowFoods ERP',
  robots: 'noindex, nofollow, noarchive',
  // O link de primeiro acesso leva o token no endereço: não vaza por Referer.
  referrer: 'no-referrer',
};

export default function EntrarLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-footer text-surface">
      <div aria-hidden className="h-[3px] bg-primary" />
      <div className="mx-auto flex min-h-[calc(100vh-3px)] max-w-5xl flex-col px-4 sm:px-6">
        <header className="py-5">
          <Link href="/entrar" aria-label="FlowFoods ERP">
            <MarcaErp />
          </Link>
        </header>
        <main className="flex flex-1 items-start py-4 sm:items-center sm:py-10">{children}</main>
        <footer className="flex flex-wrap items-baseline justify-between gap-2 border-t border-white/[0.07] py-5 text-[11px] text-surface/35">
          <span className="font-display italic">Gastronomia que flui. Negócio que cresce.</span>
          <Link href="/" className="transition hover:text-surface/70">
            consultoriaflowfoods.com.br
          </Link>
        </footer>
      </div>
    </div>
  );
}
