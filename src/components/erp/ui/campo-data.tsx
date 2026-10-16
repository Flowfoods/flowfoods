'use client';

/**
 * Data digitada como no Brasil: dd/mm/aaaa, em qualquer navegador (o
 * `type="date"` segue o idioma do aparelho e mostra mm/dd/yyyy em inglês).
 * As barras entram sozinhas; o servidor lê o texto (`lerData` aceita
 * dd/mm/aaaa e aaaa-mm-dd) e decide se a data vale.
 */

import type { InputHTMLAttributes } from 'react';
import { mascararData } from '@/lib/erp/compra-campos';
import { CAMPO } from './campos';


export function CampoData({ className = '', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={10}
      placeholder="dd/mm/aaaa"
      onInput={(e) => {
        const el = e.currentTarget;
        el.value = mascararData(el.value);
      }}
      className={`${CAMPO} tabular-nums ${className}`}
    />
  );
}
