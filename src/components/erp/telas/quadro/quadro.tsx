/**
 * O esqueleto do quadro kanban (Regra Nº 2: uma peça só para os três quadros da casa — pedidos de acesso no nível 1 (0.5),
 * requisições (1.8) e lotes de produção (3.1)). Não sabe de pedido, requisição nem lote: só da coluna (título na cor do
 * estado + barra fina + contador + "nenhum … nesta etapa") e do cartão (link inteiro, borda esquerda vermelha quando atrasa).
 * Cada quadro monta o conteúdo do cartão e a cor de cada coluna; o atraso nunca é só cor (cada quadro põe o "Xd de atraso").
 */

import Link from 'next/link';
import type { ReactNode } from 'react';

/** Cor do título e da barra de cada coluna, sempre com a palavra ao lado (a cor nunca é o único sinal). */
export type TomDaColuna = 'atencao' | 'neutro' | 'ok' | 'suave';

const COR_DA_COLUNA: Record<TomDaColuna, { texto: string; barra: string }> = {
  atencao: { texto: 'text-atencao', barra: 'bg-atencao' },
  neutro: { texto: 'text-texto', barra: 'bg-texto/70' },
  ok: { texto: 'text-ok', barra: 'bg-ok' },
  suave: { texto: 'text-suave', barra: 'bg-suave/60' },
};

/** A grade das colunas: 1 no celular, 2 a partir de 768 px, 4 a partir de 1280 px. */
export function GradeDoQuadro({ children }: { children: ReactNode }) {
  return <div className="grid gap-x-4 gap-y-7 md:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

export function ColunaDoQuadro({
  id,
  titulo,
  contador,
  tom,
  vazio,
  vazia,
  soNoCelularQuandoAtiva,
  children,
}: {
  id: string;
  titulo: string;
  /** "3", "3 · 7 dias". */
  contador: string;
  tom: TomDaColuna;
  /** A frase da coluna sem cartão ("Nenhum item nesta etapa"). */
  vazio: string;
  vazia: boolean;
  /** Celular com abas (quadro de pedidos): false esconde a coluna até 768 px; sem a prop, a coluna aparece sempre. */
  soNoCelularQuandoAtiva?: boolean;
  children: ReactNode;
}) {
  const cor = COR_DA_COLUNA[tom];
  return (
    <section aria-labelledby={id} className={`min-w-0 ${soNoCelularQuandoAtiva === undefined ? '' : soNoCelularQuandoAtiva ? 'block' : 'hidden md:block'}`}>
      <header className="pb-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id={id} className={`text-[13px] font-semibold ${cor.texto}`}>
            {titulo}
          </h2>
          <span className="text-[12px] tabular-nums text-suave">{contador}</span>
        </div>
        <div aria-hidden className={`mt-2 h-0.5 rounded-full ${cor.barra}`} />
      </header>
      {vazia ? <p className="rounded-[10px] border border-dashed border-linha px-3.5 py-5 text-center text-[13px] text-suave">{vazio}</p> : <ol className="space-y-2">{children}</ol>}
    </section>
  );
}

/**
 * O cartão: o link inteiro abre o detalhe. Atrasado = borda esquerda vermelha (3 px no quadro de requisições e de lotes,
 * 2 px no de pedidos, como cada um foi pedido). `apagado` afunda o cartão de coisa cancelada (sem opacidade: o texto mantém o contraste).
 */
export function CartaoDoQuadro({
  href,
  rotulo,
  atrasado,
  filete = 3,
  apagado,
  children,
}: {
  href: string;
  /** O nome acessível do link (diz o atraso em palavras). */
  rotulo: string;
  atrasado: boolean;
  filete?: 2 | 3;
  apagado?: boolean;
  children: ReactNode;
}) {
  const borda = atrasado ? (filete === 2 ? 'border-l-2 border-l-erro pl-[13px]' : 'border-l-[3px] border-l-erro pl-[12px]') : '';
  return (
    <li>
      <Link href={href} aria-label={rotulo} className={`ff-transicao block rounded-[10px] border border-linha px-3.5 py-3 hover:border-linha-forte ${borda} ${apagado ? 'bg-fundo' : 'bg-painel'}`}>
        {children}
      </Link>
    </li>
  );
}
