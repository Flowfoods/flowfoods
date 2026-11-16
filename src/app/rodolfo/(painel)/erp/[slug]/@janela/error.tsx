'use client';

/**
 * Janela de módulo (UX-MOD-2): erro ANTES do quadro da janela (o quadro também consulta o parceiro e a visão). Sem este
 * limite, a falha subiria e trocaria a página inteira. Aparece como uma janela pequena por cima da página de trás, com
 * "Tentar de novo" (busca de novo no servidor) e "Fechar" (volta à página de trás). Nada do servidor é mostrado.
 */

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { Aviso } from '@/components/erp/ui/superficies';
import { classeDeBotao } from '@/components/erp/ui/estilos';

export default function ErroAoAbrirAJanela({ retry }: { error: unknown; retry: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
    return () => {
      if (el?.open) el.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label="Não foi possível abrir esta tela"
      className="ff-dialogo w-[min(480px,calc(100vw-24px))] p-5"
      onCancel={(e) => {
        e.preventDefault();
        router.back();
      }}
    >
      <Aviso tom="erro" titulo="Não foi possível abrir esta tela agora.">
        Tente de novo em instantes. A página de trás continua como estava.
      </Aviso>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => retry()} className={classeDeBotao('primario')}>
          Tentar de novo
        </button>
        <button type="button" onClick={() => router.back()} className={classeDeBotao('secundario')}>
          Fechar
        </button>
      </div>
    </dialog>
  );
}
