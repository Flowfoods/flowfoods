'use client';

/**
 * Cancelar a nota (1.5): motivo obrigatório (vai para o histórico). Cancelar
 * não apaga: a nota sai do custo na hora e cada insumo volta ao preço da
 * compra anterior. Confirmação na própria tela antes de enviar.
 */

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, CAMPO, Erro, ROTULO } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';
import type { AcaoDeNota, EstadoNota } from './estado';

export function FormCancelarNota({ acao }: { acao: AcaoDeNota }) {
  const [estado, enviar] = useFormState<EstadoNota, FormData>(acao, null);
  const [aberto, setAberto] = useState(false);
  if (!aberto && !estado) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-suave">Nota errada ou devolvida? Cancelar tira a nota do custo; ela continua no histórico.</p>
        <button type="button" onClick={() => setAberto(true)} className={classeDeBotao('perigo', 'w-full')}>
          Cancelar esta nota
        </button>
      </div>
    );
  }
  return (
    <form action={enviar} className="space-y-3">
      <div>
        <label htmlFor="cancelar-motivo" className={ROTULO}>
          Por que a nota sai?
        </label>
        <input
          id="cancelar-motivo"
          name="motivo"
          required
          minLength={3}
          maxLength={200}
          autoComplete="off"
          placeholder="Ex.: digitada em dobro"
          className={CAMPO}
          aria-invalid={!!estado?.erros.motivo}
          aria-describedby={`cancelar-motivo-ajuda${estado?.erros.motivo ? ' cancelar-motivo-erro' : ''}`}
        />
        <p id="cancelar-motivo-ajuda" className={AJUDA}>
          Fica no histórico, ao lado de quem cancelou. O custo dos insumos volta ao da compra anterior.
        </p>
        <Erro id="cancelar-motivo-erro" texto={estado?.erros.motivo} />
      </div>
      {estado?.erros.geral && (
        <p role="alert" className="text-[13px] text-erro">
          {estado.erros.geral}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <BotaoEnviar variante="perigo" className="w-full" pendente="Cancelando…">
          Confirmar o cancelamento
        </BotaoEnviar>
        <button type="button" onClick={() => setAberto(false)} className={classeDeBotao('fantasma', 'w-full')}>
          Manter a nota
        </button>
      </div>
    </form>
  );
}
