/**
 * Decisão 518 · pontos de atenção da Home, sem banco: a volta da Home (a mesma regra da 517), a classificação de cada
 * pendência em "Completar dados" ou "Resolver operação" sem mudar a regra delas, o piloto do faturamento (permissão de lançar,
 * leitura confirmada ou não conferida) e a apresentação em dois grupos no mesmo painel, sem faixa nova nem ordem nova.
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
const cliente = {} as ClienteDoParceiro;
const emLeitura = { somenteLeitura: true } as ClienteDoParceiro;
const visao = { tipo: 'loja', lojaId: 'lojab', nome: 'Loja B' } as const;
const dono = resolverAlcance({ perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
const so = (...permissoes: Permissao[]): Alcance => ({ nivel: 'LOJA', lojas: ['lojab'], permissoes: new Set(permissoes) });
const faturamento = (faltas: number) => ({
  lojas: [{ loja: { id: 'lojab', nome: 'Loja B' }, dias: [{ data: '2026-10-28', total: { valorCentavos: 700_000 } }] }],
  total: { valorCentavos: 700_000, pedidos: 70 }, faltas,
}) as unknown as Awaited<ReturnType<typeof obterMes>>;
const pendencia = (ps: readonly PendenciaDoDia[]) => ps.find((p) => p.chave === 'faturamento-faltas');
const htmlDe = (pendencias: readonly PendenciaDoDia[], xmlAguardando?: XmlAguardandoHome) => renderToStaticMarkup(createElement(PendenciasDoResumo, { pendencias, xmlAguardando })).replace(/ /g, ' ');

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(dreDoPeriodo).mockResolvedValue(null);
  vi.mocked(lerComprasDaHome).mockResolvedValue(null);
  vi.mocked(obterMes).mockResolvedValue(faturamento(3));
  vi.mocked(saudeDoCardapio).mockResolvedValue({ pratos: 2, prontos: 1, custoIncompleto: 1 } as Awaited<ReturnType<typeof saudeDoCardapio>>);
  vi.mocked(situacaoDoEstoque).mockResolvedValue([{ id: 'lojab', nome: 'Loja B', ativa: true, estado: 'EM_CONTAGEM', contagem: { contados: 1, total: 4 }, aberto: null, verValores: false }] as unknown as Awaited<ReturnType<typeof situacaoDoEstoque>>);
  vi.mocked(lojasDaListaDoDia).mockResolvedValue([{ id: 'lojab', naLista: 2, semLote: 1 }] as unknown as Awaited<ReturnType<typeof lojasDaListaDoDia>>);
});

describe('Volta da Home (decisão 518 reaproveita a regra da 517, sem afrouxar)', () => {
  it('só a Home exata da área; a composição do DRE continua com a mesma função', () => {
    expect(voltaDaComposicao).toBe(voltaParaAHome);
    expect(voltaParaAHome('/erp', '/erp')).toEqual({ href: '/erp', rotulo: 'o início' });
    expect(voltaParaAHome('/rodolfo/erp/casa-alfa', '/rodolfo/erp/casa-alfa')).toEqual({ href: '/rodolfo/erp/casa-alfa', rotulo: 'o início' });
    for (const v of ['/erp/', '/erp?sem-acesso=1', '/%65rp', '/erp/faturamento', 'https://fora.test/erp', '//erp', '/rodolfo/erp/casa-alfa', ' /erp', undefined, ['/erp']]) {
      expect(voltaParaAHome(v, '/erp'), String(v)).toBeNull();
    }
  });

  it('leva a volta adiante só quando ela existe, com ? ou &', () => {
    const volta = voltaParaAHome('/erp', '/erp');
    expect(comVoltaParaAHome('/erp/faturamento/l1/2026-10-15', volta)).toBe('/erp/faturamento/l1/2026-10-15?volta=%2Ferp');
    expect(comVoltaParaAHome('/erp/faturamento?mes=2026-10&loja=l1', volta)).toBe('/erp/faturamento?mes=2026-10&loja=l1&volta=%2Ferp');
    expect(comVoltaParaAHome('/erp/faturamento?mes=2026-10', null)).toBe('/erp/faturamento?mes=2026-10');
    expect(comVoltaParaAHome('/x', voltaParaAHome('/rodolfo/erp/a-b', '/rodolfo/erp/a-b'))).toBe('/x?volta=%2Frodolfo%2Ferp%2Fa-b');
  });
});

describe('Classificação: completar dados ou resolver operação, sem mudar a regra de cada pendência', () => {
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
    const rede = await painelDoDia(cliente, dono, '/erp', HOJE, { tipo: 'rede' });
    expect(rede.pendencias.map((p) => [p.chave, p.natureza])).toEqual([
      ['faturamento-faltas', 'completar_dados'],
      ['cardapio-preco', 'completar_dados'],
      ['estoque-abrir', 'resolver_operacao'],
    ]);
    // Sem score: nenhuma pendência ganha número de prioridade, impacto ou idade.
    expect(JSON.stringify([...loja.pendencias, ...rede.pendencias])).not.toMatch(/"(score|peso|impacto|prioridade|idade|desde|criadaEm)"/);
  });
});

describe('Piloto do faturamento: pendência da leitura, com permissão de lançar decidida no servidor', () => {
  it('quem lança: "Lançar o que falta", indicador afetado, leitura confirmada e a volta para a Home da área', async () => {
    expect(pendencia((await painelDoDia(cliente, dono, '/erp', HOJE, visao)).pendencias)).toEqual({
      chave: 'faturamento-faltas', escopo: 'Loja B', natureza: 'completar_dados', indicador: 'Faturamento de outubro', leitura: 'confirmada',
      titulo: '3 canais sem lançamento neste mês', texto: 'Dia que a loja vendeu e ninguém lançou deixa o faturamento e o DRE incompletos.',
      href: '/erp/faturamento?mes=2026-10&loja=lojab&volta=%2Ferp', acao: 'Lançar o que falta',
    });
    expect(pendencia((await painelDoDia(cliente, dono, '/rodolfo/erp/casa-alfa', HOJE, visao)).pendencias)?.href)
      .toBe('/rodolfo/erp/casa-alfa/faturamento?mes=2026-10&loja=lojab&volta=%2Frodolfo%2Ferp%2Fcasa-alfa');
    expect(pendencia((await painelDoDia(cliente, dono, '/erp', HOJE, { tipo: 'rede' })).pendencias)?.href).toBe('/erp/faturamento?mes=2026-10&rede=1&volta=%2Ferp');
    // Base que não é a Home de uma área não vira volta (o link fica como era).
    expect(pendencia((await painelDoDia(cliente, dono, '/erp/', HOJE, visao)).pendencias)?.href).toBe('/erp//faturamento?mes=2026-10&loja=lojab');
  });

  it('quem só vê, quem lança sem ver e o parceiro em leitura recebem "Ver o faturamento"; sem ver, nada', async () => {
    const leitor = pendencia((await painelDoDia(cliente, so('faturamento.ver'), '/erp', HOJE, visao)).pendencias)!;
    expect(leitor).toMatchObject({ acao: 'Ver o faturamento', leitura: 'confirmada', titulo: '3 canais sem lançamento neste mês' });
    expect(leitor.texto).toContain('Lançar é com quem tem “lançar faturamento” nesta loja.');
    const bloqueado = pendencia((await painelDoDia(emLeitura, dono, '/erp', HOJE, visao)).pendencias)!;
    expect(bloqueado).toMatchObject({ acao: 'Ver o faturamento' });
    expect(bloqueado.texto).toContain('Os lançamentos estão bloqueados agora');
    const redeLeitor = pendencia((await painelDoDia(cliente, { ...so('faturamento.ver'), lojas: 'todas' }, '/erp', HOJE, { tipo: 'rede' })).pendencias)!;
    expect(redeLeitor.texto).toContain('nas lojas.');
    const semVer = await painelDoDia(cliente, so('faturamento.lancar'), '/erp', HOJE, visao);
    expect(obterMes).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(semVer)).not.toMatch(/faturamento|Lançar/i);
  });

  it('sem falta na leitura válida: a pendência some e o estado fica ok, sem frase de resolvido', async () => {
    vi.mocked(obterMes).mockResolvedValueOnce(faturamento(0));
    const p = await painelDoDia(cliente, dono, '/erp', HOJE, visao);
    expect(pendencia(p.pendencias)).toBeUndefined();
    expect(p.estados?.find((e) => e.chave === 'faturamento')?.estado).toBe('ok');
    expect(JSON.stringify(p)).not.toMatch(/resolvid|concluíd/i);
  });

  it('leitura que falha (rejeição ou exceção): "não conferida", sem número, sem "Lançar", sem detalhe interno', async () => {
    for (const falhar of [() => vi.mocked(obterMes).mockRejectedValueOnce(new Error('Prisma P1001 segredo')), () => vi.mocked(obterMes).mockImplementationOnce(() => { throw new Error('sincrona'); })]) {
      falhar();
      const p = await painelDoDia(cliente, dono, '/erp', HOJE, visao);
      expect(pendencia(p.pendencias)).toMatchObject({
        natureza: 'completar_dados', leitura: 'nao_conferida', indicador: 'Faturamento de outubro', acao: 'Ver o faturamento',
        titulo: 'Canais sem lançamento: não deu para conferir agora', href: '/erp/faturamento?mes=2026-10&loja=lojab&volta=%2Ferp',
      });
      expect(p.pendencias[0].chave).toBe('faturamento-faltas');
      expect(JSON.stringify(p)).not.toMatch(/Prisma|P1001|segredo|sincrona|Lançar o que falta/);
    }
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
    const h = htmlDe([item('faturamento-faltas', 'completar_dados', { leitura: 'nao_conferida', acao: 'Ver o faturamento', titulo: 'Canais sem lançamento: não deu para conferir agora' })]);
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
