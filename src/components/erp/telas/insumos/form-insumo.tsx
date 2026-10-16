'use client';

/**
 * Formulário do insumo (novo e editar), a MESMA peça para o nível 1 e para a
 * pessoa do parceiro: a action vem de quem usa a tela. Tudo vai como texto; o
 * servidor converte, calcula e confere (permissão, versão lida, unidade
 * travada). Erro volta para o lado do campo, sem perder o que foi digitado;
 * com vários, um resumo no topo leva a cada um.
 */

import Link from 'next/link';
import { useState } from 'react';
import { useFormState } from 'react-dom';
import { CONSERVACOES, TIPOS, type Conservacao, type TipoInsumo } from '@/lib/erp/insumo-campos';
import { UNIDADES, type Unidade } from '@/lib/erp/unidades';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, CAMPO, Erro, ROTULO } from '../../ui/campos';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { Segmentos } from '../../ui/segmentos';
import { Painel } from '../../ui/superficies';
import { CamposDaEmbalagem, EMBALAGEM_VAZIA, type ValoresDaEmbalagem } from './campos-embalagem';
import type { AcaoDeCadastro, EstadoCadastro } from '../cadastro/estado';
import { ErroGeral, ResumoDeErros, useAvisoDeSaida } from '../cadastro/erros';

export interface ValoresDoInsumo extends ValoresDaEmbalagem {
  nome: string;
  tipo: TipoInsumo;
  unidade: Unidade;
  conservacao: Conservacao;
}

const NOVO: ValoresDoInsumo = { nome: '', tipo: 'INGREDIENTE', unidade: 'KG', conservacao: 'SECO', ...EMBALAGEM_VAZIA };

const ROTULO_DO_CAMPO: Record<string, string> = {
  nome: 'Nome',
  tipo: 'Tipo',
  unidade: 'Unidade',
  conservacao: 'Conservação',
  conteudo: 'Quanto vem na embalagem',
  preco: 'Preço',
  frete: 'Frete',
};

export function FormInsumo({
  acao,
  modo,
  base,
  aqui,
  cancelar,
  inicial = NOVO,
  versao,
  travaDaUnidade = null,
  bloqueio = null,
}: {
  acao: AcaoDeCadastro;
  modo: 'criar' | 'editar';
  /** Lista de insumos de quem usa a tela (para o link do desativado). */
  base: string;
  /** Esta página (recarregar depois de um conflito). */
  aqui: string;
  cancelar: string;
  inicial?: ValoresDoInsumo;
  /** Editar: `atualizadoEm` lido (a gravação só passa se ainda for ele). */
  versao?: string;
  /** Editar: por que a unidade não pode mudar. */
  travaDaUnidade?: string | null;
  bloqueio?: string | null;
}) {
  const [estado, enviar] = useFormState<EstadoCadastro, FormData>(acao, null);
  const [unidade, setUnidade] = useState<Unidade>(inicial.unidade);
  const [tipo, setTipo] = useState<TipoInsumo>(inicial.tipo);
  const saida = useAvisoDeSaida();
  const erros = estado?.erros ?? {};
  const idBase = 'insumo';
  const prePreparo = inicial.tipo === 'PRE_PREPARO';

  return (
    <form action={enviar} onChange={saida.aoMudar} onSubmit={saida.aoEnviar} noValidate className="space-y-4">
      {versao && <input type="hidden" name="versao" value={versao} />}
      <ResumoDeErros erros={erros} idBase={idBase} rotulos={(c) => ROTULO_DO_CAMPO[c] ?? c} />
      <ErroGeral estado={estado} recarregar={aqui} />

      <fieldset disabled={!!bloqueio} className="min-w-0 space-y-4">
        <Painel titulo="O que é">
          <div className="space-y-4">
            <div>
              <label htmlFor={`${idBase}-nome`} className={ROTULO}>
                Nome do insumo
              </label>
              <input
                id={`${idBase}-nome`}
                name="nome"
                required
                maxLength={80}
                autoComplete="off"
                defaultValue={inicial.nome}
                placeholder="Ex.: Blend bovino 180 g"
                className={CAMPO}
                aria-invalid={!!erros.nome}
                aria-describedby={erros.nome ? `${idBase}-nome-erro` : undefined}
              />
              <Erro id={`${idBase}-nome-erro`} texto={erros.nome} />
              {estado?.desativadoId && (
                <Link href={`${base}/${estado.desativadoId}`} className={`${LINK_DE_TEXTO} mt-1.5 inline-block`}>
                  Abrir o insumo desativado para reativar
                </Link>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {prePreparo ? (
                <div>
                  <span className={ROTULO}>Tipo</span>
                  <p className="flex min-h-11 items-center text-sm text-texto sm:min-h-[42px]">{TIPOS.PRE_PREPARO}</p>
                  <p className={AJUDA}>Pré-preparo nasce da ficha técnica e continua pré-preparo.</p>
                  <input type="hidden" name="tipo" value="PRE_PREPARO" />
                </div>
              ) : (
                <div>
                  <Segmentos
                    nome="tipo"
                    legenda="Tipo"
                    opcoes={[
                      ['INGREDIENTE', TIPOS.INGREDIENTE],
                      ['EMBALAGEM', TIPOS.EMBALAGEM],
                    ]}
                    valor={tipo}
                    aoMudar={setTipo}
                  />
                  <Erro id={`${idBase}-tipo-erro`} texto={erros.tipo} />
                </div>
              )}
              <div>
                <label htmlFor={`${idBase}-conservacao`} className={ROTULO}>
                  Conservação
                </label>
                <select
                  id={`${idBase}-conservacao`}
                  name="conservacao"
                  defaultValue={inicial.conservacao}
                  className={CAMPO}
                  aria-invalid={!!erros.conservacao}
                >
                  {(Object.keys(CONSERVACOES) as Conservacao[]).map((c) => (
                    <option key={c} value={c}>
                      {CONSERVACOES[c]}
                    </option>
                  ))}
                </select>
                <Erro id={`${idBase}-conservacao-erro`} texto={erros.conservacao} />
              </div>
            </div>
          </div>
        </Painel>

        <Painel titulo="Como você compra">
          <div className="space-y-4">
            <div>
              {travaDaUnidade ? (
                <div>
                  <span className={ROTULO}>Unidade de medida</span>
                  <p className="flex min-h-11 items-center text-sm text-texto sm:min-h-[42px]">{UNIDADES[unidade].nome}</p>
                  <p className={AJUDA}>{travaDaUnidade}</p>
                  <input type="hidden" name="unidade" value={unidade} />
                </div>
              ) : (
                <Segmentos
                  nome="unidade"
                  legenda="Unidade de medida"
                  opcoes={(Object.keys(UNIDADES) as Unidade[]).map((k) => [k, UNIDADES[k].nome] as const)}
                  valor={unidade}
                  aoMudar={setUnidade}
                />
              )}
              <Erro id={`${idBase}-unidade-erro`} texto={erros.unidade} />
            </div>
            <CamposDaEmbalagem unidade={unidade} inicial={inicial} erros={erros} idBase={idBase} />
          </div>
        </Painel>
      </fieldset>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Link href={cancelar} className={classeDeBotao('fantasma')}>
          Cancelar
        </Link>
        <BotaoEnviar disabled={!!bloqueio} className="sm:min-w-44">
          {modo === 'criar' ? 'Cadastrar insumo' : 'Salvar alterações'}
        </BotaoEnviar>
      </div>
      {bloqueio && <p className="text-right text-[13px] text-suave">{bloqueio}</p>}
    </form>
  );
}
