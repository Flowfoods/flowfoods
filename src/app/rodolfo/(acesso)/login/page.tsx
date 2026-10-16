'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { CAMPO, ROTULO } from '@/components/erp/ui/campos';
import { classeDeBotao } from '@/components/erp/ui/estilos';

function Formulario() {
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
      // Navegação completa, não `router.push`: os links do menu do /rodolfo
      // são pré-carregados ainda SEM sessão, e o router do Next reaproveitava
      // esse cache — o redirect para o login — logo depois de entrar.
      window.location.assign(params.get('callbackUrl') ?? '/rodolfo');
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
        <label htmlFor="email" className={ROTULO}>
          E-mail
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={CAMPO}
          placeholder="voce@exemplo.com"
        />
      </div>

      <div>
        <label htmlFor="senha" className={ROTULO}>
          Senha
        </label>
        <input
          id="senha"
          type="password"
          required
          autoComplete="current-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className={CAMPO}
          placeholder="••••••••"
        />
      </div>

      {erro && (
        <p role="alert" className="rounded-[7px] border border-erro/40 px-3 py-2 text-sm text-erro">
          {erro}
        </p>
      )}

      <button type="submit" disabled={enviando} className={classeDeBotao('primario', 'w-full')}>
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-[28px] font-bold leading-tight">Espaço do Rodolfo</h1>
        <p className="mb-6 mt-1 text-sm text-suave">Área privada da FlowFoods.</p>
        <Suspense fallback={null}>
          <Formulario />
        </Suspense>
      </div>
    </div>
  );
}
