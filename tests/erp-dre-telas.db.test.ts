/**
 * ERP 2.2a · as actions e as páginas do DRE, das despesas, dos períodos e do plano (a porta
 * de verdade), com banco:
 *  - o gerente lança pela action: o parceiro, o autor e a chave vêm da sessão e do formulário
 *    aleatório, campo forjado é ignorado; reenviar o mesmo formulário é "já lançada";
 *  - o operador, o gerente de outra loja, o administrativo (que lança sem ver o DRE) e o
 *    parceiro suspenso: cada um só faz o que o acesso dele permite, nada além é gravado;
 *  - as páginas: a despesa é 404 para quem não a alcança (rede, outra loja, outro parceiro,
 *    inexistente); o operador não entra em nada; o administrativo abre as despesas e não o DRE;
 *    o gerente não abre o plano de contas; o DRE do gerente só traz a loja dele;
 *  - o DRE em HTML: parcial ao vivo (dia 16 de 31, até ontem 15/10), CMV "Chega na 2.3",
 *    "sem contar o CMV", nenhum R$ 0,00 no lugar de dado ausente;
 *  - vazamento: perfil com `historico.ver` sem `dre.ver` abre o Histórico (HTML e payload) sem
 *    uma despesa; quem tem `dre.ver` vê.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-dre-telas.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement, isValidElement, type ReactElement } from 'react';
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

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import { dreDoPeriodo } from '@/lib/erp/dre';
import { lancarDespesa } from '@/lib/erp/despesas';
import type { TextosDaDespesa } from '@/lib/erp/despesa-campos';
import * as dreDaSessao from '@/app/erp/dre/actions';
import * as dreDoNivel1 from '@/app/rodolfo/(painel)/erp/[slug]/dre/actions';
import ErpDrePage from '@/app/erp/dre/page';
import ErpDespesasPage from '@/app/erp/dre/despesas/page';
import ErpNovaDespesaPage from '@/app/erp/dre/despesas/nova/page';
import ErpDespesaPage from '@/app/erp/dre/despesas/[id]/page';
import ErpEditarDespesaPage from '@/app/erp/dre/despesas/[id]/editar/page';
import ErpPeriodosPage from '@/app/erp/dre/periodos/page';
import ErpPlanoPage from '@/app/erp/dre/plano/page';
import ErpHistoricoPage from '@/app/erp/historico/page';
import NivelUmDrePage from '@/app/rodolfo/(painel)/erp/[slug]/dre/page';
import { TelaDoDre } from '@/components/erp/telas/dre/dre';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const HOJE = '2026-10-17';

describe.skipIf(!URL_TESTE)('ERP 2.2a · telas e actions do DRE (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `t${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string; slug: string; nome: string; status: string };
  let B: { id: string; slug: string; nome: string; status: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const ids: Record<string, string> = {};

  const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR', lojaIds: string[] | 'rede', extras: string[] = []): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: extras, permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const propria = (permissoes: string[], lojaIds: string[] | 'rede'): Alcance =>
    resolverAlcance({ perfilBase: null, perfilProprio: permissoes, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const como = (alcance: Alcance, autorNome: string, cliente = a, bloqueio: string | null = null, parceiro = A) => {
    atual.ctx = () => ({ parceiro, alcance, cliente, bloqueio, podeEscrever: true, sessao: { userId: 'u', autorNome } });
  };
  const rodar = async <T,>(fn: () => Promise<T>): Promise<T | { redirect: string } | { erro: string }> => {
    try {
      return await fn();
    } catch (e) {
      const url = (e as { url?: string }).url;
      if (url) return { redirect: url };
      return { erro: (e as Error).message };
    }
  };
  /** A página devolve um componente de servidor assíncrono: resolve até chegar na tela (um elemento de componente síncrono). */
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
  const props = async (el: unknown) => (await resolver(el)).props as Record<string, any>;
  const json = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? v.toString() : isValidElement(v) ? { tipo: typeof v.type === 'string' ? v.type : (v.type as { name?: string }).name, ...(v.props as object) } : v));
  const form = (campos: Record<string, string>) => {
    const f = new FormData();
    f.set('envio', globalThis.crypto.randomUUID().replace(/-/g, ''));
    f.set('lojaId', '');
    f.set('linha', 'aluguel');
    f.set('descricao', 'Aluguel');
    f.set('valor', '3.100,00');
    f.set('tipo', 'mes');
    f.set('mes', '2026-10');
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };
  const textos = (p: Partial<TextosDaDespesa> = {}): TextosDaDespesa => ({ envio: globalThis.crypto.randomUUID().replace(/-/g, ''), lojaId: '', linha: 'aluguel', descricao: 'Aluguel', valor: '3.100,00', tipo: 'mes', dia: '', mes: '2026-10', de: '', ate: '', recorrente: false, vencimento: '', ...p });

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = (await db.parceiroFlow.create({ data: { nome: 'Telas DRE A', slug: `tdre-a-${sufixo}`, status: 'ATIVO' } })) as typeof A;
    B = (await db.parceiroFlow.create({ data: { nome: 'Telas DRE B', slug: `tdre-b-${sufixo}`, status: 'ATIVO' } })) as typeof B;
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    for (const [chave, nome] of [['vp', 'Vila da Penha'], ['meier', 'Méier']] as const) {
      const r = await cadastrarLoja(a, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
    }
    const rb = await cadastrarLoja(b, { nome: 'Casa do B' }, 'Beto');
    if (!rb.ok) throw new Error(JSON.stringify(rb));
    ids.lojaB = rb.id;
    atual.lojas = [{ id: ids.vp, nome: 'Vila da Penha', ativa: true }, { id: ids.meier, nome: 'Méier', ativa: true }];
    // Dado de partida: uma despesa da rede, uma da Penha e uma do Méier.
    for (const [chave, p] of [
      ['rede', { descricao: 'Contador do grupo', linha: 'contabilidade', valor: '900,00', lojaId: '' }],
      ['vp', { descricao: 'Luz da Penha', linha: 'energia', valor: '400,00', lojaId: ids.vp }],
      ['meier', { descricao: 'Luz do Méier', linha: 'energia', valor: '300,00', lojaId: ids.meier }],
    ] as const) {
      const r = await lancarDespesa(a, ALCANCE_FLOWFOODS, textos(p), 'Marina', HOJE);
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[`d_${chave}`] = r.id;
    }
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
  });

  it('o gerente lança pela action: autor da sessão, campo forjado ignorado, reenviar o mesmo formulário é "já lançada"', async () => {
    como(alcanceDe('GERENTE', [ids.vp]), 'Gil Gerente');
    const f = form({ lojaId: ids.vp, descricao: 'Conserto da coifa', linha: 'manutencao', valor: '1.234,56', tipo: 'dia', dia: '14/10/2026', parceiroId: B.id, atualizadoPorNome: 'Invasor', chaveIdempotencia: 'ifood:dia:x', origem: 'INTEGRACAO', linhaId: 'forjada' });
    const r = (await rodar(() => dreDaSessao.acaoLancarDespesa(null, f))) as { redirect: string };
    expect(r.redirect).toMatch(new RegExp(`^/erp/dre/despesas/[a-z0-9]+\\?feito=lancada$`));
    const d = await a.despesa.findFirst({ where: { descricao: 'Conserto da coifa' } });
    expect(d).toMatchObject({ valorCentavos: 123456, lojaId: ids.vp, origem: 'MANUAL', atualizadoPorNome: 'Gil Gerente', parceiroId: A.id });
    expect(d!.chaveIdempotencia).toBe(`manual:${f.get('envio')}`);
    // O mesmo formulário de novo (duplo clique): vai para a mesma despesa, avisando.
    const de_novo = (await rodar(() => dreDaSessao.acaoLancarDespesa(null, f))) as { redirect: string };
    expect(de_novo.redirect).toBe(`/erp/dre/despesas/${d!.id}?feito=ja`);
    expect(await a.despesa.count({ where: { descricao: 'Conserto da coifa' } })).toBe(1);
  });

  it('o erro volta ao formulário com a frase no campo, e nada é gravado', async () => {
    como(alcanceDe('GERENTE', [ids.vp]), 'Gil Gerente');
    const antes = await a.despesa.count();
    const r = (await rodar(() => dreDaSessao.acaoLancarDespesa(null, form({ lojaId: ids.vp, valor: '0', descricao: '  ', tipo: 'dia', dia: '99/99/2026' })))) as { ok: false; erros: Record<string, string> };
    expect(r.ok).toBe(false);
    expect(Object.keys(r.erros).sort()).toEqual(['competencia', 'descricao', 'valor']);
    expect(await a.despesa.count()).toBe(antes);
  });

  it('o operador, o gerente de outra loja, o gerente na rede e o parceiro suspenso são recusados pela action', async () => {
    const antes = await a.despesa.count();
    como(alcanceDe('OPERADOR', [ids.vp]), 'Caio');
    expect(await rodar(() => dreDaSessao.acaoLancarDespesa(null, form({ lojaId: ids.vp })))).toMatchObject({ erros: { geral: expect.stringContaining('Seu acesso não inclui') } });
    como(alcanceDe('GERENTE', [ids.meier]), 'Zé');
    expect(await rodar(() => dreDaSessao.acaoLancarDespesa(null, form({ lojaId: ids.vp })))).toMatchObject({ erros: { geral: 'Essa loja não está no seu acesso.' } });
    como(alcanceDe('GERENTE', [ids.vp]), 'Gil');
    expect(await rodar(() => dreDaSessao.acaoLancarDespesa(null, form({ lojaId: '' })))).toMatchObject({ erros: { geral: expect.stringContaining('rede inteira') } });
    como(alcanceDe('DONO', 'rede'), 'Marina', a, 'Parceiro suspenso: só consulta.');
    expect(await rodar(() => dreDaSessao.acaoLancarDespesa(null, form({ lojaId: ids.vp })))).toMatchObject({ erros: { geral: 'Parceiro suspenso: só consulta.' } });
    // Pagar, remover e o resto pela mesma porta.
    como(alcanceDe('OPERADOR', [ids.vp]), 'Caio');
    const f = new FormData();
    f.set('motivo', 'quero apagar');
    f.set('versao', 'x');
    expect(await rodar(() => dreDaSessao.acaoRemoverDespesa(ids.d_vp, null, f))).toMatchObject({ ok: false });
    expect(await rodar(() => dreDaSessao.acaoPagarDespesa(ids.d_vp, null, f))).toMatchObject({ ok: false });
    expect(await rodar(() => dreDaSessao.acaoLancarDoMesPassado(null, f))).toMatchObject({ ok: false });
    expect(await a.despesa.count()).toBe(antes);
    expect(await a.despesa.findUnique({ where: { id: ids.d_vp } })).not.toBeNull();
  });

  it('plano de contas e período pela action: só quem define (rede inteira); o gerente é recusado', async () => {
    const f = new FormData();
    f.set('nome', 'Linha nova');
    f.set('grupo', 'OUTRAS');
    como(alcanceDe('GERENTE', 'rede'), 'Gil');
    expect(await rodar(() => dreDaSessao.acaoCriarLinhaDoPlano(null, f))).toMatchObject({ ok: false, erros: { geral: expect.stringContaining('Seu acesso não inclui') } });
    const g = new FormData();
    g.set('tipo', 'MENSAL');
    g.set('dia_mensal', '15');
    g.set('versao', '');
    expect(await rodar(() => dreDaSessao.acaoSalvarRegraDoPeriodo(null, g))).toMatchObject({ ok: false });
    como(alcanceDe('DONO', [ids.vp]), 'Dona de loja');
    expect(await rodar(() => dreDaSessao.acaoCriarLinhaDoPlano(null, f))).toMatchObject({ ok: false });
    como(alcanceDe('DONO', 'rede'), 'Marina');
    expect(await rodar(() => dreDaSessao.acaoCriarLinhaDoPlano(null, f))).toMatchObject({ ok: true, mensagem: 'Linha criada.' });
    expect(await a.dreLinha.count({ where: { nome: 'Linha nova' } })).toBe(1);
    // A regra do período: o formulário manda o dia do tipo escolhido.
    const antes = await a.regraDoPeriodo.count();
    const r = (await rodar(() => dreDaSessao.acaoSalvarRegraDoPeriodo(null, g))) as { ok: true; mensagem: string };
    expect(r.ok).toBe(true);
    expect(r.mensagem).toMatch(/a partir de \d{2}\/\d{2}\/\d{4}/);
    expect(await a.regraDoPeriodo.count()).toBe(antes + 1);
    await a.regraDoPeriodo.deleteMany({});
  });

  it('o espelho do nível 1 grava pela mesma regra, no parceiro do slug', async () => {
    atual.ctx = () => ({ parceiro: A, alcance: ALCANCE_FLOWFOODS, cliente: a, bloqueio: null, podeEscrever: true, sessao: { userId: 'rodolfo', autorNome: 'Rodolfo' } });
    const r = (await rodar(() => dreDoNivel1.acaoLancarDespesa(A.slug, null, form({ descricao: 'Pelo nível 1', linha: 'sistemas', valor: '99,90' })))) as { redirect: string };
    expect(r.redirect).toMatch(new RegExp(`^/rodolfo/erp/${A.slug}/dre/despesas/[a-z0-9]+\\?feito=lancada$`));
    expect(await a.despesa.findFirst({ where: { descricao: 'Pelo nível 1' } })).toMatchObject({ valorCentavos: 9990, atualizadoPorNome: 'Rodolfo', lojaId: null });
    // Loja do OUTRO parceiro pelo espelho de A: o portão não a acha.
    const fora = await rodar(() => dreDoNivel1.acaoLancarDespesa(A.slug, null, form({ lojaId: ids.lojaB })));
    expect(fora).toMatchObject({ erros: { geral: 'Loja não encontrada no seu acesso.' } });
    expect(await b.despesa.count()).toBe(0);
  });

  it('a página da despesa: 404 para a da rede (gerente de loja), de outra loja, de outro parceiro e inexistente; o operador não entra', async () => {
    como(alcanceDe('GERENTE', [ids.vp]), 'Gil');
    const abre = (id: string) => rodar(() => ErpDespesaPage({ params: { id }, searchParams: {} }).then(resolver));
    expect(await abre(ids.d_rede)).toEqual({ erro: 'NOT_FOUND' });
    expect(await abre(ids.d_meier)).toEqual({ erro: 'NOT_FOUND' });
    expect(await abre('cl0jainexistente0000000000')).toEqual({ erro: 'NOT_FOUND' });
    expect(json(await abre(ids.d_vp))).toContain('Luz da Penha');
    como(alcanceDe('GERENTE', [ids.vp]), 'Beto', b, null, B);
    expect(await abre(ids.d_vp)).toEqual({ erro: 'NOT_FOUND' }); // o id da A, dentro do parceiro B
    como(alcanceDe('OPERADOR', [ids.vp]), 'Caio');
    expect(await abre(ids.d_vp)).toEqual({ erro: 'SEM_ACESSO' });
    expect(await rodar(() => ErpEditarDespesaPage({ params: { id: ids.d_vp } }))).toEqual({ erro: 'SEM_ACESSO' });
    expect(await rodar(() => ErpNovaDespesaPage({ searchParams: {} }))).toEqual({ erro: 'SEM_ACESSO' });
    expect(await rodar(() => ErpDespesasPage({ searchParams: {} }))).toEqual({ erro: 'SEM_ACESSO' });
    expect(await rodar(() => ErpDrePage({ searchParams: {} }))).toEqual({ erro: 'SEM_ACESSO' });
    expect(await rodar(() => ErpPeriodosPage())).toEqual({ erro: 'SEM_ACESSO' });
    expect(await rodar(() => ErpPlanoPage())).toEqual({ erro: 'SEM_ACESSO' });
  });

  it('a lista do gerente traz só as despesas da loja dele; a do dono, as de todas e a da rede', async () => {
    como(alcanceDe('GERENTE', [ids.vp]), 'Gil');
    atual.visao = { tipo: 'loja', lojaId: ids.vp, nome: 'Vila da Penha' };
    atual.lojas = [{ id: ids.vp, nome: 'Vila da Penha', ativa: true }];
    const lista = await props(await ErpDespesasPage({ searchParams: { mes: '2026-10' } }));
    const nomes = (lista.lista.itens as { descricao: string }[]).map((i) => i.descricao);
    expect(nomes).toContain('Luz da Penha');
    expect(nomes).not.toContain('Contador do grupo');
    expect(nomes).not.toContain('Luz do Méier');
    expect(json(lista)).not.toContain('Contador do grupo');
    // Forjar ?loja= de outra loja não abre a de fora do alcance.
    const forjada = await props(await ErpDespesasPage({ searchParams: { mes: '2026-10', loja: ids.meier } }));
    expect(json(forjada.lista)).not.toContain('Luz do Méier');
    atual.lojas = [{ id: ids.vp, nome: 'Vila da Penha', ativa: true }, { id: ids.meier, nome: 'Méier', ativa: true }];
    como(alcanceDe('DONO', 'rede'), 'Marina');
    atual.visao = { tipo: 'rede' };
    const dona = await props(await ErpDespesasPage({ searchParams: { mes: '2026-10' } }));
    expect((dona.lista.itens as { descricao: string }[]).map((i) => i.descricao)).toEqual(expect.arrayContaining(['Luz da Penha', 'Luz do Méier', 'Contador do grupo']));
  });

  it('critério 15: quem só lança despesa (sem ver o DRE) abre as despesas e a de lançar, e não abre o DRE nem o plano', async () => {
    como(propria(['despesas.lancar', 'lojas.ver'], 'rede'), 'Ana Administrativo');
    atual.visao = { tipo: 'rede' };
    const lista = await props(await ErpDespesasPage({ searchParams: { mes: '2026-10' } }));
    expect((lista.lista.itens as unknown[]).length).toBeGreaterThan(0);
    expect(lista.podeVerDre).toBe(false);
    expect(lista.podeLancar).toBe(true);
    expect(await rodar(() => ErpNovaDespesaPage({ searchParams: {} }))).not.toEqual({ erro: 'SEM_ACESSO' });
    expect(await rodar(() => ErpDrePage({ searchParams: {} }))).toEqual({ erro: 'SEM_ACESSO' });
    expect(await rodar(() => ErpPeriodosPage())).toEqual({ erro: 'SEM_ACESSO' });
    expect(await rodar(() => ErpPlanoPage())).toEqual({ erro: 'SEM_ACESSO' });
  });

  it('o gerente abre o DRE e os períodos (só consulta), não o plano; o DRE dele traz só a loja dele', async () => {
    como(alcanceDe('GERENTE', [ids.vp]), 'Gil');
    atual.visao = { tipo: 'loja', lojaId: ids.vp, nome: 'Vila da Penha' };
    atual.lojas = [{ id: ids.vp, nome: 'Vila da Penha', ativa: true }];
    const dre = await props(await ErpDrePage({ searchParams: {} }));
    expect(dre.d.escopo).toMatchObject({ tipo: 'loja', lojaId: ids.vp });
    expect(dre.d.porLoja).toBeNull();
    expect(json(dre)).not.toContain('Contador do grupo');
    // Forjar ?rede=1 ou ?loja= de fora do acesso cai na loja dele.
    for (const q of [{ rede: '1' }, { loja: ids.meier }]) {
      const f = await props(await ErpDrePage({ searchParams: q }));
      expect(f.d.escopo).toMatchObject({ tipo: 'loja', lojaId: ids.vp });
    }
    const periodos = await props(await ErpPeriodosPage());
    expect(periodos.podeMudar).toBe(false);
    expect(await rodar(() => ErpPlanoPage())).toEqual({ erro: 'SEM_ACESSO' });
    como(alcanceDe('DONO', 'rede'), 'Marina');
    atual.visao = { tipo: 'rede' };
    atual.lojas = [{ id: ids.vp, nome: 'Vila da Penha', ativa: true }, { id: ids.meier, nome: 'Méier', ativa: true }];
    const rede = await props(await ErpDrePage({ searchParams: {} }));
    expect(rede.d.escopo).toEqual({ tipo: 'rede' });
    expect(rede.d.porLoja.map((l: { loja: { nome: string } }) => l.loja.nome).sort()).toEqual(['Méier', 'Vila da Penha']);
    expect((await props(await ErpPeriodosPage())).podeMudar).toBe(true);
    expect(await rodar(() => ErpPlanoPage())).not.toEqual({ erro: 'SEM_ACESSO' });
    const n1 = await props(await NivelUmDrePage({ params: { slug: A.slug }, searchParams: {} }));
    expect(n1.raiz).toBe(`/rodolfo/erp/${A.slug}`);
  });

  it('critérios 5 e 12 no HTML: parcial ao vivo, CMV "Chega na 2.3", "sem contar o CMV" e nenhum R$ 0,00 no lugar de dado ausente', async () => {
    const d = (await dreDoPeriodo(a, ALCANCE_FLOWFOODS, { tipo: 'loja', lojaId: ids.vp }, '2026-10-16', '2026-10-16'))!;
    const el = createElement(TelaDoDre, { d, base: '/erp/dre', raiz: '/erp', contexto: 'Rede Completa', pode: { lancarDespesa: true, verFaturamento: true, verPrecos: true, veRede: true }, bloqueio: null });
    const html = renderToStaticMarkup(el).replace(/ /g, ' ');
    expect(html).toContain('16 de 31');
    expect(html).toContain('até ontem, 15/10');
    expect(html).toContain('Parcial');
    expect(html).toContain('Chega na 2.3');
    expect(html).toContain('sem contar o CMV');
    expect(html).toContain('Resultado do período, antes das despesas da rede');
    // A luz da Penha (R$ 400,00 de outubro inteiro) apropriada até ontem: 400 × 15/31 = 193,55; sem R$ 0,00 em linha alguma.
    expect(html).toContain('R$ 193,55');
    expect(html.match(/.{60}R\$ 0,00.{40}/)?.[0] ?? null).toBeNull();
    // A rede mostra o que é da rede e o "Por loja".
    const rede = (await dreDoPeriodo(a, ALCANCE_FLOWFOODS, { tipo: 'rede' }, '2026-10-16', '2026-10-16'))!;
    const htmlRede = renderToStaticMarkup(createElement(TelaDoDre, { d: rede, base: '/erp/dre', raiz: '/erp', contexto: 'Rede Completa', pode: { lancarDespesa: true, verFaturamento: true, verPrecos: true, veRede: true }, bloqueio: null })).replace(/ /g, ' ');
    expect(htmlRede).toContain('Por loja');
    expect(htmlRede).toContain('Contabilidade');
    expect(htmlRede.match(/.{80}R\$ 0,00.{40}/)?.[0] ?? null).toBeNull();
  });

  it('critério 15: perfil com historico.ver e sem dre.ver abre o Histórico sem uma despesa (HTML e payload); quem vê o DRE vê', async () => {
    const PROIBIDO = /Contador do grupo|Luz da Penha|Conserto da coifa|DRE e despesas|Linha do DRE|Período do DRE|"Despesa"/;
    como(alcanceDe('OPERADOR', 'rede', ['historico.ver']), 'Hugo');
    const tudo = await ErpHistoricoPage({ searchParams: {} });
    expect(json(tudo).match(PROIBIDO)?.[0] ?? null).toBeNull();
    expect(renderToStaticMarkup(createElement(() => tudo as never)).match(PROIBIDO)?.[0] ?? null).toBeNull();
    const filtrado = await ErpHistoricoPage({ searchParams: { entidade: 'Despesa' } });
    expect(json(filtrado).match(PROIBIDO)?.[0] ?? null).toBeNull();
    expect(renderToStaticMarkup(createElement(() => filtrado as never))).not.toMatch(PROIBIDO);
    // Quem tem os dois vê as linhas e o filtro.
    como(alcanceDe('OPERADOR', 'rede', ['historico.ver', 'dre.ver']), 'Helena');
    const comAcesso = await ErpHistoricoPage({ searchParams: { entidade: 'Despesa' } });
    const htmlOk = renderToStaticMarkup(createElement(() => comAcesso as never)).replace(/ /g, ' ');
    expect(htmlOk).toContain('Contador do grupo');
    expect(htmlOk).toContain('DRE e despesas');
    como(alcanceDe('DONO', 'rede'), 'Marina');
    const dona = await ErpHistoricoPage({ searchParams: {} });
    expect(renderToStaticMarkup(createElement(() => dona as never)).replace(/ /g, ' ')).toContain('R$ 900,00');
  });
});
