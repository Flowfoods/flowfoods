'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import type { EstadoCadastro } from './actions';
import {
  UNIDADES,
  custoPorUnidadeBase,
  formatarDinheiro,
  lerDinheiro,
  lerQuantidade,
  type Unidade,
} from '@/lib/erp/unidades';

const ROTULO =
  'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-surface/50';
const CAMPO =
  'w-full rounded-[7px] border border-white/[0.12] bg-black/40 px-3 py-2.5 text-sm text-surface outline-none transition placeholder:text-surface/25 focus:border-surface/40 aria-[invalid=true]:border-bright/70';

function Erro({ id, texto }: { id: string; texto?: string }) {
  if (!texto) return null;
  return (
    <p id={id} className="mt-1.5 text-[12px] text-bright">
      {texto}
    </p>
  );
}

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-[7px] bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? 'Salvando…' : 'Cadastrar insumo'}
    </button>
  );
}

/** `acao`: a server action de quem usa a tela (nível 1 por slug, ou a pessoa do parceiro pela sessão). */
export function FormInsumo({ acao: acaoDoServidor }: { acao: (anterior: EstadoCadastro, form: FormData) => Promise<EstadoCadastro> }) {
  const [estado, acao] = useFormState<EstadoCadastro, FormData>(acaoDoServidor, null);
  const [unidade, setUnidade] = useState<Unidade>('KG');
  const [conteudo, setConteudo] = useState('');
  const [preco, setPreco] = useState('');
  const nomeRef = useRef<HTMLInputElement>(null);

  // Depois de salvar: limpa e devolve o foco ao nome, pronto para o próximo.
  useEffect(() => {
    if (estado?.ok) {
      setConteudo('');
      setPreco('');
      if (nomeRef.current) {
        nomeRef.current.value = '';
        nomeRef.current.focus();
      }
    }
  }, [estado]);

  const erros = estado && !estado.ok ? estado.erros : {};
  const u = UNIDADES[unidade];

  // Só prévia: o custo que vale é o que o servidor calcula e grava.
  const q = lerQuantidade(conteudo);
  const p = lerDinheiro(preco);
  const previa = q && p !== null ? formatarDinheiro(custoPorUnidadeBase(p, q)) : null;

  return (
    <form action={acao} className="space-y-4" noValidate>
      <div>
        <label htmlFor="nome" className={ROTULO}>
          Nome do insumo
        </label>
        <input
          ref={nomeRef}
          id="nome"
          name="nome"
          required
          maxLength={80}
          autoComplete="off"
          placeholder="Ex.: Blend bovino 180 g"
          className={CAMPO}
          aria-invalid={!!erros.nome}
          aria-describedby="nome-erro"
        />
        <Erro id="nome-erro" texto={erros.nome} />
      </div>

      <fieldset>
        <legend className={ROTULO}>Unidade base</legend>
        <div className="grid grid-cols-3 gap-1 rounded-[9px] border border-white/[0.09] bg-black/40 p-1">
          {(Object.keys(UNIDADES) as Unidade[]).map((k) => (
            <label key={k} className="relative">
              <input
                type="radio"
                name="unidade"
                value={k}
                checked={unidade === k}
                onChange={() => setUnidade(k)}
                className="peer sr-only"
              />
              <span className="block cursor-pointer rounded-[6px] py-1.5 text-center text-[12px] text-surface/55 transition peer-checked:bg-white/[0.1] peer-checked:text-surface peer-focus-visible:ring-2 peer-focus-visible:ring-bright/60">
                {UNIDADES[k].nome}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="conteudo" className={ROTULO}>
            Embalagem
          </label>
          <div className="relative">
            <input
              id="conteudo"
              name="conteudo"
              inputMode="decimal"
              placeholder="5"
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              className={`${CAMPO} pr-10 text-right tabular-nums`}
              aria-invalid={!!erros.conteudo}
              aria-describedby="conteudo-erro"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12px] text-surface/40">
              {u.sigla}
            </span>
          </div>
          <Erro id="conteudo-erro" texto={erros.conteudo} />
        </div>
        <div>
          <label htmlFor="preco" className={ROTULO}>
            Preço pago
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[12px] text-surface/40">
              R$
            </span>
            <input
              id="preco"
              name="preco"
              inputMode="decimal"
              placeholder="89,90"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              className={`${CAMPO} pl-9 text-right tabular-nums`}
              aria-invalid={!!erros.preco}
              aria-describedby="preco-erro"
            />
          </div>
          <Erro id="preco-erro" texto={erros.preco} />
        </div>
      </div>

      <div className="flex items-baseline justify-between border-t border-white/[0.07] pt-3 text-[12px]">
        <span className="text-surface/45">Custo por {u.sigla}</span>
        <span className="font-display text-lg font-bold tabular-nums text-surface">
          {previa ?? <span className="text-surface/25">—</span>}
        </span>
      </div>

      {erros.geral && <p className="text-[12px] text-bright">{erros.geral}</p>}
      <Enviar />
      <p aria-live="polite" className="min-h-[1rem] text-center text-[12px] text-success">
        {estado?.ok ? `“${estado.nome}” cadastrado.` : ''}
      </p>
    </form>
  );
}
