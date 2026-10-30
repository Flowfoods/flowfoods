import { describe, expect, it } from 'vitest';
import { despesasIndisponiveis, estoqueAnalitico, faturamentoAnalitico, producaoAnalitica, type ContextoHomeLoja } from '@/lib/erp/home-analitico';
import { serieDoMes } from '@/lib/erp/grafico';
import { diasDoMes, totalizar, type GraoLido } from '@/lib/erp/faturamento-campos';
import type { MesDoFaturamento, LojaNoMes } from '@/lib/erp/faturamento';
import type { SituacaoDaLoja } from '@/lib/erp/estoque';
import type { Permissao } from '@/lib/erp/permissoes';

const HOJE = '2026-10-30';
const c = (permissoes: Permissao[], lojaId = 'lojab'): ContextoHomeLoja => ({
  alcance: { nivel: 'LOJA', lojas: ['lojab'], permissoes: new Set(permissoes) }, loja: { id: lojaId, nome: 'Loja B' },
  raiz: '/erp', hoje: HOJE, consultadoEm: '2026-10-30T12:00:00.000Z',
});
const grao = (valorCentavos: number): GraoLido => ({ valorCentavos, pedidos: valorCentavos ? 10 : 0, clientes: valorCentavos ? 10 : 0, fonte: 'INTEGRACAO', conferencia: { valorCentavos: 999_999, pedidos: 100, clientes: 100, diferencaCentavos: 989_999 } });
export function mesDaFixture(): MesDoFaturamento {
  const dias = diasDoMes('2026-10');
  const g = grao(10_000), zero = grao(0), vazio = totalizar([]);
  const loja: LojaNoMes = {
    loja: { id: 'lojab', nome: 'Loja B', ativa: true, canais: ['LOJA', 'IFOOD'] }, primeiraData: '2026-10-02',
    dias: dias.map((data) => ({ data, canais: data === '2026-10-02' ? { LOJA: g } : data === '2026-10-03' ? { LOJA: zero } : {},
      total: data === '2026-10-02' ? totalizar([g]) : data === '2026-10-03' ? totalizar([zero]) : null,
      faltam: data === '2026-10-03' ? ['IFOOD'] : data === '2026-10-04' ? ['LOJA'] : [], emAberto: data === HOJE, futuro: data > HOJE })),
    porCanal: { LOJA: totalizar([g, zero]), IFOOD: vazio, DELIVERY_PROPRIO: vazio }, total: totalizar([g, zero]),
    faltasPorCanal: { LOJA: 1, IFOOD: 1, DELIVERY_PROPRIO: 0 }, faltas: 2,
  };
  return { mes: '2026-10', hoje: HOJE, dias, lojas: [loja], porCanal: loja.porCanal, total: loja.total, faltas: 2, temIntegracao: true };
}
const estoque = (alteracoes: Partial<SituacaoDaLoja> = {}): SituacaoDaLoja => ({
  id: 'lojab', nome: 'Loja B', ativa: true, estado: 'ABERTO', contagem: null, verValores: true,
  aberto: { desde: new Date('2026-10-01T12:00:00Z'), por: 'Autor privado', itensComSaldo: 3, valorCentavos: 12_345, pendentes: 2 }, ...alteracoes,
});

describe('H2 · faturamento é a projeção mensal existente com null/zero e cobertura', () => {
  it('reutiliza serieDoMes, total canônico e recorte, sem duplicar integração/conferência humana', () => {
    const m = mesDaFixture();
    const p = faturamentoAnalitico({ estado: 'lido', dados: m }, c(['faturamento.ver']))!;
    expect(p.diario.serie).toEqual(serieDoMes(m, m.lojas[0]));
    expect(p.widget.valor).toEqual({ unidade: 'centavos', valor: 10_000 });
    expect(p.diario.totalCentavos).toBe(p.widget.valor.valor);
    expect(p.widget.estado).toBe('parcial');
    expect(p.diario.serie?.dias.find((d) => d.data === '2026-10-01')).toMatchObject({ total: null, estado: 'antes' });
    expect(p.diario.serie?.dias.find((d) => d.data === '2026-10-03')).toMatchObject({ total: 0, estado: 'falta', faltam: ['IFOOD'] });
    expect(p.diario.serie?.dias.find((d) => d.data === '2026-10-04')).toMatchObject({ total: null, estado: 'falta' });
    expect(p.diario.serie?.dias.find((d) => d.data === HOJE)).toMatchObject({ total: null, estado: 'em-aberto' });
    expect(p.diario.serie?.dias.at(-1)).toMatchObject({ total: null, estado: 'futuro' });
    expect(JSON.stringify(p)).not.toMatch(/999999|989999|conferencia|Autor privado/);
    expect(p.widget.detalhe.href).toBe('/erp/faturamento?mes=2026-10&loja=lojab');
  });

  it('nenhum lançamento preserva null e série com lacunas, enquanto zero registrado continua zero', () => {
    const m = mesDaFixture();
    for (const d of m.lojas[0].dias) { d.canais = {}; d.total = null; d.faltam = []; }
    m.total = m.lojas[0].total = totalizar([]); m.faltas = m.lojas[0].faltas = 0;
    const sem = faturamentoAnalitico({ estado: 'lido', dados: m }, c(['faturamento.ver']))!;
    expect(sem.widget.estado).toBe('sem_dados'); expect(sem.widget.valor.valor).toBeNull();
    expect(sem.diario.serie?.dias.every((d) => d.total === null)).toBe(true);
    m.lojas[0].dias[2].canais = { LOJA: grao(0) }; m.lojas[0].dias[2].total = totalizar([grao(0)]);
    const zero = faturamentoAnalitico({ estado: 'lido', dados: m }, c(['faturamento.ver']))!;
    expect(zero.widget.estado).toBe('ok'); expect(zero.widget.valor.valor).toBe(0);
  });

  it.each(['outra-loja', 'outro-mes', 'total-rede', 'dias-desalinhados'] as const)('recusa DTO incoerente %s sem serializar seus valores', (caso) => {
    const m = mesDaFixture();
    if (caso === 'outra-loja') m.lojas[0].loja.id = 'lojaa';
    if (caso === 'outro-mes') m.mes = '2026-09';
    if (caso === 'total-rede') m.total = { ...m.total, valorCentavos: 888_888 };
    if (caso === 'dias-desalinhados') m.lojas[0].dias.reverse();
    const p = faturamentoAnalitico({ estado: 'lido', dados: m }, c(['faturamento.ver']))!;
    expect(p.widget.estado).toBe('indisponivel'); expect(p.widget.valor.valor).toBeNull();
    expect(p.diario.serie).toBeNull(); expect(JSON.stringify(p)).not.toContain('888888');
  });

  it('exception após projetar série/valor limpa todos os números antes de informar erro', () => {
    const m = mesDaFixture(); let vezes = 0;
    Object.defineProperty(m.lojas[0], 'faltas', { get() { if (++vezes === 2) throw new Error('DADO_PRIVADO'); return 2; } });
    const p = faturamentoAnalitico({ estado: 'lido', dados: m }, c(['faturamento.ver']))!;
    expect(p.widget.estado).toBe('erro'); expect(p.widget.valor.valor).toBeNull();
    expect(p.widget.origem).toBeNull(); expect(p.widget.cobertura).toBeNull();
    expect(p.diario.serie).toBeNull(); expect(p.diario.totalCentavos).toBeNull();
    expect(JSON.stringify(p)).not.toMatch(/DADO_PRIVADO|10000/);
  });

  it('permissão e loja são verificadas antes de olhar payload', () => {
    const leitura = Object.defineProperty({ estado: 'lido' }, 'dados', { get() { throw new Error('NÃO LER'); } }) as { estado: 'lido'; dados: MesDoFaturamento };
    expect(faturamentoAnalitico(leitura, c([]))).toBeNull();
    expect(faturamentoAnalitico(leitura, c(['faturamento.ver'], 'lojaa'))).toBeNull();
  });
});

describe('H2 · estoque atual respeita a régua monetária sem repetir consulta', () => {
  it('usa valor conhecido e pendentes prontos, sem recalcular ou fingir estoque histórico', () => {
    const w = estoqueAnalitico({ estado: 'lido', dados: [estoque()] }, c(['estoque.ver', 'compras.ver']))!;
    expect(w).toMatchObject({ familia: 'estoque', estado: 'parcial', situacao: 'ABERTO', valor: { unidade: 'centavos', valor: 12_345 }, itensSemCusto: 2 });
    expect(w.rotuloDoValor).toBe('Valor conhecido do estoque');
    expect(w.referencia).toMatchObject({ base: 'posicao_atual', inicio: null, fim: null });
    expect(w.percentual).toBeNull(); expect(JSON.stringify(w)).not.toContain('Autor privado');
  });

  it('operador não recebe números/campos financeiros mesmo se fonte errada disser verValores=true', () => {
    const l = estoque(); l.aberto!.valorCentavos = 998_877; l.aberto!.pendentes = 777;
    const w = estoqueAnalitico({ estado: 'lido', dados: [l] }, c(['estoque.ver']))!;
    expect(w).toMatchObject({ estado: 'ok', verValores: false, valor: { unidade: 'contagem', valor: 3 }, rotuloDoValor: 'Itens com saldo' });
    expect(w).not.toHaveProperty('itensSemCusto');
    expect(JSON.stringify(w)).not.toMatch(/998877|777|centavos|itensSemCusto|financeir|preço|custo/i);
  });

  it('compras.ver sozinho não autoriza estoque e fonte.verValores=false não expõe zero técnico financeiro', () => {
    expect(estoqueAnalitico({ estado: 'lido', dados: [estoque()] }, c(['compras.ver']))).toBeNull();
    const w = estoqueAnalitico({ estado: 'lido', dados: [estoque({ verValores: false })] }, c(['estoque.ver', 'compras.ver']))!;
    expect(w.valor).toEqual({ unidade: 'contagem', valor: 3 }); expect(w).not.toHaveProperty('itensSemCusto');
  });

  it.each(['NAO_ABERTO', 'EM_CONTAGEM'] as const)('%s não recebe posição zero ou copy financeira para o operador', (estado) => {
    const w = estoqueAnalitico({ estado: 'lido', dados: [estoque({ estado, aberto: null, contagem: estado === 'EM_CONTAGEM' ? { contados: 2, total: 5, iniciadaEm: new Date(), por: 'Privado' } : null })] }, c(['estoque.ver']))!;
    expect(w.estado).toBe('sem_base'); expect(w.valor.valor).toBeNull();
    expect(JSON.stringify(w)).not.toMatch(/Privado|centavos|financeir|itensSemCusto/);
    if (estado === 'EM_CONTAGEM') expect(w.contagem).toEqual({ contados: 2, total: 5 });
  });

  it('zero apurado do estoque aberto é válido e fonte de outra loja fica fora do DTO', () => {
    const b = estoque(); b.aberto = { ...b.aberto!, valorCentavos: 0, pendentes: 0, itensComSaldo: 0 };
    const a = estoque({ id: 'lojaa', nome: 'Loja A privada' });
    const w = estoqueAnalitico({ estado: 'lido', dados: [a, b] }, c(['estoque.ver', 'compras.ver']))!;
    expect(w.estado).toBe('ok'); expect(w.valor.valor).toBe(0);
    expect(JSON.stringify(w)).not.toMatch(/Loja A|12345/);
  });
});

describe('H2 · famílias operacionais e lacuna de Despesas explícitas', () => {
  it('Produção reaproveita apenas lista/sem lote de hoje, sem taxa/rendimento/custo', () => {
    const w = producaoAnalitica({ estado: 'lido', dados: [{ id: 'lojab', nome: 'Loja B', naLista: 4, semLote: 0 }] }, c(['producao.ver']))!;
    expect(w).toMatchObject({ familia: 'producao', valor: { unidade: 'contagem', valor: 4 }, naLista: 4, semLote: 0 });
    expect(w.detalhe.href).toBe('/erp/producao/lista/lojab?dia=2026-10-30');
    expect(w.percentual).toBeNull(); expect(JSON.stringify(w)).not.toMatch(/concluíd|rendimento|pontosBase|centavos/i);
  });

  it('Despesas é indisponível sem número e não oferece DRE para quem só lança despesa', () => {
    const w = despesasIndisponiveis(c(['despesas.lancar']))!;
    expect(w.estado).toBe('indisponivel'); expect(w.valor.valor).toBeNull(); expect(w.origem).toBeNull();
    expect(w.detalhe.href).toBe('/erp/dre/despesas?loja=lojab');
    expect(w.avisos[0].texto).not.toMatch(/composição|implement|definida/);
    expect(despesasIndisponiveis(c([]))).toBeNull();
  });
});
