/**
 * ERP I.2a · as telas do CMV por categoria e das metas por categoria (a página e a action de verdade, com banco): o que cada pessoa recebe
 * no HTML e o que cada uma consegue gravar.
 *
 * Outubro de 2026 em curso (o relógio dos testes fixa hoje em 22/10): a Vila da Penha (VP) comprou R$ 12.000,00 de Proteína e R$ 5.000,00 de
 * Mercearias; a Unidade Tijuca (DL, só delivery) comprou R$ 3.210,00 de Proteína. Setembro foi fechado (fotografia v4) e agosto é um fechado
 * "de antes da I.2".
 *  - a dona vê a rede e cada loja; o gerente da VP recebe SÓ a VP, também por `?rede=1` e `?loja=<DL>` (nada da DL no HTML);
 *  - comprador (sem `dre.ver`) e operador não abrem o painel; só quem tem `metas.editar` abre as metas e grava;
 *  - o formulário das metas da dona traz o modelo de 32 %, o total e o aviso de soma; o da loja traz "segue a rede" e "personalizar";
 *  - o fechado antes da I.2 diz "não apurado por categoria"; o fechado da v4 mostra o painel.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-cmv-categorias-telas.db.test.ts
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
import { aplicarModelo32 } from '@/lib/erp/cmv-categorias-campos';
import { fecharPeriodo } from '@/lib/erp/dre-fechamento';
import { salvarMetasPorCategoria, situacaoDasMetasPorCategoria } from '@/lib/erp/metas-categorias';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import ErpCmvPorCategoriaPage from '@/app/erp/dre/cmv-categorias/page';
import ErpMetasPorCategoriaPage from '@/app/erp/dre/metas-categorias/page';
import * as acoesDaSessao from '@/app/erp/dre/actions';
import { BRT, faturamento, nota, R, sp } from './erp-cmv-apoio';
import { cadastrarInsumoDeTeste as cadastrarInsumo, criarPeriodoFechadoDeTeste, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;

describe.skipIf(!URL_TESTE)('ERP I.2a · telas do CMV por categoria e das metas por categoria (Postgres real)', { timeout: 180_000 }, () => {
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
    A = (await db.parceiroFlow.create({ data: { nome: 'Telas I2a', slug: `tc-${sufixo}`, status: 'ATIVO' } })) as typeof A;
    a = doParceiro(A.id, db);
    for (const [chave, nome, canal] of [['vp', 'Vila da Penha', 'LOJA'], ['dl', 'Unidade Tijuca', 'DELIVERY_PROPRIO']] as const) {
      const r = await cadastrarLoja(a, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
      await a.loja.update({ where: { id: r.id }, data: { criadoEm: new Date('2026-01-10T12:00:00Z') } });
      expect((await salvarCanaisDaLoja(a, r.id, [canal], ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'], 'Marina')).ok).toBe(true);
    }
    atual.lojas = [{ id: ids.vp, nome: 'Vila da Penha', ativa: true }, { id: ids.dl, nome: 'Unidade Tijuca', ativa: true }];
    await faturamento(a, ids.vp, 'LOJA', '2026-09-01', '2026-10-31', { '2026-09-10': 100_000, '2026-10-10': 100_000 });
    await faturamento(a, ids.dl, 'DELIVERY_PROPRIO', '2026-09-01', '2026-10-31', { '2026-09-10': 30_000, '2026-10-10': 30_000 });
    await garantirCategoriasPadrao(a);
    for (const c of await listarCategorias(a)) if (c.chave) cat[c.chave] = c.id;
    const novo = async (chave: string, nome: string) => {
      const r = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', nome, unidade: 'KG', conteudo: '1', preco: '10,00', conservacao: 'SECO', categoriaId: cat[chave] });
      if (!r.ok) throw new Error(JSON.stringify(r));
      return r.id;
    };
    const frango = await novo('PROTEINA', 'Frango');
    const farinha = await novo('MERCEARIA', 'Farinha');
    const n = (insumo: string, numero: string, data: string, reais: number, lojaId: string) => nota(a, insumo, { lojaId, numero, data, centavos: R(reais), lancadaEm: BRT(data, '12:00') });
    await n(frango, 'O1', '2026-10-05', 12_000, ids.vp);
    await n(farinha, 'O2', '2026-10-06', 5_000, ids.vp);
    await n(frango, 'D1', '2026-10-11', 3_210, ids.dl);
    await n(frango, 'S1', '2026-09-05', 8_000, ids.vp);
    // O modelo de 32 % vale desde setembro; setembro é fechado (v4) e agosto é um fechado "de antes da I.2".
    const s = (await situacaoDasMetasPorCategoria(a, alcanceDe('DONO', 'rede'), null, '2026-09-15'))!;
    const campos = aplicarModelo32(await listarCategorias(a)).campos;
    const r = await salvarMetasPorCategoria(a, alcanceDe('DONO', 'rede'), { lojaId: null, versao: s.versao, total: '32', campos }, 'Marina', '2026-09-15');
    if (!r.ok) throw new Error(JSON.stringify(r));
    const f = await fecharPeriodo(a, ALCANCE_FLOWFOODS, { inicio: '2026-09-01', ressalvas: [], justificativa: '' }, 'Ana Dona', '2026-10-22');
    if (!f.ok) throw new Error(JSON.stringify(f));
    await a.transacao((tx) => criarPeriodoFechadoDeTeste(tx, { nome: 'Agosto de 2026', inicio: '2026-08-01', fim: '2026-08-31' }));
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id]);
    await db?.$disconnect();
  });

  it('a dona vê o painel da rede: total do DRE, categorias, maiores desvios, o aviso de parcial e a Proteína amarela com a régua e a palavra', async () => {
    como(alcanceDe('DONO', 'rede'));
    const h = await painel({ rede: '1', periodo: '2026-10-10' });
    expect(h).toContain('CMV por categoria');
    expect(h).toContain('Parcial · até ontem');
    expect(h).toContain('R$ 20.210,00'); // o CMV da rede: 12.000 + 5.000 + 3.210 pelas compras
    expect(h).toContain('Maiores desvios');
    expect(h).toContain('Proteína');
    expect(h).toContain('Pré-preparos (variação do estoque)');
    expect(h).toContain('Metas por categoria'); // o convite para definir as metas
    expect(h).toContain('um pouco pior'); // Proteína 15,21 % da receita da rede... contra 11 %: a faixa vem com a palavra
    expect(h).not.toContain('Em breve');
    expect(h.match(/.{60}R\$ 0,00.{40}/)?.[0] ?? null).toBeNull();
  });

  it('o painel de uma loja traz só a loja; as caixas, o sumário e o link para o DRE ficam no escopo dela', async () => {
    como(alcanceDe('DONO', 'rede'), { tipo: 'loja', lojaId: ids.dl });
    const h = await painel({ loja: ids.dl, periodo: '2026-10-10' });
    expect(h).toContain('Unidade Tijuca');
    expect(h).toContain('R$ 3.210,00');
    expect(h).not.toContain('R$ 5.000,00');
    expect(h).toContain(`/erp/dre?periodo=2026-10-01&amp;loja=${ids.dl}`);
  });

  it('o gerente da Vila da Penha recebe só a loja dele, também por `?rede=1` e `?loja=<Unidade Tijuca>`: nada da outra loja no HTML', async () => {
    como(alcanceDe('GERENTE', [ids.vp]), { tipo: 'loja', lojaId: ids.vp });
    atual.lojas = [{ id: ids.vp, nome: 'Vila da Penha', ativa: true }];
    for (const query of [{ periodo: '2026-10-10' }, { periodo: '2026-10-10', rede: '1' }, { periodo: '2026-10-10', loja: ids.dl }, { periodo: '2026-09-10', rede: '1' }] as Record<string, string>[]) {
      const h = await painel(query);
      expect(h, JSON.stringify(query)).toContain('Vila da Penha');
      expect(h).toContain('R$ 12.000,00'.replace('12.000', query.periodo === '2026-09-10' ? '8.000' : '12.000'));
      for (const proibido of ['Unidade Tijuca', '3.210,00', ids.dl, 'Ver a rede', 'Metas por categoria', 'lojasDoEscopo']) expect(h, `${JSON.stringify(query)} não pode ter ${proibido}`).not.toContain(proibido);
    }
    atual.lojas = [{ id: ids.vp, nome: 'Vila da Penha', ativa: true }, { id: ids.dl, nome: 'Unidade Tijuca', ativa: true }];
  });

  it('comprador (sem `dre.ver`) e operador não abrem o painel nem as metas; o gerente não abre as metas (exigem a rede inteira)', async () => {
    como(propria(['compras.ver', 'compras.lancar', 'lojas.ver'], 'rede'));
    expect(await rodar(() => ErpCmvPorCategoriaPage({ searchParams: {} }))).toEqual({ erro: 'SEM_ACESSO' });
    expect(await rodar(() => ErpMetasPorCategoriaPage({ searchParams: {} }))).toEqual({ erro: 'SEM_ACESSO' });
    como(alcanceDe('OPERADOR', [ids.vp]), { tipo: 'loja', lojaId: ids.vp });
    expect(await rodar(() => ErpCmvPorCategoriaPage({ searchParams: {} }))).toEqual({ erro: 'SEM_ACESSO' });
    como(alcanceDe('GERENTE', [ids.vp]), { tipo: 'loja', lojaId: ids.vp });
    expect(await rodar(() => ErpMetasPorCategoriaPage({ searchParams: {} }))).toEqual({ erro: 'SEM_ACESSO' });
    // Quem só tem `dre.ver` vê o painel mas não ganha o convite para as metas.
    como(propria(['dre.ver', 'lojas.ver'], 'rede'));
    const h = await painel({ rede: '1', periodo: '2026-10-10' });
    expect(h).toContain('Maiores desvios');
    expect(h).not.toContain('Metas por categoria');
    expect(h).not.toContain('Classificar');
  });

  it('as metas da dona: o total, as categorias, o modelo de 32 %, a soma e "vale para" as lojas que seguem a rede', async () => {
    como(alcanceDe('DONO', 'rede'));
    const h = await metas();
    expect(h).toContain('Metas por categoria');
    expect(h).toContain('Meta total do CMV');
    expect(h).toContain('Usar o modelo de 32%');
    expect(h).toContain('Referência ilustrativa, não limite');
    expect(h).toContain('Soma das categorias');
    expect(h).toContain('O que mudar aqui');
    expect(h).toContain('vale para Unidade Tijuca e Vila da Penha');
    expect(h).toContain(`name="cat_${cat.PROTEINA}"`);
    expect(h).toContain('name="total"');
    // A soma do modelo é 32,00 % e o campo da Proteína vem com 11.
    expect(h).toMatch(new RegExp(`name="cat_${cat.PROTEINA}"[^>]*value="11"`));
    expect(h).toContain('32,00%');
    expect(h).not.toContain('Confira a divisão'); // soma = total: sem aviso
  });

  it('as metas de uma loja: "segue a rede" e "personalizar"; loja que não existe é 404', async () => {
    como(alcanceDe('DONO', 'rede'));
    const h = await metas({ loja: ids.dl });
    expect(h).toContain('Segue a rede');
    expect(h).toContain('Personalizar esta loja');
    expect(h).toContain('name="segue"');
    expect(h).toContain(`name="usa_${cat.PROTEINA}"`);
    expect(h).not.toContain('name="total"');
    expect(await rodar(async () => resolver(await ErpMetasPorCategoriaPage({ searchParams: { loja: 'nao-existe' } })))).toEqual({ erro: 'NOT_FOUND' });
  });

  it('salvar pela action: a dona grava (e o aviso de soma vem na frase), o gerente e o operador são recusados e nada é gravado', async () => {
    const campos = aplicarModelo32(await listarCategorias(a)).campos;
    const formulario = async (extra: Record<string, string> = {}, alterar: Record<string, string> = {}) => {
      const s = (await situacaoDasMetasPorCategoria(a, ALCANCE_FLOWFOODS, null, '2026-10-22'))!;
      const f = new FormData();
      f.set('versao', s.versao);
      f.set('total', '32');
      for (const [id, v] of Object.entries({ ...campos, ...alterar })) f.set(`cat_${id}`, v);
      for (const [k, v] of Object.entries(extra)) f.set(k, v);
      return f;
    };
    const antes = await a.metaCmvConjunto.count();
    como(alcanceDe('GERENTE', [ids.vp]), { tipo: 'loja', lojaId: ids.vp });
    const g = await acoesDaSessao.acaoSalvarMetasPorCategoria('', null, await formulario());
    expect(g).toMatchObject({ ok: false });
    como(alcanceDe('OPERADOR', [ids.vp]), { tipo: 'loja', lojaId: ids.vp });
    expect(await acoesDaSessao.acaoSalvarMetasPorCategoria('', null, await formulario())).toMatchObject({ ok: false });
    expect(await a.metaCmvConjunto.count()).toBe(antes);

    como(alcanceDe('DONO', 'rede'));
    const ok = await acoesDaSessao.acaoSalvarMetasPorCategoria('', null, await formulario({}, { [cat.PROTEINA]: '12' }));
    expect(ok).toMatchObject({ ok: true });
    expect(sp(ok!.mensagem)).toContain('Metas salvas. Valem a partir de 01/10/2026');
    expect(sp(ok!.mensagem)).toContain('Soma 33,00% · total 32,00% · diferença +1,00 pp');
    expect(await a.metaCmvConjunto.count()).toBe(antes + 1);
    // Lixo no campo: recusa no campo e nada muda.
    const ruim = await acoesDaSessao.acaoSalvarMetasPorCategoria('', null, await formulario({}, { [cat.PROTEINA]: '100,01' }));
    expect(ruim).toMatchObject({ ok: false, erros: { [`cat_${cat.PROTEINA}`]: expect.any(String) } });
    // A loja pela action, com o `lojaId` preso à URL (bind), nunca do formulário; o `usa` só vale com o marcador de "estava na tela".
    const s = (await situacaoDasMetasPorCategoria(a, ALCANCE_FLOWFOODS, ids.dl, '2026-10-22'))!;
    const f = new FormData();
    f.set('versao', s.versao);
    f.set('segue', 'sim');
    f.set(`viu_${cat.LIMPEZA}`, '1'); // viu e não marcou: a Unidade Tijuca não usa Limpeza
    f.set('lojaId', ids.vp); // forjado: ignorado
    expect(await acoesDaSessao.acaoSalvarMetasPorCategoria(ids.dl, null, f)).toMatchObject({ ok: true });
    expect(await a.categoriaNaLoja.findMany({ select: { lojaId: true, categoriaId: true, usa: true } })).toEqual([{ lojaId: ids.dl, categoriaId: cat.LIMPEZA, usa: false }]);
    expect(await a.metaCmvConjunto.count({ where: { lojaId: ids.vp } })).toBe(0);
  });

  it('setembro fechado (v4) mostra o painel pela fotografia; agosto, fechado antes da I.2, diz "não apurado por categoria" e mantém o total', async () => {
    como(alcanceDe('DONO', 'rede'));
    const set = await painel({ rede: '1', periodo: '2026-09-10' });
    expect(set).toContain('Período fechado');
    expect(set).toContain('Maiores desvios');
    expect(set).toContain('R$ 8.000,00'); // a Proteína de setembro, da fotografia
    expect(set).toContain('Esta tela é a fotografia do fechamento');
    const ago = await painel({ rede: '1', periodo: '2026-08-10' });
    expect(ago).toContain('Não apurado por categoria (fechado antes da I.2).');
    expect(ago).not.toContain('Maiores desvios');
    expect(ago).toContain('CMV do período, igual ao do DRE');
  });
});
