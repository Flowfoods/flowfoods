'use client';

/**
 * "Lançar as do mês passado" (2.2a, decisão 139): as despesas que repetem todo
 * mês e ainda não têm o lançamento do mês escolhido. O valor do mês passado é só o
 * ponto de partida: a luz varia, então cada valor é editável. Desmarque o que não
 * se repete este mês. Nada é lançado sozinho nem inventado: o que você confirma
 * aqui vira uma despesa nova que aponta a de origem (a mesma não se lança duas
 * vezes, nem com duplo clique nem em duas abas).
 */

import Link from 'next/link';
import { useState } from 'react';
import { useFormState } from 'react-dom';
import { formatarData } from '@/lib/erp/compra-campos';
import { rotuloDoMes } from '@/lib/erp/faturamento-campos';
import { dinheiroParaCampo, formatarDinheiro } from '@/lib/erp/unidades';
import { BotaoEnviar } from '../../ui/botoes';
import { CAMPO, Erro } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';
import { Painel } from '../../ui/superficies';
import type { AcaoMesPassado, EstadoMesPassado } from './estado';

export interface ItemDoMesPassado {
  origemId: string;
  descricao: string;
  linhaNome: string;
  lojaNome: string | null;
  linhaOculta: boolean;
  valorCentavos: number;
  vencimento: string | null;
}

export function FormMesPassado({ acao, itens, mes, envio, voltar, bloqueio }: { acao: AcaoMesPassado; itens: ItemDoMesPassado[]; mes: string; envio: string; voltar: string; bloqueio: string | null }) {
  const [estado, enviar] = useFormState<EstadoMesPassado, FormData>(acao, null);
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(itens.filter((i) => !i.linhaOculta).map((i) => i.origemId)));
  const alternar = (id: string, on: boolean) =>
    setMarcadas((m) => {
      const n = new Set(m);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  return (
    <form action={enviar} noValidate className="space-y-4">
      <input type="hidden" name="envio" value={envio} />
      <input type="hidden" name="mes" value={mes} />
      {estado?.erro && (
        <div role="alert" className="rounded-[10px] border border-erro/40 px-4 py-3 text-sm text-erro">
          {estado.erro}
        </div>
      )}
      <Painel titulo={`Lançar em ${rotuloDoMes(mes)}`} subtitulo="Confira o valor de cada uma: o do mês passado é só o ponto de partida." semRespiro>
        <fieldset disabled={!!bloqueio} className="min-w-0">
          <legend className="sr-only">Despesas que repetem todo mês</legend>
          <ul className="divide-y divide-linha">
            {itens.map((i) => {
              const id = `mp-${i.origemId}`;
              const erro = estado?.porItem?.[i.origemId];
              return (
                <li key={i.origemId} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_11rem] sm:px-5">
                  <input type="checkbox" name="marcar" value={i.origemId} checked={marcadas.has(i.origemId)} onChange={(e) => alternar(i.origemId, e.target.checked)} id={`${id}-marcar`} aria-label={`Lançar ${i.descricao}`} className="mt-3 h-5 w-5 accent-[rgb(var(--ff-acao))]" disabled={i.linhaOculta} />
                  <div className="min-w-0">
                    <label htmlFor={`${id}-marcar`} className="block cursor-pointer text-sm font-medium text-texto">
                      {i.descricao}
                    </label>
                    <p className="text-[12px] leading-snug text-suave">
                      {i.linhaNome} · {i.lojaNome ?? 'Rede'} · mês passado {formatarDinheiro(i.valorCentavos)}
                      {i.vencimento ? ` · vencia ${formatarData(i.vencimento, true)}` : ''}
                    </p>
                    {i.linhaOculta && <p className="text-[12px] text-atencao">A linha “{i.linhaNome}” está oculta: reexiba no plano de contas para lançar.</p>}
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label htmlFor={`${id}-valor`} className="sr-only">
                      Valor de {i.descricao} (R$)
                    </label>
                    <input id={`${id}-valor`} name={`valor_${i.origemId}`} defaultValue={dinheiroParaCampo(i.valorCentavos)} inputMode="decimal" autoComplete="off" disabled={!marcadas.has(i.origemId)} aria-invalid={!!erro} aria-describedby={`${id}-erro`} className={`${CAMPO} min-h-11 text-right text-base font-semibold tabular-nums`} />
                    <Erro id={`${id}-erro`} texto={erro} />
                  </div>
                </li>
              );
            })}
          </ul>
        </fieldset>
      </Painel>
      <div data-barra-fixa className="sticky bottom-0 z-20 -mx-4 flex flex-col gap-2 border-t border-linha bg-fundo px-4 py-3 sm:-mx-6 sm:flex-row sm:justify-end sm:px-6 lg:-mx-8 lg:px-8">
        <Link href={voltar} className={classeDeBotao('fantasma', 'w-full sm:w-auto')}>
          Voltar sem lançar
        </Link>
        <BotaoEnviar pendente="Lançando…" className="w-full sm:w-auto sm:min-w-48" disabled={!!bloqueio || marcadas.size === 0}>
          {marcadas.size === 1 ? 'Lançar 1 despesa' : `Lançar ${marcadas.size} despesas`}
        </BotaoEnviar>
      </div>
    </form>
  );
}
