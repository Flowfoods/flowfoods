/**
 * Janela de envio e deslize para dia útil.
 *
 * Tudo em `America/Sao_Paulo`. A contagem de teto diário também é nesse fuso —
 * se o worker contasse em UTC, o "dia" viraria às 21h de Brasília e o teto de 30
 * abriria de novo no meio da noite.
 *
 * A janela é seg–sex 10h–18h. Configurável para DENTRO (ver `apertarJanela`),
 * nunca para fora: `evolution-api-sysadmin` tolera 7h–22h, e a nossa é bem mais
 * estreita de propósito — abordagem fria fora do expediente comercial vira
 * denúncia.
 */

import { DateTime } from 'luxon';
import { JANELA_PADRAO, TIMEZONE, TOQUES, type Toque } from './regras';

export interface Janela {
  /** 1=segunda … 7=domingo (convenção Luxon). */
  diasSemana: number[];
  horaInicio: number;
  horaFim: number;
}

export const janelaPadrao = (): Janela => ({
  diasSemana: [...JANELA_PADRAO.diasSemana],
  horaInicio: JANELA_PADRAO.horaInicio,
  horaFim: JANELA_PADRAO.horaFim,
});

export function agora(): DateTime {
  return DateTime.now().setZone(TIMEZONE);
}

export function dentroDaJanela(dt: DateTime, janela: Janela = janelaPadrao()): boolean {
  const local = dt.setZone(TIMEZONE);
  if (!janela.diasSemana.includes(local.weekday)) return false;
  // Fim é exclusivo: às 18:00 em ponto a janela já fechou.
  return local.hour >= janela.horaInicio && local.hour < janela.horaFim;
}

/**
 * Devolve o próprio instante se ele já está na janela; senão, o começo da
 * próxima janela útil.
 *
 * Anda no máximo 8 dias — o suficiente para atravessar qualquer fim de semana
 * ou uma janela de um único dia por semana. Se estourar, é configuração
 * impossível (nenhum dia habilitado) e a função grita em vez de laçar.
 */
export function proximaJanelaUtil(dt: DateTime, janela: Janela = janelaPadrao()): DateTime {
  if (janela.diasSemana.length === 0) {
    throw new Error('Janela sem nenhum dia habilitado — configuração inválida.');
  }

  let cursor = dt.setZone(TIMEZONE);

  if (dentroDaJanela(cursor, janela)) return cursor;

  // Se é dia útil e ainda não abriu, abre hoje mesmo.
  if (janela.diasSemana.includes(cursor.weekday) && cursor.hour < janela.horaInicio) {
    return cursor.set({ hour: janela.horaInicio, minute: 0, second: 0, millisecond: 0 });
  }

  // Senão, primeiro dia habilitado a partir de amanhã.
  for (let i = 1; i <= 8; i += 1) {
    const candidato = cursor
      .plus({ days: i })
      .set({ hour: janela.horaInicio, minute: 0, second: 0, millisecond: 0 });
    if (janela.diasSemana.includes(candidato.weekday)) return candidato;
  }

  throw new Error('Não achei janela útil em 8 dias — configuração inválida.');
}

/**
 * Agenda um toque da cadência.
 *
 * Soma o offset em dias preservando a hora do D0 e depois desliza para a janela.
 * A ordem importa: deslizar antes de somar produziria datas erradas quando o D0
 * já cai fora da janela.
 */
export function agendarToque(
  base: DateTime,
  offsetDias: number,
  janela: Janela = janelaPadrao(),
): DateTime {
  const alvo = base.setZone(TIMEZONE).plus({ days: offsetDias });
  return proximaJanelaUtil(alvo, janela);
}

/** Agenda os 3 toques de uma vez, a partir do instante do D0. */
export function agendarCadencia(
  d0: DateTime,
  janela: Janela = janelaPadrao(),
): Array<{ toque: Toque; quando: DateTime }> {
  return TOQUES.map(({ toque, offsetDias }) => ({
    toque,
    quando: agendarToque(d0, offsetDias, janela),
  }));
}

/**
 * Aperta a janela recebida da configuração contra a padrão.
 *
 * Nunca alarga: dias fora do padrão são descartados, hora de início só sobe,
 * hora de fim só desce. É aqui que `/rodolfo/config` fica impedido de virar uma
 * porta para 22h ou para o domingo.
 */
export function apertarJanela(pedida: Partial<Janela>): Janela {
  const base = janelaPadrao();

  const dias = (pedida.diasSemana ?? base.diasSemana).filter((d) => base.diasSemana.includes(d));

  const inicio = Math.max(base.horaInicio, pedida.horaInicio ?? base.horaInicio);
  const fim = Math.min(base.horaFim, pedida.horaFim ?? base.horaFim);

  return {
    diasSemana: dias.length > 0 ? dias : base.diasSemana,
    horaInicio: inicio,
    // Uma janela invertida (início ≥ fim) não envia nada; devolve o padrão para
    // não criar um estado em que o worker fica mudo sem ninguém entender por quê.
    horaFim: fim > inicio ? fim : base.horaFim,
  };
}
