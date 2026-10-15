'use client';

/** Cadastro de uma linha só (nome): loja ou marca. Campo e botão na mesma linha. */

import { useEffect, useRef } from 'react';
import { useFormState } from 'react-dom';
import { CAMPO, Enviar, Erro, Resultado, type EstadoForm } from '../../campos';
import { acaoCadastrarLoja, acaoCadastrarMarca } from '../actions';

export function FormNome({ slug, tipo }: { slug: string; tipo: 'loja' | 'marca' }) {
  const acao = tipo === 'loja' ? acaoCadastrarLoja : acaoCadastrarMarca;
  const [estado, enviar] = useFormState<EstadoForm, FormData>(acao.bind(null, slug), null);
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
        <Enviar pendente="…">Adicionar</Enviar>
      </div>
      <Erro id={`${id}-erro`} texto={estado?.erros?.nome} />
      <Resultado estado={estado} />
    </form>
  );
}
