/**
 * Cabeçalho de página (Ref.2) e o quadrado do ícone do módulo.
 *
 * Quadrado de 40 px com o ícone na cor do módulo · h1 editorial em Gelasio
 * (29 px/1,2, peso regular: padrão aprovado em 09/11/2026; 25 px no celular) ·
 * subtítulo com contexto e contagem ("Rede Completa · 43 insumos") · a ação
 * principal à direita (uma por tela) · a caixa "Como funciona" (quando a
 * pessoa ainda não fechou) · busca e filtros logo abaixo. Um h1 por tela. A
 * identidade da área também orienta menu/cards; o conteúdo operacional é neutro.
 */

import type { CSSProperties, ReactNode } from 'react';
import type { ChaveIcone } from '@/lib/erp/modulos';
import { Icone } from '../shell/icones';
import { CaixaDaTela } from './caixa-da-tela';

/**
 * `variante`: `tonal` (padrão) é o quadrado no tom da área, do cabeçalho e dos cards; `cheio` é a cor da área inteira com o
 * desenho claro, da grade de módulos e do seletor (referência de 12/11/2026); `futuro` é o módulo do catálogo "Em breve",
 * sem cor de área, só o contorno tracejado.
 */
export function IconeDoModulo({
  icone,
  cor,
  tamanho = 40,
  variante = 'tonal',
}: {
  icone: ChaveIcone;
  cor: string;
  tamanho?: 32 | 36 | 40 | 44;
  variante?: 'tonal' | 'cheio' | 'futuro';
}) {
  const raio = tamanho >= 40 ? 'rounded-[10px]' : 'rounded-[8px]';
  const forma = variante === 'cheio' ? ' ff-icone-cheio' : variante === 'futuro' ? ' ff-icone-futuro' : '';
  // avoid-ai-design-ignore: K6 — ícone em quadrado arredondado na cor do módulo é a Ref.1/Ref.2 do contrato do shell.
  return (
    <span
      aria-hidden
      className={`ff-icone-modulo${forma} inline-grid shrink-0 place-items-center ${raio}`}
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
  aviso,
  children,
}: {
  icone: ChaveIcone;
  cor: string;
  titulo: string;
  subtitulo?: ReactNode;
  /** Ação principal da tela (uma só). */
  acao?: ReactNode;
  /** O que acabou de acontecer ("Insumo salvo..."): vem ANTES da caixa "Como funciona", para ser a primeira coisa que se lê. */
  aviso?: ReactNode;
  /** Busca e filtros, logo abaixo. */
  children?: ReactNode;
}) {
  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-3.5">
          <IconeDoModulo icone={icone} cor={cor} />
          <div className="min-w-0">
            <h1 className="break-words font-display text-[25px] font-normal leading-[1.2] tracking-[-0.02em] [text-wrap:balance] sm:text-[29px]">
              {titulo}
            </h1>
            {subtitulo && <p className="mt-0.5 break-words text-sm text-suave">{subtitulo}</p>}
          </div>
        </div>
        {acao && <div className="flex shrink-0 flex-wrap items-center gap-2">{acao}</div>}
      </div>
      {aviso}
      <CaixaDaTela />
      {children}
    </header>
  );
}
