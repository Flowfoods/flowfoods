'use client';

/**
 * Formulário de "sair" ou "trocar de pessoa" de tela de servidor (a cozinha): ao enviar, apaga os rascunhos do navegador, para que o
 * que a pessoa anterior deixou preenchido não apareça para a próxima no mesmo aparelho.
 */

import type { ReactNode } from 'react';
import { limparRascunhos } from './rascunho';

export function FormQueLimpaRascunhos({ action, className, children }: { action: () => Promise<void>; className?: string; children: ReactNode }) {
  return (
    <form action={action} onSubmit={limparRascunhos} className={className}>
      {children}
    </form>
  );
}
