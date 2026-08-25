import { describe, expect, it } from 'vitest';
import { canalDoTelefone, ehCelular, normalizarTelefone } from '@/lib/barney/telefone';

describe('normalizarTelefone', () => {
  it('normaliza celular carioca em vários formatos para o mesmo E.164', () => {
    const esperado = '5521999998888';
    for (const entrada of [
      '(21) 99999-8888',
      '21999998888',
      '+55 21 99999-8888',
      '5521999998888',
      '021 99999 8888',
      '  (21)99999.8888  ',
    ]) {
      expect(normalizarTelefone(entrada).e164, `falhou para "${entrada}"`).toBe(esperado);
    }
  });

  it('classifica fixo como FIXO e não como celular', () => {
    const r = normalizarTelefone('(21) 2555-1234');
    expect(r.tipo).toBe('FIXO');
    expect(r.e164).toBe('552125551234');
    expect(ehCelular('(21) 2555-1234')).toBe(false);
  });

  it('trata "SEM TELEFONE" da skill como inválido, não como número', () => {
    const r = normalizarTelefone('SEM TELEFONE');
    expect(r.tipo).toBe('INVALIDO');
    expect(r.e164).toBe('');
    expect(r.motivo).toBe('sem telefone');
  });

  it('recusa DDD inexistente em vez de inventar um número', () => {
    expect(normalizarTelefone('(00) 99999-8888').tipo).toBe('INVALIDO');
    expect(normalizarTelefone('(23) 99999-8888').tipo).toBe('INVALIDO');
  });

  it('recusa 9 dígitos que não começam em 9 — não é celular', () => {
    expect(normalizarTelefone('(21) 89999-8888').tipo).toBe('INVALIDO');
  });

  it('não come o DDD 55 (Santa Maria/RS) achando que é DDI', () => {
    const r = normalizarTelefone('(55) 99999-8888');
    expect(r.tipo).toBe('CELULAR');
    expect(r.ddd).toBe('55');
    expect(r.e164).toBe('5555999998888');
  });

  it('vazio e nulo saem como inválidos', () => {
    expect(normalizarTelefone(null).tipo).toBe('INVALIDO');
    expect(normalizarTelefone(undefined).tipo).toBe('INVALIDO');
    expect(normalizarTelefone('   ').tipo).toBe('INVALIDO');
    expect(normalizarTelefone('abc').tipo).toBe('INVALIDO');
  });

  it('manda fixo para VISITA e celular para WHATSAPP', () => {
    expect(canalDoTelefone('(21) 99999-8888')).toBe('WHATSAPP');
    expect(canalDoTelefone('(21) 2555-1234')).toBe('VISITA');
    expect(canalDoTelefone('SEM TELEFONE')).toBe('VISITA');
  });
});
