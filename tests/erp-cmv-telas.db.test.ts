/**
 * ERP 2.3 · o CMV nas telas (a página de verdade, com banco): o que cada pessoa recebe no HTML.
 *
 * Setembro de 2026 já terminou (o relógio dos testes é o de hoje, 17/10): a Vila da Penha tem estoque e fechamento (real R$ 20.300,00),
 * a Unidade Entrega só compra (R$ 4.321,00) e o Centro não tem nada.
 *  - o gerente da Vila da Penha (390 px na prova visual) recebe SÓ a loja dele: nem pela URL (`?rede=1`, `?loja=<Unidade Entrega>`) vem a Delivery, o
 *    Centro, o R$ 4.321,00 delas ou a base da conta (`entrada`, ids do fechamento); isso vale ao vivo e depois de fechar (fotografia);
 *  - o operador não abre o DRE;
 *  - o link "Ver as notas" só aparece com `compras.ver`, e "Ver o estoque" só com `estoque.ver`;
 *  - o Histórico: sem `dre.ver` nada do fechamento nem do CMV; com `dre.ver`, o CMV da rede e a fonte;
 *  - a fotografia nova mostra o painel; o fechado antes do CMV (v1) mostra "não apurado neste fechamento";
 *  - o "Em breve" do CMV sumiu, e nenhum R$ 0,00 no lugar de dado ausente.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-cmv-telas.db.test.ts
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
import { cadastrarInsumoDeTeste as cadastrarInsumo } from './erp-db-apoio';
import { fecharPeriodo } from '@/lib/erp/dre-fechamento';
import { listarHistorico } from '@/lib/erp/historico';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import ErpDrePage from '@/app/erp/dre/page';
import ErpHistoricoPage from '@/app/erp/historico/page';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';
import { abertura, BRT, faturamento, fechamentoDeEstoque, movimento, nota, periodoRegistrado, R, sp } from './erp-cmv-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;

describe.skipIf(!URL_TESTE)('ERP 2.3 · telas do CMV (Postgres real)', { timeout: 180_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `m${globalThis.crypto.randomUUID().slice(0, 8)}`;
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
    A = (await db.parceiroFlow.create({ data: { nome: 'Telas CMV', slug: `tcmv-${sufixo}`, status: 'ATIVO' } })) as typeof A;
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
    const i = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', nome: 'Insumo CMV', unidade: 'KG', conteudo: '1', preco: '10,00', conservacao: 'SECO' });
    if (!i.ok) throw new Error(JSON.stringify(i));
    const set = await periodoRegistrado(a, '2026-09-10');
    await abertura(a, ids.vp, BRT('2026-09-01', '09:00'), 10_000);
    await nota(a, i.id, { lojaId: ids.vp, numero: 'S1', data: '2026-09-10', centavos: R(22_000), lancadaEm: BRT('2026-09-10', '12:00'), movimenta: true });
    await fechamentoDeEstoque(a, i.id, ids.vp, set, { fim: '2026-09-30', quando: BRT('2026-09-30', '18:00'), retrato: 12_000 });
    await movimento(a, i.id, ids.vp, R(-300), BRT('2026-09-30', '20:00'), 'Requisição de 30/09');
    await nota(a, i.id, { lojaId: ids.dl, numero: 'D1', data: '2026-09-12', centavos: R(4_321), lancadaEm: BRT('2026-09-12', '12:00') });
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id]);
    await db?.$disconnect();
  });

  it('a dona vê a rede: o painel compra × real, o "misto" e nenhum "Em breve" nem R$ 0,00 no lugar de dado ausente', async () => {
    como(alcanceDe('DONO', 'rede'));
    const h = await html({ periodo: '2026-09-10', rede: '1' });
    expect(h).toContain('CMV: compra × real');
    expect(h).toContain('misto: real em Vila da Penha; pelas compras em Unidade Entrega (estoque não aberto); sem o CMV de Centro');
    expect(h).toContain('R$ 20.300,00');
    expect(h).toContain('R$ 24.621,00'); // o CMV da rede: o real da Penha + a compra da Unidade
    expect(h).toContain('R$ 26.321,00'); // a compra da rede, pela data da nota
    expect(h).toContain('O estoque subiu R$ 1.700,00 (de R$ 10.000,00 para R$ 11.700,00)');
    expect(h).toContain('Ver as notas');
    expect(h).not.toContain('Em breve');
    expect(h).not.toContain('O CMV ainda não entra');
    expect(h.match(/.{60}R\$ 0,00.{40}/)?.[0] ?? null).toBeNull();
  });

  it('critério 16: o gerente da Vila da Penha recebe só a loja dele, também pela URL (`?rede=1`, `?loja=<Unidade Entrega>`); nada da Unidade Entrega, do Centro nem da base da conta', async () => {
    como(alcanceDe('GERENTE', [ids.vp]), { tipo: 'loja', lojaId: ids.vp });
    atual.lojas = [{ id: ids.vp, nome: 'Vila da Penha', ativa: true }];
    const consultas: Record<string, string>[] = [{ periodo: '2026-09-10' }, { periodo: '2026-09-10', rede: '1' }, { periodo: '2026-09-10', loja: ids.dl }, { periodo: '2026-09-10', loja: ids.ct }];
    for (const query of consultas) {
      const h = await html(query);
      expect(h, JSON.stringify(query)).toContain('R$ 20.300,00');
      expect(h).toContain('CMV: compra × real');
      for (const proibido of ['4.321,00', 'Unidade Entrega', 'Centro', 'misto', ids.dl, ids.ct, 'comprasReais', 'fechamentoId', 'retratoEm', 'entrada']) expect(h, `${JSON.stringify(query)} não pode ter ${proibido}`).not.toContain(proibido);
    }
    atual.lojas = [{ id: ids.vp, nome: 'Vila da Penha', ativa: true }, { id: ids.dl, nome: 'Unidade Entrega', ativa: true }, { id: ids.ct, nome: 'Centro', ativa: true }];
  });

  it('o operador não abre o DRE; quem não tem compras nem estoque não recebe os links do painel', async () => {
    como(alcanceDe('OPERADOR', [ids.vp]), { tipo: 'loja', lojaId: ids.vp });
    expect(await rodar(() => ErpDrePage({ searchParams: {} }))).toEqual({ erro: 'SEM_ACESSO' });
    como(propria(['dre.ver', 'lojas.ver'], 'rede'));
    const h = await html({ periodo: '2026-09-10', rede: '1' });
    expect(h).toContain('CMV: compra × real');
    expect(h).not.toContain('Ver as notas');
    expect(h).not.toContain('Ver o estoque');
  });

  it('fechar guarda o CMV: a fotografia nova mostra o painel igual ao ao vivo, e o gerente lê só a loja dele dela', async () => {
    como(alcanceDe('DONO', 'rede'));
    const vivo = await html({ periodo: '2026-09-10', rede: '1' });
    const r = await fecharPeriodo(a, ALCANCE_FLOWFOODS, { inicio: '2026-09-01', ressalvas: [], justificativa: '' }, 'Ana Dona');
    expect(r).toMatchObject({ ok: true, versao: 1 });
    const fechado = await html({ periodo: '2026-09-10', rede: '1' });
    expect(fechado).toContain('Período fechado');
    expect(fechado).toContain('CMV: compra × real');
    expect(fechado).toContain('misto: real em Vila da Penha; pelas compras em Unidade Entrega (estoque não aberto); sem o CMV de Centro');
    expect(fechado).toContain('O estoque subiu R$ 1.700,00');
    for (const trecho of ['R$ 20.300,00', 'R$ 22.000,00', 'R$ 24.621,00', 'R$ 26.321,00']) {
      expect(vivo).toContain(trecho);
      expect(fechado).toContain(trecho);
    }

    como(alcanceDe('GERENTE', [ids.vp]), { tipo: 'loja', lojaId: ids.vp });
    atual.lojas = [{ id: ids.vp, nome: 'Vila da Penha', ativa: true }];
    const doGerente = await html({ periodo: '2026-09-10', rede: '1' });
    expect(doGerente).toContain('R$ 20.300,00');
    for (const proibido of ['4.321,00', 'Unidade Entrega', 'Centro', ids.dl, 'comprasReais', 'fechamentoId', 'retratoEm']) expect(doGerente).not.toContain(proibido);
  });

  it('o Histórico: com `dre.ver` o fechamento traz o CMV da rede e a fonte; sem `dre.ver` não vem nada (nem pelo filtro)', async () => {
    const com = await listarHistorico(a, { entidade: 'PeriodoApuracao', verPrecos: false, verDre: true, limite: 20 });
    expect(sp(json(com))).toContain('R$ 24.621,00 (misto)');
    como(propria(['historico.ver', 'lojas.ver'], 'rede'));
    const sem = await listarHistorico(a, { entidade: 'PeriodoApuracao', verPrecos: false, verDre: false, limite: 20 });
    expect(json(sem)).not.toContain('misto');
    expect(json(sem)).not.toContain('CMV');
    const pagina = sp(renderToStaticMarkup((await resolver(await ErpHistoricoPage({ searchParams: { entidade: 'PeriodoApuracao' } }))) as ReactElement));
    expect(pagina).not.toContain('misto');
    expect(pagina).not.toContain('Fechou');
  });
});
