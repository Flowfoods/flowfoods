'use client';

/**
 * Peças de escolha da Equipe: etiqueta marcável (setor, loja), cartão de opção
 * (perfil) e a grade de permissões por módulo. Kairu Dark: borda fina, escolha
 * marcada em creme sobre preto; o vermelho fica só na caixinha marcada.
 */

import type { ReactNode } from 'react';
import { CATALOGO, type ModuloDoCatalogo } from '@/lib/erp/permissoes';
import { classeDeBotao } from '../../ui/estilos';

/** Etiqueta marcável (checkbox ou radio por baixo, acessível pelo teclado). */
export function Etiqueta({
  name,
  value,
  checked,
  onChange,
  tipo = 'checkbox',
  disabled,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (marcado: boolean) => void;
  tipo?: 'checkbox' | 'radio';
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={`inline-flex select-none items-center rounded-full border px-3 py-1.5 text-[12px] transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-texto/40 ${
        checked
          ? 'border-texto bg-texto font-semibold text-fundo'
          : 'border-linha-forte text-suave hover:border-texto/40 hover:text-texto'
      } ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
    >
      <input
        type={tipo}
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.checked)}
        className="sr-only"
      />
      {children}
    </label>
  );
}

/** Cartão de opção (perfil, rede inteira × lojas): título, frase, marcador redondo. */
export function Cartao({
  name,
  value,
  checked,
  onChange,
  titulo,
  detalhe,
  nota,
  disabled,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  titulo: string;
  detalhe?: ReactNode;
  nota?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex gap-3 rounded-[9px] border px-3.5 py-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-texto/40 ${
        checked ? 'border-texto/60 bg-texto/[0.05]' : 'border-linha hover:border-texto/35'
      } ${disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'}`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="mt-[3px] h-3.5 w-3.5 shrink-0 accent-[rgb(var(--ff-acao))]"
      />
      <span className="min-w-0">
        <span className="flex flex-wrap items-baseline gap-x-2 text-[14px] font-medium text-texto">
          {titulo}
          {nota && <span className="text-[12px] font-normal text-suave">{nota}</span>}
        </span>
        {detalhe && <span className="mt-0.5 block text-[12px] leading-snug text-suave">{detalhe}</span>}
      </span>
    </label>
  );
}

/**
 * Grade de permissões por módulo, com rótulos humanos. `marcada` e `alternar`
 * vêm de quem usa (perfil: lista direta; pessoa: perfil + ajuste). O que o
 * ator não tem aparece travado: ninguém dá o que não tem.
 */
export function GradeDePermissoes({
  idBase,
  marcada,
  alternar,
  concediveis,
  destaque,
}: {
  idBase: string;
  marcada: (p: string) => boolean;
  alternar: (p: string) => void;
  concediveis: ReadonlySet<string>;
  /** Permissões ajustadas (diferentes do perfil): ganham a marca "ajuste". */
  destaque?: (p: string) => boolean;
}) {
  return (
    <div className="space-y-4">
      {CATALOGO.map((m) => (
        <fieldset key={m.chave} className="min-w-0">
          <legend className="mb-1.5 flex items-baseline gap-2 text-[12px] font-semibold text-suave">
            {m.rotulo}
            {(m as ModuloDoCatalogo).emBreve && (
              <span className="font-normal normal-case tracking-normal text-suave">· tela em breve</span>
            )}
          </legend>
          <div className="grid gap-x-4 sm:grid-cols-2">
            {Object.entries(m.permissoes).map(([p, d]) => {
              const id = `${idBase}-${p}`;
              const pode = concediveis.has(p);
              return (
                <label
                  key={p}
                  htmlFor={id}
                  className={`flex items-start gap-2.5 py-1.5 text-[13px] leading-snug ${
                    pode ? 'cursor-pointer text-texto hover:text-texto' : 'cursor-not-allowed text-suave'
                  }`}
                >
                  <input
                    id={id}
                    type="checkbox"
                    checked={marcada(p)}
                    disabled={!pode}
                    onChange={() => alternar(p)}
                    className="mt-[2px] h-3.5 w-3.5 shrink-0 accent-[rgb(var(--ff-acao))]"
                  />
                  <span className="min-w-0">
                    {d.rotulo}
                    {destaque?.(p) && <span className="ml-1.5 text-[12px] text-suave">· ajuste</span>}
                    {!pode && <span className="ml-1.5 text-[12px]">· fora do seu acesso</span>}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

/**
 * Segundo passo, na própria tela (não `window.confirm`), para o que tira
 * acesso de alguém. O botão de confirmar é o único vermelho da caixa.
 */
export function Confirmacao({
  titulo,
  detalhe,
  confirmar,
  onConfirmar,
  onCancelar,
  tipoConfirmar = 'button',
}: {
  titulo: string;
  detalhe?: string;
  confirmar: string;
  onConfirmar?: () => void;
  onCancelar: () => void;
  /** 'submit': o botão envia o formulário em volta (ex.: Desativar). */
  tipoConfirmar?: 'button' | 'submit';
}) {
  return (
    <div
      role="alertdialog"
      aria-label={titulo}
      className="space-y-3 rounded-[11px] border border-linha-forte bg-campo p-4"
    >
      <div>
        <p className="text-[14px] font-semibold text-texto">{titulo}</p>
        {detalhe && <p className="mt-1 text-[13px] leading-relaxed text-suave">{detalhe}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type={tipoConfirmar} onClick={onConfirmar} autoFocus className={classeDeBotao('primario')}>
          {confirmar}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="whitespace-nowrap rounded-[7px] border border-linha-forte px-4 py-2 text-[13px] font-medium text-texto transition hover:border-texto/40 hover:text-texto"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
