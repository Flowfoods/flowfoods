/**
 * ERP I.1b · clareza e correções do cadastro de insumos — no Postgres de verdade.
 *
 * Prova: a conservação é ESCOLHIDA (vazio, "Conservação" e valor fora da lista são recusados no servidor, e nada é gravado;
 * antes o servidor assumia Seco); editar sem o campo mantém o que está gravado; tipo "Material de limpeza e uso" (não entra em
 * ficha nem na embalagem de um prato; insumo em uso não vira material; sugestão de categoria Limpeza); marca de referência
 * opcional (salva, edita, apaga, no histórico, sem bloquear nada; não é fornecedor); custo inicial de referência (5 kg por
 * R$ 25 = R$ 5,00/kg; "Ainda não sei" = custo não informado na lista, no detalhe e na ficha, nunca R$ 0,00; o cadastro não cria
 * nota, movimento, saldo nem despesa; o histórico fala em custo inicial de referência); "conservação a confirmar" (só os Seco
 * antigos, sem confirmação, em Proteína, Laticínios e Hortifruti; nada é alterado; confirmar ou salvar confirma; histórico);
 * isolamento entre parceiros; e as actions de verdade: volta só por caminho interno da área.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-insumo-clareza.db.test.ts
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const atual = vi.hoisted(() => ({ ctx: null as null | (() => unknown), auditoria: [] as unknown[] }));
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
  return {
    exigirParceiroDaSessao: async () => atual.ctx!(),
    exigirParceiro: async () => atual.ctx!(),
    recusaDaAcao,
    exigirPermissao,
    pode,
  };
});
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async (a: unknown) => atual.auditoria.push(a) } } }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { listarHistorico } from '@/lib/erp/historico';
import { cadastrarInsumo, confirmarConservacao, contarConservacaoAConfirmar, editarInsumo, listarInsumos, obterInsumo } from '@/lib/erp/insumos';
import { garantirCategoriasPadrao, listarCategorias, sugestaoParaInsumo } from '@/lib/erp/categorias';
import { cadastrarFicha, insumosParaFicha, obterFicha } from '@/lib/erp/fichas';
import { custoIncompleto } from '@/lib/erp/ficha-campos';
import { ALCANCE_FLOWFOODS, resolverAlcance } from '@/lib/erp/permissoes';
import { lerFiltros } from '@/lib/erp/insumo-campos';
import * as daSessao from '@/app/erp/insumos/actions';
import * as doNivel1 from '@/app/rodolfo/(painel)/erp/[slug]/insumos/actions';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const n = (t: string | null | undefined) => (t ?? '').replace(/ /g, ' ');

describe.skipIf(!URL_TESTE)('ERP I.1b · clareza do cadastro de insumos (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  let pasta: string;
  const sufixo = `i${globalThis.crypto.randomUUID().slice(0, 8)}`;
  type P = { id: string; slug: string; nome: string };
  let A: P;
  let B: P;
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const cat: Record<string, string> = {};
  const catB: Record<string, string> = {};

  const farinha = { tipo: 'INGREDIENTE', unidade: 'KG', conservacao: 'SECO', conteudo: '5', escala: 'base', preco: '25,00' };
  const novo = (nome: string, extra: Record<string, string> = {}) => ({ ...farinha, nome, categoriaId: cat.MERCEARIA, ...extra });
  const form = (campos: Record<string, string | string[]>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
    return f;
  };
  const ctxDe = (parceiro: P, perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR') => ({
    parceiro,
    alcance: resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] }),
    cliente: doParceiro(parceiro.id, db),
    bloqueio: null,
    podeEscrever: true,
    sessao: { userId: 'u', autorNome: 'Marina Dona' },
  });
  async function rodar<T>(p: Promise<T>): Promise<{ destino: string } | T> {
    try {
      return await p;
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('REDIRECT ')) return { destino: (e as Error & { url: string }).url };
      throw e;
    }
  }
  /** O que o cadastro de insumo NÃO pode criar: nota de compra, movimento de estoque, saldo, despesa. */
  const financeiro = async (c: ClienteDoParceiro) => ({
    notas: await c.notaEntrada.count(),
    notaItens: await c.notaEntradaItem.count(),
    movimentos: await c.movimentoEstoque.count(),
    saldos: await c.saldoEstoque.count(),
    despesas: await c.despesa.count(),
  });
  const legado = async (c: ClienteDoParceiro, nome: string, extra: Record<string, unknown> = {}) =>
    (
      await c.insumo.create({
        data: { parceiroId: c.parceiroId, nome, unidade: 'KG', conteudoMilesimos: 1000, precoEmbalagemCentavos: 1000, ...extra },
        select: { id: true },
      })
    ).id;

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    pasta = mkdtempSync(join(tmpdir(), 'erp-i1b-'));
    process.env.ERP_ARQUIVOS_DIR = pasta;
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Clareza A', slug: `cla-a-${sufixo}`, status: 'ATIVO' } });
    B = await db.parceiroFlow.create({ data: { nome: 'Clareza B', slug: `cla-b-${sufixo}`, status: 'ATIVO' } });
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    await garantirCategoriasPadrao(a);
    await garantirCategoriasPadrao(b);
    for (const c of await listarCategorias(a)) cat[c.chave!] = c.id;
    for (const c of await listarCategorias(b)) catB[c.chave!] = c.id;
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
    if (pasta) rmSync(pasta, { recursive: true, force: true });
  });

  // ----------------------------------------------------- conservação escolhida

  it('sem conservação, com "Conservação" ou com valor fora da lista: o servidor recusa e NADA é gravado; com a escolha, grava e já nasce confirmada', async () => {
    const antes = await a.insumo.count();
    for (const ruim of [undefined, '', '   ', 'Conservação', 'Selecione a conservação', 'seco', 'FRIO']) {
      const { conservacao: _c, ...semCampo } = novo('Coxa de frango');
      const r = await cadastrarInsumo(a, ruim === undefined ? semCampo : { ...semCampo, conservacao: ruim }, 'Marina');
      expect(r, String(ruim)).toMatchObject({ ok: false, erros: { conservacao: expect.stringMatching(/Escolha a conservação/) } });
    }
    expect(await a.insumo.count()).toBe(antes);
    for (const c of ['SECO', 'PISTA_FRIA', 'REFRIGERADO', 'CONGELADO']) {
      const r = await cadastrarInsumo(a, novo(`Item ${c}`, { conservacao: c, categoriaId: cat.PROTEINA }), 'Marina');
      expect(r.ok, c).toBe(true);
      if (!r.ok) continue;
      const linha = await a.insumo.findUniqueOrThrow({ where: { id: r.id }, select: { conservacao: true, conservacaoConfirmadaEm: true } });
      expect(linha.conservacao).toBe(c);
      expect(linha.conservacaoConfirmadaEm).toBeInstanceOf(Date);
    }
  });

  it('editar sem mandar a conservação mantém a gravada (nunca vira Seco); mandar vazio é recusado', async () => {
    const r = await cadastrarInsumo(a, novo('Peito de frango', { conservacao: 'CONGELADO', categoriaId: cat.PROTEINA }), 'Marina');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lido = await a.insumo.findUniqueOrThrow({ where: { id: r.id }, select: { atualizadoEm: true } });
    const { conservacao: _c, ...semConservacao } = novo('Peito de frango', { categoriaId: cat.PROTEINA, preco: '30,00' });
    const e = await editarInsumo(a, r.id, { ...semConservacao, versao: lido.atualizadoEm.toISOString() }, 'Marina');
    expect(e.ok).toBe(true);
    expect((await a.insumo.findUniqueOrThrow({ where: { id: r.id }, select: { conservacao: true } })).conservacao).toBe('CONGELADO');
    const lido2 = await a.insumo.findUniqueOrThrow({ where: { id: r.id }, select: { atualizadoEm: true } });
    const vazio = await editarInsumo(a, r.id, { ...semConservacao, conservacao: '', versao: lido2.atualizadoEm.toISOString() }, 'Marina');
    expect(vazio).toMatchObject({ ok: false, erros: { conservacao: expect.stringMatching(/Escolha a conservação/) } });
    expect((await a.insumo.findUniqueOrThrow({ where: { id: r.id }, select: { conservacao: true } })).conservacao).toBe('CONGELADO');
  });

  // --------------------------------------------------------------- tipo MATERIAL

  it('material de limpeza e uso: cadastra, a categoria sugerida é Limpeza, não aparece para a ficha e a ficha recusa', async () => {
    const sug = await sugestaoParaInsumo(a, 'Detergente neutro', 'MATERIAL');
    expect(sug.categoriaId).toBe(cat.LIMPEZA);
    const r = await cadastrarInsumo(a, novo('Detergente neutro', { tipo: 'MATERIAL', unidade: 'L', categoriaId: cat.LIMPEZA, conteudo: '5', preco: '18,90' }), 'Marina');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await a.insumo.findUniqueOrThrow({ where: { id: r.id }, select: { tipo: true } })).tipo).toBe('MATERIAL');
    // O seletor de insumos da ficha não oferece o material...
    const oferecidos = (await insumosParaFicha(a)).map((i) => i.nome);
    expect(oferecidos).not.toContain('Detergente neutro');
    expect(oferecidos).toContain('Item SECO');
    // ...e o servidor recusa o material numa receita, mesmo que o navegador o mande.
    const ingrediente = await cadastrarInsumo(a, novo('Sal refinado', { conteudo: '1', preco: '3,00' }), 'Marina');
    if (!ingrediente.ok) throw new Error('sal');
    const ficha = await cadastrarFicha(a, {
      nome: 'Prato com material',
      tipo: 'PRATO',
      rendimento: '1',
      descricao: '',
      modoPreparo: '',
      itens: [
        { insumoId: ingrediente.id, quantidade: '10', unidade: 'g' },
        { insumoId: r.id, quantidade: '10', unidade: 'ml' },
      ],
    });
    expect(ficha).toMatchObject({ ok: false, erros: { 'item-1': expect.stringMatching(/material de limpeza e uso: não entra em ficha técnica/) } });
    // Ele continua sendo comprado e listado como qualquer insumo, com o tipo dito.
    const lista = await listarInsumos(a, { tipo: 'MATERIAL' });
    expect(lista.linhas.map((l) => l.nome)).toContain('Detergente neutro');
  });

  it('insumo que já está em ficha não vira material (a ficha quebraria); sem uso, vira; material pode voltar a ingrediente', async () => {
    const emUso = await cadastrarInsumo(a, novo('Cebola roxa', { categoriaId: cat.HORTIFRUTI, conservacao: 'REFRIGERADO' }), 'Marina');
    const livre = await cadastrarInsumo(a, novo('Esponja', { categoriaId: cat.LIMPEZA }), 'Marina');
    if (!emUso.ok || !livre.ok) throw new Error('setup');
    const f = await cadastrarFicha(a, { nome: 'Ficha da cebola', tipo: 'PRATO', rendimento: '1', descricao: '', modoPreparo: '', itens: [{ insumoId: emUso.id, quantidade: '50', unidade: 'g' }] });
    expect(f.ok).toBe(true);
    const versao = async (id: string) => (await a.insumo.findUniqueOrThrow({ where: { id }, select: { atualizadoEm: true } })).atualizadoEm.toISOString();
    const corpo = (nome: string, extra: Record<string, string>) => ({ ...novo(nome, extra), tipo: 'MATERIAL' });
    const recusa = await editarInsumo(a, emUso.id, { ...corpo('Cebola roxa', { categoriaId: cat.HORTIFRUTI, conservacao: 'REFRIGERADO' }), versao: await versao(emUso.id) }, 'Marina');
    expect(recusa).toMatchObject({ ok: false, erros: { tipo: expect.stringMatching(/ficha técnica/) } });
    expect((await a.insumo.findUniqueOrThrow({ where: { id: emUso.id }, select: { tipo: true } })).tipo).toBe('INGREDIENTE');
    const ok = await editarInsumo(a, livre.id, { ...corpo('Esponja', { categoriaId: cat.LIMPEZA }), versao: await versao(livre.id) }, 'Marina');
    expect(ok.ok).toBe(true);
    expect((await a.insumo.findUniqueOrThrow({ where: { id: livre.id }, select: { tipo: true } })).tipo).toBe('MATERIAL');
    const volta = await editarInsumo(a, livre.id, { ...novo('Esponja', { categoriaId: cat.LIMPEZA }), versao: await versao(livre.id) }, 'Marina');
    expect(volta.ok).toBe(true);
    expect((await a.insumo.findUniqueOrThrow({ where: { id: livre.id }, select: { tipo: true } })).tipo).toBe('INGREDIENTE');
  });

  // -------------------------------------------------------- marca de referência

  it('marca de referência: opcional, salva, edita, apaga e aparece no histórico; não bloqueia nada nem vira fornecedor', async () => {
    const sem = await cadastrarInsumo(a, novo('Feijão carioca'), 'Marina');
    expect(sem.ok).toBe(true);
    if (!sem.ok) return;
    expect((await a.insumo.findUniqueOrThrow({ where: { id: sem.id }, select: { marcaReferencia: true } })).marcaReferencia).toBeNull();
    const com = await cadastrarInsumo(a, novo('Arroz agulhinha', { marcaReferencia: '  Camil  ' }), 'Marina');
    expect(com.ok).toBe(true);
    if (!com.ok) return;
    expect((await a.insumo.findUniqueOrThrow({ where: { id: com.id }, select: { marcaReferencia: true, fornecedorPadraoId: true } }))).toEqual({ marcaReferencia: 'Camil', fornecedorPadraoId: null });
    const versao = async () => (await a.insumo.findUniqueOrThrow({ where: { id: com.id }, select: { atualizadoEm: true } })).atualizadoEm.toISOString();
    // Trocar a marca vai para o histórico; omitir o campo mantém; mandar vazio apaga.
    expect((await editarInsumo(a, com.id, { ...novo('Arroz agulhinha', { marcaReferencia: 'Tio João' }), versao: await versao() }, 'Marina')).ok).toBe(true);
    const h = await listarHistorico(a, { de: [{ entidade: 'Insumo', ids: [com.id] }], limite: 5, verPrecos: false });
    expect(h[0].mudancas.map((m) => [m.campo, m.antes, m.depois])).toContainEqual(['marca de referência', 'Camil', 'Tio João']);
    expect((await editarInsumo(a, com.id, { ...novo('Arroz agulhinha', { preco: '26,00' }), versao: await versao() }, 'Marina')).ok).toBe(true);
    expect((await a.insumo.findUniqueOrThrow({ where: { id: com.id }, select: { marcaReferencia: true } })).marcaReferencia).toBe('Tio João');
    expect((await editarInsumo(a, com.id, { ...novo('Arroz agulhinha', { preco: '26,00', marcaReferencia: '' }), versao: await versao() }, 'Marina')).ok).toBe(true);
    expect((await a.insumo.findUniqueOrThrow({ where: { id: com.id }, select: { marcaReferencia: true } })).marcaReferencia).toBeNull();
    // Longa demais é recusada no campo e não grava.
    const longa = await cadastrarInsumo(a, novo('Macarrão', { marcaReferencia: 'x'.repeat(81) }), 'Marina');
    expect(longa).toMatchObject({ ok: false, erros: { marcaReferencia: expect.stringMatching(/Marca longa demais/) } });
    // A mesma marca em dois insumos e em dois parceiros é só texto: nada único, nada bloqueado.
    expect((await cadastrarInsumo(a, novo('Arroz parboilizado', { marcaReferencia: 'Tio João' }), 'Marina')).ok).toBe(true);
    expect((await cadastrarInsumo(b, { ...novo('Arroz agulhinha', { marcaReferencia: 'Tio João' }), categoriaId: catB.MERCEARIA }, 'Marina')).ok).toBe(true);
  });

  // ------------------------------------------------------- custo inicial de referência

  it('custo inicial: saco de 5 kg por R$ 25,00 = R$ 5,00/kg, e o cadastro NÃO cria nota, movimento, saldo nem despesa', async () => {
    const antes = await financeiro(a);
    const r = await cadastrarInsumo(a, novo('Farinha de trigo'), 'Marina');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await financeiro(a)).toEqual(antes);
    const d = await obterInsumo(a, r.id, ALCANCE_FLOWFOODS);
    expect(d?.custo).toEqual({ centavos: 1, milesimos: 2 }); // R$ 25,00 ÷ 5 kg = R$ 5,00 por kg (fração reduzida)
    expect(d?.ultimaCompra).toBeNull(); // origem: referência inicial, nenhuma compra
    const linha = (await listarInsumos(a, { q: 'Farinha de trigo' })).linhas[0];
    expect(linha.custo).toEqual({ centavos: 1, milesimos: 2 });
    expect(linha.ultimaCompra).toBeNull();
    // O histórico fala em custo inicial de referência (e não em preço de compra).
    const h = await listarHistorico(a, { de: [{ entidade: 'Insumo', ids: [r.id] }], limite: 5, verPrecos: false });
    const campos = h[0].mudancas.map((m) => [m.campo, n(m.depois)]);
    expect(campos).toContainEqual(['custo inicial de referência', 'R$ 25,00']);
    expect(campos).toContainEqual(['custo de referência por unidade', 'R$ 5,00/kg']);
  });

  it('"Ainda não sei o custo": custo nulo (não zero) na lista, no detalhe e na ficha — que fica incompleta —, e nada financeiro é criado', async () => {
    const antes = await financeiro(a);
    const r = await cadastrarInsumo(a, novo('Alho triturado', { preco: '', semPreco: 'on', categoriaId: cat.HORTIFRUTI, conservacao: 'REFRIGERADO' }), 'Marina');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await financeiro(a)).toEqual(antes);
    expect((await a.insumo.findUniqueOrThrow({ where: { id: r.id }, select: { precoEmbalagemCentavos: true } })).precoEmbalagemCentavos).toBe(0);
    const d = await obterInsumo(a, r.id, ALCANCE_FLOWFOODS);
    expect(d?.custo).toBeNull();
    expect(d?.custoCadastrado).toBeNull();
    expect((await listarInsumos(a, { q: 'Alho triturado' })).linhas[0].custo).toBeNull();
    // O filtro "só sem custo" o acha.
    expect((await listarInsumos(a, { semPreco: true })).linhas.map((l) => l.nome)).toContain('Alho triturado');
    // A ficha que usa o insumo sem custo fica INCOMPLETA: nenhum total confiável, nenhum zero.
    const f = await cadastrarFicha(a, { nome: 'Molho de alho', tipo: 'PRATO', rendimento: '1', descricao: '', modoPreparo: '', itens: [{ insumoId: r.id, quantidade: '30', unidade: 'g' }] });
    expect(f.ok).toBe(true);
    if (!f.ok) return;
    const det = await obterFicha(a, f.id, { verPrecos: true });
    expect(custoIncompleto(det!.custo)).toBe(true);
    expect(det!.custo.faltaPreco).toEqual(['Alho triturado']);
    expect(det!.itens[0].custoDoInsumo).toBeNull();
    // Depois: o custo aparece quando alguém informa (editar), sem criar compra.
    const v = (await a.insumo.findUniqueOrThrow({ where: { id: r.id }, select: { atualizadoEm: true } })).atualizadoEm.toISOString();
    expect((await editarInsumo(a, r.id, { ...novo('Alho triturado', { preco: '40,00', categoriaId: cat.HORTIFRUTI, conservacao: 'REFRIGERADO' }), versao: v }, 'Marina')).ok).toBe(true);
    expect((await obterInsumo(a, r.id, ALCANCE_FLOWFOODS))?.custo).toEqual({ centavos: 4, milesimos: 5 }); // R$ 40,00 ÷ 5 kg = R$ 8,00 por kg
    expect(await financeiro(a)).toEqual(antes);
  });

  // ------------------------------------------------------ conservação a confirmar

  it('conservação a confirmar: só o Seco antigo, sem confirmação, em Proteína, Laticínios e Hortifruti; NADA é alterado; confirmar tira da lista e fica no histórico', async () => {
    const frango = await legado(a, 'Coxa de frango (antigo)', { categoriaId: cat.PROTEINA });
    const queijo = await legado(a, 'Queijo (antigo)', { categoriaId: cat.LATICINIOS });
    const alface = await legado(a, 'Alface (antigo)', { categoriaId: cat.HORTIFRUTI });
    await legado(a, 'Arroz (antigo)', { categoriaId: cat.MERCEARIA });
    await legado(a, 'Carne moída (antigo)', { categoriaId: cat.PROTEINA, conservacao: 'CONGELADO' });
    await legado(a, 'Sem categoria (antigo)');
    const retrato = async () => JSON.stringify(await a.insumo.findMany({ orderBy: { id: 'asc' }, select: { id: true, nome: true, tipo: true, conservacao: true, validadeSecoMin: true, precoEmbalagemCentavos: true, conteudoMilesimos: true, categoriaId: true } }));
    const antes = await retrato();
    expect(await contarConservacaoAConfirmar(a)).toBe(3);
    const lista = await listarInsumos(a, lerFiltros({ conservacao: 'confirmar' }));
    expect(lista.linhas.map((l) => l.nome).sort()).toEqual(['Alface (antigo)', 'Coxa de frango (antigo)', 'Queijo (antigo)']);
    expect(lista.linhas.every((l) => l.conservacaoAConfirmar && l.conservacao === 'SECO')).toBe(true);
    // Combina com os outros filtros (tipo, situação) sem apagá-los.
    expect((await listarInsumos(a, lerFiltros({ conservacao: 'confirmar', tipo: 'EMBALAGEM' }))).linhas).toHaveLength(0);
    // Nada mudou só por listar.
    expect(await retrato()).toBe(antes);
    expect((await obterInsumo(a, frango, ALCANCE_FLOWFOODS))?.conservacaoAConfirmar).toBe(true);

    // Confirmar: sem mudar a conservação, o prazo nem o custo; fica no histórico; de novo é sem efeito.
    const c1 = await confirmarConservacao(a, frango, 'Marina');
    expect(c1).toMatchObject({ ok: true, mudou: ['conservacao'] });
    expect(await contarConservacaoAConfirmar(a)).toBe(2);
    expect((await a.insumo.findUniqueOrThrow({ where: { id: frango }, select: { conservacao: true } })).conservacao).toBe('SECO');
    const h = await listarHistorico(a, { de: [{ entidade: 'Insumo', ids: [frango] }], limite: 5, verPrecos: false });
    expect(h[0]).toMatchObject({ acao: 'CONFIRMOU', autorNome: 'Marina' });
    expect(await confirmarConservacao(a, frango, 'Marina')).toMatchObject({ ok: true, mudou: [] });
    expect((await listarHistorico(a, { de: [{ entidade: 'Insumo', ids: [frango] }], limite: 10, verPrecos: false })).filter((x) => x.acao === 'CONFIRMOU')).toHaveLength(1);

    // Salvar o formulário SEM mudar a conservação e sem marcar "Confirmo..." NÃO confirma (o campo não foi olhado); marcar confirma;
    // trocar para refrigerado muda e confirma.
    const v = async (id: string) => (await a.insumo.findUniqueOrThrow({ where: { id }, select: { atualizadoEm: true } })).atualizadoEm.toISOString();
    const igual = { nome: 'Queijo (antigo)', tipo: 'INGREDIENTE', unidade: 'KG', conservacao: 'SECO', conteudo: '1', escala: 'base', preco: '10,00', categoriaId: cat.LATICINIOS };
    expect(await editarInsumo(a, queijo, { ...igual, versao: await v(queijo) }, 'Marina')).toMatchObject({ ok: true, mudou: [] });
    expect(await contarConservacaoAConfirmar(a)).toBe(2);
    expect((await a.insumo.findUniqueOrThrow({ where: { id: queijo }, select: { conservacaoConfirmadaEm: true } })).conservacaoConfirmadaEm).toBeNull();
    expect(await editarInsumo(a, queijo, { ...igual, conservacaoConfirmada: 'sim', versao: await v(queijo) }, 'Marina')).toMatchObject({ ok: true, mudou: ['conservacao'] });
    expect(await editarInsumo(a, alface, { ...igual, nome: 'Alface (antigo)', conservacao: 'REFRIGERADO', categoriaId: cat.HORTIFRUTI, versao: await v(alface) }, 'Marina')).toMatchObject({ ok: true });
    expect(await contarConservacaoAConfirmar(a)).toBe(0);
    expect((await a.insumo.findUniqueOrThrow({ where: { id: alface }, select: { conservacao: true } })).conservacao).toBe('REFRIGERADO');
  });

  it('isolamento: o outro parceiro não vê, não confirma e não conta o que é de A', async () => {
    const idA = await legado(a, 'Frango de A (antigo)', { categoriaId: cat.PROTEINA });
    expect(await confirmarConservacao(b, idA, 'Intruso')).toMatchObject({ ok: false, naoEncontrado: true });
    expect((await a.insumo.findUniqueOrThrow({ where: { id: idA }, select: { conservacaoConfirmadaEm: true } })).conservacaoConfirmadaEm).toBeNull();
    expect(await contarConservacaoAConfirmar(b)).toBe(0);
    expect((await listarInsumos(b, { tipo: 'MATERIAL' })).linhas.map((l) => l.nome)).not.toContain('Detergente neutro');
    expect(await obterInsumo(b, idA, ALCANCE_FLOWFOODS)).toBeNull();
    // Material e marca de A não aparecem para B, nem pela filtragem de B.
    expect((await listarInsumos(b, { q: 'Arroz' })).linhas.map((l) => l.nome)).toEqual(['Arroz agulhinha']);
    expect(await b.insumo.count({ where: { tipo: 'MATERIAL' } })).toBe(0);
  });

  // ---------------------------------------------------------------- actions e volta

  describe('as actions de verdade: volta só por caminho interno', () => {
    const corpo = (nome: string, extra: Record<string, string> = {}) => form({ ...novo(nome, extra), envio: `envio-${globalThis.crypto.randomUUID()}` });

    it('pessoa do parceiro: com volta interna, volta à nota com o insumo; sem volta, vai ao detalhe; volta externa é ignorada', async () => {
      atual.ctx = () => ctxDe(A, 'DONO');
      const r = await rodar(daSessao.acaoCadastrarInsumo(null, corpo('Sal grosso', { volta: '/erp/compras/nova' })));
      const criado = await a.insumo.findFirstOrThrow({ where: { nome: 'Sal grosso' }, select: { id: true } });
      expect(r).toEqual({ destino: `/erp/compras/nova?insumoCriado=${criado.id}` });
      for (const [i, ruim] of ['https://evil.example/erp/', '//evil.example', '/rodolfo/erp/x/compras/nova', '/erp/../rodolfo', '/erp/insumos/novo'].entries()) {
        const x = await rodar(daSessao.acaoCadastrarInsumo(null, corpo(`Sal fino ${i}`, { volta: ruim })));
        const id = (await a.insumo.findFirstOrThrow({ where: { nome: `Sal fino ${i}` }, select: { id: true } })).id;
        expect(x, ruim).toEqual({ destino: `/erp/insumos/${id}?feito=criado` });
      }
      // Erro de validação NÃO redireciona: o formulário fica como está (com a volta no lugar).
      const erro = await rodar(daSessao.acaoCadastrarInsumo(null, form({ ...novo('Sem conservação', { volta: '/erp/compras/nova' }), conservacao: '' })));
      expect(erro).toMatchObject({ ok: false, erros: { conservacao: expect.stringMatching(/Escolha a conservação/) } });
    });

    it('nível 1: a volta tem de estar na área da MESMA casa', async () => {
      atual.ctx = () => ctxDe(A, 'DONO');
      const base = `/rodolfo/erp/${A.slug}/compras/nova`;
      const ok = await rodar(doNivel1.acaoCadastrarInsumo(A.slug, null, corpo('Pimenta', { volta: base })));
      const id = (await a.insumo.findFirstOrThrow({ where: { nome: 'Pimenta' }, select: { id: true } })).id;
      expect(ok).toEqual({ destino: `${base}?insumoCriado=${id}` });
      const outra = await rodar(doNivel1.acaoCadastrarInsumo(A.slug, null, corpo('Cominho', { volta: `/rodolfo/erp/${B.slug}/compras/nova` })));
      const id2 = (await a.insumo.findFirstOrThrow({ where: { nome: 'Cominho' }, select: { id: true } })).id;
      expect(outra).toEqual({ destino: `/rodolfo/erp/${A.slug}/insumos/${id2}?feito=criado` });
    });

    it('reenviar o mesmo envio com volta devolve o mesmo insumo (um só) e volta à nota', async () => {
      atual.ctx = () => ctxDe(A, 'DONO');
      const f = corpo('Orégano', { volta: '/erp/fichas/nova' });
      const um = await rodar(daSessao.acaoCadastrarInsumo(null, f));
      const dois = await rodar(daSessao.acaoCadastrarInsumo(null, f));
      expect(um).toEqual(dois);
      expect(await a.insumo.count({ where: { nome: 'Orégano' } })).toBe(1);
    });

    it('confirmar a conservação pela action: o dono confirma; o operador, que não edita insumo, é recusado', async () => {
      const id = await legado(a, 'Bacon (antigo)', { categoriaId: cat.PROTEINA });
      atual.ctx = () => ctxDe(A, 'OPERADOR');
      expect(await daSessao.acaoConfirmarConservacao(id, null)).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/cadastrar e editar insumos/) } });
      expect((await a.insumo.findUniqueOrThrow({ where: { id }, select: { conservacaoConfirmadaEm: true } })).conservacaoConfirmadaEm).toBeNull();
      atual.ctx = () => ctxDe(A, 'DONO');
      expect(await rodar(daSessao.acaoConfirmarConservacao(id, null))).toEqual({ destino: `/erp/insumos/${id}?feito=conservacao-confirmada` });
      expect((await a.insumo.findUniqueOrThrow({ where: { id }, select: { conservacaoConfirmadaEm: true } })).conservacaoConfirmadaEm).toBeInstanceOf(Date);
      expect(await rodar(doNivel1.acaoConfirmarConservacao(A.slug, id, null))).toEqual({ destino: `/rodolfo/erp/${A.slug}/insumos/${id}?feito=conservacao-confirmada` });
    });
  });
});
