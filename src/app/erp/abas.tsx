'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ABAS = [
  { href: '/erp', rotulo: 'Insumos' },
  { href: '/erp/acesso', rotulo: 'Seu acesso' },
];

/** Mesmo desenho das abas do nível 1: sublinhado vermelho na atual, rolagem em 390 px. */
export function AbasDoParceiro() {
  const atual = usePathname();
  return (
    <nav aria-label="Seções" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-6 border-b border-white/[0.08]">
        {ABAS.map((a) => (
          <li key={a.href}>
            <Link
              href={a.href}
              aria-current={atual === a.href ? 'page' : undefined}
              className="-mb-px block border-b-2 border-transparent pb-2.5 pt-1 text-[13px] text-surface/50 transition hover:text-surface aria-[current=page]:border-primary aria-[current=page]:font-semibold aria-[current=page]:text-surface"
            >
              {a.rotulo}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
