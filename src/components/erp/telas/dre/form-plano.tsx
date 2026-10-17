'use client';

/**
 * Peças do plano de contas (2.2a): criar linha, renomear e ocultar/reexibir. Cada
 * uma fica na própria tela e diz o resultado ali. O servidor decide (permissão, nome
 * único, versão lida): duas abas não se atropelam.
 */

import { useFormState } from 'react-dom';
import { GRUPOS_DE_DESPESA, ROTULO_DO_GRUPO } from '@/lib/erp/dre-plano';
import { BotaoEnviar } from '../../ui/botoes';
import { CAMPO, Erro, ROTULO } from '../../ui/campos';
import type { AcaoLocal, EstadoLocal } from './estado';

function Retorno({ estado }: { estado: EstadoLocal }) {
  return (
    <p aria-live="polite" className="min-h-5 text-[13px]">
      {estado?.ok && estado.mensagem && <span className="text-ok">{estado.mensagem}</span>}
      {estado && !estado.ok && estado.erros?.geral && (
        <span className="text-erro">
          {estado.erros.geral}
          {estado.conflito && (
            <>
              {' '}
              <a href="" className="underline underline-offset-4">
                Recarregar
              </a>
            </>
          )}
        </span>
      )}
    </p>
  );
}

export function FormNovaLinha({ acao, bloqueio }: { acao: AcaoLocal; bloqueio: string | null }) {
  const [estado, enviar] = useFormState<EstadoLocal, FormData>(acao, null);
  return (
    <form action={enviar} noValidate className="space-y-3">
      <fieldset disabled={!!bloqueio} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem_auto] sm:items-end">
        <div>
          <label htmlFor="nova-linha-nome" className={ROTULO}>
            Nome da linha
          </label>
          <input id="nova-linha-nome" name="nome" maxLength={80} autoComplete="off" placeholder="Ex.: Seguro do ponto" className={CAMPO} aria-invalid={!!estado?.erros?.nome} aria-describedby="nova-linha-nome-erro" />
          <Erro id="nova-linha-nome-erro" texto={estado?.erros?.nome} />
        </div>
        <div>
          <label htmlFor="nova-linha-grupo" className={ROTULO}>
            Em qual grupo
          </label>
          <select id="nova-linha-grupo" name="grupo" defaultValue="ADMINISTRATIVA" className={CAMPO} aria-describedby="nova-linha-grupo-erro">
            {GRUPOS_DE_DESPESA.map((g) => (
              <option key={g} value={g}>
                {ROTULO_DO_GRUPO[g]}
              </option>
            ))}
          </select>
          <Erro id="nova-linha-grupo-erro" texto={estado?.erros?.grupo} />
        </div>
        <BotaoEnviar pendente="Criando…" disabled={!!bloqueio}>
          Criar linha
        </BotaoEnviar>
      </fieldset>
      <Retorno estado={estado} />
    </form>
  );
}

export function FormRenomear({ acao, chave, nome, versao, bloqueio }: { acao: AcaoLocal; chave: string; nome: string; versao: string; bloqueio: string | null }) {
  const [estado, enviar] = useFormState<EstadoLocal, FormData>(acao, null);
  const id = `renomear-${chave.replace(/[^a-z0-9]/gi, '-')}`;
  return (
    <form action={enviar} noValidate className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="linha" value={chave} />
      <input type="hidden" name="versao" value={versao} />
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="sr-only">
          Novo nome de {nome}
        </label>
        <input id={id} name="nome" defaultValue={nome} maxLength={80} autoComplete="off" disabled={!!bloqueio} className={`${CAMPO} min-h-10`} aria-invalid={!!estado?.erros?.nome} aria-describedby={`${id}-erro`} />
        <Erro id={`${id}-erro`} texto={estado?.erros?.nome} />
      </div>
      <BotaoEnviar variante="secundario" pendente="Salvando…" disabled={!!bloqueio}>
        Salvar nome
      </BotaoEnviar>
      <div className="basis-full">
        <Retorno estado={estado} />
      </div>
    </form>
  );
}

export function FormOcultar({ acao, chave, ocultar, versao, bloqueio, nome }: { acao: AcaoLocal; chave: string; ocultar: boolean; versao: string; bloqueio: string | null; nome: string }) {
  const [estado, enviar] = useFormState<EstadoLocal, FormData>(acao, null);
  return (
    <form action={enviar} className="inline-flex flex-col items-start gap-1">
      <input type="hidden" name="linha" value={chave} />
      <input type="hidden" name="versao" value={versao} />
      <input type="hidden" name="ocultar" value={ocultar ? '1' : '0'} />
      <BotaoEnviar variante="fantasma" pendente="Salvando…" disabled={!!bloqueio}>
        {ocultar ? 'Ocultar' : 'Reexibir'}
        <span className="sr-only"> {nome}</span>
      </BotaoEnviar>
      <Retorno estado={estado} />
    </form>
  );
}
