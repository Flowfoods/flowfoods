/**
 * Peças de servidor comuns às telas de cadastro do ERP (insumos, fichas):
 * o link com cara de botão que, bloqueado, vira botão desabilitado com o
 * motivo, e o "Voltar" com área de toque de 44 px no celular.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { classeDeBotao, LINK_DE_TEXTO, type Variante } from '../../ui/estilos';

/** Link com cara de botão; bloqueado, vira botão desabilitado com o motivo. */
export function BotaoOuMotivo({
  href,
  bloqueio,
  variante = 'secundario',
  className = '',
  children,
}: {
  href: string;
  bloqueio: string | null;
  variante?: Variante;
  className?: string;
  children: ReactNode;
}) {
  if (bloqueio) {
    return (
      <button type="button" disabled title={bloqueio} className={classeDeBotao(variante, className)}>
        {children}
        <span className="sr-only"> (indisponível: {bloqueio})</span>
      </button>
    );
  }
  return (
    <Link href={href} className={classeDeBotao(variante, className)}>
      {children}
    </Link>
  );
}

export function Voltar({ href, children, recarregar = false }: { href: string; children: ReactNode; /** Volta para a tela de origem com a página lida de novo (e não a guardada pelo roteador): a versão de lá pode ter mudado. */ recarregar?: boolean }) {
  const classe = `${LINK_DE_TEXTO} inline-flex min-h-11 items-center sm:min-h-0 [@media(pointer:coarse)]:min-h-11`;
  if (recarregar) return <a href={href} className={classe}>{children}</a>;
  return (
    // No toque (tablet deitado ou em pé), 44 px em qualquer largura; com mouse, a partir de 640 px, só o texto.
    <Link href={href} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center sm:min-h-0 [@media(pointer:coarse)]:min-h-11`}>
      {children}
    </Link>
  );
}
