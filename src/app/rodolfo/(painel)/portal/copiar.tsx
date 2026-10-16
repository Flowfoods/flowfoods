'use client';

import { useState } from 'react';
import { classeDeBotao } from '@/components/erp/ui/estilos';

/** Link do cliente com botão de copiar — é o que vai colado no WhatsApp. */
export function CopiarLink({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <code className="min-w-0 flex-1 break-all rounded-[7px] border border-linha bg-campo px-3 py-2.5 text-[13px] text-texto">
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
        className={classeDeBotao('secundario', 'shrink-0')}
      >
        {copiado ? 'Copiado' : 'Copiar link'}
      </button>
    </div>
  );
}
