/** Regressão: links do roteador e vários formulários não podem perder edições sem escolha. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAvisoDeSaida } from '@/components/erp/telas/cadastro/erros';
import { FRASE_SEM_CONEXAO, useAcaoSegura } from '@/components/erp/telas/cadastro/anuncio';
import { guardarRascunho } from '@/components/erp/telas/cadastro/rascunho';

type Instancia = { refs: { current: unknown }[]; ref: number; efeitos: { deps?: readonly unknown[]; limpar?: () => void }[]; efeito: number };
const ciclo = vi.hoisted(() => ({ limpar: [] as (() => void)[], atual: null as Instancia | null }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useRef: (current: unknown) => {
    const instancia = ciclo.atual;
    return instancia ? (instancia.refs[instancia.ref++] ??= { current }) : { current };
  },
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => (() => void) | void, deps?: readonly unknown[]) => {
    const instancia = ciclo.atual;
    if (instancia) {
      const indice = instancia.efeito++;
      const anterior = instancia.efeitos[indice];
      if (anterior && deps && anterior.deps?.length === deps.length && deps.every((v, n) => Object.is(v, anterior.deps![n]))) return;
      anterior?.limpar?.();
      const limpar = fn() || undefined;
      instancia.efeitos[indice] = { deps, limpar };
      if (limpar) ciclo.limpar.push(limpar);
    } else {
      const limpar = fn();
      if (limpar) ciclo.limpar.push(limpar);
    }
  },
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
      sessionStorage: { setItem: vi.fn(), getItem: vi.fn() },
    });
    vi.stubGlobal('document', {
      addEventListener: (_nome: string, fn: (e: MouseEvent) => void) => cliques.push(fn),
      removeEventListener: (_nome: string, fn: (e: MouseEvent) => void) => { cliques = cliques.filter((f) => f !== fn); },
    });
  });
  const montar = () => {
    const instancia: Instancia = { refs: [], ref: 0, efeitos: [], efeito: 0 };
    const renderizar = (resultado?: { ok: boolean } | null) => {
      instancia.ref = 0; instancia.efeito = 0; ciclo.atual = instancia;
      try { return useAvisoDeSaida(resultado); } finally { ciclo.atual = null; }
    };
    return { renderizar, form: renderizar() };
  };
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

  it('uma resposta de erro da action rearma Voltar e unload depois de enviar', () => {
    const { form, renderizar } = montar();
    form.aoMudar(); form.aoEnviar();
    expect(clicar().defaultPrevented).toBe(false);
    renderizar({ ok: false });
    expect(clicar().defaultPrevented).toBe(true);
    const unload = { preventDefault: vi.fn() };
    descarregar.forEach((fn) => fn(unload as unknown as BeforeUnloadEvent));
    expect(unload.preventDefault).toHaveBeenCalled();
  });

  it('o erro antigo não rearma o envio seguinte; uma nova resposta de erro repetido rearma', () => {
    const { form, renderizar } = montar();
    const erro = { ok: false };
    renderizar(erro);
    expect(clicar().defaultPrevented).toBe(true);
    form.aoEnviar(); renderizar(erro);
    expect(clicar().defaultPrevented).toBe(false);
    renderizar({ ok: false });
    expect(clicar().defaultPrevented).toBe(true);
  });

  it('sucesso sem redirect ou na mesma URL não cria aviso; edição nova durante o envio continua protegida', () => {
    const { form, renderizar } = montar();
    form.aoMudar(); form.aoEnviar(); renderizar({ ok: true });
    expect(clicar().defaultPrevented).toBe(false);
    form.aoMudar(); form.aoEnviar(); form.aoMudar(); renderizar({ ok: true });
    expect(clicar().defaultPrevented).toBe(true);
  });

  it('erro de um formulário não apaga o sucesso nem alterações do outro', () => {
    const taxa = montar(), metas = montar();
    taxa.form.aoMudar(); taxa.form.aoEnviar(); taxa.renderizar({ ok: false });
    metas.form.aoMudar(); metas.form.aoEnviar(); metas.renderizar({ ok: true });
    expect(clicar().defaultPrevented).toBe(true);
    expect(confirmar).toHaveBeenCalledTimes(1);
    taxa.form.aoEnviar();
    expect(clicar().defaultPrevented).toBe(false);
    metas.form.aoMudar(); taxa.renderizar({ ok: true });
    expect(clicar().defaultPrevented).toBe(true);
  });

  it('a falha de conexão traduzida pela action segura rearma sem apagar o rascunho', async () => {
    const { form, renderizar } = montar();
    const rascunho = { nome: 'Massa ainda não salva', itens: [{ escolha: 'insumo', quantidade: '200', unidade: 'g', fator: '' }] };
    guardarRascunho('parceiro:pessoa:/erp/fichas/nova', rascunho);
    const gravado = vi.mocked(window.sessionStorage.setItem).mock.calls[0];
    form.aoMudar(); form.aoEnviar();
    const acao = useAcaoSegura(async () => { throw new Error('conexão interrompida'); });
    const resposta = await acao(null, new FormData());
    expect(resposta).toMatchObject({ ok: false, erros: { geral: FRASE_SEM_CONEXAO } });
    renderizar(resposta);
    expect(clicar().defaultPrevented).toBe(true);
    expect(vi.mocked(window.sessionStorage.setItem).mock.calls).toEqual([gravado]);
    expect(JSON.parse(gravado[1]).valores).toEqual(rascunho);
  });
});
