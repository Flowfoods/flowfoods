'use client';

import { Suspense } from 'react';
import { useFormState } from 'react-dom';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { definirSenha, type ResultadoSetup } from './actions';
import { BotaoEnviar } from '@/components/erp/ui/botoes';
import { CAMPO, ROTULO } from '@/components/erp/ui/campos';
import { classeDeBotao } from '@/components/erp/ui/estilos';

const estadoInicial: ResultadoSetup = { ok: false };

function Formulario() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [estado, acao] = useFormState(definirSenha, estadoInicial);

  if (estado.ok) {
    return (
      <div className="space-y-4">
        <p className="rounded-[7px] border border-ok/40 px-3 py-2 text-sm text-ok">
          Senha definida. O token não vale mais.
        </p>
        <Link href="/rodolfo/login" className={classeDeBotao('primario', 'w-full')}>
          Entrar
        </Link>
      </div>
    );
  }

  if (!token) {
    return (
      <p className="rounded-[7px] border border-atencao/40 px-3 py-2 text-sm text-atencao">
        Abra este endereço com o token: <code>/rodolfo/setup?token=…</code>
        <br />O link completo aparece no log do serviço <code>web</code> no Dokploy. Para redefinir a senha, troque o{' '}
        <code>ADMIN_SETUP_TOKEN</code> no painel e faça o redeploy.
      </p>
    );
  }

  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <div>
        <label htmlFor="email" className={ROTULO}>
          Seu e-mail
        </label>
        <input id="email" name="email" type="email" required autoComplete="username" className={CAMPO} />
      </div>

      <div>
        <label htmlFor="senha" className={ROTULO}>
          Senha (mínimo 12 caracteres)
        </label>
        <input
          id="senha"
          name="senha"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className={CAMPO}
        />
      </div>

      <div>
        <label htmlFor="confirmacao" className={ROTULO}>
          Repita a senha
        </label>
        <input
          id="confirmacao"
          name="confirmacao"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className={CAMPO}
        />
      </div>

      {estado.erro && (
        <p role="alert" className="rounded-[7px] border border-erro/40 px-3 py-2 text-sm text-erro">
          {estado.erro}
        </p>
      )}

      <BotaoEnviar pendente="Salvando…" className="w-full">
        Definir senha
      </BotaoEnviar>

      <p className="text-[13px] text-suave">
        A senha não é gravada em log, relatório ou mensagem. Só o hash vai para o banco.
      </p>
    </form>
  );
}

export default function SetupPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-[28px] font-bold leading-tight">Definir senha</h1>
        <p className="mb-6 mt-1 text-sm text-suave">Primeiro acesso ou senha nova para o Espaço do Rodolfo.</p>
        <Suspense fallback={null}>
          <Formulario />
        </Suspense>
      </div>
    </div>
  );
}
