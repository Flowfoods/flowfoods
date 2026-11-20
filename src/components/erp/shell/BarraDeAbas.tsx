'use client';

/**
 * Barra de abas do celular (A3, decisão 532), como a do iPhone no protótipo aprovado: Início, as primeiras áreas da pessoa e
 * Mais, que abre a gaveta com o menu inteiro. Só repete entradas do menu (`abasDoCelular`): não cria destino nem libera nada.
 *
 * Só abaixo de 640 px, e some nas telas com barra fixa de ações (`data-barra-fixa`) e com um campo de texto em foco (o teclado
 * aberto). Essas regras moram em `tokens.css`, junto com o espaço que ela reserva no fim do conteúdo. O borrão do material fica
 * no `::before` (`.ff-material`), como na barra do topo.
 */

import Link from 'next/link';
import { Ellipsis } from 'lucide-react';
import type { CSSProperties } from 'react';
import { abasDoCelular, type Navegacao } from '@/lib/erp/modulos';
import { Icone } from './icones';

export function BarraDeAbas({
  nav,
  caminho,
  gavetaAberta,
  aoAbrirMais,
}: {
  nav: Navegacao;
  caminho: string;
  gavetaAberta: boolean;
  aoAbrirMais: () => void;
}) {
  const { abas, maisAtiva } = abasDoCelular(nav, caminho);
  return (
    <nav aria-label="Áreas" data-barra-de-abas className="ff-abas-celular ff-material">
      <ul className="ff-abas-celular-lista">
        {abas.map((a) => (
          <li key={a.href}>
            {/* "page" só na própria tela de entrada; dentro da área, "true" (a aba é a da área atual, não a página). */}
            <Link
              href={a.href}
              aria-current={a.ativa ? (a.href === caminho ? 'page' : 'true') : undefined}
              className="ff-aba-celular ff-identidade-modulo"
              style={{ '--cor-modulo': a.cor } as CSSProperties}
            >
              <Icone nome={a.icone} size={24} className="ff-aba-celular-icone" />
              <span className="ff-aba-celular-rotulo">{a.rotulo}</span>
            </Link>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={aoAbrirMais}
            aria-controls="ff-gaveta"
            aria-expanded={gavetaAberta}
            data-ativa={maisAtiva ? '' : undefined}
            className="ff-aba-celular"
          >
            <Ellipsis size={24} strokeWidth={1.75} aria-hidden className="ff-aba-celular-icone" />
            <span className="ff-aba-celular-rotulo">Mais</span>
            {/* O Mais aceso também para o leitor de tela: a área da tela atual ficou fora das abas. */}
            {maisAtiva && <span className="sr-only"> (área atual)</span>}
          </button>
        </li>
      </ul>
    </nav>
  );
}
