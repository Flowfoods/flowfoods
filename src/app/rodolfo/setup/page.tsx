'use client';

import { Suspense } from 'react';
import { useFormState } from 'react-dom';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { definirSenha, type ResultadoSetup } from './actions';
import { BotaoSubmit } from '../botoes';

const estadoInicial: ResultadoSetup = { ok: false };

function Formulario() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [estado, acao] = useFormState(definirSenha, estadoInicial);

  if (estado.ok) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
          Senha definida. O token não vale mais.
        </p>
        <Link
          href="/rodolfo/login"
          className="block w-full rounded-xl bg-primary px-4 py-3 text-center font-semibold text-white transition hover:bg-bright"
        >
          Entrar
        </Link>
      </div>
    );
  }

  if (!token) {
    return (
      <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
        Abra este endereço com o token: <code>/rodolfo/setup?token=…</code>
        <br />O token está no env do Dokploy, em <code>ADMIN_SETUP_TOKEN</code>.
      </p>
    );
  }

  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <div>
        <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-surface/60">
          Seu e-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 outline-none focus:border-bright"
        />
      </div>

      <div>
        <label htmlFor="senha" className="mb-1.5 block text-xs font-medium text-surface/60">
          Senha (mínimo 12 caracteres)
        </label>
        <input
          id="senha"
          name="senha"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 outline-none focus:border-bright"
        />
      </div>

      <div>
        <label htmlFor="confirmacao" className="mb-1.5 block text-xs font-medium text-surface/60">
          Repita a senha
        </label>
        <input
          id="confirmacao"
          name="confirmacao"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 outline-none focus:border-bright"
        />
      </div>

      {estado.erro && (
        <p role="alert" className="rounded-lg border border-bright/40 bg-bright/10 px-3 py-2 text-sm text-bright">
          {estado.erro}
        </p>
      )}

      <BotaoSubmit pendenteRotulo="Salvando…" className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-white transition hover:bg-bright disabled:opacity-50">Definir senha</BotaoSubmit>

      <p className="text-xs text-surface/45">
        A senha não é gravada em log, relatório ou mensagem. Só o hash vai para o banco.
      </p>
    </form>
  );
}

export default function SetupPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-bold">Primeiro acesso</h1>
        <p className="mb-6 mt-1 text-sm text-surface/60">Defina a senha do Espaço do Rodolfo.</p>
        <Suspense fallback={null}>
          <Formulario />
        </Suspense>
      </div>
    </div>
  );
}
