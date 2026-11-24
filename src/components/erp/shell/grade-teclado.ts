import type { KeyboardEvent } from 'react';

/**
 * Para onde a seta leva na grade: o índice do bloco vizinho, ou `null` quando não há (borda da grade, tecla que não é seta,
 * bloco fora da lista). Direita e esquerda seguem a ordem de leitura; cima e baixo pulam uma linha (`colunas` blocos).
 */
export function vizinhoNaGrade(atual: number, total: number, colunas: number, tecla: string): number | null {
  const salto = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: Math.max(1, colunas), ArrowUp: -Math.max(1, colunas) }[tecla];
  if (salto === undefined || atual < 0 || atual >= total) return null;
  const alvo = atual + salto;
  return alvo >= 0 && alvo < total ? alvo : null;
}

/**
 * Setas andam pela grade de blocos (`seletor`) como numa tela de ícones; o Tab continua passando por todos. Com Alt, Ctrl,
 * Cmd ou Shift a tecla é do navegador (voltar e avançar, por exemplo) e não é tocada; sem vizinho, a rolagem nativa segue.
 * Serve à grade do seletor de áreas da gaveta e à janela de Módulos (decisão 537).
 */
export function andarPelaGrade(seletor: string) {
  return (e: KeyboardEvent<HTMLElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (!(e.target instanceof HTMLElement) || !e.target.matches(seletor)) return;
    const blocos = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(seletor));
    const topo = (b: HTMLElement) => Math.round(b.getBoundingClientRect().top);
    const colunas = blocos.filter((b) => topo(b) === topo(blocos[0])).length;
    const alvo = vizinhoNaGrade(blocos.indexOf(e.target), blocos.length, colunas, e.key);
    if (alvo === null) return;
    e.preventDefault();
    blocos[alvo].focus();
  };
}
