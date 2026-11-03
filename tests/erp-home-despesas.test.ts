import { beforeEach, describe, expect, it, vi } from 'vitest';
import { montarDre, type DespesaApropriada, type LinhaDoDre } from '@/lib/erp/dre-campos';
import { CODIGO, PLANO_PADRAO, planoEfetivo, type LinhaDoBanco } from '@/lib/erp/dre-plano';
import { dreDaFotografia, linhasParaGravar } from '@/lib/erp/dre-fechamento-campos';
import { resolverAlcance, type Alcance, type Permissao } from '@/lib/erp/permissoes';
import type { CmvDoDre } from '@/lib/erp/cmv-campos';
import type { RecorrenteEmFalta } from '@/lib/erp/despesas';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import { dreDoPeriodo, type DreDoPeriodo } from '@/lib/erp/dre';
import type { ContextoHomeLoja } from '@/lib/erp/home-analitico';
import type { LeituraDoDreParaHome } from '@/lib/erp/home-cmv';
import { despesasDaHome, GRUPOS_DAS_DESPESAS_DA_HOME, type WidgetDespesasHome } from '@/lib/erp/home-despesas';
import { painelDoDia } from '@/lib/erp/painel-do-dia';
import { obterMes } from '@/lib/erp/faturamento';
import { situacaoDoEstoque } from '@/lib/erp/estoque';
import { saudeDoCardapio } from '@/lib/erp/saude-do-cardapio';
import { lojasDaListaDoDia } from '@/lib/erp/producao-lista';
import { lerComprasDaHome } from '@/lib/erp/home-compras';

// O adaptador é puro: o serviço do DRE só existe aqui como espião da orquestração (uma leitura, compartilhada com o CMV).
vi.mock('@/lib/erp/dre', () => ({ dreDoPeriodo: vi.fn() }));
vi.mock('@/lib/erp/compras-relatorio', () => ({ resolverRecorte: vi.fn(), totaisDoRecorte: vi.fn() }));
vi.mock('@/lib/erp/home-compras', async (original) => ({ ...await original<typeof import('@/lib/erp/home-compras')>(), lerComprasDaHome: vi.fn() }));
vi.mock('@/lib/erp/faturamento', () => ({ obterMes: vi.fn() }));
vi.mock('@/lib/erp/estoque', () => ({ situacaoDoEstoque: vi.fn() }));
vi.mock('@/lib/erp/saude-do-cardapio', () => ({ saudeDoCardapio: vi.fn() }));
vi.mock('@/lib/erp/producao-lista', () => ({ lojasDaListaDoDia: vi.fn() }));
vi.mock('@/lib/db', () => { throw new Error('Esta suíte não acessa banco.'); });

const HOJE = '2026-10-29';
const consulta = '2026-10-29T20:00:00.000Z';
const periodo = { inicio: '2026-10-01', fim: '2026-10-31', nome: 'Outubro de 2026' };
const loja = { id: 'lojab', nome: 'Loja B', ativa: true, canais: ['LOJA' as const, 'IFOOD' as const] };
const dono = resolverAlcance({ perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
const acesso = (permissoes: Permissao[], lojas: Alcance['lojas'] = ['lojab']): Alcance => ({ nivel: 'LOJA', lojas, permissoes: new Set(permissoes) });
const contexto = (alteracoes: Partial<ContextoHomeLoja> = {}): ContextoHomeLoja => ({
  alcance: dono, loja: { id: loja.id, nome: loja.nome }, raiz: '/erp', hoje: HOJE, consultadoEm: consulta, ...alteracoes,
});

// Plano gravado (com ids), uma linha criada pela casa e o IPTU oculto.
const plano = planoEfetivo([
  ...PLANO_PADRAO.map((p, i): LinhaDoBanco => ({ id: 'l-' + p.codigo, codigo: p.codigo, nome: p.nome, grupo: p.grupo, calculada: p.calculada, sentido: p.sentido, ordem: (i + 1) * 10, ativa: p.codigo !== 'iptu', atualizadoEm: new Date('2026-10-01T12:00:00.000Z') })),
  { id: 'seguro', codigo: null, nome: 'Seguro do ponto', grupo: 'ADMINISTRATIVA', calculada: false, sentido: 'MENOR_MELHOR', ordem: 999, ativa: true, atualizadoEm: new Date('2026-10-01T12:00:00.000Z') },
]);
const DESPESAS: DespesaApropriada[] = [
  { linhaId: 'l-aluguel', lojaId: 'lojab', centavos: 300_000 },
  { linhaId: 'l-salarios', lojaId: 'lojab', centavos: 500_000 },
  { linhaId: 'seguro', lojaId: 'lojab', centavos: 12_000 }, // linha da casa
  { linhaId: 'l-iptu', lojaId: 'lojab', centavos: 31_000 }, // linha oculta com valor
  { linhaId: 'l-tarifas', lojaId: 'lojab', centavos: 4_500 },
  { linhaId: 'l-impostos', lojaId: 'lojab', centavos: 40_000 }, // dedução: fora
  { linhaId: 'l-taxas-cartao', lojaId: 'lojab', centavos: 7_700 }, // dedução: fora
  { linhaId: 'l-energia', lojaId: null, centavos: 99_999 }, // rede sem loja: fora da loja
  { linhaId: 'l-aluguel', lojaId: 'lojaa', centavos: 777_777 }, // outra loja: fora
];
const ESPERADO = 300_000 + 500_000 + 12_000 + 31_000 + 4_500;
const cmvDaFixture: CmvDoDre = { lojas: [{ lojaId: 'lojab', lojaNome: 'Loja B', compraCentavos: 55_555, real: null, motivoSemReal: 'estoque não aberto' }], parcial: false };

function dre(alteracoes: Partial<DreDoPeriodo> = {}, despesas: DespesaApropriada[] = DESPESAS): DreDoPeriodo {
  const escopo = { tipo: 'loja', lojaId: loja.id, nome: loja.nome } as const;
  const resultado = montarDre({
    escopo, plano, despesas, cmv: cmvDaFixture, taxaIfood: { comissaoBp: 2300, pagamentoBp: 320 },
    receitas: [{ lojaId: loja.id, canal: 'LOJA', valorCentavos: 1_000_000 }, { lojaId: loja.id, canal: 'IFOOD', valorCentavos: 1_000_000 }],
  });
  return {
    periodo, hoje: '2026-11-01', ate: periodo.fim, emCurso: false, encerrado: true, diasDoPeriodo: 31, diaDeHoje: null,
    diasApurados: 31, status: null, escopo, resultado, porLoja: null, faltas: { total: 0 }, faltaLancar: [], taxaConfigurada: true,
    anterior: null, proximo: null, lojasDoEscopo: [loja], metas: {}, anoPassado: null, fechamento: null,
    cmv: { antigo: false, painel: null }, cmvDasLojas: cmvDaFixture, metaDoCmvDaLoja: null, lojasComMetaPropria: [], trocasDeCusto: [],
    farol: {} as DreDoPeriodo['farol'], farolAntigo: false, canais: [], ...alteracoes,
  };
}
const adaptar = (d: DreDoPeriodo, c = contexto()) => despesasDaHome({ estado: 'lido', dre: d }, c)!;
const linhaDe = (d: DreDoPeriodo, chave: string) => d.resultado.linhas.find((l) => l.chave === chave)!;
const grupo = (w: WidgetDespesasHome, g: string) => w.composicaoPorGrupo!.grupos.find((x) => x.grupo === g)!;
const fechado = (d: DreDoPeriodo): DreDoPeriodo => ({
  ...d, status: 'FECHADO', fechamento: {
    versao: 2, fotografiaId: 'fotografia-b', versaoDaConta: 5, fechadoEm: new Date('2026-11-02T12:00:00.000Z'),
    fechadoPorNome: 'Autor privado', ressalvas: [], totalDeRessalvas: 9, justificativa: 'Justificativa privada da rede',
  },
});
const recorrente = (alteracoes: Partial<RecorrenteEmFalta> = {}): RecorrenteEmFalta => ({
  origemId: 'origem-privada', mesAlvo: '2026-10', descricao: 'Contador privado', linhaNome: 'Contabilidade', linhaId: 'l-contabilidade',
  grupo: 'ADMINISTRATIVA', lojaId: 'lojab', lojaNome: 'Loja B', linhaOculta: false, valorCentavos: 654_321, vencimento: null, ...alteracoes,
});

describe('Despesas da Home · soma das linhas do DRE, conferida com os subtotais', () => {
  it('soma os oito grupos, com linha da casa e linha oculta com valor, e cada grupo é o subtotal do DRE', () => {
    const d = dre();
    const w = adaptar(d);
    expect(w).toMatchObject({ familia: 'despesas', titulo: 'Despesas', estado: 'ok', valor: { unidade: 'centavos', valor: ESPERADO }, percentual: null });
    expect(w.composicaoPorGrupo).toMatchObject({ estado: 'ok', base: 'competencia_sem_cmv_e_deducoes' });
    expect(w.composicaoPorGrupo!.grupos.map((g) => g.grupo)).toEqual([...GRUPOS_DAS_DESPESAS_DA_HOME]);
    for (const g of GRUPOS_DAS_DESPESAS_DA_HOME) expect(grupo(w, g).centavos, g).toBe(linhaDe(d, `grupo:${g}`).valorCentavos);
    expect(grupo(w, 'OCUPACAO')).toEqual({ grupo: 'OCUPACAO', rotulo: 'Ocupação', centavos: 331_000, comLancamento: true });
    expect(grupo(w, 'ADMINISTRATIVA')).toMatchObject({ centavos: 12_000, comLancamento: true });
    expect(grupo(w, 'FINANCEIRA')).toMatchObject({ rotulo: 'Financeiras', centavos: 4_500 });
    expect(grupo(w, 'MARKETING')).toEqual({ grupo: 'MARKETING', rotulo: 'Marketing', centavos: 0, comLancamento: false });
    expect(linhaDe(d, 'id:seguro')).toMatchObject({ tipo: 'linha', grupo: 'ADMINISTRATIVA', valorCentavos: 12_000 });
    expect(linhaDe(d, 'iptu')).toMatchObject({ tipo: 'linha', oculta: true, valorCentavos: 31_000 });
  });

  it('fica fora: CMV (e as duas linhas de detalhe), deduções manuais, taxa do iFood, rede sem loja e outra loja', () => {
    const d = dre();
    expect(linhaDe(d, CODIGO.cmv).valorCentavos).toBe(55_555);
    expect(linhaDe(d, CODIGO.taxasIfood).valorCentavos).toBe(262_000);
    expect(linhaDe(d, 'grupo:DEDUCAO').valorCentavos).toBe(40_000 + 7_700 + 262_000);
    const w = adaptar(d);
    expect(w.valor.valor).toBe(ESPERADO);
    expect(grupo(w, 'UTILIDADES')).toMatchObject({ centavos: 0, comLancamento: false });
    expect(w.composicaoPorGrupo!.grupos.map((g) => g.grupo)).not.toContain('DEDUCAO');
    expect(w.composicaoPorGrupo!.grupos.map((g) => g.grupo)).not.toContain('CMV');
    expect(JSON.stringify(w)).not.toMatch(/55555|262000|309700|40000|7700|99999|777777|Taxas do iFood|Impostos/);
  });

  it('nunca soma subtotal com linha: o total é exatamente a soma das linhas lançáveis', () => {
    const d = dre();
    const linhas = d.resultado.linhas.filter((l) => l.tipo === 'linha' && (GRUPOS_DAS_DESPESAS_DA_HOME as readonly string[]).includes(l.grupo));
    expect(adaptar(d).valor.valor).toBe(linhas.reduce((s, l) => s + l.valorCentavos!, 0));
  });

  it('preserva valores negativos com o sinal, sem limitar ou trocar por zero', () => {
    const d = dre({}, [{ linhaId: 'l-diversas', lojaId: 'lojab', centavos: -5_000 }, { linhaId: 'l-marketing', lojaId: 'lojab', centavos: 2_000 }]);
    const w = adaptar(d);
    expect(w.estado).toBe('ok');
    expect(w.valor.valor).toBe(-3_000);
    expect(grupo(w, 'OUTRAS')).toMatchObject({ centavos: -5_000, comLancamento: true });
  });

  it.each([
    ['subtotal adulterado', (d: DreDoPeriodo) => { linhaDe(d, 'grupo:PESSOAL').valorCentavos = 500_001; }],
    ['linha a mais sem subtotal', (d: DreDoPeriodo) => { d.resultado.linhas.push({ ...linhaDe(d, 'aluguel'), chave: 'id:intrusa' }); }],
    ['linha duplicada', (d: DreDoPeriodo) => { d.resultado.linhas.push({ ...linhaDe(d, 'salarios'), valorCentavos: 0 }); }],
    ['subtotal ausente', (d: DreDoPeriodo) => { d.resultado.linhas = d.resultado.linhas.filter((l) => l.chave !== 'grupo:MARKETING'); }],
    ['subtotal duplicado', (d: DreDoPeriodo) => { d.resultado.linhas.push({ ...linhaDe(d, 'grupo:OUTRAS') }); }],
    ['linha sem valor', (d: DreDoPeriodo) => { linhaDe(d, 'salarios').valorCentavos = null; }],
    ['valor não inteiro', (d: DreDoPeriodo) => { linhaDe(d, 'aluguel').valorCentavos = 300_000.5; linhaDe(d, 'grupo:OCUPACAO').valorCentavos = 331_000.5; }],
  ] as const)('%s: indisponível, nunca um número divergente', (_caso, adulterar) => {
    const d = dre();
    adulterar(d);
    const w = adaptar(d);
    expect(w.estado).toBe('indisponivel');
    expect(w.valor.valor).toBeNull();
    expect(w.composicaoPorGrupo).toEqual({ estado: 'indisponivel', base: 'competencia_sem_cmv_e_deducoes', grupos: [] });
    expect(w.avisos.map((a) => a.codigo)).toEqual(['despesas-divergentes']);
    expect(JSON.stringify(w)).not.toMatch(/847500|331000|500000|500001/);
  });
});

describe('Despesas da Home · estados honestos', () => {
  it('ate nulo (primeiro dia do período) é sem dados, nunca R$ 0,00', () => {
    const w = adaptar(dre({ hoje: periodo.inicio, emCurso: true, encerrado: false, ate: null, diasApurados: 0, diaDeHoje: 1 }, []));
    expect(w.estado).toBe('sem_dados');
    expect(w.valor.valor).toBeNull();
    expect(w.composicaoPorGrupo).toMatchObject({ estado: 'sem_dados', grupos: [] });
    expect(w.referencia?.apuradoAte).toBeNull();
    expect(w.avisos.map((a) => a.codigo)).toEqual(['nenhum-dia-apurado']);
  });

  it('todas as linhas sem valor é sem dados, não um total zero inventado', () => {
    const w = adaptar(dre({}, [{ linhaId: 'l-impostos', lojaId: 'lojab', centavos: 40_000 }, { linhaId: 'l-energia', lojaId: null, centavos: 10_000 }]));
    expect(w.estado).toBe('sem_dados');
    expect(w.valor.valor).toBeNull();
    expect(w.composicaoPorGrupo!.grupos).toEqual([]);
    expect(w.avisos.map((a) => a.codigo)).toEqual(['despesas-sem-lancamento']);
  });

  it('período em curso é parcial, com corte até ontem e cobertura de dias', () => {
    const w = adaptar(dre({ hoje: HOJE, emCurso: true, encerrado: false, ate: '2026-10-28', diasApurados: 28, diaDeHoje: 29 }));
    expect(w.estado).toBe('parcial');
    expect(w.valor.valor).toBe(ESPERADO);
    expect(w.referencia).toEqual({ base: 'periodo_apuracao', rotulo: periodo.nome, inicio: periodo.inicio, fim: periodo.fim, apuradoAte: '2026-10-28' });
    expect(w.cobertura).toEqual({ lojasIncluidas: ['lojab'], lojasElegiveis: 1, diasApurados: 28, diasDoPeriodo: 31, faltasDeFaturamento: null, custosDoEstoque: null });
    expect(w.avisos.map((a) => a.codigo)).toEqual(['periodo-em-curso']);
  });

  it('recorrente da loja sem o mês lançado (faltaLancar) é parcial, só com a contagem; a da rede e a de outra loja não contam', () => {
    const d = dre({ faltaLancar: [recorrente(), recorrente({ origemId: 'rede', lojaId: null, lojaNome: null }), recorrente({ origemId: 'a', lojaId: 'lojaa', lojaNome: 'Loja A privada' })] });
    const w = adaptar(d);
    expect(w.estado).toBe('parcial');
    expect(w.valor.valor).toBe(ESPERADO);
    expect(w.recorrentesSemLancamento).toBe(1);
    expect(w.avisos.map((a) => a.codigo)).toEqual(['recorrentes-sem-lancamento']);
    expect(w.avisos[0].texto).toContain('Uma despesa que repete todo mês');
    expect(JSON.stringify(w)).not.toMatch(/Contador privado|654321|origem-privada|Loja A privada/);
    d.faltaLancar.push(recorrente({ origemId: 'outra' }));
    expect(adaptar(d).avisos[0].texto).toContain('2 despesas que repetem todo mês');
  });

  it('fechado: lido da fotografia, com metadados, sem autoria/justificativa e sem recalcular', () => {
    const vivo = dre();
    const escopo = { tipo: 'loja', lojaId: loja.id, nome: 'Nome da época' } as const;
    // A fotografia real: linhas gravadas do DRE montado → dreDaFotografia, sem recalcular nada.
    const resultado = dreDaFotografia(linhasParaGravar(vivo.resultado, loja.id, 'Nome da época', () => null), escopo);
    const d = fechado({ ...vivo, escopo, resultado, faltaLancar: [recorrente()] });
    const antes = JSON.stringify(d);
    const w = adaptar(d, contexto({ loja: { id: loja.id, nome: 'Nome atual diferente' } }));
    expect(w.estado).toBe('ok');
    expect(w.valor.valor).toBe(ESPERADO);
    expect(w.escopo.nome).toBe('Nome da época');
    expect(w.recorrentesSemLancamento).toBeNull();
    expect(w.origem).toEqual({ fonte: 'dre', modo: 'fotografia', fotografia: { id: 'fotografia-b', versao: 2, versaoDaConta: 5, fechadaEm: '2026-11-02T12:00:00.000Z' } });
    expect(JSON.stringify(w)).not.toMatch(/Autor privado|Justificativa privada|totalDeRessalvas/);
    expect(JSON.stringify(d)).toBe(antes);
  });

  it('fechado com ressalva de recorrente desta loja é parcial; ressalvas de outra loja/rede não entram nem vazam', () => {
    const d = fechado(dre());
    d.fechamento!.ressalvas = [
      { id: 'rec-a', tipo: 'RECORRENTE', lojaId: 'lojaa', lojaNome: 'Loja A privada', titulo: 'Privado A', detalhe: 'Segredo A' },
      { id: 'rec-rede', tipo: 'RECORRENTE', lojaId: null, lojaNome: null, titulo: 'Rede privada', detalhe: 'Segredo rede' },
      { id: 'est-b', tipo: 'ESTOQUE', lojaId: 'lojab', lojaNome: 'Loja B', titulo: 'Estoque privado', detalhe: 'Segredo estoque' },
    ];
    expect(adaptar(d).estado).toBe('ok');
    d.fechamento!.ressalvas.push({ id: 'rec-b', tipo: 'RECORRENTE', lojaId: 'lojab', lojaNome: 'Loja B', titulo: 'Aluguel privado', detalhe: 'Não copiar', valorCentavos: 123_456 });
    const w = adaptar(d);
    expect(w.estado).toBe('parcial');
    expect(w.avisos.map((a) => a.codigo)).toEqual(['fechado-com-ressalva-recorrente']);
    expect(JSON.stringify(w)).not.toMatch(/Privado|Segredo|Aluguel privado|Não copiar|123456|Loja A/);
  });

  it('FECHADO sem fotografia não usa a leitura viva', () => {
    const w = adaptar(dre({ status: 'FECHADO' }));
    expect(w.estado).toBe('indisponivel');
    expect(w.valor.valor).toBeNull();
  });
});

describe('Despesas da Home · permissão, escopo e falhas', () => {
  const protegida = () => Object.defineProperty({ estado: 'lido' }, 'dre', { get: () => { throw new Error('não ler payload protegido'); } }) as LeituraDoDreParaHome;

  it('sem dre.ver e com despesas.lancar: o marcador antigo, sem valor e sem olhar a leitura', () => {
    const w = despesasDaHome(protegida(), contexto({ alcance: acesso(['despesas.lancar']) }))!;
    expect(w).toMatchObject({ familia: 'despesas', estado: 'indisponivel', valor: { unidade: 'centavos', valor: null }, origem: null, referencia: null, cobertura: null });
    expect(w).not.toHaveProperty('composicaoPorGrupo');
    expect(w).not.toHaveProperty('recorrentesSemLancamento');
    expect(w.detalhe.href).toBe('/erp/dre/despesas?loja=lojab');
    expect(w.avisos.map((a) => a.codigo)).toEqual(['despesas-sem-contrato']);
  });

  it('sem dre.ver nem despesas.lancar, ou loja fora do alcance: omitido', () => {
    expect(despesasDaHome(protegida(), contexto({ alcance: acesso(['faturamento.ver', 'compras.ver', 'precos.ver']) }))).toBeNull();
    expect(despesasDaHome(protegida(), contexto({ alcance: acesso(['dre.ver', 'despesas.lancar'], ['lojaa']) }))).toBeNull();
  });

  it('o marcador não carrega nenhum valor do DRE lido, mesmo que a leitura exista', () => {
    const w = despesasDaHome({ estado: 'lido', dre: dre() }, contexto({ alcance: acesso(['despesas.lancar']) }))!;
    expect(JSON.stringify(w)).not.toMatch(/300000|500000|847500|centavos":\d|Ocupação|Pessoal/);
  });

  it.each(['rede', 'outra-loja', 'resultado-outra-loja', 'metadados-multiloja'] as const)('escopo %s: card omitido, nunca valor de rede como se fosse da loja', (caso) => {
    const d = dre();
    if (caso === 'rede') d.escopo = { tipo: 'rede' };
    if (caso === 'outra-loja') d.escopo = { tipo: 'loja', lojaId: 'lojaa', nome: 'Loja A protegida' };
    if (caso === 'resultado-outra-loja') d.resultado.escopo = { tipo: 'rede' };
    if (caso === 'metadados-multiloja') d.lojasDoEscopo.push({ ...loja, id: 'lojaa', nome: 'Loja A protegida' });
    expect(despesasDaHome({ estado: 'lido', dre: d }, contexto())).toBeNull();
  });

  it.each(['https://fora.test/erp', '//fora.test/erp', '/rodolfo/erp/outro/fora', '/erp/'] as const)('raiz %s recusada', (raiz) => {
    expect(despesasDaHome({ estado: 'lido', dre: dre() }, contexto({ raiz }))).toBeNull();
  });

  it('link de detalhe: DRE da loja no mesmo período, também no espelho N1', () => {
    const url = new URL(adaptar(dre()).detalhe.href, 'https://local.test');
    expect(url.pathname).toBe('/erp/dre');
    expect(url.searchParams.get('loja')).toBe('lojab');
    expect(url.searchParams.get('periodo')).toBe(periodo.inicio);
    const n1 = new URL(adaptar(dre(), contexto({ raiz: '/rodolfo/erp/casa-alfa' })).detalhe.href, 'https://local.test');
    expect(n1.pathname).toBe('/rodolfo/erp/casa-alfa/dre');
    expect(adaptar(dre()).detalhe.rotulo).toBe('Ver as despesas no DRE da loja');
  });

  it.each(['erro', 'indisponivel'] as const)('%s não transporta razão, erro bruto ou metadado', (estado) => {
    const payload = { estado, reason: new Error('SQL Prisma segredo-tabela'), dados: { valor: 999 } } as unknown as LeituraDoDreParaHome;
    const w = despesasDaHome(payload, contexto())!;
    expect(w.estado).toBe(estado);
    expect(w.valor.valor).toBeNull();
    expect(w.origem).toBeNull();
    expect(w.referencia).toBeNull();
    expect(w.composicaoPorGrupo).toMatchObject({ estado, grupos: [] });
    expect(w.detalhe.href).toBe('/erp/dre?loja=lojab');
    expect(JSON.stringify(w)).not.toMatch(/SQL|Prisma|segredo|999/);
  });

  it('leitura nula é indisponível; o DTO é serializável e usa a hora da consulta', () => {
    expect(despesasDaHome({ estado: 'lido', dre: null }, contexto())?.estado).toBe('indisponivel');
    const w = adaptar(dre());
    expect(w.consultadoEm).toBe(consulta);
    expect(JSON.parse(JSON.stringify(w))).toEqual(w);
  });
});

// ------------------------------------------------------------------ orquestração (fontes simuladas)

const cliente = { marcaSintetica: 'cliente-privado' } as unknown as ClienteDoParceiro;
const visao = { tipo: 'loja', lojaId: 'lojab', nome: 'Loja B' } as const;
const despesasDoPainel = (p: Awaited<ReturnType<typeof painelDoDia>>) => p.analitico?.tipo === 'loja' ? p.analitico.widgets.find((w) => w.familia === 'despesas') as WidgetDespesasHome | undefined : undefined;

describe('Despesas na Home · servidor (uma leitura do DRE, com o CMV)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(lerComprasDaHome).mockResolvedValue(null);
    vi.mocked(dreDoPeriodo).mockResolvedValue(dre({ hoje: HOJE, emCurso: true, encerrado: false, ate: '2026-10-28', diasApurados: 28, diaDeHoje: 29 }));
    vi.mocked(obterMes).mockResolvedValue(null as unknown as Awaited<ReturnType<typeof obterMes>>);
    vi.mocked(saudeDoCardapio).mockResolvedValue({ pratos: 0, prontos: 0, custoIncompleto: 0 } as Awaited<ReturnType<typeof saudeDoCardapio>>);
    vi.mocked(situacaoDoEstoque).mockResolvedValue([]);
    vi.mocked(lojasDaListaDoDia).mockResolvedValue([]);
  });

  it('dre.ver: o card sai da MESMA leitura do CMV, sem consulta nova', async () => {
    const p = await painelDoDia(cliente, acesso(['dre.ver']), '/erp', HOJE, visao);
    expect(dreDoPeriodo).toHaveBeenCalledTimes(1);
    const w = despesasDoPainel(p)!;
    expect(w).toMatchObject({ estado: 'parcial', valor: { valor: ESPERADO } });
    expect(w.consultadoEm).toBe(p.consultadoEm);
    expect(p.cmv?.valor.valor).toBe(55_555);
  });

  it('despesas.lancar sem dre.ver: marcador, nenhuma leitura do DRE e nenhum valor de despesa no DTO', async () => {
    const p = await painelDoDia(cliente, acesso(['despesas.lancar']), '/erp', HOJE, visao);
    expect(dreDoPeriodo).not.toHaveBeenCalled();
    const w = despesasDoPainel(p)!;
    expect(w).toMatchObject({ estado: 'indisponivel', valor: { valor: null } });
    expect(w).not.toHaveProperty('composicaoPorGrupo');
    expect(p).not.toHaveProperty('cmv');
    expect(JSON.stringify(p)).not.toMatch(/300000|500000|847500|"grupos"|Ocupação/);
  });

  it('sem nenhuma das duas: card omitido', async () => {
    const p = await painelDoDia(cliente, acesso(['faturamento.ver', 'estoque.ver']), '/erp', HOJE, visao);
    expect(despesasDoPainel(p)).toBeUndefined();
    expect(dreDoPeriodo).not.toHaveBeenCalled();
  });

  it('Rede Completa não recebe despesas da loja nem consolidação', async () => {
    const p = await painelDoDia(cliente, dono, '/erp', HOJE, { tipo: 'rede' });
    expect(p.analitico).toEqual({ tipo: 'rede' });
    expect(dreDoPeriodo).not.toHaveBeenCalled();
  });

  it('falha da leitura do DRE: Despesas e CMV em erro, sem razão interna', async () => {
    vi.mocked(dreDoPeriodo).mockRejectedValueOnce(new Error('Prisma SQL tabela-privada'));
    const p = await painelDoDia(cliente, acesso(['dre.ver']), '/erp', HOJE, visao);
    expect(despesasDoPainel(p)).toMatchObject({ estado: 'erro', valor: { valor: null } });
    expect(p.cmv?.estado).toBe('erro');
    expect(JSON.stringify(p)).not.toMatch(/Prisma|SQL|tabela-privada/);
  });

  it('falha só da projeção das despesas não derruba o CMV nem os outros cards', async () => {
    const d = dre({ hoje: HOJE, emCurso: true, encerrado: false, ate: '2026-10-28', diasApurados: 28, diaDeHoje: 29 });
    Object.defineProperty(d, 'faltaLancar', { get: () => { throw new Error('DADO_PRIVADO'); } });
    vi.mocked(dreDoPeriodo).mockResolvedValue(d);
    const p = await painelDoDia(cliente, acesso(['dre.ver', 'producao.ver']), '/erp', HOJE, visao);
    expect(despesasDoPainel(p)).toMatchObject({ estado: 'erro', valor: { valor: null } });
    expect(p.cmv).toMatchObject({ valor: { valor: 55_555 } });
    expect(p.analitico?.tipo === 'loja' && p.analitico.widgets.map((w) => w.familia)).toEqual(['cmv', 'despesas', 'producao']);
    expect(JSON.stringify(p)).not.toContain('DADO_PRIVADO');
  });

  it('subtotal divergente deixa só as despesas indisponíveis; o CMV continua', async () => {
    const d = dre({ hoje: HOJE, emCurso: true, encerrado: false, ate: '2026-10-28', diasApurados: 28, diaDeHoje: 29 });
    (d.resultado.linhas.find((l) => l.chave === 'grupo:OCUPACAO') as LinhaDoDre).valorCentavos = 1;
    vi.mocked(dreDoPeriodo).mockResolvedValue(d);
    const p = await painelDoDia(cliente, acesso(['dre.ver']), '/erp', HOJE, visao);
    expect(despesasDoPainel(p)).toMatchObject({ estado: 'indisponivel', valor: { valor: null } });
    expect(p.cmv?.valor.valor).toBe(55_555);
  });
});
