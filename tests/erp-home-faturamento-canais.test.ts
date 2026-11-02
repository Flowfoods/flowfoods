import { beforeEach, describe, expect, it, vi } from 'vitest';
import { faturamentoAnalitico } from '@/lib/erp/home-analitico';
import { projetarCanaisDoFaturamento } from '@/lib/erp/home-faturamento-canais';
import { obterMes, type MesDoFaturamento } from '@/lib/erp/faturamento';
import { painelDoDia } from '@/lib/erp/painel-do-dia';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import { contextoCanaisHome as contexto, mesDosCanaisHome as mes } from './apoio-home-canais';

vi.mock('@/lib/erp/faturamento', () => ({ obterMes: vi.fn() }));
vi.mock('@/lib/erp/estoque', () => ({ situacaoDoEstoque: vi.fn() }));
vi.mock('@/lib/erp/saude-do-cardapio', () => ({ saudeDoCardapio: vi.fn() }));
vi.mock('@/lib/erp/producao-lista', () => ({ lojasDaListaDoDia: vi.fn() }));
vi.mock('@/lib/erp/dre', () => ({ dreDoPeriodo: vi.fn() }));
vi.mock('@/lib/erp/home-compras', () => ({ lerComprasDaHome: vi.fn(), comprasAnaliticas: vi.fn(() => null) }));
vi.mock('@/lib/db', () => { throw new Error('Projeção não acessa banco.'); });

const projetar = (m = mes()) => faturamentoAnalitico({ estado: 'lido', dados: m }, contexto)!;
const composicao = (m = mes()) => projetar(m).widget.composicaoPorCanal!;
const nucleo = (p: ReturnType<typeof projetar>) => { const { composicaoPorCanal: _c, ...widget } = p.widget; return { ...p, widget }; };

describe('Home · composição canônica do faturamento por canal', () => {
  it('projeta valores, presença real de zero e percentuais sobre o total reconciliado', () => {
    expect(composicao()).toMatchObject({ estado: 'ok', totalCentavos: 40000, canais: [
      { canal: 'LOJA', centavos: 10000, faltas: 0, percentualBp: 2500 },
      { canal: 'DELIVERY_PROPRIO', centavos: 0, faltas: 0, percentualBp: 0 },
      { canal: 'IFOOD', centavos: 30000, faltas: 0, percentualBp: 7500 },
    ] });
  });
  it('só lançamento hoje: canal configurado ausente tem null mesmo sem falta', () => {
    expect(composicao(mes({ LOJA: 10000 }))).toMatchObject({ estado: 'ok', canais: [
      { canal: 'LOJA', centavos: 10000, percentualBp: 10000 },
      { canal: 'DELIVERY_PROPRIO', centavos: null, faltas: 0, percentualBp: null },
      { canal: 'IFOOD', centavos: null, faltas: 0, percentualBp: null },
    ] });
  });
  it('total zero conhecido conserva canais com zero e não divide por zero', () => {
    const c = composicao(mes({ LOJA: 0, DELIVERY_PROPRIO: 0, IFOOD: 0 }));
    expect(c.estado).toBe('ok'); expect(c.totalCentavos).toBe(0);
    expect(c.canais.map(c => c.centavos)).toEqual([0, 0, 0]); expect(c.canais.every(c => c.percentualBp === null)).toBe(true);
  });
  it('sem lançamentos não lê porCanal inicializado nem publica zeros', () => {
    const m = mes({}); Object.defineProperty(m.lojas[0], 'porCanal', { get() { throw new Error('Não ler.'); } });
    expect(composicao(m)).toMatchObject({ estado: 'sem_dados', totalCentavos: null, canais: [] });
  });
  it('une configurados, históricos desativados e canais com falta sem inventar valores', () => {
    const m = mes({ IFOOD: 30000 }, ['LOJA']);
    m.lojas[0].faltasPorCanal.DELIVERY_PROPRIO = 2; m.faltas = m.lojas[0].faltas = 2;
    expect(composicao(m)).toMatchObject({ estado: 'parcial', totalCentavos: 30000, canais: [
      { canal: 'LOJA', centavos: null }, { canal: 'DELIVERY_PROPRIO', centavos: null, faltas: 2 },
      { canal: 'IFOOD', centavos: 30000, percentualBp: 10000 },
    ] });
  });
  it('não inclui canal sem configuração, histórico ou falta', () => {
    expect(composicao(mes({ IFOOD: 0 }, ['IFOOD'])).canais).toHaveLength(1);
  });
  it.each(['total', 'falta', 'presenca', 'negativo', 'NaN', 'fracao', 'inseguro', 'canal'] as const)('incompatibilidade %s indisponibiliza só composição', caso => {
    const m = mes(); const antes = nucleo(projetar(m));
    if (caso === 'total') m.lojas[0].porCanal.LOJA.valorCentavos++;
    if (caso === 'falta') m.lojas[0].faltasPorCanal.LOJA++;
    if (caso === 'presenca') { m.lojas[0].porCanal.LOJA.valorCentavos += 1; m.lojas[0].porCanal.DELIVERY_PROPRIO.valorCentavos = -1; }
    if (caso === 'negativo') m.lojas[0].porCanal.LOJA.valorCentavos = -1;
    if (caso === 'NaN') m.lojas[0].porCanal.LOJA.valorCentavos = NaN;
    if (caso === 'fracao') m.lojas[0].faltasPorCanal.LOJA = 0.5;
    if (caso === 'inseguro') m.lojas[0].porCanal.LOJA.valorCentavos = Number.MAX_SAFE_INTEGER + 1;
    if (caso === 'canal') Object.assign(m.lojas[0].loja, { canais: ['FORJADO'] });
    const p = projetar(m); expect(nucleo(p)).toEqual(antes);
    expect(p.widget.composicaoPorCanal).toMatchObject({ estado: 'indisponivel', totalCentavos: null, canais: [] });
  });
  it('total por canal positivo sem presença é recusado, sem mexer na série', () => {
    const m = mes({ LOJA: 10000 }); m.lojas[0].porCanal.LOJA.valorCentavos = 5000; m.lojas[0].porCanal.IFOOD.valorCentavos = 5000;
    const p = projetar(m); expect(p.diario.totalCentavos).toBe(10000); expect(p.widget.composicaoPorCanal!.estado).toBe('indisponivel');
  });
  it.each(['porCanal', 'faltasPorCanal'] as const)('getter %s falha isoladamente e não expõe erro', campo => {
    const m = mes(), antes = nucleo(projetar(m)); Object.defineProperty(m.lojas[0], campo, { get() { throw new Error('SQL_PRIVADO'); } });
    const p = projetar(m); expect(nucleo(p)).toEqual(antes); expect(p.widget.composicaoPorCanal!.estado).toBe('indisponivel'); expect(JSON.stringify(p)).not.toContain('SQL_PRIVADO');
  });
  it('não lê totais globais por canal, contadores ou conferência humana e só serializa allowlist', () => {
    const m = mes(); Object.defineProperty(m, 'porCanal', { get() { throw new Error('REDE_PRIVADA'); } });
    for (const t of Object.values(m.lojas[0].porCanal)) for (const k of ['pedidos', 'clientes', 'ticketMedioCentavos']) Object.defineProperty(t, k, { get() { throw new Error('CONTADOR_PRIVADO'); } });
    for (const d of m.lojas[0].dias) for (const g of Object.values(d.canais)) Object.defineProperty(g, 'conferencia', { get() { throw new Error('CONFERENCIA_PRIVADA'); } });
    expect(composicao(m).estado).toBe('ok'); expect(JSON.stringify(composicao(m))).not.toMatch(/PRIVAD|conferencia|pedidos|clientes|origemRef/);
  });
  it.each(['sem_dados', 'erro', 'indisponivel', 'sem_base'] as const)('%s não lê dados residuais', estado => {
    const leitor = vi.fn(() => { throw new Error('Não ler'); });
    expect(projetarCanaisDoFaturamento(estado, leitor).canais).toEqual([]); expect(leitor).not.toHaveBeenCalled();
  });
  it('permite máximo inteiro seguro e arredonda percentuais sem alterar centavos', () => {
    const m = mes({ LOJA: Number.MAX_SAFE_INTEGER - 1, IFOOD: 1 }); const c = composicao(m);
    expect(c.estado).toBe('ok'); expect(c.totalCentavos).toBe(Number.MAX_SAFE_INTEGER); expect(c.canais[2].centavos).toBe(1); expect(c.canais[2].percentualBp).toBe(0);
  });
  it('gates antecedem os dados e contexto divergente não publica composição', () => {
    const leitura = Object.defineProperty({ estado: 'lido' }, 'dados', { get() { throw new Error('Não ler.'); } }) as { estado: 'lido'; dados: MesDoFaturamento };
    expect(faturamentoAnalitico(leitura, { ...contexto, alcance: { ...contexto.alcance, permissoes: new Set() } })).toBeNull();
    expect(faturamentoAnalitico(leitura, { ...contexto, loja: { id: 'outra', nome: 'Outra' } })).toBeNull();
    const m = mes(); m.mes = '2026-09'; expect(composicao(m).estado).toBe('indisponivel');
    const n1 = faturamentoAnalitico({ estado: 'lido', dados: mes() }, { ...contexto, raiz: '/rodolfo/erp/casa-b' })!;
    expect(n1.widget.detalhe.href).toBe('/rodolfo/erp/casa-b/faturamento?mes=2026-10&loja=lojab'); expect(n1.widget.composicaoPorCanal!.estado).toBe('ok');
  });
});

describe('Home · composição sem consultas adicionais', () => {
  beforeEach(() => vi.resetAllMocks());
  const cliente = { parceiroId: 'parceirob', transacao: vi.fn() } as unknown as ClienteDoParceiro;
  const visao = { tipo: 'loja', lojaId: 'lojab', nome: 'Loja B' } as const;
  it('uma única obterMes alimenta KPI, série, complementos e composição', async () => {
    vi.mocked(obterMes).mockResolvedValueOnce(mes());
    const p = await painelDoDia(cliente, contexto.alcance, '/erp', contexto.hoje, visao);
    expect(obterMes).toHaveBeenCalledTimes(1); expect(cliente.transacao).not.toHaveBeenCalled();
    if (p.analitico?.tipo !== 'loja') throw new Error('Loja esperada');
    expect(p.analitico.widgets.find(w => w.familia === 'faturamento')).toMatchObject({ composicaoPorCanal: { estado: 'ok', totalCentavos: 40000 } });
  });
  it('sem permissão e fora do alcance não consulta nem envia a composição', async () => {
    for (const [al, v] of [[{ ...contexto.alcance, permissoes: new Set<never>() }, visao], [contexto.alcance, { ...visao, lojaId: 'outra' }]] as const) {
      expect(JSON.stringify(await painelDoDia(cliente, al, '/erp', contexto.hoje, v))).not.toContain('composicaoPorCanal');
    }
    expect(obterMes).not.toHaveBeenCalled();
  });
  it('Rede mantém sua leitura sem composição de loja', async () => {
    vi.mocked(obterMes).mockResolvedValueOnce(mes());
    const p = await painelDoDia(cliente, { ...contexto.alcance, lojas: 'todas' }, '/erp', contexto.hoje, { tipo: 'rede' });
    expect(p.analitico).toEqual({ tipo: 'rede' }); expect(JSON.stringify(p)).not.toContain('composicaoPorCanal');
  });
});
