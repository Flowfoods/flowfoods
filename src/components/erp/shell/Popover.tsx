'use client';

/**
 * Painel que abre de um botão (seletor de módulo, visão, notificações, menu
 * do usuário). Botão real com `aria-expanded`/`aria-controls`; Escape fecha e
 * devolve o foco ao botão; clique fora fecha; trocar de tela fecha.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Onde abre o painel fixo (decisão 475): 8 px abaixo do botão, alinhado à esquerda dele, sem passar das bordas da tela
 * (12 px de folga). `larguraPx` é a largura do painel.
 */
export function posicaoDoPainelFixo(botao: { left: number; bottom: number }, larguraPx: number, telaPx: number): { top: number; left: number } {
  const maximo = Math.max(12, telaPx - larguraPx - 12);
  return { top: botao.bottom + 8, left: Math.min(Math.max(12, botao.left), maximo) };
}

export function Popover({
  rotulo,
  conteudoDoBotao,
  classeDoBotao,
  children,
  alinhar = 'direita',
  largura = 'w-72',
  acima = false,
  classeDoWrapper = '',
  fixo = false,
  larguraFixaPx = 256,
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
  /**
   * O painel abre em posição fixa, logo abaixo do botão (decisão 475): para quando o botão mora numa caixa que recorta o que
   * passa da largura (a trilha do topo), e o painel absoluto seria cortado.
   */
  fixo?: boolean;
  /** Largura do painel fixo em px (a mesma de `largura`), para não passar da borda direita. */
  larguraFixaPx?: number;
}) {
  const [aberto, setAberto] = useState(false);
  const [posicao, setPosicao] = useState<{ top: number; left: number } | null>(null);
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
    // Painel fixo: a posição foi medida ao abrir; mudar a largura da janela (ou girar o tablet) o desalinharia, então fecha. Só a
    // largura: no celular, a barra do navegador que some ao rolar muda a altura e não deve fechar o painel.
    let larguraDaJanela = window.innerWidth;
    const redimensionou = () => {
      if (fixo && window.innerWidth !== larguraDaJanela) setAberto(false);
      larguraDaJanela = window.innerWidth;
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla);
    window.addEventListener('resize', redimensionou);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', tecla);
      window.removeEventListener('resize', redimensionou);
    };
  }, [aberto, fixo]);

  return (
    <div ref={caixa} className={`relative ${classeDoWrapper}`}>
      <button
        ref={botao}
        type="button"
        aria-label={rotulo}
        aria-expanded={aberto}
        aria-controls={id}
        onClick={() => {
          if (fixo && botao.current) setPosicao(posicaoDoPainelFixo(botao.current.getBoundingClientRect(), larguraFixaPx, window.innerWidth));
          setAberto((v) => !v);
        }}
        className={classeDoBotao}
      >
        {conteudoDoBotao}
      </button>
      {aberto && (
        <div
          id={id}
          style={fixo && posicao ? { top: posicao.top, left: posicao.left } : undefined}
          className={`${fixo ? 'fixed' : `absolute ${acima ? 'bottom-full mb-2' : 'top-full mt-2'} ${alinhar === 'direita' ? 'right-0' : 'left-0'}`} z-40 ${largura} max-w-[calc(100vw-24px)] rounded-[14px] border border-linha-forte bg-painel p-1.5 shadow-[var(--ff-sombra)]`}
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
