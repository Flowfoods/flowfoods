/**
 * Barras horizontais (24/10/2026, referência: painéis da Nina) — para comparar grandezas com nome comprido (categoria, fornecedor),
 * em ordem. Servidor puro: o valor de cada barra está ESCRITO ao lado (a cor nunca é o único sinal, e o leitor de tela lê a lista).
 *
 * Regras do sistema de gráficos (decisão 453): barra fina (14 px), ponta de dado arredondada em 4 px, um eixo só (começa no zero),
 * uma série (cor --ff-serie-1); "outros" e "sem categoria" ficam em cinza, porque são resto e não identidade. A marca opcional (a
 * meta) é um traço de 2 px na cor do texto, com legenda. A tabela com todos os números continua na tela: o gráfico não a substitui.
 */

import Link from 'next/link';

export interface BarraDoGrafico {
  chave: string;
  rotulo: string;
  valor: number;
  /** O valor por extenso, ao lado da barra ("R$ 1,2 mil", "12,40%"). */
  valorTexto: string;
  /** Uma linha de apoio sob o nome ("32% do total", "meta 10,00% · +2,40 pp"). */
  detalhe?: string;
  href?: string;
  /** Onde fica a marca (mesma escala do valor); nulo = sem marca nesta barra. */
  marca?: number | null;
  /** Resto (outros, sem categoria): em cinza. */
  neutra?: boolean;
}

export function BarrasHorizontais({ titulo, barras, marca, cor = 1 }: { titulo: string; barras: readonly BarraDoGrafico[]; marca?: { rotulo: string }; cor?: number }) {
  const maximo = Math.max(1, ...barras.map((b) => Math.max(b.valor, b.marca ?? 0)));
  const temMarca = !!marca && barras.some((b) => b.marca != null);
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / maximo) * 100))}%`;
  return (
    <figure className="min-w-0">
      {temMarca && (
        <figcaption className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-suave">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: `var(--ff-serie-${cor})` }} />
            realizado
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-3 w-[2px] bg-texto" />
            {marca!.rotulo}
          </span>
        </figcaption>
      )}
      <ul aria-label={titulo} className="space-y-1">
        {barras.map((b) => {
          const conteudo = (
            <>
              <span className="min-w-0 self-center">
                <span className="block truncate text-[13px] font-medium text-texto" title={b.rotulo}>
                  {b.rotulo}
                </span>
                {b.detalhe && <span className="block text-[12px] leading-snug text-suave">{b.detalhe}</span>}
              </span>
              <span className="self-center text-right text-[13px] font-semibold tabular-nums text-texto sm:order-last">{b.valorTexto}</span>
              <span aria-hidden className="relative col-span-2 h-3.5 self-center sm:col-span-1">
                <span className="absolute inset-0 rounded-r-[4px] bg-texto/[0.05]" />
                {b.valor > 0 && (
                  <span
                    className={`absolute inset-y-0 left-0 rounded-r-[4px] ${b.neutra ? 'bg-texto/25' : ''}`}
                    style={{ width: pct(b.valor), ...(b.neutra ? {} : { background: `var(--ff-serie-${cor})` }) }}
                  />
                )}
                {temMarca && b.marca != null && <span className="absolute -inset-y-1 w-[2px] -translate-x-1/2 bg-texto" style={{ left: pct(b.marca) }} />}
              </span>
            </>
          );
          const classe = 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 rounded-[7px] px-2 py-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_minmax(4.5rem,auto)] sm:gap-y-0';
          return (
            <li key={b.chave}>
              {b.href ? (
                <Link href={b.href} className={`${classe} ff-transicao -mx-2 hover:bg-texto/[0.04] focus-visible:bg-texto/[0.04]`}>
                  {conteudo}
                </Link>
              ) : (
                <div className={`${classe} -mx-2`}>{conteudo}</div>
              )}
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
