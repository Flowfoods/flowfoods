'use client';

/**
 * Descartar a nota fiscal recebida (F.1b): motivo obrigatório (vai para o histórico). Aguardando conferência: só marca como
 * cancelada. Já conciliada: cancela também a nota de compra pelo caminho oficial (o estoque e o custo voltam) e marca o documento.
 * O cancelado não volta; a chave de acesso continua guardada, então o mesmo arquivo não entra de novo.
 */

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, CAMPO, Erro, ROTULO } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';
import type { AcaoDeDocumento, EstadoDocumento } from './documentos-estado';

export function FormCancelarDocumento({ acao, versao, conciliado }: { acao: AcaoDeDocumento; versao: string; conciliado: boolean }) {
  const [estado, enviar] = useFormState<EstadoDocumento, FormData>(acao, null);
  const [aberto, setAberto] = useState(false);
  if (!aberto && !estado) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-suave">
          {conciliado
            ? 'Nota fiscal errada ou devolvida? Descartar cancela também a nota de compra: o estoque e o custo voltam.'
            : 'Esta nota fiscal não é da casa, ou foi emitida de novo? Descartar tira da fila; ela continua no histórico.'}
        </p>
        <button type="button" onClick={() => setAberto(true)} className={classeDeBotao('perigo', 'w-full')}>
          Descartar esta nota fiscal
        </button>
      </div>
    );
  }
  return (
    <form action={enviar} className="space-y-3">
      <input type="hidden" name="versao" value={versao} />
      <div>
        <label htmlFor="descartar-motivo" className={ROTULO}>
          Por que a nota fiscal sai?
        </label>
        <input
          id="descartar-motivo"
          name="motivo"
          required
          minLength={3}
          maxLength={200}
          autoComplete="off"
          placeholder="Ex.: não é da nossa loja"
          className={CAMPO}
          aria-invalid={!!estado?.erros.motivo}
          aria-describedby={`descartar-motivo-ajuda${estado?.erros.motivo ? ' descartar-motivo-erro' : ''}`}
        />
        <p id="descartar-motivo-ajuda" className={AJUDA}>
          Fica no histórico, ao lado de quem descartou.
        </p>
        <Erro id="descartar-motivo-erro" texto={estado?.erros.motivo} />
      </div>
      {estado?.erros.geral && (
        <p role="alert" className="text-[13px] text-erro">
          {estado.erros.geral}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <BotaoEnviar variante="perigo" className="w-full" pendente="Descartando…">
          Confirmar o descarte
        </BotaoEnviar>
        <button type="button" onClick={() => setAberto(false)} className={classeDeBotao('fantasma', 'w-full')}>
          Manter a nota fiscal
        </button>
      </div>
    </form>
  );
}
