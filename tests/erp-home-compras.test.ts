import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lerComprasDaHome, comprasAnaliticas, filtrosDeComprasHome } from '@/lib/erp/home-compras';
import type { ContextoHomeLoja } from '@/lib/erp/home-analitico';
import { resolverRecorte, totaisDoRecorte, distribuicaoDoRecorte, relatorioDaTela, opcoesDoRelatorio, documentosAguardando, type Recorte, type TotaisDoRecorte } from '@/lib/erp/compras-relatorio';
import { lerFiltrosDoRelatorio, somarDias } from '@/lib/erp/compras-relatorio-campos';
import { ErroDeRelatorio } from '@/lib/erp/vagas-de-relatorio';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import type { Alcance } from '@/lib/erp/permissoes';

vi.mock('@/lib/erp/compras-relatorio', () => ({ resolverRecorte: vi.fn(), totaisDoRecorte: vi.fn(), distribuicaoDoRecorte: vi.fn(), relatorioDaTela: vi.fn(), opcoesDoRelatorio: vi.fn(), documentosAguardando: vi.fn() }));
vi.mock('@/lib/db', () => { throw new Error('Somente fontes mockadas nesta matriz.'); });

const HOJE = '2026-10-30';
const alcance: Alcance = { nivel: 'LOJA', lojas: ['lojaa', 'lojab'], permissoes: new Set(['compras.ver']) };
const contexto: ContextoHomeLoja = { alcance, loja: { id: 'lojab', nome: 'Loja B' }, raiz: '/erp', hoje: HOJE, consultadoEm: '2026-10-30T12:00:00.000Z' };
let cliente: ClienteDoParceiro;
const transacao = vi.fn(<T>(fn: (tx: ClienteDoParceiro) => Promise<T>, _opcoes?: unknown) => fn(cliente));
const recorte = (extra: Partial<Recorte> = {}): Recorte => ({
  parceiroId: 'parceiro-b', lojas: ['lojab'], status: 'LANCADA', base: 'entrada', de: '2026-10-01', ate: HOJE, fim: somarDias(HOJE, 1),
  fornecedorId: null, insumoIds: null, categoriaId: null, agrupar: 'insumo', grupo: null, unidade: null, soSemBase: false, ...extra,
});
const total = (extra: Partial<TotaisDoRecorte> = {}): TotaisDoRecorte => ({ linhas: 2, notas: 1, valorCentavos: 2700, freteCentavos: 300, totalCentavos: 3000, unidades: [], semBase: {}, notasComDesconto: 0, ...extra });
const ler = () => lerComprasDaHome(cliente, alcance, 'lojab', HOJE);
beforeEach(() => {
  vi.resetAllMocks();
  cliente = { parceiroId: 'parceiro-b', transacao } as unknown as ClienteDoParceiro;
  transacao.mockImplementation(<T>(fn: (tx: ClienteDoParceiro) => Promise<T>) => fn(cliente));
  vi.mocked(resolverRecorte).mockResolvedValue({ recorte: recorte(), lojasDoAcesso: [{ id: 'lojab', nome: 'Loja B', ativa: true }], motivo: null });
  vi.mocked(totaisDoRecorte).mockResolvedValue(total());
  vi.mocked(distribuicaoDoRecorte).mockResolvedValue({ fatias: [{ chave: 'categoria', rotulo: 'Categoria atual', centavos: 3000 }], outros: null, totalCentavos: 3000, quantos: 1 });
});

describe('H2 · compras estreitas com a mesma regra do relatório', () => {
  it('autoriza antes da transação e pede resolver+totais+composição da loja, entrada01→hoje, lançadas', async () => {
    const dados = await ler();
    expect(transacao).toHaveBeenCalledTimes(1);
    expect(transacao).toHaveBeenCalledWith(expect.any(Function), { repetivel: true, relatorio: {} });
    expect(resolverRecorte).toHaveBeenCalledWith(cliente, expect.objectContaining({ lojas: ['lojab'], permissoes: alcance.permissoes }), expect.objectContaining({ lojaIds: ['lojab'], de: '2026-10-01', ate: HOJE, base: 'entrada', situacao: 'lancadas', fornecedorId: '', insumoId: '', q: '' }));
    expect(totaisDoRecorte).toHaveBeenCalledTimes(1);
    expect(totaisDoRecorte).toHaveBeenCalledWith(cliente, recorte());
    expect(distribuicaoDoRecorte).toHaveBeenCalledWith(cliente, recorte(), 'categoria', 6);
    expect(relatorioDaTela).not.toHaveBeenCalled(); expect(opcoesDoRelatorio).not.toHaveBeenCalled(); expect(documentosAguardando).not.toHaveBeenCalled();
    const w = comprasAnaliticas({ estado: 'lido', dados }, contexto)!;
    expect(w.valor.valor).toBe(3000); // O total já contém frete; não 3300.
    expect(w).toMatchObject({ baseDeData: 'entrada', notas: 1, itensCentavos: 2700, freteCentavos: 300, estado: 'ok' });
    const url = new URL(w.detalhe.href, 'https://local.test');
    expect(url.pathname).toBe('/erp/compras/relatorios/periodo');
    const f = lerFiltrosDoRelatorio(Object.fromEntries(url.searchParams), HOJE);
    expect(f).toMatchObject({ lojaIds: ['lojab'], de: '2026-10-01', ate: HOJE, base: 'entrada', situacao: 'lancadas' });
    expect(JSON.stringify(w)).not.toMatch(/parceiro-b|lojaa/);
  });

  it('sem permissão, loja fora, id/data inválidos não iniciam sequer transação', async () => {
    const sem = { ...alcance, permissoes: new Set<'compras.ver'>() };
    expect(await lerComprasDaHome(cliente, sem, 'lojab', HOJE)).toBeNull();
    expect(await lerComprasDaHome(cliente, { ...alcance, lojas: ['lojaa'] }, 'lojab', HOJE)).toBeNull();
    expect(await lerComprasDaHome(cliente, alcance, '../lojab', HOJE)).toBeNull();
    expect(await lerComprasDaHome(cliente, alcance, 'lojab', '2026-02-30')).toBeNull();
    expect(transacao).not.toHaveBeenCalled(); expect(resolverRecorte).not.toHaveBeenCalled(); expect(totaisDoRecorte).not.toHaveBeenCalled();
  });

  it.each([
    { status: 'CANCELADA' }, { lojas: ['lojaa'] }, { lojas: ['lojaa', 'lojab'] }, { parceiroId: 'outro-parceiro' },
    { base: 'emissao' }, { de: '2026-01-01' }, { ate: '2026-12-31' }, { fim: '2027-01-01' },
    { fornecedorId: 'fornecedor' }, { insumoIds: ['insumo'] }, { categoriaId: 'categoria' }, { grupo: 'grupo' }, { unidade: 'KG' }, { soSemBase: true },
  ] as Partial<Recorte>[])('recorte alterado %j é recusado ANTES de totalizar', async (extra) => {
    vi.mocked(resolverRecorte).mockResolvedValueOnce({ recorte: recorte(extra), lojasDoAcesso: [], motivo: null });
    const d = await ler();
    expect(d).toEqual({ tipo: 'incompativel' }); expect(totaisDoRecorte).not.toHaveBeenCalled();
    const w = comprasAnaliticas({ estado: 'lido', dados: d }, contexto)!;
    expect(w.estado).toBe('indisponivel'); expect(w.valor.valor).toBeNull();
  });

  it('sem loja elegível não totaliza e não inventa zero de notas', async () => {
    vi.mocked(resolverRecorte).mockResolvedValueOnce({ recorte: null, lojasDoAcesso: [], motivo: 'sem-loja' });
    const d = await ler();
    expect(totaisDoRecorte).not.toHaveBeenCalled();
    const w = comprasAnaliticas({ estado: 'lido', dados: d }, contexto)!;
    expect(w.estado).toBe('sem_dados'); expect(w.valor.valor).toBeNull(); expect(w.notas).toBeNull();
  });

  it('nenhuma nota é ausência; nota bonificada de valor zero é um zero real sem parcial financeiro', async () => {
    vi.mocked(totaisDoRecorte).mockResolvedValueOnce(total({ notas: 0, linhas: 0, totalCentavos: 0, valorCentavos: 0, freteCentavos: 0 }));
    const sem = comprasAnaliticas({ estado: 'lido', dados: await ler() }, contexto)!;
    expect(sem.estado).toBe('sem_dados'); expect(sem.valor.valor).toBeNull(); expect(sem.notas).toBe(0);
    vi.mocked(totaisDoRecorte).mockResolvedValueOnce(total({ totalCentavos: 0, valorCentavos: 0, freteCentavos: 0, semBase: { valor: 1 } }));
    const zero = comprasAnaliticas({ estado: 'lido', dados: await ler() }, contexto)!;
    expect(zero.estado).toBe('ok'); expect(zero.valor.valor).toBe(0); expect(zero.semBase).toEqual({ valor: 1 });
  });

  it('semBase é só preço médio; não desconta dinheiro nem projeta motivos/campos desconhecidos', async () => {
    vi.mocked(totaisDoRecorte).mockResolvedValueOnce(total({ semBase: { conversao: 2, privado: 999_999 } as TotaisDoRecorte['semBase'] }));
    const w = comprasAnaliticas({ estado: 'lido', dados: await ler() }, contexto)!;
    expect(w.estado).toBe('ok'); expect(w.valor.valor).toBe(3000); expect(w.semBase).toEqual({ conversao: 2 });
    expect(JSON.stringify(w)).not.toMatch(/privado|999999/);
  });

  it.each(['tempo', 'ocupado'] as const)('limite %s é controlado e não serializa corpo/erro bruto', async (motivo) => {
    vi.mocked(totaisDoRecorte).mockRejectedValueOnce(new ErroDeRelatorio(motivo));
    const d = await ler(); expect(d).toEqual({ tipo: 'limite', motivo });
    const w = comprasAnaliticas({ estado: 'lido', dados: d }, contexto)!;
    expect(w.estado).toBe('indisponivel'); expect(w.valor.valor).toBeNull();
  });

  it('loja/tenant/base de rota não são recuperados de dados de outra origem', () => {
    const w = comprasAnaliticas({ estado: 'lido', dados: { tipo: 'totais', filtros: filtrosDeComprasHome('lojaa', HOJE), totais: total({ totalCentavos: 999_999 }) } }, contexto)!;
    expect(w.estado).toBe('indisponivel'); expect(w.valor.valor).toBeNull(); expect(JSON.stringify(w)).not.toContain('999999');
    expect(comprasAnaliticas({ estado: 'erro' }, { ...contexto, raiz: 'https://fora.test' })).toBeNull();
    const n1 = comprasAnaliticas({ estado: 'erro' }, { ...contexto, raiz: '/rodolfo/erp/casa-alfa' })!;
    expect(n1.detalhe.href).toContain('/rodolfo/erp/casa-alfa/compras/relatorios/periodo?');
  });
});
