'use client';

/**
 * I.1b — "Confirmar a conservação": para o insumo antigo que está em Seco sem ninguém ter escolhido (o servidor assumia Seco).
 * Não muda a conservação nem o prazo: só grava que uma pessoa conferiu. Se a conservação for outra, o caminho é Editar.
 */

import { useFormState } from 'react-dom';
import { BotaoEnviar } from '../../ui/botoes';
import type { AcaoDeCadastro, EstadoCadastro } from '../cadastro/estado';

export function FormConfirmarConservacao({ acao, rotulo }: { acao: AcaoDeCadastro; /** A conservação gravada, por extenso ("Seco"). */ rotulo: string }) {
  const [estado, enviar] = useFormState<EstadoCadastro, FormData>(acao, null);
  return (
    <form action={enviar} className="mt-2 space-y-2">
      {estado?.erros.geral && (
        <p role="alert" className="text-[13px] text-erro">
          {estado.erros.geral}
        </p>
      )}
      <BotaoEnviar variante="secundario" pendente="Confirmando…">
        Confirmar que é {rotulo.toLowerCase()}
      </BotaoEnviar>
    </form>
  );
}
