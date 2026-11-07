/** Hook real com ciclo React controlado; a jornada Chromium cobre o DOM e a action real. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcaoBuscarClassificacao, PaginaDeClassificacao, PedidoBuscaClassificacao, ResultadoBuscaClassificacao } from '@/lib/erp/ficha-secoes-campos';

type Instancia = {
  refs: { current: unknown }[]; ref: number;
  memos: { valor: unknown; deps: readonly unknown[] }[]; memo: number;
  estados: unknown[]; estado: number;
  efeitos: { deps: readonly unknown[]; limpar?: () => void }[]; efeito: number;
  pendentes: (() => void)[];
};
const ciclo = vi.hoisted(() => ({ atual: null as Instancia | null }));
vi.mock('react', async original => {
  const iguais = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((d, n) => Object.is(d, b[n]));
  return {
    ...await original<typeof import('react')>(),
    useRef: (current: unknown) => { const i = ciclo.atual!; return i.refs[i.ref++] ??= { current }; },
    useMemo: (criar: () => unknown, deps: readonly unknown[]) => {
      const i = ciclo.atual!, n = i.memo++, anterior = i.memos[n];
      if (!anterior || !iguais(deps, anterior.deps)) i.memos[n] = { valor: criar(), deps };
      return i.memos[n].valor;
    },
    useState: (inicial: unknown) => {
      const i = ciclo.atual!, n = i.estado++;
      if (!(n in i.estados)) i.estados[n] = typeof inicial === 'function' ? inicial() : inicial;
      return [i.estados[n], (valor: unknown) => { i.estados[n] = typeof valor === 'function' ? valor(i.estados[n]) : valor; }];
    },
    useEffect: (efeito: () => void | (() => void), deps: readonly unknown[]) => {
      const i = ciclo.atual!, n = i.efeito++, anterior = i.efeitos[n];
      if (anterior && iguais(deps, anterior.deps)) return;
      i.pendentes.push(() => { anterior?.limpar?.(); i.efeitos[n] = { deps, limpar: efeito() || undefined }; });
    },
  };
});
import { useBuscaClassificacao } from '@/components/erp/telas/fichas/busca-classificacao';

type Pedido = Omit<PedidoBuscaClassificacao, 'q' | 'cursor'>;
const vazia = (): PaginaDeClassificacao => ({ itens: [], selecionados: [], proximoCursor: null });
const resposta = (nome = 'Seção atualizada'): ResultadoBuscaClassificacao => ({ ok: true, pagina: { ...vazia(), itens: [{ nivel: 'secao', registro: { id: 's1', nome, ativa: true, versao: 'v2' } }] } });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
const instancias: Instancia[] = [];
afterEach(() => { instancias.splice(0).forEach(i => i.efeitos.forEach(e => e.limpar?.())); });
function montar(buscar: AcaoBuscarClassificacao, pedido: Pedido) {
  const i: Instancia = { refs: [], ref: 0, memos: [], memo: 0, estados: [], estado: 0, efeitos: [], efeito: 0, pendentes: [] };
  instancias.push(i);
  let entrada = { buscar, pedido, inicial: vazia() };
  function Renderizar(nova: Partial<typeof entrada> = {}) {
    entrada = { ...entrada, ...nova };
    i.ref = 0; i.memo = 0; i.estado = 0; i.efeito = 0; ciclo.atual = i;
    let resultado: ReturnType<typeof useBuscaClassificacao>;
    try { resultado = useBuscaClassificacao(entrada.buscar, entrada.pedido, entrada.inicial); }
    finally { ciclo.atual = null; }
    i.pendentes.splice(0).forEach(f => f());
    return resultado;
  }
  Renderizar();
  return { renderizar: Renderizar };
}

describe('3A: revalidação da gestão mantém a consulta do hook', () => {
  it('nova referência da action e página inicial reconsulta o texto digitado, sem voltar às primeiras 50', async () => {
    const antes = vi.fn<AcaoBuscarClassificacao>().mockResolvedValue(resposta());
    const h = montar(antes, { contexto: 'gestao', nivel: 'secao' }); await tick();
    h.renderizar().buscaExterna.aoBuscar('Minha seção'); await tick();
    const depois = vi.fn<AcaoBuscarClassificacao>().mockResolvedValue(resposta('Minha seção renomeada'));
    h.renderizar({ buscar: depois, inicial: vazia() }); await tick();
    expect(depois).toHaveBeenCalledOnce();
    expect(depois.mock.calls[0][0]).toMatchObject({ contexto: 'gestao', nivel: 'secao', q: 'Minha seção' });
    expect(h.renderizar().pagina.itens[0].registro.nome).toBe('Minha seção renomeada');
    h.renderizar({ inicial: vazia() }); await tick();
    expect(depois.mock.lastCall?.[0].q).toBe('Minha seção');
  });

  it.each([
    { contexto: 'formulario', nivel: 'subsecao', secaoId: 'paiA' },
    { contexto: 'gestao', nivel: 'secao' },
    { contexto: 'gestao', nivel: 'subsecao', secaoId: 'paiB' },
  ] satisfies Pedido[])('trocar identidade para %j limpa a busca', async pedido => {
    const buscar = vi.fn<AcaoBuscarClassificacao>().mockResolvedValue({ ok: true, pagina: vazia() });
    const h = montar(buscar, { contexto: 'gestao', nivel: 'subsecao', secaoId: 'paiA' }); await tick();
    h.renderizar().buscaExterna.aoBuscar('Filho anterior'); await tick();
    h.renderizar({ pedido }); await tick();
    expect(buscar.mock.lastCall?.[0]).toMatchObject({ ...pedido, q: '' });
  });

  it('resposta da action substituída não reaparece depois da revalidação', async () => {
    let resolver!: (r: ResultadoBuscaClassificacao) => void;
    const pendente = new Promise<ResultadoBuscaClassificacao>(r => { resolver = r; });
    const antes = vi.fn<AcaoBuscarClassificacao>().mockResolvedValueOnce({ ok: true, pagina: vazia() }).mockReturnValueOnce(pendente);
    const h = montar(antes, { contexto: 'gestao', nivel: 'secao' }); await tick();
    h.renderizar().buscaExterna.aoBuscar('Minha seção');
    const depois = vi.fn<AcaoBuscarClassificacao>().mockResolvedValue(resposta('Versão nova'));
    h.renderizar({ buscar: depois }); await tick();
    resolver(resposta('Versão antiga')); await tick();
    expect(depois.mock.lastCall?.[0].q).toBe('Minha seção');
    expect(h.renderizar().pagina.itens[0].registro.nome).toBe('Versão nova');
  });
});
