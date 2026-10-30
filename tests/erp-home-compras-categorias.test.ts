import { beforeEach, describe, expect, it, vi } from 'vitest';
import { projetarCategoriasDasCompras, type LeituraDaComposicaoCompras } from '@/lib/erp/home-compras-categorias';
import { comprasAnaliticas, filtrosDeComprasHome, lerComprasDaHome, type DadosComprasHome } from '@/lib/erp/home-compras';
import { distribuicaoDoRecorte, resolverRecorte, totaisDoRecorte, type DistribuicaoDoRecorte, type Recorte, type TotaisDoRecorte } from '@/lib/erp/compras-relatorio';
import type { ContextoHomeLoja } from '@/lib/erp/home-analitico';
import type { Alcance } from '@/lib/erp/permissoes';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import { ErroDeRelatorio } from '@/lib/erp/vagas-de-relatorio';

vi.mock('@/lib/erp/compras-relatorio', () => ({ resolverRecorte: vi.fn(), totaisDoRecorte: vi.fn(), distribuicaoDoRecorte: vi.fn() }));
vi.mock('@/lib/db', () => { throw new Error('Esta matriz não abre banco.'); });

const HOJE = '2026-10-30';
const alcance: Alcance = { nivel: 'LOJA', lojas: ['lojab'], permissoes: new Set(['compras.ver']) };
const c: ContextoHomeLoja = { alcance, loja: { id: 'lojab', nome: 'Loja B' }, raiz: '/erp', hoje: HOJE, consultadoEm: '2026-10-30T12:00:00.000Z' };
const detalhe = { href: '/erp/compras/relatorios/periodo?loja=lojab', rotulo: 'Ver a composição no relatório de compras' };
const recorte: Recorte = { parceiroId: 'parceirob', lojas: ['lojab'], status: 'LANCADA', base: 'entrada', de: '2026-10-01', ate: HOJE, fim: '2026-10-31', fornecedorId: null, insumoIds: null, categoriaId: null, agrupar: 'insumo', grupo: null, unidade: null, soSemBase: false };
const totais: TotaisDoRecorte = { linhas: 8, notas: 1, valorCentavos: 2700, freteCentavos: 300, totalCentavos: 3000, unidades: [], semBase: {}, notasComDesconto: 0 };
const simples = (valor = 3000): DistribuicaoDoRecorte => ({ fatias: [{ chave: '-', rotulo: 'Sem categoria', centavos: valor }], outros: null, totalCentavos: valor, quantos: 1 });
const comOutros = (): DistribuicaoDoRecorte => ({ fatias: Array.from({ length: 6 }, (_, i) => ({ chave: i ? 'categoria' + i : '-', rotulo: i ? 'Categoria ' + i : 'Sem categoria', centavos: 400 })), outros: { quantos: 2, centavos: 600 }, totalCentavos: 3000, quantos: 8 });
const lida = (distribuicao = simples()): LeituraDaComposicaoCompras => ({ estado: 'lido', distribuicao });
const projetar = (distribuicao = simples(), totalCentavos = distribuicao.totalCentavos, notas = 1) => projetarCategoriasDasCompras(lida(distribuicao), { totalCentavos, notas }, detalhe);
let cliente: ClienteDoParceiro;
const transacao = vi.fn();
const ler = () => lerComprasDaHome(cliente, alcance, 'lojab', HOJE);
const widget = (d: DadosComprasHome | null) => comprasAnaliticas({ estado: 'lido', dados: d }, c)!;

beforeEach(() => {
  vi.resetAllMocks();
  cliente = { parceiroId: 'parceirob', transacao } as unknown as ClienteDoParceiro;
  transacao.mockImplementation((fn: (tx: ClienteDoParceiro) => unknown) => fn(cliente));
  vi.mocked(resolverRecorte).mockResolvedValue({ recorte, motivo: null, lojasDoAcesso: [] });
  vi.mocked(totaisDoRecorte).mockResolvedValue({ ...totais });
  vi.mocked(distribuicaoDoRecorte).mockResolvedValue(simples());
});

describe('Compras por categoria atual · projeção pura', () => {
  it('copia top6 e Outros sem recalcular frete, percentual ou revelar grupos escondidos', () => {
    const d = comOutros();
    Object.assign(d, { linhas: ['nota-privada'], categoriasPrivadas: { outraLoja: 999999 } });
    Object.assign(d.fatias[0], { custo: 999999, parceiroId: 'outroparceiro' });
    const p = projetar(d);
    expect(p).toMatchObject({ estado: 'ok', classificacao: 'categoria_atual_do_insumo', totalCentavos: 3000, quantos: 8, outros: { quantos: 2, centavos: 600 } });
    expect(p.fatias).toEqual(comOutros().fatias);
    expect(p.aviso).toMatch(/atuais.*não é uma fotografia histórica/);
    expect(JSON.stringify(p)).not.toMatch(/999999|privad|outraLoja|outroparceiro|percentual|porcentagem/);
    expect(p.fatias).not.toBe(d.fatias); expect(p.fatias[0]).not.toBe(d.fatias[0]); expect(p.outros).not.toBe(d.outros);
    expect(p.detalhe).toEqual(detalhe); expect(p.detalhe).not.toBe(detalhe);
  });

  it('sete categorias conservam os sete nomes e não inventam Outros de uma categoria', () => {
    const fatias = Array.from({ length: 7 }, (_, i) => ({ chave: 'c' + i, rotulo: 'Categoria ' + i, centavos: 100 }));
    expect(projetar({ fatias, outros: null, totalCentavos: 700, quantos: 7 })).toMatchObject({ estado: 'ok', fatias, outros: null, totalCentavos: 700 });
  });

  it('Sem categoria segue a fonte: como fatia ou absorvida em Outros, sem linha zero inventada', () => {
    expect(projetar(comOutros()).fatias[0]).toMatchObject({ chave: '-', rotulo: 'Sem categoria' });
    const d = comOutros(); d.fatias[0] = { chave: 'c0', rotulo: 'Categoria 0', centavos: 400 };
    const p = projetar(d);
    expect(p.estado).toBe('ok'); expect(p.fatias).toHaveLength(6); expect(p.fatias.find(f => f.chave === '-')).toBeUndefined(); expect(p.outros).toEqual(d.outros);
  });

  it('ausência é null; compra confirmada bonificada de zero é zero real', () => {
    const ausente = projetarCategoriasDasCompras({ estado: 'sem_dados' }, { notas: 0, totalCentavos: 0 }, detalhe);
    expect(ausente).toMatchObject({ estado: 'sem_dados', totalCentavos: null, quantos: null, fatias: [], outros: null });
    expect(projetar(simples(0))).toMatchObject({ estado: 'ok', totalCentavos: 0, fatias: [{ centavos: 0 }] });
  });

  it.each([
    { valores: [-300], total: -300 }, { valores: [300, -300], total: 0 }, { valores: [200, -300], total: -100 },
  ])('valores assinados permanecem exatos: %j, sem clamp ou percentual', ({ valores, total }) => {
    const fatias = valores.map((centavos, i) => ({ chave: 'c' + i, rotulo: 'Categoria ' + i, centavos }));
    const p = projetar({ fatias, outros: null, totalCentavos: total, quantos: fatias.length });
    expect(p).toMatchObject({ estado: 'ok', totalCentavos: total, fatias });
    expect(JSON.stringify(p)).not.toMatch(/percent|proporcao/);
  });

  it.each([
    ['total diferente do KPI', () => simples(3100)],
    ['soma diferente do total', () => ({ ...simples(), fatias: [{ chave: 'c', rotulo: 'C', centavos: 2999 }] })],
    ['total não inteiro', () => ({ ...simples(), totalCentavos: 3000.5 })],
    ['valor inseguro', () => ({ ...simples(), fatias: [{ chave: 'c', rotulo: 'C', centavos: Number.MAX_SAFE_INTEGER + 1 }] })],
    ['quantidade incoerente', () => ({ ...simples(), quantos: 2 })],
    ['chave repetida', () => ({ fatias: [{ chave: 'c', rotulo: 'C', centavos: 1000 }, { chave: 'c', rotulo: 'D', centavos: 2000 }], outros: null, totalCentavos: 3000, quantos: 2 })],
    ['chave indevida', () => ({ ...simples(), fatias: [{ chave: '../loja', rotulo: 'C', centavos: 3000 }] })],
    ['nome ausente', () => ({ ...simples(), fatias: [{ chave: 'c', rotulo: '', centavos: 3000 }] })],
    ['Outros de um só', () => ({ ...comOutros(), outros: { quantos: 1, centavos: 600 }, quantos: 7 })],
    ['Outros sem top6', () => ({ ...simples(2400), outros: { quantos: 2, centavos: 600 }, totalCentavos: 3000, quantos: 3 })],
    ['oito fatias sem corte', () => ({ fatias: Array.from({ length: 8 }, (_, i) => ({ chave: 'c' + i, rotulo: 'C', centavos: 375 })), outros: null, totalCentavos: 3000, quantos: 8 })],
    ['getter lança', () => Object.defineProperty(simples(), 'outros', { get() { throw new Error('SQL privado 999999'); } })],
  ] as const)('%s afeta somente a composição, sem dados residuais', (_, fabricar) => {
    const p = projetar(fabricar(), 3000);
    expect(p).toMatchObject({ estado: 'indisponivel', fatias: [], outros: null, totalCentavos: null, quantos: null });
    expect(JSON.stringify(p)).not.toMatch(/SQL|privado|999999/);
  });

  it.each([{ estado: 'erro' }, { estado: 'limite', motivo: 'tempo' }, { estado: 'limite', motivo: 'ocupado' }] as const)('falha %j não carrega valores nem motivo técnico', leitura => {
    const p = projetarCategoriasDasCompras(leitura, { totalCentavos: 3000, notas: 1 }, detalhe);
    expect(p.totalCentavos).toBeNull(); expect(p.fatias).toEqual([]); expect(p.outros).toBeNull();
  });
});

describe('Compras por categoria atual · orquestração autorizada', () => {
  it('usa a mesma transação/objeto recorte, exatamente uma leitura base e uma composição', async () => {
    const d = await ler();
    expect(transacao).toHaveBeenCalledTimes(1);
    expect(transacao).toHaveBeenCalledWith(expect.any(Function), { repetivel: true, relatorio: {} });
    expect(totaisDoRecorte).toHaveBeenCalledTimes(1); expect(distribuicaoDoRecorte).toHaveBeenCalledTimes(1);
    expect(vi.mocked(totaisDoRecorte).mock.calls[0][0]).toBe(cliente); expect(vi.mocked(totaisDoRecorte).mock.calls[0][1]).toBe(recorte);
    expect(vi.mocked(distribuicaoDoRecorte).mock.calls[0]).toEqual([cliente, recorte, 'categoria', 6]);
    expect(vi.mocked(distribuicaoDoRecorte).mock.calls[0][1]).toBe(recorte);
    expect(vi.mocked(totaisDoRecorte).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(distribuicaoDoRecorte).mock.invocationCallOrder[0]);
    const w = widget(d); expect(w.valor.valor).toBe(3000); expect(w.composicaoPorCategoria?.totalCentavos).toBe(3000);
    expect(w.composicaoPorCategoria?.detalhe.href).toBe(w.detalhe.href);
    expect(w.detalhe.href).not.toMatch(/agrupar=categoria/);
  });

  it('recusa permissão/loja/data antes de qualquer fonte, e recorte forjado antes de totais/composição', async () => {
    expect(await lerComprasDaHome(cliente, { ...alcance, permissoes: new Set() }, 'lojab', HOJE)).toBeNull();
    expect(await lerComprasDaHome(cliente, { ...alcance, lojas: ['lojaa'] }, 'lojab', HOJE)).toBeNull();
    expect(await lerComprasDaHome(cliente, alcance, 'lojab', '2026-02-30')).toBeNull();
    expect(transacao).not.toHaveBeenCalled();
    vi.mocked(resolverRecorte).mockResolvedValueOnce({ recorte: { ...recorte, status: 'CANCELADA' }, motivo: null, lojasDoAcesso: [] });
    expect(await ler()).toEqual({ tipo: 'incompativel' });
    expect(totaisDoRecorte).not.toHaveBeenCalled(); expect(distribuicaoDoRecorte).not.toHaveBeenCalled();
  });

  it('sem notas não consulta categorias; o DTO mantém ausência em vez de R$0', async () => {
    vi.mocked(totaisDoRecorte).mockResolvedValueOnce({ ...totais, notas: 0, linhas: 0, totalCentavos: 0, valorCentavos: 0, freteCentavos: 0 });
    const w = widget(await ler()); expect(distribuicaoDoRecorte).not.toHaveBeenCalled();
    expect(w).toMatchObject({ estado: 'sem_dados', valor: { valor: null }, composicaoPorCategoria: { estado: 'sem_dados', totalCentavos: null } });
  });

  it('falha SQL na composição sai da transação e preserva só a base lida, sem retry nem erro bruto', async () => {
    const ordem: string[] = [];
    vi.mocked(distribuicaoDoRecorte).mockImplementationOnce(async () => { ordem.push('composicao'); throw new Error('Prisma SELECT segredo 999999'); });
    transacao.mockImplementationOnce(async (fn: (tx: ClienteDoParceiro) => Promise<unknown>) => {
      try { return await fn(cliente); } catch (e) { ordem.push('rollback'); throw e; }
    });
    const d = await ler(); ordem.push('retorno'); const w = widget(d);
    expect(ordem).toEqual(['composicao', 'rollback', 'retorno']);
    expect(w).toMatchObject({ estado: 'ok', valor: { valor: 3000 }, freteCentavos: 300, composicaoPorCategoria: { estado: 'erro', totalCentavos: null, fatias: [] } });
    expect(transacao).toHaveBeenCalledTimes(1); expect(totaisDoRecorte).toHaveBeenCalledTimes(1); expect(distribuicaoDoRecorte).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(d)).not.toMatch(/Prisma|SELECT|segredo|999999/); expect(JSON.stringify(w)).not.toMatch(/Prisma|SELECT|segredo|999999/);
  });

  it.each(['tempo', 'ocupado'] as const)('limite %s depois da base preserva KPI e indisponibiliza só a composição', async motivo => {
    vi.mocked(distribuicaoDoRecorte).mockRejectedValueOnce(new ErroDeRelatorio(motivo));
    const w = widget(await ler()); expect(w).toMatchObject({ estado: 'ok', valor: { valor: 3000 }, composicaoPorCategoria: { estado: 'indisponivel', totalCentavos: null } });
  });

  it('falha no encerramento após as leituras conserva base e elimina composição não confirmada', async () => {
    transacao.mockImplementationOnce(async (fn: (tx: ClienteDoParceiro) => Promise<unknown>) => { await fn(cliente); throw new Error('encerramento privado'); });
    expect(widget(await ler())).toMatchObject({ estado: 'ok', valor: { valor: 3000 }, composicaoPorCategoria: { estado: 'erro', totalCentavos: null, fatias: [] } });
    expect(totaisDoRecorte).toHaveBeenCalledTimes(1); expect(distribuicaoDoRecorte).toHaveBeenCalledTimes(1);
  });

  it('base ausente ou falha não reaproveita resultado anterior nem chama distribuição', async () => {
    expect(widget(await ler()).valor.valor).toBe(3000);
    vi.mocked(totaisDoRecorte).mockRejectedValueOnce(new Error('base falhou'));
    await expect(ler()).rejects.toThrow('base falhou');
    expect(distribuicaoDoRecorte).toHaveBeenCalledTimes(1);
    vi.mocked(resolverRecorte).mockResolvedValueOnce({ recorte: { ...recorte, parceiroId: 'outro' }, motivo: null, lojasDoAcesso: [] });
    expect(await ler()).toEqual({ tipo: 'incompativel' }); expect(distribuicaoDoRecorte).toHaveBeenCalledTimes(1);
  });

  it('distribuição incompatível/getter adverso não apaga valor, fonte, cobertura ou avisos do KPI', async () => {
    const dados = { tipo: 'totais', filtros: filtrosDeComprasHome('lojab', HOJE), totais: { ...totais, semBase: { valor: 1 } } } as const;
    const anterior = widget(dados);
    const alterado = widget({ ...dados, composicaoPorCategoria: lida(simples(999999)) });
    const { composicaoPorCategoria, ...core } = alterado;
    expect(core).toEqual(anterior); expect(composicaoPorCategoria?.estado).toBe('indisponivel');
    const adverso = Object.defineProperty({ ...dados }, 'composicaoPorCategoria', { enumerable: true, get() { throw new Error('privado 999999'); } });
    const w = widget(adverso); const { composicaoPorCategoria: erro, ...resto } = w;
    expect(resto).toEqual(anterior); expect(erro?.estado).toBe('erro'); expect(JSON.stringify(w)).not.toContain('999999');
    expect(Object.hasOwn(anterior, 'composicaoPorCategoria')).toBe(false);
  });

  it('DTO não autorizado não lê nem getter da composição e raiz N1 mantém contexto', () => {
    const dados = Object.defineProperty({}, 'composicaoPorCategoria', { get() { throw new Error('Não deve ler.'); } }) as DadosComprasHome;
    expect(comprasAnaliticas({ estado: 'lido', dados }, { ...c, alcance: { ...alcance, permissoes: new Set() } })).toBeNull();
    const w = comprasAnaliticas({ estado: 'lido', dados: { tipo: 'totais', filtros: filtrosDeComprasHome('lojab', HOJE), totais, composicaoPorCategoria: lida() } }, { ...c, raiz: '/rodolfo/erp/casa-b' })!;
    expect(w.composicaoPorCategoria?.detalhe.href).toBe(w.detalhe.href); expect(w.detalhe.href).toMatch(/^\/rodolfo\/erp\/casa-b\/compras\/relatorios\/periodo\?/);
  });
});
