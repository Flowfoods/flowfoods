/**
 * Formulário do design system do ERP: rótulo persistente (não caixa alta),
 * campo inset (`campo`, um tom abaixo do painel) com borda explícita de 42–44
 * px, erro logo abaixo do campo e ligado a ele por `aria-describedby`.
 */

import type { ReactNode } from 'react';

export const ROTULO = 'mb-1.5 block text-[13px] font-medium text-texto';
export const CAMPO =
  'ff-transicao block min-h-11 w-full rounded-[7px] border border-linha-forte bg-campo px-3 py-2 text-sm text-texto placeholder:text-suave/70 hover:border-texto/30 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-erro sm:min-h-[42px]';
/** Caixa de seleção nativa (checkbox/radio) na cor da ação. */
export const MARCAR = 'h-5 w-5 shrink-0 accent-[rgb(var(--ff-acao))]';
/** Ajuda curta embaixo do campo. */
export const AJUDA = 'mt-1.5 text-[12px] text-suave';

/** Estado devolvido pelas actions do ERP para `useFormState`. */
export type EstadoForm = {
  ok: boolean;
  mensagem?: string;
  erros?: Partial<Record<string, string>>;
  vez: number;
} | null;

export function Erro({ id, texto }: { id: string; texto?: string }) {
  if (!texto) return null;
  return (
    <p id={id} className="mt-1.5 text-[13px] text-erro">
      {texto}
    </p>
  );
}

/** Resultado de um envio: confirma o que mudou, ou diz o erro geral. */
export function Resultado({ estado }: { estado: EstadoForm }) {
  return (
    <p aria-live="polite" className="min-h-[1.25rem] text-[13px]">
      {estado?.ok && estado.mensagem && <span className="text-ok">{estado.mensagem}</span>}
      {estado && !estado.ok && estado.erros?.geral && <span className="text-erro">{estado.erros.geral}</span>}
    </p>
  );
}

/** Rótulo + campo + erro, para o caso comum. */
export function Campo({
  id,
  rotulo,
  erro,
  ajuda,
  children,
}: {
  id: string;
  rotulo: string;
  erro?: string;
  ajuda?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className={ROTULO}>
        {rotulo}
      </label>
      {children}
      {ajuda && <p className={AJUDA}>{ajuda}</p>}
      <Erro id={`${id}-erro`} texto={erro} />
    </div>
  );
}
