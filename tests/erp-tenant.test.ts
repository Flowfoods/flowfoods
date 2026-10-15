import { describe, expect, it } from 'vitest';
import { amarrarAoParceiro, ErroDeTenant } from '@/lib/erp/tenant';

const A = 'parceiro-a';

describe('ERP · portão de tenant (reescrita de query)', () => {
  it('toda leitura ganha o parceiro no where', () => {
    for (const op of ['findMany', 'findFirst', 'findUnique', 'count', 'aggregate', 'groupBy', 'deleteMany']) {
      expect(amarrarAoParceiro(op, { where: { nome: 'x' } }, A).where).toEqual({ nome: 'x', parceiroId: A });
    }
    expect(amarrarAoParceiro('findMany', {}, A).where).toEqual({ parceiroId: A });
  });

  it('create carimba o parceiro no dado', () => {
    expect(amarrarAoParceiro('create', { data: { nome: 'x' } }, A).data).toEqual({ nome: 'x', parceiroId: A });
    expect(amarrarAoParceiro('createMany', { data: [{ nome: 'x' }, { nome: 'y' }] }, A).data).toEqual([
      { nome: 'x', parceiroId: A },
      { nome: 'y', parceiroId: A },
    ]);
  });

  it('apontar outro parceiro estoura — no where, no dado e no update', () => {
    expect(() => amarrarAoParceiro('findMany', { where: { parceiroId: 'B' } }, A)).toThrow(ErroDeTenant);
    expect(() => amarrarAoParceiro('create', { data: { parceiroId: 'B' } }, A)).toThrow(ErroDeTenant);
    expect(() => amarrarAoParceiro('update', { where: { id: '1' }, data: { parceiroId: 'B' } }, A)).toThrow(ErroDeTenant);
    expect(() =>
      amarrarAoParceiro('create', { data: { parceiro: { connect: { id: 'B' } } } }, A),
    ).toThrow(ErroDeTenant);
    expect(() =>
      amarrarAoParceiro('upsert', { where: { id: '1' }, create: { parceiroId: 'B' }, update: {} }, A),
    ).toThrow(ErroDeTenant);
  });

  it('sem parceiro não roda', () => {
    expect(() => amarrarAoParceiro('findMany', {}, '')).toThrow(ErroDeTenant);
  });
});
