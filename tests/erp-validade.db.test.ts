/**
 * ERP 1.4 · Validade por conservação no Postgres de verdade:
 * - a dona marca o "Molho cheddar" como refrigerado 3 dias e congelado 30
 *   (principal: refrigerado) pela action de verdade; o insumo produzido herda
 *   a conservação e as validades NA MESMA TRANSAÇÃO (se a gravação da ficha é
 *   recusada, nenhum dos dois muda);
 * - lista de insumos e filtro por conservação ("fica em congelado");
 * - insumo comprado: validade depois de aberto, com histórico;
 * - CHECKs do banco (principal sem validade, teto) recusam até SQL por fora;
 * - edição concorrente recusada; operador recusado (fichas e insumos);
 * - isolamento: o parceiro B não lê nem edita a validade de A;
 * - planilha com as colunas novas grava; planilha antiga não apaga;
 * - heranças da 1.3: (a) insumo produzido como item comum recusado no
 *   servidor; (c) acima; (d) faxina de pendentes ao abrir a lista.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-validade.db.test.ts
 */
import { ALCANCE_FLOWFOODS } from '@/lib/erp/permissoes';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
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
import { editarInsumo, listarInsumos, obterInsumo } from '@/lib/erp/insumos';
import { cadastrarInsumoDeTeste as cadastrarInsumo } from './erp-db-apoio';
import { cadastrarFicha, editarFicha, listarFichas, mudarSituacaoFicha, obterFicha } from '@/lib/erp/fichas';
import { importarFichas, previaDaImportacao } from '@/lib/erp/ficha-importar';
import { listarHistorico } from '@/lib/erp/historico';
import { resolverAlcance } from '@/lib/erp/permissoes';
import { validadesEmTexto } from '@/lib/erp/validade';
import * as fichasDaSessao from '@/app/erp/fichas/actions';
import * as insumosDaSessao from '@/app/erp/insumos/actions';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;

/** O bloco de validade como o formulário manda. */
function validadeNoForm(form: FormData, linhas: Record<string, [string, 'dias' | 'horas']>, principal: string) {
  form.set('validadeNoFormulario', 'sim');
  for (const [c, [q, em]] of Object.entries(linhas)) {
    form.set(`aceita_${c}`, 'on');
    form.set(`validade_${c}`, q);
    form.set(`validadeEm_${c}`, em);
  }
  form.set('conservacao', principal);
}

describe.skipIf(!URL_TESTE)('ERP 1.4 · validade por conservação (Postgres real)', { timeout: 90_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  let pasta: string;
  const sufixo = `v${globalThis.crypto.randomUUID().slice(0, 8)}`;
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
  /** Roda a action e devolve o estado (erro) ou o destino do redirect (gravou). */
  const rodar = async <T,>(fn: () => Promise<T>): Promise<T | { redirect: string }> => {
    try {
      return await fn();
    } catch (e) {
      const url = (e as { url?: string }).url;
      if (url) return { redirect: url };
      throw e;
    }
  };
  const formDoMolho = () => {
    const form = new FormData();
    form.set('nome', 'Molho cheddar');
    form.set('tipo', 'PRE_PREPARO');
    form.set('rendimento', '2');
    form.set('rendimentoUnidade', 'kg');
    form.append('item_insumo', ids.cheddar);
    form.append('item_quantidade', '1');
    form.append('item_unidade', 'kg');
    form.append('item_fator', '');
    return form;
  };
  const insumoDoMolho = () => a.insumo.findFirst({ where: { nome: 'Molho cheddar' } });

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    pasta = mkdtempSync(join(tmpdir(), 'erp-val-'));
    process.env.ERP_ARQUIVOS_DIR = pasta;
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Val A', slug: `val-a-${sufixo}`, status: 'ATIVO' } });
    B = await db.parceiroFlow.create({ data: { nome: 'Val B', slug: `val-b-${sufixo}`, status: 'ATIVO' } });
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    for (const [chave, campos] of Object.entries({
      cheddar: { nome: 'Cheddar', unidade: 'KG', conteudo: '1', preco: '40,00', conservacao: 'REFRIGERADO' },
      pao: { nome: 'Pão brioche', unidade: 'UN', conteudo: '1', preco: '1,50' },
    })) {
      const r = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', ...campos });
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
    }
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
    if (pasta) rmSync(pasta, { recursive: true, force: true });
  });

  it('a dona marca o Molho cheddar: refrigerado 3 dias e congelado 30 (principal refrigerado), pela action', async () => {
    atual.ctx = () => ctxDe(A, 'DONO');
    const form = formDoMolho();
    validadeNoForm(form, { REFRIGERADO: ['3', 'dias'], CONGELADO: ['30', 'dias'] }, 'REFRIGERADO');
    const r = await rodar(() => fichasDaSessao.acaoCadastrarFicha(null, form));
    expect(r).toMatchObject({ redirect: expect.stringMatching(/^\/erp\/fichas\/.+\?feito=criada$/) });
    const id = (r as { redirect: string }).redirect.split('/')[3].split('?')[0];
    ids.molho = id;
    const f = (await obterFicha(a, id))!;
    expect(f.validades).toEqual({ principal: 'REFRIGERADO', minutos: { REFRIGERADO: 4320, CONGELADO: 43_200 } });
    expect(validadesEmTexto(f.validades)).toBe('Refrigerado: 3 dias · Congelado: 30 dias');
    // Inteiros em minutos no banco.
    const linha = await a.fichaTecnica.findUnique({ where: { id }, select: { conservacao: true, validadeRefrigeradoMin: true, validadeCongeladoMin: true, validadeSecoMin: true } });
    expect(linha).toEqual({ conservacao: 'REFRIGERADO', validadeRefrigeradoMin: 4320, validadeCongeladoMin: 43_200, validadeSecoMin: null });
    // Histórico da ficha com a validade legível.
    const [h] = await listarHistorico(a, { de: [{ entidade: 'FichaTecnica', ids: [id] }], limite: 1, verPrecos: true });
    expect(h.mudancas.find((m) => m.campo === 'validade')?.depois).toBe('Refrigerado 3 dias · Congelado 30 dias');
    expect(h.mudancas.find((m) => m.campo === 'conservação')?.depois).toBe('Refrigerado');
  });

  it('(herança c) o insumo produzido nasce com a conservação e as validades da ficha', async () => {
    const ins = (await insumoDoMolho())!;
    expect(ins).toMatchObject({ tipo: 'PRE_PREPARO', conservacao: 'REFRIGERADO', validadeRefrigeradoMin: 4320, validadeCongeladoMin: 43_200, validadeSecoMin: null });
    const lista = await listarInsumos(a, { q: 'Molho' });
    expect(lista.linhas[0]).toMatchObject({ conservacao: 'REFRIGERADO', conservacaoInformada: true, validades: { principal: 'REFRIGERADO', minutos: { REFRIGERADO: 4320, CONGELADO: 43_200 } } });
    // Filtro "fica em congelado": a principal OU com validade nela.
    expect((await listarInsumos(a, { conservacao: 'CONGELADO' })).linhas.map((l) => l.nome)).toEqual(['Molho cheddar']);
    expect((await listarInsumos(a, { conservacao: 'REFRIGERADO' })).linhas.map((l) => l.nome)).toEqual(['Cheddar', 'Molho cheddar']);
    const det = (await obterInsumo(a, ins.id, ALCANCE_FLOWFOODS))!;
    expect(det.validades).toEqual({ principal: 'REFRIGERADO', minutos: { REFRIGERADO: 4320, CONGELADO: 43_200 } });
    // Pela tela de insumos não se edita (vem da ficha).
    const r = await editarInsumo(a, ins.id, { nome: 'Molho cheddar', tipo: 'PRE_PREPARO', unidade: 'KG', conservacao: 'SECO', conteudo: '1', preco: '1', versao: det.versao });
    expect(r.ok).toBe(false);
  });

  it('(herança c) mudar a validade na ficha muda o insumo na MESMA transação; recusada a ficha, nenhum dos dois muda', async () => {
    const versao = (await obterFicha(a, ids.molho))!.versao;
    const entrada = (nome: string) => ({
      nome,
      tipo: 'PRE_PREPARO',
      rendimento: '2',
      rendimentoUnidade: 'kg',
      itens: [{ insumoId: ids.cheddar, quantidade: '1', unidade: 'kg' }],
      validade: { principal: 'CONGELADO', linhas: { CONGELADO: { marcada: true, quantidade: '60', em: 'dias' as const }, PISTA_FRIA: { marcada: true, quantidade: '6', em: 'horas' as const } } },
    });
    // Renomear para um insumo que já existe é recusado DENTRO da transação (no insumo produzido): nada muda.
    const recusada = await editarFicha(a, ids.molho, { ...entrada('Cheddar'), versao }, { tipo: 'manter' }, 'Marina');
    expect(recusada.ok).toBe(false);
    expect((await a.fichaTecnica.findUnique({ where: { id: ids.molho } }))).toMatchObject({ nome: 'Molho cheddar', conservacao: 'REFRIGERADO', validadeCongeladoMin: 43_200 });
    expect(await insumoDoMolho()).toMatchObject({ conservacao: 'REFRIGERADO', validadeCongeladoMin: 43_200, validadePistaFriaMin: null });

    const ok = await editarFicha(a, ids.molho, { ...entrada('Molho cheddar'), versao }, { tipo: 'manter' }, 'Marina');
    expect(ok).toMatchObject({ ok: true, mudou: ['conservacao', 'validade'] });
    expect(await insumoDoMolho()).toMatchObject({ conservacao: 'CONGELADO', validadeCongeladoMin: 86_400, validadePistaFriaMin: 360, validadeRefrigeradoMin: null });
    const [hi] = await listarHistorico(a, { entidade: 'Insumo', limite: 1, verPrecos: true });
    expect(hi.mudancas.map((m) => [m.campo, m.antes, m.depois])).toEqual([
      ['conservação', 'Refrigerado', 'Congelado'],
      ['validade', 'Refrigerado 3 dias · Congelado 30 dias', 'Pista fria 6 horas · Congelado 60 dias'],
    ]);
  });

  it('edição concorrente recusada: a segunda aba (versão velha) não sobrescreve a validade', async () => {
    const velha = (await obterFicha(a, ids.molho))!.versao;
    const form = (q: string) => {
      const f = formDoMolho();
      f.set('versao', velha);
      validadeNoForm(f, { REFRIGERADO: [q, 'dias'] }, 'REFRIGERADO');
      return f;
    };
    atual.ctx = () => ctxDe(A, 'DONO');
    expect(await rodar(() => fichasDaSessao.acaoEditarFicha(ids.molho, null, form('3')))).toMatchObject({ redirect: expect.stringContaining('feito=editada') });
    const segunda = await rodar(() => fichasDaSessao.acaoEditarFicha(ids.molho, null, form('5')));
    expect(segunda).toMatchObject({ ok: false, conflito: true });
    expect((await obterFicha(a, ids.molho))!.validades).toEqual({ principal: 'REFRIGERADO', minutos: { REFRIGERADO: 4320 } });
    expect(await insumoDoMolho()).toMatchObject({ conservacao: 'REFRIGERADO', validadeRefrigeradoMin: 4320, validadeCongeladoMin: null });
  });

  it('validade inválida volta na linha e nada é gravado', async () => {
    atual.ctx = () => ctxDe(A, 'DONO');
    const form = formDoMolho();
    form.set('versao', (await obterFicha(a, ids.molho))!.versao);
    validadeNoForm(form, { REFRIGERADO: ['0', 'dias'], CONGELADO: ['900', 'dias'] }, 'SECO');
    const r = await rodar(() => fichasDaSessao.acaoEditarFicha(ids.molho, null, form));
    expect(r).toMatchObject({ ok: false });
    const erros = (r as { erros: Record<string, string> }).erros;
    expect(Object.keys(erros).sort()).toEqual(['conservacao', 'validade-CONGELADO', 'validade-REFRIGERADO']);
    expect((await obterFicha(a, ids.molho))!.validades?.minutos).toEqual({ REFRIGERADO: 4320 });
  });

  it('operador só vê: a action de ficha e a de insumo recusam a validade; nada muda', async () => {
    atual.ctx = () => ctxDe(A, 'OPERADOR');
    const form = formDoMolho();
    form.set('versao', (await obterFicha(a, ids.molho))!.versao);
    validadeNoForm(form, { SECO: ['10', 'dias'] }, 'SECO');
    expect(await rodar(() => fichasDaSessao.acaoEditarFicha(ids.molho, null, form))).toMatchObject({ ok: false, erros: { geral: expect.any(String) } });
    const ch = (await obterInsumo(a, ids.cheddar, ALCANCE_FLOWFOODS))!;
    const fi = new FormData();
    for (const [k, v] of Object.entries({ nome: 'Cheddar', tipo: 'INGREDIENTE', unidade: 'KG', conteudo: '1', escala: 'base', preco: '40,00', versao: ch.versao })) fi.set(k, v);
    validadeNoForm(fi, { REFRIGERADO: ['5', 'dias'] }, 'REFRIGERADO');
    expect(await rodar(() => insumosDaSessao.acaoEditarInsumo(ids.cheddar, null, fi))).toMatchObject({ ok: false });
    expect((await obterFicha(a, ids.molho))!.validades?.minutos).toEqual({ REFRIGERADO: 4320 });
    expect((await obterInsumo(a, ids.cheddar, ALCANCE_FLOWFOODS))!.validades).toEqual({ principal: 'REFRIGERADO', minutos: {} });
    // A dona, pela MESMA action de insumo: validade depois de aberto, com histórico.
    atual.ctx = () => ctxDe(A, 'DONO');
    expect(await rodar(() => insumosDaSessao.acaoEditarInsumo(ids.cheddar, null, fi))).toMatchObject({ redirect: expect.stringContaining(ids.cheddar) });
    expect((await obterInsumo(a, ids.cheddar, ALCANCE_FLOWFOODS))!.validades).toEqual({ principal: 'REFRIGERADO', minutos: { REFRIGERADO: 7200 } });
    const [h] = await listarHistorico(a, { de: [{ entidade: 'Insumo', ids: [ids.cheddar] }], limite: 1, verPrecos: true });
    expect(h.mudancas.map((m) => [m.campo, m.antes, m.depois])).toEqual([['validade', '—', 'Refrigerado 5 dias']]);
  });

  it('o banco recusa por fora: principal sem validade, sem principal com validade, acima do teto, zero', async () => {
    const tentar = (data: Record<string, unknown>) => a.fichaTecnica.updateMany({ where: { id: ids.molho }, data });
    await expect(tentar({ conservacao: 'SECO' })).rejects.toThrow(/FichaTecnica_validade_principal/);
    await expect(tentar({ conservacao: null })).rejects.toThrow(/FichaTecnica_validade_principal/);
    await expect(tentar({ validadeRefrigeradoMin: 1_051_201 })).rejects.toThrow(/FichaTecnica_validades_faixa/);
    await expect(tentar({ validadeCongeladoMin: 0 })).rejects.toThrow(/FichaTecnica_validades_faixa/);
    await expect(a.insumo.updateMany({ where: { id: ids.cheddar }, data: { conservacao: 'CONGELADO' } })).rejects.toThrow(/Insumo_validade_principal/);
    await expect(a.insumo.updateMany({ where: { id: ids.cheddar }, data: { validadeRefrigeradoMin: 1_051_201 } })).rejects.toThrow(/Insumo_validades_faixa/);
  });

  it('isolamento: o parceiro B não lê nem edita a ficha de A; o portão não deixa', async () => {
    expect(await obterFicha(b, ids.molho)).toBeNull();
    expect((await listarInsumos(b, { conservacao: 'REFRIGERADO' })).linhas).toEqual([]);
    const r = await editarFicha(
      b,
      ids.molho,
      { nome: 'X', tipo: 'PRE_PREPARO', rendimento: '1', rendimentoUnidade: 'kg', itens: [], validade: { principal: 'SECO', linhas: { SECO: { marcada: true, quantidade: '1', em: 'dias' } } }, versao: new Date().toISOString() },
      { tipo: 'manter' },
      'Intruso',
    );
    expect(r).toMatchObject({ ok: false, naoEncontrado: true });
    expect(await b.fichaTecnica.updateMany({ where: { id: ids.molho }, data: { validadeSecoMin: 10, conservacao: 'SECO' } })).toEqual({ count: 0 });
    expect((await obterFicha(a, ids.molho))!.validades?.minutos).toEqual({ REFRIGERADO: 4320 });
  });

  it('planilha com as colunas novas grava; a mesma sem as colunas não apaga (igual); desativar mantém o insumo com a validade', async () => {
    const comColunas = [
      'ficha;tipo;rende;unidade_rende;insumo;quantidade;unidade;conservacao;validade_refrigerado;validade_congelado',
      'Molho cheddar;pré-preparo;2;kg;Cheddar;1;kg;congelado;2 dias;45 dias',
      'Pão na chapa;prato;1;porção;Pão brioche;1;un;;;',
    ].join('\n');
    const previa = await previaDaImportacao(a, comColunas);
    expect(previa.fichas.find((f) => f.nome === 'Molho cheddar')).toMatchObject({ situacao: 'muda', mudancas: ['conservação', 'validade'] });
    expect(await importarFichas(a, comColunas, 'Marina')).toMatchObject({ ok: true, criadas: 1, alteradas: 1 });
    expect((await obterFicha(a, ids.molho))!.validades).toEqual({ principal: 'CONGELADO', minutos: { REFRIGERADO: 2880, CONGELADO: 64_800 } });
    expect(await insumoDoMolho()).toMatchObject({ conservacao: 'CONGELADO', validadeRefrigeradoMin: 2880, validadeCongeladoMin: 64_800 });
    const pao = (await a.fichaTecnica.findFirst({ where: { nome: 'Pão na chapa' } }))!;
    expect(pao.conservacao).toBeNull();

    const antiga = ['ficha;tipo;rende;unidade_rende;insumo;quantidade;unidade', 'Molho cheddar;pré-preparo;2;kg;Cheddar;1;kg'].join('\n');
    expect((await previaDaImportacao(a, antiga)).fichas[0]).toMatchObject({ situacao: 'igual' });
    expect((await obterFicha(a, ids.molho))!.validades?.principal).toBe('CONGELADO');

    expect((await mudarSituacaoFicha(a, ids.molho, false, 'teste', 'Marina')).ok).toBe(true);
    expect(await insumoDoMolho()).toMatchObject({ ativo: false, conservacao: 'CONGELADO', validadeCongeladoMin: 64_800 });
    expect((await mudarSituacaoFicha(a, ids.molho, true, null, 'Marina')).ok).toBe(true);
  });

  it('ficha sem validade (1.2/1.3) continua gravando; o formulário com nada marcado limpa e o insumo fica "não informada"', async () => {
    const r = await cadastrarFicha(a, { nome: 'Base de cebola', tipo: 'PRE_PREPARO', rendimento: '1', rendimentoUnidade: 'kg', itens: [{ insumoId: ids.cheddar, quantidade: '100', unidade: 'g' }] }, { tipo: 'manter' }, 'M');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ins = (await a.insumo.findFirst({ where: { nome: 'Base de cebola' } }))!;
    expect(ins).toMatchObject({ conservacao: 'SECO', validadeSecoMin: null });
    expect((await listarInsumos(a, { q: 'Base de cebola' })).linhas[0].conservacaoInformada).toBe(false);
    // Limpar pelo formulário (marcador presente, nada marcado) volta a "não informada".
    const versao = (await obterFicha(a, ids.molho))!.versao;
    const limpa = await editarFicha(
      a,
      ids.molho,
      { nome: 'Molho cheddar', tipo: 'PRE_PREPARO', rendimento: '2', rendimentoUnidade: 'kg', itens: [{ insumoId: ids.cheddar, quantidade: '1', unidade: 'kg' }], validade: { principal: '', linhas: {} }, versao },
      { tipo: 'manter' },
      'M',
    );
    expect(limpa).toMatchObject({ ok: true, mudou: ['conservacao', 'validade'] });
    expect((await obterFicha(a, ids.molho))!.validades).toBeNull();
    expect(await insumoDoMolho()).toMatchObject({ conservacao: 'CONGELADO', validadeCongeladoMin: null, validadeRefrigeradoMin: null });
  });

  it('(herança a) formulário forjado com o insumo produzido como item comum: recusado no servidor, nada gravado', async () => {
    const ins = (await insumoDoMolho())!;
    atual.ctx = () => ctxDe(A, 'DONO');
    const form = new FormData();
    form.set('nome', 'Burger forjado');
    form.set('tipo', 'PRATO');
    form.set('rendimento', '1');
    form.append('item_insumo', ins.id); // o id do INSUMO produzido, não "ficha:<id>"
    form.append('item_quantidade', '40');
    form.append('item_unidade', 'g');
    form.append('item_fator', '');
    const r = await rodar(() => fichasDaSessao.acaoCadastrarFicha(null, form));
    expect(r).toMatchObject({ ok: false, erros: { 'item-0': expect.stringMatching(/é o pré-preparo “Molho cheddar”/) } });
    expect(await a.fichaTecnica.count({ where: { nome: 'Burger forjado' } })).toBe(0);
  });

  it('(herança d) abrir a lista de fichas faxina a foto pendente esquecida há mais de 24 h', async () => {
    const pend = join(pasta, A.id, 'fichas', 'pendentes');
    mkdirSync(pend, { recursive: true });
    const velha = `${'a'.repeat(32)}.jpg`;
    const nova = `${'b'.repeat(32)}.jpg`;
    writeFileSync(join(pend, velha), 'x');
    writeFileSync(join(pend, nova), 'x');
    const ontem = new Date(Date.now() - 25 * 3600_000);
    utimesSync(join(pend, velha), ontem, ontem);
    await listarFichas(a);
    expect(readdirSync(pend)).toEqual([nova]);
  });
});
