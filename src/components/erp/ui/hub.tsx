/**
 * Hub de módulos (Ref.1): a tela de entrada do /erp e do /rodolfo.
 *
 * Grade de 4 colunas no desktop e 2 no tablet e no celular (Ref.1 do plano:
 * "4 colunas no desktop, caindo pra 2 no celular"; vence o kit, que pedia 1).
 * Abaixo de 600 px o card fica compacto: ícone, nome e a descrição em até 3
 * linhas; os links das abas somem (a área abre na 1ª aba e as abas estão no
 * topo dela). Card = quadrado do ícone na
 * cor da área + nome + descrição do fluxo e, embaixo, as abas que a pessoa
 * pode abrir, cada uma um link próprio (UX.9: o hub mostra ÁREAS, nunca ações;
 * o card inteiro leva à primeira aba); borda
 * fina, raio 16 px; hover troca borda e fundo (sem pulo). Módulo do catálogo
 * ainda sem tela: mesmo card, neutro e tracejado, sem link, com o selo
 * "Em breve" (e o cadeado, quando previsto) — nunca leva a uma tela que não
 * existe, não é botão e não dispara nada.
 *
 * 30/10/2026 (pedido de Rodolfo): as abas abaixo do divisor começam RECOLHIDAS e abrem por "Ver atalhos"
 * (`AtalhosDoCartao`). Cards com altura natural e alinhados ao topo: abrir um não estica os vizinhos da linha.
 */

import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { ChaveIcone } from '@/lib/erp/modulos';
import { IconeDoModulo } from './cabecalho';
import { AtalhosDoCartao } from './atalhos-do-cartao';
import { SeloEmBreve } from './em-breve';

export interface CartaoDoHub {
  chave: string;
  nome: string;
  subtitulo: string;
  icone: ChaveIcone;
  cor: string;
  /** null = "Em breve": card de apresentação, sem link. */
  href: string | null;
  /** Só nos "Em breve": o cadeado previsto acompanha o selo. */
  cadeado?: boolean;
  /** Abas da área que a pessoa pode abrir (sem número, sem R$, sem %): cada uma é um link próprio. */
  abas?: { rotulo: string; href: string }[];
}

const CAIXA = 'ff-identidade-modulo ff-cartao-modulo flex h-full min-w-0 flex-col items-start rounded-cartao border p-3.5 sm:p-5';
const HOVER = 'ff-transicao';

export function CartaoModulo({ c }: { c: CartaoDoHub }) {
  const identidade = { '--cor-modulo': c.cor } as CSSProperties;
  const cabeca = (
    <>
      <IconeDoModulo icone={c.icone} cor={c.cor} tamanho={40} />
      <span className="mt-3 block min-w-0">
        <span className="block text-[14px] font-semibold leading-snug text-texto [overflow-wrap:anywhere] sm:truncate sm:text-[15px]">{c.nome}</span>
        <span className="mt-0.5 line-clamp-3 block text-[13px] leading-snug text-suave [text-wrap:pretty] sm:line-clamp-none">{c.subtitulo}</span>
      </span>
    </>
  );
  if (!c.href) {
    // "Em breve": nome e finalidade inteiros em qualquer largura (quebram em linhas; nada de reticências nem de corte em 3
    // linhas, que é só do card de área no celular, onde a área abre a tela que explica o resto).
    return (
      <div aria-disabled="true" className={CAIXA} style={identidade}>
        <IconeDoModulo icone={c.icone} cor={c.cor} tamanho={40} />
        <span className="mt-3 block min-w-0">
          <span className="block text-[14px] font-semibold leading-snug text-texto [overflow-wrap:anywhere] sm:text-[15px]">{c.nome}</span>
          <span className="mt-0.5 block text-[13px] leading-snug text-suave [text-wrap:pretty]">{c.subtitulo}</span>
        </span>
        <SeloEmBreve cadeado={c.cadeado} className="mt-3" />
      </div>
    );
  }
  if (!c.abas || c.abas.length === 0) {
    return (
      <Link href={c.href} className={`${CAIXA} ${HOVER}`} style={identidade}>
        {cabeca}
      </Link>
    );
  }
  // Card de área: o título é o link principal e estica sobre o card todo (o card inteiro leva à primeira aba); os nomes das
  // abas são links IRMÃOS, acima da camada esticada (nunca link dentro de link) e chegam por Tab depois do título.
  return (
    <div className={`${CAIXA} relative ${HOVER}`} style={identidade}>
      <IconeDoModulo icone={c.icone} cor={c.cor} tamanho={40} />
      <span className="mt-3 block min-w-0">
        <Link href={c.href} className="ff-cartao-titulo block text-[14px] font-semibold leading-snug text-texto [overflow-wrap:anywhere] sm:text-[15px]">
          {c.nome}
        </Link>
        <span className="mt-0.5 line-clamp-3 block text-[13px] leading-snug text-suave [text-wrap:pretty] sm:line-clamp-none">{c.subtitulo}</span>
      </span>
      {/* pointer-events-none: o espaço vazio ao lado do botão continua levando à área (camada do título); botão e lista recebem o clique. */}
      <div className="pointer-events-none relative z-10 mt-4 hidden w-full border-t border-linha pt-1 min-[600px]:block">
        <AtalhosDoCartao nome={c.nome} abas={c.abas} />
      </div>
    </div>
  );
}

export function HubDeModulos({ secoes }: { secoes: { rotulo: string; descricao?: string; cartoes: CartaoDoHub[] }[] }) {
  return (
    <div className="space-y-8">
      {secoes
        .filter((s) => s.cartoes.length > 0)
        .map((s) => (
          <section key={s.rotulo} aria-label={s.rotulo}>
            {/* avoid-ai-design-ignore: SD4 — rótulo de seção em caixa alta só no hub e nos grupos do menu (contrato do shell). */}
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-suave">{s.rotulo}</h2>
            {s.descricao && <p className="mt-1 text-[13px] text-suave">{s.descricao}</p>}
            {/* Seção com atalhos: altura natural a partir de 600 px, para abrir um card não esticar os vizinhos (pedido de 30/10).
                Sem atalhos (ou no celular, onde a lista não aparece), os cards da linha seguem com a mesma altura. */}
            <ul className={`grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4 mt-3 ${s.cartoes.some((c) => c.href && c.abas?.length) ? 'min-[600px]:items-start' : ''}`}>
              {s.cartoes.map((c) => (
                <li key={c.chave} className="min-w-0">
                  <CartaoModulo c={c} />
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}
