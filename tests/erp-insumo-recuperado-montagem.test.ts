/**
 * INS-SALVAR-CONFIRMACAO: o invólucro do Novo insumo. O formulário só nasce de novo (`key`) quando há rascunho para recuperar ou
 * quando a pessoa descarta; abrir sem rascunho, ou editar, não remonta nada (digitar no primeiro instante não se perde). O elemento
 * que o invólucro devolve é conferido direto: a chave de montagem e o que ele entrega ao formulário.
 */
import { isValidElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({ rascunho: undefined as unknown, descartou: false, setDescartou: vi.fn(), descartar: vi.fn() }));
vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()), useState: () => [estado.descartou, estado.setDescartou] }));
vi.mock('@/components/erp/telas/cadastro/rascunho', async (original) => ({
  ...(await original<typeof import('@/components/erp/telas/cadastro/rascunho')>()),
  useRascunhoDaTela: () => ({ chave: 'parceiro:pessoa:/erp/insumos/novo', valores: estado.rascunho, versaoMudou: false, insumoCriado: null, fornecedorCriado: null, descartar: estado.descartar }),
}));
import { chaveDaMontagem, FormInsumo, INSUMO_NOVO, type RascunhoDoInsumo } from '@/components/erp/telas/insumos/form-insumo';

const rascunho: RascunhoDoInsumo = { valores: { ...INSUMO_NOVO, nome: 'KRAFT 01', unidade: 'UN' }, envio: 'chave-antiga', incerto: true, prazoNaoVoltou: false };
const props = { acao: async () => null, modo: 'criar' as const, base: '/erp/insumos', aqui: '/erp/insumos/novo', cancelar: '/erp/insumos', categorias: [], envio: 'chave-nova' };
type Base = { inicial?: unknown; envio?: string; recuperado?: unknown; chaveDoRascunho?: string; focarNoNome?: boolean; aoDescartarRecuperado?: () => void };
const montar = (p: Partial<Parameters<typeof FormInsumo>[0]> = {}) => {
  const el = FormInsumo({ ...props, ...p }) as ReactElement<Base>;
  expect(isValidElement(el)).toBe(true);
  return el;
};

beforeEach(() => { Object.assign(estado, { rascunho: undefined, descartou: false }); estado.setDescartou.mockClear(); estado.descartar.mockClear(); });

describe('chave de montagem: remonta só quando há o que recuperar ou ao descartar', () => {
  it('as três montagens', () => {
    expect(chaveDaMontagem(false, false)).toBe('base');
    expect(chaveDaMontagem(true, false)).toBe('recuperado');
    expect(chaveDaMontagem(true, true)).toBe('descartado');
    expect(chaveDaMontagem(false, true)).toBe('descartado');
  });
  it('antes de ler o armazenamento e sem rascunho: a mesma montagem (nada é remontado ao abrir)', () => {
    for (const valores of [undefined, null]) {
      estado.rascunho = valores;
      const el = montar();
      expect(el.key).toBe('base');
      expect(el.props).toMatchObject({ envio: 'chave-nova', recuperado: null, chaveDoRascunho: 'parceiro:pessoa:/erp/insumos/novo', focarNoNome: false });
      expect(el.props.inicial).toBeUndefined();
    }
  });
});

describe('com rascunho: o formulário nasce de novo com os valores, a chave antiga e o aviso', () => {
  it('cadastro novo', () => {
    estado.rascunho = rascunho;
    const el = montar();
    expect(el.key).toBe('recuperado');
    expect(el.props).toMatchObject({ inicial: rascunho.valores, envio: 'chave-antiga', recuperado: { incerto: true, prazoNaoVoltou: false }, focarNoNome: false });
  });
  it('editar nunca recupera nem guarda: mesma montagem, sem chave de rascunho', () => {
    estado.rascunho = rascunho;
    const el = montar({ modo: 'editar', versao: 'v1', inicial: { ...INSUMO_NOVO, nome: 'Farinha' } });
    expect(el.key).toBe('base');
    expect(el.props).toMatchObject({ recuperado: null, chaveDoRascunho: '', envio: 'chave-nova' });
    expect(el.props.inicial).toMatchObject({ nome: 'Farinha' });
  });
  it('descartar apaga o rascunho, remonta com o formulário de antes e leva o foco ao nome', () => {
    estado.rascunho = rascunho;
    montar().props.aoDescartarRecuperado?.();
    expect(estado.descartar).toHaveBeenCalledOnce();
    expect(estado.setDescartou).toHaveBeenCalledWith(true);
    estado.descartou = true;
    const el = montar();
    expect(el.key).toBe('descartado');
    expect(el.props).toMatchObject({ recuperado: null, envio: 'chave-nova', focarNoNome: true });
    expect(el.props.inicial).toBeUndefined();
  });
});
