'use client';

import { useRef, useState } from 'react';

/** O link aparece uma vez só: caixa para copiar e a validade dita em uma frase. */
export function LinkGerado({ link, validade, whatsapp }: { link: string; validade?: string; whatsapp?: string | null }) {
  const [copiado, setCopiado] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Sem permissão de área de transferência: deixa selecionado para copiar à mão.
      campo.current?.select();
    }
    setCopiado(true);
  }

  return (
    <div className="space-y-2 rounded-[9px] border border-linha-forte bg-campo p-3">
      <div className="text-[12px] font-semibold text-suave">Link para criar a senha</div>
      <div className="flex gap-2">
        <input
          ref={campo}
          readOnly
          value={link}
          aria-label="Link para criar a senha"
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 truncate rounded-[7px] border border-linha bg-campo px-3 py-2 font-mono text-[12px] text-texto outline-none"
        />
        <button
          type="button"
          onClick={copiar}
          className="whitespace-nowrap rounded-[7px] border border-linha-forte px-3 py-2 text-[13px] font-semibold text-texto transition hover:border-texto/40 hover:bg-texto/[0.04]"
        >
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      {whatsapp && (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-[7px] border border-linha-forte px-3 text-[13px] font-semibold text-texto transition hover:border-texto/40 hover:bg-texto/[0.04] sm:min-h-10"
        >
          Abrir no WhatsApp
        </a>
      )}
      <p className="text-[12px] text-suave">
        Funciona uma vez só{validade ? `, até ${validade}` : ''}. Mande para a pessoa pelo WhatsApp: ela abre, cria a
        senha e entra em /entrar.
      </p>
    </div>
  );
}
