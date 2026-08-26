import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import {
  agendarCadencia,
  agendarToque,
  apertarJanela,
  dentroDaJanela,
  janelaPadrao,
  proximaJanelaUtil,
} from '@/lib/barney/janela';
import { TIMEZONE } from '@/lib/barney/regras';

const em = (iso: string) => DateTime.fromISO(iso, { zone: TIMEZONE });

// Âncoras conferidas: 2026-08-24 é segunda-feira.
const SEGUNDA = em('2026-08-24T14:00:00');
const QUARTA = em('2026-08-26T14:00:00');
const SEXTA = em('2026-08-28T14:00:00');
const SABADO = em('2026-08-29T11:00:00');
const DOMINGO = em('2026-08-30T11:00:00');

describe('âncoras do calendário', () => {
  it('os dias da semana são os que o teste assume', () => {
    expect(SEGUNDA.weekday).toBe(1);
    expect(QUARTA.weekday).toBe(3);
    expect(SEXTA.weekday).toBe(5);
    expect(SABADO.weekday).toBe(6);
    expect(DOMINGO.weekday).toBe(7);
  });
});

describe('dentroDaJanela', () => {
  it('aceita dia útil no meio da janela', () => {
    expect(dentroDaJanela(SEGUNDA)).toBe(true);
  });

  it('recusa fim de semana em qualquer hora', () => {
    expect(dentroDaJanela(SABADO)).toBe(false);
    expect(dentroDaJanela(DOMINGO)).toBe(false);
  });

  it('recusa antes das 10h e a partir das 18h', () => {
    expect(dentroDaJanela(SEGUNDA.set({ hour: 9, minute: 59 }))).toBe(false);
    expect(dentroDaJanela(SEGUNDA.set({ hour: 10, minute: 0 }))).toBe(true);
    expect(dentroDaJanela(SEGUNDA.set({ hour: 17, minute: 59 }))).toBe(true);
    expect(dentroDaJanela(SEGUNDA.set({ hour: 18, minute: 0 }))).toBe(false);
  });
});

describe('proximaJanelaUtil', () => {
  it('devolve o próprio instante quando já está na janela', () => {
    expect(proximaJanelaUtil(SEGUNDA).toISO()).toBe(SEGUNDA.toISO());
  });

  it('de madrugada em dia útil, abre no mesmo dia às 10h', () => {
    const r = proximaJanelaUtil(SEGUNDA.set({ hour: 3 }));
    expect(r.day).toBe(SEGUNDA.day);
    expect(r.hour).toBe(10);
  });

  it('depois das 18h de sexta, cai na segunda às 10h', () => {
    const r = proximaJanelaUtil(SEXTA.set({ hour: 19 }));
    expect(r.weekday).toBe(1);
    expect(r.day).toBe(31);
    expect(r.hour).toBe(10);
  });

  it('sábado desliza para segunda às 10h', () => {
    const r = proximaJanelaUtil(SABADO);
    expect(r.weekday).toBe(1);
    expect(r.hour).toBe(10);
  });

  it('domingo desliza para segunda às 10h', () => {
    expect(proximaJanelaUtil(DOMINGO).weekday).toBe(1);
  });

  it('grita em vez de laçar quando não há dia habilitado', () => {
    expect(() => proximaJanelaUtil(SEGUNDA, { ...janelaPadrao(), diasSemana: [] })).toThrow(
      /nenhum dia habilitado/i,
    );
  });
});

describe('agendarToque — deslize dos offsets', () => {
  it('quarta + 4 dias cai no domingo e desliza para segunda', () => {
    const r = agendarToque(QUARTA, 4);
    expect(QUARTA.plus({ days: 4 }).weekday).toBe(7); // domingo
    expect(r.weekday).toBe(1);
    expect(r.hour).toBe(10);
  });

  it('sexta + 4 dias cai na terça e NÃO desliza', () => {
    const r = agendarToque(SEXTA, 4);
    expect(r.weekday).toBe(2);
    expect(r.hour).toBe(14); // preserva a hora do D0
  });

  it('sexta + 10 dias cai na segunda e mantém a hora', () => {
    const r = agendarToque(SEXTA, 10);
    expect(r.weekday).toBe(1);
    expect(r.hour).toBe(14);
  });

  it('D0 no sábado já entra deslizado', () => {
    expect(agendarToque(SABADO, 0).weekday).toBe(1);
  });
});

describe('agendarCadencia', () => {
  it('monta os 3 toques, todos em dia útil e dentro da janela', () => {
    for (const base of [SEGUNDA, QUARTA, SEXTA, SABADO]) {
      const cadencia = agendarCadencia(base);
      expect(cadencia.map((c) => c.toque)).toEqual(['D0', 'D4', 'D10']);
      for (const { toque, quando } of cadencia) {
        expect(dentroDaJanela(quando), `${base.toISODate()} ${toque} caiu fora`).toBe(true);
      }
    }
  });

  it('os toques saem em ordem cronológica', () => {
    const c = agendarCadencia(QUARTA);
    expect(c[0].quando < c[1].quando).toBe(true);
    expect(c[1].quando < c[2].quando).toBe(true);
  });
});

describe('apertarJanela — config nunca alarga', () => {
  it('ignora hora de início mais cedo que o padrão', () => {
    expect(apertarJanela({ horaInicio: 7 }).horaInicio).toBe(10);
  });

  it('ignora hora de fim mais tarde que o padrão', () => {
    expect(apertarJanela({ horaFim: 22 }).horaFim).toBe(18);
  });

  it('aceita apertar para dentro', () => {
    const j = apertarJanela({ horaInicio: 11, horaFim: 16 });
    expect(j.horaInicio).toBe(11);
    expect(j.horaFim).toBe(16);
  });

  it('descarta sábado e domingo pedidos pela config', () => {
    expect(apertarJanela({ diasSemana: [1, 2, 6, 7] }).diasSemana).toEqual([1, 2]);
  });

  it('config sem nenhum dia válido volta ao padrão em vez de emudecer o worker', () => {
    expect(apertarJanela({ diasSemana: [6, 7] }).diasSemana).toEqual([1, 2, 3, 4, 5]);
  });

  it('janela invertida volta ao padrão', () => {
    expect(apertarJanela({ horaInicio: 16, horaFim: 12 }).horaFim).toBe(18);
  });
});
