import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import { resolverAlcance, type Alcance, type Permissao } from '@/lib/erp/permissoes';
import { montarDre } from '@/lib/erp/dre-campos';
import { planoEfetivo } from '@/lib/erp/dre-plano';
import type { CmvDoDre } from '@/lib/erp/cmv-campos';
import { dreDoPeriodo, type DreDoPeriodo } from '@/lib/erp/dre';
import { obterMes } from '@/lib/erp/faturamento';
import { situacaoDoEstoque } from '@/lib/erp/estoque';
import { saudeDoCardapio } from '@/lib/erp/saude-do-cardapio';
import { lojasDaListaDoDia } from '@/lib/erp/producao-lista';
import { painelDoDia } from '@/lib/erp/painel-do-dia';
import { lerComprasDaHome } from '@/lib/erp/home-compras';

vi.mock('@/lib/erp/dre', () => ({ dreDoPeriodo: vi.fn() }));
vi.mock('@/lib/erp/compras-relatorio', () => ({ resolverRecorte: vi.fn(), totaisDoRecorte: vi.fn() }));
vi.mock('@/lib/erp/home-compras', async (original) => ({ ...await original<typeof import('@/lib/erp/home-compras')>(), lerComprasDaHome: vi.fn() }));
vi.mock('@/lib/erp/faturamento', () => ({ obterMes: vi.fn() }));
vi.mock('@/lib/erp/estoque', () => ({ situacaoDoEstoque: vi.fn() }));
vi.mock('@/lib/erp/saude-do-cardapio', () => ({ saudeDoCardapio: vi.fn() }));
vi.mock('@/lib/erp/producao-lista', () => ({ lojasDaListaDoDia: vi.fn() }));
vi.mock('@/lib/db', () => { throw new Error('Esta matriz da orquestração não faz query real.'); });

const HOJE = '2026-10-29';
const cliente = { marcaSintetica: 'cliente-privado' } as unknown as ClienteDoParceiro;
const visao = { tipo: 'loja', lojaId: 'lojab', nome: 'Loja B' } as const;
const dono = resolverAlcance({ perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
const acesso = (permissoes: Permissao[], lojas: Alcance['lojas'] = ['lojab']): Alcance => ({ nivel: 'LOJA', lojas, permissoes: new Set(permissoes) });
const periodo = { inicio: '2026-10-01', fim: '2026-10-31', nome: 'Outubro configurado' };

function dto(alteracoes: Partial<DreDoPeriodo> = {}, compraCentavos: number | null = 35_000): DreDoPeriodo {
  const escopo = { tipo: 'loja', lojaId: visao.lojaId, nome: visao.nome } as const;
  const cmv: CmvDoDre = { lojas: [{ lojaId: visao.lojaId, lojaNome: visao.nome, compraCentavos, real: null, motivoSemReal: 'estoque não aberto' }], parcial: true };
  const resultado = montarDre({ escopo, plano: planoEfetivo([]), receitas: [{ lojaId: visao.lojaId, canal: 'LOJA', valorCentavos: 100_000 }], despesas: [], taxaIfood: null, cmv });
  return {
    periodo, hoje: HOJE, ate: '2026-10-28', emCurso: true, encerrado: false, diasDoPeriodo: 31, diaDeHoje: 29,
    diasApurados: 28, status: null, escopo, resultado, porLoja: null, faltas: { total: 0 }, faltaLancar: [], taxaConfigurada: false,
    anterior: null, proximo: null, lojasDoEscopo: [{ id: visao.lojaId, nome: visao.nome, ativa: true, canais: ['LOJA'] }],
    metas: {}, anoPassado: null, fechamento: null, cmv: { antigo: false, painel: null }, cmvDasLojas: cmv,
    metaDoCmvDaLoja: null, lojasComMetaPropria: [], trocasDeCusto: [], farol: {} as DreDoPeriodo['farol'], farolAntigo: false, canais: [], ...alteracoes,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(lerComprasDaHome).mockResolvedValue(null);
  vi.mocked(dreDoPeriodo).mockResolvedValue(dto());
  vi.mocked(obterMes).mockResolvedValue({
    lojas: [{ loja: { id: 'lojab', nome: 'Loja B' }, dias: [{ data: '2026-10-28', total: { valorCentavos: 700_000 } }] }],
    total: { valorCentavos: 700_000, pedidos: 70 }, faltas: 0,
  } as unknown as Awaited<ReturnType<typeof obterMes>>);
  vi.mocked(saudeDoCardapio).mockResolvedValue({ pratos: 2, prontos: 1, custoIncompleto: 0 } as Awaited<ReturnType<typeof saudeDoCardapio>>);
  vi.mocked(situacaoDoEstoque).mockResolvedValue([{ id: 'lojab', nome: 'Loja B', ativa: true, estado: 'NAO_ABERTO', contagem: null, aberto: null, verValores: false }]);
  vi.mocked(lojasDaListaDoDia).mockResolvedValue([{ id: 'lojab', nome: 'Loja B', naLista: 3, semLote: 1 }]);
});

describe('Home · uma leitura canônica de CMV autorizada antes da consulta', () => {
  it('dre.ver sozinho permite CMV-only, sem ler os demais módulos ou inventar indicador antigo', async () => {
    const p = await painelDoDia(cliente, acesso(['dre.ver']), '/erp', HOJE, visao);
    expect(dreDoPeriodo).toHaveBeenCalledTimes(1);
    expect(p.cmv).toMatchObject({ familia: 'cmv', fonteDoCmv: 'compras', valor: { unidade: 'centavos', valor: 35_000 } });
    expect(p.cmv?.percentual?.pontosBase).toBe(3500);
    expect(p.indicadores).toEqual([]);
    expect(p.pendencias).toEqual([]);
    expect(p.estados).toBeUndefined();
    expect(p.consultadoEm).toBe(p.cmv?.consultadoEm);
    expect(Number.isFinite(Date.parse(p.consultadoEm!))).toBe(true);
    expect(obterMes).not.toHaveBeenCalled();
    expect(saudeDoCardapio).not.toHaveBeenCalled();
    expect(situacaoDoEstoque).not.toHaveBeenCalled();
    expect(lojasDaListaDoDia).not.toHaveBeenCalled();
    expect(p.cmv?.detalhe.href).toContain('/erp/dre?');
    expect(JSON.stringify(p)).not.toMatch(/cliente-privado|\/compras|\/estoque/);
  });

  it('estreita o alcance para B, conserva o cliente e usa a mesma data de negócio nos dois argumentos', async () => {
    const alcance = acesso(['dre.ver'], ['lojaa', 'lojab']);
    await painelDoDia(cliente, alcance, '/erp', HOJE, visao);
    expect(dreDoPeriodo).toHaveBeenCalledWith(cliente, expect.objectContaining({ lojas: ['lojab'], permissoes: alcance.permissoes }), { tipo: 'loja', lojaId: 'lojab' }, HOJE, HOJE);
    expect(alcance.lojas).toEqual(['lojaa', 'lojab']);
  });

  it('virada UTC conserva hoje do Rio para CMV, faturamento e produção na mesma requisição', async () => {
    const agora = new Date('2026-10-30T02:30:00.000Z');
    const p = await painelDoDia(cliente, dono, '/erp', agora, visao);
    expect(dreDoPeriodo).toHaveBeenCalledTimes(1);
    expect(dreDoPeriodo).toHaveBeenCalledWith(cliente, expect.objectContaining({ lojas: ['lojab'] }), { tipo: 'loja', lojaId: 'lojab' }, '2026-10-29', '2026-10-29');
    expect(obterMes).toHaveBeenCalledWith(cliente, expect.objectContaining({ lojas: ['lojab'] }), { mes: '2026-10', lojaId: 'lojab' }, '2026-10-29');
    expect(lojasDaListaDoDia).toHaveBeenCalledWith(cliente, expect.objectContaining({ lojas: ['lojab'] }), agora);
    expect(p.consultadoEm).toBe(p.cmv?.consultadoEm);
  });

  it('sem dre.ver não consulta nem serializa CMV, mesmo com outros direitos financeiros', async () => {
    const p = await painelDoDia(cliente, acesso(['faturamento.ver', 'compras.ver', 'precos.ver', 'fichas.ver']), '/erp', HOJE, visao);
    expect(dreDoPeriodo).not.toHaveBeenCalled();
    expect(p).not.toHaveProperty('cmv');
    expect(p.indicadores.map((i) => i.chave)).toEqual(['faturamento', 'cardapio']);
    expect(JSON.stringify(p)).not.toContain('"familia":"cmv"');
  });

  it('Rede Completa e chamador antigo sem loja explícita não disparam DRE individual', async () => {
    const rede = await painelDoDia(cliente, dono, '/erp', HOJE, { tipo: 'rede' });
    const antiga = await painelDoDia(cliente, dono, '/erp', HOJE);
    expect(dreDoPeriodo).not.toHaveBeenCalled();
    expect(rede).not.toHaveProperty('cmv');
    expect(antiga).not.toHaveProperty('cmv');
    expect(rede.indicadores.length).toBeGreaterThan(0);
  });

  it.each(['fora', 'rede-restrita', 'nenhuma', 'malformada'] as const)('escopo forjado %s é recusado antes de qualquer fonte', async (caso) => {
    const restrito = acesso(['dre.ver', 'faturamento.ver', 'estoque.ver', 'producao.ver', 'fichas.ver', 'precos.ver']);
    const pedida = caso === 'rede-restrita' ? { tipo: 'rede' as const }
      : caso === 'nenhuma' ? { tipo: 'nenhuma' as const }
        : { ...visao, lojaId: caso === 'fora' ? 'lojaa' : '../lojab' };
    expect(await painelDoDia(cliente, restrito, '/erp', HOJE, pedida)).toEqual({ indicadores: [], pendencias: [] });
    for (const leitura of [dreDoPeriodo, obterMes, saudeDoCardapio, situacaoDoEstoque, lojasDaListaDoDia]) expect(leitura).not.toHaveBeenCalled();
  });

  it('espelho N1 preserva parceiro/loja/período na projeção sem consultar DRE de novo', async () => {
    const p = await painelDoDia(cliente, acesso(['dre.ver']), '/rodolfo/erp/casa-alfa', HOJE, visao);
    const url = new URL(p.cmv!.detalhe.href, 'https://local.test');
    expect(url.pathname).toBe('/rodolfo/erp/casa-alfa/dre');
    expect(url.searchParams.get('loja')).toBe('lojab');
    expect(url.searchParams.get('periodo')).toBe(periodo.inicio);
    expect(dreDoPeriodo).toHaveBeenCalledTimes(1);
  });
});

describe('Home · falha do DRE é isolada e nunca reconstitui fórmula ou período', () => {
  it('rejeição só substitui CMV: mantém quatro fontes, números e pendências saudáveis', async () => {
    vi.mocked(dreDoPeriodo).mockRejectedValueOnce(new Error('Prisma SQL tabela-privada tenant-privado'));
    const p = await painelDoDia(cliente, dono, '/erp', HOJE, visao);
    expect(p.cmv).toMatchObject({ estado: 'erro', valor: { valor: null }, referencia: null, origem: null, cobertura: null });
    expect(p.cmv?.detalhe).toEqual({ href: '/erp/dre?loja=lojab', rotulo: 'Ver o DRE atual da loja' });
    expect(p.indicadores.map((i) => i.chave)).toEqual(['faturamento', 'cardapio', 'estoque', 'producao']);
    expect(p.indicadores[0].valor).toEqual({ tipo: 'dinheiro', centavos: 700_000 });
    expect(p.pendencias.map((p) => p.chave)).toEqual(['cardapio-preco', 'estoque-abrir', 'producao-sem-lote']);
    expect(p.estados?.every((e) => e.estado !== 'erro')).toBe(true);
    expect(JSON.stringify(p)).not.toMatch(/Prisma|SQL|tabela-privada|tenant-privado|reason|stack/);
    expect(p.cmv?.consultadoEm).toBe(p.consultadoEm);
  });

  it('falhas das fontes antigas não impedem o CMV canônico; arrays antigos não ganham dados fictícios', async () => {
    for (const leitura of [obterMes, saudeDoCardapio, situacaoDoEstoque, lojasDaListaDoDia]) vi.mocked(leitura).mockRejectedValueOnce(new Error('interno'));
    const p = await painelDoDia(cliente, dono, '/erp', HOJE, visao);
    expect(p.cmv?.valor.valor).toBe(35_000);
    expect(p.indicadores).toEqual([]);
    expect(p.pendencias).toEqual([]);
    expect(p.estados?.every((e) => e.estado === 'erro')).toBe(true);
  });

  it('exceção síncrona de DRE também é sanitizada e não repete a consulta', async () => {
    vi.mocked(dreDoPeriodo).mockImplementationOnce(() => { throw new Error('interno-sincrono'); });
    const p = await painelDoDia(cliente, acesso(['dre.ver']), '/erp', HOJE, visao);
    expect(p.cmv?.estado).toBe('erro');
    expect(dreDoPeriodo).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(p)).not.toContain('interno-sincrono');
  });

  it('DRE nulo é indisponível e o fallback declara DRE atual, sem inventar período conhecido', async () => {
    vi.mocked(dreDoPeriodo).mockResolvedValueOnce(null);
    const p = await painelDoDia(cliente, acesso(['dre.ver']), '/erp', HOJE, visao);
    expect(p.cmv?.estado).toBe('indisponivel');
    expect(p.cmv?.referencia).toBeNull();
    expect(p.cmv?.detalhe).toEqual({ href: '/erp/dre?loja=lojab', rotulo: 'Ver o DRE atual da loja' });
  });

  it('primeiro dia não pede período anterior e preserva sem dados apurados em vez de zero', async () => {
    const primeiro = '2026-10-01';
    vi.mocked(dreDoPeriodo).mockResolvedValueOnce(dto({ hoje: primeiro, ate: null, diasApurados: 0, diaDeHoje: 1 }));
    const p = await painelDoDia(cliente, acesso(['dre.ver']), '/erp', primeiro, visao);
    expect(p.cmv).toMatchObject({ estado: 'sem_dados', valor: { valor: null }, referencia: { inicio: periodo.inicio, apuradoAte: null } });
    expect(dreDoPeriodo).toHaveBeenCalledTimes(1);
    expect(dreDoPeriodo).toHaveBeenCalledWith(cliente, expect.anything(), { tipo: 'loja', lojaId: 'lojab' }, primeiro, primeiro);
  });

  it('snapshot fechado preserva valor, bp, identificação e ressalvas próprias sem leitura adicional', async () => {
    const d = dto({ emCurso: false, encerrado: true, ate: periodo.fim, diasApurados: 31, status: 'FECHADO' });
    d.fechamento = { versao: 3, fotografiaId: 'foto-da-loja', versaoDaConta: 5, fechadoEm: new Date('2026-11-02T12:00:00.000Z'), fechadoPorNome: 'Autor privado', ressalvas: [], totalDeRessalvas: 20, justificativa: 'Justificativa privada da rede' };
    d.resultado.linhas.find((l) => l.tipo === 'cmv')!.percentualBp = 3512;
    vi.mocked(dreDoPeriodo).mockResolvedValueOnce(d);
    const p = await painelDoDia(cliente, acesso(['dre.ver']), '/erp', HOJE, visao);
    expect(p.cmv?.origem).toMatchObject({ modo: 'fotografia', fotografia: { id: 'foto-da-loja', versao: 3, versaoDaConta: 5 } });
    expect(p.cmv?.valor.valor).toBe(35_000);
    expect(p.cmv?.percentual?.pontosBase).toBe(3512);
    expect(dreDoPeriodo).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(p)).not.toMatch(/Autor privado|Justificativa privada|totalDeRessalvas/);
  });

  it('fechado sem fotografia permanece indisponível, sem substituir por dado vivo', async () => {
    vi.mocked(dreDoPeriodo).mockResolvedValueOnce(dto({ status: 'FECHADO', fechamento: null }));
    const p = await painelDoDia(cliente, acesso(['dre.ver']), '/erp', HOJE, visao);
    expect(p.cmv?.estado).toBe('indisponivel');
    expect(p.cmv?.valor.valor).toBeNull();
    expect(p.cmv?.origem).toBeNull();
    expect(dreDoPeriodo).toHaveBeenCalledTimes(1);
  });

  it('contrato de projeção incompatível falha só no CMV sem expor DTO bruto', async () => {
    const d = dto({ status: 'FECHADO' });
    d.fechamento = { versao: 1, fotografiaId: 'foto-privada', versaoDaConta: 5, fechadoEm: new Date('inválida'), fechadoPorNome: 'Autor privado', ressalvas: [], totalDeRessalvas: 0, justificativa: 'Segredo' };
    vi.mocked(dreDoPeriodo).mockResolvedValueOnce(d);
    const p = await painelDoDia(cliente, dono, '/erp', HOJE, visao);
    expect(p.cmv?.estado).toBe('erro');
    expect(p.indicadores).toHaveLength(4);
    expect(JSON.stringify(p)).not.toMatch(/foto-privada|Autor privado|Segredo|Invalid time|RangeError/);
  });

  it('resposta com escopo rede/outra loja não é serializada como se fosse de B', async () => {
    for (const escopo of [{ tipo: 'rede' }, { tipo: 'loja', lojaId: 'lojaa', nome: 'Loja A privada' }] as const) {
      vi.mocked(dreDoPeriodo).mockResolvedValueOnce(dto({ escopo }));
      const p = await painelDoDia(cliente, acesso(['dre.ver']), '/erp', HOJE, visao);
      expect(p).not.toHaveProperty('cmv');
      expect(p.indicadores).toEqual([]);
      expect(p.pendencias).toEqual([]);
      expect(p.analitico?.tipo).toBe('loja');
      expect(JSON.stringify(p)).not.toMatch(/Loja A privada|"familia":"cmv"/);
    }
    expect(dreDoPeriodo).toHaveBeenCalledTimes(2);
  });

  it('zero informado é preservado e requisições diferentes não reaproveitam dado de outro cliente', async () => {
    const outroCliente = { marcaSintetica: 'outro-cliente-privado' } as unknown as ClienteDoParceiro;
    vi.mocked(dreDoPeriodo).mockResolvedValueOnce(dto({}, 0)).mockResolvedValueOnce(dto({}, 9876));
    const p1 = await painelDoDia(cliente, acesso(['dre.ver']), '/erp', HOJE, visao);
    const p2 = await painelDoDia(outroCliente, acesso(['dre.ver']), '/erp', HOJE, visao);
    expect(p1.cmv?.valor.valor).toBe(0);
    expect(p2.cmv?.valor.valor).toBe(9876);
    expect(dreDoPeriodo).toHaveBeenCalledTimes(2);
    expect(vi.mocked(dreDoPeriodo).mock.calls.map((c) => c[0])).toEqual([cliente, outroCliente]);
    expect(JSON.stringify(p1) + JSON.stringify(p2)).not.toContain('cliente-privado');
  });
});
