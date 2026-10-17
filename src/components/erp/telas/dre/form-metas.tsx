'use client';

/**
 * A tabela das metas (2.2b, decisão 149): uma meta em % da receita bruta por linha do DRE, a mesma
 * na rede e em cada loja. UMA gravação para a tabela inteira, condicional à impressão das metas lidas
 * (duas abas não se atropelam). Campo vazio é "sem meta"; "0" é uma meta de zero. O servidor lê o TEXTO
 * e decide: o que a tela mostra aqui é só o campo.
 */

import { useState } from 'react';
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

/** Os blocos da tabela: cada linha de nível 0 com as filhas que vêm depois dela (resultados e subtotais ficam sozinhos). */
function blocosDe(linhas: LinhaDoCampoDeMeta[]) {
  const blocos: { pai: LinhaDoCampoDeMeta; filhas: LinhaDoCampoDeMeta[] }[] = [];
  for (const l of linhas) {
    if (l.nivel === 0 || blocos.length === 0) blocos.push({ pai: l, filhas: [] });
    else blocos[blocos.length - 1].filhas.push(l);
  }
  return blocos;
}

const idDe = (chave: string) => `meta-${chave.replace(/[^a-z0-9]/gi, '-')}`;

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
  const blocos = blocosDe(linhas);
  // No celular as filhas ficam recolhidas atrás do grupo e abrem sob demanda; de tablet para cima aparecem sempre.
  const [abertos, setAbertos] = useState<ReadonlySet<string>>(new Set());
  const alternar = (chave: string) =>
    setAbertos((a) => {
      const n = new Set(a);
      if (n.has(chave)) n.delete(chave);
      else n.add(chave);
      return n;
    });
  const campo = (l: LinhaDoCampoDeMeta, erro: string | undefined) => {
    const id = idDe(l.chave);
    return l.aceita ? (
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
    );
  };
  const nome = (l: LinhaDoCampoDeMeta, erro: string | undefined, grupoComMeta: string | null) => {
    const id = idDe(l.chave);
    return (
      <>
        {l.aceita ? (
          <label htmlFor={id} className="block min-h-6 leading-6">
            {l.nome}
            {l.oculta && <span className="ml-2 text-[12px] font-normal text-suave">oculta</span>}
          </label>
        ) : (
          <span className="block min-h-6 leading-6">{l.nome}</span>
        )}
        {l.aceita && l.desde && l.metaBp !== null && <span className="block text-[12px] font-normal leading-snug text-suave">vale desde {formatarData(l.desde)}</span>}
        {l.aceita && l.metaBp === null && grupoComMeta && <span className="block text-[12px] font-normal leading-snug text-suave">meta no grupo {grupoComMeta}</span>}
        {erro && (
          <span id={`${id}-erro`} className="mt-1 block text-[13px] font-normal text-erro">
            {erro}
          </span>
        )}
      </>
    );
  };
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
          {blocos.map(({ pai, filhas }) => {
            const comErro = filhas.some((f) => erros[f.chave]);
            const aberto = abertos.has(pai.chave) || comErro;
            const comMeta = filhas.filter((f) => f.metaBp !== null).length;
            const idFilhas = `${idDe(pai.chave)}-filhas`;
            const erroDoPai = erros[pai.chave];
            return (
              <tbody key={pai.chave}>
                <tr className={`border-t border-linha ${pai.tipo === 'resultado' ? 'bg-forte font-semibold' : 'bg-forte/50 font-semibold'}`}>
                  <th scope="row" className="px-4 py-2 text-left align-top sm:px-5">
                    {nome(pai, erroDoPai, null)}
                    {filhas.length > 0 && (
                      <button
                        type="button"
                        onClick={() => alternar(pai.chave)}
                        aria-expanded={aberto}
                        aria-controls={idFilhas}
                        className="mt-1 inline-flex min-h-11 items-center gap-1 text-[13px] font-medium text-suave underline underline-offset-4 sm:hidden"
                      >
                        {aberto ? 'Recolher as linhas' : filhas.length === 1 ? 'Abrir a linha' : `Abrir as ${filhas.length} linhas`}
                        {!aberto && comMeta > 0 ? ` · ${comMeta} com meta` : ''}
                      </button>
                    )}
                  </th>
                  <td className="px-3 py-1.5 text-right align-top sm:px-5">{campo(pai, erroDoPai)}</td>
                </tr>
                {filhas.map((f, i) => {
                  const erro = erros[f.chave];
                  return (
                    <tr key={f.chave} id={i === 0 ? idFilhas : undefined} className={`border-t border-linha ${aberto ? '' : 'hidden sm:table-row'}`}>
                      <th scope="row" className="py-2 pl-8 pr-2 text-left align-top font-normal sm:pl-10">
                        {nome(f, erro, pai.metaBp !== null ? pai.nome : null)}
                      </th>
                      <td className="px-3 py-1.5 text-right align-top sm:px-5">{campo(f, erro)}</td>
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
        </table>
      </fieldset>
      <p className="border-t border-linha px-4 py-3 text-[13px] text-texto sm:px-5">
        As metas valem <strong className="font-semibold">a partir de {formatarData(valeDesde)}</strong>, o começo de {periodoAtual}. Os períodos anteriores seguem com as metas que valiam neles.
      </p>
      <div className="sticky bottom-0 z-20 flex flex-wrap items-center gap-3 rounded-b-[14px] border-t border-linha bg-painel px-4 py-3 sm:px-5">
        <BotaoEnviar pendente="Salvando…" disabled={!!bloqueio} className="w-full sm:w-auto">
          Salvar as metas
        </BotaoEnviar>
        <p aria-live="polite" className="min-h-5 text-[13px]">
          {estado?.ok && estado.mensagem && <span className="text-ok">{estado.mensagem}</span>}
        </p>
      </div>
    </form>
  );
}
