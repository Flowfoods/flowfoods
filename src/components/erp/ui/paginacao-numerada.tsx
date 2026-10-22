/**
 * Rodapé de lista paginada com números (L.1): "Mostrando 1–25 de 137 insumos · Página 1 de 6", Anterior, números compactos,
 * Próxima e "Itens por página". Tudo é link de verdade (o estado mora na URL e funciona sem JavaScript); a ponta sem destino
 * fica desabilitada sem sumir (o botão não muda de lugar). Alvos de 44 px. No celular os números saem e fica "Página x de y".
 */

import Link from 'next/link';
import { paginasVisiveis } from '@/lib/erp/paginacao';

const ALVO = 'ff-transicao inline-flex min-h-11 min-w-11 items-center justify-center rounded-[7px] px-3 text-sm font-semibold tabular-nums';
const NORMAL = `${ALVO} border border-linha-forte text-texto hover:border-texto/35 hover:bg-texto/5`;
const ATUAL = `${ALVO} border border-texto bg-forte text-texto`;
const DESABILITADO = `${ALVO} pointer-events-none border border-linha text-suave opacity-55`;

export function PaginacaoNumerada({
  de,
  ate,
  total,
  pagina,
  paginas,
  singular,
  plural,
  href,
  tamanhos,
}: {
  de: number;
  ate: number;
  total: number;
  pagina: number;
  paginas: number;
  singular: string;
  plural: string;
  /** O endereço da página `p` (com os filtros e o tamanho de agora). */
  href: (p: number) => string;
  /** Itens por página: as opções, a de agora e o endereço de cada uma (volta à página 1). */
  tamanhos?: { opcoes: readonly number[]; atual: number; href: (n: number) => string };
}) {
  const ponta = (destino: number | null, rotulo: string) =>
    destino ? (
      <Link href={href(destino)} className={NORMAL} rel={destino < pagina ? 'prev' : 'next'}>
        {rotulo}
      </Link>
    ) : (
      <span aria-disabled="true" className={DESABILITADO}>
        {rotulo}
      </span>
    );
  return (
    <nav aria-label="Paginação da lista" className="flex flex-col gap-3 border-t border-linha px-4 py-3 text-[13px] text-suave sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="tabular-nums">
          {total === 0 ? (
            <>Mostrando 0 de 0 {plural}</>
          ) : (
            <>
              Mostrando {de === ate ? de : `${de}–${ate}`} de {total} {total === 1 ? singular : plural}
            </>
          )}
          <span aria-hidden> · </span>
          <span className="sr-only">. </span>
          <span>
            Página {pagina} de {paginas}
          </span>
        </p>
        <ul className="flex flex-wrap items-center gap-1.5">
          <li>{ponta(pagina > 1 ? pagina - 1 : null, 'Anterior')}</li>
          {paginasVisiveis(pagina, paginas).map((p, i) =>
            p === 'espaco' ? (
              <li key={`e${i}`} aria-hidden className="hidden px-1 text-suave sm:block">
                …
              </li>
            ) : (
              <li key={p} className="hidden sm:block">
                {p === pagina ? (
                  <span aria-current="page" className={ATUAL}>
                    <span className="sr-only">Página </span>
                    {p}
                  </span>
                ) : (
                  <Link href={href(p)} className={NORMAL} aria-label={`Ir para a página ${p}`}>
                    {p}
                  </Link>
                )}
              </li>
            ),
          )}
          <li>{ponta(pagina < paginas ? pagina + 1 : null, 'Próxima')}</li>
        </ul>
      </div>
      {tamanhos && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span id="itens-por-pagina">Itens por página</span>
          <ul aria-labelledby="itens-por-pagina" className="flex flex-wrap items-center gap-1.5">
            {tamanhos.opcoes.map((n) => (
              <li key={n}>
                {n === tamanhos.atual ? (
                  <span aria-current="true" className={ATUAL}>
                    {n}
                  </span>
                ) : (
                  <Link href={tamanhos.href(n)} className={NORMAL} aria-label={`Mostrar ${n} por página`}>
                    {n}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}
