'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Mesmo desenho das abas do nível 1: sublinhado vermelho na atual, rolagem em
 * 390 px. As abas vêm do servidor, já filtradas pelo que a pessoa pode
 * (`telasPermitidas`); a página confere de novo.
 */
export function AbasDoParceiro({ abas }: { abas: { href: string; rotulo: string }[] }) {
  const atual = usePathname();
  return (
    <nav aria-label="Seções" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-6 border-b border-white/[0.08]">
        {abas.map((a) => (
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

/** Quem tentou abrir uma tela fora do acesso chega aqui com `?sem-acesso=1`. */
export function AvisoSemAcesso() {
  const sem = useSearchParams().get('sem-acesso');
  if (!sem) return null;
  return (
    <p
      role="status"
      className="rounded-[14px] border border-white/[0.09] bg-[#131211] px-5 py-3.5 text-sm text-surface/70"
    >
      <span className="font-semibold text-surface">Essa tela não está no seu acesso.</span> Se precisar dela, fale com
      quem cuida da equipe.
    </p>
  );
}
