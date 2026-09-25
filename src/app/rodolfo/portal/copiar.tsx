'use client';

import { useState } from 'react';

/** Link do cliente com botão de copiar — é o que vai colado no WhatsApp. */
export function CopiarLink({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <code className="min-w-0 flex-1 break-all rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-surface/80">
        {url}
      </code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          } catch {
            window.prompt('Copie o link:', url);
          }
        }}
        className="min-h-[44px] shrink-0 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-bright"
      >
        {copiado ? 'Copiado' : 'Copiar link'}
      </button>
    </div>
  );
}
