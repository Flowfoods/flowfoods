'use client';

/**
 * L.1 — "Excluir de vez": só aparece para insumo sem nenhum vínculo. A caixa de confirmação é obrigatória (a regra confere no
 * servidor também) e o botão diz o nome do insumo. Erro (inclusive "passou a ter vínculos agora há pouco") aparece aqui mesmo,
 * sem apagar nada; o botão não dispara duas vezes.
 */

import { useFormState } from 'react-dom';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, Erro, MARCAR } from '../../ui/campos';
import { ErroGeral } from '../cadastro/erros';
import { SalvandoAnunciado, useAcaoSegura } from '../cadastro/anuncio';
import type { AcaoDeCadastro, EstadoCadastro } from '../cadastro/estado';

export function FormExcluir({ acao, nome, de, recarregar }: { acao: AcaoDeCadastro; nome: string; de: string; recarregar: string }) {
  const acaoSegura = useAcaoSegura(acao);
  const [estado, enviar] = useFormState<EstadoCadastro, FormData>(acaoSegura, null);
  return (
    <form action={enviar} noValidate className="space-y-3">
      {de && <input type="hidden" name="de" value={de} />}
      <input type="hidden" name="origem" value="lista" />
      <SalvandoAnunciado texto="Excluindo…" />
      <ErroGeral estado={estado} recarregar={recarregar} />
      <div>
        <label className="flex min-h-11 cursor-pointer items-start gap-2.5 text-sm text-texto">
          <input
            type="checkbox"
            name="confirmo"
            value="sim"
            required
            aria-required="true"
            aria-invalid={!!estado?.erros.confirmo}
            aria-describedby={[`excluir-ajuda`, estado?.erros.confirmo ? 'excluir-confirmo-erro' : ''].filter(Boolean).join(' ')}
            className={`${MARCAR} mt-0.5`}
          />
          <span>
            Entendi que excluir “{nome}” de vez apaga o cadastro e <strong className="font-semibold">não dá para desfazer</strong>.
          </span>
        </label>
        <p id="excluir-ajuda" className={AJUDA}>
          O histórico guarda quem excluiu e quando. Se houver dúvida, desative em vez de excluir: dá para reativar depois.
        </p>
        <Erro id="excluir-confirmo-erro" texto={estado?.erros.confirmo} />
      </div>
      <BotaoEnviar variante="perigo" pendente="Excluindo…" className="w-full sm:w-auto">
        Excluir “{nome}” de vez
      </BotaoEnviar>
    </form>
  );
}
