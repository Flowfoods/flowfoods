import { afterAll, vi } from 'vitest';

/**
 * Fixa o relógio do arquivo de teste num instante do cenário. Só `Date` é simulado (timers, rede e banco continuam
 * reais) e o relógio anda em tempo real a partir dali, para versões por timestamp continuarem distintas.
 *
 * Chamar no topo do arquivo, ANTES do `describe`: datas calculadas na coleta (ex.: "hoje − 2 dias") também passam a ser
 * do cenário. Sem isso, um cenário escrito para "17 de outubro" — ou para "dois dias atrás, no mesmo mês" — quebra
 * quando o mês vira (portão de 02/11/2026). Páginas e ações que leem o relógio real passam a ver a mesma data que os
 * serviços recebem por parâmetro.
 */
export function relogioDoCenario(instante: string): void {
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date(instante));
  afterAll(() => {
    vi.useRealTimers();
  });
}
