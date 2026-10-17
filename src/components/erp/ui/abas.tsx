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
 */

import Link from 'next/link';

export function Abas({
  rotulo,
  abas,
}: {
  /** Nome acessível: "Seções de <área>". */
  rotulo: string;
  abas: { href: string; rotulo: string; ativa: boolean }[];
}) {
  return (
    <nav aria-label={rotulo} className="mb-6 border-b border-linha">
      {/* No celular a borda direita esmaece para mostrar que tem mais aba (o espaço no fim deixa a última aparecer inteira).
          avoid-ai-design-ignore: C1 — máscara funcional (indício de rolagem), não gradiente decorativo. */}
      <div className="overflow-x-auto max-sm:pr-8 max-sm:[mask-image:linear-gradient(to_right,#000_calc(100%-32px),transparent)]">
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
