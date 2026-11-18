/**
 * Cabeçalho de página (Ref.2) e o quadrado do ícone do módulo.
 *
 * Título grande da Apple (decisão 532, sobre o protótipo aprovado em 18/11/2026): h1 em Gelasio 34 px/1,15, peso regular,
 * sem o quadrado da área (até então, 40 px ao lado de um título de 29 px, 25 no celular, padrão de 09/11) · subtítulo com
 * contexto e contagem ("Rede Completa · 43 insumos") · a ação principal à direita (uma por tela) · a caixa "Como funciona"
 * (quando a pessoa ainda não fechou) · busca e filtros logo abaixo. Um h1 por tela. A identidade da área fica no menu, nos
 * cards e na aba do celular; o conteúdo operacional é neutro.
 */

import type { CSSProperties, ReactNode } from 'react';
import type { ChaveIcone } from '@/lib/erp/modulos';
import { Icone } from '../shell/icones';
import { CaixaDaTela } from './caixa-da-tela';

/**
 * `variante`: `tonal` (padrão) é o quadrado no tom da área, do cabeçalho e dos cards; `cheio` é a cor da área inteira com o
 * desenho claro, da grade de módulos e do seletor (referência de 12/11/2026); `futuro` é o módulo do catálogo "Em breve",
 * sem cor de área, só o contorno tracejado. 28 px é o das áreas no menu lateral do Início (decisão 531, como nos Ajustes do
 * iPhone), com o raio de 7 px.
 */
export function IconeDoModulo({
  icone,
  cor,
  tamanho = 40,
  variante = 'tonal',
}: {
  icone: ChaveIcone;
  cor: string;
  tamanho?: 28 | 32 | 36 | 40 | 44;
  variante?: 'tonal' | 'cheio' | 'futuro';
}) {
  const raio = tamanho >= 40 ? 'rounded-[10px]' : tamanho <= 28 ? 'rounded-[7px]' : 'rounded-[8px]';
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
  titulo,
  subtitulo,
  acao,
  aviso,
  children,
}: {
  /**
   * A área da tela. Desde a decisão 532 o cabeçalho não desenha mais o quadrado; as telas seguem dizendo a área (contrato
   * de 29/10), e quem quiser a identidade de volta no cabeçalho a tem aqui.
   */
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
        <div className="min-w-0">
          <h1 className="break-words font-display text-[34px] font-normal leading-[1.15] tracking-[-0.01em] [text-wrap:balance]">
            {titulo}
          </h1>
          {subtitulo && <p className="mt-1 break-words text-[13px] text-suave sm:text-sm">{subtitulo}</p>}
        </div>
        {/* Sozinha numa linha estreita (celular), a ação encolhe e os botões quebram em vez de vazar da tela; a quebra entre o
            título e a ação não muda (ela se decide pela largura cheia de cada um). */}
        {acao && <div className="flex min-w-0 flex-wrap items-center gap-2">{acao}</div>}
      </div>
      {aviso}
      <CaixaDaTela />
      {children}
    </header>
  );
}
