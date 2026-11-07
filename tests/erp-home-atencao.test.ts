/**
 * Decisão 518 · pontos de atenção da Home, sem banco: a volta da Home (a mesma regra da 517), a classificação de cada
 * pendência em "Completar dados" ou "Resolver operação" sem mudar a regra delas, o piloto do faturamento (permissão de lançar,
 * leitura confirmada ou não conferida, mês corrente e mês anterior) e a apresentação em dois grupos no mesmo painel, sem faixa
 * nova nem ordem nova.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import { resolverAlcance, type Alcance, type Permissao } from '@/lib/erp/permissoes';
import { obterMes } from '@/lib/erp/faturamento';
import { situacaoDoEstoque } from '@/lib/erp/estoque';
import { lojasDaListaDoDia } from '@/lib/erp/producao-lista';
import { saudeDoCardapio } from '@/lib/erp/saude-do-cardapio';
import { dreDoPeriodo } from '@/lib/erp/dre';
import { lerComprasDaHome } from '@/lib/erp/home-compras';
import { painelDoDia, type PendenciaDoDia } from '@/lib/erp/painel-do-dia';
import { comVoltaParaAHome, voltaDaComposicao, voltaParaAHome } from '@/lib/erp/volta';
import { PainelDoDiaNaTela, PendenciasDoResumo } from '@/components/erp/telas/painel-do-dia';
import type { XmlAguardandoHome } from '@/lib/erp/home-xml-aguardando';

vi.mock('@/lib/erp/faturamento', () => ({ obterMes: vi.fn() }));
vi.mock('@/lib/erp/estoque', () => ({ situacaoDoEstoque: vi.fn() }));
vi.mock('@/lib/erp/producao-lista', () => ({ lojasDaListaDoDia: vi.fn() }));
vi.mock('@/lib/erp/saude-do-cardapio', () => ({ saudeDoCardapio: vi.fn() }));
vi.mock('@/lib/erp/dre', () => ({ dreDoPeriodo: vi.fn() }));
vi.mock('@/lib/erp/compras-relatorio', () => ({ resolverRecorte: vi.fn(), totaisDoRecorte: vi.fn() }));
vi.mock('@/lib/erp/home-compras', async (original) => ({ ...await original<typeof import('@/lib/erp/home-compras')>(), lerComprasDaHome: vi.fn() }));
vi.mock('@/lib/erp/home-xml-aguardando', async (original) => ({ ...await original<typeof import('@/lib/erp/home-xml-aguardando')>(), lerXmlAguardandoDaHome: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

const HOJE = '2026-10-29';
/** Só o que a Home lê do banco sem mock: os períodos fechados (a mesma leitura com que `lancarDia` recusa). */
const periodos = vi.fn();
const cliente = { periodoApuracao: { findMany: periodos } } as unknown as ClienteDoParceiro;
const emLeitura = { somenteLeitura: true, periodoApuracao: { findMany: periodos } } as unknown as ClienteDoParceiro;
const visao = { tipo: 'loja', lojaId: 'lojab', nome: 'Loja B' } as const;
const dono = resolverAlcance({ perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
const so = (...permissoes: Permissao[]): Alcance => ({ nivel: 'LOJA', lojas: ['lojab'], permissoes: new Set(permissoes) });
/** O mês lido: as faltas espalhadas em dias seguidos a partir do dia 1 (um canal por dia, três canais por dia no máximo). */
const faturamento = (mes: string, faltas: number) => {
  const dias = Array.from({ length: Math.ceil(faltas / 3) }, (_, i) => ({
    data: `${mes}-${String(i + 1).padStart(2, '0')}`, total: { valorCentavos: 700_000 },
    faltam: ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'].slice(0, Math.min(3, faltas - i * 3)),
  }));
  return {
    lojas: [{ loja: { id: 'lojab', nome: 'Loja B' }, dias: dias.length ? dias : [{ data: `${mes}-28`, total: { valorCentavos: 700_000 }, faltam: [] }] }],
    total: { valorCentavos: 700_000, pedidos: 70 }, faltas,
  } as unknown as Awaited<ReturnType<typeof obterMes>>;
};
/** Faltas por mês lido; o mês anterior começa completo para os testes do mês corrente. */
const faltasPorMes = (porMes: Record<string, number>) => vi.mocked(obterMes).mockImplementation(async (_c, _a, f) => faturamento(f.mes, porMes[f.mes] ?? 0));
const pendencia = (ps: readonly PendenciaDoDia[], chave = 'faturamento-faltas') => ps.find((p) => p.chave === chave);
const anterior = (ps: readonly PendenciaDoDia[]) => pendencia(ps, 'faturamento-faltas-mes-anterior');
const htmlDe = (pendencias: readonly PendenciaDoDia[], xmlAguardando?: XmlAguardandoHome) => renderToStaticMarkup(createElement(PendenciasDoResumo, { pendencias, xmlAguardando })).replace(/ /g, ' ');
const TEXTO_DO_MES = 'Conta um para cada canal que a loja vende, em cada dia que ficou sem lançamento. Enquanto faltar, o faturamento e o DRE deste mês ficam incompletos.';

beforeEach(() => {
  vi.resetAllMocks();
  periodos.mockResolvedValue([]);
  vi.mocked(dreDoPeriodo).mockResolvedValue(null);
  vi.mocked(lerComprasDaHome).mockResolvedValue(null);
  faltasPorMes({ '2026-10': 3 });
  vi.mocked(saudeDoCardapio).mockResolvedValue({ pratos: 2, prontos: 1, custoIncompleto: 1 } as Awaited<ReturnType<typeof saudeDoCardapio>>);
  vi.mocked(situacaoDoEstoque).mockResolvedValue([{ id: 'lojab', nome: 'Loja B', ativa: true, estado: 'EM_CONTAGEM', contagem: { contados: 1, total: 4 }, aberto: null, verValores: false }] as unknown as Awaited<ReturnType<typeof situacaoDoEstoque>>);
  vi.mocked(lojasDaListaDoDia).mockResolvedValue([{ id: 'lojab', naLista: 2, semLote: 1 }] as unknown as Awaited<ReturnType<typeof lojasDaListaDoDia>>);
});

describe('Volta da Home (decisão 518 reaproveita a regra da 517, sem afrouxar)', () => {
  it('só a Home exata da área; a composição do DRE continua com a mesma função', () => {
    expect(voltaDaComposicao).toBe(voltaParaAHome);
    expect(voltaParaAHome('/erp', '/erp')).toEqual({ href: '/erp', rotulo: 'o início' });
    expect(voltaParaAHome('/rodolfo/erp/casa-alfa', '/rodolfo/erp/casa-alfa')).toEqual({ href: '/rodolfo/erp/casa-alfa', rotulo: 'o início' });
    for (const v of ['/erp/', '/erp?sem-acesso=1', '/%65rp', '/erp/faturamento', 'https://fora.test/erp', '//erp', '/rodolfo/erp/casa-alfa', ' /erp', undefined, ['/erp'], ['/erp', '/erp']]) {
      expect(voltaParaAHome(v, '/erp'), String(v)).toBeNull();
    }
  });

  it('leva adiante só a volta conferida (tipo marcado), com ? ou &', () => {
    const volta = voltaParaAHome('/erp', '/erp');
    expect(comVoltaParaAHome('/erp/faturamento/l1/2026-10-15', volta)).toBe('/erp/faturamento/l1/2026-10-15?volta=%2Ferp');
    expect(comVoltaParaAHome('/erp/faturamento?mes=2026-10&loja=l1', volta)).toBe('/erp/faturamento?mes=2026-10&loja=l1&volta=%2Ferp');
    expect(comVoltaParaAHome('/erp/faturamento?mes=2026-10', null)).toBe('/erp/faturamento?mes=2026-10');
    expect(comVoltaParaAHome('/x', voltaParaAHome('/rodolfo/erp/a-b', '/rodolfo/erp/a-b'))).toBe('/x?volta=%2Frodolfo%2Ferp%2Fa-b');
    // @ts-expect-error um `{ href }` montado à mão (da URL ou do formulário) não é volta conferida.
    expect(comVoltaParaAHome('/x', { href: 'https://fora.test' })).toBe('/x?volta=https%3A%2F%2Ffora.test');
  });
});

describe('Classificação: completar dados ou resolver operação, sem mudar a regra de cada pendência', () => {
  it.each(['cardapio', 'estoque', 'producao'] as const)('falha em %s fica não conferida até uma consulta válida; outras fontes continuam', async (fonte) => {
    const leitura = { cardapio: vi.mocked(saudeDoCardapio), estoque: vi.mocked(situacaoDoEstoque), producao: vi.mocked(lojasDaListaDoDia) }[fonte];
    leitura.mockRejectedValueOnce(new Error('SQL segredo-interno'));
    const falhou = await painelDoDia(cliente, dono, '/erp', HOJE, visao);
    const p = falhou.pendencias.find((p) => p.chave === `${fonte}-nao-conferido`)!;
    expect(p).toMatchObject({ leitura: 'nao_conferida', escopo: fonte === 'cardapio' ? 'Da rede' : 'Loja B' });
    expect(p.href).toMatch(/^\/erp\//);
    expect(htmlDe(falhou.pendencias)).toContain('Não conferido');
    expect(JSON.stringify(falhou) + htmlDe(falhou.pendencias)).not.toMatch(/SQL|segredo-interno/);
    expect(falhou.indicadores.some((i) => i.chave === 'faturamento')).toBe(true);
    const recuperou = await painelDoDia(cliente, dono, '/erp', HOJE, visao);
    expect(recuperou.pendencias.some((p) => p.chave === `${fonte}-nao-conferido`)).toBe(false);
    expect(recuperou.pendencias.some((p) => p.chave.startsWith(fonte))).toBe(true);
  });

  it('fonte operacional negada não é consultada e não gera alerta de erro ou link', async () => {
    vi.mocked(saudeDoCardapio).mockRejectedValue(new Error('não ler'));
    vi.mocked(situacaoDoEstoque).mockRejectedValue(new Error('não ler'));
    vi.mocked(lojasDaListaDoDia).mockRejectedValue(new Error('não ler'));
    const p = await painelDoDia(cliente, so('faturamento.ver'), '/erp', HOJE, visao);
    for (const f of [saudeDoCardapio, situacaoDoEstoque, lojasDaListaDoDia]) expect(f).not.toHaveBeenCalled();
    expect(p.pendencias.every((p) => p.chave.startsWith('faturamento'))).toBe(true);
  });

  it('cada chave existente tem a sua natureza, na ordem de sempre', async () => {
    const loja = await painelDoDia(cliente, dono, '/erp', HOJE, visao);
    expect(loja.pendencias.map((p) => [p.chave, p.natureza])).toEqual([
      ['faturamento-faltas', 'completar_dados'],
      ['cardapio-custo', 'completar_dados'],
      ['estoque-contagem', 'resolver_operacao'],
      ['producao-sem-lote', 'resolver_operacao'],
    ]);
    vi.mocked(saudeDoCardapio).mockResolvedValueOnce({ pratos: 2, prontos: 1, custoIncompleto: 0 } as Awaited<ReturnType<typeof saudeDoCardapio>>);
    vi.mocked(situacaoDoEstoque).mockResolvedValueOnce([
      { id: 'lojaa', nome: 'Loja A', ativa: true, estado: 'NAO_ABERTO', contagem: null, aberto: null, verValores: false },
    ] as unknown as Awaited<ReturnType<typeof situacaoDoEstoque>>);
    faltasPorMes({ '2026-10': 3, '2026-09': 2 });
    const rede = await painelDoDia(cliente, dono, '/erp', HOJE, { tipo: 'rede' });
    expect(rede.pendencias.map((p) => [p.chave, p.natureza])).toEqual([
      ['faturamento-faltas', 'completar_dados'],
      ['faturamento-faltas-mes-anterior', 'completar_dados'],
      ['cardapio-preco', 'completar_dados'],
      ['estoque-abrir', 'resolver_operacao'],
    ]);
    // Sem score: nenhuma pendência ganha número de prioridade, impacto ou idade.
    expect(JSON.stringify([...loja.pendencias, ...rede.pendencias])).not.toMatch(/"(score|peso|impacto|prioridade|idade|desde|criadaEm)"/);
  });

  it('nenhuma pendência do ERP sai sem natureza, em nenhum cenário (sucesso, erro, sem permissão, rede, nível 1)', async () => {
    const cenarios: (() => Promise<{ pendencias: PendenciaDoDia[] }>)[] = [
      () => painelDoDia(cliente, dono, '/erp', HOJE, visao),
      () => painelDoDia(cliente, dono, '/rodolfo/erp/casa-alfa', HOJE, { tipo: 'rede' }),
      () => painelDoDia(emLeitura, so('faturamento.ver', 'estoque.ver', 'producao.ver'), '/erp', HOJE, visao),
      async () => {
        vi.mocked(obterMes).mockRejectedValueOnce(new Error('x')).mockRejectedValueOnce(new Error('y'));
        vi.mocked(situacaoDoEstoque).mockResolvedValueOnce([{ id: 'lojab', nome: 'Loja B', ativa: true, estado: 'NAO_ABERTO', contagem: null, aberto: null, verValores: false }] as unknown as Awaited<ReturnType<typeof situacaoDoEstoque>>);
        return painelDoDia(cliente, dono, '/erp', HOJE, visao);
      },
      async () => { faltasPorMes({ '2026-10': 1, '2026-09': 4 }); return painelDoDia(cliente, dono, '/erp', HOJE, visao); },
    ];
    let vistas = 0;
    for (const ler of cenarios) {
      for (const p of (await ler()).pendencias) {
        vistas++;
        expect(['completar_dados', 'resolver_operacao'], p.chave).toContain(p.natureza);
      }
    }
    expect(vistas).toBeGreaterThanOrEqual(12);
  });
});

describe('Piloto do faturamento: pendência da leitura, com permissão de lançar decidida no servidor', () => {
  it('quem lança: "Lançar o que falta", indicador afetado, leitura confirmada e a volta para a Home da área', async () => {
    expect(pendencia((await painelDoDia(cliente, dono, '/erp', HOJE, visao)).pendencias)).toEqual({
      chave: 'faturamento-faltas', escopo: 'Loja B', natureza: 'completar_dados', indicador: 'Faturamento de outubro', leitura: 'confirmada',
      titulo: '3 lançamentos faltando neste mês', texto: TEXTO_DO_MES,
      href: '/erp/faturamento?mes=2026-10&loja=lojab&volta=%2Ferp', acao: 'Lançar o que falta',
    });
    expect(pendencia((await painelDoDia(cliente, dono, '/rodolfo/erp/casa-alfa', HOJE, visao)).pendencias)?.href)
      .toBe('/rodolfo/erp/casa-alfa/faturamento?mes=2026-10&loja=lojab&volta=%2Frodolfo%2Ferp%2Fcasa-alfa');
    expect(pendencia((await painelDoDia(cliente, dono, '/erp', HOJE, { tipo: 'rede' })).pendencias)?.href).toBe('/erp/faturamento?mes=2026-10&rede=1&volta=%2Ferp');
    // Base que não é a Home de uma área não vira volta (o link fica como era).
    expect(pendencia((await painelDoDia(cliente, dono, '/erp/', HOJE, visao)).pendencias)?.href).toBe('/erp//faturamento?mes=2026-10&loja=lojab');
  });

  it('indicador e estado do faturamento abrem a mesma tela com a mesma volta (nunca dois Voltar diferentes)', async () => {
    const p = await painelDoDia(cliente, dono, '/erp', HOJE, { tipo: 'rede' });
    const href = '/erp/faturamento?mes=2026-10&rede=1&volta=%2Ferp';
    expect(p.indicadores.find((i) => i.chave === 'faturamento')?.href).toBe(href);
    expect(p.estados?.find((e) => e.chave === 'faturamento')).toMatchObject({ href, mensagem: '3 lançamentos faltando neste mês. O valor não está completo.' });
    vi.mocked(obterMes).mockRejectedValueOnce(new Error('falha'));
    expect((await painelDoDia(cliente, dono, '/erp', HOJE, visao)).estados?.find((e) => e.chave === 'faturamento')).toMatchObject({ estado: 'erro', href: '/erp/faturamento?mes=2026-10&loja=lojab&volta=%2Ferp' });
    const loja = await painelDoDia(cliente, dono, '/erp', HOJE, visao);
    if (loja.analitico?.tipo !== 'loja') throw new Error('Loja esperada.');
    expect(loja.analitico.widgets.find((w) => w.familia === 'faturamento')?.detalhe.href).toBe('/erp/faturamento?mes=2026-10&loja=lojab&volta=%2Ferp');
  });

  it('quem só vê, quem lança sem ver e o parceiro em leitura recebem "Ver o faturamento"; sem ver, nada', async () => {
    const leitor = pendencia((await painelDoDia(cliente, so('faturamento.ver'), '/erp', HOJE, visao)).pendencias)!;
    expect(leitor).toMatchObject({ acao: 'Ver o faturamento', leitura: 'confirmada', titulo: '3 lançamentos faltando neste mês' });
    expect(leitor.texto).toContain('Lançar é com quem tem “lançar faturamento” nesta loja.');
    const bloqueado = pendencia((await painelDoDia(emLeitura, dono, '/erp', HOJE, visao)).pendencias)!;
    expect(bloqueado).toMatchObject({ acao: 'Ver o faturamento' });
    expect(bloqueado.texto).toContain('Os lançamentos estão bloqueados agora');
    const redeLeitor = pendencia((await painelDoDia(cliente, { ...so('faturamento.ver'), lojas: 'todas' }, '/erp', HOJE, { tipo: 'rede' })).pendencias)!;
    expect(redeLeitor.texto).toContain('nas lojas.');
    const semVer = await painelDoDia(cliente, so('faturamento.lancar'), '/erp', HOJE, visao);
    // Duas leituras por Home autorizada (mês corrente e anterior); sem "ver faturamento", nenhuma.
    expect(obterMes).toHaveBeenCalledTimes(6);
    expect(JSON.stringify(semVer)).not.toMatch(/faturamento|Lançar/i);
  });

  it('sem falta na leitura válida: a pendência some e o estado fica ok, sem frase de resolvido', async () => {
    faltasPorMes({});
    const p = await painelDoDia(cliente, dono, '/erp', HOJE, visao);
    expect(pendencia(p.pendencias)).toBeUndefined();
    expect(anterior(p.pendencias)).toBeUndefined();
    expect(p.estados?.find((e) => e.chave === 'faturamento')?.estado).toBe('ok');
    expect(JSON.stringify(p)).not.toMatch(/resolvid|concluíd/i);
  });

  it('leitura que falha (rejeição ou exceção): "não conferida", sem número, sem "Lançar", sem detalhe interno', async () => {
    for (const falhar of [() => vi.mocked(obterMes).mockRejectedValueOnce(new Error('Prisma P1001 segredo')), () => vi.mocked(obterMes).mockImplementationOnce(() => { throw new Error('sincrona'); })]) {
      falhar();
      const p = await painelDoDia(cliente, dono, '/erp', HOJE, visao);
      expect(pendencia(p.pendencias)).toEqual({
        chave: 'faturamento-faltas', escopo: 'Loja B', natureza: 'completar_dados', leitura: 'nao_conferida', indicador: 'Faturamento de outubro', acao: 'Ver o faturamento',
        titulo: 'Lançamentos faltando neste mês: não deu para conferir agora', href: '/erp/faturamento?mes=2026-10&loja=lojab&volta=%2Ferp',
        texto: 'A consulta ao faturamento deste mês falhou. Isso não quer dizer que o mês esteja completo. Use Atualizar resumo para consultar de novo.',
      });
      expect(p.pendencias[0].chave).toBe('faturamento-faltas');
      expect(JSON.stringify(p)).not.toMatch(/Prisma|P1001|segredo|sincrona|Lançar o que falta/);
    }
  });
});

describe('Mês anterior (revisão da 518): a virada do mês não apaga a falta sem leitura que confirme', () => {
  it('em 01/11 o mês corrente ainda não tem falta (só até ontem) e outubro continua com a pendência própria, no mês dele', async () => {
    faltasPorMes({ '2026-10': 2 });
    const p = await painelDoDia(cliente, dono, '/erp', '2026-11-01', visao);
    expect(vi.mocked(obterMes).mock.calls.map((c) => c[2])).toEqual([{ mes: '2026-11', lojaId: 'lojab' }, { mes: '2026-10', lojaId: 'lojab' }]);
    expect(pendencia(p.pendencias)).toBeUndefined();
    expect(anterior(p.pendencias)).toEqual({
      chave: 'faturamento-faltas-mes-anterior', escopo: 'Loja B', natureza: 'completar_dados', indicador: 'Faturamento de outubro', leitura: 'confirmada',
      titulo: '2 lançamentos faltando em outubro', href: '/erp/faturamento?mes=2026-10&loja=lojab&volta=%2Ferp', acao: 'Lançar o que falta',
      texto: 'Conta um para cada canal que a loja vende, em cada dia que ficou sem lançamento. Enquanto faltar, o faturamento e o DRE de outubro ficam incompletos.',
    });
    // Rede, nível 1 e quem só vê: o mesmo recorte, a volta da área e sem prometer lançamento.
    expect(anterior((await painelDoDia(cliente, dono, '/rodolfo/erp/casa-alfa', '2026-11-01', { tipo: 'rede' })).pendencias)?.href)
      .toBe('/rodolfo/erp/casa-alfa/faturamento?mes=2026-10&rede=1&volta=%2Frodolfo%2Ferp%2Fcasa-alfa');
    expect(anterior((await painelDoDia(cliente, so('faturamento.ver'), '/erp', '2026-11-01', visao)).pendencias)).toMatchObject({ acao: 'Ver o faturamento' });
  });

  it('os dois meses com falta: duas pendências, a do mês corrente primeiro; em janeiro o ano aparece', async () => {
    faltasPorMes({ '2026-10': 4, '2026-09': 1 });
    const p = await painelDoDia(cliente, dono, '/erp', HOJE, visao);
    expect(p.pendencias.slice(0, 2).map((x) => x.titulo)).toEqual(['4 lançamentos faltando neste mês', '1 lançamento faltando em setembro']);
    faltasPorMes({ '2025-12': 2 });
    expect(anterior((await painelDoDia(cliente, dono, '/erp', '2026-01-02', visao)).pendencias)).toMatchObject({
      titulo: '2 lançamentos faltando em dezembro de 2025', indicador: 'Faturamento de dezembro de 2025', href: '/erp/faturamento?mes=2025-12&loja=lojab&volta=%2Ferp',
    });
  });

  it('dia em período fechado não conta (a action recusa lançar nele); tudo fechado, nenhuma pendência', async () => {
    faltasPorMes({ '2026-09': 5 });
    // Faltas em 01/09 (3) e 02/09 (2). Fechado de 01/09 a 01/09: sobram as 2 do dia 02.
    periodos.mockResolvedValueOnce([{ nome: 'Semana 1', inicio: new Date('2026-09-01T00:00:00.000Z'), fim: new Date('2026-09-01T00:00:00.000Z') }]);
    expect(anterior((await painelDoDia(cliente, dono, '/erp', HOJE, visao)).pendencias)).toMatchObject({ titulo: '2 lançamentos faltando em setembro' });
    expect(periodos).toHaveBeenCalledTimes(1);
    expect(periodos.mock.calls[0][0]).toMatchObject({ where: { status: 'FECHADO' } });
    periodos.mockResolvedValueOnce([{ nome: 'Setembro', inicio: new Date('2026-09-01T00:00:00.000Z'), fim: new Date('2026-09-30T00:00:00.000Z') }]);
    expect(anterior((await painelDoDia(cliente, dono, '/erp', HOJE, visao)).pendencias)).toBeUndefined();
    // Sem falta no mês anterior, nem consulta o período.
    faltasPorMes({ '2026-10': 3 });
    periodos.mockClear();
    await painelDoDia(cliente, dono, '/erp', HOJE, visao);
    expect(periodos).not.toHaveBeenCalled();
  });

  it('erro na leitura do mês anterior (faturamento ou período) = "não conferida", sem número, nunca some', async () => {
    vi.mocked(obterMes).mockImplementation(async (_c, _a, f) => { if (f.mes === '2026-10') throw new Error('Prisma segredo'); return faturamento(f.mes, 0); });
    const p = await painelDoDia(cliente, dono, '/erp', '2026-11-01', visao);
    expect(anterior(p.pendencias)).toEqual({
      chave: 'faturamento-faltas-mes-anterior', escopo: 'Loja B', natureza: 'completar_dados', indicador: 'Faturamento de outubro', leitura: 'nao_conferida', acao: 'Ver o faturamento',
      titulo: 'Lançamentos faltando em outubro: não deu para conferir agora', href: '/erp/faturamento?mes=2026-10&loja=lojab&volta=%2Ferp',
      texto: 'A consulta ao faturamento de outubro falhou. Isso não quer dizer que o mês esteja completo. Use Atualizar resumo para consultar de novo.',
    });
    // O mês corrente leu bem e não tem falta: ele não ganha pendência por causa do erro do anterior.
    expect(pendencia(p.pendencias)).toBeUndefined();
    expect(p.estados?.find((e) => e.chave === 'faturamento')?.estado).not.toBe('erro');
    expect(JSON.stringify(p)).not.toMatch(/Prisma|segredo/);
    // A leitura do período fechado também é parte da conta: se ela falha, também não conferido.
    faltasPorMes({ '2026-10': 2 });
    periodos.mockRejectedValueOnce(new Error('timeout'));
    expect(anterior((await painelDoDia(cliente, dono, '/erp', '2026-11-01', visao)).pendencias)).toMatchObject({ leitura: 'nao_conferida' });
  });
});

describe('Apresentação: dois grupos no mesmo painel, numeração contínua, nível 1 como antes', () => {
  const item = (chave: string, natureza?: PendenciaDoDia['natureza'], extra: Partial<PendenciaDoDia> = {}): PendenciaDoDia => ({
    chave, titulo: `Título ${chave}`, texto: `Texto ${chave}`, href: `/erp/${chave}`, acao: `Abrir ${chave}`, ...(natureza ? { natureza } : {}), ...extra,
  });

  it('agrupa na ordem das fontes, com rótulo de cada grupo e o mesmo título do painel', () => {
    const h = htmlDe([item('fat', 'completar_dados', { indicador: 'Faturamento de outubro' }), item('card', 'completar_dados'), item('est', 'resolver_operacao')]);
    expect(h).toContain('O que precisa de você');
    expect(h).toContain('O que falta registrar e o que falta fazer na casa');
    expect(h).not.toContain('Na ordem em que vale resolver');
    expect(h.indexOf('>Completar dados<')).toBeLessThan(h.indexOf('Título fat'));
    expect(h.indexOf('Título card')).toBeLessThan(h.indexOf('>Resolver operação<'));
    expect(h.indexOf('>Resolver operação<')).toBeLessThan(h.indexOf('Título est'));
    expect(h).toContain('<ol start="1"');
    expect(h).toContain('<ol start="3"');
    expect(h).toContain('Indicador afetado: Faturamento de outubro');
    expect(h.match(/role="group" aria-labelledby="pendencias-/g)).toHaveLength(2);
    // Sem faixa nova, gradiente, botão de resolver ou dispensar.
    expect(h).not.toMatch(/gradient|<button|Resolver agora|Dispensar|Marcar como/i);
  });

  it('grupo vazio não aparece; o XML da loja entra em Resolver operação', () => {
    const xml = { estado: 'ok', aguardando: 2, loja: { id: 'lojab', nome: 'Loja B' }, detalhe: { href: '/erp/compras/recebidas?loja=lojab', rotulo: 'Ver fila de notas recebidas' } } as unknown as XmlAguardandoHome;
    const so = htmlDe([], xml);
    expect(so).toContain('>Resolver operação<');
    expect(so).not.toContain('>Completar dados<');
    expect(so).toContain('2 XML aguardando conferência');
    const ambos = htmlDe([item('fat', 'completar_dados')], xml);
    expect(ambos.indexOf('Título fat')).toBeLessThan(ambos.indexOf('2 XML aguardando'));
    expect(ambos.indexOf('>Resolver operação<')).toBeLessThan(ambos.indexOf('2 XML aguardando'));
  });

  it('pendência não conferida mostra o selo e não promete o lançamento', () => {
    const h = htmlDe([item('faturamento-faltas', 'completar_dados', { leitura: 'nao_conferida', acao: 'Ver o faturamento', titulo: 'Lançamentos faltando neste mês: não deu para conferir agora' })]);
    expect(h).toContain('>Não conferido<');
    expect(h).toContain('Ver o faturamento');
    expect(h).not.toContain('Lançar o que falta');
  });

  it('sem classificação (painel do nível 1) ou mistura: lista única de antes', () => {
    const n1 = htmlDe([item('lote'), item('respostas')]);
    expect(n1).toContain('Na ordem em que vale resolver');
    expect(n1).not.toMatch(/Completar dados|Resolver operação|start=/);
    const misto = htmlDe([item('anterior'), item('fat', 'completar_dados')]);
    expect(misto).toContain('Na ordem em que vale resolver');
    expect(misto).not.toMatch(/Completar dados|Resolver operação/);
  });

  it('o resumo da rede (PainelDoDiaNaTela) usa os mesmos grupos', async () => {
    const p = await painelDoDia(cliente, dono, '/erp', HOJE, { tipo: 'rede' });
    const h = renderToStaticMarkup(createElement(PainelDoDiaNaTela, { painel: p })).replace(/ /g, ' ');
    expect(h).toContain('>Completar dados<');
    expect(h).toContain('>Resolver operação<');
    expect(h).toContain('href="/erp/faturamento?mes=2026-10&amp;rede=1&amp;volta=%2Ferp">Lançar o que falta</a>');
  });
});
