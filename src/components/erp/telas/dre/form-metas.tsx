'use client';

/**
 * A tabela das metas (2.2b, decisão 149): uma meta em % da receita bruta por linha do DRE, a mesma
 * na rede e em cada loja. UMA gravação para a tabela inteira, condicional à impressão das metas lidas
 * (duas abas não se atropelam). Campo vazio é "sem meta"; "0" é uma meta de zero. O servidor lê o TEXTO
 * e decide: o que a tela mostra aqui é só o campo.
 */

import { useFormState } from 'react-dom';
import { formatarData } from '@/lib/erp/compra-campos';
import { BotaoEnviar } from '../../ui/botoes';
import { CAMPO } from '../../ui/campos';
import type { AcaoLocal, EstadoLocal } from './estado';

export interface LinhaDoCampoDeMeta {
  chave: string;
  nome: string;
  tipo: string;
  nivel: 0 | 1;
  aceita: boolean;
  oculta: boolean;
  campo: string;
  metaBp: number | null;
  desde: string | null;
}

export function FormMetas({
  acao,
  linhas,
  versao,
  valeDesde,
  periodoAtual,
  bloqueio,
}: {
  acao: AcaoLocal;
  linhas: LinhaDoCampoDeMeta[];
  versao: string;
  /** O início do período de agora ("2026-10-01"): a meta gravada hoje vale daí em diante. */
  valeDesde: string;
  periodoAtual: string;
  bloqueio: string | null;
}) {
  const [estado, enviar] = useFormState<EstadoLocal, FormData>(acao, null);
  const erros = estado?.erros ?? {};
  return (
    <form action={enviar} noValidate>
      <input type="hidden" name="versao" value={versao} />
      {erros.geral && (
        <div role="alert" className="mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-erro/40 px-4 py-3 text-sm sm:mx-5">
          <p className="text-erro">{erros.geral}</p>
          {estado?.conflito && (
            <a href="" className="text-[13px] font-medium underline underline-offset-4">
              Recarregar
            </a>
          )}
        </div>
      )}
      <fieldset disabled={!!bloqueio} className="min-w-0">
        <legend className="sr-only">Meta de cada linha, em % da receita bruta</legend>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-forte text-left text-[12px] text-suave">
              <th scope="col" className="h-10 px-4 font-semibold sm:px-5">
                Linha
              </th>
              <th scope="col" className="h-10 w-40 px-3 text-right font-semibold sm:w-56 sm:px-5">
                Meta, % da receita
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const id = `meta-${l.chave.replace(/[^a-z0-9]/gi, '-')}`;
              const grupo = l.nivel === 0;
              const erro = erros[l.chave];
              return (
                <tr key={l.chave} className={`border-t border-linha ${l.tipo === 'resultado' ? 'bg-forte font-semibold' : grupo ? 'bg-forte/50 font-semibold' : ''}`}>
                  <th scope="row" className={`py-2 text-left align-top ${l.nivel === 1 ? 'pl-8 pr-2 font-normal sm:pl-10' : 'px-4 sm:px-5'}`}>
                    {l.aceita ? (
                      <label htmlFor={id} className="block min-h-6 leading-6">
                        {l.nome}
                        {l.oculta && <span className="ml-2 text-[12px] font-normal text-suave">oculta</span>}
                      </label>
                    ) : (
                      <span className="block min-h-6 leading-6">{l.nome}</span>
                    )}
                    {l.aceita && l.desde && l.metaBp !== null && <span className="block text-[12px] font-normal leading-snug text-suave">vale desde {formatarData(l.desde)}</span>}
                    {erro && (
                      <span id={`${id}-erro`} className="mt-1 block text-[13px] font-normal text-erro">
                        {erro}
                      </span>
                    )}
                  </th>
                  <td className="px-3 py-1.5 text-right align-top sm:px-5">
                    {l.aceita ? (
                      <input
                        id={id}
                        name={`meta_${l.chave}`}
                        defaultValue={l.campo}
                        inputMode="decimal"
                        autoComplete="off"
                        maxLength={12}
                        placeholder="sem meta"
                        aria-invalid={!!erro}
                        aria-describedby={erro ? `${id}-erro` : undefined}
                        className={`${CAMPO} ml-auto w-28 text-right font-normal tabular-nums sm:w-32`}
                      />
                    ) : (
                      <span className="block min-h-6 text-[12px] font-normal leading-6 text-suave">base: 100 %</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </fieldset>
      <div className="space-y-3 border-t border-linha px-4 py-4 sm:px-5">
        <p className="text-[13px] text-texto">
          As metas valem <strong className="font-semibold">a partir de {formatarData(valeDesde)}</strong>, o começo de {periodoAtual}. Os períodos anteriores seguem com as metas que valiam neles.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <BotaoEnviar pendente="Salvando…" disabled={!!bloqueio}>
            Salvar as metas
          </BotaoEnviar>
          <p aria-live="polite" className="min-h-5 text-[13px]">
            {estado?.ok && estado.mensagem && <span className="text-ok">{estado.mensagem}</span>}
          </p>
        </div>
      </div>
    </form>
  );
}
