/**
 * Filtro por link (o estado mora na URL: voltar funciona e dá para mandar o
 * link já filtrado). Controle segmentado do kit: trilho com borda, opção ativa
 * em `forte`, `aria-current`. Rola dentro do próprio trilho no celular.
 */

import Link from 'next/link';

export function FiltroEmLinks({
  rotulo,
  opcoes,
}: {
  /** Nome acessível do grupo ("Filtrar por situação"). */
  rotulo: string;
  opcoes: { href: string; rotulo: string; ativo: boolean }[];
}) {
  return (
    // No celular o trilho rola de lado: a borda direita esmaece para mostrar
    // que tem mais opção (o espaço no fim deixa a última aparecer inteira).
    // avoid-ai-design-ignore: C1 — máscara funcional (indício de rolagem), não gradiente decorativo.
    <nav
      aria-label={rotulo}
      className="max-w-full overflow-x-auto max-sm:pr-8 max-sm:[mask-image:linear-gradient(to_right,#000_calc(100%-32px),transparent)]"
    >
      <ul className="flex w-max gap-1 rounded-[10px] border border-linha bg-painel p-1">
        {opcoes.map((o) => (
          <li key={o.href + o.rotulo}>
            <Link
              href={o.href}
              aria-current={o.ativo ? 'page' : undefined}
              className="ff-transicao flex min-h-9 items-center whitespace-nowrap rounded-[7px] px-3 text-[13px] text-suave hover:bg-texto/5 hover:text-texto aria-[current=page]:bg-forte aria-[current=page]:font-semibold aria-[current=page]:text-texto"
            >
              {o.rotulo}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Busca por texto que vai para a URL (GET), com os outros filtros preservados. */
export function BuscaEmFormulario({
  nome = 'q',
  valor,
  placeholder,
  rotulo,
  ocultos = {},
}: {
  nome?: string;
  valor?: string;
  placeholder: string;
  rotulo: string;
  ocultos?: Record<string, string | undefined>;
}) {
  return (
    <form role="search" className="flex w-full max-w-xl gap-2">
      {Object.entries(ocultos).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <label htmlFor={`busca-${nome}`} className="sr-only">
        {rotulo}
      </label>
      <input
        id={`busca-${nome}`}
        name={nome}
        type="search"
        defaultValue={valor ?? ''}
        placeholder={placeholder}
        className="ff-transicao block min-h-11 min-w-0 flex-1 rounded-[7px] border border-linha-forte bg-campo px-3 text-sm text-texto placeholder:text-suave/70 hover:border-texto/30 sm:min-h-10"
      />
      <button
        type="submit"
        className="ff-transicao inline-flex min-h-11 shrink-0 items-center rounded-[7px] border border-linha-forte px-4 text-sm font-semibold text-texto hover:border-texto/35 hover:bg-texto/5 sm:min-h-10"
      >
        Buscar
      </button>
    </form>
  );
}
