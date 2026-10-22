'use client';

import { useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { limparRascunhos } from '@/components/erp/telas/cadastro/rascunho';
import { acaoEntrar, type EstadoEntrar } from './actions';
import { EntrarComRosto } from './rosto';

const ROTULO = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-suave';
const CAMPO =
  'w-full rounded-[7px] border border-linha-forte bg-campo px-3.5 py-3 text-[15px] text-texto outline-none transition placeholder:text-suave/70 focus:border-texto/50 aria-[invalid=true]:border-erro';

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-[7px] bg-acao px-4 py-3 text-[15px] font-semibold text-white transition hover:bg-acao-hover disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? 'Entrando…' : 'Entrar'}
    </button>
  );
}

export function FormEntrar({ aviso, rosto }: { aviso: string | null; rosto: boolean }) {
  const [estado, enviar] = useFormState<EstadoEntrar, FormData>(acaoEntrar, null);
  // Quem chega à tela de entrar não herda o que a pessoa anterior deixou preenchido neste aparelho.
  useEffect(() => limparRascunhos(), []);
  return (
    <div className="space-y-5">
      {aviso && !estado && (
        <p role="status" className="flex items-start gap-2.5 text-[13px] text-texto">
          <span aria-hidden className="mt-[7px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
          {aviso}
        </p>
      )}
      <form action={enviar} className="space-y-4" noValidate>
        <div>
          <label htmlFor="email" className={ROTULO}>
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            inputMode="email"
            autoComplete="username webauthn"
            defaultValue={estado?.email ?? ''}
            key={estado?.vez ?? 0}
            placeholder="voce@restaurante.com.br"
            className={CAMPO}
            aria-invalid={!!estado}
            aria-describedby={estado ? 'entrar-erro' : undefined}
          />
        </div>
        <div>
          <label htmlFor="senha" className={ROTULO}>
            Senha
          </label>
          <input
            id="senha"
            name="senha"
            type="password"
            required
            autoComplete="current-password"
            className={CAMPO}
            aria-invalid={!!estado}
            aria-describedby={estado ? 'entrar-erro' : undefined}
          />
        </div>
        {estado && (
          <p id="entrar-erro" role="alert" className="text-[13px] text-erro">
            {estado.erro}
          </p>
        )}
        <Botao />
      </form>
      {rosto && <EntrarComRosto />}
    </div>
  );
}
