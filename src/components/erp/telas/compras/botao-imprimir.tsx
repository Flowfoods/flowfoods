'use client';

/** L.2: "Imprimir ou salvar em PDF" da versão para impressão. O navegador faz o PDF; a página já sai sem menu e sem botões. */

import { Printer } from 'lucide-react';
import { classeDeBotao } from '../../ui/estilos';

export function BotaoImprimir() {
  return (
    <button type="button" onClick={() => window.print()} className={classeDeBotao('primario')}>
      <Printer size={16} aria-hidden />
      Imprimir ou salvar em PDF
    </button>
  );
}
