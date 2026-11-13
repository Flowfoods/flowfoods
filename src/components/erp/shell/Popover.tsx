'use client';

/**
 * Painel que abre de um botão (seletor de módulo, visão, notificações, menu
 * do usuário). Botão real com `aria-expanded`/`aria-controls`; Escape fecha e
 * devolve o foco ao botão; clique ou toque fora fecha; o foco que sai pelo Tab
 * fecha, sem ser puxado de volta (o painel não fica aberto por cima de onde o
 * foco foi parar); trocar de tela fecha.
 *
 * Padrão aprovado em 09/11/2026: nasce do acionador (opacidade + 7 px + escala
 * 0,98, 220 ms) e fecha na hora, sem animação de saída. Fica sempre dentro da
 * tela: se o painel ancorado passaria da borda, ele desliza para caber; o
 * botão não se move. Abrir e fechar não consultam nem gravam nada.
 */

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Onde abre o painel fixo (decisão 475): 8 px abaixo do botão, alinhado à esquerda dele, sem passar das bordas da tela
 * (12 px de folga). `larguraPx` é a largura do painel.
 */
export function posicaoDoPainelFixo(botao: { left: number; bottom: number }, larguraPx: number, telaPx: number): { top: number; left: number } {
  const maximo = Math.max(12, telaPx - larguraPx - 12);
  return { top: botao.bottom + 8, left: Math.min(Math.max(12, botao.left), maximo) };
}

/**
 * Quanto o painel ANCORADO precisa deslizar na horizontal para caber na tela, com 12 px de folga. `esquerda` e `direita` são
 * as bordas do painel na posição natural (alinhado ao botão). Tela mais estreita que o painel: encosta na folga da esquerda.
 */
export function ajusteParaCaber(painel: { esquerda: number; direita: number }, telaPx: number): number {
  if (painel.esquerda < 12) return 12 - painel.esquerda;
  const recuo = Math.min(painel.direita - (telaPx - 12), painel.esquerda - 12);
  return recuo > 0 ? -recuo : 0;
}

/** O foco foi para um elemento fora da caixa do popover (e não para lugar nenhum). */
export function foraDaCaixa(caixa: { contains: (n: Node | null) => boolean }, destino: EventTarget | null): boolean {
  return destino !== null && !caixa.contains(destino as Node);
}

/** No servidor não há layout para medir: o efeito de antes da pintura só existe no navegador. */
const useAntesDaPintura = typeof window === 'undefined' ? useEffect : useLayoutEffect;

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
  const [ajuste, setAjuste] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  const id = useId();
  const caminho = usePathname();

  useEffect(() => setAberto(false), [caminho]);

  // Painel ancorado: mede a posição natural (pela caixa do botão e pela largura do painel, que a animação não muda) e
  // desliza o que faltar para caber. Antes da pintura: o painel já aparece no lugar.
  useAntesDaPintura(() => {
    if (!aberto || fixo) return;
    const medir = () => {
      const c = caixa.current?.getBoundingClientRect();
      const largura = painel.current?.offsetWidth;
      if (!c || !largura) return;
      const esquerda = alinhar === 'direita' ? c.right - largura : c.left;
      setAjuste(ajusteParaCaber({ esquerda, direita: esquerda + largura }, document.documentElement.clientWidth));
    };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [aberto, fixo, alinhar]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
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
    // pointerdown cobre mouse, dedo e caneta no mesmo instante (o mousedown do toque só chega depois do toque acabar).
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', tecla);
    window.addEventListener('resize', redimensionou);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', tecla);
      window.removeEventListener('resize', redimensionou);
    };
  }, [aberto, fixo]);

  return (
    <div
      ref={caixa}
      className={`relative ${classeDoWrapper}`}
      // Foco que sai da caixa (botão + painel) para outro elemento fecha o painel e fica onde foi. Sem destino (clique em área
      // que não recebe foco, janela que perde o foco, Safari que não foca botão no clique) quem fecha é o toque fora.
      onBlur={(e) => {
        if (aberto && foraDaCaixa(e.currentTarget, e.relatedTarget)) setAberto(false);
      }}
    >
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
          ref={painel}
          id={id}
          style={fixo ? (posicao ? { top: posicao.top, left: posicao.left } : undefined) : ajuste ? { translate: `${ajuste}px 0` } : undefined}
          className={`ff-popover ${fixo ? 'fixed origin-top-left' : `absolute ${acima ? 'bottom-full mb-2' : 'top-full mt-2'} ${alinhar === 'direita' ? 'right-0' : 'left-0'} ${acima ? 'origin-bottom' : alinhar === 'direita' ? 'origin-top-right' : 'origin-top-left'}`} z-40 ${largura} max-w-[calc(100vw-24px)] border border-linha bg-painel p-1.5 shadow-[var(--ff-sombra)]`}
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
  'ff-transicao relative inline-grid h-11 w-11 shrink-0 place-items-center rounded-botao text-suave hover:bg-texto/5 hover:text-texto aria-expanded:bg-texto/5 aria-expanded:text-texto';
