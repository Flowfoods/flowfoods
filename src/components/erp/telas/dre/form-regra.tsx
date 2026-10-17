'use client';

/**
 * Mudar a regra do período (2.2a). A regra nova NUNCA é retroativa: vale a partir
 * do dia seguinte ao fim do período em que estamos, e o primeiro período dela nasce
 * cortado no início. A conta ao lado é prévia; o servidor decide a data de verdade.
 */

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { DIAS_DA_SEMANA, ROTULO_DO_TIPO, TIPOS_DE_REGRA, type TipoDePeriodo } from '@/lib/erp/periodo-campos';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, CAMPO, Erro, ROTULO } from '../../ui/campos';
import { Segmentos } from '../../ui/segmentos';
import type { AcaoLocal, EstadoLocal } from './estado';

const DIAS_DO_MES = Array.from({ length: 28 }, (_, i) => i + 1);

export function FormRegra({ acao, versao, inicial, valeDesde, periodoAtual, bloqueio }: { acao: AcaoLocal; versao: string; inicial: { tipo: TipoDePeriodo; diaInicio: number }; valeDesde: string; periodoAtual: string; bloqueio: string | null }) {
  const [estado, enviar] = useFormState<EstadoLocal, FormData>(acao, null);
  const [tipo, setTipo] = useState<TipoDePeriodo>(inicial.tipo);
  const erros = estado?.erros ?? {};
  return (
    <form action={enviar} noValidate className="space-y-4">
      <input type="hidden" name="versao" value={versao} />
      {erros.geral && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-erro/40 px-4 py-3 text-sm">
          <p className="text-erro">{erros.geral}</p>
          {estado?.conflito && (
            <a href="" className="text-[13px] font-medium underline underline-offset-4">
              Recarregar
            </a>
          )}
        </div>
      )}
      <fieldset disabled={!!bloqueio} className="min-w-0 space-y-4">
        <Segmentos nome="tipo" legenda="Como o período fecha" opcoes={TIPOS_DE_REGRA.map((t) => [t, ROTULO_DO_TIPO[t]] as const)} valor={tipo} aoMudar={setTipo} />
        <Erro id="regra-tipo-erro" texto={erros.tipo} />
        <div className="max-w-72">
          {tipo === 'SEMANAL' ? (
            <>
              <label htmlFor="regra-dia-semanal" className={ROTULO}>
                A semana começa na
              </label>
              <select id="regra-dia-semanal" name="dia_semanal" defaultValue={inicial.tipo === 'SEMANAL' ? inicial.diaInicio : 1} className={CAMPO} aria-describedby="regra-dia-erro">
                {DIAS_DA_SEMANA.map((nome, i) => (
                  <option key={nome} value={i + 1}>
                    {nome}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <label htmlFor={`regra-dia-${tipo.toLowerCase()}`} className={ROTULO}>
                O período começa no dia
              </label>
              <select id={`regra-dia-${tipo.toLowerCase()}`} name={`dia_${tipo.toLowerCase()}`} defaultValue={inicial.tipo === tipo ? inicial.diaInicio : 1} className={CAMPO} aria-describedby="regra-dia-erro">
                {DIAS_DO_MES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <p className={AJUDA}>{tipo === 'QUINZENAL' ? 'Duas quinzenas por mês a partir deste dia.' : 'Dia 1 é o mês civil. Dia 15 vai de 15 a 14 do mês seguinte.'}</p>
            </>
          )}
          <Erro id="regra-dia-erro" texto={erros.dia} />
        </div>
      </fieldset>
      <p className="rounded-[10px] border border-linha px-4 py-3 text-[13px] text-texto">
        A mudança vale <strong className="font-semibold">a partir de {valeDesde}</strong>, o dia seguinte ao fim de {periodoAtual}. Nenhum período passado ou em curso muda de data nem de número.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <BotaoEnviar pendente="Salvando…" disabled={!!bloqueio}>
          Salvar a regra
        </BotaoEnviar>
        <p aria-live="polite" className="min-h-5 text-[13px]">
          {estado?.ok && estado.mensagem && <span className="text-ok">{estado.mensagem}</span>}
        </p>
      </div>
    </form>
  );
}
