'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function Formulario() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro('');

    const r = await signIn('credentials', { email, senha, redirect: false });

    if (r?.ok) {
      router.push(params.get('callbackUrl') ?? '/rodolfo');
      router.refresh();
    } else {
      // Mensagem única para senha errada, e-mail inexistente e rate limit: dizer
      // qual dos três é entregar meio caminho a quem está tentando adivinhar.
      setErro('E-mail ou senha incorretos.');
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={entrar} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-surface/60">
          E-mail
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-surface outline-none transition placeholder:text-surface/30 focus:border-bright"
          placeholder="voce@exemplo.com"
        />
      </div>

      <div>
        <label htmlFor="senha" className="mb-1.5 block text-xs font-medium text-surface/60">
          Senha
        </label>
        <input
          id="senha"
          type="password"
          required
          autoComplete="current-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-surface outline-none transition placeholder:text-surface/30 focus:border-bright"
          placeholder="••••••••"
        />
      </div>

      {erro && (
        <p role="alert" className="rounded-lg border border-bright/40 bg-bright/10 px-3 py-2 text-sm text-bright">
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-white transition hover:bg-bright disabled:opacity-50"
      >
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-bold">Espaço do Rodolfo</h1>
        <p className="mb-6 mt-1 text-sm text-surface/60">Área privada da FlowFoods.</p>
        <Suspense fallback={null}>
          <Formulario />
        </Suspense>
      </div>
    </div>
  );
}
