'use client';

/**
 * Diálogo nativo (`<dialog>` + `showModal`), o contrato do KitDialog do kit
 * Kairu: Escape fecha, clique no fundo fecha, o resto da página fica inerte
 * e o Tab não sai do diálogo (o navegador cuida), a rolagem do fundo trava
 * enquanto aberto e o foco VOLTA para quem abriu. `gaveta` = menu do celular,
 * à esquerda (`lado="direita"`: a gaveta de detalhes e da ajuda, à direita);
 * `sheet` = abaixo de 600 px vira folha presa embaixo, na largura disponível.
 *
 * Padrão aprovado em 09/11/2026 (regras em `tokens.css`): modal entra com
 * opacidade + 7 px + escala 0,98; gaveta, com 28 px de deslocamento lateral;
 * o fundo de bloqueio, só com opacidade; tudo em 220 ms. Fechar é imediato,
 * sem animação de saída. Abrir, animar e fechar não gravam nem enviam nada.
 */

import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
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
  lado = 'esquerda',
  focoNoTitulo = false,
  voltarPara,
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
  /** Só com `gaveta`: de que lado ela entra. */
  lado?: 'esquerda' | 'direita';
  /** Ao abrir, o foco vai ao título (leitor de tela lê onde está) em vez do primeiro botão. */
  focoNoTitulo?: boolean;
  /** Quem recebe o foco ao fechar (padrão: quem tinha o foco ao abrir). */
  voltarPara?: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;
  const foco = useRef({ focoNoTitulo, voltarPara });
  foco.current = { focoNoTitulo, voltarPara };

  useEffect(() => {
    if (!aberto) return;
    const el = ref.current;
    if (!el) return;
    const antes = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    if (!el.open) el.showModal();
    if (foco.current.focoNoTitulo) el.querySelector<HTMLElement>('[data-ff-titulo]')?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      if (el.open) el.close();
      document.body.style.overflow = overflow;
      const destino = foco.current.voltarPara;
      (destino?.current ?? antes)?.focus();
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
      className={`ff-dialogo ${gaveta ? `ff-gaveta ${lado === 'direita' ? 'ff-gaveta-direita' : ''}` : ''} ${sheet ? 'ff-sheet' : ''} ${className}`}
    >
      {aberto && (
        <div className="flex h-full flex-col">
          <header
            className={`flex items-center justify-between gap-3 border-b border-linha py-2 pl-5 pr-3 ${esconderTitulo ? 'sr-only' : ''}`}
          >
            <h2 data-ff-titulo tabIndex={-1} className="min-w-0 break-words font-display text-[20px] font-normal leading-tight tracking-[-0.01em] outline-none">
              {titulo}
            </h2>
            <button
              type="button"
              onClick={() => fechar.current()}
              aria-label="Fechar"
              className="ff-transicao inline-grid h-11 w-11 shrink-0 place-items-center rounded-botao text-suave hover:bg-texto/5 hover:text-texto"
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
