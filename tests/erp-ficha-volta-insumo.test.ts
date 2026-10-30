import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { comDe, deSeguro } from '@/lib/erp/insumo-campos';
import { deSeguroDaFicha } from '@/lib/erp/ficha-campos';
import { origemInsumoDaFicha, voltaDaFichaAoInsumo } from '@/lib/erp/ficha-volta-insumo';
import { ALCANCE_FLOWFOODS, type Alcance, type Permissao } from '@/lib/erp/permissoes';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import type { FichaDetalhada } from '@/lib/erp/fichas';
import { PainelOndeEUsado } from '@/components/erp/telas/insumos/onde-e-usado';

const atual = vi.hoisted(() => ({ ctx: null as unknown }));
vi.mock('next/navigation', () => ({ usePathname: () => null, useSearchParams: () => null, notFound: () => { throw new Error('NOT_FOUND'); } }));
vi.mock('react-dom', async (orig) => ({ ...(await orig<typeof import('react-dom')>()), useFormState: (_acao: unknown, inicial: unknown) => [inicial, undefined], useFormStatus: () => ({ pending: false }) }));
vi.mock('@/lib/erp/contexto', async () => {
  const { exigirPermissao, pode } = await import('@/lib/erp/permissoes');
  return { exigirParceiroDaSessao: async () => atual.ctx, exigirParceiro: async () => atual.ctx, exigirPermissao, exigirPermissaoNaPagina: exigirPermissao, pode };
});
vi.mock('@/lib/erp/fichas', async (orig) => ({ ...(await orig<typeof import('@/lib/erp/fichas')>()), obterFicha: vi.fn() }));
vi.mock('@/lib/erp/canais', () => ({ custoPorCanal: vi.fn(async () => null) }));
vi.mock('@/app/erp/fichas/actions', () => ({ acaoSalvarPrecos: vi.fn(), acaoSituacaoFicha: vi.fn() }));
vi.mock('@/app/rodolfo/(painel)/erp/[slug]/fichas/actions', () => ({ acaoSalvarPrecos: vi.fn(), acaoSituacaoFicha: vi.fn() }));
import { obterFicha } from '@/lib/erp/fichas';
import { custoPorCanal } from '@/lib/erp/canais';
import ErpFichaPage from '@/app/erp/fichas/[id]/page';
import ParceiroFichaPage from '@/app/rodolfo/(painel)/erp/[slug]/fichas/[id]/page';

const alcance = (...permissoes: Permissao[]): Alcance => ({ nivel: 'REDE', lojas: 'todas', permissoes: new Set(permissoes) });
const podeVoltar = alcance('fichas.ver', 'insumos.ver');
const filtros = new URLSearchParams({ q: 'Açúcar de cana', marca: 'São José', tipo: 'INGREDIENTE', pagina: '3', por: '50' }).toString();
const origem = comDe('/erp/insumos/insumoA', deSeguro(filtros));
const criarCliente = (id: string | null = 'insumoA') => {
  const ler = vi.fn(async () => id ? { id } : null);
  return { ler, cliente: { parceiroId: 'parceiroA', insumo: { findUnique: ler } } as unknown as ClienteDoParceiro };
};

describe('retorno da ficha: origem interna estrita e filtros conhecidos', () => {
  it.each(['/erp', '/rodolfo/erp/casa-a'])('preserva acentos, espaços, filtros e paginação na área %s', (raiz) => {
    const volta = comDe(`${raiz}/insumos/insumoA`, deSeguro(filtros));
    const resultado = origemInsumoDaFicha(volta, raiz)!;
    const url = new URL(resultado.href, 'http://erp.interno');
    expect(resultado.id).toBe('insumoA');
    expect(url.pathname).toBe(`${raiz}/insumos/insumoA`);
    expect(url.searchParams.get('de')).toBe(deSeguro(filtros));
    expect(new URLSearchParams(url.searchParams.get('de')!).get('q')).toBe('Açúcar de cana');
    expect(new URLSearchParams(url.searchParams.get('de')!).get('marca')).toBe('São José');
    expect(url.hash).toBe('#onde-e-usado');
  });

  it.each([
    undefined, null, ['/erp/insumos/insumoA'], 1, '',
    'https://fora.test/erp/insumos/insumoA', '//fora.test/erp/insumos/insumoA',
    '/rodolfo/erp/casa-a/insumos/insumoA', '/erp/insumos', '/erp/insumos/novo',
    '/erp/insumos/insumoA/editar', '/erp/fichas/fichaA', '/erp/insumos/../insumos/insumoA',
    '/erp/insumos/%2e%2e/insumos/insumoA', '/erp/insumos/%69nsumoA',
    '/erp/insumos/insumoA%2feditar', '/erp/insumos/insumoA%5ceditar', '/erp/insumos/insumoA%252feditar',
    '/erp//insumos/insumoA', '/erp/insumos\\insumoA', '/erp/insumos/insumoA\n',
    '/erp/insumos/insumoA?de=q%3Da&de=q%3Db', `/erp/insumos/${'a'.repeat(65)}`,
    `/erp/insumos/insumoA?x=${'a'.repeat(2000)}`,
  ])('recusa origem inválida sem reinterpretar: %j', (valor) => {
    expect(origemInsumoDaFicha(valor, '/erp')).toBeNull();
  });

  it('N1 recusa outro slug e a área do parceiro, mesmo com id válido', () => {
    for (const volta of ['/rodolfo/erp/casa-b/insumos/insumoA', '/erp/insumos/insumoA']) {
      expect(origemInsumoDaFicha(volta, '/rodolfo/erp/casa-a')).toBeNull();
    }
  });

  it('descarta cadeia de retornos, anúncios e hash arbitrário; não cria ciclo', () => {
    const de = new URLSearchParams({ q: 'Arroz', de: 'q=outro', volta: '/erp/fichas/fichaA', feito: 'salva' });
    const volta = comDe('/erp/insumos/insumoA', de.toString(), { volta: '/erp/fichas/fichaA', feito: 'salva' }) + '#outro';
    expect(origemInsumoDaFicha(volta, '/erp')).toEqual({ id: 'insumoA', href: '/erp/insumos/insumoA?de=q%3DArroz#onde-e-usado' });
  });

  it('filtros acima do limite existente não impedem retorno seguro ao insumo', () => {
    expect(origemInsumoDaFicha(comDe('/erp/insumos/insumoA', `q=${'a'.repeat(601)}`), '/erp')?.href).toBe('/erp/insumos/insumoA#onde-e-usado');
  });

  it('link real de Onde é usado suporta dupla codificação e destino focalizável, sem valores', () => {
    const html = renderToStaticMarkup(createElement(PainelOndeEUsado, { fichasBase: '/erp/fichas', volta: origem, onde: {
      total: 1, cortada: false, unidade: 'UN', usos: [{ fichaId: 'fichaA', nome: 'Ficha A', ativa: true, tipo: 'PRATO', naReceitaMilesimos: 1000, embalagemEm: [] }],
    } }));
    const href = /href="([^"]+)"/.exec(html)![1].replaceAll('&amp;', '&');
    const url = new URL(href, 'http://erp.interno');
    expect(url.pathname).toBe('/erp/fichas/fichaA');
    expect(url.searchParams.get('volta')).toBe(origem);
    expect(origemInsumoDaFicha(url.searchParams.get('volta'), '/erp')?.href).toBe(`${origem}#onde-e-usado`);
    expect(html).toContain('id="onde-e-usado" tabindex="-1"');
    expect(html).not.toMatch(/R\$|custo|preço/);
  });
});

describe('retorno da ficha: permissão e existência no parceiro', () => {
  it('consulta somente a identidade pelo cliente do parceiro', async () => {
    const c = criarCliente();
    expect(await voltaDaFichaAoInsumo(origem, '/erp', c.cliente, podeVoltar)).toBe(`${origem}#onde-e-usado`);
    expect(c.ler).toHaveBeenCalledExactlyOnceWith({ where: { id: 'insumoA' }, select: { id: true } });
  });
  it('sem insumos.ver nem consulta a origem', async () => {
    const c = criarCliente();
    expect(await voltaDaFichaAoInsumo(origem, '/erp', c.cliente, alcance('fichas.ver'))).toBeNull();
    expect(c.ler).not.toHaveBeenCalled();
  });
  it('origem malformada nem consulta o banco', async () => {
    const c = criarCliente();
    expect(await voltaDaFichaAoInsumo('/erp/fichas/fichaA', '/erp', c.cliente, podeVoltar)).toBeNull();
    expect(c.ler).not.toHaveBeenCalled();
  });
  it.each([null, 'outraIdentidade'])('origem ausente, removida ou fora do tenant não é aceita: %s', async (id) => {
    const c = criarCliente(id);
    expect(await voltaDaFichaAoInsumo(origem, '/erp', c.cliente, podeVoltar)).toBeNull();
  });
  it('falha na leitura opcional conserva fallback da ficha', async () => {
    const c = criarCliente(); c.ler.mockRejectedValueOnce(new Error('indisponível'));
    expect(await voltaDaFichaAoInsumo(origem, '/erp', c.cliente, podeVoltar)).toBeNull();
  });
});

const valor = { num: 73737n, den: 1n };
const ficha: FichaDetalhada = {
  id: 'fichaA', nome: 'Ficha A', tipo: 'PRATO', descricao: null, modoPreparo: null, passosPreparo: [], rendimentoMilesimos: 1000, unidadeRendimento: 'UN',
  ativa: true, origem: 'MANUAL', versao: '2026-10-30T00:00:00.000Z', foto: null, fotosApoio: [], insumoProduzido: null,
  validades: { principal: 'SECO', minutos: {} }, consumoImediato: true, usadaEm: [], historico: [],
  itens: [{ id: 'itemA', insumoId: 'insumoA', subfichaId: null, nome: 'Insumo A', unidade: 'UN', ativo: true, quantidadeMilesimos: 1000, fatorCorrecaoMilesimos: 1000, custoDoInsumo: { centavos: 73737, milesimos: 1000 }, custo: valor, preparo: null }],
  custo: { total: valor, porRendimento: valor, itens: [valor], semPreco: [], preparosIncompletos: [], faltaPreco: [] },
};

describe('páginas reais de ficha e SSR: retorno e portões preservados', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    atual.ctx = { cliente: criarCliente().cliente, alcance: podeVoltar, parceiro: { slug: 'casa-a', nome: 'Casa A' }, bloqueio: null };
    vi.mocked(obterFicha).mockResolvedValue(ficha);
  });
  const abrir = (searchParams: Parameters<typeof ErpFichaPage>[0]['searchParams']) => ErpFichaPage({ params: { id: 'fichaA' }, searchParams });

  it('operador volta ao insumo com filtros sem receber custo, preço ou consulta de canais', async () => {
    const el = await abrir({ volta: origem });
    expect(el.props.voltar).toBe(`${origem}#onde-e-usado`);
    expect(el.props.rotuloVoltar).toBe('Voltar para o insumo');
    expect(el.props.ficha.custo).toBeNull();
    expect(el.props.ficha.itens[0].custoDoInsumo).toBeNull();
    expect(custoPorCanal).not.toHaveBeenCalled();
    expect(obterFicha).toHaveBeenCalledWith(expect.anything(), 'fichaA', { verPrecos: false });
    const html = renderToStaticMarkup(el);
    expect(html).toContain('Voltar para o insumo');
    expect(html).toContain('de=q%3DA');
    expect(html).not.toMatch(/737|R\$|Voltar para a lista/);
  });
  it.each([undefined, 'https://fora.test/x', '/erp/fichas/fichaA', ['/erp/insumos/insumoA']])('origem %j mantém fallback com filtros de ficha', async (volta) => {
    const de = 'q=Ficha+A&tipo=PRATO&pagina=3&volta=externa';
    const el = await abrir({ volta, de });
    expect(el.props.voltar).toBe(`/erp/fichas?${deSeguroDaFicha(de)}`);
    expect(renderToStaticMarkup(el)).toContain('Voltar para a lista');
  });
  it('perda de insumos.ver omite link e usa lista; de duplicado também não é reinterpretado', async () => {
    atual.ctx = { cliente: criarCliente().cliente, alcance: alcance('fichas.ver'), bloqueio: null };
    const el = await abrir({ volta: origem, de: ['q=um', 'q=outro'] });
    expect(el.props.voltar).toBe('/erp/fichas');
    expect(el.props.linkDoInsumo).toBeUndefined();
    expect(renderToStaticMarkup(el)).not.toContain('href="/erp/insumos/');
  });
  it('id não encontrado no cliente do parceiro conserva lista sem expor a origem', async () => {
    atual.ctx = { cliente: criarCliente(null).cliente, alcance: podeVoltar, bloqueio: null };
    const el = await abrir({ volta: origem });
    expect(el.props.voltar).toBe('/erp/fichas');
    expect(el.props.rotuloVoltar).toBeUndefined();
  });
  it('N1 usa raiz do parceiro autorizado e conserva sua leitura gerencial', async () => {
    atual.ctx = { cliente: criarCliente().cliente, alcance: ALCANCE_FLOWFOODS, parceiro: { slug: 'casa-a', nome: 'Casa A' }, bloqueio: null };
    const volta = origem.replace('/erp/', '/rodolfo/erp/casa-a/');
    const el = await ParceiroFichaPage({ params: { slug: 'casa-a', id: 'fichaA' }, searchParams: { volta } });
    expect(el.props.voltar).toBe(`${volta}#onde-e-usado`);
    expect(el.props.rotuloVoltar).toBe('Voltar para o insumo');
    expect(el.props.ficha.verCustos).toBe(true);
    expect(custoPorCanal).toHaveBeenCalledTimes(1);
    expect(renderToStaticMarkup(el)).toContain('Voltar para o insumo');
    const outro = await ParceiroFichaPage({ params: { slug: 'casa-a', id: 'fichaA' }, searchParams: { volta: volta.replace('casa-a', 'casa-b'), de: 'q=Prato' } });
    expect(outro.props.voltar).toBe('/rodolfo/erp/casa-a/fichas?q=Prato');
  });
});
