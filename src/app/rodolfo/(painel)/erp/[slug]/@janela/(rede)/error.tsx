'use client';

/**
 * Janela de módulo (UX-MOD-2): se a tela falhar ao abrir na janela, o erro aparece DENTRO da janela, com "Tentar de novo"
 * (busca a tela de novo no servidor); a página de trás continua como estava e Fechar volta a ela. Nada do servidor é
 * mostrado.
 */

import { Aviso } from '@/components/erp/ui/superficies';
import { classeDeBotao } from '@/components/erp/ui/estilos';

export default function ErroNaJanela({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="space-y-4">
      <Aviso tom="erro" titulo="Não foi possível abrir esta tela agora.">
        Tente de novo em instantes. A página de trás continua como estava.
      </Aviso>
      <button type="button" onClick={() => retry()} className={classeDeBotao('secundario')}>
        Tentar de novo
      </button>
    </div>
  );
}
