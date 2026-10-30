import { beforeEach, describe, expect, it, vi } from 'vitest';
import { complementosDoFaturamento } from '@/lib/erp/home-faturamento-complementos';
import { faturamentoAnalitico, type ContextoHomeLoja } from '@/lib/erp/home-analitico';
import { diasDoMes, totalizar, type GraoLido, type TotaisDoRecorte } from '@/lib/erp/faturamento-campos';
import { obterMes, type LojaNoMes, type MesDoFaturamento } from '@/lib/erp/faturamento';
import { painelDoDia } from '@/lib/erp/painel-do-dia';
import { situacaoDoEstoque } from '@/lib/erp/estoque';
import { saudeDoCardapio } from '@/lib/erp/saude-do-cardapio';
import { lojasDaListaDoDia } from '@/lib/erp/producao-lista';
import { dreDoPeriodo } from '@/lib/erp/dre';
import { lerComprasDaHome } from '@/lib/erp/home-compras';
import type { Alcance } from '@/lib/erp/permissoes';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';

vi.mock('@/lib/erp/faturamento', () => ({ obterMes: vi.fn() }));
vi.mock('@/lib/erp/estoque', () => ({ situacaoDoEstoque: vi.fn() }));
vi.mock('@/lib/erp/saude-do-cardapio', () => ({ saudeDoCardapio: vi.fn() }));
vi.mock('@/lib/erp/producao-lista', () => ({ lojasDaListaDoDia: vi.fn() }));
vi.mock('@/lib/erp/dre', () => ({ dreDoPeriodo: vi.fn() }));
vi.mock('@/lib/erp/home-compras', () => ({ lerComprasDaHome: vi.fn(), comprasAnaliticas: vi.fn(() => null) }));
vi.mock('@/lib/db', () => { throw new Error('Somente mocks; não abre banco.'); });

const HOJE = '2026-10-29';
const alcance: Alcance = { nivel: 'LOJA', lojas: ['lojab'], permissoes: new Set(['faturamento.ver']) };
const c: ContextoHomeLoja = { alcance, loja: { id: 'lojab', nome: 'Loja B' }, raiz: '/erp', hoje: HOJE, consultadoEm: '2026-10-29T15:00:00.000Z' };
const g = (valorCentavos: number, pedidos: number, clientes: number): GraoLido => ({ valorCentavos, pedidos, clientes, fonte: 'INTEGRACAO', conferencia: { valorCentavos: 999999, pedidos: 777, clientes: 888, diferencaCentavos: 899999 } });
function mes(): MesDoFaturamento {
  const dias = diasDoMes('2026-10');
  const loja = g(10000, 1, 3), delivery = g(90000, 3, 5), zero = g(0, 0, 0), vazio = totalizar([]);
  const total = totalizar([loja, delivery, zero]);
  const l: LojaNoMes = {
    loja: { id: 'lojab', nome: 'Loja B', ativa: true, canais: ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'] }, primeiraData: '2026-10-28',
    dias: dias.map(data => ({ data, canais: data === '2026-10-28' ? { LOJA: loja, DELIVERY_PROPRIO: delivery, IFOOD: zero } : {},
      total: data === '2026-10-28' ? total : null, faltam: [], emAberto: data === HOJE, futuro: data > HOJE })),
    porCanal: { LOJA: totalizar([loja]), DELIVERY_PROPRIO: totalizar([delivery]), IFOOD: vazio }, total,
    faltasPorCanal: { LOJA: 0, DELIVERY_PROPRIO: 0, IFOOD: 0 }, faltas: 0,
  };
  return { mes: '2026-10', hoje: HOJE, dias, lojas: [l], total, porCanal: l.porCanal, faltas: 0, temIntegracao: true };
}
const projetar = (m = mes(), contexto = c) => faturamentoAnalitico({ estado: 'lido', dados: m }, contexto)!;
const total = (pedidos: number, clientes: number, ticketMedioCentavos: number | null): TotaisDoRecorte => ({ valorCentavos: 100000, pedidos, clientes, ticketMedioCentavos });
const semComplementos = (p: NonNullable<ReturnType<typeof faturamentoAnalitico>>) => {
  const { complementos: _complementos, ...widget } = p.widget;
  return { ...p, widget };
};

describe('Faturamento · complementos puros do mesmo total', () => {
  it('copia agregado canônico com tickets distintos e atendimentos diferentes de pedidos, sem média ou pessoas únicas', () => {
    const m = mes(); const p = projetar(m);
    expect(m.lojas[0].porCanal.LOJA.ticketMedioCentavos).toBe(10000);
    expect(m.lojas[0].porCanal.DELIVERY_PROPRIO.ticketMedioCentavos).toBe(30000);
    expect(p.widget.complementos).toEqual({ estado: 'ok', pedidos: 4, atendimentos: 8, ticketMedioCentavos: 25000, aviso: 'Atendimentos informados não representam pessoas únicas.' });
    expect(p.widget.valor.valor).toBe(100000); expect(p.diario.totalCentavos).toBe(100000);
    expect(p.widget.complementos?.ticketMedioCentavos).not.toBe(20000);
    expect(p.widget.origem).toEqual({ fonte: 'faturamento', modo: 'vivo', fotografia: null });
    expect(JSON.stringify(p)).not.toMatch(/999999|777|888|conferencia/);
  });

  it('lê só o total da loja validada, não os campos complementares de total global nem grãos/canais', () => {
    const m = mes();
    m.total = { ...m.total, pedidos: 999999, clientes: 888888, ticketMedioCentavos: 777777 };
    for (const dia of m.lojas[0].dias) for (const grao of Object.values(dia.canais)) {
      Object.defineProperty(grao, 'pedidos', { get() { throw new Error('Não ler pedido por grão.'); } });
      Object.defineProperty(grao, 'clientes', { get() { throw new Error('Não ler cliente por grão.'); } });
    }
    expect(projetar(m).widget.complementos).toMatchObject({ estado: 'ok', pedidos: 4, atendimentos: 8, ticketMedioCentavos: 25000 });
    expect(JSON.stringify(projetar(m))).not.toMatch(/999999|888888|777777/);
  });

  it('ausência não lê contadores inicializados nem transforma os zeros da fonte em operação', () => {
    const m = mes(); const l = m.lojas[0]; l.primeiraData = null;
    for (const d of l.dias) { d.canais = {}; d.total = null; }
    m.total = l.total = totalizar([]);
    Object.defineProperty(l.total, 'pedidos', { get() { throw new Error('Não consultar na ausência.'); } });
    const p = projetar(m);
    expect(p.widget.estado).toBe('sem_dados'); expect(p.widget.valor.valor).toBeNull();
    expect(p.widget.complementos).toMatchObject({ estado: 'sem_dados', pedidos: null, atendimentos: null, ticketMedioCentavos: null });
    expect(p.diario.serie).not.toBeNull();
  });

  it('Não vendeu declarado conserva contagens zero e ticket null', () => {
    const m = mes(); const l = m.lojas[0]; const zero = g(0, 0, 0);
    l.dias[27].canais = { LOJA: zero }; l.dias[27].total = totalizar([zero]); m.total = l.total = totalizar([zero]);
    const p = projetar(m);
    expect(p.widget.estado).toBe('ok'); expect(p.widget.valor.valor).toBe(0);
    expect(p.widget.complementos).toMatchObject({ estado: 'ok', pedidos: 0, atendimentos: 0, ticketMedioCentavos: null });
  });

  it('zero canônico de ticket com pedidos válidos não é convertido em null nem recalculado', () => {
    expect(complementosDoFaturamento('ok', () => total(4, 8, 0))).toMatchObject({ estado: 'ok', pedidos: 4, atendimentos: 8, ticketMedioCentavos: 0 });
    expect(complementosDoFaturamento('ok', () => total(4, 8, 12345)).ticketMedioCentavos).toBe(12345);
  });

  it('parcialidade e contexto do pai continuam explícitos nos lançamentos informados', () => {
    const m = mes(); m.faltas = m.lojas[0].faltas = 2;
    const p = projetar(m);
    expect(p.widget.estado).toBe('parcial'); expect(p.widget.cobertura?.faltasDeFaturamento).toBe(2);
    expect(p.widget.complementos).toMatchObject({ estado: 'parcial', pedidos: 4, atendimentos: 8, ticketMedioCentavos: 25000 });
    expect(p.widget.complementos?.aviso).toMatch(/lançamentos informados.*canais sem lançamento.*não representam pessoas únicas/);
    expect(p.widget.referencia).toMatchObject({ base: 'mes_civil', inicio: '2026-10-01', apuradoAte: HOJE });
  });

  it.each(['pedidos', 'clientes', 'ticketMedioCentavos'] as const)('getter %s falha só no complemento e preserva receita, série, fonte e cobertura', campo => {
    const m = mes(); const normal = projetar(m);
    Object.defineProperty(m.lojas[0].total, campo, { get() { throw new Error('SQL SEGREDO 999999'); } });
    const p = projetar(m);
    expect(semComplementos(p)).toEqual(semComplementos(normal));
    expect(p.widget.complementos).toMatchObject({ estado: 'erro', pedidos: null, atendimentos: null, ticketMedioCentavos: null });
    expect(JSON.stringify(p)).not.toMatch(/SQL|SEGREDO|999999/);
  });

  it.each([
    ['pedidos negativos', { pedidos: -1 }], ['pedidos fracionários', { pedidos: 0.5 }],
    ['atendimentos inseguros', { clientes: Number.MAX_SAFE_INTEGER + 1 }], ['atendimentos ausentes', { clientes: undefined }],
    ['ticket NaN', { ticketMedioCentavos: NaN }], ['ticket ausente', { ticketMedioCentavos: undefined }],
    ['sem pedido com ticket numérico', { pedidos: 0, ticketMedioCentavos: 0 }],
  ] as const)('%s indisponibiliza somente os novos campos', (_, extra) => {
    const m = mes(); const normal = projetar(m); Object.assign(m.lojas[0].total, extra);
    const p = projetar(m); expect(semComplementos(p)).toEqual(semComplementos(normal));
    expect(p.widget.complementos).toMatchObject({ estado: 'indisponivel', pedidos: null, atendimentos: null, ticketMedioCentavos: null });
  });

  it('allowlist do complemento não lê nem serializa campos privados adicionais', () => {
    const t = total(4, 8, 25000); Object.assign(t, { outraLoja: 'tenantsecreto', canais: { outraLoja: 999999 } });
    Object.defineProperty(t, 'privado', { get() { throw new Error('Não ler.'); } });
    const p = complementosDoFaturamento('ok', () => t);
    expect(Object.keys(p).sort()).toEqual(['atendimentos', 'aviso', 'estado', 'pedidos', 'ticketMedioCentavos'].sort());
    expect(JSON.stringify(p)).not.toMatch(/outraLoja|tenantsecreto|999999|canais|privado/);
  });

  it.each(['erro', 'indisponivel', 'sem_base', 'sem_dados'] as const)('estado %s não acessa o leitor e não carrega dados residuais', estado => {
    const leitor = vi.fn(() => total(4, 8, 25000)); const p = complementosDoFaturamento(estado, leitor);
    expect(leitor).not.toHaveBeenCalled(); expect(p.pedidos).toBeNull(); expect(p.atendimentos).toBeNull(); expect(p.ticketMedioCentavos).toBeNull();
  });

  it('gatilhos de permissão/contexto antecedem payload e complementos; N1 preserva aprofundamento', () => {
    const leitura = Object.defineProperty({ estado: 'lido' }, 'dados', { get() { throw new Error('Não ler.'); } }) as { estado: 'lido'; dados: MesDoFaturamento };
    expect(faturamentoAnalitico(leitura, { ...c, alcance: { ...alcance, permissoes: new Set() } })).toBeNull();
    expect(faturamentoAnalitico(leitura, { ...c, loja: { id: 'lojaa', nome: 'Proibida' } })).toBeNull();
    const n1 = projetar(mes(), { ...c, raiz: '/rodolfo/erp/casa-b' });
    expect(n1.widget.detalhe.href).toBe('/rodolfo/erp/casa-b/faturamento?mes=2026-10&loja=lojab');
    expect(n1.widget.complementos?.pedidos).toBe(4);
  });

  it.each(['outra-loja', 'outras-lojas', 'mes', 'total-rede', 'dias'] as const)('DTO incompatível %s não aproveita complementos nem a receita', caso => {
    const m = mes();
    if (caso === 'outra-loja') m.lojas[0].loja.id = 'lojaa';
    if (caso === 'outras-lojas') m.lojas.push({ ...m.lojas[0], loja: { ...m.lojas[0].loja, id: 'lojaa' } });
    if (caso === 'mes') m.mes = '2026-09';
    if (caso === 'total-rede') m.total = { ...m.total, valorCentavos: 999999 };
    if (caso === 'dias') m.lojas[0].dias.reverse();
    const p = projetar(m); expect(p.widget.estado).toBe('indisponivel'); expect(p.widget.valor.valor).toBeNull();
    expect(p.widget.complementos).toMatchObject({ estado: 'indisponivel', pedidos: null, atendimentos: null, ticketMedioCentavos: null });
    expect(p.diario.serie).toBeNull(); expect(JSON.stringify(p)).not.toContain('999999');
  });
});

describe('Faturamento · nenhum custo adicional de leitura na Home', () => {
  beforeEach(() => vi.resetAllMocks());
  const cliente = { parceiroId: 'parceirob', transacao: vi.fn() } as unknown as ClienteDoParceiro;
  const visao = { tipo: 'loja', lojaId: 'lojab', nome: 'Loja B' } as const;
  it('uma única obterMes alimenta receita, evolução e os três complementos; outras fontes continuam sem acesso', async () => {
    vi.mocked(obterMes).mockResolvedValueOnce(mes());
    const p = await painelDoDia(cliente, alcance, '/erp', HOJE, visao);
    expect(obterMes).toHaveBeenCalledTimes(1); expect(obterMes).toHaveBeenCalledWith(cliente, expect.objectContaining({ lojas: ['lojab'] }), { mes: '2026-10', lojaId: 'lojab' }, HOJE);
    expect(p.analitico?.tipo).toBe('loja'); if (p.analitico?.tipo !== 'loja') throw new Error('Loja esperada.');
    const fat = p.analitico.widgets.find(w => w.familia === 'faturamento');
    expect(fat).toMatchObject({ valor: { valor: 100000 }, complementos: { pedidos: 4, atendimentos: 8, ticketMedioCentavos: 25000 } });
    expect(p.analitico.faturamentoDiario?.totalCentavos).toBe(100000);
    for (const fonte of [situacaoDoEstoque, saudeDoCardapio, lojasDaListaDoDia, dreDoPeriodo, lerComprasDaHome]) expect(fonte).not.toHaveBeenCalled();
    expect(cliente.transacao).not.toHaveBeenCalled();
  });

  it('sem faturamento.ver ou visão forjada não chama obterMes nem entrega complementos', async () => {
    for (const [al, v] of [[{ ...alcance, permissoes: new Set<never>() }, visao], [alcance, { ...visao, lojaId: 'lojaa' }]] as const) {
      const p = await painelDoDia(cliente, al, '/erp', HOJE, v);
      expect(JSON.stringify(p)).not.toContain('complementos');
    }
    expect(obterMes).not.toHaveBeenCalled();
  });

  it('falha da única fonte não inventa contagens zero', async () => {
    vi.mocked(obterMes).mockRejectedValueOnce(new Error('SQL SQL 999999'));
    const p = await painelDoDia(cliente, alcance, '/erp', HOJE, visao);
    if (p.analitico?.tipo !== 'loja') throw new Error('Loja esperada.');
    expect(p.analitico.widgets.find(w => w.familia === 'faturamento')).toMatchObject({ estado: 'erro', valor: { valor: null }, complementos: { estado: 'erro', pedidos: null, atendimentos: null, ticketMedioCentavos: null } });
    expect(obterMes).toHaveBeenCalledTimes(1); expect(JSON.stringify(p)).not.toMatch(/SQL|999999/);
  });
});
