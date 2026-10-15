'use client';

/**
 * Peças de formulário do ERP (mesmo desenho do cadastro de insumo): rótulo em
 * caixa alta pequena, campo escuro com borda fina, erro em vermelho embaixo.
 */

import { useFormStatus } from 'react-dom';

export const ROTULO = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-surface/50';
export const CAMPO =
  'w-full rounded-[7px] border border-white/[0.12] bg-black/40 px-3 py-2.5 text-sm text-surface outline-none transition placeholder:text-surface/25 focus:border-surface/40 aria-[invalid=true]:border-bright/70';

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
    <p id={id} className="mt-1.5 text-[12px] text-bright">
      {texto}
    </p>
  );
}

export function Enviar({
  children,
  pendente = 'Salvando…',
  variante = 'primario',
  className = '',
}: {
  children: React.ReactNode;
  pendente?: string;
  variante?: 'primario' | 'secundario';
  className?: string;
}) {
  const { pending } = useFormStatus();
  const estilo =
    variante === 'primario'
      ? 'bg-primary text-white hover:bg-primary-dark'
      : 'border border-white/[0.14] text-surface hover:border-surface/40 hover:bg-white/[0.04]';
  return (
    <button
      type="submit"
      disabled={pending}
      className={`whitespace-nowrap rounded-[7px] px-4 py-2.5 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-60 ${estilo} ${className}`}
    >
      {pending ? pendente : children}
    </button>
  );
}

/** Mensagem de resultado: verde quando deu certo, vermelho (geral) quando não. */
export function Resultado({ estado }: { estado: EstadoForm }) {
  return (
    <p aria-live="polite" className="min-h-[1rem] text-[12px]">
      {estado?.ok && estado.mensagem && <span className="text-success">{estado.mensagem}</span>}
      {estado && !estado.ok && estado.erros?.geral && <span className="text-bright">{estado.erros.geral}</span>}
    </p>
  );
}
