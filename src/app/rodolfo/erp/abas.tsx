'use client';

/**
 * Navegação do espaço do parceiro. Sublinhado vermelho na aba atual (o único
 * acento); rola na horizontal em 390 px em vez de quebrar.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Abas({ slug }: { slug: string }) {
  const atual = usePathname();
  const base = `/rodolfo/erp/${slug}`;
  const abas = [
    { href: base, rotulo: 'Insumos' },
    { href: `${base}/estrutura`, rotulo: 'Lojas e marcas' },
    { href: `${base}/acessos`, rotulo: 'Acessos' },
    { href: `${base}/historico`, rotulo: 'Histórico' },
    { href: `${base}/cadastro`, rotulo: 'Cadastro' },
  ];
  return (
    <nav aria-label="Seções do parceiro" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-6 border-b border-white/[0.08]">
        {abas.map((a) => {
          const ativa = atual === a.href;
          return (
            <li key={a.href}>
              <Link
                href={a.href}
                aria-current={ativa ? 'page' : undefined}
                className="-mb-px block border-b-2 border-transparent pb-2.5 pt-1 text-[13px] text-surface/50 transition hover:text-surface aria-[current=page]:border-primary aria-[current=page]:font-semibold aria-[current=page]:text-surface"
              >
                {a.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
