/**
 * Peças comuns das telas de faturamento (2.1): o erro geral do dia (com
 * "Recarregar" quando foi conflito: outra pessoa gravou antes) e o rótulo do
 * canal numa linha de tabela.
 */

import { classeDeBotao } from '../../ui/estilos';
import type { EstadoDoDia } from './estado';

export function ErroGeralDoDia({ estado, recarregar }: { estado: EstadoDoDia; recarregar: string }) {
  if (!estado?.erros.geral) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-erro/40 px-4 py-3 text-sm">
      <p className="text-erro">{estado.erros.geral}</p>
      {estado.conflito && (
        <a href={recarregar} className={classeDeBotao('secundario')}>
          Recarregar
        </a>
      )}
    </div>
  );
}
