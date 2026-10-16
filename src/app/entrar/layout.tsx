import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import '@/components/erp/tokens.css';
import { COOKIE_TEMA, lerTema } from '@/lib/erp/tema';
import { Marca } from '@/components/erp/ui/Marca';

export const metadata: Metadata = {
  title: 'Entrar — FlowFoods ERP',
  robots: 'noindex, nofollow, noarchive',
  // O link de primeiro acesso leva o token no endereço: não vaza por Referer.
  referrer: 'no-referrer',
};

/**
 * Entrada das pessoas dos parceiros: tokens do ERP e o tema que a pessoa
 * escolheu no app (cookie `ff_tema`, "do aparelho" por padrão).
 */
export default function EntrarLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ff-app min-h-screen bg-fundo font-sans text-texto" data-tema={lerTema(cookies().get(COOKIE_TEMA)?.value)}>
      <div aria-hidden className="h-[3px] bg-acento" />
      <div className="mx-auto flex min-h-[calc(100vh-3px)] max-w-5xl flex-col px-4 sm:px-6">
        <header className="py-5">
          <Link href="/entrar" aria-label="FlowFoods ERP">
            <Marca rotulo="ERP" />
          </Link>
        </header>
        <main className="flex flex-1 items-start py-4 sm:items-center sm:py-10">{children}</main>
        <footer className="flex flex-wrap items-baseline justify-between gap-2 border-t border-linha py-5 text-[11px] text-suave">
          <span className="font-display italic">Gastronomia que flui. Negócio que cresce.</span>
          <Link href="/" className="transition hover:text-texto">
            consultoriaflowfoods.com.br
          </Link>
        </footer>
      </div>
    </div>
  );
}
