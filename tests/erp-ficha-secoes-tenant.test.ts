import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { amarrarAoParceiro, doParceiro, ErroDeTenant, MODELOS_DE_TENANT, RELACOES_DE_TENANT } from '@/lib/erp/tenant';

describe('3A · taxonomia fechada no portão de tenant', () => {
  it('dois modelos e relações novas não abrem acesso global pelo parceiro', async () => {
    expect(MODELOS_DE_TENANT).toEqual(expect.arrayContaining(['secaoFicha', 'subsecaoFicha']));
    expect(RELACOES_DE_TENANT).toEqual(expect.arrayContaining(['erpSecoesFicha', 'erpSubsecoesFicha']));
    await expect(prisma.secaoFicha.findMany()).rejects.toThrow(ErroDeTenant);
    await expect(prisma.subsecaoFicha.findMany()).rejects.toThrow(ErroDeTenant);
    await expect(prisma.parceiroFlow.findMany({ include: { erpSecoesFicha: true } })).rejects.toThrow(ErroDeTenant);
    await expect(prisma.parceiroFlow.findMany({ select: { _count: { select: { erpSubsecoesFicha: true } } } })).rejects.toThrow(ErroDeTenant);
  });

  it.each(['SecaoFicha', 'SubsecaoFicha'])('%s recebe tenant nas consultas e recusa outro dono', modelo => {
    expect(amarrarAoParceiro(modelo, 'findMany', { where: { ativa: true } }, 'p-a').where).toEqual({ ativa: true, parceiroId: 'p-a' });
    expect(() => amarrarAoParceiro(modelo, 'create', { data: { parceiroId: 'p-b', nome: 'Furo' } }, 'p-a')).toThrow(ErroDeTenant);
    expect(() => amarrarAoParceiro(modelo, 'update', { where: { id: 'x' }, data: { parceiroId: 'p-b' } }, 'p-a')).toThrow(ErroDeTenant);
  });

  it('relações da árvore não aceitam nested connect para contornar os IDs escalares', () => {
    for (const [modelo, relacao] of [['FichaTecnica', 'secao'], ['FichaTecnica', 'subsecao'], ['SubsecaoFicha', 'secao']]) {
      expect(() => amarrarAoParceiro(modelo, 'update', { where: { id: 'x' }, data: { [relacao]: { connect: { id: 'de-b' } } } }, 'p-a')).toThrow(ErroDeTenant);
    }
  });

  it('cliente suspenso/somente leitura não escreve seção nem subseção antes do banco', async () => {
    const cliente = doParceiro('p-suspenso', undefined, { somenteLeitura: true });
    await expect(cliente.secaoFicha.create({ data: { parceiroId: 'p-suspenso', nome: 'Nova' } })).rejects.toThrow(/somente leitura/);
    await expect(cliente.subsecaoFicha.updateMany({ data: { ativa: false } })).rejects.toThrow(/somente leitura/);
  });
});
