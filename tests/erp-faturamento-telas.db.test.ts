/**
 * ERP 2.1 · as actions e as páginas de faturamento (a porta de verdade), com banco:
 * - o gerente lança pela action da sessão: a loja e o dia vêm presos à URL, campo
 *   forjado (ticket, total, loja, parceiro, quem lançou) é ignorado; o autor sai
 *   da sessão; o nível 1 faz o mesmo pelo espelho;
 * - o operador, o gerente de outra loja e o parceiro suspenso são recusados, nada gravado;
 * - as páginas: a do dia é 404 para loja fora do alcance, de outro parceiro, inexistente,
 *   data futura ou inválida; a do mês traz só as lojas do alcance; o operador não entra;
 * - vazamento: perfil com `historico.ver` e sem `faturamento.ver` abre o Histórico (HTML e
 *   payload) sem uma linha de faturamento; quem tem `faturamento.ver` vê.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-faturamento-telas.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const atual = vi.hoisted(() => ({ ctx: null as null | (() => unknown), visao: { tipo: 'rede' } as { tipo: string; lojaId?: string; nome?: string } }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`REDIRECT ${url}`), { url });
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  usePathname: () => '/erp/faturamento',
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
    visaoDaRequisicao: async () => ({ visao: atual.visao }),
  };
});
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { somarDias } from '@/lib/erp/contagem-campos';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import * as faturamentoDaSessao from '@/app/erp/faturamento/actions';
import * as faturamentoDoNivel1 from '@/app/rodolfo/(painel)/erp/[slug]/faturamento/actions';
import ErpFaturamentoPage from '@/app/erp/faturamento/page';
import ErpDiaPage from '@/app/erp/faturamento/[lojaId]/[data]/page';
import ErpLancarPage from '@/app/erp/faturamento/lancar/page';
import ErpImportarPage from '@/app/erp/faturamento/importar/page';
import ErpHistoricoPage from '@/app/erp/historico/page';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;

describe.skipIf(!URL_TESTE)('ERP 2.1 · telas e actions de faturamento (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `t${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string; slug: string; nome: string; status: string };
  let B: { id: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const ids: Record<string, string> = {};
  const D = somarDias(hojeNoRio(), -2);

  const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR', lojaIds: string[] | 'rede', extras: string[] = []): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: extras, permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const como = (alcance: Alcance, autorNome: string, cliente = a, bloqueio: string | null = null) => {
    atual.ctx = () => ({ parceiro: A, alcance, cliente, bloqueio, podeEscrever: true, sessao: { userId: 'u', autorNome } });
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
  const form = (campos: Record<string, string>, versoes = ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD']) => {
    const f = new FormData();
    for (const c of versoes) f.set(`versao_${c}`, '');
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };
  const linhas = (lojaId: string) => a.faturamentoLancamento.findMany({ where: { lojaId, data: new Date(`${D}T00:00:00.000Z`) }, orderBy: { canal: 'asc' } });
  const json = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? v.toString() : isValidElement(v) ? { tipo: typeof v.type === 'string' ? v.type : (v.type as { name?: string }).name, ...(v.props as object) } : v));

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = (await db.parceiroFlow.create({ data: { nome: 'Telas A', slug: `telas-a-${sufixo}`, status: 'ATIVO' } })) as typeof A;
    B = await db.parceiroFlow.create({ data: { nome: 'Telas B', slug: `telas-b-${sufixo}`, status: 'ATIVO' } });
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
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
  });

  it('critério 1 pela porta: o gerente lança pela action; a loja e o dia vêm presos à URL; campo forjado é ignorado; o autor é o da sessão', async () => {
    como(alcanceDe('GERENTE', [ids.vp]), 'Gil Gerente');
    const f = form({
      valor_LOJA: '4.350,00', pedidos_LOJA: '62', clientes_LOJA: '140',
      valor_DELIVERY_PROPRIO: '1.200,00', pedidos_DELIVERY_PROPRIO: '30',
      naoVendeu_IFOOD: 'on',
      // Forja: nada disso deve valer.
      ticket_LOJA: '999,99', total: '1,00', lojaId: ids.meier, parceiroId: B.id, atualizadoPorNome: 'Invasor', origem: 'INTEGRACAO', chaveIdempotencia: 'ifood:dia:x',
    });
    const r = await rodar(() => faturamentoDaSessao.acaoSalvarDia(ids.vp, D, null, f));
    expect(r).toEqual({ redirect: `/erp/faturamento/${ids.vp}/${D}?feito=salvo` });
    const ls = await linhas(ids.vp);
    expect(ls.map((l) => [l.canal, l.valorCentavos, l.pedidos, l.clientes, l.origem, l.atualizadoPorNome])).toEqual([
      ['LOJA', 435000, 62, 140, 'MANUAL', 'Gil Gerente'],
      ['DELIVERY_PROPRIO', 120000, 30, 30, 'MANUAL', 'Gil Gerente'],
      ['IFOOD', 0, 0, 0, 'MANUAL', 'Gil Gerente'],
    ]);
    expect(await linhas(ids.meier)).toHaveLength(0);
    // De novo, com a versão velha ('' = ainda não existia) e os mesmos números: nada muda, e a frase diz isso.
    expect(await rodar(() => faturamentoDaSessao.acaoSalvarDia(ids.vp, D, null, f))).toEqual({ redirect: `/erp/faturamento/${ids.vp}/${D}?feito=igual` });
    expect(await linhas(ids.vp)).toHaveLength(3);
  });

  it('o erro volta ao formulário com a frase no campo do canal, e nada é gravado', async () => {
    como(alcanceDe('GERENTE', [ids.vp]), 'Gil Gerente');
    const dia = somarDias(D, -1);
    const r = (await rodar(() =>
      faturamentoDaSessao.acaoSalvarDia(ids.vp, dia, null, form({ valor_LOJA: '=1+1', pedidos_LOJA: '2,5', valor_IFOOD: '100,00', pedidos_IFOOD: '0' })),
    )) as { ok: false; porCanal: Record<string, Record<string, string>> };
    expect(r.ok).toBe(false);
    expect(r.porCanal.LOJA.valor).toContain('fórmula');
    expect(r.porCanal.LOJA.pedidos).toContain('inteiro');
    expect(r.porCanal.IFOOD.pedidos).toContain('pelo menos 1');
    expect(await a.faturamentoLancamento.count({ where: { data: new Date(`${dia}T00:00:00.000Z`) } })).toBe(0);
  });

  it('o operador, o gerente de outra loja e o parceiro suspenso são recusados pela action, sem gravar', async () => {
    const f = form({ valor_LOJA: '10,00', pedidos_LOJA: '1' });
    const dia = somarDias(D, -3);
    como(alcanceDe('OPERADOR', 'rede'), 'Caio Operador');
    const op = (await rodar(() => faturamentoDaSessao.acaoSalvarDia(ids.vp, dia, null, f))) as { ok: false; erros: { geral: string } };
    expect(op.erros.geral).toContain('Seu acesso não inclui');
    como(alcanceDe('GERENTE', [ids.meier]), 'Zé do Méier');
    const outra = (await rodar(() => faturamentoDaSessao.acaoSalvarDia(ids.vp, dia, null, f))) as { ok: false; erros: { geral: string } };
    expect(outra.erros.geral).toBe('Essa loja não está no seu acesso.');
    como(alcanceDe('DONO', 'rede'), 'Marina', a, 'Parceiro suspenso: só consulta.');
    const susp = (await rodar(() => faturamentoDaSessao.acaoSalvarDia(ids.vp, dia, null, f))) as { ok: false; erros: { geral: string } };
    expect(susp.erros.geral).toBe('Parceiro suspenso: só consulta.');
    // Remover e importar passam pela mesma porta.
    como(alcanceDe('OPERADOR', 'rede'), 'Caio Operador');
    const fr = new FormData();
    fr.set('motivo', 'quero apagar');
    fr.set('versao', 'x');
    expect(await rodar(() => faturamentoDaSessao.acaoRemoverLancamento(ids.vp, D, 'LOJA', null, fr))).toMatchObject({ ok: false });
    expect(await rodar(() => faturamentoDaSessao.acaoPreviaDoFaturamento(null, new FormData()))).toMatchObject({ erro: expect.stringContaining('Seu acesso não inclui') });
    expect(await a.faturamentoLancamento.count({ where: { data: new Date(`${dia}T00:00:00.000Z`) } })).toBe(0);
    expect(await linhas(ids.vp)).toHaveLength(3);
  });

  it('o espelho do nível 1 grava pela mesma regra, no parceiro do slug, e o rastro vai ao auditLog', async () => {
    atual.ctx = () => ({ parceiro: A, alcance: ALCANCE_FLOWFOODS, cliente: a, bloqueio: null, sessao: { userId: 'rodolfo', autorNome: 'Rodolfo' } });
    const dia = somarDias(D, -4);
    const r = await rodar(() => faturamentoDoNivel1.acaoSalvarDia(A.slug, ids.meier, dia, null, form({ valor_LOJA: '500,00', pedidos_LOJA: '10' })));
    expect(r).toEqual({ redirect: `/rodolfo/erp/${A.slug}/faturamento/${ids.meier}/${dia}?feito=salvo` });
    const l = await a.faturamentoLancamento.findFirst({ where: { lojaId: ids.meier, data: new Date(`${dia}T00:00:00.000Z`) } });
    expect(l).toMatchObject({ valorCentavos: 50000, atualizadoPorNome: 'Rodolfo' });
    // Loja do OUTRO parceiro, pelo espelho de A: o portão não a acha.
    const fora = (await rodar(() => faturamentoDoNivel1.acaoSalvarDia(A.slug, ids.lojaB, dia, null, form({ valor_LOJA: '500,00', pedidos_LOJA: '10' })))) as { ok: false; erros: { geral: string } };
    expect(fora.erros.geral).toBe('Loja não encontrada no seu acesso.');
    expect(await b.faturamentoLancamento.count()).toBe(0);
  });

  it('a página do dia: 404 para loja fora do alcance, de outro parceiro, inexistente, data futura ou inválida; o operador não entra', async () => {
    como(alcanceDe('GERENTE', [ids.meier]), 'Zé do Méier');
    const abre = (lojaId: string, data: string) => rodar(() => ErpDiaPage({ params: { lojaId, data }, searchParams: {} }));
    expect(await abre(ids.vp, D)).toEqual({ erro: 'NOT_FOUND' });
    expect(await abre(ids.lojaB, D)).toEqual({ erro: 'NOT_FOUND' });
    expect(await abre('cl0jainexistente0000000000', D)).toEqual({ erro: 'NOT_FOUND' });
    como(alcanceDe('GERENTE', [ids.vp]), 'Gil Gerente');
    expect(await abre(ids.vp, somarDias(hojeNoRio(), 1))).toEqual({ erro: 'NOT_FOUND' });
    expect(await abre(ids.vp, '2026-02-31')).toEqual({ erro: 'NOT_FOUND' });
    expect(await abre(ids.vp, 'lixo')).toEqual({ erro: 'NOT_FOUND' });
    const ok = (await abre(ids.vp, D)) as { props: { dia: { loja: { id: string }; canais: { canal: string }[] }; podeLancar: boolean } };
    expect(ok.props.dia.loja.id).toBe(ids.vp);
    expect(ok.props.dia.canais.map((c) => c.canal)).toEqual(['LOJA', 'DELIVERY_PROPRIO', 'IFOOD']);
    expect(ok.props.podeLancar).toBe(true);
    como(alcanceDe('OPERADOR', 'rede'), 'Caio Operador');
    expect(await abre(ids.vp, D)).toEqual({ erro: 'SEM_ACESSO' });
    expect(await rodar(() => ErpFaturamentoPage({ searchParams: {} }))).toEqual({ erro: 'SEM_ACESSO' });
    expect(await rodar(() => ErpLancarPage({ searchParams: {} }))).toEqual({ erro: 'SEM_ACESSO' });
    expect(await rodar(() => ErpImportarPage())).toEqual({ erro: 'SEM_ACESSO' });
  });

  it('quem lança e não vê não entra em lançar nem em importar (ver + lançar, as duas)', async () => {
    como(alcanceDe('OPERADOR', 'rede', ['faturamento.lancar']), 'Lia');
    expect(await rodar(() => ErpLancarPage({ searchParams: {} }))).toEqual({ erro: 'SEM_ACESSO' });
    expect(await rodar(() => ErpImportarPage())).toEqual({ erro: 'SEM_ACESSO' });
    const r = (await rodar(() => faturamentoDaSessao.acaoSalvarDia(ids.vp, D, null, form({ valor_LOJA: '1,00', pedidos_LOJA: '1' })))) as { erros: { geral: string } };
    expect(r.erros.geral).toContain('Seu acesso não inclui');
    expect(await rodar(() => faturamentoDaSessao.acaoPreviaDoFaturamento(null, new FormData()))).toMatchObject({ erro: expect.stringContaining('Seu acesso não inclui') });
  });

  it('quem vê e não lança abre o dia só para consulta', async () => {
    como(alcanceDe('OPERADOR', 'rede', ['faturamento.ver']), 'Vera');
    const p = (await ErpDiaPage({ params: { lojaId: ids.vp, data: D }, searchParams: {} })) as { props: { podeLancar: boolean } };
    expect(p.props.podeLancar).toBe(false);
    // E a action recusa mesmo com o formulário forjado.
    const r = (await rodar(() => faturamentoDaSessao.acaoSalvarDia(ids.vp, D, null, form({ valor_LOJA: '1,00', pedidos_LOJA: '1' })))) as { erros: { geral: string } };
    expect(r.erros.geral).toContain('lançar faturamento');
  });

  it('a página do mês traz só as lojas do alcance; "Lançar o dia" vai direto ao dia com uma loja só', async () => {
    como(alcanceDe('GERENTE', [ids.vp]), 'Gil Gerente');
    atual.visao = { tipo: 'loja', lojaId: ids.vp, nome: 'Vila da Penha' };
    const mes = (await ErpFaturamentoPage({ searchParams: {} })) as { props: { m: { lojas: { loja: { id: string } }[] }; lojaAberta?: { loja: { id: string } } } };
    expect(mes.props.m.lojas.map((l) => l.loja.id)).toEqual([ids.vp]);
    expect(mes.props.lojaAberta?.loja.id).toBe(ids.vp);
    // Forjar ?loja= de outra loja do mesmo parceiro não abre a loja de fora do alcance.
    const forjada = (await ErpFaturamentoPage({ searchParams: { loja: ids.meier } })) as typeof mes;
    expect(forjada.props.lojaAberta?.loja.id).toBe(ids.vp);
    expect(await rodar(() => ErpLancarPage({ searchParams: {} }))).toEqual({ redirect: `/erp/faturamento/${ids.vp}/${hojeNoRio()}` });
    // Data futura no formulário: erro na tela, sem redirecionar.
    const erro = (await ErpLancarPage({ searchParams: { loja: ids.vp, data: '31/12/2099' } })) as { props: { erro?: string } };
    expect(erro.props.erro).toContain('ainda não chegou');
    // A dona vê a rede.
    como(alcanceDe('DONO', 'rede'), 'Marina');
    atual.visao = { tipo: 'rede' };
    const rede = (await ErpFaturamentoPage({ searchParams: {} })) as typeof mes;
    expect(rede.props.m.lojas.map((l) => l.loja.id).sort()).toEqual([ids.meier, ids.vp].sort());
    expect(rede.props.lojaAberta).toBeUndefined();
    // Duas lojas: o "Lançar o dia" pede a loja.
    const escolher = (await ErpLancarPage({ searchParams: {} })) as { props: { lojas: unknown[] } };
    expect(escolher.props.lojas).toHaveLength(2);
    // Decisão 474: com a Vila da Penha escolhida no topo e "Ver a rede", o subtítulo (e o gráfico) dizem a rede, não a loja do topo.
    atual.visao = { tipo: 'loja', lojaId: ids.vp, nome: 'Vila da Penha' };
    const html = (el: unknown) => renderToStaticMarkup(el as never).replace(/\u00a0/g, ' ');
    const comLoja = html(await ErpFaturamentoPage({ searchParams: {} }));
    expect(comLoja).toMatch(/Vila da Penha · [a-zç]+ de \d{4}/);
    const daRede = html(await ErpFaturamentoPage({ searchParams: { rede: '1' } }));
    expect(daRede).toMatch(/Rede Completa · [a-zç]+ de \d{4}/);
    // O gráfico do mês também diz a rede.
    expect(daRede).toMatch(/Rede Completa · \d+ dias? lançados?/);
    expect(daRede).not.toMatch(/Vila da Penha · [a-zç]+ de \d{4}/);
  });

  it('critério 11: perfil com historico.ver e sem faturamento.ver abre o Histórico sem uma linha de faturamento (HTML e payload)', async () => {
    const PROIBIDO = /Vila da Penha · (Loja|Delivery|iFood)|4\.350|FaturamentoLancamento|"Faturamento"|>Faturamento</;
    // O perfil do Hugo: operador + "ver o histórico", sem "ver faturamento".
    como(alcanceDe('OPERADOR', 'rede', ['historico.ver']), 'Hugo');
    const tudo = await ErpHistoricoPage({ searchParams: {} });
    expect(json(tudo).match(PROIBIDO)?.[0] ?? null).toBeNull();
    const html = renderToStaticMarkup(createElement(() => tudo as never));
    expect(html.match(PROIBIDO)?.[0] ?? null).toBeNull();
    // Pedir o filtro de faturamento na URL também não traz nada (a entidade nem entra no filtro).
    const filtrado = await ErpHistoricoPage({ searchParams: { entidade: 'FaturamentoLancamento' } });
    expect(json(filtrado).match(PROIBIDO)?.[0] ?? null).toBeNull();
    expect(renderToStaticMarkup(createElement(() => filtrado as never))).not.toMatch(PROIBIDO);
    // Quem tem os dois vê as linhas e o filtro.
    como(alcanceDe('OPERADOR', 'rede', ['historico.ver', 'faturamento.ver']), 'Helena');
    const comAcesso = await ErpHistoricoPage({ searchParams: { entidade: 'FaturamentoLancamento' } });
    const htmlOk = renderToStaticMarkup(createElement(() => comAcesso as never)).replace(/ /g, ' ');
    expect(htmlOk).toContain('Vila da Penha · Loja · ');
    expect(htmlOk).toContain('R$ 4.350,00');
    // A dona também.
    como(alcanceDe('DONO', 'rede'), 'Marina');
    const dona = await ErpHistoricoPage({ searchParams: {} });
    expect(renderToStaticMarkup(createElement(() => dona as never)).replace(/\u00a0/g, ' ')).toContain('R$ 4.350,00');
  });
});
