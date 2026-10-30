'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { classeDeBotao } from '../ui/estilos';

/** Atualização manual de todas as fontes do resumo; nenhum polling ou dado local. */
export function AtualizarResumo() {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [solicitou, definirSolicitou] = useState(false);
  const [falhou, definirFalhou] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <button
        type="button"
        aria-disabled={pendente}
        aria-busy={pendente}
        onClick={() => {
          if (pendente) return;
          definirSolicitou(true);
          definirFalhou(false);
          iniciar(() => {
            try { router.refresh(); }
            catch { definirFalhou(true); }
          });
        }}
        className={classeDeBotao('secundario', 'sm:min-h-11 aria-disabled:cursor-wait aria-disabled:opacity-55')}
      >
        {pendente ? 'Atualizando…' : 'Atualizar resumo'}
      </button>
      <span role="status" aria-live="polite" className="text-[12px] text-suave">
        {pendente ? 'Atualizando os indicadores e as pendências…'
          : falhou ? 'Não foi possível solicitar a atualização. Tente novamente.'
            : solicitou ? 'Confira os indicadores e os avisos do resumo.' : ''}
      </span>
    </div>
  );
}
