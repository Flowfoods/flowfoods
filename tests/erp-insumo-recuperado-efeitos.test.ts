/**
 * INS-SALVAR-CONFIRMACAO: os efeitos do Novo insumo recuperado, sem DOM de teste. A função do formulário (a que o invólucro
 * entrega) é chamada direto, com os ganchos do React rodando o efeito na hora: o formulário recuperado conta como alteração
 * (sair ou recarregar de novo pergunta) e, depois de descartar, o foco volta para o nome. O caminho no navegador tem QA à parte.
 */
import { Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const g = vi.hoisted(() => ({ rascunho: null as unknown, aoMudar: vi.fn(), aoEnviar: vi.fn() }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (inicial: unknown) => [typeof inicial === 'function' ? (inicial as () => unknown)() : inicial, () => {}],
  useRef: (current: unknown) => ({ current }),
  useEffect: (efeito: () => void) => { efeito(); },
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => fn(),
  useActionState: () => [null, () => {}],
}));
vi.mock('@/components/erp/telas/cadastro/erros', async (original) => ({
  ...(await original<typeof import('@/components/erp/telas/cadastro/erros')>()),
  useAvisoDeSaida: () => ({ aoMudar: g.aoMudar, aoEnviar: g.aoEnviar }),
}));
vi.mock('@/components/erp/ui/ponto-de-ajuda', async (original) => ({
  ...(await original<typeof import('@/components/erp/ui/ponto-de-ajuda')>()),
  useTemPonto: () => false,
}));
vi.mock('@/components/erp/telas/cadastro/rascunho', async (original) => ({
  ...(await original<typeof import('@/components/erp/telas/cadastro/rascunho')>()),
  useRascunhoDaTela: () => ({ chave: 'parceiro:pessoa:/erp/insumos/novo', valores: g.rascunho, versaoMudou: false, insumoCriado: null, fornecedorCriado: null, descartar: () => {} }),
}));
import { FormInsumo, INSUMO_NOVO, type RascunhoDoInsumo } from '@/components/erp/telas/insumos/form-insumo';

const rascunho: RascunhoDoInsumo = { valores: { ...INSUMO_NOVO, nome: 'KRAFT 01', unidade: 'UN' }, envio: 'chave-antiga', incerto: true, prazoNaoVoltou: false };
const props = { acao: async () => null, modo: 'criar' as const, base: '/erp/insumos', aqui: '/erp/insumos/novo', cancelar: '/erp/insumos', categorias: [], envio: 'chave-nova' };

/** O formulário que o invólucro entrega (com as props que ele calculou), desenhado uma vez: os efeitos rodam na hora. */
function desenhar(troca: Record<string, unknown> = {}) {
  const involucro = FormInsumo(props) as ReactElement<{ children: [ReactElement<Record<string, unknown>>, unknown] }>;
  expect(isValidElement(involucro) && involucro.type === Fragment).toBe(true);
  const [base] = involucro.props.children;
  const Base = base.type as (p: Record<string, unknown>) => ReactNode;
  return Base({ ...base.props, ...troca });
}

const focoNoNome = vi.fn();
beforeEach(() => {
  g.rascunho = null;
  g.aoMudar.mockClear();
  focoNoNome.mockClear();
  vi.stubGlobal('document', { getElementById: (id: string) => (id === 'insumo-nome' ? { focus: focoNoNome } : null), querySelector: () => null });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('o formulário recuperado é trabalho não salvo', () => {
  it('com rascunho: conta como alteração ao montar (sair ou recarregar de novo pergunta antes)', () => {
    g.rascunho = rascunho;
    desenhar();
    expect(g.aoMudar).toHaveBeenCalledOnce();
  });
  it('sem rascunho: nada é marcado (a pergunta só vem quando a pessoa mexer)', () => {
    desenhar();
    expect(g.aoMudar).not.toHaveBeenCalled();
  });
});

describe('depois de descartar, o foco volta para o nome (não fica perdido na página)', () => {
  it('descartou: o foco vai para o campo do nome', () => {
    desenhar({ focarNoNome: true });
    expect(focoNoNome).toHaveBeenCalledOnce();
  });
  it('abrir a tela, com ou sem rascunho: o foco fica onde está', () => {
    desenhar();
    g.rascunho = rascunho;
    desenhar();
    expect(focoNoNome).not.toHaveBeenCalled();
  });
});
