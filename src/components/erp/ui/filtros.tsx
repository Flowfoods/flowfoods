/**
 * Filtro por link (o estado mora na URL: voltar funciona e dá para mandar o
 * link já filtrado). Controle segmentado no visual da Apple (decisão 530):
 * trilho preenchido, opção ativa num polegar claro com sombra, contorno fino e
 * em negrito, `aria-current`. Rola dentro do próprio trilho no celular. A borda
 * transparente do trilho só aparece no alto contraste do aparelho (cores forçadas).
 */

import Link from 'next/link';
import { classeDeBotao } from './estilos';

export function FiltroEmLinks({
  rotulo,
  opcoes,
  quebra = false,
}: {
  /** Nome acessível do grupo ("Filtrar por situação"). */
  rotulo: string;
  opcoes: { href: string; rotulo: string; ativo: boolean }[];
  /** Nomes longos (lojas): no celular as opções quebram em linhas em vez de rolar de lado e cortar a última. */
  quebra?: boolean;
}) {
  if (quebra) {
    return (
      <nav aria-label={rotulo} className="min-w-0 max-w-full">
        <ul className="flex flex-wrap gap-0.5 rounded-[10px] border border-transparent bg-preenchimento p-[3px]">
          {opcoes.map((o) => (
            <li key={o.href + o.rotulo}>
              <Link
                href={o.href}
                aria-current={o.ativo ? 'page' : undefined}
                className="ff-transicao flex min-h-9 items-center rounded-[8px] px-3 text-[13px] font-medium text-texto hover:bg-preenchimento aria-[current=page]:bg-polegar aria-[current=page]:font-semibold aria-[current=page]:shadow-[0_1px_2px_rgb(0_0_0/0.08),0_2px_6px_rgb(0_0_0/0.1)] aria-[current=page]:ring-1 aria-[current=page]:ring-linha-forte aria-[current=page]:hover:bg-polegar"
              >
                {o.rotulo}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    );
  }
  return (
    // No celular o trilho rola de lado: a borda direita esmaece para mostrar
    // que tem mais opção (o espaço no fim deixa a última aparecer inteira).
    // avoid-ai-design-ignore: C1 — máscara funcional (indício de rolagem), não gradiente decorativo.
    <nav
      aria-label={rotulo}
      className="min-w-0 max-w-full overflow-x-auto max-sm:pr-8 max-sm:[mask-image:linear-gradient(to_right,#000_calc(100%-32px),transparent)]"
    >
      <ul className="flex w-max gap-0.5 rounded-[10px] border border-transparent bg-preenchimento p-[3px]">
        {opcoes.map((o) => (
          <li key={o.href + o.rotulo}>
            <Link
              href={o.href}
              aria-current={o.ativo ? 'page' : undefined}
              className="ff-transicao flex min-h-9 items-center whitespace-nowrap rounded-[8px] px-3 text-[13px] font-medium text-texto hover:bg-preenchimento aria-[current=page]:bg-polegar aria-[current=page]:font-semibold aria-[current=page]:shadow-[0_1px_2px_rgb(0_0_0/0.08),0_2px_6px_rgb(0_0_0/0.1)] aria-[current=page]:ring-1 aria-[current=page]:ring-linha-forte aria-[current=page]:hover:bg-polegar"
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
      {/* O visual da Apple (preenchido, sem borda, com a lupa) vem da regra de `input[type=search]` em tokens.css. */}
      <input
        id={`busca-${nome}`}
        name={nome}
        type="search"
        defaultValue={valor ?? ''}
        placeholder={placeholder}
        className="ff-transicao block min-h-11 min-w-0 flex-1 border pr-3 text-sm text-texto sm:min-h-10"
      />
      <button type="submit" className={classeDeBotao('secundario', 'shrink-0')}>
        Buscar
      </button>
    </form>
  );
}
