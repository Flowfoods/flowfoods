'use client';

/**
 * Reabrir o período (2.2b, decisão 154): SÓ o nível 1. O motivo é obrigatório (de 3 a 200 letras) e vai
 * para o Histórico, com o antes e o depois. A fotografia que a pessoa viu vai junto: se outra a substituiu,
 * o servidor recusa. A regra confere o nível de novo; esconder o formulário é só conforto.
 */

import { useFormState } from 'react-dom';
import { useAvisoDeSaida } from '../cadastro/erros';
import { BotaoEnviar } from '../../ui/botoes';
import { CAMPO, Erro } from '../../ui/campos';
import type { AcaoLocal, EstadoLocal } from './estado';

export function FormReabrir({ acao, fotografia, bloqueio }: { acao: AcaoLocal; fotografia: string; bloqueio: string | null }) {
  const [estado, enviar] = useFormState<EstadoLocal, FormData>(acao, null);
  const saida = useAvisoDeSaida();
  const erros = estado?.erros ?? {};
  return (
    <form action={enviar} onChange={saida.aoMudar} onSubmit={saida.aoEnviar} noValidate className="space-y-3">
      <input type="hidden" name="fotografia" value={fotografia} />
      {erros.geral && !erros.motivo && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-erro/40 px-4 py-3 text-sm">
          <p className="text-erro">{erros.geral}</p>
          {estado?.conflito && (
            <a href="" className="text-[13px] font-medium underline underline-offset-4">
              Recarregar
            </a>
          )}
        </div>
      )}
      <div>
        <label htmlFor="reabrir-motivo" className="mb-1.5 block text-[13px] font-medium text-texto">
          Por que está reabrindo? (de 3 a 200 letras)
        </label>
        <input id="reabrir-motivo" name="motivo" required minLength={3} maxLength={200} autoComplete="off" className={CAMPO} disabled={!!bloqueio} aria-invalid={!!erros.motivo} aria-describedby="reabrir-motivo-erro" />
        <Erro id="reabrir-motivo-erro" texto={erros.motivo} />
      </div>
      <p className="text-[12px] text-suave">A fotografia atual fica guardada em Versões. Ao fechar de novo sai a versão seguinte. Enquanto estiver aberto, dá para lançar e corrigir no período.</p>
      <BotaoEnviar variante="perigo" pendente="Reabrindo…" disabled={!!bloqueio}>
        Reabrir o período
      </BotaoEnviar>
    </form>
  );
}
