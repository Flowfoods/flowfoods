'use client';

import { FormularioComAcao } from '@/components/erp/ui/formulario-com-acao';

/**
 * O dia de uma loja (2.1), a MESMA tela no nível 1 e na pessoa do parceiro:
 * um bloco por canal que a loja vende, com faturamento, pedidos e clientes,
 * "Não vendeu" (grava zero) e o ticket médio ao vivo. Pensada para o celular:
 * campos de 48 px, número à direita, rodapé fixo com "Salvar o dia".
 *
 * Só TEXTO sobe: o servidor lê, valida e refaz a conta (`lerCanalDoDia`);
 * ticket e totais enviados não existem. Cada canal leva a versão que a tela
 * leu (`atualizadoEm`): se outra pessoa gravou no meio, a segunda recebe o
 * conflito e nada é sobrescrito.
 */

import Link from 'next/link';
import { useState, useActionState } from 'react';

import { CANAIS } from '@/lib/erp/canal-campos';
import { lerCanalDoDia, textoDoTicket, ticketMedio, type CanalVenda, type ErrosDoCanal } from '@/lib/erp/faturamento-campos';
import { BotaoEnviar } from '../../ui/botoes';
import { CAMPO, Erro, MARCAR } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';
import { Painel, Selo } from '../../ui/superficies';
import { useAvisoDeSaida } from '../cadastro/erros';
import { PontoDeAjuda } from '../../ui/ponto-de-ajuda';
import { ErroGeralDoDia } from './partes';
import type { AcaoDoDia, EstadoDoDia } from './estado';

export interface CanalParaATela {
  canal: CanalVenda;
  /** Valores com que o bloco abre (texto, como se digita). */
  inicial: { valor: string; pedidos: string; clientes: string; naoVendeu: boolean };
  /** O `atualizadoEm` lido ('' = ainda sem lançamento). */
  versao: string;
  /** "Ana · 17/10 às 08:12 · Digitado", ou null. */
  quem: string | null;
  /** O canal está desligado na loja (só aparece porque já tem lançamento): não se edita. */
  desligado: boolean;
  /** Receita/pedidos integrados; atendimentos podem vir da casa. */
  integracao: { resumo: string; conferencia: string | null; clientes?: string } | null;
}

const NUMERO = `${CAMPO} min-h-12 text-right text-[17px] font-semibold tabular-nums sm:min-h-[44px]`;

function BlocoDoCanal({
  c,
  erros,
  somenteLeitura,
  aoMudar,
  comAjuda,
}: {
  c: CanalParaATela;
  erros: ErrosDoCanal;
  somenteLeitura: boolean;
  aoMudar: () => void;
  /** Decisão 519: o primeiro canal ativo leva os pontos "numeros" e "nao-vendeu" (um botão por ponto na tela, não um por canal). */
  comAjuda: boolean;
}) {
  const [v, setV] = useState(c.inicial);
  const mudar = (p: Partial<typeof v>) => {
    setV((x) => ({ ...x, ...p }));
    aoMudar();
  };
  const leitura = lerCanalDoDia({ valor: v.valor, pedidos: v.pedidos, clientes: v.clientes, naoVendeu: v.naoVendeu });
  const ticket = leitura.estado === 'ok' ? ticketMedio(leitura.numeros.valorCentavos, leitura.numeros.pedidos) : null;
  const id = `fat-${c.canal}`;
  const travado = somenteLeitura || c.desligado;
  const apoio =
    leitura.estado === 'vazio'
      ? 'Em branco: continua sem lançamento.'
      : leitura.estado === 'ok' && v.naoVendeu
        ? 'Não vendeu: grava zero.'
        : leitura.estado === 'ok'
          ? `Ticket médio ${textoDoTicket(ticket)}`
          : '';
  const selo = c.desligado ? <Selo>Canal desligado na loja</Selo> : c.versao ? <Selo tom="ok">Lançado</Selo> : <Selo>Sem lançamento</Selo>;
  return (
    <Painel
      titulo={CANAIS[c.canal].rotulo}
      acessorio={
        comAjuda ? (
          <span className="flex shrink-0 items-center gap-2">
            <PontoDeAjuda ponto="numeros" />
            {selo}
          </span>
        ) : (
          selo
        )
      }
    >
      <input type="hidden" name={`versao_${c.canal}`} value={c.versao} />
      {c.integracao && (
        <p className="mb-3 rounded-[10px] border border-linha bg-forte/50 px-3 py-2 text-[13px] text-suave">
          <span className="font-semibold text-texto">Vale a integração: {c.integracao.resumo}.</span>{' '}
          {c.integracao.conferencia ? `O faturamento e os pedidos digitados ficam como conferência (${c.integracao.conferencia}).` : null}
          {c.integracao.clientes ? <> {c.integracao.clientes}</> : null}
        </p>
      )}
      <div className="space-y-3">
        <fieldset disabled={travado} className="min-w-0 space-y-3">
          <legend className="sr-only">{CANAIS[c.canal].rotulo}: faturamento, pedidos e clientes</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor={`${id}-valor`} className="mb-1.5 block text-[13px] font-medium text-texto">
                Faturamento (R$)
              </label>
              <input
                id={`${id}-valor`}
                name={`valor_${c.canal}`}
                value={v.valor}
                onChange={(e) => mudar({ valor: e.target.value })}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0,00"
                aria-invalid={!!erros.valor}
                aria-describedby={`${id}-valor-erro`}
                className={NUMERO}
              />
              <Erro id={`${id}-valor-erro`} texto={erros.valor} />
            </div>
            <div>
              <label htmlFor={`${id}-pedidos`} className="mb-1.5 block text-[13px] font-medium text-texto">
                Pedidos
              </label>
              <input
                id={`${id}-pedidos`}
                name={`pedidos_${c.canal}`}
                value={v.pedidos}
                onChange={(e) => mudar({ pedidos: e.target.value })}
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                aria-invalid={!!erros.pedidos}
                aria-describedby={`${id}-pedidos-erro`}
                className={NUMERO}
              />
              <Erro id={`${id}-pedidos-erro`} texto={erros.pedidos} />
            </div>
            <div>
              <label htmlFor={`${id}-clientes`} className="mb-1.5 block text-[13px] font-medium text-texto">
                Clientes atendidos
              </label>
              <input
                id={`${id}-clientes`}
                name={`clientes_${c.canal}`}
                value={v.clientes}
                onChange={(e) => mudar({ clientes: e.target.value })}
                inputMode="numeric"
                autoComplete="off"
                placeholder={v.pedidos.trim() || '= pedidos'}
                aria-invalid={!!erros.clientes}
                aria-describedby={`${id}-clientes-erro ${id}-clientes-ajuda`}
                className={NUMERO}
              />
              <Erro id={`${id}-clientes-erro`} texto={erros.clientes} />
              <p id={`${id}-clientes-ajuda`} className="sr-only">
                Em branco vale o número de pedidos.
              </p>
            </div>
          </div>
        </fieldset>
        {/*
          Decisão 519: "Não vendeu" fica fora do fieldset para o botão de ajuda ao lado dele abrir também no dia só de consulta
          (fieldset desligado desliga todo botão de dentro). A caixa se desliga sozinha, com a mesma regra, e diz o canal ao leitor de tela.
        */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span className="flex items-center gap-1">
            <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-texto">
              <input
                type="checkbox"
                name={`naoVendeu_${c.canal}`}
                checked={v.naoVendeu}
                disabled={travado}
                onChange={(e) => mudar(e.target.checked ? { naoVendeu: true, valor: '', pedidos: '', clientes: '' } : { naoVendeu: false })}
                className={MARCAR}
              />
              Não vendeu<span className="sr-only">: {CANAIS[c.canal].rotulo}</span>
            </label>
            {comAjuda && <PontoDeAjuda ponto="nao-vendeu" className="-my-3 sm:-my-1.5" />}
          </span>
          <p aria-live="polite" className="text-[13px] tabular-nums text-suave">
            {apoio}
          </p>
        </div>
        <Erro id={`${id}-geral`} texto={erros.geral} />
      </div>
      {c.quem && <p className="mt-3 border-t border-linha pt-2.5 text-[12px] text-suave">Último lançamento: {c.quem}</p>}
    </Painel>
  );
}

export function FormDoDia({
  acao,
  canais,
  voltar,
  volta,
  bloqueio,
  somenteLeitura,
  fechado,
}: {
  acao: AcaoDoDia;
  canais: CanalParaATela[];
  voltar: string;
  /** Decisão 518: a Home de onde a pessoa veio (já conferida); a action confere de novo e a leva no redirecionamento. */
  volta?: string;
  bloqueio: string | null;
  /** Sem "lançar faturamento" na loja, ou dia de período fechado: só mostra. */
  somenteLeitura: boolean;
  fechado: string | null;
}) {
  const [estado, enviar] = useActionState<EstadoDoDia, FormData>(acao, null);
  const saida = useAvisoDeSaida(estado);
  const travado = somenteLeitura || !!bloqueio || !!fechado;
  // Decisão 519: os pontos ficam no primeiro canal que a loja vende (canal desligado só aparece porque tem lançamento antigo).
  const comAjuda = (canais.find((c) => !c.desligado) ?? canais[0])?.canal;
  return (
    <FormularioComAcao action={enviar} onSubmit={saida.aoEnviar} noValidate className="space-y-4">
      <ErroGeralDoDia estado={estado} recarregar={voltar} />
      {volta && <input type="hidden" name="volta" value={volta} />}
      {estado?.erros.data && (
        <p role="alert" className="text-[13px] text-erro">
          {estado.erros.data}
        </p>
      )}
      {canais.map((c) => (
        <BlocoDoCanal key={c.canal} c={c} erros={estado?.porCanal[c.canal] ?? {}} somenteLeitura={travado} aoMudar={saida.aoMudar} comAjuda={c.canal === comAjuda} />
      ))}
      {!travado && (
        <div data-barra-fixa className="sticky bottom-0 z-20 -mx-4 flex flex-col gap-2 border-t border-linha bg-fundo px-4 py-3 sm:-mx-6 sm:flex-row sm:justify-end sm:px-6 lg:-mx-8 lg:px-8">
          <Link href={voltar} className={classeDeBotao('fantasma', 'w-full sm:w-auto')}>
            Voltar sem salvar
          </Link>
          <BotaoEnviar pendente="Salvando…" className="w-full sm:w-auto sm:min-w-40">
            Salvar o dia
          </BotaoEnviar>
        </div>
      )}
    </FormularioComAcao>
  );
}

/**
 * O que acontece com o canal depois de remover (decisão 519, revisão): Remover apaga só o que a casa digitou ou importou.
 *  - `integracao`: o canal tem número da integração valendo, que fica e continua contando como lançamento;
 *  - `pode-faltar`: loja ativa que vende no canal: sem lançamento, o dia que já passou pode virar falta (a tela não sabe se a loja
 *    ainda conta como "lançando": remover o único lançamento dela tira o início);
 *  - `sem-lancamento`: canal desligado ou loja desativada, que não cobram falta.
 */
export type DepoisDeRemover = 'integracao' | 'integracao-clientes' | 'pode-faltar' | 'sem-lancamento';

const FRASE_DEPOIS_DE_REMOVER: Record<DepoisDeRemover, string> = {
  integracao: 'Fica valendo o número da integração.',
  'integracao-clientes': 'Faturamento e pedidos da integração continuam. Clientes atendidos ficam sem dado.',
  'pode-faltar': 'O dia volta a ficar sem lançamento neste canal e, se o dia já passou, pode contar como falta.',
  'sem-lancamento': 'O dia volta a ficar sem lançamento neste canal.',
};

/** Remover o lançamento de um canal (loja ou dia errado). Motivo obrigatório; o antes fica no histórico. */
export function FormRemover({
  acao,
  rotulo,
  versao,
  voltar,
  volta,
  depois,
}: {
  acao: AcaoDoDia;
  rotulo: string;
  versao: string;
  voltar: string;
  volta?: string;
  /** Decisão 519: a consequência dita antes de apagar. */
  depois: DepoisDeRemover;
}) {
  const [estado, enviar] = useActionState<EstadoDoDia, FormData>(acao, null);
  const erro = estado?.porCanal && Object.values(estado.porCanal)[0]?.geral;
  const id = `remover-${rotulo.toLowerCase().replace(/[^a-z]/g, '')}`;
  return (
    <details className="group rounded-[10px] border border-linha px-4 py-3">
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-texto">
        Remover o lançamento de {rotulo}
        <span className="text-[12px] font-normal text-suave group-open:hidden">abrir</span>
      </summary>
      <FormularioComAcao action={enviar} className="mt-3 space-y-3">
        <ErroGeralDoDia estado={estado} recarregar={voltar} />
        <input type="hidden" name="versao" value={versao} />
        {volta && <input type="hidden" name="volta" value={volta} />}
        <div>
          <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-texto">
            Por que está removendo? (de 3 a 200 letras)
          </label>
          <input id={id} name="motivo" required minLength={3} maxLength={200} autoComplete="off" aria-invalid={!!erro} aria-describedby={`${id}-erro`} className={CAMPO} />
          <Erro id={`${id}-erro`} texto={erro || undefined} />
        </div>
        <p className="text-[12px] text-suave">
          {FRASE_DEPOIS_DE_REMOVER[depois]} O que estava lançado e o motivo ficam em Alterações deste dia.
        </p>
        <BotaoEnviar variante="perigo" pendente="Removendo…">
          Remover lançamento
        </BotaoEnviar>
      </FormularioComAcao>
    </details>
  );
}
