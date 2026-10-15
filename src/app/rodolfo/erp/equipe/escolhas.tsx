'use client';

/**
 * Peças de escolha da Equipe: etiqueta marcável (setor, loja), cartão de opção
 * (perfil) e a grade de permissões por módulo. Kairu Dark: borda fina, escolha
 * marcada em creme sobre preto; o vermelho fica só na caixinha marcada.
 */

import type { ReactNode } from 'react';
import { CATALOGO } from '@/lib/erp/permissoes';

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
      className={`inline-flex select-none items-center rounded-full border px-3 py-1.5 text-[12px] transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-surface/40 ${
        checked
          ? 'border-surface bg-surface font-semibold text-footer'
          : 'border-white/[0.14] text-surface/70 hover:border-surface/40 hover:text-surface'
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
      className={`flex gap-3 rounded-[9px] border px-3.5 py-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-surface/40 ${
        checked ? 'border-surface/60 bg-white/[0.05]' : 'border-white/[0.1] hover:border-white/[0.22]'
      } ${disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'}`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="mt-[3px] h-3.5 w-3.5 shrink-0 accent-primary"
      />
      <span className="min-w-0">
        <span className="flex flex-wrap items-baseline gap-x-2 text-[14px] font-medium text-surface">
          {titulo}
          {nota && <span className="text-[11px] font-normal text-surface/45">{nota}</span>}
        </span>
        {detalhe && <span className="mt-0.5 block text-[12px] leading-snug text-surface/50">{detalhe}</span>}
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
          <legend className="mb-1.5 flex items-baseline gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-surface/50">
            {m.rotulo}
            {'emBreve' in m && m.emBreve && (
              <span className="font-normal normal-case tracking-normal text-surface/35">· tela em breve</span>
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
                    pode ? 'cursor-pointer text-surface/80 hover:text-surface' : 'cursor-not-allowed text-surface/35'
                  }`}
                >
                  <input
                    id={id}
                    type="checkbox"
                    checked={marcada(p)}
                    disabled={!pode}
                    onChange={() => alternar(p)}
                    className="mt-[2px] h-3.5 w-3.5 shrink-0 accent-primary"
                  />
                  <span className="min-w-0">
                    {d.rotulo}
                    {destaque?.(p) && <span className="ml-1.5 text-[11px] text-surface/45">· ajuste</span>}
                    {!pode && <span className="ml-1.5 text-[11px]">· fora do seu acesso</span>}
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
