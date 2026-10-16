'use client';

import { useState, type ReactNode } from 'react';

/** Botão pequeno que abre um bloco logo abaixo (editar perfil na própria linha). */
export function Expansivel({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="space-y-3">
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
        className="whitespace-nowrap rounded-[7px] border border-linha-forte px-3 py-1.5 text-[12px] font-medium text-texto transition hover:border-texto/40 hover:text-texto aria-[expanded=true]:border-texto/60 aria-[expanded=true]:text-texto"
      >
        {aberto ? 'Fechar' : rotulo}
      </button>
      {aberto && <div className="rounded-[11px] border border-linha bg-campo p-4">{children}</div>}
    </div>
  );
}
