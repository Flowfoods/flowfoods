'use client';

/**
 * Outra embalagem de compra do insumo (caixa, fardo, outra marca): nome,
 * quanto vem na unidade DO insumo, preço, frete e código de barras. Mesma
 * conta do insumo. Editar leva a versão lida; alguém gravando no meio faz a
 * gravação ser recusada, sem sobrescrever.
 */

import Link from 'next/link';
import { useFormState } from 'react-dom';
import type { Unidade } from '@/lib/erp/unidades';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, CAMPO, Erro, ROTULO } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';
import { Painel } from '../../ui/superficies';
import { CamposDaEmbalagem, EMBALAGEM_VAZIA, type ValoresDaEmbalagem } from './campos-embalagem';
import type { AcaoDeInsumo, EstadoInsumo } from './estado';
import { ErroGeral, ResumoDeErros, useAvisoDeSaida } from './form-insumo';

export interface ValoresDaOutraEmbalagem extends ValoresDaEmbalagem {
  nome: string;
  codigoBarras: string;
}

export function FormEmbalagem({
  acao,
  unidade,
  aqui,
  cancelar,
  inicial = { nome: '', codigoBarras: '', ...EMBALAGEM_VAZIA },
  versao,
  bloqueio = null,
}: {
  acao: AcaoDeInsumo;
  unidade: Unidade;
  aqui: string;
  cancelar: string;
  inicial?: ValoresDaOutraEmbalagem;
  versao?: string;
  bloqueio?: string | null;
}) {
  const [estado, enviar] = useFormState<EstadoInsumo, FormData>(acao, null);
  const saida = useAvisoDeSaida();
  const erros = estado?.erros ?? {};
  const idBase = 'embalagem';

  return (
    <form action={enviar} onChange={saida.aoMudar} onSubmit={saida.aoEnviar} noValidate className="space-y-4">
      {versao && <input type="hidden" name="versao" value={versao} />}
      <ResumoDeErros erros={erros} idBase={idBase} />
      <ErroGeral estado={estado} recarregar={aqui} />
      <fieldset disabled={!!bloqueio} className="min-w-0">
        <Painel titulo="Embalagem de compra">
          <div className="space-y-4">
            <div>
              <label htmlFor={`${idBase}-nome`} className={ROTULO}>
                Nome da embalagem
              </label>
              <input
                id={`${idBase}-nome`}
                name="nome"
                maxLength={60}
                autoComplete="off"
                defaultValue={inicial.nome}
                placeholder="Ex.: Caixa 10 kg, marca B"
                className={CAMPO}
                aria-invalid={!!erros.nome}
                aria-describedby={erros.nome ? `${idBase}-nome-erro` : undefined}
              />
              <Erro id={`${idBase}-nome-erro`} texto={erros.nome} />
            </div>
            <CamposDaEmbalagem unidade={unidade} inicial={inicial} erros={erros} idBase={idBase} />
            <div>
              <label htmlFor={`${idBase}-codigoBarras`} className={ROTULO}>
                Código de barras <span className="font-normal text-suave">(opcional)</span>
              </label>
              <input
                id={`${idBase}-codigoBarras`}
                name="codigoBarras"
                inputMode="numeric"
                autoComplete="off"
                maxLength={20}
                defaultValue={inicial.codigoBarras}
                placeholder="7891000100103"
                className={`${CAMPO} tabular-nums`}
                aria-invalid={!!erros.codigoBarras}
                aria-describedby={`${idBase}-codigoBarras-ajuda${erros.codigoBarras ? ` ${idBase}-codigoBarras-erro` : ''}`}
              />
              <p id={`${idBase}-codigoBarras-ajuda`} className={AJUDA}>
                O número embaixo das barras, de 8 a 14 dígitos.
              </p>
              <Erro id={`${idBase}-codigoBarras-erro`} texto={erros.codigoBarras} />
            </div>
          </div>
        </Painel>
      </fieldset>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Link href={cancelar} className={classeDeBotao('fantasma')}>
          Cancelar
        </Link>
        <BotaoEnviar disabled={!!bloqueio} className="sm:min-w-44">
          {versao ? 'Salvar embalagem' : 'Cadastrar embalagem'}
        </BotaoEnviar>
      </div>
      {bloqueio && <p className="text-right text-[13px] text-suave">{bloqueio}</p>}
    </form>
  );
}
