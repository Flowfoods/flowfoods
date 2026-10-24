'use client';

/**
 * Gráfico de colunas empilhadas (24/10/2026, referência: módulos da Nina),
 * desenhado em SVG próprio, sem biblioteca. Regras do guia de visualização:
 *  - coluna de até 24 px, ponta de cima arredondada (4 px), base reta;
 *    2 px de vão na cor da superfície entre as partes empilhadas;
 *  - um eixo só, marcas redondas, linhas de grade finas e discretas;
 *  - legenda sempre que houver duas séries ou mais; texto nunca na cor da série;
 *  - dica ao passar o mouse ou com as setas do teclado, listando todas as séries;
 *  - "Ver em tabela" com os mesmos números (a dica nunca é o único caminho);
 *  - ponto sem número NÃO é zero: fica vazio, com a marca de estado (falta) e a
 *    frase na dica e na tabela.
 * As cores das séries vêm dos tokens (--ff-serie-N), validadas no claro e no escuro.
 */

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { dinheiroCurto, marcasDoEixo } from '@/lib/erp/grafico';
import { formatarDinheiro } from '@/lib/erp/unidades';

export interface SerieDoGrafico {
  chave: string;
  rotulo: string;
  /** Índice do token de cor (1, 2, 3...): ordem fixa, nunca pela posição na lista filtrada. */
  cor: number;
}

export interface PontoDoGrafico {
  chave: string;
  /** Rótulo completo (dica e tabela): "qui 16/10". */
  rotulo: string;
  /** Rótulo curto do eixo: "16". */
  rotuloEixo: string;
  /** Centavos por série; null = sem número (não é zero). */
  valores: Record<string, number | null>;
  total: number | null;
  /** Frase quando o ponto não tem número, ou um aviso junto do número ("falta iFood"). */
  nota?: string;
  /** Marca de estado na base (falta). */
  marca?: 'falta';
}

const ALTURA = 232;
const MARGEM = { topo: 12, direita: 8, base: 26, esquerda: 60 };
const LARGURA_MAXIMA_DA_COLUNA = 24;
const VAO = 2;

function caminhoDoTopoArredondado(x: number, y: number, w: number, base: number, r: number): string {
  const raio = Math.min(r, w / 2, Math.max(0, base - y));
  return `M${x},${base}V${y + raio}Q${x},${y} ${x + raio},${y}H${x + w - raio}Q${x + w},${y} ${x + w},${y + raio}V${base}Z`;
}

export function GraficoDeColunas({
  titulo,
  series,
  pontos,
  legendaDaMarca = 'Falta lançar',
}: {
  /** Nome acessível do gráfico (o título visível fica no Painel). */
  titulo: string;
  series: SerieDoGrafico[];
  pontos: PontoDoGrafico[];
  legendaDaMarca?: string;
}) {
  const id = useId();
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(720);
  const [ativo, setAtivo] = useState<number | null>(null);

  useEffect(() => {
    const el = caixa.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((e) => {
      const w = Math.round(e[0].contentRect.width);
      if (w > 0) setLargura(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maximo = useMemo(() => pontos.reduce((m, p) => Math.max(m, p.total ?? 0), 0), [pontos]);
  const marcas = useMemo(() => marcasDoEixo(maximo), [maximo]);
  const topoDaEscala = marcas[marcas.length - 1] || 1;
  const areaW = Math.max(40, largura - MARGEM.esquerda - MARGEM.direita);
  const areaH = ALTURA - MARGEM.topo - MARGEM.base;
  const base = MARGEM.topo + areaH;
  const vaga = areaW / Math.max(1, pontos.length);
  const larguraDaColuna = Math.max(3, Math.min(LARGURA_MAXIMA_DA_COLUNA, vaga * 0.62));
  const y = (v: number) => base - (v / topoDaEscala) * areaH;
  // Rótulos do eixo X sem encostar: um a cada `passo`, sempre o primeiro e o último.
  const passoDoEixo = Math.max(1, Math.ceil(30 / vaga));
  const temMarca = pontos.some((p) => p.marca);

  function indiceDoPonteiro(e: PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left - MARGEM.esquerda;
    if (x < 0 || x > areaW) return null;
    return Math.min(pontos.length - 1, Math.max(0, Math.floor(x / vaga)));
  }

  function teclado(e: KeyboardEvent<SVGSVGElement>) {
    if (!pontos.length) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const d = e.key === 'ArrowRight' ? 1 : -1;
      setAtivo((a) => (a === null ? (d > 0 ? 0 : pontos.length - 1) : Math.min(pontos.length - 1, Math.max(0, a + d))));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setAtivo(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setAtivo(pontos.length - 1);
    } else if (e.key === 'Escape') {
      setAtivo(null);
    }
  }

  const pAtivo = ativo !== null ? pontos[ativo] : null;
  const xAtivo = ativo !== null ? MARGEM.esquerda + ativo * vaga + vaga / 2 : 0;

  return (
    <div className="space-y-3">
      {(series.length > 1 || temMarca) && (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-suave" aria-label="Legenda">
          {series.map((s) => (
            <li key={s.chave} className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: `var(--ff-serie-${s.cor})` }} />
              {s.rotulo}
            </li>
          ))}
          {temMarca && (
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-[3px] w-2.5 rounded-full bg-erro" />
              {legendaDaMarca}
            </li>
          )}
        </ul>
      )}

      <div ref={caixa} className="relative w-full" data-grafico>
        <svg
          role="img"
          aria-labelledby={`${id}-t`}
          aria-describedby={`${id}-d`}
          tabIndex={0}
          width={largura}
          height={ALTURA}
          className="block max-w-full touch-pan-y select-none rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-texto/40"
          onPointerMove={(e) => setAtivo(indiceDoPonteiro(e))}
          onPointerLeave={() => setAtivo(null)}
          onPointerDown={(e) => setAtivo(indiceDoPonteiro(e))}
          onKeyDown={teclado}
          onBlur={() => setAtivo(null)}
        >
          <title id={`${id}-t`}>{titulo}</title>
          <desc id={`${id}-d`}>Use as setas para percorrer os dias. Os números também estão em Ver em tabela, abaixo.</desc>
          <defs>
            {pontos.map((p, i) => {
              if (p.total === null || p.total <= 0) return null;
              const x = MARGEM.esquerda + i * vaga + (vaga - larguraDaColuna) / 2;
              return (
                <clipPath key={p.chave} id={`${id}-c${i}`}>
                  <path d={caminhoDoTopoArredondado(x, y(p.total), larguraDaColuna, base, 4)} />
                </clipPath>
              );
            })}
          </defs>

          {/* Grade e eixo Y: linhas finas, na cor da borda. */}
          {marcas.map((v) => (
            <g key={v}>
              <line x1={MARGEM.esquerda} x2={MARGEM.esquerda + areaW} y1={y(v)} y2={y(v)} style={{ stroke: 'var(--ff-linha)' }} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={MARGEM.esquerda - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-suave text-[11px] tabular-nums">
                {dinheiroCurto(v)}
              </text>
            </g>
          ))}

          {/* Realce do dia sob o ponteiro (atrás das colunas). */}
          {ativo !== null && <rect x={MARGEM.esquerda + ativo * vaga} y={MARGEM.topo} width={vaga} height={areaH} style={{ fill: 'rgb(var(--ff-texto) / 0.05)' }} />}

          {pontos.map((p, i) => {
            const x = MARGEM.esquerda + i * vaga + (vaga - larguraDaColuna) / 2;
            const partes: { s: SerieDoGrafico; v: number }[] = series.flatMap((s) => {
              const v = p.valores[s.chave];
              return v !== null && v !== undefined && v > 0 ? [{ s, v }] : [];
            });
            let acumulado = 0;
            return (
              <g key={p.chave}>
                {partes.length > 0 && (
                  <g clipPath={`url(#${id}-c${i})`}>
                    {partes.map(({ s, v }, k) => {
                      const y0 = y(acumulado);
                      acumulado += v;
                      const y1 = y(acumulado);
                      // Vão de 2 px entre as partes (fica a superfície aparecendo).
                      const h = Math.max(0, y0 - y1 - (k < partes.length - 1 ? VAO : 0));
                      return <rect key={s.chave} x={x} y={y1 + (k < partes.length - 1 ? VAO : 0)} width={larguraDaColuna} height={h} style={{ fill: `var(--ff-serie-${s.cor})` }} />;
                    })}
                  </g>
                )}
                {p.marca === 'falta' && <rect x={x} y={base + 3} width={larguraDaColuna} height={3} rx={1.5} className="fill-erro" />}
                {((i % passoDoEixo === 0 && (pontos.length - 1 - i >= passoDoEixo || i === pontos.length - 1)) || i === pontos.length - 1) && (
                  <text x={MARGEM.esquerda + i * vaga + vaga / 2} y={ALTURA - 6} textAnchor="middle" className="fill-suave text-[11px] tabular-nums">
                    {p.rotuloEixo}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={MARGEM.esquerda} x2={MARGEM.esquerda + areaW} y1={base} y2={base} style={{ stroke: 'var(--ff-linha-forte)' }} strokeWidth={1} shapeRendering="crispEdges" />
        </svg>

        {pAtivo && (
          <div
            role="status"
            className="pointer-events-none absolute top-1 z-10 w-max max-w-[15rem] rounded-[10px] border border-linha-forte bg-painel px-3 py-2 text-[12px] shadow-[0_8px_24px_-12px_rgba(10,10,10,0.35)]"
            style={{ left: Math.min(Math.max(0, xAtivo - 90), Math.max(0, largura - 190)) }}
          >
            <p className="font-semibold text-texto">{pAtivo.rotulo}</p>
            {pAtivo.total === null ? (
              <p className="mt-0.5 text-suave">{pAtivo.nota ?? 'sem número'}</p>
            ) : (
              <>
                <ul className="mt-1 space-y-0.5">
                  {series.map((s) => {
                    const v = pAtivo.valores[s.chave];
                    return (
                      <li key={s.chave} className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5 text-suave">
                          <span aria-hidden className="inline-block h-[2px] w-3 rounded-full" style={{ background: `var(--ff-serie-${s.cor})` }} />
                          {s.rotulo}
                        </span>
                        <span className="font-semibold tabular-nums text-texto">{v === null || v === undefined ? '—' : formatarDinheiro(v)}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-1 flex justify-between gap-4 border-t border-linha pt-1">
                  <span className="text-suave">Total</span>
                  <span className="font-semibold tabular-nums text-texto">{formatarDinheiro(pAtivo.total)}</span>
                </p>
                {pAtivo.nota && <p className="mt-0.5 text-erro">{pAtivo.nota}</p>}
              </>
            )}
          </div>
        )}
      </div>

      <details className="group text-[13px]">
        <summary className="ff-transicao inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-suave hover:text-texto sm:min-h-8 [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="transition-transform group-open:rotate-90">
            ›
          </span>
          Ver em tabela
        </summary>
        <div className="mt-2 max-h-80 overflow-auto rounded-[10px] border border-linha">
          <table className="w-full text-[13px]">
            <caption className="sr-only">{titulo}</caption>
            <thead className="sticky top-0 bg-forte text-left text-[12px] text-suave">
              <tr>
                <th scope="col" className="h-9 px-3 font-semibold">
                  Dia
                </th>
                {series.map((s) => (
                  <th key={s.chave} scope="col" className="h-9 px-3 text-right font-semibold">
                    {s.rotulo}
                  </th>
                ))}
                <th scope="col" className="h-9 px-3 text-right font-semibold">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {pontos.map((p) => (
                <tr key={p.chave} className="border-t border-linha">
                  <th scope="row" className="px-3 py-1.5 text-left font-normal text-texto">
                    {p.rotulo}
                  </th>
                  {series.map((s) => {
                    const v = p.valores[s.chave];
                    return (
                      <td key={s.chave} className="px-3 py-1.5 text-right tabular-nums text-suave">
                        {v === null || v === undefined ? '—' : formatarDinheiro(v)}
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {p.total === null ? <span className="text-suave">{p.nota ?? '—'}</span> : <span className="font-semibold text-texto">{formatarDinheiro(p.total)}</span>}
                    {p.total !== null && p.nota && <span className="block text-[12px] text-erro">{p.nota}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
