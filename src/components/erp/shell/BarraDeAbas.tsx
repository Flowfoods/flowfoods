'use client';

/**
 * Barra de Módulos do celular e do tablet (decisão 535, prévia aprovada por Rodolfo em 23/11/2026; substitui a barra de abas
 * da A3): cinco posições, o botão Módulos fixo e destacado no centro e quatro atalhos laterais (`atalhosDaBarra`), que só
 * repetem entradas do menu: não criam destino nem liberam nada. O menu inteiro continua na gaveta do botão de menu do topo.
 *
 * - Ícones: o desenho e a cor de cada área, sempre (a Cápsula não recolore nada); o vermelho identifica o Módulos.
 * - Cápsula: um único fundo arredondado, no tom da área, desliza atrás dos atalhos, do que estava ativo ao novo. Módulos não
 *   recebe a Cápsula nem o estado da seção; fora dos atalhos, ela some. Com movimento reduzido, troca na hora.
 * - Módulos abre a janela de Módulos (`JanelaDeModulos`) acima da barra, com a Expansão a partir do botão.
 *
 * Abaixo de 900 px (onde não há menu lateral): no celular, em largura cheia; no tablet, uma barra flutuante no centro. Some nas
 * telas com barra fixa de ações (`data-barra-fixa`) e com um campo de texto em foco (o teclado aberto), menos a busca da
 * própria janela. Essas regras moram em `tokens.css`, junto com o espaço que ela reserva no fim do conteúdo. O borrão do
 * material fica no `::before` (`.ff-material`), como na barra do topo.
 */

import Link from 'next/link';
import { LayoutGrid } from 'lucide-react';
import { useCallback, useId, useRef, useState, type CSSProperties } from 'react';
import { COLUNA_DE_MODULOS, atalhosDaBarra, itemAtivo, type AtalhoDaBarra, type Navegacao } from '@/lib/erp/modulos';
import { Icone } from './icones';
import { JanelaDeModulos } from './JanelaDeModulos';

export function BarraDeAbas({ nav, caminho }: { nav: Navegacao; caminho: string }) {
  const { atalhos, ativo } = atalhosDaBarra(nav, caminho);
  const [aberta, setAberta] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  const idDaJanela = useId();
  const corDaCapsula = atalhos.find((a) => a.coluna === ativo)?.cor;

  const fechar = useCallback((devolverFoco: boolean) => {
    setAberta(false);
    if (devolverFoco) botao.current?.focus();
  }, []);

  return (
    <nav aria-label="Áreas" data-barra-de-abas data-modulos-aberto={aberta ? '' : undefined} className="ff-abas-celular ff-material">
      <div className="ff-abas-celular-trilho">
        {/* A Cápsula: uma só, que desliza de coluna em coluna (`--ff-capsula-coluna`). É enfeite: quem diz a área atual ao
            leitor de tela é o `aria-current` do atalho, e o peso do nome a quem enxerga. */}
        <span
          aria-hidden
          data-capsula
          data-visivel={ativo !== null ? '' : undefined}
          className="ff-capsula ff-identidade-modulo"
          style={{ '--ff-capsula-coluna': ativo ?? COLUNA_DE_MODULOS, ...(corDaCapsula ? { '--cor-modulo': corDaCapsula } : {}) } as CSSProperties}
        />
        {/* As posições na ordem da tela (a do Tab e a do leitor de tela): os atalhos da esquerda, o Módulos, os da direita.
            Cada uma diz a coluna dela, porque com menos de quatro atalhos sobra posição vazia. */}
        <ul className="ff-abas-celular-lista">
          {atalhos
            .filter((a) => a.coluna < COLUNA_DE_MODULOS)
            .map((a) => (
              <AtalhoDaBarraNaTela key={a.chave} atalho={a} caminho={caminho} />
            ))}
          <li style={{ gridColumn: COLUNA_DE_MODULOS + 1 }}>
            <button
              ref={botao}
              type="button"
              onClick={() => setAberta((v) => !v)}
              aria-haspopup="dialog"
              aria-expanded={aberta}
              aria-controls={aberta ? idDaJanela : undefined}
              className="ff-aba-celular ff-aba-modulos"
            >
              <span className="ff-aba-celular-caixa">
                <LayoutGrid size={22} strokeWidth={2} aria-hidden />
              </span>
              <span className="ff-aba-celular-rotulo">Módulos</span>
            </button>
            {aberta && <JanelaDeModulos id={idDaJanela} nav={nav} atual={itemAtivo(nav, caminho)?.modulo ?? null} botao={botao} aoFechar={fechar} />}
          </li>
          {atalhos
            .filter((a) => a.coluna > COLUNA_DE_MODULOS)
            .map((a) => (
              <AtalhoDaBarraNaTela key={a.chave} atalho={a} caminho={caminho} />
            ))}
        </ul>
      </div>
    </nav>
  );
}

function AtalhoDaBarraNaTela({ atalho: a, caminho }: { atalho: AtalhoDaBarra; caminho: string }) {
  return (
    <li style={{ gridColumn: a.coluna + 1 }}>
      {/* "page" só na própria tela de entrada; dentro da área, "true" (o atalho é o da área atual, não a página). */}
      <Link
        href={a.href}
        aria-current={a.ativo ? (a.href === caminho ? 'page' : 'true') : undefined}
        aria-label={a.nome === a.rotulo ? undefined : a.nome}
        className="ff-aba-celular ff-identidade-modulo"
        style={{ '--cor-modulo': a.cor } as CSSProperties}
      >
        <span className="ff-aba-celular-caixa">
          <Icone nome={a.icone} size={24} className="ff-aba-celular-icone" />
        </span>
        <span className="ff-aba-celular-rotulo">{a.rotulo}</span>
      </Link>
    </li>
  );
}
