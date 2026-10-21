'use client';

/**
 * Abas de uma área (UX.9): cada aba é uma ROTA (link), não um painel
 * escondido; por isso é `<nav>` com nome acessível ("Seções de Estoque e
 * Movimentações") e a aba atual leva `aria-current="page"`, e não `role=tablist`.
 * Vêm das mesmas abas do menu (`abasDaArea`), então nunca divergem dele. Tab e
 * Enter navegam, o foco aparece por dentro da aba (o trilho rola e cortaria um
 * anel por fora). No celular o trilho rola de lado, só dentro dele.
 *
 * Distinta de `FiltroEmLinks` (pílulas): aba troca de seção da área; filtro
 * recorta o que a lista mostra.
 *
 * Polimento da 3.3: ao abrir, a aba atual vem para a vista DENTRO do trilho
 * (no celular, com 5 abas, "Indicadores" ficava cortada e a atual podia estar
 * fora). Só o trilho rola (a página não pula) e sem animação: o salto é
 * instantâneo, com ou sem `prefers-reduced-motion`.
 */

import Link from 'next/link';
import { useEffect, useRef } from 'react';

/**
 * Quanto o trilho deve rolar para a aba atual ficar inteira na vista (com uma folga para a máscara do fim); null = já está.
 * Pura: as medidas vêm do DOM.
 */
export function rolagemParaAAba(trilho: { scrollLeft: number; clientWidth: number }, aba: { offsetLeft: number; offsetWidth: number }, folga = 32): number | null {
  const inicio = aba.offsetLeft;
  const fim = aba.offsetLeft + aba.offsetWidth;
  if (inicio >= trilho.scrollLeft && fim <= trilho.scrollLeft + trilho.clientWidth - folga) return null;
  if (inicio < trilho.scrollLeft) return Math.max(0, inicio - 8);
  return Math.max(0, fim - trilho.clientWidth + folga);
}

export function Abas({
  rotulo,
  abas,
}: {
  /** Nome acessível: "Seções de <área>". */
  rotulo: string;
  abas: { href: string; rotulo: string; ativa: boolean }[];
}) {
  const trilho = useRef<HTMLDivElement>(null);
  const atual = abas.find((a) => a.ativa)?.href ?? null;
  useEffect(() => {
    const t = trilho.current;
    const aba = t?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (!t || !aba) return;
    const x = rolagemParaAAba(t, aba);
    if (x !== null) t.scrollLeft = x;
  }, [atual]);
  return (
    <nav aria-label={rotulo} className="mb-6 border-b border-linha">
      {/* No celular a borda direita esmaece para mostrar que tem mais aba (o espaço no fim deixa a última aparecer inteira).
          avoid-ai-design-ignore: C1 — máscara funcional (indício de rolagem), não gradiente decorativo.
          `relative`: a medida da aba (offsetLeft) é contada a partir do trilho. */}
      <div ref={trilho} className="relative overflow-x-auto max-sm:pr-8 max-sm:[mask-image:linear-gradient(to_right,#000_calc(100%-32px),transparent)]">
        <ul className="flex w-max min-w-full gap-1">
          {abas.map((a) => (
            <li key={a.href}>
              <Link
                href={a.href}
                aria-current={a.ativa ? 'page' : undefined}
                className="ff-aba ff-transicao flex min-h-11 items-center whitespace-nowrap px-3 text-[14px] text-suave hover:text-texto aria-[current=page]:font-semibold aria-[current=page]:text-texto"
              >
                {a.rotulo}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
