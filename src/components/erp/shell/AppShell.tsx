/**
 * Shell ÚNICO do ERP: serve o /erp (pessoa do parceiro) e o /rodolfo (nível
 * 1). As sessões continuam separadas (decisões 34/36): cada layout resolve a
 * SUA sessão e entrega os dados prontos; o shell só desenha.
 *
 * O wrapper `.ff-app` leva o tema escolhido (`data-tema`, do cookie `ff_tema`
 * lido no servidor) e o escopo dos tokens. O layout não substitui a checagem
 * das páginas: toda página continua chamando `exigirNivel1`/`exigirParceiro*`
 * e `exigirPermissaoNaPagina`.
 */

import type { ReactNode } from 'react';
import '../tokens.css';
import { Shell } from './Shell';
import type { PropsDoShell } from './tipos';

export function AppShell({ children, ...props }: PropsDoShell & { children: ReactNode }) {
  return (
    <div className="ff-app font-sans" data-tema={props.tema}>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-[7px] focus:bg-painel focus:px-3 focus:py-2"
      >
        Pular para o conteúdo
      </a>
      {/* Filete vermelho no topo: a assinatura editorial da FlowFoods. */}
      <div aria-hidden className="fixed inset-x-0 top-0 z-40 h-[3px] bg-acento" />
      <Shell props={props}>{children}</Shell>
    </div>
  );
}
