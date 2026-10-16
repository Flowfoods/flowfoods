'use client';

/**
 * Cadastro mínimo do fornecedor (1.5): o necessário para a nota — nome, CNPJ
 * ou CPF (opcional: feira e atacarejo nem sempre têm) e contato. O servidor
 * confere o documento (dígitos verificadores) e o nome repetido.
 */

import Link from 'next/link';
import { useFormState } from 'react-dom';
import { LIMITES_DO_FORNECEDOR } from '@/lib/erp/compra-campos';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, CAMPO, Erro, ROTULO } from '../../ui/campos';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { Painel } from '../../ui/superficies';
import { ErroGeral, ResumoDeErros, useAvisoDeSaida } from '../cadastro/erros';
import type { AcaoDeNota, EstadoNota } from './estado';

const ROTULOS: Record<string, string> = { nome: 'Nome', documento: 'CNPJ ou CPF', contato: 'Contato' };

export function FormFornecedor({
  acao,
  modo,
  base,
  aqui,
  cancelar,
  inicial = { nome: '', documento: '', contato: '' },
  versao,
  bloqueio = null,
}: {
  acao: AcaoDeNota;
  modo: 'criar' | 'editar';
  base: string;
  aqui: string;
  cancelar: string;
  inicial?: { nome: string; documento: string; contato: string };
  versao?: string;
  bloqueio?: string | null;
}) {
  const [estado, enviar] = useFormState<EstadoNota, FormData>(acao, null);
  const saida = useAvisoDeSaida();
  const erros = estado?.erros ?? {};
  const idBase = 'fornecedor';
  return (
    <form action={enviar} onChange={saida.aoMudar} onSubmit={saida.aoEnviar} noValidate className="space-y-4">
      {versao && <input type="hidden" name="versao" value={versao} />}
      <ResumoDeErros erros={erros} idBase={idBase} rotulos={(c) => ROTULOS[c] ?? c} />
      <ErroGeral estado={estado} recarregar={aqui} />
      <fieldset disabled={!!bloqueio} className="min-w-0">
        <Painel titulo="Quem vende">
          <div className="space-y-4">
            <div>
              <label htmlFor={`${idBase}-nome`} className={ROTULO}>
                Nome
              </label>
              <input
                id={`${idBase}-nome`}
                name="nome"
                required
                maxLength={LIMITES_DO_FORNECEDOR.nome}
                autoComplete="off"
                defaultValue={inicial.nome}
                placeholder="Como aparece na nota ou como a equipe chama"
                className={CAMPO}
                aria-invalid={!!erros.nome}
                aria-describedby={erros.nome ? `${idBase}-nome-erro` : undefined}
              />
              <Erro id={`${idBase}-nome-erro`} texto={erros.nome} />
              {estado?.desativadoId && (
                <Link href={`${base}/${estado.desativadoId}`} className={`${LINK_DE_TEXTO} mt-1.5 inline-block`}>
                  Abrir o fornecedor desativado para reativar
                </Link>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`${idBase}-documento`} className={ROTULO}>
                  CNPJ ou CPF <span className="font-normal text-suave">(opcional)</span>
                </label>
                <input
                  id={`${idBase}-documento`}
                  name="documento"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={20}
                  defaultValue={inicial.documento}
                  className={`${CAMPO} tabular-nums`}
                  aria-invalid={!!erros.documento}
                  aria-describedby={`${idBase}-documento-ajuda${erros.documento ? ` ${idBase}-documento-erro` : ''}`}
                />
                <p id={`${idBase}-documento-ajuda`} className={AJUDA}>
                  Com ou sem pontos. Feira e atacarejo sem nota: deixe em branco.
                </p>
                <Erro id={`${idBase}-documento-erro`} texto={erros.documento} />
              </div>
              <div>
                <label htmlFor={`${idBase}-contato`} className={ROTULO}>
                  Contato <span className="font-normal text-suave">(opcional)</span>
                </label>
                <input
                  id={`${idBase}-contato`}
                  name="contato"
                  autoComplete="off"
                  maxLength={LIMITES_DO_FORNECEDOR.contato}
                  defaultValue={inicial.contato}
                  placeholder="Nome e telefone de quem atende"
                  className={CAMPO}
                  aria-invalid={!!erros.contato}
                  aria-describedby={erros.contato ? `${idBase}-contato-erro` : undefined}
                />
                <Erro id={`${idBase}-contato-erro`} texto={erros.contato} />
              </div>
            </div>
          </div>
        </Painel>
      </fieldset>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Link href={cancelar} className={classeDeBotao('fantasma')}>
          Cancelar
        </Link>
        <BotaoEnviar disabled={!!bloqueio} className="sm:min-w-44">
          {modo === 'criar' ? 'Cadastrar fornecedor' : 'Salvar alterações'}
        </BotaoEnviar>
      </div>
      {bloqueio && <p className="text-right text-[13px] text-suave">{bloqueio}</p>}
    </form>
  );
}
