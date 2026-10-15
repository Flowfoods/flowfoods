import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { amarrarAoParceiro, doParceiro, ehModeloDeTenant, ErroDeTenant, MODELOS_DE_TENANT } from '@/lib/erp/tenant';

const A = 'parceiro-a';

describe('ERP · portão de tenant (reescrita de query)', () => {
  it('toda leitura ganha o parceiro no where', () => {
    for (const op of ['findMany', 'findFirst', 'findUnique', 'count', 'aggregate', 'groupBy', 'deleteMany']) {
      expect(amarrarAoParceiro('Insumo', op, { where: { nome: 'x' } }, A).where).toEqual({ nome: 'x', parceiroId: A });
    }
    expect(amarrarAoParceiro('Insumo', 'findMany', {}, A).where).toEqual({ parceiroId: A });
  });

  it('create carimba o parceiro no dado', () => {
    expect(amarrarAoParceiro('Insumo', 'create', { data: { nome: 'x' } }, A).data).toEqual({ nome: 'x', parceiroId: A });
    expect(amarrarAoParceiro('Insumo', 'createMany', { data: [{ nome: 'x' }, { nome: 'y' }] }, A).data).toEqual([
      { nome: 'x', parceiroId: A },
      { nome: 'y', parceiroId: A },
    ]);
  });

  it('apontar outro parceiro estoura — no where, no dado e no update', () => {
    expect(() => amarrarAoParceiro('Insumo', 'findMany', { where: { parceiroId: 'B' } }, A)).toThrow(ErroDeTenant);
    expect(() => amarrarAoParceiro('Insumo', 'create', { data: { parceiroId: 'B' } }, A)).toThrow(ErroDeTenant);
    expect(() => amarrarAoParceiro('Insumo', 'update', { where: { id: '1' }, data: { parceiroId: 'B' } }, A)).toThrow(ErroDeTenant);
    expect(() =>
      amarrarAoParceiro('Insumo', 'create', { data: { parceiro: { connect: { id: 'B' } } } }, A),
    ).toThrow(ErroDeTenant);
    expect(() =>
      amarrarAoParceiro('Insumo', 'upsert', { where: { id: '1' }, create: { parceiroId: 'B' }, update: {} }, A),
    ).toThrow(ErroDeTenant);
  });

  it('sem parceiro não roda', () => {
    expect(() => amarrarAoParceiro('Insumo', 'findMany', {}, '')).toThrow(ErroDeTenant);
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
      amarrarAoParceiro('Insumo', 'upsert', { where: { id: '1' }, create: { nome: 'x' }, update: { parceiroId: 'B' } }, A),
    ).toThrow(ErroDeTenant);
    expect(amarrarAoParceiro('Insumo', 'updateMany', { where: { lojaId: 'l' }, data: { status: 'FECHADA' } }, A)).toEqual({
      where: { lojaId: 'l', parceiroId: A },
      data: { status: 'FECHADA' },
    });
  });
});

describe('ERP · portão recusa campo de relação no dado (troca de dono via connect)', () => {
  it('connect, create aninhado, connectOrCreate e set são recusados; escalar passa', () => {
    const casos: [string, string, Record<string, unknown>][] = [
      ['ProdutoVenda', 'update', { where: { id: 'p' }, data: { ficha: { connect: { id: 'fichaDeA' } } } }],
      ['Insumo', 'update', { where: { id: 'i' }, data: { fornecedorPadrao: { connect: { id: 'fornA' } } } }],
      ['Insumo', 'updateMany', { where: {}, data: { fornecedorPadrao: { disconnect: true } } }],
      ['FichaTecnica', 'create', { data: { nome: 'F', itens: { create: [{ insumoId: 'x', quantidadeMilesimos: 1 }] } } }],
      ['FichaItem', 'create', { data: { fichaId: 'f', insumo: { connectOrCreate: { where: { id: 'x' } } } } }],
      ['Insumo', 'upsert', { where: { id: 'i' }, create: { nome: 'x' }, update: { fornecedorPadrao: { connect: { id: 'a' } } } }],
      ['Insumo', 'upsert', { where: { id: 'i' }, create: { nome: 'x', variantes: { create: [] } }, update: {} }],
      ['Loja', 'createMany', { data: [{ nome: 'x', parceiro: { connect: { id: 'B' } } }] }],
    ];
    for (const [modelo, op, args] of casos) {
      expect(() => amarrarAoParceiro(modelo, op, args, A), `${modelo}.${op}`).toThrow(ErroDeTenant);
    }
    expect(
      amarrarAoParceiro('ProdutoVenda', 'update', { where: { id: 'p' }, data: { fichaId: 'f' } }, A).data,
    ).toEqual({ fichaId: 'f' });
  });

  it('modelo fora da lista não passa pelo portão', () => {
    expect(() => amarrarAoParceiro('Lead', 'findMany', {}, A)).toThrow(ErroDeTenant);
    expect(() => amarrarAoParceiro('ParceiroFlow', 'findMany', {}, A)).toThrow(ErroDeTenant);
  });

  it('o delegate exposto não tem $parent nem saída lateral', () => {
    const cliente = doParceiro(A);
    for (const m of MODELOS_DE_TENANT) {
      const d = cliente[m] as unknown as Record<string, unknown>;
      expect('$parent' in d, m).toBe(false);
      expect('$queryRawUnsafe' in d, m).toBe(false);
      expect(Object.isFrozen(d), m).toBe(true);
    }
  });
});

describe('ERP · prisma do portal travado em runtime para modelos de tenant', () => {
  it('prisma.<modelo de tenant> estoura antes de ir ao banco, para todos os modelos', async () => {
    const portal = prisma as unknown as Record<string, { findMany: (a?: unknown) => Promise<unknown> }>;
    for (const m of MODELOS_DE_TENANT) {
      await expect(portal[m].findMany(), m).rejects.toThrow(ErroDeTenant);
    }
    // Alias não engana: é o mesmo objeto.
    const db = prisma;
    await expect(db.loja.findMany()).rejects.toThrow(ErroDeTenant);
  });

  it('ParceiroFlow não abre as relações de tenant pelo prisma do portal', async () => {
    await expect(prisma.parceiroFlow.findMany({ include: { erpLojas: true } })).rejects.toThrow(ErroDeTenant);
    await expect(prisma.parceiroFlow.findMany({ select: { _count: { select: { insumos: true } } } })).rejects.toThrow(
      ErroDeTenant,
    );
    await expect(prisma.parceiroFlow.findMany({ where: { erpLojas: { some: {} } } })).rejects.toThrow(ErroDeTenant);
  });
});
