/** Efeitos do painel real; o QA Chromium comprova Tab, Esc e a volta ao botão de origem. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcaoBuscarClassificacao, AcaoGerirClassificacao } from '@/lib/erp/ficha-secoes-campos';

const ciclo = vi.hoisted(() => ({ painel: null as unknown, efeitos: [] as (() => void | (() => void))[] }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useRef: () => ({ current: ciclo.painel }),
  useState: (inicial: unknown) => [inicial, vi.fn()],
  useEffect: (efeito: () => void | (() => void)) => { ciclo.efeitos.push(efeito); },
}));
vi.mock('@/components/erp/telas/fichas/busca-classificacao', () => ({
  useBuscaClassificacao: () => ({ pagina: { itens: [], selecionados: [], proximoCursor: null }, erro: '', carregando: false, recarregar: vi.fn(), buscaExterna: { aoBuscar: vi.fn(), aoCarregarMais: vi.fn(), temMais: false } }),
}));
import { PainelClassificacao } from '@/components/erp/telas/fichas/painel-classificacao';

afterEach(() => { ciclo.efeitos = []; ciclo.painel = null; vi.unstubAllGlobals(); });

describe('3A: foco da gestão durante mudanças do painel', () => {
  it('recupera o foco quando o controle some, preserva campo ativo e devolve a origem no fechamento', () => {
    const documento: { activeElement: Elemento | null } = { activeElement: null };
    class Elemento {
      filhos = new Set<Elemento>();
      focus = vi.fn(() => { documento.activeElement = this; });
      contains = (el: Elemento) => el === this || this.filhos.has(el);
    }
    const origem = new Elemento(), painel = new Elemento(), campo = new Elemento(), body = new Elemento();
    painel.filhos.add(campo); documento.activeElement = origem; ciclo.painel = painel;
    vi.stubGlobal('document', documento); vi.stubGlobal('HTMLElement', Elemento);
    PainelClassificacao({ buscar: vi.fn<AcaoBuscarClassificacao>(), gerir: vi.fn<AcaoGerirClassificacao>(), aoFechar: vi.fn(), aoAlterar: vi.fn() });
    const desmontar = ciclo.efeitos[0]();
    const recuperar = ciclo.efeitos[1];
    expect(documento.activeElement).toBe(painel);
    campo.focus(); recuperar();
    expect(documento.activeElement).toBe(campo);
    expect(painel.focus).toHaveBeenCalledOnce();
    documento.activeElement = body; recuperar();
    expect(documento.activeElement).toBe(painel);
    expect(painel.focus).toHaveBeenCalledTimes(2);
    if (desmontar) desmontar();
    expect(documento.activeElement).toBe(origem);
    expect(origem.focus).toHaveBeenCalledOnce();
  });
});
