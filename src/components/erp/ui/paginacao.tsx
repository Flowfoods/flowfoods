/**
 * Rodapé de lista paginada do ERP: "1–50 de 132 insumos" + Anterior/Próxima.
 * Links de verdade (o estado mora na URL); a ponta sem destino fica
 * desabilitada, sem sumir (o botão não muda de lugar).
 */

import Link from 'next/link';
import { classeDeBotao } from './estilos';

export function Paginacao({
  de,
  ate,
  total,
  singular,
  plural,
  anterior,
  proxima,
}: {
  de: number;
  ate: number;
  total: number;
  singular: string;
  plural: string;
  /** Link da página anterior/próxima; null = não há. Sem nenhum dos dois, só a contagem. */
  anterior: string | null;
  proxima: string | null;
}) {
  const ponta = (href: string | null, rotulo: string) =>
    href ? (
      <Link href={href} className={classeDeBotao('secundario')}>
        {rotulo}
      </Link>
    ) : (
      <span aria-disabled className={classeDeBotao('secundario', 'pointer-events-none opacity-55')}>
        {rotulo}
      </span>
    );
  return (
    <nav
      aria-label="Páginas da lista"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-linha px-4 py-3 text-[13px] text-suave sm:px-5"
    >
      <span className="tabular-nums">
        {de === ate ? `${de}` : `${de}–${ate}`} de {total} {total === 1 ? singular : plural}
      </span>
      {(anterior || proxima) && (
        <span className="flex gap-2">
          {ponta(anterior, 'Anterior')}
          {ponta(proxima, 'Próxima')}
        </span>
      )}
    </nav>
  );
}
