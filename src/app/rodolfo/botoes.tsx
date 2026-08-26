'use client';

import { useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import type { Resposta } from './actions';

/**
 * Botão de submit que sabe se o formulário está em voo.
 *
 * React 18 / Next 14: o estado do form vem de `useFormState`/`useFormStatus` do
 * `react-dom` — `useActionState` só existe no React 19. Precisa ser um
 * componente separado porque `useFormStatus` só enxerga o `<form>` de cima.
 */
export function BotaoSubmit({
  children,
  pendenteRotulo = 'Enviando…',
  className = '',
}: {
  children: React.ReactNode;
  pendenteRotulo?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={
        className ||
        'w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-bright disabled:opacity-50 sm:w-auto sm:px-8'
      }
    >
      {pending ? pendenteRotulo : children}
    </button>
  );
}

/**
 * Botão que roda uma server action e mostra o resultado ali mesmo.
 *
 * O retorno aparece na tela em vez de sumir: "não enviou" sem motivo visível é
 * exatamente o que faz alguém desconfiar da trava e desligá-la.
 */
export function BotaoAcao({
  acao,
  children,
  variante = 'secundario',
  confirmar,
  className = '',
}: {
  acao: () => Promise<Resposta>;
  children: React.ReactNode;
  variante?: 'primario' | 'secundario' | 'perigo';
  confirmar?: string;
  className?: string;
}) {
  const [pendente, iniciar] = useTransition();
  const [resposta, setResposta] = useState<Resposta | null>(null);

  const estilos = {
    primario: 'bg-primary text-white hover:bg-bright',
    secundario: 'border border-white/15 text-surface/80 hover:border-white/30 hover:text-surface',
    perigo: 'border border-bright/40 text-bright hover:bg-bright/10',
  }[variante];

  return (
    <div className={className}>
      <button
        type="button"
        disabled={pendente}
        onClick={() => {
          if (confirmar && !window.confirm(confirmar)) return;
          iniciar(async () => {
            try {
              setResposta(await acao());
            } catch (e) {
              setResposta({
                ok: false,
                mensagem: e instanceof Error ? e.message : 'Falhou.',
              });
            }
          });
        }}
        className={`w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${estilos}`}
      >
        {pendente ? 'Executando…' : children}
      </button>

      {resposta && (
        <p
          role="status"
          className={`mt-2 rounded-lg border px-3 py-2 text-xs ${
            resposta.ok
              ? 'border-success/40 bg-success/10 text-success'
              : 'border-warning/40 bg-warning/10 text-warning'
          }`}
        >
          {resposta.mensagem}
        </p>
      )}
    </div>
  );
}

/** Formulário com `useActionState`, para as telas que enviam campos. */
export function MensagemForm({ resposta }: { resposta: Resposta | null }) {
  if (!resposta) return null;
  return (
    <p
      role="status"
      className={`rounded-lg border px-3 py-2 text-sm ${
        resposta.ok
          ? 'border-success/40 bg-success/10 text-success'
          : 'border-warning/40 bg-warning/10 text-warning'
      }`}
    >
      {resposta.mensagem}
    </p>
  );
}
