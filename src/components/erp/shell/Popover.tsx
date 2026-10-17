'use client';

/**
 * Painel que abre de um botão (seletor de módulo, visão, notificações, menu
 * do usuário). Botão real com `aria-expanded`/`aria-controls`; Escape fecha e
 * devolve o foco ao botão; clique fora fecha; trocar de tela fecha.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

export function Popover({
  rotulo,
  conteudoDoBotao,
  classeDoBotao,
  children,
  alinhar = 'direita',
  largura = 'w-72',
  acima = false,
  classeDoWrapper = '',
}: {
  /** Nome acessível do botão. */
  rotulo: string;
  conteudoDoBotao: ReactNode;
  classeDoBotao: string;
  children: (fechar: () => void) => ReactNode;
  alinhar?: 'esquerda' | 'direita';
  largura?: string;
  acima?: boolean;
  /** Para o wrapper encolher na barra estreita (o seletor de visão cede espaço aos botões-ícone). */
  classeDoWrapper?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const id = useId();
  const caminho = usePathname();

  useEffect(() => setAberto(false), [caminho]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAberto(false);
        botao.current?.focus();
      }
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto]);

  return (
    <div ref={caixa} className={`relative ${classeDoWrapper}`}>
      <button
        ref={botao}
        type="button"
        aria-label={rotulo}
        aria-expanded={aberto}
        aria-controls={id}
        onClick={() => setAberto((v) => !v)}
        className={classeDoBotao}
      >
        {conteudoDoBotao}
      </button>
      {aberto && (
        <div
          id={id}
          className={`absolute z-40 ${acima ? 'bottom-full mb-2' : 'top-full mt-2'} ${
            alinhar === 'direita' ? 'right-0' : 'left-0'
          } ${largura} max-w-[calc(100vw-24px)] rounded-[14px] border border-linha-forte bg-painel p-1.5 shadow-[var(--ff-sombra)]`}
        >
          {children(() => {
            setAberto(false);
            botao.current?.focus();
          })}
        </div>
      )}
    </div>
  );
}

/** Classe do botão-ícone da barra superior (44 px de alvo). */
export const BOTAO_ICONE =
  'ff-transicao relative inline-grid h-11 w-11 shrink-0 place-items-center rounded-[7px] text-suave hover:bg-texto/5 hover:text-texto aria-expanded:bg-texto/5 aria-expanded:text-texto';
