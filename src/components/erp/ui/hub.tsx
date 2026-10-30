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
 * fina, raio 14 px; hover troca borda e fundo (sem pulo). Módulo do plano
 * ainda não construído: mesmo card, sem link, com o selo "Em breve" — nunca
 * leva a uma tela que não existe.
 */

import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { ChaveIcone } from '@/lib/erp/modulos';
import { IconeDoModulo } from './cabecalho';

export interface CartaoDoHub {
  chave: string;
  nome: string;
  subtitulo: string;
  icone: ChaveIcone;
  cor: string;
  href: string | null;
  fase?: string;
  /** Abas da área que a pessoa pode abrir (sem número, sem R$, sem %): cada uma é um link próprio. */
  abas?: { rotulo: string; href: string }[];
}

const CAIXA = 'ff-identidade-modulo ff-cartao-modulo flex h-full min-w-0 flex-col items-start rounded-[14px] border p-3.5 sm:p-5';
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
    return (
      <div aria-disabled="true" className={CAIXA} style={identidade}>
        {cabeca}
        {c.fase && (
          <span className="mt-3 inline-flex w-max items-center rounded-[7px] border border-linha-forte px-2 py-0.5 text-[12px] font-medium text-suave">
            Em breve
          </span>
        )}
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
      <div className="relative z-10 mt-4 hidden w-full border-t border-linha pt-2 min-[600px]:block">
        <ul aria-label={`Abas de ${c.nome}`} className="flex flex-wrap items-center gap-x-4 text-[13px] text-suave">
          {c.abas.map((a) => (
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
    </div>
  );
}

export function HubDeModulos({ secoes }: { secoes: { rotulo: string; cartoes: CartaoDoHub[] }[] }) {
  return (
    <div className="space-y-8">
      {secoes
        .filter((s) => s.cartoes.length > 0)
        .map((s) => (
          <section key={s.rotulo} aria-label={s.rotulo}>
            {/* avoid-ai-design-ignore: SD4 — rótulo de seção em caixa alta só no hub e nos grupos do menu (contrato do shell). */}
            <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-suave">{s.rotulo}</h2>
            <ul className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
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
