'use client';

/**
 * Novo Parceiro Flow. O link (slug) acompanha o nome até a pessoa mexer
 * nele; daí em diante fica o que ela escreveu. O servidor confere de novo.
 */

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useFormState } from 'react-dom';
import { gerarSlug } from '@/lib/erp/slug';
import { CAMPO, Enviar, Erro, ROTULO, type EstadoForm } from './campos';
import { acaoCriarParceiro } from './actions';

type Estado = (EstadoForm & { slug?: string }) | null;

export function FormParceiro() {
  const [estado, enviar] = useFormState<Estado, FormData>(acaoCriarParceiro, null);
  const [nome, setNome] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEditado, setSlugEditado] = useState(false);
  const [status, setStatus] = useState<'ATIVO' | 'RASCUNHO'>('ATIVO');
  const nomeRef = useRef<HTMLInputElement>(null);
  const erros = estado && !estado.ok ? estado.erros ?? {} : {};

  useEffect(() => {
    if (estado?.ok) {
      setNome('');
      setSlug('');
      setSlugEditado(false);
      nomeRef.current?.focus();
    }
  }, [estado]);

  const slugMostrado = slugEditado ? slug : gerarSlug(nome);

  return (
    <form action={enviar} noValidate className="space-y-4">
      <div>
        <label htmlFor="novo-nome" className={ROTULO}>
          Nome do grupo
        </label>
        <input
          ref={nomeRef}
          id="novo-nome"
          name="nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          required
          maxLength={80}
          autoComplete="off"
          placeholder="Ex.: Grupo Valentin's"
          className={CAMPO}
          aria-invalid={!!erros.nome}
          aria-describedby="novo-nome-erro"
        />
        <Erro id="novo-nome-erro" texto={erros.nome} />
      </div>

      <div>
        <label htmlFor="novo-slug" className={ROTULO}>
          Link do parceiro
        </label>
        <div className="flex items-stretch overflow-hidden rounded-[7px] border border-white/[0.12] bg-black/40 focus-within:border-surface/40">
          <span className="flex items-center whitespace-nowrap border-r border-white/[0.08] px-2.5 text-[12px] text-surface/35">
            /erp/
          </span>
          <input
            id="novo-slug"
            name="slug"
            value={slugMostrado}
            onChange={(e) => {
              setSlugEditado(true);
              setSlug(e.target.value.toLowerCase());
            }}
            maxLength={48}
            autoComplete="off"
            spellCheck={false}
            placeholder="grupo-valentins"
            className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-surface outline-none placeholder:text-surface/25"
            aria-invalid={!!erros.slug}
            aria-describedby="novo-slug-erro novo-slug-dica"
          />
        </div>
        <p id="novo-slug-dica" className="mt-1.5 text-[11px] text-surface/35">
          Gerado do nome; pode editar agora. Depois de criado, não muda.
        </p>
        <Erro id="novo-slug-erro" texto={erros.slug} />
      </div>

      <fieldset>
        <legend className={ROTULO}>Nasce como</legend>
        <div className="grid grid-cols-2 gap-1 rounded-[9px] border border-white/[0.09] bg-black/40 p-1">
          {(
            [
              ['ATIVO', 'Ativo'],
              ['RASCUNHO', 'Aguardando liberação'],
            ] as const
          ).map(([v, r]) => (
            <label key={v} className="relative">
              <input
                type="radio"
                name="status"
                value={v}
                checked={status === v}
                onChange={() => setStatus(v)}
                className="peer sr-only"
              />
              <span className="block cursor-pointer rounded-[6px] py-1.5 text-center text-[12px] text-surface/55 transition peer-checked:bg-white/[0.1] peer-checked:text-surface peer-focus-visible:ring-2 peer-focus-visible:ring-bright/60">
                {r}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {erros.geral && <p className="text-[12px] text-bright">{erros.geral}</p>}
      <Enviar className="w-full">Criar parceiro</Enviar>
      <p aria-live="polite" className="min-h-[1rem] text-center text-[12px] text-success">
        {estado?.ok && estado.slug && (
          <>
            {estado.mensagem}{' '}
            <Link href={`/rodolfo/erp/${estado.slug}/estrutura`} className="underline underline-offset-2">
              Cadastrar lojas e marcas
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
