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

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePontos } from '../shell/pontos';

export function useTemPonto(ponto: string): boolean {
  return usePontos().tem(ponto);
}

/**
 * Explicação de seção que virou ponto: com o ponto no registro desta tela,
 * desenha só o botão com o título ("? Como a conta é feita"); sem ele, mostra
 * o texto antigo (`children`) — nenhuma tela fica sem explicação.
 */
export function ExplicacaoNoPonto({
  ponto,
  children,
  className = '',
  emLinha = false,
}: {
  ponto: string;
  children: ReactNode;
  className?: string;
  /** Dentro de um parágrafo (ao lado de um link, por exemplo): o botão entra em linha, sem bloco próprio. */
  emLinha?: boolean;
}) {
  const tem = useTemPonto(ponto);
  if (!tem) return <>{children}</>;
  if (emLinha) return <PontoDeAjuda ponto={ponto} comRotulo className={className} />;
  return (
    <div className={className}>
      <PontoDeAjuda ponto={ponto} comRotulo />
    </div>
  );
}

/**
 * `alvo` (decisão 480): o id da região que o ponto explica (o campo, os botões de escolha). Com ela, o card abre deixando a
 * região à vista acima dele, e tocar dentro dela não encerra a sequência (é fazer o que o card pede).
 */
export function PontoDeAjuda({ ponto, className = '', comRotulo = false, alvo }: { ponto: string; className?: string; comRotulo?: boolean; alvo?: string }) {
  const { tem, titulo, ativo, abrir, registrar, chave } = usePontos();
  const botao = useRef<HTMLButtonElement>(null);
  // Sem JavaScript o botão não abriria nada: nasce escondido e aparece depois de montar.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  const existe = tem(ponto);
  // Registra depois de montado (o botão nasce escondido): assim a sequência conta o ponto quando ele já está à vista, e o card
  // aberto refaz o "2 de 5" quando um ponto aparece (decisão 480: escolher a unidade faz surgir "Quanto vem" e o custo).
  useEffect(() => {
    if (!existe || !montado || !botao.current) return;
    return registrar(ponto, botao.current);
  }, [existe, montado, ponto, registrar]);
  if (!existe) return null;
  const aberto = ativo === `${chave}.${ponto}`;
  if (comRotulo) {
    return (
      <button
        ref={botao}
        type="button"
        hidden={!montado}
        style={montado ? undefined : { display: 'none' }}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        data-ponto={ponto}
        data-ponto-ativo={aberto ? '' : undefined}
        data-alvo={alvo}
        onClick={(e) => abrir(ponto, e.currentTarget)}
        className={`ff-transicao inline-flex min-h-11 items-center gap-2 rounded-[5px] text-left text-[13px] font-medium text-suave hover:text-texto sm:min-h-8 ${className}`}
      >
        <span
          aria-hidden
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] font-semibold leading-none ${aberto ? 'border-texto bg-texto text-fundo' : 'border-current'}`}
        >
          ?
        </span>
        <span className="underline decoration-linha-forte underline-offset-4">{titulo(ponto)}</span>
      </button>
    );
  }
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
      data-ponto-ativo={aberto ? '' : undefined}
      data-alvo={alvo}
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
