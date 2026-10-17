/**
 * ERP 2.4 · o farol nas telas (a página de verdade, com banco): o que cada pessoa recebe no HTML.
 *
 * Setembro de 2026 terminou (o relógio dos testes é o de hoje, 17/10): a Vila da Penha vende na Loja (R$ 100.000,00; ano passado
 * R$ 80.000,00), a Unidade Entrega no Delivery (R$ 30.000,00; ano passado R$ 40.000,00) e o Centro na Loja (R$ 10.000,00 nos dois anos).
 *  - a dona vê o painel "Faróis do período", o bloco de cada canal, a meta de crescimento e a régua com a palavra;
 *  - o gerente da Vila da Penha recebe SÓ a loja dele, também pela URL (`?rede=1`, `?loja=<outra>`): nada do ano passado, do canal ou
 *    do nome das outras lojas, ao vivo e depois de fechar (fotografia v3);
 *  - o operador e quem só vê o Histórico não abrem o DRE, e o Histórico sem `dre.ver` não traz nada de farol nem de fechamento;
 *  - o fechado mostra o mesmo farol do ao vivo.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-farol-telas.db.test.ts
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
import { salvarCanaisDaLoja } from '@/lib/erp/faturamento';
import { fecharPeriodo } from '@/lib/erp/dre-fechamento';
import { salvarMetas, situacaoDasMetas } from '@/lib/erp/dre-metas';
import { listarHistorico } from '@/lib/erp/historico';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import ErpDrePage from '@/app/erp/dre/page';
import ErpHistoricoPage from '@/app/erp/historico/page';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';
import { faturamento, sp } from './erp-cmv-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;

describe.skipIf(!URL_TESTE)('ERP 2.4 · telas do farol (Postgres real)', { timeout: 180_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `f${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string; slug: string; nome: string; status: string };
  let a: ClienteDoParceiro;
  const ids: Record<string, string> = {};

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
  const html = async (query: Record<string, string> = { periodo: '2026-09-10' }) => {
    const el = await ErpDrePage({ searchParams: query });
    return sp(renderToStaticMarkup(el as ReactElement));
  };
  const json = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? v.toString() : isValidElement(v) ? { tipo: typeof v.type === 'string' ? v.type : (v.type as { name?: string }).name, ...(v.props as object) } : v));

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = (await db.parceiroFlow.create({ data: { nome: 'Telas Farol', slug: `tfarol-${sufixo}`, status: 'ATIVO' } })) as typeof A;
    a = doParceiro(A.id, db);
    for (const [chave, nome, canal] of [['vp', 'Vila da Penha', 'LOJA'], ['dl', 'Unidade Entrega', 'DELIVERY_PROPRIO'], ['ct', 'Centro', 'LOJA']] as const) {
      const r = await cadastrarLoja(a, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
      await a.loja.update({ where: { id: r.id }, data: { criadoEm: new Date('2026-01-10T12:00:00Z') } });
      expect((await salvarCanaisDaLoja(a, r.id, [canal], ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'], 'Marina')).ok).toBe(true);
    }
    atual.lojas = [{ id: ids.vp, nome: 'Vila da Penha', ativa: true }, { id: ids.dl, nome: 'Unidade Entrega', ativa: true }, { id: ids.ct, nome: 'Centro', ativa: true }];
    await faturamento(a, ids.vp, 'LOJA', '2026-09-01', '2026-09-30', { '2026-09-10': 100_000 });
    await faturamento(a, ids.dl, 'DELIVERY_PROPRIO', '2026-09-01', '2026-09-30', { '2026-09-10': 30_000 });
    await faturamento(a, ids.ct, 'LOJA', '2026-09-01', '2026-09-30', { '2026-09-10': 10_000 });
    await faturamento(a, ids.vp, 'LOJA', '2025-09-01', '2025-09-30', { '2025-09-10': 80_000 });
    await faturamento(a, ids.dl, 'DELIVERY_PROPRIO', '2025-09-01', '2025-09-30', { '2025-09-10': 40_000 });
    await faturamento(a, ids.ct, 'LOJA', '2025-09-01', '2025-09-30', { '2025-09-10': 10_000 });
    const v = (await situacaoDasMetas(a, ALCANCE_FLOWFOODS, '2026-09-05'))!.versao;
    expect(await salvarMetas(a, ALCANCE_FLOWFOODS, { valores: { 'receita-loja': '5', 'receita-delivery': '0' }, versao: v }, 'Marina', '2026-09-05')).toMatchObject({ ok: true });
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id]);
    await db?.$disconnect();
  });

  it('a dona vê o painel de faróis, um bloco por canal com a meta de crescimento, e a régua com a palavra (a cor nunca sozinha)', async () => {
    como(alcanceDe('DONO', 'rede'));
    const h = await html({ periodo: '2026-09-10', rede: '1' });
    expect(h).toContain('Faróis do período');
    expect(h).toContain('3 lojas incluídas');
    expect(h).toContain('Meta de crescimento');
    // Loja: R$ 110.000,00 contra R$ 90.000,00 = +22,2 % (meta 5 %): azul. Delivery: −25,0 % (meta 0): vermelho.
    expect(h).toContain('R$ 110.000,00');
    expect(h).toContain('R$ 90.000,00');
    expect(h).toContain('bem melhor que a meta');
    expect(h).toContain('muito pior que a meta');
    expect(h).toContain('aria-label="Farol: bem melhor que a meta, +17,2 pp, faixa 1 de 5"');
    expect(h).toContain('text-farol-azul');
    expect(h).toContain('text-farol-vermelho');
    expect(h).toContain('id="linha-receita-loja"'); // a âncora do painel
    expect(h).toContain('Compra e despesa são da loja, não do canal');
    // Nenhum card ou linha ganha a cor: só o texto e o glifo.
    expect(h).not.toMatch(/(?:border|bg)-farol-/);
    expect(h).not.toContain('Em breve');
  });

  it('o gerente da Vila da Penha recebe só a loja dele, também pela URL: nada do ano passado, do canal nem do nome das outras lojas', async () => {
    como(alcanceDe('GERENTE', [ids.vp]), { tipo: 'loja', lojaId: ids.vp });
    atual.lojas = [{ id: ids.vp, nome: 'Vila da Penha', ativa: true }];
    const consultas: Record<string, string>[] = [{ periodo: '2026-09-10' }, { periodo: '2026-09-10', rede: '1' }, { periodo: '2026-09-10', loja: ids.dl }, { periodo: '2026-09-10', loja: ids.ct }];
    for (const query of consultas) {
      const h = await html(query);
      expect(h, JSON.stringify(query)).toContain('Faróis do período');
      expect(h).toContain('R$ 100.000,00');
      expect(h).toContain('R$ 80.000,00'); // o ano passado DELE
      expect(h).not.toMatch(/<h3[^>]*>Delivery próprio<\/h3>/); // a Penha só vende na Loja: um bloco de canal só
      expect(h.match(/<h3[^>]*>/g)).toHaveLength(1);
      for (const proibido of ['Unidade Entrega', 'Centro', 'R$ 40.000,00', 'R$ 110.000,00', 'R$ 90.000,00', '3 lojas', ids.dl, ids.ct, 'anoPassado', 'entrada']) expect(h, `${JSON.stringify(query)} não pode ter ${proibido}`).not.toContain(proibido);
    }
    atual.lojas = [{ id: ids.vp, nome: 'Vila da Penha', ativa: true }, { id: ids.dl, nome: 'Unidade Entrega', ativa: true }, { id: ids.ct, nome: 'Centro', ativa: true }];
  });

  it('o operador e quem só vê o Histórico não abrem o DRE; quem tem dre.ver sem compras nem estoque vê o farol', async () => {
    como(alcanceDe('OPERADOR', [ids.vp]), { tipo: 'loja', lojaId: ids.vp });
    expect(await rodar(() => ErpDrePage({ searchParams: {} }))).toEqual({ erro: 'SEM_ACESSO' });
    como(propria(['historico.ver', 'lojas.ver'], 'rede'));
    expect(await rodar(() => ErpDrePage({ searchParams: { periodo: '2026-09-10', rede: '1' } }))).toEqual({ erro: 'SEM_ACESSO' });
    como(propria(['dre.ver', 'lojas.ver'], 'rede'));
    expect(await html({ periodo: '2026-09-10', rede: '1' })).toContain('Faróis do período');
  });

  it('fechar guarda o farol (fotografia v3): o fechado mostra o mesmo farol do ao vivo, e o gerente lê só a loja dele', async () => {
    como(alcanceDe('DONO', 'rede'));
    const vivo = await html({ periodo: '2026-09-10', rede: '1' });
    const r = await fecharPeriodo(a, ALCANCE_FLOWFOODS, { inicio: '2026-09-01', ressalvas: [], justificativa: '' }, 'Ana Dona');
    expect(r).toMatchObject({ ok: true, versao: 1 });
    const fechado = await html({ periodo: '2026-09-10', rede: '1' });
    expect(fechado).toContain('Período fechado');
    for (const trecho of ['Faróis do período', 'R$ 110.000,00', 'R$ 90.000,00', 'aria-label="Farol: bem melhor que a meta, +17,2 pp, faixa 1 de 5"', 'muito pior que a meta']) {
      expect(vivo, trecho).toContain(trecho);
      expect(fechado, trecho).toContain(trecho);
    }
    como(alcanceDe('GERENTE', [ids.vp]), { tipo: 'loja', lojaId: ids.vp });
    atual.lojas = [{ id: ids.vp, nome: 'Vila da Penha', ativa: true }];
    const doGerente = await html({ periodo: '2026-09-10', rede: '1' });
    expect(doGerente).toContain('R$ 80.000,00');
    for (const proibido of ['Unidade Entrega', 'Centro', 'R$ 40.000,00', 'R$ 90.000,00', 'R$ 110.000,00', ids.dl, ids.ct, 'anoPassado']) expect(doGerente).not.toContain(proibido);
  });

  it('o Histórico: sem `dre.ver` não vem nada do fechamento nem de meta de crescimento; com `dre.ver`, a meta de crescimento aparece escrita', async () => {
    const com = await listarHistorico(a, { entidade: 'DreMeta', verPrecos: false, verDre: true, limite: 20 });
    expect(sp(json(com))).toContain('crescimento sobre o ano passado');
    expect(sp(json(com))).toContain('+5,0 %');
    como(propria(['historico.ver', 'lojas.ver'], 'rede'));
    const sem = await listarHistorico(a, { verPrecos: false, verDre: false, limite: 50 });
    expect(json(sem)).not.toContain('crescimento');
    const pagina = sp(renderToStaticMarkup((await resolver(await ErpHistoricoPage({ searchParams: {} }))) as ReactElement));
    expect(pagina).not.toContain('crescimento');
    expect(pagina).not.toContain('Fechou');
  });
});
