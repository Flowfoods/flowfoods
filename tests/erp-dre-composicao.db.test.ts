/**
 * Jornada 4 · decisão 464 — cada número do DRE abre o que o forma (indicador → composição → registros → origem), com banco:
 *  - a composição de uma linha de despesa soma o número do DRE ao centavo, linha a linha, na rede e em cada loja, ao vivo e
 *    depois de fechar (a fotografia);
 *  - isolamento: o gerente de uma loja não recebe a despesa da rede nem a de outra loja (nem pedindo a loja), o outro parceiro
 *    não acha a linha, o operador não recebe nada;
 *  - a página: o número abre a composição com "Voltar para o DRE" na mesma visão, a despesa abre o detalhe que volta para a
 *    composição; endereço torto mostra a lista normal; volta de fora da área é ignorada;
 *  - o DRE em HTML: despesa abre a composição, "pelas compras" abre o relatório de compras com volta, o CMV abre o CMV por
 *    categoria, a receita diz "Faturamento do mês inteiro: <mês>" (um por mês quando o período cruza meses); sem a permissão, sem o link;
 *  - CMV por categoria: o valor pelas compras, ao vivo, abre o relatório de compras da categoria; sem `compras.ver` ou fechado, não.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-dre-composicao.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement, Fragment, isValidElement, type ReactElement } from 'react';
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
  usePathname: () => '/erp/dre',
}));
vi.mock('@/lib/erp/compra-campos', async (original) => ({ ...(await original<typeof import('@/lib/erp/compra-campos')>()), hojeNoRio: () => '2026-10-22' }));
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
import { composicaoDaLinha, lancarDespesa } from '@/lib/erp/despesas';
import type { TextosDaDespesa } from '@/lib/erp/despesa-campos';
import { dreDoPeriodo, type DreDoPeriodo } from '@/lib/erp/dre';
import { fecharPeriodo } from '@/lib/erp/dre-fechamento';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import ErpDrePage from '@/app/erp/dre/page';
import ErpDespesasPage from '@/app/erp/dre/despesas/page';
import ErpDespesaPage from '@/app/erp/dre/despesas/[id]/page';
import ErpCmvPorCategoriaPage from '@/app/erp/dre/cmv-categorias/page';
import NivelUmDespesasPage from '@/app/rodolfo/(painel)/erp/[slug]/dre/despesas/page';
import NivelUmDespesaPage from '@/app/rodolfo/(painel)/erp/[slug]/dre/despesas/[id]/page';
import ErpEditarDespesaPage from '@/app/erp/dre/despesas/[id]/editar/page';
import { TelaDoDre } from '@/components/erp/telas/dre/dre';
import { lerFiltrosDoRelatorio } from '@/lib/erp/compras-relatorio-campos';
import { relatorioDaTela } from '@/lib/erp/compras-relatorio';
import { BRT, faturamento, nota, R, sp } from './erp-cmv-apoio';
import { cadastrarInsumoDeTeste as cadastrarInsumo, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const HOJE = '2026-10-22';
const SET = { de: '2026-09-01', ate: '2026-09-30' };

describe.skipIf(!URL_TESTE)('Jornada 4 · o número do DRE abre o que o forma (Postgres real)', { timeout: 180_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `j${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string; slug: string; nome: string; status: string };
  let B: { id: string; slug: string; nome: string; status: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const ids: Record<string, string> = {};
  const linha: Record<string, string> = {};
  const cat: Record<string, string> = {};

  const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR', lojaIds: string[] | 'rede'): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const propria = (permissoes: string[], lojaIds: string[] | 'rede'): Alcance =>
    resolverAlcance({ perfilBase: null, perfilProprio: permissoes, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const todas = () => [{ id: ids.vp, nome: 'Vila da Penha', ativa: true }, { id: ids.dl, nome: 'Unidade Tijuca', ativa: true }];
  const como = (alcance: Alcance, visao: { tipo: string; lojaId?: string } = { tipo: 'rede' }, lojas = todas()) => {
    atual.visao = visao;
    atual.lojas = lojas;
    atual.ctx = () => ({ parceiro: A, alcance, cliente: a, bloqueio: null, podeEscrever: true, sessao: { userId: 'u', autorNome: 'Teste' } });
  };
  const comoGerente = () => como(alcanceDe('GERENTE', [ids.vp]), { tipo: 'loja', lojaId: ids.vp }, [{ id: ids.vp, nome: 'Vila da Penha', ativa: true }]);
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
  /** A composição vem num fragmento (trilha + tela): devolve o elemento da tela. */
  const tela = (el: ReactElement): ReactElement => {
    if (el.type !== Fragment) return el;
    const filhos = ([] as unknown[]).concat((el.props as { children: unknown }).children).filter(isValidElement) as ReactElement[];
    return filhos.find((f) => (f.type as { name?: string }).name === 'TelaDaComposicao') ?? filhos[filhos.length - 1];
  };
  const despesas = async (query: Record<string, string>) => tela(await resolver(await ErpDespesasPage({ searchParams: query })));
  const dre = async (query: Record<string, string>) => sp(renderToStaticMarkup((await ErpDrePage({ searchParams: query })) as ReactElement));
  const categorias = async (query: Record<string, string>) => sp(renderToStaticMarkup(await resolver(await ErpCmvPorCategoriaPage({ searchParams: query }))));
  /** O href de um número (do HTML) e o total que o relatório de compras mostra para ele, como a página faz (loja do topo quando o link não marca nenhuma). */
  const hrefDe = (h: string, rotulo: string) => {
    const m = new RegExp(`aria-label="${rotulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"]*"[^>]*href="([^"]+)"`).exec(h) ?? new RegExp(`href="([^"]+)"[^>]*aria-label="${rotulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).exec(h);
    return m ? m[1].replace(/&amp;/g, '&') : null;
  };
  const totalDoRelatorio = async (href: string, alcance: Alcance, lojaDoTopo?: string) => {
    const u = new URL(href, 'http://x');
    const params: Record<string, string | string[]> = {};
    for (const k of new Set(u.searchParams.keys())) {
      const v = u.searchParams.getAll(k);
      params[k] = v.length > 1 ? v : v[0];
    }
    let f = lerFiltrosDoRelatorio(params, HOJE);
    if (f.lojaIds.length === 0 && lojaDoTopo) f = { ...f, lojaIds: [lojaDoTopo] };
    return (await relatorioDaTela(a, alcance, f, 'periodo')).totais?.totalCentavos ?? null;
  };
  const textos = (p: Partial<TextosDaDespesa>): TextosDaDespesa => ({ envio: globalThis.crypto.randomUUID().replace(/-/g, ''), lojaId: '', linha: 'aluguel', descricao: 'Aluguel', valor: '1,00', tipo: 'mes', dia: '', mes: '2026-09', de: '', ate: '', recorrente: false, vencimento: '', ...p });
  const escopos = () => [{ tipo: 'rede' as const }, { tipo: 'loja' as const, lojaId: ids.vp }, { tipo: 'loja' as const, lojaId: ids.dl }];
  /** Toda linha de despesa do DRE contra a composição dela, no recorte que o DRE apurou. */
  const conferirLinhaALinha = async (d: DreDoPeriodo, lojaId?: string) => {
    const linhas = d.resultado.linhas.filter((l) => l.tipo === 'linha' && l.linhaId);
    expect(linhas.length).toBeGreaterThan(10);
    for (const l of linhas) {
      const c = await composicaoDaLinha(a, ALCANCE_FLOWFOODS, { linhaId: l.linhaId!, de: d.periodo.inicio, ate: d.ate! }, lojaId);
      expect(c!.totalCentavos, `${l.nome} (${lojaId ?? 'rede'})`).toBe(l.valorCentavos ?? 0);
    }
  };

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = (await db.parceiroFlow.create({ data: { nome: 'Composição A', slug: `cmp-a-${sufixo}`, status: 'ATIVO' } })) as typeof A;
    B = (await db.parceiroFlow.create({ data: { nome: 'Composição B', slug: `cmp-b-${sufixo}`, status: 'ATIVO' } })) as typeof B;
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    for (const [chave, nome, canal] of [['vp', 'Vila da Penha', 'LOJA'], ['dl', 'Unidade Tijuca', 'DELIVERY_PROPRIO']] as const) {
      const r = await cadastrarLoja(a, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
      await a.loja.update({ where: { id: r.id }, data: { criadoEm: new Date('2026-01-10T12:00:00Z') } });
      expect((await salvarCanaisDaLoja(a, r.id, [canal], ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'], 'Marina')).ok).toBe(true);
    }
    await faturamento(a, ids.vp, 'LOJA', '2026-09-01', '2026-10-21', { '2026-09-10': 100_000, '2026-10-10': 100_000 });
    await faturamento(a, ids.dl, 'DELIVERY_PROPRIO', '2026-09-01', '2026-10-21', { '2026-09-10': 30_000, '2026-10-10': 30_000 });
    await garantirCategoriasPadrao(a);
    for (const c of await listarCategorias(a)) if (c.chave) cat[c.chave] = c.id;
    const insumo = async (chave: string, nome: string) => {
      const r = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', nome, unidade: 'KG', conteudo: '1', preco: '10,00', conservacao: 'SECO', categoriaId: cat[chave] });
      if (!r.ok) throw new Error(JSON.stringify(r));
      return r.id;
    };
    const frango = await insumo('PROTEINA', 'Frango');
    const farinha = await insumo('MERCEARIA', 'Farinha');
    await nota(a, frango, { lojaId: ids.vp, numero: 'S1', data: '2026-09-05', centavos: R(1_200), lancadaEm: BRT('2026-09-05', '12:00') });
    await nota(a, farinha, { lojaId: ids.vp, numero: 'S2', data: '2026-09-06', centavos: R(500), lancadaEm: BRT('2026-09-06', '12:00') });
    await nota(a, frango, { lojaId: ids.dl, numero: 'S3', data: '2026-09-11', centavos: R(321), lancadaEm: BRT('2026-09-11', '12:00') });
    // Outubro (em curso): um pré-preparo de Proteína comprado em nota (no painel vai à linha dos pré-preparos).
    const pronta = await a.insumo.create({ data: { parceiroId: A.id, nome: 'Carne desfiada pronta', tipo: 'PRE_PREPARO', unidade: 'KG', conteudoMilesimos: 1000, precoEmbalagemCentavos: 0, categoriaId: cat.PROTEINA }, select: { id: true } });
    await nota(a, frango, { lojaId: ids.vp, numero: 'O1', data: '2026-10-11', centavos: R(700), lancadaEm: BRT('2026-10-11', '12:00') });
    await nota(a, pronta.id, { lojaId: ids.vp, numero: 'O2', data: '2026-10-12', centavos: R(80), lancadaEm: BRT('2026-10-12', '12:00') });
    await nota(a, farinha, { lojaId: ids.dl, numero: 'O3', data: '2026-10-13', centavos: R(250), lancadaEm: BRT('2026-10-13', '12:00') });
    // Despesas: da rede, de cada loja, de um dia, do ano inteiro e uma de outubro (fora de setembro).
    for (const [chave, p] of [
      ['contador', { descricao: 'Contador do grupo', linha: 'contabilidade', valor: '900,00' }],
      ['aluguelVp', { descricao: 'Aluguel do salão', linha: 'aluguel', valor: '3.000,00', lojaId: ids.vp, recorrente: true }],
      ['aluguelDl', { descricao: 'Aluguel da Tijuca', linha: 'aluguel', valor: '1.500,00', lojaId: ids.dl }],
      ['conserto', { descricao: 'Conserto da chapa', linha: 'manutencao', valor: '420,00', lojaId: ids.vp, tipo: 'dia', dia: '05/09/2026' }],
      ['iptu', { descricao: 'IPTU do ano', linha: 'iptu', valor: '3.650,00', lojaId: ids.vp, tipo: 'intervalo', de: '01/01/2026', ate: '31/12/2026' }],
      ['outubro', { descricao: 'Aluguel de outubro', linha: 'aluguel', valor: '3.000,00', lojaId: ids.vp, mes: '2026-10' }],
    ] as const) {
      const r = await lancarDespesa(a, ALCANCE_FLOWFOODS, textos(p as Partial<TextosDaDespesa>), 'Marina', HOJE);
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[`d_${chave}`] = r.id;
    }
    for (const l of await a.dreLinha.findMany({ where: { codigo: { in: ['aluguel', 'contabilidade', 'manutencao', 'iptu', 'energia'] } }, select: { id: true, codigo: true } })) linha[l.codigo!] = l.id;
    const rb = await cadastrarLoja(b, { nome: 'Casa do B' }, 'Beto');
    if (!rb.ok) throw new Error(JSON.stringify(rb));
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
  });

  it('a composição soma o número do DRE ao centavo, linha a linha, na rede e em cada loja', async () => {
    for (const pedido of escopos()) {
      const d = (await dreDoPeriodo(a, ALCANCE_FLOWFOODS, pedido, '2026-09-15', HOJE))!;
      expect(d.ate).toBe(SET.ate);
      await conferirLinhaALinha(d, pedido.tipo === 'loja' ? pedido.lojaId : undefined);
    }
    const rede = (await composicaoDaLinha(a, ALCANCE_FLOWFOODS, { linhaId: linha.aluguel, ...SET }))!;
    expect(rede.totalCentavos).toBe(R(4_500));
    expect(rede.itens.map((i) => i.descricao)).toEqual(['Aluguel do salão', 'Aluguel da Tijuca']); // outubro fica de fora
    const iptu = (await composicaoDaLinha(a, ALCANCE_FLOWFOODS, { linhaId: linha.iptu, ...SET }, ids.vp))!;
    expect(iptu.itens).toMatchObject([{ descricao: 'IPTU do ano', valorCentavos: R(3_650), noRecorteCentavos: R(300), diasNoRecorte: 30, dias: 365 }]);
    const conserto = (await composicaoDaLinha(a, ALCANCE_FLOWFOODS, { linhaId: linha.manutencao, de: '2026-09-01', ate: '2026-09-04' }, ids.vp))!;
    expect(conserto.itens).toEqual([]); // o conserto é de 05/09
    // A loja não recebe a despesa da rede (sem rateio), como o DRE da loja.
    expect((await composicaoDaLinha(a, ALCANCE_FLOWFOODS, { linhaId: linha.contabilidade, ...SET }, ids.vp))!.itens).toEqual([]);
    expect((await composicaoDaLinha(a, ALCANCE_FLOWFOODS, { linhaId: linha.contabilidade, ...SET }))!.totalCentavos).toBe(R(900));
  });

  it('isolamento: o gerente não recebe a rede nem outra loja, o outro parceiro não acha a linha, o operador não recebe nada', async () => {
    const gerente = alcanceDe('GERENTE', [ids.vp]);
    const doGerente = (await composicaoDaLinha(a, gerente, { linhaId: linha.aluguel, ...SET }))!;
    expect(doGerente.itens.map((i) => i.lojaId)).toEqual([ids.vp]);
    expect((await composicaoDaLinha(a, gerente, { linhaId: linha.aluguel, ...SET }, ids.dl))!).toMatchObject({ itens: [], totalCentavos: 0 });
    expect((await composicaoDaLinha(a, gerente, { linhaId: linha.contabilidade, ...SET }))!.itens).toEqual([]);
    expect(await composicaoDaLinha(b, ALCANCE_FLOWFOODS, { linhaId: linha.aluguel, ...SET })).toBeNull();
    expect(await composicaoDaLinha(a, alcanceDe('OPERADOR', [ids.vp]), { linhaId: linha.aluguel, ...SET })).toBeNull();
    // Quem só lança despesas (o administrativo) vê as da loja dele, como na lista.
    expect((await composicaoDaLinha(a, propria(['despesas.lancar'], [ids.vp]), { linhaId: linha.aluguel, ...SET }))!.totalCentavos).toBe(R(3_000));
  });

  it('a página: o número abre a composição com volta para o DRE na mesma visão; endereço torto é a lista normal; o operador não entra', async () => {
    como(alcanceDe('DONO', 'rede'));
    const el = await despesas({ linha: linha.aluguel, de: SET.de, ate: SET.ate });
    const p = el.props as Record<string, any>;
    expect(p.c.totalCentavos).toBe(R(4_500));
    expect(p.voltarDre).toBe('/erp/dre?periodo=2026-09-01&rede=1#linha-aluguel'); // volta na linha de onde veio
    expect(p.periodo).toEqual({ nome: 'Setembro de 2026', situacao: 'encerrado' });
    const h = sp(renderToStaticMarkup(el));
    expect(h).toContain('Aluguel no DRE');
    expect(h).toContain('As 2 despesas que formam R$ 4.500,00');
    expect(h).toContain('a soma de tudo acima');
    expect(h).toContain('Período encerrado');
    expect(h).toContain('R$ 4.500,00');
    expect(h).toContain('30 de 30');
    expect(h).toContain(`/erp/dre/despesas/${ids.d_aluguelVp}?volta=${encodeURIComponent(`/erp/dre/despesas?linha=${linha.aluguel}&de=2026-09-01&ate=2026-09-30`)}`.replace(/&/g, '&amp;'));
    expect(h).not.toContain('Aluguel de outubro');

    comoGerente();
    const g = await despesas({ linha: linha.aluguel, de: SET.de, ate: SET.ate, loja: ids.dl });
    expect((g.props as Record<string, any>).voltarDre).toBe('/erp/dre?periodo=2026-09-01#linha-aluguel');
    const hg = sp(renderToStaticMarkup(g));
    expect(hg).toContain('R$ 3.000,00');
    for (const proibido of ['Aluguel da Tijuca', '1.500,00', 'Unidade Tijuca', ids.dl]) expect(hg, proibido).not.toContain(proibido);

    for (const torto of [{ linha: 'x!', de: SET.de, ate: SET.ate }, { linha: linha.aluguel, de: '2026-09-31', ate: SET.ate }, { linha: linha.aluguel, de: SET.ate, ate: SET.de }, { linha: 'clnaoexiste000000000000000', de: SET.de, ate: SET.ate }]) {
      expect((await despesas(torto)).props, JSON.stringify(torto)).toHaveProperty('lista');
    }
    como(alcanceDe('OPERADOR', [ids.vp]), { tipo: 'loja', lojaId: ids.vp });
    expect(await rodar(() => ErpDespesasPage({ searchParams: { linha: linha.aluguel, ...SET } }))).toEqual({ erro: 'SEM_ACESSO' });
  });

  it('o detalhe da despesa volta para a composição; volta de fora da área é ignorada', async () => {
    como(alcanceDe('DONO', 'rede'));
    const volta = `/erp/dre/despesas?linha=${linha.aluguel}&de=2026-09-01&ate=2026-09-30`;
    const abre = async (v?: string) => tela(await resolver(await ErpDespesaPage({ params: { id: ids.d_aluguelVp }, searchParams: v ? { volta: v } : {} }))).props as Record<string, any>;
    expect((await abre(volta)).voltar).toEqual({ href: volta, rotulo: 'Aluguel no DRE' });
    for (const fora of ['https://mal.example/erp/dre', '//mal.example/x', '/rodolfo/erp/outro/dre', '/erp/../rodolfo/x', '/erp/%2e%2e/rodolfo/erp/x', '/erp/dre\\x']) expect((await abre(fora)).voltar, fora).toBeUndefined();
    expect((await abre()).voltar).toBeUndefined();

    // Decisão 474: editar e pagar levam o mesmo "voltar" (antes, depois de pagar ou editar, o voltar ia para a lista do mês).
    const el = tela(await resolver(await ErpDespesaPage({ params: { id: ids.d_aluguelVp }, searchParams: { volta } })));
    const arvore: ReactElement[] = [];
    const juntar = (n: unknown) => {
      if (Array.isArray(n)) n.forEach(juntar);
      else if (isValidElement(n)) {
        arvore.push(n);
        for (const v of Object.values(n.props as Record<string, unknown>)) if (v && typeof v === 'object') juntar(v);
      }
    };
    juntar((el.type as (p: unknown) => unknown)(el.props));
    const hrefs = arvore.map((e) => (e.props as { href?: string }).href).filter((h): h is string => typeof h === 'string');
    const editar = `/erp/dre/despesas/${ids.d_aluguelVp}/editar?volta=${encodeURIComponent(volta)}`;
    expect(hrefs.filter((h) => h === editar).length).toBe(2);
    expect(hrefs.some((h) => h.endsWith('/editar'))).toBe(false);
    const formularios = arvore.filter((e) => ['FormPagar', 'FormSimples'].includes((e.type as { name?: string }).name ?? ''));
    expect(formularios.length).toBeGreaterThan(0);
    for (const f of formularios) expect((f.props as { volta?: string }).volta).toBe(volta);
    // Sem volta, nada muda: "Editar" sem parâmetro e formulários sem o campo.
    const sem = tela(await resolver(await ErpDespesaPage({ params: { id: ids.d_aluguelVp }, searchParams: {} })));
    const arvoreSem: ReactElement[] = [];
    arvore.length = 0;
    juntar((sem.type as (p: unknown) => unknown)(sem.props));
    arvoreSem.push(...arvore);
    expect(arvoreSem.some((e) => (e.props as { href?: string }).href === `/erp/dre/despesas/${ids.d_aluguelVp}/editar`)).toBe(true);
    for (const f of arvoreSem.filter((e) => ['FormPagar', 'FormSimples'].includes((e.type as { name?: string }).name ?? ''))) expect((f.props as { volta?: string }).volta).toBeUndefined();
  });

  it('decisão 474: com uma loja escolhida no topo, "Ver a rede" diz a rede no DRE, no CMV e nas despesas; editar diz a loja da despesa', async () => {
    como(alcanceDe('DONO', 'rede'), { tipo: 'loja', lojaId: ids.vp });
    const subtitulos = (h: string) => h.match(/(Vila da Penha|Unidade Tijuca|Rede Completa) · Setembro de 2026/g) ?? [];
    expect(subtitulos(await dre({ periodo: SET.de }))).toContain('Vila da Penha · Setembro de 2026');
    expect(subtitulos(await dre({ periodo: SET.de, rede: '1' }))).toEqual(['Rede Completa · Setembro de 2026']);
    expect(subtitulos(await categorias({ periodo: SET.de, rede: '1' }))).toEqual(['Rede Completa · Setembro de 2026']);
    // A lista de despesas sem filtro mostra todas as lojas do acesso: diz a rede, não a loja do topo.
    const lista = sp(renderToStaticMarkup(await resolver(await ErpDespesasPage({ searchParams: { mes: '2026-09' } }))));
    const cabecalho = lista.match(/<header[\s\S]*?<\/header>/)?.[0] ?? '';
    expect(cabecalho).toContain('Rede Completa · setembro de 2026');
    // O cabeçalho também tem o filtro de lojas; o subtítulo é o que vem logo depois do título.
    expect(cabecalho.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).toMatch(/^ Despesas Rede Completa · setembro de 2026 /);
    // Quem alcança só algumas lojas: a lista diz as lojas do acesso.
    comoGerente();
    const doGerente = sp(renderToStaticMarkup(await resolver(await ErpDespesasPage({ searchParams: { mes: '2026-09' } }))));
    expect((doGerente.match(/<header[\s\S]*?<\/header>/)?.[0] ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).toMatch(/^ Despesas Vila da Penha · setembro de 2026 /);
    // Editar: a loja da despesa (como no detalhe), não a do topo.
    como(alcanceDe('DONO', 'rede'), { tipo: 'loja', lojaId: ids.dl });
    const editar = sp(renderToStaticMarkup(await resolver(await ErpEditarDespesaPage({ params: { id: ids.d_aluguelVp }, searchParams: {} }))));
    const cabecalhoEditar = editar.match(/<header[\s\S]*?<\/header>/)?.[0] ?? '';
    expect(cabecalhoEditar).toMatch(/Aluguel[^<]* · Vila da Penha/);
    expect(cabecalhoEditar).not.toContain('Unidade Tijuca');
  });

  it('quem só lança despesas abre a composição sem o "Voltar para o DRE"', async () => {
    como(propria(['despesas.lancar', 'lojas.ver'], [ids.vp]), { tipo: 'loja', lojaId: ids.vp }, [{ id: ids.vp, nome: 'Vila da Penha', ativa: true }]);
    const el = await despesas({ linha: linha.aluguel, de: SET.de, ate: SET.ate, loja: ids.vp });
    expect((el.props as Record<string, any>).voltarDre).toBeNull();
    const h = sp(renderToStaticMarkup(el));
    expect(h).toContain('R$ 3.000,00');
    expect(h).not.toContain('Voltar para o DRE');
  });

  it('nível 1: a composição e o voltar com a raiz do parceiro; volta para outra área é ignorada', async () => {
    atual.visao = { tipo: 'rede' };
    atual.lojas = todas();
    atual.ctx = () => ({ parceiro: A, alcance: ALCANCE_FLOWFOODS, cliente: a, bloqueio: null, podeEscrever: true, sessao: { userId: 'rodolfo', autorNome: 'Rodolfo' } });
    const raiz = `/rodolfo/erp/${A.slug}`;
    const el = tela(await resolver(await NivelUmDespesasPage({ params: { slug: A.slug }, searchParams: { linha: linha.aluguel, de: SET.de, ate: SET.ate } })));
    expect((el.props as Record<string, any>).voltarDre).toBe(`${raiz}/dre?periodo=2026-09-01&rede=1#linha-aluguel`);
    const h = sp(renderToStaticMarkup(el));
    expect(h).toContain(`${raiz}/dre/despesas/${ids.d_aluguelVp}?volta=${encodeURIComponent(`${raiz}/dre/despesas?linha=${linha.aluguel}&de=2026-09-01&ate=2026-09-30`)}`.replace(/&/g, '&amp;'));
    const abre = async (v: string) => tela(await resolver(await NivelUmDespesaPage({ params: { slug: A.slug, id: ids.d_aluguelVp }, searchParams: { volta: v } }))).props as Record<string, any>;
    const volta = `${raiz}/dre/despesas?linha=${linha.aluguel}&de=2026-09-01&ate=2026-09-30`;
    expect((await abre(volta)).voltar).toEqual({ href: volta, rotulo: 'Aluguel no DRE' });
    for (const fora of ['/erp/dre/despesas?linha=x&de=2026-09-01&ate=2026-09-30', '/rodolfo/erp/outro/dre', `${raiz}/../outro/dre`]) expect((await abre(fora)).voltar, fora).toBeUndefined();
  });

  it('o DRE: despesa abre a composição, "pelas compras" o relatório com volta, o CMV a tela por categoria, a receita os lançamentos do mês', async () => {
    como(alcanceDe('DONO', 'rede'));
    const h = await dre({ periodo: '2026-09-10', rede: '1' });
    const amp = (s: string) => s.replace(/&/g, '&amp;');
    expect(h).toContain(amp(`href="/erp/dre/despesas?linha=${linha.aluguel}&de=2026-09-01&ate=2026-09-30"`));
    expect(h).toContain('aria-label="Aluguel, R$ 4.500,00: ver as despesas que formam este número"');
    expect(h).toContain(amp(`href="/erp/dre/despesas?linha=${linha.iptu}&de=2026-09-01&ate=2026-09-30"`));
    // Na rede, as lojas do DRE vão por extenso (sem loja marcada, o relatório usaria a loja escolhida no topo).
    const voltaDoDre = encodeURIComponent('/erp/dre?periodo=2026-09-01&rede=1');
    expect(h).toContain(amp(`href="/erp/compras/relatorios/periodo?de=2026-09-01&ate=2026-09-30&loja=${ids.dl}&loja=${ids.vp}&volta=${voltaDoDre}"`));
    expect(h).toContain(amp('href="/erp/dre/cmv-categorias?periodo=2026-09-01&rede=1"'));
    expect(h).toContain(amp('href="/erp/faturamento?mes=2026-09&rede=1"'));
    expect(h).toContain('Faturamento do mês inteiro:');
    expect(h).toContain('Ver as compras de 01/09 a 30/09');
    expect(h.match(/href="\/erp\/compras\/relatorios\/periodo\?de=2026-09-01&amp;ate=2026-09-30&amp;loja=/g)?.length).toBe(2); // a linha e o painel
    // Linha sem despesa e resultado não viram link.
    expect(h).not.toContain(`linha=${linha.energia}`);
    // O destino soma o número clicado, mesmo com uma loja escolhida no topo (o link da rede leva as lojas por extenso).
    const compras = hrefDe(h, 'Pelas compras (data da nota), R$ 2.021,00')!;
    expect(compras).toBeTruthy();
    expect(await totalDoRelatorio(compras, alcanceDe('DONO', 'rede'), ids.vp)).toBe(R(2_021));
    expect(await totalDoRelatorio(compras, alcanceDe('DONO', 'rede'))).toBe(R(2_021));

    comoGerente();
    const g = await dre({ periodo: '2026-09-10', rede: '1' });
    expect(g).toContain(amp(`href="/erp/dre/despesas?linha=${linha.aluguel}&de=2026-09-01&ate=2026-09-30&loja=${ids.vp}"`));
    expect(g).toContain(amp(`href="/erp/faturamento?mes=2026-09&loja=${ids.vp}"`));
    expect(g).not.toContain(`linha=${linha.contabilidade}`);
    for (const proibido of [ids.dl, 'Unidade Tijuca', '1.500,00']) expect(g, proibido).not.toContain(proibido);

    // Quem vê o DRE sem faturamento e sem compras: só a composição das despesas.
    como(propria(['dre.ver', 'lojas.ver'], 'rede'));
    const s = await dre({ periodo: '2026-09-10', rede: '1' });
    expect(s).toContain(`linha=${linha.aluguel}`);
    for (const proibido of ['Faturamento do mês inteiro', '/erp/faturamento?mes=', '/erp/compras/relatorios/', 'Ver as compras de']) expect(s, proibido).not.toContain(proibido);
  });

  it('período que cruza dois meses: um link de lançamentos para cada mês, e a receita não vira link', async () => {
    const d = (await dreDoPeriodo(a, ALCANCE_FLOWFOODS, { tipo: 'rede' }, '2026-09-15', HOJE))!;
    const cruzado: DreDoPeriodo = { ...d, periodo: { ...d.periodo, inicio: '2026-09-28', fim: '2026-10-04', nome: 'Semana de 28/09 a 04/10' }, ate: '2026-10-04' };
    const pode = { lancarDespesa: false, verFaturamento: true, verPrecos: false, verCompras: false, verEstoque: false, veRede: true };
    const h = sp(renderToStaticMarkup(createElement(TelaDoDre, { d: cruzado, base: '/erp/dre', raiz: '/erp', pode, bloqueio: null })));
    expect(h).toMatch(/Faturamento do mês inteiro: <a [^>]*href="\/erp\/faturamento\?mes=2026-09&amp;rede=1"[^>]*>setembro de 2026<\/a> e <a [^>]*href="\/erp\/faturamento\?mes=2026-10&amp;rede=1"[^>]*>outubro de 2026<\/a>/);
    expect(h).not.toMatch(/aria-label="Receita bruta,/);
  });

  it('CMV por categoria: pelas compras, ao vivo, o valor abre o relatório da categoria; sem compras.ver ou depois de fechar, não abre', async () => {
    como(alcanceDe('DONO', 'rede'));
    const amp = (s: string) => s.replace(/&/g, '&amp;');
    const volta = encodeURIComponent('/erp/dre/cmv-categorias?periodo=2026-09-01&rede=1');
    const h = await categorias({ periodo: '2026-09-10', rede: '1' });
    expect(h).toContain(amp(`href="/erp/compras/relatorios/periodo?de=2026-09-01&ate=2026-09-30&categoria=${cat.PROTEINA}&loja=${ids.dl}&loja=${ids.vp}&volta=${volta}"`));
    expect(h).toContain(amp(`categoria=${cat.MERCEARIA}&loja=${ids.dl}&loja=${ids.vp}&volta=`));
    expect(h).toContain(': ver as compras que formam este número');
    const proteina = hrefDe(h, 'Proteína, R$ 1.521,00')!;
    expect(await totalDoRelatorio(proteina, alcanceDe('DONO', 'rede'), ids.vp)).toBe(R(1_521));
    // Outubro: a Proteína tem um pré-preparo comprado em nota (R$ 80,00, na linha dos pré-preparos do painel; o relatório o somaria
    // na Proteína): o valor não abre. A Mercearia abre, e o destino soma o mesmo.
    const out = await categorias({ periodo: '2026-10-10', rede: '1' });
    expect(out).toContain('Proteína</span>');
    expect(out).not.toContain(amp(`categoria=${cat.PROTEINA}&`));
    const mercearia = hrefDe(out, 'Mercearias e secos, R$ 250,00')!;
    expect(mercearia).toContain(`categoria=${cat.MERCEARIA}`);
    expect(await totalDoRelatorio(mercearia, alcanceDe('DONO', 'rede'), ids.vp)).toBe(R(250));

    comoGerente();
    const g = await categorias({ periodo: '2026-09-10', rede: '1' });
    expect(g).toContain(amp(`categoria=${cat.PROTEINA}&loja=${ids.vp}&volta=`));
    como(propria(['dre.ver', 'lojas.ver'], 'rede'));
    expect(await categorias({ periodo: '2026-09-10', rede: '1' })).not.toContain('/erp/compras/relatorios/');

    // Fecha setembro: a fotografia guarda a categoria da época; o valor não abre o relatório (que usa a categoria de hoje).
    const f = await fecharPeriodo(a, ALCANCE_FLOWFOODS, { inicio: '2026-09-01', ressalvas: [], justificativa: '' }, 'Ana Dona', HOJE);
    expect(f).toMatchObject({ ok: true });
    como(alcanceDe('DONO', 'rede'));
    expect(await categorias({ periodo: '2026-09-10', rede: '1' })).not.toContain('/erp/compras/relatorios/');
    // E no DRE fechado as despesas continuam abrindo, com a composição igual à fotografia.
    for (const pedido of escopos()) {
      const d = (await dreDoPeriodo(a, ALCANCE_FLOWFOODS, pedido, '2026-09-15', HOJE))!;
      expect(d.status).toBe('FECHADO');
      await conferirLinhaALinha(d, pedido.tipo === 'loja' ? pedido.lojaId : undefined);
    }
    expect(await dre({ periodo: '2026-09-10', rede: '1' })).toContain(`linha=${linha.aluguel}`);
    // A composição diz a situação do período, como o DRE: fechado; outubro (em curso), parcial até ontem; recorte digitado, só as datas.
    expect(((await despesas({ linha: linha.aluguel, ...SET })).props as Record<string, any>).periodo).toEqual({ nome: 'Setembro de 2026', situacao: 'fechado' });
    const parcial = await despesas({ linha: linha.aluguel, de: '2026-10-01', ate: '2026-10-21' });
    expect((parcial.props as Record<string, any>).periodo).toEqual({ nome: 'Outubro de 2026', situacao: 'parcial' });
    expect(sp(renderToStaticMarkup(parcial))).toContain('Parcial · até ontem');
    expect(((await despesas({ linha: linha.aluguel, de: '2026-09-05', ate: '2026-09-20' })).props as Record<string, any>).periodo).toBeNull();
  });
});
