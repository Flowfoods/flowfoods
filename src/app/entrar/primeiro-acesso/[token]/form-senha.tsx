'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { acaoDefinirSenha, type EstadoSenha } from '../../actions';

const ROTULO = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-suave';
const CAMPO =
  'w-full rounded-[7px] border border-linha-forte bg-campo px-3.5 py-3 text-[15px] text-texto outline-none transition placeholder:text-suave/70 focus:border-texto/50 aria-[invalid=true]:border-erro';

function Botao({ texto }: { texto: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-[7px] bg-acao px-4 py-3 text-[15px] font-semibold text-white transition hover:bg-acao-hover disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? 'Salvando…' : texto}
    </button>
  );
}

export function FormSenha({ token, email, primeiraVez }: { token: string; email: string; primeiraVez: boolean }) {
  const [estado, enviar] = useFormState<EstadoSenha, FormData>(acaoDefinirSenha.bind(null, token), null);
  return (
    <form action={enviar} className="space-y-4" noValidate>
      {/* Para o gerenciador de senhas do celular guardar no lugar certo. */}
      <input type="email" name="email" value={email} autoComplete="username" readOnly hidden />
      <div>
        <label htmlFor="senha" className={ROTULO}>
          {primeiraVez ? 'Crie sua senha' : 'Nova senha'}
        </label>
        <input
          id="senha"
          name="senha"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          className={CAMPO}
          aria-invalid={!!estado}
          aria-describedby="senha-dica"
        />
        <p id="senha-dica" className="mt-1.5 text-[12px] text-suave">
          Pelo menos 10 caracteres. Uma frase curta é fácil de lembrar.
        </p>
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
          autoComplete="new-password"
          className={CAMPO}
          aria-invalid={!!estado}
        />
      </div>
      {estado && (
        <p role="alert" className="text-[13px] text-erro">
          {estado.erro}
        </p>
      )}
      <Botao texto={primeiraVez ? 'Criar senha' : 'Salvar senha nova'} />
    </form>
  );
}
