/**
 * Login e definição de senha do nível 1: fora do shell (sem sessão ainda), com
 * os tokens do ERP e o tema escolhido no app (cookie `ff_tema`; sem cookie,
 * o do aparelho).
 */

import Link from 'next/link';
import { cookies } from 'next/headers';
import { COOKIE_TEMA, lerTema } from '@/lib/erp/tema';
import '@/components/erp/tokens.css';
import { Marca } from '@/components/erp/ui/Marca';

export default function AcessoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ff-app bg-fundo font-sans" data-tema={lerTema(cookies().get(COOKIE_TEMA)?.value)}>
      <div aria-hidden className="h-[3px] bg-acento" />
      <div className="mx-auto max-w-5xl px-4">
        <header className="py-4">
          <Link href="/rodolfo" aria-label="Espaço do Rodolfo — início" className="rounded-[5px]">
            <Marca rotulo="Barney" />
          </Link>
        </header>
        <main className="py-6">{children}</main>
      </div>
    </div>
  );
}
