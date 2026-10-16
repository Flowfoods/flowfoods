/**
 * Cabeçalho de página (Ref.2) e o quadrado do ícone do módulo.
 *
 * Quadrado de 40 px com o ícone na cor do módulo · h1 grande em Gelasio ·
 * subtítulo com contexto e contagem ("Rede Completa · 43 insumos") · a ação
 * principal à direita (uma por tela) · busca e filtros logo abaixo. Um h1 por
 * tela. A cor do módulo só existe no quadrado; o resto é neutro.
 */

import type { CSSProperties, ReactNode } from 'react';
import type { ChaveIcone } from '@/lib/erp/modulos';
import { Icone } from '../shell/icones';

export function IconeDoModulo({
  icone,
  cor,
  tamanho = 40,
}: {
  icone: ChaveIcone;
  cor: string;
  tamanho?: 32 | 36 | 40 | 44;
}) {
  const raio = tamanho >= 40 ? 'rounded-[10px]' : 'rounded-[8px]';
  // avoid-ai-design-ignore: K6 — ícone em quadrado arredondado na cor do módulo é a Ref.1/Ref.2 do contrato do shell.
  return (
    <span
      aria-hidden
      className={`ff-icone-modulo inline-grid shrink-0 place-items-center ${raio}`}
      style={{ '--cor-modulo': cor, width: tamanho, height: tamanho } as CSSProperties}
    >
      <Icone nome={icone} size={Math.round(tamanho * 0.5)} />
    </span>
  );
}

export function PageHeader({
  icone,
  cor,
  titulo,
  subtitulo,
  acao,
  children,
}: {
  icone: ChaveIcone;
  cor: string;
  titulo: string;
  subtitulo?: ReactNode;
  /** Ação principal da tela (uma só). */
  acao?: ReactNode;
  /** Busca e filtros, logo abaixo. */
  children?: ReactNode;
}) {
  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-3.5">
          <IconeDoModulo icone={icone} cor={cor} />
          <div className="min-w-0">
            <h1 className="font-display text-[26px] font-bold leading-tight tracking-[-0.01em] [text-wrap:balance] sm:text-[30px]">
              {titulo}
            </h1>
            {subtitulo && <p className="mt-0.5 text-sm text-suave">{subtitulo}</p>}
          </div>
        </div>
        {acao && <div className="flex shrink-0 flex-wrap items-center gap-2">{acao}</div>}
      </div>
      {children}
    </header>
  );
}
