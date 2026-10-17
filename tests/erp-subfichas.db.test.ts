/**
 * ERP 1.3 · Subfichas / pré-preparos no Postgres de verdade:
 * - pré-preparo com fator de correção vira insumo (selo e custo da ficha na
 *   lista de insumos), usado num prato com custo em cascata exato; mudou o
 *   preço de um insumo do molho, o burger muda;
 * - isolamento: pré-preparo de outro parceiro recusado pela regra E pelo banco;
 * - operador recusado pela action de verdade;
 * - círculo recusado, inclusive em CORRIDA (duas edições simultâneas que juntas
 *   formariam o círculo: uma entra, a outra é recusada);
 * - pré-preparo usado não vira prato nem muda de unidade; desativar leva o
 *   insumo; insumo produzido não se edita pela tela de insumos;
 * - planilha com pré-preparo pelo nome e fator;
 * - a lista não faz uma consulta por ficha (mesmo número de idas ao banco com
 *   3 ou 30 fichas usando pré-preparo).
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-subfichas.db.test.ts
 */
import { ALCANCE_FLOWFOODS } from '@/lib/erp/permissoes';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const atual = vi.hoisted(() => ({ ctx: null as null | (() => unknown) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`REDIRECT ${url}`), { url });
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('@/lib/erp/contexto', async () => {
  const { recusaDaAcao, exigirPermissao, pode } = await import('@/lib/erp/permissoes');
  return { exigirParceiroDaSessao: async () => atual.ctx!(), exigirParceiro: async () => atual.ctx!(), recusaDaAcao, exigirPermissao, pode };
});
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarInsumo, editarInsumo, listarInsumos, mudarSituacaoInsumo, obterInsumo } from '@/lib/erp/insumos';
import { cadastrarVariante } from '@/lib/erp/variantes';
import { cadastrarFicha, editarFicha, listarFichas, mudarSituacaoFicha, obterFicha, preparosParaFicha } from '@/lib/erp/fichas';
import { importarFichas, previaDaImportacao } from '@/lib/erp/ficha-importar';
import { listarHistorico } from '@/lib/erp/historico';
import { resolverAlcance } from '@/lib/erp/permissoes';
import type { ItemDigitado } from '@/lib/erp/ficha-campos';
import { centavosDaFracao, type Fracao } from '@/lib/erp/unidades';
import * as daSessao from '@/app/erp/fichas/actions';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const igual = (f: Fracao, num: bigint, den: bigint) => expect(f.num * den).toBe(num * f.den);

describe.skipIf(!URL_TESTE)('ERP 1.3 · subfichas e custo em cascata (Postgres real)', { timeout: 90_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  let pasta: string;
  const sufixo = `s${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string; slug: string; nome: string; status: string };
  let B: { id: string; slug: string; nome: string; status: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const ids: Record<string, string> = {};

  const ctxDe = (parceiro: typeof A, perfilBase: 'DONO' | 'OPERADOR') => ({
    parceiro,
    alcance: resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] }),
    cliente: doParceiro(parceiro.id, db),
    bloqueio: null,
    podeEscrever: true,
    sessao: { userId: 'u', autorNome: perfilBase === 'DONO' ? 'Marina Dona' : 'Paulo Operador' },
  });
  const versao = async (id: string) => (await obterFicha(a, id))!.versao;

  // Molho cheddar (rende 2 kg): cheddar 1 kg (R$ 40,00) + creme 500 g (R$ 18,00/kg = R$ 9,00)
  // + cebola 200 g LIMPOS com fator 1,18 (236 g a R$ 5,00/kg = R$ 1,18) = R$ 50,18 → R$ 25,09/kg.
  const molho = (extra: Record<string, unknown> = {}) => ({
    nome: 'Molho cheddar',
    tipo: 'PRE_PREPARO',
    rendimento: '2',
    rendimentoUnidade: 'kg',
    itens: [
      { insumoId: ids.cheddar, quantidade: '1', unidade: 'kg' },
      { insumoId: ids.creme, quantidade: '500', unidade: 'g' },
      { insumoId: ids.cebola, quantidade: '200', unidade: 'g', fator: '1,18' },
    ],
    ...extra,
  });
  // Burger cheddar (1 porção): pão R$ 1,50 + 40 g de molho (R$ 1,0036) = R$ 2,5036 → R$ 2,50.
  const burger = (extra: Record<string, unknown> = {}) => ({
    nome: 'Burger cheddar',
    tipo: 'PRATO',
    rendimento: '1',
    itens: [
      { insumoId: ids.pao, quantidade: '1', unidade: 'un' },
      { subfichaId: ids.molho, quantidade: '40', unidade: 'g' },
    ],
    ...extra,
  });
  const preparo = (nome: string, itens: ItemDigitado[] = [{ insumoId: ids.cebola, quantidade: '100', unidade: 'g' }]) => ({
    nome,
    tipo: 'PRE_PREPARO',
    rendimento: '1',
    rendimentoUnidade: 'kg',
    itens,
  });

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    pasta = mkdtempSync(join(tmpdir(), 'erp-sub-'));
    process.env.ERP_ARQUIVOS_DIR = pasta;
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Sub A', slug: `sub-a-${sufixo}`, status: 'ATIVO' } });
    B = await db.parceiroFlow.create({ data: { nome: 'Sub B', slug: `sub-b-${sufixo}`, status: 'ATIVO' } });
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    for (const [chave, campos] of Object.entries({
      cheddar: { nome: 'Cheddar', unidade: 'KG', conteudo: '1', preco: '40,00' },
      creme: { nome: 'Creme de leite', unidade: 'KG', conteudo: '1', preco: '18,00' },
      cebola: { nome: 'Cebola', unidade: 'KG', conteudo: '1', preco: '5,00' },
      pao: { nome: 'Pão brioche', unidade: 'UN', conteudo: '1', preco: '1,50' },
      picles: { nome: 'Picles', unidade: 'KG', conteudo: '1', semPreco: 'on' },
    })) {
      const r = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', conservacao: 'SECO', escala: 'base', ...campos });
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
    }
    const rb = await cadastrarInsumo(b, { nome: 'Pão de B', tipo: 'INGREDIENTE', unidade: 'UN', conservacao: 'SECO', conteudo: '1', escala: 'base', preco: '1,00' });
    if (!rb.ok) throw new Error('insumo de B');
    ids.paoB = rb.id;
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
    if (pasta) rmSync(pasta, { recursive: true, force: true });
  });

  it('pré-preparo com fator de correção: custo exato e vira insumo "Pré-preparo" com o custo da ficha', async () => {
    const r = await cadastrarFicha(a, molho(), { tipo: 'manter' }, 'Marina');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    ids.molho = r.id;
    const f = (await obterFicha(a, r.id))!;
    igual(f.custo.total, 5018n, 1n);
    igual(f.custo.porRendimento, 2509n, 1n);
    expect(f.itens[2]).toMatchObject({ nome: 'Cebola', quantidadeMilesimos: 200, fatorCorrecaoMilesimos: 1180 });
    igual(f.itens[2].custo!, 118n, 1n);
    // O insumo produzido: tipo pré-preparo, mesma unidade, custo vindo da ficha (não "Sem preço").
    expect(f.insumoProduzido?.nome).toBe('Molho cheddar');
    const lista = await listarInsumos(a, { q: 'Molho' });
    expect(lista.linhas).toHaveLength(1);
    expect(lista.linhas[0]).toMatchObject({ nome: 'Molho cheddar', tipo: 'PRE_PREPARO', unidade: 'KG', custo: null });
    igual(lista.linhas[0].preparo!.porUnidade, 2509n, 1n);
    // "Só sem preço" não lista o pré-preparo (o custo vem da ficha).
    expect((await listarInsumos(a, { semPreco: true })).linhas.map((l) => l.nome)).toEqual(['Picles']);
    const ins = (await obterInsumo(a, f.insumoProduzido!.id, ALCANCE_FLOWFOODS))!;
    expect(ins.preparo).toMatchObject({ nome: 'Molho cheddar', incompleto: false });
    const [h] = await listarHistorico(a, { entidade: 'Insumo', limite: 1, verPrecos: true });
    expect(h.mudancas.find((m) => m.campo === 'vem da ficha')?.depois).toBe('Molho cheddar');
    const [hf] = await listarHistorico(a, { entidade: 'FichaTecnica', limite: 1, verPrecos: true });
    expect(hf.mudancas.find((m) => m.campo === 'insumos')?.depois).toBe('Cheddar 1 kg · Creme de leite 500 g · Cebola 200 g (fator 1,18)');
  });

  it('prato usa o molho: custo em cascata; mudou o preço do cheddar, o burger muda na hora', async () => {
    const r = await cadastrarFicha(a, burger(), { tipo: 'manter' }, 'Marina');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    ids.burger = r.id;
    let f = (await obterFicha(a, r.id))!;
    // 40 g de R$ 25,09/kg = 100,36 c (exato), + 150 c
    igual(f.custo.total, 25036n, 100n);
    expect(centavosDaFracao(f.custo.porRendimento)).toBe(250n);
    expect(f.itens[1]).toMatchObject({ subfichaId: ids.molho, nome: 'Molho cheddar', unidade: 'KG' });
    expect(f.itens[1].preparo?.itens.map((i) => i.nome)).toEqual(['Cheddar', 'Creme de leite', 'Cebola']);
    expect((await obterFicha(a, ids.molho))!.usadaEm.map((u) => u.nome)).toEqual(['Burger cheddar']);
    // Cheddar sobe para R$ 50,00/kg: molho = 60,18 → 30,09/kg; 40 g = 120,36 c; burger = 270,36 c.
    const cheddar = (await obterInsumo(a, ids.cheddar, ALCANCE_FLOWFOODS))!;
    const e = await editarInsumo(a, ids.cheddar, { nome: 'Cheddar', tipo: 'INGREDIENTE', unidade: 'KG', conservacao: 'SECO', conteudo: '1', escala: 'base', preco: '50,00', versao: cheddar.versao });
    expect(e.ok).toBe(true);
    f = (await obterFicha(a, r.id))!;
    igual(f.custo.total, 27036n, 100n);
    const lista = await listarFichas(a, { q: 'Burger' });
    igual(lista.linhas[0].custo.total, 27036n, 100n);
  });

  it('custo incompleto sobe: insumo sem preço no molho deixa o burger incompleto (e no filtro)', async () => {
    const v = await versao(ids.molho);
    const r = await editarFicha(a, ids.molho, { ...molho({ itens: [...molho().itens, { insumoId: ids.picles, quantidade: '50', unidade: 'g' }] }), versao: v });
    expect(r.ok).toBe(true);
    const f = (await obterFicha(a, ids.burger))!;
    expect(f.custo.faltaPreco).toEqual(['Picles']);
    expect(f.custo.preparosIncompletos).toEqual(['Molho cheddar']);
    expect((await listarFichas(a, { incompleto: true })).linhas.map((l) => l.nome)).toEqual(['Burger cheddar', 'Molho cheddar']);
    // Volta ao normal.
    expect((await editarFicha(a, ids.molho, { ...molho(), versao: await versao(ids.molho) })).ok).toBe(true);
    expect((await listarFichas(a, { incompleto: true })).linhas).toEqual([]);
  });

  it('isolamento: pré-preparo de A numa ficha de B é recusado pela regra E pelo banco', async () => {
    const r = await cadastrarFicha(b, { nome: 'Furo', tipo: 'PRATO', rendimento: '1', itens: [{ subfichaId: ids.molho, quantidade: '40', unidade: 'g' }] });
    expect(r).toEqual({ ok: false, erros: { 'item-0': 'Pré-preparo não encontrado neste cadastro.' } });
    expect(await preparosParaFicha(b)).toEqual([]);
    const fb = await b.fichaTecnica.create({ data: { parceiroId: B.id, nome: 'Furo 2', tipo: 'PRATO', rendimentoMilesimos: 1000, unidadeRendimento: 'UN' } });
    await expect(b.fichaItem.create({ data: { parceiroId: B.id, fichaId: fb.id, subfichaId: ids.molho, quantidadeMilesimos: 40 } })).rejects.toThrow();
    await b.fichaTecnica.delete({ where: { id: fb.id } });
    // O banco também recusa fator acima de 10 (migration 1.3).
    await expect(
      a.fichaItem.create({ data: { parceiroId: A.id, fichaId: ids.burger, insumoId: ids.picles, quantidadeMilesimos: 1, fatorCorrecaoMilesimos: 10_001 } }),
    ).rejects.toThrow();
  });

  it('operador (só vê fichas) chamando a action com pré-preparo é recusado; nada gravado', async () => {
    atual.ctx = () => ctxDe(A, 'OPERADOR');
    const form = new FormData();
    form.set('nome', 'Do operador');
    form.set('tipo', 'PRATO');
    form.append('item_insumo', `ficha:${ids.molho}`);
    form.append('item_quantidade', '40');
    form.append('item_unidade', 'g');
    form.append('item_fator', '');
    const r = await daSessao.acaoCadastrarFicha(null, form);
    expect(r).toMatchObject({ ok: false });
    expect(await a.fichaTecnica.count({ where: { nome: 'Do operador' } })).toBe(0);
    // A dona, pela MESMA action: o pré-preparo vem como "ficha:<id>" e o fator como texto.
    atual.ctx = () => ctxDe(A, 'DONO');
    form.set('nome', 'Fritas com cheddar');
    form.append('item_insumo', ids.cebola);
    form.append('item_quantidade', '30');
    form.append('item_unidade', 'g');
    form.append('item_fator', '1,18');
    await expect(daSessao.acaoCadastrarFicha(null, form)).rejects.toThrow(/REDIRECT \/erp\/fichas\/.+\?feito=criada/);
    const fritas = await a.fichaTecnica.findFirstOrThrow({ where: { nome: 'Fritas com cheddar' }, include: { itens: { orderBy: { ordem: 'asc' } } } });
    expect(fritas.itens.map((i) => [i.subfichaId, i.insumoId, i.quantidadeMilesimos, i.fatorCorrecaoMilesimos])).toEqual([
      [ids.molho, null, 40, 1000],
      [null, ids.cebola, 30, 1180],
    ]);
  });

  it('círculo: base usada pelo molho não pode passar a usar o molho', async () => {
    const base = await cadastrarFicha(a, preparo('Base de cebola'));
    if (!base.ok) throw new Error(JSON.stringify(base));
    ids.base = base.id;
    const v = await versao(ids.molho);
    const m = await editarFicha(a, ids.molho, { ...molho({ itens: [...molho().itens, { subfichaId: ids.base, quantidade: '100', unidade: 'g' }] }), versao: v });
    expect(m.ok).toBe(true);
    const r = await editarFicha(a, ids.base, { ...preparo('Base de cebola', [{ subfichaId: ids.molho, quantidade: '10', unidade: 'g' }]), versao: await versao(ids.base) });
    expect(r).toEqual({
      ok: false,
      erros: {
        'item-0':
          'Assim fica um círculo: “Base de cebola” usa “Molho cheddar”, que usa “Base de cebola”. Um pré-preparo não pode entrar, nem por dentro de outro, na receita que ele mesmo usa.',
      },
    });
  });

  it('círculo em CORRIDA: X passa a usar Y e Y passa a usar X ao mesmo tempo — uma entra, a outra é recusada', async () => {
    for (let rodada = 0; rodada < 4; rodada++) {
      const x = await cadastrarFicha(a, preparo(`Preparo X${rodada}`));
      const y = await cadastrarFicha(a, preparo(`Preparo Y${rodada}`));
      if (!x.ok || !y.ok) throw new Error('setup');
      const [vx, vy] = [await versao(x.id), await versao(y.id)];
      const resultados = await Promise.all([
        editarFicha(a, x.id, { ...preparo(`Preparo X${rodada}`, [{ subfichaId: y.id, quantidade: '10', unidade: 'g' }]), versao: vx }),
        editarFicha(a, y.id, { ...preparo(`Preparo Y${rodada}`, [{ subfichaId: x.id, quantidade: '10', unidade: 'g' }]), versao: vy }),
      ]);
      expect(resultados.filter((r) => r.ok)).toHaveLength(1);
      const recusada = resultados.find((r) => !r.ok)!;
      expect(Object.values((recusada as { erros: Record<string, string> }).erros)[0]).toMatch(/Assim fica um círculo/);
      // No banco: só uma das duas ligações existe.
      const ligacoes = await a.fichaItem.count({ where: { OR: [{ fichaId: x.id, subfichaId: y.id }, { fichaId: y.id, subfichaId: x.id }] } });
      expect(ligacoes).toBe(1);
    }
  });

  it('pré-preparo usado não vira prato nem muda a unidade; desativar leva o insumo junto', async () => {
    const v = await versao(ids.molho);
    expect(await editarFicha(a, ids.molho, { ...molho({ tipo: 'PRATO', rendimento: '1' }), versao: v })).toMatchObject({
      ok: false,
      erros: { tipo: expect.stringMatching(/não vira prato/) },
    });
    expect(await editarFicha(a, ids.molho, { ...molho({ rendimentoUnidade: 'L' }), versao: v })).toMatchObject({
      ok: false,
      erros: { rendimento: expect.stringMatching(/continua em kg/) },
    });
    // Rendimento novo na MESMA unidade pode: o custo por kg do molho cai e o burger acompanha.
    expect((await editarFicha(a, ids.molho, { ...molho({ rendimento: '2,5' }), versao: v })).ok).toBe(true);
    const insumoId = (await obterFicha(a, ids.molho))!.insumoProduzido!.id;
    expect((await mudarSituacaoFicha(a, ids.molho, false, 'saiu do cardápio')).ok).toBe(true);
    expect((await obterInsumo(a, insumoId, ALCANCE_FLOWFOODS))!.ativo).toBe(false);
    expect((await mudarSituacaoFicha(a, ids.molho, true, null)).ok).toBe(true);
    expect((await obterInsumo(a, insumoId, ALCANCE_FLOWFOODS))!.ativo).toBe(true);
  });

  it('insumo produzido não se edita, não ganha embalagem nem muda de situação pela tela de insumos', async () => {
    const ins = (await obterInsumo(a, (await obterFicha(a, ids.molho))!.insumoProduzido!.id, ALCANCE_FLOWFOODS))!;
    const msg = expect.stringMatching(/é pré-preparo/);
    expect(await editarInsumo(a, ins.id, { nome: 'Outro', tipo: 'PRE_PREPARO', unidade: 'KG', conteudo: '1', escala: 'base', preco: '1,00', versao: ins.versao })).toMatchObject({
      ok: false,
      erros: { geral: msg },
    });
    expect(await mudarSituacaoInsumo(a, ins.id, false, null)).toMatchObject({ ok: false, erros: { geral: msg } });
    expect(await cadastrarVariante(a, ins.id, { nome: 'Balde', conteudo: '3', escala: 'base', preco: '10,00' })).toMatchObject({ ok: false, erros: { geral: msg } });
    // Nome de outro insumo não pode virar nome de pré-preparo.
    const r = await cadastrarFicha(a, preparo('Cebola'));
    expect(r).toMatchObject({ ok: false, erros: { nome: expect.stringMatching(/Já existe o insumo “Cebola”/) } });
  });

  it('planilha: item com nome de pré-preparo vira subficha, com fator; pré-preparo novo na mesma planilha pede ordem', async () => {
    const csv = [
      'ficha;tipo;rende;insumo;quantidade;unidade;fator',
      'Smash cheddar;prato;1;Pão brioche;1;un;',
      'Smash cheddar;;;molho CHEDDAR;30;g;',
      'Smash cheddar;;;Cebola;15;g;1,18',
      'Vinagrete;pré-preparo;1;Cebola;300;g;',
      'Hot dog;prato;1;Vinagrete;30;g;',
    ].join('\n');
    // Coluna "unidade_rende" ausente: Vinagrete fica sem unidade do rendimento → erro dele, e o Hot dog pede ordem.
    const p = await previaDaImportacao(a, csv);
    expect(p.fichas.find((f) => f.nome === 'Smash cheddar')).toMatchObject({ situacao: 'nova', incompleto: false });
    expect(p.fichas.find((f) => f.nome === 'Hot dog')?.erros[0].mensagem).toMatch(/pré-preparo desta planilha e ainda não existe/);
    const r = await importarFichas(a, csv, 'Marina');
    expect(r).toMatchObject({ ok: true, criadas: 1 });
    const smash = await a.fichaTecnica.findFirstOrThrow({ where: { nome: 'Smash cheddar' }, include: { itens: { orderBy: { ordem: 'asc' } } } });
    expect(smash.itens.map((i) => [i.subfichaId, i.quantidadeMilesimos, i.fatorCorrecaoMilesimos])).toEqual([
      [null, 1000, 1000],
      [ids.molho, 30, 1000],
      [null, 15, 1180],
    ]);
    // Planilha que faria círculo: recusada inteira, com o nome da ficha.
    // (o molho passa a usar a base e a base passa a usar o molho, no mesmo arquivo).
    const circulo = [
      'ficha;tipo;rende;unidade_rende;insumo;quantidade;unidade',
      'Molho cheddar;pré-preparo;2,5;kg;Cheddar;1;kg',
      'Molho cheddar;;;;Base de cebola;100;g',
      'Base de cebola;pré-preparo;1;kg;Molho cheddar;10;g',
    ].join('\n');
    const itensAntes = await a.fichaItem.count({ where: { fichaId: { in: [ids.molho, ids.base] } } });
    const rc = await importarFichas(a, circulo);
    expect(rc).toMatchObject({ ok: false, erro: expect.stringMatching(/^“Base de cebola”: Assim fica um círculo/) });
    expect(rc).toMatchObject({ erro: expect.stringMatching(/Nada foi gravado\.$/) });
    expect(await a.fichaItem.count({ where: { fichaId: { in: [ids.molho, ids.base] } } })).toBe(itensAntes);
  });

  it('eficiência: a lista faz o mesmo número de consultas com 3 ou 30 fichas usando pré-preparo (sem N+1)', async () => {
    const contado = new PrismaClient({ datasources: { db: { url: URL_TESTE } }, log: [{ emit: 'event', level: 'query' }] });
    let consultas = 0;
    const vistas: string[] = [];
    contado.$on('query', (e) => {
      // Só as consultas (BEGIN/COMMIT chegam no evento depois da promessa resolver).
      if (!/^(BEGIN|COMMIT|ROLLBACK)/.test(e.query)) {
        consultas++;
        vistas.push(e.query.slice(0, 90));
      }
    });
    const c = doParceiro(A.id, contado);
    const medir = async (q: string) => {
      consultas = 0;
      vistas.length = 0;
      await listarFichas(c, { q });
      return consultas;
    };
    for (let i = 0; i < 30; i++) {
      const r = await cadastrarFicha(a, { ...burger({ nome: `Lote ${String(i).padStart(2, '0')}` }) });
      if (!r.ok) throw new Error(JSON.stringify(r));
    }
    await medir('aquecer'); // a 1ª leitura do cliente confere o papel do banco uma vez
    const com3 = await medir('Lote 0');
    const viu3 = [...vistas];
    const com30 = await medir('Lote');
    expect(com3, JSON.stringify([viu3, vistas])).toBe(com30);
    // contexto, count, página (fichas, itens, insumos), 1 nível de pré-preparo (fichas, itens, insumos)
    // + 1.5: a última compra de todos os insumos lidos, numa consulta só
    expect(com30).toBe(9);
    expect(vistas.filter((q) => q.includes('DISTINCT ON'))).toHaveLength(1);
    expect(vistas.filter((q) => q.includes('"FichaTecnica"."id", "public"."FichaTecnica"."nome"'))).toHaveLength(2);
    await contado.$disconnect();
  });
});
