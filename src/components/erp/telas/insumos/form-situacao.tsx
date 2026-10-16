'use client';

/**
 * Desativar ou reativar (insumo ou embalagem), com motivo opcional que vai
 * para o histórico. Desativar não apaga: some da lista padrão e o histórico
 * fica. Recusa e conflito aparecem aqui mesmo.
 */

import { useFormState } from 'react-dom';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, CAMPO, ROTULO } from '../../ui/campos';
import type { AcaoDeInsumo, EstadoInsumo } from './estado';

export function FormSituacao({
  acao,
  ativo,
  oQue,
  idBase,
}: {
  acao: AcaoDeInsumo;
  /** Situação de agora: ativo → o botão desativa. */
  ativo: boolean;
  /** "insumo" | "embalagem" */
  oQue: string;
  idBase: string;
}) {
  const [estado, enviar] = useFormState<EstadoInsumo, FormData>(acao, null);
  return (
    <form action={enviar} className="space-y-3">
      <input type="hidden" name="ativo" value={ativo ? 'nao' : 'sim'} />
      <p className="text-sm text-suave">
        {ativo
          ? `Desativar tira o ${oQue} da lista e da busca padrão. Nada é apagado: o histórico continua e dá para reativar.`
          : `Este ${oQue} está desativado. Reativar devolve ele à lista.`}
      </p>
      <div>
        <label htmlFor={`${idBase}-motivo`} className={ROTULO}>
          Motivo <span className="font-normal text-suave">(opcional)</span>
        </label>
        <input
          id={`${idBase}-motivo`}
          name="motivo"
          maxLength={200}
          autoComplete="off"
          placeholder={ativo ? 'Ex.: saiu do cardápio' : 'Ex.: voltou ao cardápio'}
          className={CAMPO}
          aria-describedby={`${idBase}-motivo-ajuda`}
        />
        <p id={`${idBase}-motivo-ajuda`} className={AJUDA}>
          Fica no histórico, ao lado de quem fez.
        </p>
      </div>
      {estado?.erros.geral && (
        <p role="alert" className="text-[13px] text-erro">
          {estado.erros.geral}
        </p>
      )}
      <BotaoEnviar variante={ativo ? 'perigo' : 'secundario'} className="w-full" pendente={ativo ? 'Desativando…' : 'Reativando…'}>
        {ativo ? `Desativar ${oQue}` : `Reativar ${oQue}`}
      </BotaoEnviar>
    </form>
  );
}
