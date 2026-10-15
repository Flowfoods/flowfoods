import { describe, expect, it } from 'vitest';
import { amarrarAoParceiro, doParceiro, ehModeloDeTenant, ErroDeTenant, MODELOS_DE_TENANT } from '@/lib/erp/tenant';

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

describe('ERP · portão de tenant (todos os modelos)', () => {
  it('a reescrita vale igual para cada modelo novo', () => {
    // A extensão é `$allModels`: o que decide é o nome do modelo estar na lista.
    for (const m of MODELOS_DE_TENANT) {
      const nome = m[0].toUpperCase() + m.slice(1);
      expect(ehModeloDeTenant(nome), nome).toBe(true);
    }
    for (const fora of ['ParceiroFlow', 'Lead', 'User', 'PortalCliente', 'Message', undefined]) {
      expect(ehModeloDeTenant(fora)).toBe(false);
    }
  });

  it('o cliente do parceiro expõe todos os modelos de tenant, e só eles', () => {
    // $extends não conecta: dá para inspecionar sem banco.
    const cliente = doParceiro(A);
    expect(Object.keys(cliente).sort()).toEqual([...MODELOS_DE_TENANT, 'parceiroId', 'transacao'].sort());
    for (const m of MODELOS_DE_TENANT) expect(typeof cliente[m].findMany, m).toBe('function');
    for (const proibido of ['parceiroFlow', 'lead', '$queryRaw', '$executeRaw', '$transaction']) {
      expect(proibido in cliente, proibido).toBe(false);
    }
    expect(Object.isFrozen(cliente)).toBe(true);
  });

  it('upsert e updateMany em modelo novo também travam o dono', () => {
    expect(() =>
      amarrarAoParceiro('upsert', { where: { id: '1' }, create: { nome: 'x' }, update: { parceiroId: 'B' } }, A),
    ).toThrow(ErroDeTenant);
    expect(amarrarAoParceiro('updateMany', { where: { lojaId: 'l' }, data: { status: 'FECHADA' } }, A)).toEqual({
      where: { lojaId: 'l', parceiroId: A },
      data: { status: 'FECHADA' },
    });
  });
});
