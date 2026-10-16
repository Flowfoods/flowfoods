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
        className="whitespace-nowrap rounded-[7px] border border-white/[0.14] px-3 py-1.5 text-[12px] font-medium text-surface/80 transition hover:border-surface/40 hover:text-surface aria-[expanded=true]:border-surface/50 aria-[expanded=true]:text-surface"
      >
        {aberto ? 'Fechar' : rotulo}
      </button>
      {aberto && <div className="rounded-[11px] border border-white/[0.09] bg-black/30 p-4">{children}</div>}
    </div>
  );
}
