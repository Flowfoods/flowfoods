'use client';

/**
 * Novo Parceiro Flow. O link (slug) acompanha o nome até a pessoa mexer
 * nele; daí em diante fica o que ela escreveu. O servidor confere de novo.
 */

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useFormState } from 'react-dom';
import { gerarSlug } from '@/lib/erp/slug';
import { BotaoEnviar } from '@/components/erp/ui/botoes';
import { AJUDA, CAMPO, Erro, ROTULO, type EstadoForm } from '@/components/erp/ui/campos';
import { Segmentos } from '@/components/erp/ui/segmentos';
import { acaoCriarParceiro } from './actions';

type Estado = (EstadoForm & { slug?: string }) | null;

export function FormParceiro() {
  const [estado, enviar] = useFormState<Estado, FormData>(acaoCriarParceiro, null);
  const [nome, setNome] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEditado, setSlugEditado] = useState(false);
  const [status, setStatus] = useState<'ATIVO' | 'RASCUNHO'>('ATIVO');
  const nomeRef = useRef<HTMLInputElement>(null);
  const erros = estado && !estado.ok ? (estado.erros ?? {}) : {};

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
        <div className="flex items-stretch overflow-hidden rounded-[7px] border border-linha-forte bg-campo focus-within:border-texto/40">
          <span className="flex items-center whitespace-nowrap border-r border-linha px-2.5 text-[13px] text-suave">
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
            className="min-h-11 min-w-0 flex-1 bg-transparent px-3 text-sm sm:min-h-[42px] text-texto outline-none placeholder:text-suave/70"
            aria-invalid={!!erros.slug}
            aria-describedby="novo-slug-erro novo-slug-dica"
          />
        </div>
        <p id="novo-slug-dica" className={AJUDA}>
          Gerado do nome; pode editar agora. Depois de criado, não muda.
        </p>
        <Erro id="novo-slug-erro" texto={erros.slug} />
      </div>

      <Segmentos
        nome="status"
        legenda="Nasce como"
        opcoes={[
          ['ATIVO', 'Ativo'],
          ['RASCUNHO', 'Aguardando liberação'],
        ]}
        valor={status}
        aoMudar={setStatus}
      />

      {erros.geral && <p className="text-[13px] text-erro">{erros.geral}</p>}
      <BotaoEnviar className="w-full" pendente="Criando…">
        Criar parceiro
      </BotaoEnviar>
      <p aria-live="polite" className="min-h-[1.25rem] text-center text-[13px] text-ok">
        {estado?.ok && estado.slug && (
          <>
            {estado.mensagem}{' '}
            <Link href={`/rodolfo/erp/${estado.slug}/lojas`} className="underline underline-offset-2">
              Cadastrar lojas e marcas
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
