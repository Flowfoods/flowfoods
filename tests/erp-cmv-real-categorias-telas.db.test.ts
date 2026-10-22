/**
 * ERP I.2b · as telas novas do CMV por categoria (a página de verdade, com banco): compra × real, evolução, por loja, a meta total da loja,
 * e o que cada pessoa recebe no HTML.
 *
 * Setembro de 2026 encerrado (hoje = 22/10), duas lojas: Vila da Penha (VP) com retrato por insumo nos dois estoques (real R$ 7.500,00:
 * Proteína 7.000 e Laticínios 500) e Unidade Tijuca (DL) com a abertura de antes do retrato e o fechamento com retrato (real R$ 500,00).
 *  - a dona lê as quatro vistas (categorias, compra × real, evolução, por loja); o texto de pré-preparo e de variação não aparece sem motivo;
 *  - o gerente da VP recebe só a VP em qualquer vista (nada da DL, sem a vista "Por loja", também por `?rede=1` e `?loja=<DL>`);
 *  - comprador sem `dre.ver` e operador não abrem; as metas de uma loja que personaliza trazem o campo da meta total própria;
 *  - a DRE da dona diz de quem é a meta do CMV quando a loja tem a própria.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-cmv-real-categorias-telas.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const atual = vi.hoisted(() => ({
  ctx: null as null | (() => unknown),
  visao: { tipo: 'rede' } as { tipo: string; lojaId?: string; nome?: string },
  lojas: [] as { id: string; nome: string; ativa: boolean }[],
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`REDIRECT ${url}`), { url });
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  usePathname: () => '/erp/dre/cmv-categorias',
}));
vi.mock('@/lib/erp/compra-campos', async (original) => {
  const real = await original<typeof import('@/lib/erp/compra-campos')>();
  // "Hoje" fixo em 22/10; a data de um instante dado (o dia em que a abertura foi concluída) continua sendo a verdadeira.
  return { ...real, hojeNoRio: (quando?: Date) => (quando ? real.hojeNoRio(quando) : '2026-10-22') };
});
vi.mock('@/lib/erp/contexto', async () => {
  const { recusaDaAcao, exigirPermissao, pode } = await import('@/lib/erp/permissoes');
  return {
    exigirParceiroDaSessao: async () => atual.ctx!(),
    exigirParceiro: async () => atual.ctx!(),
    recusaDaAcao,
    exigirPermissao,
    pode,
    exigirPermissaoNaPagina: (ctx: { alcance: Alcance }, p: Parameters<typeof pode>[1]) => {
      if (!pode(ctx.alcance, p)) throw new Error('SEM_ACESSO');
    },
    visaoDaRequisicao: async () => ({ visao: atual.visao, lojas: atual.lojas }),
  };
});
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));
vi.mock('react-dom', async (orig) => ({ ...(await orig<typeof import('react-dom')>()), useFormState: (_acao: unknown, inicial: unknown) => [inicial, undefined], useFormStatus: () => ({ pending: false }) }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { salvarCanaisDaLoja } from '@/lib/erp/faturamento';
import { garantirCategoriasPadrao, listarCategorias } from '@/lib/erp/categorias';
import { aplicarModelo32 } from '@/lib/erp/cmv-categorias-campos';
import { salvarMetasPorCategoria, situacaoDasMetasPorCategoria } from '@/lib/erp/metas-categorias';
import { resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import ErpCmvPorCategoriaPage from '@/app/erp/dre/cmv-categorias/page';
import ErpMetasPorCategoriaPage from '@/app/erp/dre/metas-categorias/page';
import ErpDrePage from '@/app/erp/dre/page';
import { BRT, aberturaComItens, faturamento, fechamentoComRetrato, nota, periodoRegistrado, R, sp } from './erp-cmv-apoio';
import { cadastrarInsumoDeTeste as cadastrarInsumo, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;

describe.skipIf(!URL_TESTE)('ERP I.2b · telas do CMV real por categoria (Postgres real)', { timeout: 180_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `t${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string; slug: string; nome: string; status: string };
  let a: ClienteDoParceiro;
  const ids: Record<string, string> = {};
  const cat: Record<string, string> = {};

  const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR', lojaIds: string[] | 'rede'): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const propria = (permissoes: string[], lojaIds: string[] | 'rede'): Alcance =>
    resolverAlcance({ perfilBase: null, perfilProprio: permissoes, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const como = (alcance: Alcance, visao: { tipo: string; lojaId?: string } = { tipo: 'rede' }) => {
    atual.visao = visao;
    atual.ctx = () => ({ parceiro: A, alcance, cliente: a, bloqueio: null, podeEscrever: true, sessao: { userId: 'u', autorNome: 'Teste' } });
  };
  const rodar = async <T,>(fn: () => Promise<T>): Promise<T | { erro: string }> => {
    try {
      return await fn();
    } catch (e) {
      return { erro: (e as Error).message };
    }
  };
  const resolver = async (el: unknown): Promise<ReactElement> => {
    let x = el as ReactElement;
    for (let i = 0; i < 4; i++) {
      const tipo = x.type as unknown;
      if (typeof tipo !== 'function') return x;
      const saida = (tipo as (p: unknown) => unknown)(x.props);
      if (saida && typeof (saida as Promise<unknown>).then === 'function') x = (await saida) as ReactElement;
      else return x;
    }
    return x;
  };
  const painel = async (query: Record<string, string> = {}) => sp(renderToStaticMarkup(await resolver(await ErpCmvPorCategoriaPage({ searchParams: query }))));
  const metas = async (query: Record<string, string> = {}) => sp(renderToStaticMarkup(await resolver(await ErpMetasPorCategoriaPage({ searchParams: query }))));

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = (await db.parceiroFlow.create({ data: { nome: 'Telas I2b', slug: `tb-${sufixo}`, status: 'ATIVO' } })) as typeof A;
    a = doParceiro(A.id, db);
    for (const [chave, nome, canal] of [['vp', 'Vila da Penha', 'LOJA'], ['dl', 'Unidade Tijuca', 'DELIVERY_PROPRIO']] as const) {
      const r = await cadastrarLoja(a, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
      await a.loja.update({ where: { id: r.id }, data: { criadoEm: new Date('2026-01-10T12:00:00Z') } });
      expect((await salvarCanaisDaLoja(a, r.id, [canal], ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'], 'Marina')).ok).toBe(true);
    }
    atual.lojas = [{ id: ids.vp, nome: 'Vila da Penha', ativa: true }, { id: ids.dl, nome: 'Unidade Tijuca', ativa: true }];
    await faturamento(a, ids.vp, 'LOJA', '2026-08-01', '2026-10-31', { '2026-08-10': 100_000, '2026-09-10': 100_000, '2026-10-10': 100_000 });
    await faturamento(a, ids.dl, 'DELIVERY_PROPRIO', '2026-09-01', '2026-10-31', { '2026-09-10': 30_000, '2026-10-10': 30_000 });
    await garantirCategoriasPadrao(a);
    for (const c of await listarCategorias(a)) if (c.chave) cat[c.chave] = c.id;
    const novo = async (chave: string, nome: string) => {
      const r = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', nome, unidade: 'KG', conteudo: '1', preco: '10,00', conservacao: 'SECO', categoriaId: cat[chave] });
      if (!r.ok) throw new Error(JSON.stringify(r));
      return r.id;
    };
    const frango = await novo('PROTEINA', 'Frango');
    const queijo = await novo('LATICINIOS', 'Queijo');
    const n = (insumo: string, numero: string, data: string, reais: number, lojaId: string) => nota(a, insumo, { lojaId, numero, data, centavos: R(reais), lancadaEm: BRT(data, '12:00'), movimenta: true });
    const setembro = await periodoRegistrado(a, '2026-09-10');
    await aberturaComItens(a, ids.vp, BRT('2026-09-01', '09:00'), [{ insumoId: frango, centavos: R(4_000) }, { insumoId: queijo, centavos: R(3_000) }]);
    await n(frango, 'S1', '2026-09-05', 8_000, ids.vp);
    await fechamentoComRetrato(a, ids.vp, setembro, { fim: '2026-09-30', quando: BRT('2026-09-30', '18:00'), itens: [{ insumoId: frango, centavos: R(5_000) }, { insumoId: queijo, centavos: R(2_500) }] });
    await aberturaComItens(a, ids.dl, BRT('2026-09-01', '09:00'), [{ insumoId: frango, centavos: R(1_200) }], { antiga: true });
    await n(frango, 'D1', '2026-09-12', 1_000, ids.dl);
    await fechamentoComRetrato(a, ids.dl, setembro, { fim: '2026-09-30', quando: BRT('2026-09-30', '18:00'), itens: [{ insumoId: frango, centavos: R(1_700) }] });
    await nota(a, frango, { lojaId: ids.vp, numero: 'A1', data: '2026-08-05', centavos: R(3_000), lancadaEm: BRT('2026-08-05', '12:00') });
    const s = (await situacaoDasMetasPorCategoria(a, alcanceDe('DONO', 'rede'), null, '2026-09-15'))!;
    const r = await salvarMetasPorCategoria(a, alcanceDe('DONO', 'rede'), { lojaId: null, versao: s.versao, total: '32', campos: aplicarModelo32(await listarCategorias(a)).campos }, 'Marina', '2026-09-15');
    if (!r.ok) throw new Error(JSON.stringify(r));
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id]);
    await db?.$disconnect();
  });

  const SET = '2026-09-10';

  it('a dona lê o painel de setembro pelo CMV real: o subtítulo diz "real", o pré-preparo mostra a frase do estoque e não há variação do estoque', async () => {
    como(alcanceDe('DONO', 'rede'));
    const h = await painel({ rede: '1', periodo: SET });
    expect(h).toContain('Pelo CMV real');
    expect(h).toContain('R$ 8.000,00'); // CMV do DRE da rede: 7.500 + 500
    expect(h).toContain('estoque de pré-preparo que desceu');
    expect(h).not.toContain('Variação do estoque, ainda não aberta');
    expect(h).toContain('Compra × real');
    expect(h).toContain('Por loja');
    expect(h).toContain('o percentual de cada categoria é sobre a receita das lojas que a usam');
    expect(h).toContain('nunca muda a cor');
  });

  it('compra × real: a Proteína da rede subiu de R$ 5.200,00 para R$ 6.700,00, a diferença é −R$ 1.500,00 e o texto explica o sinal', async () => {
    como(alcanceDe('DONO', 'rede'));
    const h = await painel({ rede: '1', periodo: SET, vista: 'compra-real' });
    expect(h).toContain('Compra × real por categoria');
    expect(h).toContain('o estoque subiu R$ 1.500,00 (de R$ 5.200,00 para R$ 6.700,00)');
    expect(h).toContain('−R$ 1.500,00');
    expect(h).toContain('Diferença = real menos compra');
    expect(h).toContain('2 lojas');
  });

  it('a matriz põe cada loja ao lado da outra e fecha no CMV do DRE; a evolução traz os períodos do mais antigo ao mais novo', async () => {
    como(alcanceDe('DONO', 'rede'));
    const m = await painel({ rede: '1', periodo: SET, vista: 'matriz' });
    expect(m).toContain('Categoria por loja');
    expect(m).toContain('Unidade Tijuca');
    expect(m).toContain('Vila da Penha');
    expect(m).toContain('CMV do DRE');
    const e = await painel({ rede: '1', periodo: SET, vista: 'evolucao' });
    expect(e).toContain('Evolução por categoria');
    const tabela = e.slice(e.indexOf('Evolução por categoria'));
    expect(tabela.indexOf('Agosto de 2026')).toBeGreaterThan(-1);
    expect(tabela.indexOf('Agosto de 2026')).toBeLessThan(tabela.indexOf('Setembro de 2026'));
    // Vista que não existe cai nas categorias; a matriz de uma loja só não existe.
    expect(await painel({ rede: '1', periodo: SET, vista: 'qualquer' })).toContain('Maiores desvios');
    expect(await painel({ loja: ids.vp, periodo: SET, vista: 'matriz' })).not.toContain('Categoria por loja');
  });

  it('o gerente da VP recebe só a VP em qualquer vista (nada da DL, nada da matriz), também por ?rede=1 e ?loja=<DL>', async () => {
    como(alcanceDe('GERENTE', [ids.vp]), { tipo: 'loja', lojaId: ids.vp });
    atual.lojas = [{ id: ids.vp, nome: 'Vila da Penha', ativa: true }];
    try {
      for (const vista of ['categorias', 'compra-real', 'evolucao', 'matriz']) {
        for (const extra of [{}, { rede: '1' }, { loja: ids.dl }] as Record<string, string>[]) {
          const h = await painel({ periodo: SET, vista, ...extra });
          const rotulo = JSON.stringify({ vista, ...extra });
          expect(h, rotulo).toContain('Vila da Penha');
          for (const proibido of ['Unidade Tijuca', ids.dl, 'Ver a rede', 'Categoria por loja', 'lojasDoEscopo', 'Metas por categoria']) expect(h, `${rotulo} não pode ter ${proibido}`).not.toContain(proibido);
        }
      }
      const c = await painel({ periodo: SET, vista: 'compra-real' });
      expect(c).toContain('o estoque subiu R$ 1.000,00 (de R$ 4.000,00 para R$ 5.000,00)'); // só a Proteína dele
      expect(c).not.toContain('6.700,00');
    } finally {
      atual.lojas = [{ id: ids.vp, nome: 'Vila da Penha', ativa: true }, { id: ids.dl, nome: 'Unidade Tijuca', ativa: true }];
    }
  });

  it('comprador sem `dre.ver` e operador não abrem as vistas', async () => {
    como(propria(['compras.ver', 'compras.lancar', 'lojas.ver'], 'rede'));
    for (const vista of ['compra-real', 'evolucao', 'matriz']) expect(await rodar(() => ErpCmvPorCategoriaPage({ searchParams: { vista } }))).toEqual({ erro: 'SEM_ACESSO' });
    como(alcanceDe('OPERADOR', [ids.vp]), { tipo: 'loja', lojaId: ids.vp });
    expect(await rodar(() => ErpCmvPorCategoriaPage({ searchParams: { vista: 'evolucao' } }))).toEqual({ erro: 'SEM_ACESSO' });
  });

  it('a loja que personaliza ganha o campo da meta total própria; a que segue a rede só diz qual meta vale; a rede lista quem tem a própria', async () => {
    como(alcanceDe('DONO', 'rede'));
    const segue = await metas({ loja: ids.dl });
    expect(segue).toContain('Vale a meta total da rede, 32,00%');
    expect(segue).not.toContain('name="total"');
    const campos = aplicarModelo32(await listarCategorias(a)).campos;
    const s = (await situacaoDasMetasPorCategoria(a, alcanceDe('DONO', 'rede'), ids.dl, '2026-10-22'))!;
    const r = await salvarMetasPorCategoria(a, alcanceDe('DONO', 'rede'), { lojaId: ids.dl, versao: s.versao, total: '30', campos, segue: 'nao', usa: {} }, 'Marina', '2026-10-22');
    expect(r).toMatchObject({ ok: true });
    const propria = await metas({ loja: ids.dl });
    expect(propria).toContain('Meta total do CMV desta loja');
    expect(propria).toContain('name="total"');
    expect(propria).toMatch(/name="total"[^>]*value="30"/);
    expect(propria).toContain('Vale na linha CMV do DRE e no orçamento de compra só desta loja');
    const rede = await metas();
    expect(rede).toContain('A meta total do CMV da rede vale para a rede. Unidade Tijuca (30,00%) tem a própria');
    expect(rede).toContain('sobre a receita das lojas que a usam');
  });

  it('a DRE diz de quem é a meta do CMV: na loja "a própria dela"; na rede, quem tem a própria; o gerente da VP não lê nada da DL', async () => {
    como(alcanceDe('DONO', 'rede'));
    const dl = sp(renderToStaticMarkup(await resolver(await ErpDrePage({ searchParams: { loja: ids.dl, periodo: '2026-10-10' } }))));
    expect(dl).toContain('A meta do CMV desta loja é a própria dela');
    const rede = sp(renderToStaticMarkup(await resolver(await ErpDrePage({ searchParams: { rede: '1', periodo: '2026-10-10' } }))));
    expect(rede).toContain('A meta do CMV da rede é a da rede. Unidade Tijuca tem a própria (30,00%)');
    como(alcanceDe('GERENTE', [ids.vp]), { tipo: 'loja', lojaId: ids.vp });
    atual.lojas = [{ id: ids.vp, nome: 'Vila da Penha', ativa: true }];
    const g = sp(renderToStaticMarkup(await resolver(await ErpDrePage({ searchParams: { periodo: '2026-10-10', rede: '1' } }))));
    expect(g).not.toContain('Unidade Tijuca');
    expect(g).not.toContain('tem a própria');
  });
});
