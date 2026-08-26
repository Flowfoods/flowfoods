import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { podeEnviar, sortearIntervaloSegundos, tetoDiarioVigente } from '@/lib/barney/tetos';
import type { EstadoEnvio } from '@/lib/barney/tetos';
import { INTERVALO_MIN_S, MAX_POR_DIA, MAX_POR_HORA, TIMEZONE } from '@/lib/barney/regras';

/** Terça-feira, 14h — bem no meio da janela. */
const TERCA_14H = DateTime.fromISO('2026-08-25T14:00:00', { zone: TIMEZONE });

/** Número já aquecido: passou dos 10 manuais e da rampa. */
const RAMPA_VELHA = TERCA_14H.minus({ days: 30 });

function estado(over: Partial<EstadoEnvio> = {}): EstadoEnvio {
  return {
    disparoAtivo: true,
    estadoInstancia: 'open',
    primeiroEnvioEm: RAMPA_VELHA,
    totalEnviadoHistorico: 500,
    enviadosHoje: 0,
    entreguesHoje: 0,
    falhasConsecutivas: 0,
    enviadosUltimaHora: 0,
    ultimoEnvioEm: null,
    ...over,
  };
}

describe('teto diário e rampa', () => {
  it('rampa: dia 5 ainda é 10/dia', () => {
    const primeiro = TERCA_14H.minus({ days: 5 });
    expect(tetoDiarioVigente(primeiro, TERCA_14H)).toBe(10);
  });

  it('rampa: dia 6 (fim da semana 1) ainda é 10', () => {
    expect(tetoDiarioVigente(TERCA_14H.minus({ days: 6 }), TERCA_14H)).toBe(10);
  });

  it('rampa: dia 7 vira 20', () => {
    expect(tetoDiarioVigente(TERCA_14H.minus({ days: 7 }), TERCA_14H)).toBe(20);
  });

  it('rampa: dia 14 chega em 30 e não passa disso', () => {
    expect(tetoDiarioVigente(TERCA_14H.minus({ days: 14 }), TERCA_14H)).toBe(30);
    expect(tetoDiarioVigente(TERCA_14H.minus({ days: 400 }), TERCA_14H)).toBe(MAX_POR_DIA);
  });

  it('número que nunca enviou começa em 10', () => {
    expect(tetoDiarioVigente(null, TERCA_14H)).toBe(10);
  });

  it('o 31º do dia é recusado', () => {
    const d = podeEnviar(estado({ enviadosHoje: 30, entreguesHoje: 30 }), TERCA_14H);
    expect(d.permitido).toBe(false);
    expect(d.motivo).toBe('TETO_DIARIO');
  });

  it('o 30º ainda passa', () => {
    const d = podeEnviar(estado({ enviadosHoje: 29, entreguesHoje: 29 }), TERCA_14H);
    expect(d.permitido).toBe(true);
  });

  it('na semana 1 o 11º já é recusado, mesmo longe dos 30', () => {
    const d = podeEnviar(
      estado({ primeiroEnvioEm: TERCA_14H.minus({ days: 3 }), enviadosHoje: 10, entreguesHoje: 10 }),
      TERCA_14H,
    );
    expect(d.permitido).toBe(false);
    expect(d.motivo).toBe('TETO_DIARIO');
    expect(d.tetoDiaVigente).toBe(10);
  });
});

describe('teto por hora e intervalo', () => {
  it('o 9º da hora é recusado', () => {
    const d = podeEnviar(estado({ enviadosUltimaHora: MAX_POR_HORA }), TERCA_14H);
    expect(d.permitido).toBe(false);
    expect(d.motivo).toBe('TETO_HORARIO');
  });

  it('o 8º da hora ainda passa', () => {
    expect(podeEnviar(estado({ enviadosUltimaHora: 7 }), TERCA_14H).permitido).toBe(true);
  });

  it('config que BAIXA o teto do dia vale', () => {
    const d = podeEnviar(
      estado({ enviadosHoje: 12, entreguesHoje: 12, maxPorDiaConfig: 12 }),
      TERCA_14H,
    );
    expect(d.motivo).toBe('TETO_DIARIO');
    expect(d.tetoDiaVigente).toBe(12);
  });

  it('config que tenta SUBIR o teto do dia é ignorada', () => {
    const d = podeEnviar(
      estado({ enviadosHoje: 30, entreguesHoje: 30, maxPorDiaConfig: 500 }),
      TERCA_14H,
    );
    expect(d.motivo).toBe('TETO_DIARIO');
    expect(d.tetoDiaVigente).toBe(MAX_POR_DIA);
  });

  it('config não fura a rampa: pedir 30 na semana 1 continua dando 10', () => {
    expect(tetoDiarioVigente(TERCA_14H.minus({ days: 3 }), TERCA_14H, 30)).toBe(10);
  });

  it('config que BAIXA o teto da hora vale', () => {
    const d = podeEnviar(estado({ enviadosUltimaHora: 3, maxPorHoraConfig: 3 }), TERCA_14H);
    expect(d.motivo).toBe('TETO_HORARIO');
  });

  it('config que tenta SUBIR o teto da hora é ignorada', () => {
    const d = podeEnviar(
      estado({ enviadosUltimaHora: MAX_POR_HORA, maxPorHoraConfig: 999 }),
      TERCA_14H,
    );
    expect(d.motivo).toBe('TETO_HORARIO');
  });

  it('envio a menos de 120s do anterior é recusado', () => {
    const d = podeEnviar(
      estado({ ultimoEnvioEm: TERCA_14H.minus({ seconds: 119 }) }),
      TERCA_14H,
    );
    expect(d.permitido).toBe(false);
    expect(d.motivo).toBe('INTERVALO_MINIMO');
    expect(d.tentarEmSegundos).toBe(1);
  });

  it('exatamente 120s passa', () => {
    const d = podeEnviar(estado({ ultimoEnvioEm: TERCA_14H.minus({ seconds: 120 }) }), TERCA_14H);
    expect(d.permitido).toBe(true);
  });

  it('o intervalo sorteado nunca cai abaixo do piso rígido', () => {
    // Mesmo com faixa configurada absurdamente baixa, o piso vence.
    for (const r of [0, 0.5, 0.999]) {
      expect(sortearIntervaloSegundos(() => r, 1, 5)).toBeGreaterThanOrEqual(INTERVALO_MIN_S);
    }
    expect(sortearIntervaloSegundos(() => 0)).toBe(300);
    expect(sortearIntervaloSegundos(() => 1)).toBe(1200);
  });
});

describe('stop-loss', () => {
  it('pausa com 3 falhas consecutivas', () => {
    const d = podeEnviar(estado({ falhasConsecutivas: 3 }), TERCA_14H);
    expect(d.permitido).toBe(false);
    expect(d.motivo).toBe('STOP_LOSS_FALHAS');
  });

  it('pausa quando a entrega do dia cai abaixo de 70%', () => {
    const d = podeEnviar(estado({ enviadosHoje: 20, entreguesHoje: 13 }), TERCA_14H);
    expect(d.permitido).toBe(false);
    expect(d.motivo).toBe('STOP_LOSS_ENTREGA');
  });

  it('NÃO pausa por entrega com amostra pequena — 1 envio não confirmado não para o dia', () => {
    const d = podeEnviar(estado({ enviadosHoje: 1, entreguesHoje: 0 }), TERCA_14H);
    expect(d.permitido).toBe(true);
  });

  it('pausa quando a instância não está open', () => {
    for (const st of ['close', 'connecting', 'qr']) {
      const d = podeEnviar(estado({ estadoInstancia: st }), TERCA_14H);
      expect(d.permitido).toBe(false);
      expect(d.motivo).toBe('INSTANCIA_FORA_DO_AR');
    }
  });

  it('stop-loss vence até o envio manual — o limite é do WhatsApp, não do operador', () => {
    const d = podeEnviar(estado({ falhasConsecutivas: 5 }), TERCA_14H, { manual: true });
    expect(d.permitido).toBe(false);
    expect(d.motivo).toBe('STOP_LOSS_FALHAS');
  });
});

describe('chave geral e envios manuais iniciais', () => {
  it('disparoAtivo=false impede qualquer envio automático', () => {
    const d = podeEnviar(estado({ disparoAtivo: false }), TERCA_14H);
    expect(d.permitido).toBe(false);
    expect(d.motivo).toBe('DISPARO_DESLIGADO');
  });

  it('disparoAtivo=false impede até o manual — a chave é geral', () => {
    const d = podeEnviar(estado({ disparoAtivo: false }), TERCA_14H, { manual: true });
    expect(d.permitido).toBe(false);
    expect(d.motivo).toBe('DISPARO_DESLIGADO');
  });

  it('os 10 primeiros do número exigem envio manual', () => {
    const d = podeEnviar(estado({ totalEnviadoHistorico: 9 }), TERCA_14H);
    expect(d.permitido).toBe(false);
    expect(d.motivo).toBe('EXIGE_ENVIO_MANUAL');
    expect(d.explicacao).toContain('Faltam 1');
  });

  it('o manual passa durante os 10 iniciais', () => {
    const d = podeEnviar(estado({ totalEnviadoHistorico: 9 }), TERCA_14H, { manual: true });
    expect(d.permitido).toBe(true);
  });

  it('a partir do 11º o automático libera', () => {
    expect(podeEnviar(estado({ totalEnviadoHistorico: 10 }), TERCA_14H).permitido).toBe(true);
  });
});

describe('janela', () => {
  it('recusa fora da janela e libera o manual', () => {
    const sabado = DateTime.fromISO('2026-08-29T14:00:00', { zone: TIMEZONE });
    expect(sabado.weekday).toBe(6);
    const auto = podeEnviar(estado(), sabado);
    expect(auto.permitido).toBe(false);
    expect(auto.motivo).toBe('FORA_DA_JANELA');
    expect(podeEnviar(estado(), sabado, { manual: true }).permitido).toBe(true);
  });

  it('recusa às 18h em ponto — a janela fecha', () => {
    const d = podeEnviar(estado(), TERCA_14H.set({ hour: 18, minute: 0 }));
    expect(d.permitido).toBe(false);
    expect(d.motivo).toBe('FORA_DA_JANELA');
  });

  it('libera às 10h em ponto — a janela abre', () => {
    expect(podeEnviar(estado(), TERCA_14H.set({ hour: 10, minute: 0 })).permitido).toBe(true);
  });
});
