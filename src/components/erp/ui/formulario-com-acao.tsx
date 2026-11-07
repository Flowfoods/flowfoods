'use client';

import { startTransition, type ComponentProps } from 'react';

/**
 * O React 19 limpa campos livres quando uma action resolve, mesmo se ela
 * devolveu erro, prévia ou conflito. O envio explícito mantém o rascunho e
 * o pending de useFormStatus; cada tela continua decidindo quando limpar.
 * A action permanece no HTML para o envio antes da hidratação.
 */
export function FormularioComAcao({ action, onSubmit, ...props }: ComponentProps<'form'>) {
  return <form {...props} action={action} onSubmit={event => {
    onSubmit?.(event);
    if (event.defaultPrevented || typeof action !== 'function') return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    // Respeita um override HTML de destino; nenhum formulário atual o usa.
    if (submitter?.hasAttribute('formaction')) return;
    event.preventDefault();
    const dados = new FormData(event.currentTarget, submitter);
    startTransition(() => action(dados));
  }} />;
}
