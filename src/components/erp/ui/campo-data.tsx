'use client';

/**
 * Data digitada como no Brasil: dd/mm/aaaa, em qualquer navegador (o
 * `type="date"` segue o idioma do aparelho e mostra mm/dd/yyyy em inglês).
 * As barras entram sozinhas; o servidor lê o texto (`lerData` aceita
 * dd/mm/aaaa e aaaa-mm-dd) e decide se a data vale.
 *
 * Herança da 1.5 (fiscais): data incompleta ou impossível ("31/02/2026",
 * "14/10") mostra o erro embaixo do campo ao sair dele, e o navegador não
 * envia o formulário (`setCustomValidity`) — antes, o filtro ignorava a data
 * em silêncio e a nota só sabia do erro depois de enviar.
 */

import { useState, type InputHTMLAttributes } from 'react';
import { erroDoFormatoDaData, mascararData } from '@/lib/erp/compra-campos';
import { CAMPO } from './campos';

export function CampoData({ className = '', id, onBlur, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [erro, setErro] = useState<string | null>(null);
  const idDoErro = `${id ?? 'data'}-formato`;
  const conferir = (el: HTMLInputElement) => {
    const e = erroDoFormatoDaData(el.value);
    el.setCustomValidity(e ?? '');
    setErro(e);
  };
  const descrito = [props['aria-describedby'], erro ? idDoErro : null].filter(Boolean).join(' ') || undefined;
  return (
    <>
      <input
        {...props}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        placeholder="dd/mm/aaaa"
        aria-invalid={erro ? true : props['aria-invalid']}
        aria-describedby={descrito}
        onInput={(e) => {
          const el = e.currentTarget;
          el.value = mascararData(el.value);
          // Enquanto digita, só limpa o erro (não acusa a data pela metade).
          if (erro && !erroDoFormatoDaData(el.value)) conferir(el);
          else if (erro) el.setCustomValidity(erroDoFormatoDaData(el.value) ?? '');
        }}
        onBlur={(e) => {
          conferir(e.currentTarget);
          onBlur?.(e);
        }}
        onInvalid={(e) => conferir(e.currentTarget)}
        className={`${CAMPO} tabular-nums ${className}`}
      />
      {erro && (
        <p id={idDoErro} role="alert" className="mt-1.5 text-[13px] text-erro">
          {erro}
        </p>
      )}
    </>
  );
}
