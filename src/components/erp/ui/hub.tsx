/**
 * Hub de módulos (Ref.1): a tela de entrada do /erp e do /rodolfo.
 *
 * Grade de 4 colunas no desktop, 3 no tablet, 2 no celular. Card = quadrado
 * do ícone na cor do módulo + nome + subtítulo de uma linha; borda fina, raio
 * 14 px; hover troca borda e fundo (sem pulo). Módulo do plano ainda não
 * construído: mesmo card, sem link, com o selo da fase — nunca leva a uma
 * tela que não existe.
 */

import Link from 'next/link';
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
}

export function CartaoModulo({ c }: { c: CartaoDoHub }) {
  const corpo = (
    <>
      <IconeDoModulo icone={c.icone} cor={c.cor} tamanho={40} />
      <span className="mt-3 block min-w-0">
        <span className="block truncate text-[15px] font-semibold text-texto">{c.nome}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-suave [text-wrap:pretty]">{c.subtitulo}</span>
      </span>
      {!c.href && c.fase && (
        <span className="mt-3 inline-flex w-max items-center rounded-[7px] border border-linha-forte px-2 py-0.5 text-[12px] font-medium text-suave">
          Chega na fase {c.fase}
        </span>
      )}
    </>
  );
  const caixa = 'flex h-full min-w-0 flex-col items-start rounded-[14px] border border-linha bg-painel p-4 sm:p-5';
  if (!c.href) {
    return (
      <div aria-disabled="true" className={`${caixa} bg-transparent`}>
        {corpo}
      </div>
    );
  }
  return (
    <Link href={c.href} className={`${caixa} ff-transicao hover:border-linha-forte hover:bg-forte`}>
      {corpo}
    </Link>
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
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
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
