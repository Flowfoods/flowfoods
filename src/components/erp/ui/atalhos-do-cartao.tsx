'use client';

/**
 * Opções complementares dos cards de módulos — recolhidas por padrão (pedido de Rodolfo, 30/10/2026).
 *
 * A lista abaixo do divisor (as abas da área, todas links reais) começa recolhida e só aparece por um botão próprio,
 * "Ver atalhos" / "Ocultar atalhos". Ícone, título, descrição, cor e a entrada principal do card continuam visíveis e
 * com o mesmo destino. Expandir não navega e não fecha os outros cards.
 *
 * Estado só desta visita: abrir, recarregar, voltar à página ou restaurá-la pelo cache do navegador começa recolhido;
 * troca de pessoa/parceiro/loja (contexto da consulta) ou da lista de atalhos permitidos também recolhe. Renderizações
 * normais na mesma visita não fecham o card. Nada é guardado no navegador. Os links vêm do servidor já filtrados pelas
 * permissões; recolher não esconde nem revela acesso.
 */

import Link from 'next/link';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useContextoDaConsulta } from '../shell/contexto-da-consulta';

const useAntesDaPintura = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function AtalhosDoCartao({ nome, abas }: { nome: string; abas: { rotulo: string; href: string }[] }) {
  const consulta = useContextoDaConsulta();
  const [aberto, definirAberto] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  const regiao = useRef<HTMLDivElement>(null);
  const id = useId();
  const assinatura = abas.map((a) => a.href).join('\n');

  useAntesDaPintura(() => {
    const recolher = () => {
      // Se o foco estava num atalho que vai sumir, ele volta ao botão (contexto válido), nunca se perde no body.
      if (regiao.current?.contains(document.activeElement)) botao.current?.focus();
      definirAberto(false);
    };
    const aoRestaurar = (evento: PageTransitionEvent) => {
      if (evento.persisted) recolher();
    };
    recolher();
    window.addEventListener('pagehide', recolher);
    window.addEventListener('pageshow', aoRestaurar);
    return () => {
      window.removeEventListener('pagehide', recolher);
      window.removeEventListener('pageshow', aoRestaurar);
    };
  }, [consulta.chave, assinatura]);

  if (abas.length === 0) return null;
  return (
    <>
      <button
        ref={botao}
        type="button"
        aria-expanded={aberto}
        aria-controls={id}
        onClick={() => definirAberto((a) => !a)}
        className="ff-transicao inline-flex min-h-11 items-center gap-1.5 rounded-[7px] text-[13px] font-medium text-texto hover:underline hover:underline-offset-4"
      >
        {aberto ? 'Ocultar atalhos' : 'Ver atalhos'}
        <span className="sr-only"> de {nome}</span>
        <ChevronDown size={16} aria-hidden className={`ff-transicao ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {/* `hidden` fora da árvore de acessibilidade e da tabulação; nenhuma classe de display neste elemento. */}
      <div ref={regiao} id={id} hidden={!aberto}>
        <ul aria-label={`Abas de ${nome}`} className="flex flex-wrap items-center gap-x-4 pb-1 text-[13px] text-suave">
          {abas.map((a) => (
            <li key={a.href} className="flex items-center">
              <Link
                href={a.href}
                className="ff-transicao inline-flex min-h-8 items-center rounded-[5px] hover:text-texto hover:underline hover:underline-offset-4 [@media(pointer:coarse)]:min-h-11"
              >
                {a.rotulo}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
