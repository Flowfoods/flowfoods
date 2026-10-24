'use client';

/**
 * Botão de ajuda junto de um campo, seção ou ação (prioridade nº 1 de
 * 23/10/2026). Abre o card flutuante com a explicação do ponto, que mora no
 * registro de ajuda (`ajuda-textos.ts`, campo `pontos` da entrada da tela).
 *
 * Sem o ponto no registro desta tela (ou sem permissão para lê-lo), não desenha
 * nada — use `useTemPonto` para manter o texto antigo nesse caso, em vez de
 * deixar o campo sem explicação.
 */

import { useEffect, useRef, useState } from 'react';
import { usePontos } from '../shell/pontos';

export function useTemPonto(ponto: string): boolean {
  return usePontos().tem(ponto);
}

export function PontoDeAjuda({ ponto, className = '' }: { ponto: string; className?: string }) {
  const { tem, titulo, ativo, abrir, registrar, chave } = usePontos();
  const botao = useRef<HTMLButtonElement>(null);
  // Sem JavaScript o botão não abriria nada: nasce escondido e aparece depois de montar.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  const existe = tem(ponto);
  useEffect(() => {
    if (!existe || !botao.current) return;
    return registrar(ponto, botao.current);
  }, [existe, ponto, registrar]);
  if (!existe) return null;
  const aberto = ativo === `${chave}.${ponto}`;
  return (
    <button
      ref={botao}
      type="button"
      hidden={!montado}
      style={montado ? undefined : { display: 'none' }}
      aria-label={`Ajuda: ${titulo(ponto) ?? 'como funciona'}`}
      aria-haspopup="dialog"
      aria-expanded={aberto}
      data-ponto={ponto}
      onClick={(e) => abrir(ponto, e.currentTarget)}
      className={`ff-transicao inline-grid h-11 w-11 shrink-0 place-items-center rounded-full align-middle text-suave hover:text-texto sm:h-7 sm:w-7 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 ${className}`}
    >
      <span
        aria-hidden
        className={`grid h-5 w-5 place-items-center rounded-full border text-[11px] font-semibold leading-none ${aberto ? 'border-texto bg-texto text-fundo' : 'border-current'}`}
      >
        ?
      </span>
    </button>
  );
}
