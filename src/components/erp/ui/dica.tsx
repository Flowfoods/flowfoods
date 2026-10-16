/**
 * Dica (1.10): a explicação longa sai do corpo da tela e fica atrás de um botão
 * de ajuda. É um `<details>` nativo: abre com clique, Enter ou Espaço, funciona
 * sem JavaScript, e o leitor de tela anuncia "recolhido/expandido". O botão
 * tem 32 px de área (no celular, 44) e nome acessível; o texto abre embaixo,
 * no fluxo (nada flutua por cima de número).
 */

import { CircleHelp } from 'lucide-react';
import type { ReactNode } from 'react';

export function Dica({ rotulo, children, className = '' }: { rotulo: string; children: ReactNode; className?: string }) {
  return (
    <details className={`group ${className}`}>
      <summary
        className="ff-transicao inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-[7px] px-1 text-[12px] font-medium text-suave hover:text-texto sm:min-h-8 [&::-webkit-details-marker]:hidden"
      >
        <CircleHelp size={16} aria-hidden />
        <span>{rotulo}</span>
      </summary>
      <div className="mt-1 max-w-prose space-y-1.5 text-[12px] leading-relaxed text-suave">{children}</div>
    </details>
  );
}
