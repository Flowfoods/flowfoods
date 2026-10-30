import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lerXmlAguardandoDaHome, xmlAguardandoDaHome, type DadosXmlAguardandoHome } from '@/lib/erp/home-xml-aguardando';
import { documentosAguardando } from '@/lib/erp/compras-relatorio';
import { comprasAnaliticas, filtrosDeComprasHome, lerComprasDaHome, type DadosComprasHome } from '@/lib/erp/home-compras';
import { painelDoDia } from '@/lib/erp/painel-do-dia';
import { lerFiltrosDeDocumento } from '@/lib/erp/documento-fiscal-campos';
import { ErroDeRelatorio } from '@/lib/erp/vagas-de-relatorio';
import type { ContextoHomeLoja } from '@/lib/erp/home-analitico';
import type { Alcance } from '@/lib/erp/permissoes';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';

vi.mock('@/lib/erp/compras-relatorio', () => ({ documentosAguardando: vi.fn(), resolverRecorte: vi.fn(), totaisDoRecorte: vi.fn(), distribuicaoDoRecorte: vi.fn() }));
vi.mock('@/lib/erp/home-compras', async original => ({ ...await original<typeof import('@/lib/erp/home-compras')>(), lerComprasDaHome: vi.fn() }));
vi.mock('@/lib/erp/faturamento', () => ({ obterMes: vi.fn() }));
vi.mock('@/lib/erp/estoque', () => ({ situacaoDoEstoque: vi.fn() }));
vi.mock('@/lib/erp/saude-do-cardapio', () => ({ saudeDoCardapio: vi.fn() }));
vi.mock('@/lib/erp/producao-lista', () => ({ lojasDaListaDoDia: vi.fn() }));
vi.mock('@/lib/erp/dre', () => ({ dreDoPeriodo: vi.fn() }));
vi.mock('@/lib/db', () => { throw new Error('Matriz isolada não lê banco.'); });

const HOJE = '2026-10-29';
const alcance: Alcance = { nivel: 'LOJA', lojas: ['lojab'], permissoes: new Set(['compras.ver']) };
const c: ContextoHomeLoja = { alcance, loja: { id: 'lojab', nome: 'Loja B' }, raiz: '/erp', hoje: HOJE, consultadoEm: '2026-10-29T15:00:00.000Z' };
const loja = { id: 'lojab', nome: 'Loja B', ativa: true };
const lido = (aguardando = 2): DadosXmlAguardandoHome => ({ tipo: 'lido', loja: { ...loja }, aguardando });
const selectLoja = vi.fn();
const transacao = vi.fn();
let cliente: ClienteDoParceiro;
let tx: ClienteDoParceiro;
const ler = () => lerXmlAguardandoDaHome(cliente, alcance, 'lojab');
const projetar = (dados: DadosXmlAguardandoHome | null = lido(), contexto = c) => xmlAguardandoDaHome({ estado: 'lido', dados }, contexto);
const dadosCompras = (): DadosComprasHome => ({ tipo: 'totais', filtros: filtrosDeComprasHome('lojab', HOJE),
  totais: { linhas: 1, notas: 1, valorCentavos: 2700, freteCentavos: 300, totalCentavos: 3000, unidades: [], semBase: {}, notasComDesconto: 0 },
  composicaoPorCategoria: { estado: 'lido', distribuicao: { fatias: [{ chave: '-', rotulo: 'Sem categoria', centavos: 3000 }], outros: null, totalCentavos: 3000, quantos: 1 } },
});
beforeEach(() => {
  vi.resetAllMocks();
  tx = { parceiroId: 'parceirob', loja: { findFirst: selectLoja } } as unknown as ClienteDoParceiro;
  cliente = { parceiroId: 'parceirob', transacao } as unknown as ClienteDoParceiro;
  transacao.mockImplementation((fn: (t: ClienteDoParceiro) => unknown) => fn(tx));
  selectLoja.mockResolvedValue({ ...loja });
  vi.mocked(documentosAguardando).mockResolvedValue(2);
  vi.mocked(lerComprasDaHome).mockResolvedValue(dadosCompras());
});

describe('Home XML · leitura própria autorizada', () => {
  it('autoriza antes e faz apenas lookup mínimo + contador da mesma tx/loja, sem recorte financeiro', async () => {
    expect(await ler()).toEqual(lido());
    expect(transacao).toHaveBeenCalledTimes(1); expect(transacao).toHaveBeenCalledWith(expect.any(Function), { repetivel: true, relatorio: {} });
    expect(selectLoja).toHaveBeenCalledExactlyOnceWith({ where: { id: 'lojab' }, select: { id: true, nome: true, ativa: true } });
    expect(documentosAguardando).toHaveBeenCalledExactlyOnceWith(tx, ['lojab']);
    expect(selectLoja.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(documentosAguardando).mock.invocationCallOrder[0]);
    expect(JSON.stringify(await ler())).not.toMatch(/parceirob|fornecedor|emitida|xmlSha|CNPJ|chaveAcesso/);
  });
  it('sem compras.ver, fora do alcance e id inválido não abrem transação', async () => {
    expect(await lerXmlAguardandoDaHome(cliente, { ...alcance, permissoes: new Set() }, 'lojab')).toBeNull();
    expect(await lerXmlAguardandoDaHome(cliente, { ...alcance, lojas: ['lojaa'] }, 'lojab')).toBeNull();
    expect(await lerXmlAguardandoDaHome(cliente, alcance, '../lojab')).toBeNull();
    expect(transacao).not.toHaveBeenCalled(); expect(selectLoja).not.toHaveBeenCalled(); expect(documentosAguardando).not.toHaveBeenCalled();
  });
  it('loja inexistente ou resposta de outra loja não é zero nem chega ao contador', async () => {
    selectLoja.mockResolvedValueOnce(null); expect(await ler()).toBeNull();
    selectLoja.mockResolvedValueOnce({ ...loja, id: 'lojaa', nome: 'Privada 999999' }); expect(await ler()).toEqual({ tipo: 'incompativel' });
    expect(documentosAguardando).not.toHaveBeenCalled();
  });
  it('cliente transacional de outro parceiro é recusado antes da busca da loja', async () => {
    transacao.mockImplementationOnce((fn: (t: ClienteDoParceiro) => unknown) => fn({ ...tx, parceiroId: 'outroparceiro' }));
    expect(await ler()).toEqual({ tipo: 'incompativel' });
    expect(selectLoja).not.toHaveBeenCalled(); expect(documentosAguardando).not.toHaveBeenCalled();
  });
  it('desativada autorizada conserva os documentos existentes e copia só os campos mínimos', async () => {
    selectLoja.mockResolvedValueOnce({ ...loja, ativa: false, cnpj: '999999', documentoFiscal: ['privado'] });
    const d = await ler(); const p = projetar(d)!;
    expect(p).toMatchObject({ estado: 'ok', aguardando: 2, loja: { id: 'lojab', ativa: false } });
    expect(p.aviso).toMatch(/desativada.*documentos existentes/); expect(JSON.stringify(p)).not.toMatch(/999999|documentoFiscal|cnpj/);
  });
  it('aborto SQL atravessa a transação; nenhuma contagem é recuperada nem repetida', async () => {
    const ordem: string[] = [];
    vi.mocked(documentosAguardando).mockImplementationOnce(async () => { ordem.push('sql'); throw new Error('SQL PRIVADO'); });
    transacao.mockImplementationOnce(async (fn: (t: ClienteDoParceiro) => Promise<unknown>) => { try { return await fn(tx); } catch (e) { ordem.push('rollback'); throw e; } });
    await expect(ler()).rejects.toThrow('SQL PRIVADO');
    expect(ordem).toEqual(['sql', 'rollback']); expect(transacao).toHaveBeenCalledTimes(1); expect(documentosAguardando).toHaveBeenCalledTimes(1);
  });
  it.each(['tempo', 'ocupado'] as const)('limite %s é controlado sem alterar vagas/tetos', async motivo => {
    vi.mocked(documentosAguardando).mockRejectedValueOnce(new ErroDeRelatorio(motivo));
    expect(await ler()).toEqual({ tipo: 'limite', motivo });
    expect(projetar({ tipo: 'limite', motivo })).toMatchObject({ estado: 'indisponivel', aguardando: null });
    expect(transacao).toHaveBeenCalledWith(expect.any(Function), { repetivel: true, relatorio: {} });
  });
  it('erro ao encerrar não retorna uma contagem que não foi confirmada', async () => {
    transacao.mockImplementationOnce(async (fn: (t: ClienteDoParceiro) => Promise<unknown>) => { await fn(tx); throw new Error('encerramento'); });
    await expect(ler()).rejects.toThrow('encerramento'); expect(documentosAguardando).toHaveBeenCalledTimes(1);
  });
});

describe('Home XML · DTO estreito e estados', () => {
  it('zero é ok0 e mantém adaptação explícita do destino; não significa fila inteira vazia', () => {
    const p = projetar(lido(0))!;
    expect(p).toMatchObject({ estado: 'ok', aguardando: 0, referencia: 'fila_atual', consultadoEm: c.consultadoEm });
    expect(p.aviso).toMatch(/sem recorte mensal.*atribuídos.*também pode incluir notas recebidas ou com erro/);
    expect(p.detalhe).toEqual({ href: '/erp/compras/recebidas?loja=lojab', rotulo: 'Ver fila de notas recebidas' });
    expect(lerFiltrosDeDocumento(Object.fromEntries(new URL(p.detalhe.href, 'https://local.test').searchParams))).toMatchObject({ lojaId: 'lojab', situacao: 'fila', fornecedorId: '', pagina: 1 });
    expect(p.detalhe.href).not.toMatch(/mes=|periodo=|situacao=aguardando|CNPJ/);
  });
  it('cópia allowlist descarta dados fiscais/campos extras, sem ler getter privado', () => {
    const d = lido(); Object.assign(d, { chaveAcesso: '999999', xml: '<privado/>', lojas: { outra: 777777 } });
    Object.defineProperty(d, 'CNPJ', { get() { throw new Error('Não ler.'); } });
    const p = projetar(d)!;
    expect(Object.keys(p).sort()).toEqual(['estado', 'aguardando', 'loja', 'referencia', 'consultadoEm', 'aviso', 'detalhe'].sort());
    expect(JSON.stringify(p)).not.toMatch(/999999|privado|777777|CNPJ|chaveAcesso/);
  });
  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('contador inválido %s fica null, nunca clamp/zero', valor => {
    expect(projetar(lido(valor))).toMatchObject({ estado: 'indisponivel', aguardando: null, loja: { ativa: null } });
  });
  it('erro/getter indisponibilizam apenas a contagem, sem razão técnica serializada', () => {
    const d = Object.defineProperty(lido(), 'aguardando', { get() { throw new Error('Prisma SQL 999999'); } });
    const p = projetar(d)!; expect(p).toMatchObject({ estado: 'erro', aguardando: null }); expect(JSON.stringify(p)).not.toMatch(/Prisma|SQL|999999/);
    expect(xmlAguardandoDaHome({ estado: 'erro' }, c)).toMatchObject({ estado: 'erro', aguardando: null });
    expect(xmlAguardandoDaHome({ estado: 'indisponivel' }, c)).toMatchObject({ estado: 'indisponivel', aguardando: null });
    expect(projetar(null)).toBeNull();
  });
  it('sem autorização não olha o payload; outra loja e raiz externa não expõem dados', () => {
    const r = Object.defineProperty({ estado: 'lido' }, 'dados', { get() { throw new Error('Não ler.'); } }) as { estado: 'lido'; dados: DadosXmlAguardandoHome };
    expect(xmlAguardandoDaHome(r, { ...c, alcance: { ...alcance, permissoes: new Set() } })).toBeNull();
    expect(projetar(lido(), { ...c, raiz: 'https://fora.test' })).toBeNull();
    const d = lido(); if (d.tipo === 'lido') d.loja = { ...loja, id: 'lojaa', nome: '999999' };
    expect(projetar(d)).toMatchObject({ estado: 'indisponivel', aguardando: null }); expect(JSON.stringify(projetar(d))).not.toContain('999999');
    expect(projetar(lido(), { ...c, raiz: '/rodolfo/erp/casa-b' })?.detalhe.href).toBe('/rodolfo/erp/casa-b/compras/recebidas?loja=lojab');
  });
});

describe('Home XML · fonte independente no allSettled', () => {
  const visao = { tipo: 'loja', lojaId: 'lojab', nome: 'Loja B' } as const;
  it('falha XML preserva KPI e composição de Compras, sem inventar pendência/contagem', async () => {
    vi.mocked(documentosAguardando).mockRejectedValueOnce(new Error('Prisma SQL 999999'));
    const p = await painelDoDia(cliente, alcance, '/erp', HOJE, visao);
    const esperado = comprasAnaliticas({ estado: 'lido', dados: dadosCompras() }, { ...c, consultadoEm: p.consultadoEm! });
    if (p.analitico?.tipo !== 'loja') throw new Error('Loja esperada.');
    expect(p.analitico.widgets.find(w => w.familia === 'compras')).toEqual(esperado);
    expect(p.xmlAguardando).toMatchObject({ estado: 'erro', aguardando: null });
    expect(p.xmlAguardando?.consultadoEm).toBe(p.consultadoEm);
    expect(p.pendencias.some(x => x.chave.startsWith('xml'))).toBe(false);
    expect(lerComprasDaHome).toHaveBeenCalledTimes(1); expect(documentosAguardando).toHaveBeenCalledTimes(1); expect(transacao).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(p)).not.toMatch(/Prisma|SQL|999999/);
  });
  it('falha Compras não elimina o contador válido; contexto e timestamp são os mesmos', async () => {
    vi.mocked(lerComprasDaHome).mockRejectedValueOnce(new Error('compras privada'));
    const p = await painelDoDia(cliente, alcance, '/erp', HOJE, visao);
    expect(p.xmlAguardando).toMatchObject({ estado: 'ok', aguardando: 2, consultadoEm: p.consultadoEm });
    expect(p.pendencias.some(x => x.chave.startsWith('xml'))).toBe(false);
    if (p.analitico?.tipo !== 'loja') throw new Error('Loja esperada.');
    expect(p.analitico.widgets.find(w => w.familia === 'compras')).toMatchObject({ estado: 'erro', valor: { valor: null } });
  });
  it.each([{ tipo: 'rede' }, { tipo: 'nenhuma' }, { tipo: 'loja', lojaId: 'lojaa', nome: 'Outra' }] as const)('visão %j não consulta nem emite o contador', async visaoAtual => {
    const al: Alcance = visaoAtual.tipo === 'rede' ? { ...alcance, lojas: 'todas' } : alcance;
    const p = await painelDoDia(cliente, al, '/erp', HOJE, visaoAtual);
    expect(p.xmlAguardando).toBeUndefined(); expect(transacao).not.toHaveBeenCalled(); expect(documentosAguardando).not.toHaveBeenCalled();
  });
  it('apenas compras.ver permite ler sem conceder escrita, e operador sem o direito omite a fonte', async () => {
    const p = await painelDoDia(cliente, alcance, '/rodolfo/erp/casa-b', HOJE, visao);
    expect(p.xmlAguardando?.detalhe.href).toBe('/rodolfo/erp/casa-b/compras/recebidas?loja=lojab');
    const sem = await painelDoDia(cliente, { ...alcance, permissoes: new Set() }, '/erp', HOJE, visao);
    expect(sem.xmlAguardando).toBeUndefined(); expect(transacao).toHaveBeenCalledTimes(1); expect(documentosAguardando).toHaveBeenCalledTimes(1);
  });
});
