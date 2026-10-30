/** Regressão: links do roteador e vários formulários não podem perder edições sem escolha. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAvisoDeSaida } from '@/components/erp/telas/cadastro/erros';

const ciclo = vi.hoisted(() => ({ limpar: [] as (() => void)[] }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useRef: (current: unknown) => ({ current }),
  useEffect: (fn: () => (() => void)) => { ciclo.limpar.push(fn()); },
}));

class Elemento { closest() { return this; } }
class LinkDoTeste extends Elemento {
  href = 'https://erp.test/erp/insumos';
  target = '';
  download = false;
  hasAttribute(nome: string) { return nome === 'download' && this.download; }
}

describe('Proteção de saída dos formulários por links', () => {
  let cliques: ((e: MouseEvent) => void)[];
  let descarregar: ((e: BeforeUnloadEvent) => void)[];
  const confirmar = vi.fn<(...args: unknown[]) => boolean>();
  beforeEach(() => {
    vi.useFakeTimers();
    cliques = []; descarregar = [];
    confirmar.mockReset().mockReturnValue(false);
    vi.stubGlobal('Element', Elemento);
    vi.stubGlobal('HTMLAnchorElement', LinkDoTeste);
    vi.stubGlobal('window', {
      location: { href: 'https://erp.test/erp/fichas/canais', origin: 'https://erp.test', pathname: '/erp/fichas/canais', search: '' },
      confirm: confirmar,
      setTimeout,
      addEventListener: (_nome: string, fn: (e: BeforeUnloadEvent) => void) => descarregar.push(fn),
      removeEventListener: (_nome: string, fn: (e: BeforeUnloadEvent) => void) => { descarregar = descarregar.filter((f) => f !== fn); },
    });
    vi.stubGlobal('document', {
      addEventListener: (_nome: string, fn: (e: MouseEvent) => void) => cliques.push(fn),
      removeEventListener: (_nome: string, fn: (e: MouseEvent) => void) => { cliques = cliques.filter((f) => f !== fn); },
    });
  });
  afterEach(() => {
    ciclo.limpar.splice(0).forEach((fn) => fn());
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const clicar = (link = new LinkDoTeste(), extras = {}) => {
    const e = { button: 0, target: link, defaultPrevented: false, ...extras,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation: vi.fn() };
    cliques.forEach((fn) => fn(e as unknown as MouseEvent));
    return e;
  };

  it('Voltar de uma edição alterada pede escolha e cancelar mantém a saída bloqueada', () => {
    const form = useAvisoDeSaida();
    expect(clicar().defaultPrevented).toBe(false);
    expect(confirmar).not.toHaveBeenCalled();
    form.aoMudar();
    expect(clicar().defaultPrevented).toBe(true);
    expect(clicar().defaultPrevented).toBe(true);
    expect(confirmar).toHaveBeenCalledTimes(2);
  });

  it('dois formulários sujos perguntam uma vez por clique sem perder proteção se a navegação falhar', () => {
    const taxa = useAvisoDeSaida(), metas = useAvisoDeSaida();
    taxa.aoMudar(); metas.aoMudar();
    confirmar.mockReturnValueOnce(true);
    expect(clicar().defaultPrevented).toBe(false);
    expect(confirmar).toHaveBeenCalledTimes(1);
    vi.runOnlyPendingTimers();
    // Somente o segundo formulário foi enviado; o primeiro continua alterado.
    metas.aoEnviar();
    expect(clicar().defaultPrevented).toBe(true);
    expect(confirmar).toHaveBeenCalledTimes(2);
  });

  it('links de ajuda, nova aba, download e cliques modificados não abandonam o formulário', () => {
    const form = useAvisoDeSaida(); form.aoMudar();
    for (const ajuste of [
      { href: 'https://erp.test/erp/fichas/canais#campo' },
      { target: '_blank' }, { download: true },
    ]) clicar(Object.assign(new LinkDoTeste(), ajuste));
    for (const extra of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) clicar(new LinkDoTeste(), extra);
    expect(confirmar).not.toHaveBeenCalled();
    expect(clicar().defaultPrevented).toBe(true);
  });

  it('aceitar link não repete unload naquele clique; um unload posterior continua protegido', () => {
    const form = useAvisoDeSaida(); form.aoMudar();
    confirmar.mockReturnValueOnce(true);
    clicar();
    const agora = { preventDefault: vi.fn() };
    descarregar.forEach((fn) => fn(agora as unknown as BeforeUnloadEvent));
    expect(agora.preventDefault).not.toHaveBeenCalled();
    vi.runOnlyPendingTimers();
    const depois = { preventDefault: vi.fn() };
    descarregar.forEach((fn) => fn(depois as unknown as BeforeUnloadEvent));
    expect(depois.preventDefault).toHaveBeenCalled();
  });
});
