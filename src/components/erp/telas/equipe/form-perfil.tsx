'use client';

/**
 * Perfil próprio do parceiro: nasce copiando um perfil pronto (dono, gerente,
 * operador) e o dono marca/desmarca o que esse perfil pode fazer. Pode dizer
 * para quais setores ele foi pensado (vira sugestão no cadastro da pessoa).
 */

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { LISTA_DE_SETORES, ORDEM_DOS_PERFIS_BASE, PERFIS_BASE, SETORES, type PerfilBase } from '@/lib/erp/permissoes';
import { BotaoEnviar } from '../../ui/botoes';
import { CAMPO, Erro, ROTULO, Resultado } from '../../ui/campos';
import { Confirmacao, Etiqueta, GradeDePermissoes } from './escolhas';
import type { AcaoDeEquipe, EstadoEquipe } from './estado';

export interface ValoresDoPerfil {
  id?: string;
  nome: string;
  base: PerfilBase;
  permissoes: string[];
  setores: string[];
}

const sem: AcaoDeEquipe = async (e) => e;

function BotaoExcluir() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="whitespace-nowrap rounded-[7px] px-3 py-2.5 text-[13px] text-suave underline-offset-4 transition hover:text-erro hover:underline disabled:opacity-60"
    >
      {pending ? 'Excluindo…' : 'Excluir perfil'}
    </button>
  );
}

export function FormPerfil({
  acao,
  excluir,
  idBase,
  concediveis,
  inicial,
  pessoas = 0,
}: {
  acao: AcaoDeEquipe;
  excluir?: AcaoDeEquipe;
  /** Quantas pessoas usam o perfil: salvar muda o acesso delas na hora (pede confirmação). */
  pessoas?: number;
  idBase: string;
  concediveis: string[];
  inicial?: ValoresDoPerfil;
}) {
  const novo = !inicial?.id;
  const podeDar = new Set(concediveis);
  const partida = (b: PerfilBase) => PERFIS_BASE[b].permissoes.filter((p) => podeDar.has(p));
  const vazio: ValoresDoPerfil = { nome: '', base: 'OPERADOR', permissoes: partida('OPERADOR'), setores: [] };
  const [estado, enviar] = useFormState<EstadoEquipe, FormData>(acao, null);
  const [saiu, pedirExcluir] = useFormState<EstadoEquipe, FormData>(excluir ?? sem, null);
  const [v, setV] = useState<ValoresDoPerfil>(inicial ?? vazio);
  const [chave, setChave] = useState(0);
  const [pedindo, setPedindo] = useState(false);
  const confirmado = useRef(false);
  const formulario = useRef<HTMLFormElement>(null);
  const avisar = !novo && pessoas > 0;

  useEffect(() => {
    confirmado.current = false;
    setPedindo(false);
    if (estado?.ok && novo) {
      setV(vazio);
      setChave((c) => c + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  const id = (n: string) => `${idBase}-${n}`;
  const alternar = (p: string) =>
    setV((x) => ({
      ...x,
      permissoes: x.permissoes.includes(p) ? x.permissoes.filter((y) => y !== p) : [...x.permissoes, p],
    }));

  return (
    <div className="space-y-3">
      <form
        key={chave}
        ref={formulario}
        action={enviar}
        noValidate
        className="space-y-5"
        onSubmit={(e) => {
          if (avisar && !confirmado.current) {
            e.preventDefault();
            setPedindo(true);
          }
        }}
      >
        {inicial?.id && <input type="hidden" name="id" value={inicial.id} />}
        <div>
          <label htmlFor={id('nome')} className={ROTULO}>
            Nome do perfil
          </label>
          <input
            id={id('nome')}
            name="nome"
            required
            maxLength={40}
            autoComplete="off"
            placeholder="Ex.: Cozinha, Caixa da noite"
            defaultValue={v.nome}
            className={CAMPO}
            aria-invalid={!!estado?.erros?.nome}
            aria-describedby={id('nome-erro')}
          />
          <Erro id={id('nome-erro')} texto={estado?.erros?.nome} />
        </div>

        <fieldset>
          <legend className={ROTULO}>{novo ? 'Começar copiando' : 'Copiado de'}</legend>
          <div className="flex flex-wrap gap-1.5">
            {ORDEM_DOS_PERFIS_BASE.map((b) => (
              <Etiqueta
                key={b}
                tipo="radio"
                name="base"
                value={b}
                checked={v.base === b}
                onChange={() => setV((x) => ({ ...x, base: b, permissoes: partida(b) }))}
              >
                {PERFIS_BASE[b].rotulo}
              </Etiqueta>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-suave">
            {novo
              ? 'Escolher outro recomeça as marcações abaixo.'
              : 'Trocar recomeça as marcações pelo perfil escolhido.'}
          </p>
        </fieldset>

        <fieldset>
          <legend className={ROTULO}>
            O que este perfil pode fazer
            <span className="ml-2 font-normal normal-case tracking-normal text-suave">
              {v.permissoes.length} marcadas
            </span>
          </legend>
          <div className="rounded-[9px] border border-linha p-3.5">
            <GradeDePermissoes
              idBase={id('p')}
              marcada={(p) => v.permissoes.includes(p)}
              alternar={alternar}
              concediveis={podeDar}
            />
          </div>
          <Erro id={id('permissoes-erro')} texto={estado?.erros?.permissoes} />
        </fieldset>
        {v.permissoes.map((p) => (
          <input key={p} type="hidden" name="permissoes" value={p} />
        ))}

        <fieldset>
          <legend className={ROTULO}>Pensado para quais setores (opcional)</legend>
          <div className="flex flex-wrap gap-1.5">
            {LISTA_DE_SETORES.map((s) => (
              <Etiqueta
                key={s}
                name="setores"
                value={s}
                checked={v.setores.includes(s)}
                onChange={(m) =>
                  setV((x) => ({ ...x, setores: m ? [...x.setores, s] : x.setores.filter((y) => y !== s) }))
                }
              >
                {SETORES[s]}
              </Etiqueta>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-suave">Ao marcar o setor de uma pessoa nova, este perfil é sugerido.</p>
        </fieldset>

        {pedindo && avisar && (
          <Confirmacao
            titulo={`Muda o acesso de ${pessoas === 1 ? '1 pessoa' : `${pessoas} pessoas`} agora.`}
            detalhe="Quem usa este perfil passa a poder exatamente o que está marcado, já na próxima tela."
            confirmar="Salvar perfil"
            onConfirmar={() => {
              confirmado.current = true;
              setPedindo(false);
              formulario.current?.requestSubmit();
            }}
            onCancelar={() => setPedindo(false)}
          />
        )}
        <div className="space-y-2">
          <BotaoEnviar pendente="Salvando…" className="w-full">
            {novo ? 'Criar perfil' : 'Salvar perfil'}
          </BotaoEnviar>
          <Resultado estado={estado} />
        </div>
      </form>
      {excluir && (
        <form
          action={pedirExcluir}
          className="flex flex-wrap items-center justify-between gap-2 border-t border-linha pt-3"
        >
          <span className="text-[12px] text-suave">Só dá para excluir perfil que ninguém usa.</span>
          <BotaoExcluir />
        </form>
      )}
      {saiu && !saiu.ok && saiu.erros?.geral && <p className="text-[12px] text-erro">{saiu.erros.geral}</p>}
      {saiu?.ok && <p className="text-[12px] text-ok">{saiu.mensagem}</p>}
    </div>
  );
}
