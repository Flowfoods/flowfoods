'use client';

/**
 * Diálogo nativo (`<dialog>` + `showModal`), o contrato do KitDialog do kit
 * Kairu: Escape fecha, clique no fundo fecha, o resto da página fica inerte
 * (o navegador cuida), a rolagem do fundo trava enquanto aberto e o foco
 * VOLTA para quem abriu. `gaveta` = menu do celular, à esquerda; `sheet` =
 * abaixo de 600 px vira folha presa embaixo.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Dialogo({
  aberto,
  aoFechar,
  titulo,
  children,
  gaveta = false,
  sheet = false,
  className = '',
  esconderTitulo = false,
  id,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  children: ReactNode;
  gaveta?: boolean;
  sheet?: boolean;
  className?: string;
  /** O título fica só para leitor de tela (a busca tem o campo como cabeça). */
  esconderTitulo?: boolean;
  id?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;

  useEffect(() => {
    if (!aberto) return;
    const el = ref.current;
    if (!el) return;
    const antes = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    if (!el.open) el.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      if (el.open) el.close();
      document.body.style.overflow = overflow;
      antes?.focus();
    };
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      id={id}
      aria-label={titulo}
      onCancel={(e) => {
        e.preventDefault();
        fechar.current();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) fechar.current();
      }}
      className={`ff-dialogo ${gaveta ? 'ff-gaveta' : 'rounded-[14px]'} ${sheet ? 'ff-sheet' : ''} ${className}`}
    >
      {aberto && (
        <div className="flex h-full flex-col">
          <header
            className={`flex items-center justify-between gap-3 border-b border-linha px-4 py-2 ${esconderTitulo ? 'sr-only' : ''}`}
          >
            <h2 className="text-[15px] font-semibold">{titulo}</h2>
            <button
              type="button"
              onClick={() => fechar.current()}
              aria-label="Fechar"
              className="ff-transicao inline-grid h-11 w-11 place-items-center rounded-[7px] text-suave hover:bg-texto/5 hover:text-texto"
            >
              <X size={18} aria-hidden />
            </button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}
