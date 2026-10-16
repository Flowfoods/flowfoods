'use client';

/** Cadastro de uma linha só (nome): loja ou marca. Campo e botão na mesma linha. */

import { useEffect, useRef } from 'react';
import { useFormState } from 'react-dom';
import { BotaoEnviar } from '../../ui/botoes';
import { CAMPO, Erro, Resultado, type EstadoForm } from '../../ui/campos';

/** `acao`: a server action de quem usa (nível 1 por slug, ou a pessoa do parceiro pela sessão). */
export function FormNome({
  acao,
  tipo,
}: {
  acao: (anterior: EstadoForm, form: FormData) => Promise<EstadoForm>;
  tipo: 'loja' | 'marca';
}) {
  const [estado, enviar] = useFormState<EstadoForm, FormData>(acao, null);
  const ref = useRef<HTMLInputElement>(null);
  const id = `nome-${tipo}`;

  useEffect(() => {
    if (estado?.ok && ref.current) {
      ref.current.value = '';
      ref.current.focus();
    }
  }, [estado]);

  return (
    <form action={enviar} noValidate className="space-y-1.5">
      <label htmlFor={id} className="sr-only">
        {tipo === 'loja' ? 'Nome da loja' : 'Nome da marca'}
      </label>
      <div className="flex gap-2">
        <input
          ref={ref}
          id={id}
          name="nome"
          required
          maxLength={60}
          autoComplete="off"
          placeholder={tipo === 'loja' ? 'Nome da nova loja' : 'Nome da nova marca'}
          className={`${CAMPO} min-w-0 flex-1`}
          aria-invalid={!!estado?.erros?.nome}
          aria-describedby={`${id}-erro`}
        />
        <BotaoEnviar pendente="Salvando…" variante="secundario">
          {tipo === 'loja' ? 'Cadastrar loja' : 'Cadastrar marca'}
        </BotaoEnviar>
      </div>
      <Erro id={`${id}-erro`} texto={estado?.erros?.nome} />
      <Resultado estado={estado} />
    </form>
  );
}
