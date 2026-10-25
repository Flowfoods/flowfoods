'use client';

/**
 * As Tarefas da cozinha se atualizam sozinhas (revisão de UX, E4): o tablet não fica parado num estado que já mudou ("Falta o
 * estoque entregar" depois que o estoque entregou, o lote que outra pessoa pegou). A cada minuto, com a tela visível, e logo que
 * a tela volta a ficar visível, a página pede os dados de novo ao servidor (`router.refresh`): o que a pessoa abriu ou digitou
 * continua onde estava. Não atualiza enquanto alguém digita num campo. A confirmação de uma ação ("Lote pego", "Lote
 * concluído", com o botão da etiqueta) fica na tela; a atualização só não rola de novo até ela (`acabouDeAtualizarSozinha`,
 * lido por `LevarParaVista`), para o conteúdo não pular no tablet.
 */

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export const INTERVALO_DA_COZINHA_MS = 60_000;
/** Voltou à tela depois disto: atualiza na hora. */
const AO_VOLTAR_DEPOIS_MS = 5_000;
/** Uma atualização sozinha recente: o aviso que voltou igual não rola a tela de novo. */
const JANELA_DA_ATUALIZACAO_MS = 15_000;
let ultimaAtualizacaoSozinha = 0;

/** A tela acabou de se atualizar sozinha (não foi uma ação da pessoa). */
export function acabouDeAtualizarSozinha(agora = Date.now()): boolean {
  return agora - ultimaAtualizacaoSozinha < JANELA_DA_ATUALIZACAO_MS;
}

function digitando(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

export function AtualizarSozinho({ intervaloMs = INTERVALO_DA_COZINHA_MS }: { intervaloMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    let ultima = Date.now();
    const atualizar = () => {
      if (document.visibilityState !== 'visible' || digitando()) return;
      ultima = Date.now();
      ultimaAtualizacaoSozinha = ultima;
      router.refresh();
    };
    const aoVoltar = () => {
      if (document.visibilityState === 'visible' && Date.now() - ultima > AO_VOLTAR_DEPOIS_MS) atualizar();
    };
    const id = window.setInterval(atualizar, intervaloMs);
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('focus', aoVoltar);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('focus', aoVoltar);
    };
  }, [router, intervaloMs]);
  return null;
}
