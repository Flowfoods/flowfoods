/**
 * ERP L.1 · lista de insumos no Postgres de verdade: paginação (0, 1, limite exato, limite mais um, última página, fora da faixa,
 * os quatro tamanhos), totais do cadastro × dos filtros, filtros combinados, marca, cadastro incompleto (o SQL e a linha dizem a
 * mesma coisa), ordem sem pular nem repetir, remoção (cada tipo de vínculo, corrida nos dois sentidos, histórico, isolamento entre
 * parceiros), edição reenviada com a resposta perdida e as actions das duas árvores (permissão, bloqueio, confirmação, destino).
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/<banco> npx vitest run tests/erp-lista-insumos.db.test.ts
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const atual = vi.hoisted(() => ({ ctx: null as null | (() => unknown), auditoria: [] as { data: { evento: string } }[] }));
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
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async (a: { data: { evento: string } }) => atual.auditoria.push(a) } } }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { editarInsumo, excluirInsumo, listarInsumos, marcasEmUso, mudarSituacaoInsumo, obterInsumo } from '@/lib/erp/insumos';
import { lerRemocao, vinculosDoInsumo } from '@/lib/erp/insumo-remocao';
import { lerFiltros, OPCOES_POR_PAGINA } from '@/lib/erp/insumo-campos';
import { cadastrarVariante } from '@/lib/erp/variantes';
import { cadastrarFicha } from '@/lib/erp/fichas';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { cadastrarFornecedor, lancarNota } from '@/lib/erp/compras';
import { descreverMudancas } from '@/lib/erp/historico';
import { resolverAlcance } from '@/lib/erp/permissoes';
import * as daSessao from '@/app/erp/insumos/actions';
import * as doNivel1 from '@/app/rodolfo/(painel)/erp/[slug]/insumos/actions';
import { cadastrarInsumoDeTeste as cadastrarInsumo, limparParceiros, perfilDoBanco, SEM_NOTA_FISCAL, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;

describe.skipIf(!URL_TESTE)('ERP L.1 · lista de insumos (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `l${globalThis.crypto.randomUUID().slice(0, 8)}`;
  type P = { id: string; slug: string; nome: string };
  let A: P; // cenário de filtros, marca, cadastro incompleto e remoção
  let B: P; // outro parceiro (isolamento)
  let G: P; // paginação: 137 insumos
  let H: P; // paginação: 0, 1, 25 e 26 insumos
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  let g: ClienteDoParceiro;
  let h: ClienteDoParceiro;
  const ids: Record<string, string> = {};
  const cat: Record<string, string> = {};
  let lojaA = '';
  let fornA = '';

  const alcance = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR') =>
    resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
  const ctxDe = (parceiro: P, perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR', bloqueio: string | null = null) => ({
    parceiro,
    alcance: alcance(perfilBase),
    cliente: doParceiro(parceiro.id, db, { somenteLeitura: bloqueio !== null }),
    bloqueio,
    podeEscrever: bloqueio === null,
    sessao: { userId: 'u', autorNome: perfilBase === 'DONO' ? 'Marina Dona' : perfilBase === 'GERENTE' ? 'Gil Gerente' : 'Paulo Operador' },
  });
  const form = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.append(k, v);
    return f;
  };
  async function rodar<T>(p: Promise<T>): Promise<{ destino: string } | T> {
    try {
      return await p;
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('REDIRECT ')) return { destino: (e as Error & { url: string }).url };
      throw e;
    }
  }
  const novo = async (c: ClienteDoParceiro, nome: string, extra: Record<string, unknown> = {}) => {
    const r = await cadastrarInsumo(c, { nome, tipo: 'INGREDIENTE', unidade: 'KG', conteudo: '5', escala: 'base', preco: '25,00', ...extra });
    if (!r.ok) throw new Error(`${nome}: ${JSON.stringify(r)}`);
    return r.id;
  };
  const nomesDe = async (c: ClienteDoParceiro, f: Parameters<typeof listarInsumos>[1]) => (await listarInsumos(c, { situacao: 'todos', porPagina: 100, ...f })).linhas.map((l) => l.nome).sort();

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Lista A', slug: `lista-a-${sufixo}`, status: 'ATIVO' } });
    B = await db.parceiroFlow.create({ data: { nome: 'Lista B', slug: `lista-b-${sufixo}`, status: 'ATIVO' } });
    G = await db.parceiroFlow.create({ data: { nome: 'Lista G', slug: `lista-g-${sufixo}`, status: 'ATIVO' } });
    H = await db.parceiroFlow.create({ data: { nome: 'Lista H', slug: `lista-h-${sufixo}`, status: 'ATIVO' } });
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    g = doParceiro(G.id, db);
    h = doParceiro(H.id, db);
    const { garantirCategoriasPadrao } = await import('@/lib/erp/categorias');
    await garantirCategoriasPadrao(a);
    for (const c of await a.categoriaInsumo.findMany()) cat[c.chave ?? c.nome] = c.id;
    const loja = await cadastrarLoja(a, { nome: 'Vila da Penha' }, 'Marina');
    if (!loja.ok) throw new Error('loja');
    lojaA = loja.id;
    const forn = await cadastrarFornecedor(a, { nome: 'Frios do Zé', ...SEM_NOTA_FISCAL }, 'Marina');
    if (!forn.ok) throw new Error('fornecedor');
    fornA = forn.id;
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id, G.id, H.id]);
    await db?.$disconnect();
  });

  // ------------------------------------------------------------------ paginação

  describe('paginação', () => {
    const NOMES: string[] = [];
    beforeAll(async () => {
      // 137 insumos; 10 desativados; nomes com maiúscula, minúscula e acento misturados (a ordem não pode pular nem repetir).
      for (let i = 1; i <= 137; i++) {
        const n = String(i).padStart(3, '0');
        const nome = i % 3 === 0 ? `água ${n}` : i % 3 === 1 ? `Água ${n}` : `AGUA ${n}`;
        NOMES.push(nome);
        const id = await novo(g, nome, { categoriaId: undefined });
        if (i <= 10) await mudarSituacaoInsumo(g, id, false, '', 'Teste');
      }
    });

    it('137 no total, 127 ativos; o padrão é 50 por página e 3 páginas', async () => {
      const r = await listarInsumos(g);
      expect(r.total).toBe(127);
      expect(r.totalDoCadastro).toEqual({ todos: 137, ativos: 127 });
      expect(r.porPagina).toBe(50);
      expect(r.paginas).toBe(3);
      expect(r.pagina).toBe(1);
      expect(r.linhas).toHaveLength(50);
    });

    it.each([...OPCOES_POR_PAGINA])('com %i por página: percorrer todas as páginas dá cada insumo uma vez só, e a última traz só o que sobra', async (por) => {
      const primeira = await listarInsumos(g, { situacao: 'todos', porPagina: por });
      expect(primeira.total).toBe(137);
      expect(primeira.paginas).toBe(Math.ceil(137 / por));
      const vistos: string[] = [];
      for (let p = 1; p <= primeira.paginas; p++) {
        const r = await listarInsumos(g, { situacao: 'todos', porPagina: por, pagina: p });
        expect(r.pagina).toBe(p);
        expect(r.linhas).toHaveLength(p < primeira.paginas ? por : 137 - por * (primeira.paginas - 1));
        vistos.push(...r.linhas.map((l) => l.id));
      }
      expect(vistos).toHaveLength(137);
      expect(new Set(vistos).size).toBe(137);
    });

    it('a mesma ordem em toda página também por custo (empates desempatados), sem pular nem repetir', async () => {
      for (const direcao of ['asc', 'desc'] as const) {
        const vistos: string[] = [];
        for (let p = 1; p <= 14; p++) vistos.push(...(await listarInsumos(g, { situacao: 'todos', porPagina: 10, pagina: p, ordem: 'custo', direcao })).linhas.map((l) => l.id));
        expect(vistos, direcao).toHaveLength(137);
        expect(new Set(vistos).size, direcao).toBe(137);
      }
    });

    it('página além da última é ajustada à última; página 0, negativa e quebrada voltam à primeira', async () => {
      expect((await listarInsumos(g, { situacao: 'todos', porPagina: 25, pagina: 999 })).pagina).toBe(6);
      expect((await listarInsumos(g, { situacao: 'todos', porPagina: 25, pagina: 999 })).linhas).toHaveLength(12);
      for (const pagina of [0, -4, Number.NaN]) expect((await listarInsumos(g, { situacao: 'todos', porPagina: 25, pagina })).pagina, String(pagina)).toBe(1);
    });

    it('tamanho torto no servidor cai em 50', async () => {
      for (const por of [0, -1, 7, 1000, Number.NaN]) {
        const r = await listarInsumos(g, { situacao: 'todos', porPagina: por });
        expect(r.porPagina, String(por)).toBe(50);
        expect(r.linhas, String(por)).toHaveLength(50);
      }
    });

    it('0 resultados: 0 insumos, uma página vazia, sem erro', async () => {
      const r = await listarInsumos(g, { q: 'nenhum insumo tem este nome', porPagina: 25, pagina: 3 });
      expect(r).toMatchObject({ total: 0, pagina: 1, paginas: 1, porPagina: 25, linhas: [] });
      expect(r.totalDoCadastro).toEqual({ todos: 137, ativos: 127 });
    });

    it('um resultado só, por busca', async () => {
      expect(await listarInsumos(g, { q: 'AGUA 002', situacao: 'todos' })).toMatchObject({ total: 1, paginas: 1, pagina: 1 });
    });

    it('0, 1, o limite exato (25), o limite mais um (26) e a última página, no tamanho 25', async () => {
      const por = 25;
      expect(await listarInsumos(h, { porPagina: por })).toMatchObject({ total: 0, paginas: 1, pagina: 1, linhas: [], totalDoCadastro: { todos: 0, ativos: 0 } });
      await novo(h, 'Único');
      expect(await listarInsumos(h, { porPagina: por })).toMatchObject({ total: 1, paginas: 1, pagina: 1 });
      for (let i = 2; i <= 25; i++) await novo(h, `Item ${String(i).padStart(2, '0')}`);
      const exato = await listarInsumos(h, { porPagina: por });
      expect(exato).toMatchObject({ total: 25, paginas: 1, pagina: 1 });
      expect(exato.linhas).toHaveLength(25);
      expect((await listarInsumos(h, { porPagina: por, pagina: 2 })).pagina).toBe(1); // não existe a página 2: ajusta
      await novo(h, 'Item 26');
      const mais = await listarInsumos(h, { porPagina: por });
      expect(mais).toMatchObject({ total: 26, paginas: 2, pagina: 1 });
      expect(mais.linhas).toHaveLength(25);
      const ultima = await listarInsumos(h, { porPagina: por, pagina: 2 });
      expect(ultima).toMatchObject({ total: 26, paginas: 2, pagina: 2 });
      expect(ultima.linhas).toHaveLength(1);
      // Desativar um tira da lista padrão mas não do cadastro: 25 na lista, 26 no cadastro.
      await mudarSituacaoInsumo(h, ultima.linhas[0].id, false, '', 'Marina');
      expect(await listarInsumos(h, { porPagina: por })).toMatchObject({ total: 25, paginas: 1, totalDoCadastro: { todos: 26, ativos: 25 } });
      // Excluir o único da última página: a página pedida some e a lista se ajusta sem erro.
      const id26 = (await h.insumo.findFirstOrThrow({ where: { nome: 'Item 26' } })).id;
      expect((await excluirInsumo(h, id26, true, 'Marina')).ok).toBe(true);
      expect(await listarInsumos(h, { porPagina: por, pagina: 2, situacao: 'todos' })).toMatchObject({ total: 25, paginas: 1, pagina: 1 });
    });

    it('os totais são do parceiro: o cadastro de G não aparece em A nem em B', async () => {
      expect((await listarInsumos(b)).totalDoCadastro).toEqual({ todos: 0, ativos: 0 });
      expect((await listarInsumos(a)).totalDoCadastro.todos).toBeLessThan(137);
    });
  });

  // --------------------------------------------------------------------- filtros

  describe('filtros combinados, marca e cadastro incompleto', () => {
    beforeAll(async () => {
      ids.coxa = await novo(a, 'Coxa de frango congelada', { categoriaId: cat.PROTEINA, conservacao: 'CONGELADO', marcaReferencia: 'Sadia' });
      ids.file = await novo(a, 'Filé de frango', { categoriaId: cat.PROTEINA, conservacao: 'REFRIGERADO', marcaReferencia: 'sadia' });
      ids.bacon = await novo(a, 'Bacon fatiado', { categoriaId: cat.PROTEINA, conservacao: 'CONGELADO', marcaReferencia: 'Seara' });
      ids.arroz = await novo(a, 'Arroz branco', { categoriaId: cat.MERCEARIA ?? cat['MERCEARIAS'], conservacao: 'SECO', marcaReferencia: 'Camil' });
      ids.sal = await novo(a, 'Sal refinado', { categoriaId: cat.MERCEARIA ?? cat['MERCEARIAS'], conservacao: 'SECO' });
      const molho = await cadastrarFicha(a, { nome: 'Molho sem validade', tipo: 'PRE_PREPARO', rendimento: '1', rendimentoUnidade: 'kg', descricao: '', modoPreparo: '', itens: [{ insumoId: ids.sal, quantidade: '100', unidade: 'g' }] }, { tipo: 'manter' }, 'Marina');
      if (!molho.ok) throw new Error(JSON.stringify(molho));
      ids.caixa = await novo(a, 'Caixa de pizza', { tipo: 'EMBALAGEM', categoriaId: cat.DESCARTAVEIS ?? cat['DESCARTAVEIS'], conservacao: 'SECO', unidade: 'UN', conteudo: '100', preco: '120,00' });
      ids.semcusto = await novo(a, 'Item sem custo', { categoriaId: cat.MERCEARIA ?? cat['MERCEARIAS'], conservacao: 'SECO', semPreco: 'on', preco: '' });
      ids.antigo = await novo(a, 'Insumo antigo sem categoria', { categoriaId: cat.MERCEARIA ?? cat['MERCEARIAS'], conservacao: 'SECO' });
      ids.outros = await novo(a, 'Xpto 3000', { categoriaId: cat.OUTROS, conservacao: 'SECO' });
      ids.frango = await novo(a, 'Frango inteiro', { categoriaId: cat.PROTEINA, conservacao: 'SECO' });
      ids.desativado = await novo(a, 'Item desativado', { categoriaId: cat.MERCEARIA ?? cat['MERCEARIAS'], conservacao: 'SECO', marcaReferencia: 'Camil' });
      // O que um cadastro antigo tem e o formulário de hoje não deixaria: sem categoria e Seco que ninguém confirmou.
      await a.insumo.update({ where: { id: ids.antigo }, data: { categoriaId: null, classificadoPor: null, classificadoEm: null } });
      await a.insumo.update({ where: { id: ids.frango }, data: { conservacaoConfirmadaEm: null } });
      await mudarSituacaoInsumo(a, ids.desativado, false, 'saiu do cardápio', 'Marina');
    });

    it('proteína congelada = categoria + conservação (o AND de dois filtros)', async () => {
      expect(await nomesDe(a, { categoria: cat.PROTEINA, conservacao: 'CONGELADO' })).toEqual(['Bacon fatiado', 'Coxa de frango congelada']);
    });

    it('busca por nome OU por marca; o filtro de marca não diferencia caixa', async () => {
      expect(await nomesDe(a, { q: 'camil' })).toEqual(['Arroz branco', 'Item desativado']);
      expect(await nomesDe(a, { q: 'sadia' })).toEqual(['Coxa de frango congelada', 'Filé de frango']);
      expect(await nomesDe(a, { marca: 'SADIA' })).toEqual(['Coxa de frango congelada', 'Filé de frango']);
      expect(await nomesDe(a, { marca: 'Seara' })).toEqual(['Bacon fatiado']);
      expect(await nomesDe(a, { marca: 'Camil', situacao: 'ativos' })).toEqual(['Arroz branco']);
    });

    it('"sem marca informada" lista só quem não tem; a marca combina com os outros filtros', async () => {
      const sem = await nomesDe(a, { marca: 'sem-marca' });
      expect(sem).toContain('Sal refinado');
      expect(sem).not.toContain('Arroz branco');
      expect(await nomesDe(a, { marca: 'sadia', conservacao: 'CONGELADO' })).toEqual(['Coxa de frango congelada']);
      expect(await nomesDe(a, { marca: 'sadia', tipo: 'EMBALAGEM' })).toEqual([]);
    });

    it('as marcas em uso: a grafia mais comum de cada uma, sem diferenciar caixa, da mais usada para a menos', async () => {
      const m = await marcasEmUso(a);
      expect(m.map((x) => x.marca.toLowerCase())).toEqual(['camil', 'sadia', 'seara']);
      expect(m.map((x) => x.n)).toEqual([2, 2, 1]);
      expect(await marcasEmUso(b)).toEqual([]);
    });

    it('só sem custo e cadastro incompleto são coisas diferentes', async () => {
      expect(await nomesDe(a, { semPreco: true })).toEqual(['Item sem custo']);
      const incompletos = await nomesDe(a, { incompleto: true });
      expect(incompletos).toEqual(['Frango inteiro', 'Insumo antigo sem categoria', 'Molho sem validade', 'Xpto 3000']);
      expect(incompletos).not.toContain('Item sem custo');
    });

    it('cada linha diz o motivo, e o filtro do banco traz exatamente quem tem motivo (insumo a insumo)', async () => {
      const todas = (await listarInsumos(a, { situacao: 'todos', porPagina: 100 })).linhas;
      const doFiltro = new Set((await listarInsumos(a, { situacao: 'todos', porPagina: 100, incompleto: true })).linhas.map((l) => l.id));
      for (const l of todas) expect(doFiltro.has(l.id), `${l.nome}: ${l.motivosIncompleto.join(',')}`).toBe(l.motivosIncompleto.length > 0);
      const motivos = Object.fromEntries(todas.map((l) => [l.nome, l.motivosIncompleto]));
      expect(motivos['Insumo antigo sem categoria']).toEqual(['sem-categoria']);
      expect(motivos['Xpto 3000']).toEqual(['a-classificar']);
      expect(motivos['Frango inteiro']).toEqual(['conservacao']);
      expect(motivos['Molho sem validade']).toEqual(expect.arrayContaining(['validade']));
      expect(motivos['Sal refinado']).toEqual([]);
      expect(motivos['Arroz branco']).toEqual([]);
      expect(motivos['Item sem custo']).toEqual([]);
    });

    it('incompleto combina com a situação e com a categoria', async () => {
      expect(await nomesDe(a, { incompleto: true, categoria: 'sem' })).toEqual(['Insumo antigo sem categoria']);
      expect(await nomesDe(a, { incompleto: true, categoria: cat.PROTEINA })).toEqual(['Frango inteiro']);
      expect(await nomesDe(a, { incompleto: true, tipo: 'PRE_PREPARO' })).toEqual(['Molho sem validade']);
      expect(await nomesDe(a, { incompleto: true, situacao: 'desativados' })).toEqual([]);
    });

    it('o texto da URL vira filtro do servidor: lerFiltros + listarInsumos ponta a ponta', async () => {
      const f = lerFiltros({ q: 'frango', conservacao: 'CONGELADO', por: '10', incompleto: '', situacao: 'todos' });
      expect((await listarInsumos(a, f)).linhas.map((l) => l.nome)).toEqual(['Coxa de frango congelada']);
    });

    it('busca com curingas não vaza nem quebra', async () => {
      // `%` e `_` são letras na busca, não curingas: só acha quem os tem no nome.
      await novo(a, 'Suco 100% puro_x', { categoriaId: cat.OUTROS });
      expect(await nomesDe(a, { q: '%' })).toEqual(['Suco 100% puro_x']);
      expect(await nomesDe(a, { q: '_' })).toEqual(['Suco 100% puro_x']);
      expect(await nomesDe(a, { q: '0% p' })).toEqual(['Suco 100% puro_x']);
      expect(await nomesDe(a, { q: 'o_x' })).toEqual(['Suco 100% puro_x']);
      expect(await nomesDe(a, { q: 'sal_' })).toEqual([]);
      expect(await nomesDe(a, { q: '\\' })).toEqual([]);
      expect(await nomesDe(a, { q: "'; DROP TABLE \"Insumo\"; --" })).toEqual([]);
      expect((await listarInsumos(a)).total).toBeGreaterThan(5);
    });

    it('o insumo de A nunca aparece em B, nem pela marca', async () => {
      expect(await nomesDe(b, { q: 'camil' })).toEqual([]);
      expect(await nomesDe(b, { marca: 'Camil' })).toEqual([]);
      expect(await nomesDe(b, { incompleto: true })).toEqual([]);
    });
  });

  // --------------------------------------------------------------------- remoção

  describe('remover insumo', () => {
    const vinculosDe = async (id: string) => (await vinculosDoInsumo(a, id))!.vinculos.map((v) => v.chave);
    const intacto = async (id: string, nome: string) => {
      expect((await a.insumo.findUnique({ where: { id }, select: { nome: true } }))?.nome).toBe(nome);
    };

    it('sem nenhum vínculo: exclui de vez, com o nome, o autor e o retrato no histórico; o nome volta a ficar livre', async () => {
      const id = await novo(a, 'Cadastro por engano', { categoriaId: cat.OUTROS, marcaReferencia: 'Marca X' });
      expect((await lerRemocao(a, id))!.total).toBe(0);
      const r = await excluirInsumo(a, id, true, 'Marina Dona');
      expect(r).toMatchObject({ ok: true, id, nome: 'Cadastro por engano', mudou: ['excluido'] });
      expect(await a.insumo.findUnique({ where: { id } })).toBeNull();
      const h = await a.historicoAlteracao.findFirstOrThrow({ where: { entidade: 'Insumo', entidadeId: id, acao: 'EXCLUIU' } });
      expect(h.autorNome).toBe('Marina Dona');
      expect(h.antes).toMatchObject({ nome: 'Cadastro por engano', tipo: 'INGREDIENTE', unidade: 'KG', marcaReferencia: 'Marca X', ativo: true });
      expect(h.motivo).toMatch(/sem nenhum registro/);
      // A tela do histórico lê uma exclusão: "nome: Cadastro por engano" sem quebrar.
      expect(descreverMudancas(h.antes, h.depois, 'Insumo').map((m) => m.campo)).toContain('nome');
      // O histórico anterior (CRIOU) continua guardado; o nome está livre de novo.
      expect(await a.historicoAlteracao.count({ where: { entidade: 'Insumo', entidadeId: id, acao: 'CRIOU' } })).toBe(1);
      await novo(a, 'Cadastro por engano', { categoriaId: cat.OUTROS });
    });

    it('sem a confirmação marcada, nada é apagado; depois de excluído, excluir de novo diz que não achou', async () => {
      const id = await novo(a, 'Sem confirmar', { categoriaId: cat.OUTROS });
      const r = await excluirInsumo(a, id, false, 'Marina');
      expect(r).toMatchObject({ ok: false, erros: { confirmo: expect.stringMatching(/não dá para desfazer/) } });
      await intacto(id, 'Sem confirmar');
      expect((await excluirInsumo(a, id, true, 'Marina')).ok).toBe(true);
      expect(await excluirInsumo(a, id, true, 'Marina')).toMatchObject({ ok: false, naoEncontrado: true });
      expect(await excluirInsumo(a, 'id-que-nao-existe-xyz', true, 'Marina')).toMatchObject({ ok: false, naoEncontrado: true });
    });

    it('desativado também se exclui de vez quando nada o usa', async () => {
      const id = await novo(a, 'Desativado e sem uso', { categoriaId: cat.OUTROS });
      await mudarSituacaoInsumo(a, id, false, '', 'Marina');
      expect((await excluirInsumo(a, id, true, 'Marina')).ok).toBe(true);
    });

    const recusa = async (id: string, nome: string, chave: string) => {
      const antes = await a.historicoAlteracao.count({ where: { entidadeId: id } });
      expect(await vinculosDe(id)).toContain(chave);
      const r = await excluirInsumo(a, id, true, 'Marina');
      expect(r.ok, chave).toBe(false);
      if (!r.ok) {
        expect(r.erros.geral, chave).toMatch(/não dá para excluir de vez/);
        expect(r.erros.geral, chave).toMatch(/Desative/);
      }
      await intacto(id, nome);
      // Recusar não registra nada no histórico.
      expect(await a.historicoAlteracao.count({ where: { entidadeId: id } })).toBe(antes);
    };

    it('com embalagem cadastrada: só desativa', async () => {
      const id = await novo(a, 'Com outra embalagem', { categoriaId: cat.OUTROS });
      expect((await cadastrarVariante(a, id, { nome: 'Caixa 10 kg', conteudo: '10', escala: 'base', preco: '45,00' }, 'Marina')).ok).toBe(true);
      await recusa(id, 'Com outra embalagem', 'embalagens');
      expect(await a.insumoVariante.count({ where: { insumoId: id } })).toBe(1);
    });

    it('com ficha técnica (mesmo desativada): só desativa, e a ficha continua inteira', async () => {
      const id = await novo(a, 'Na ficha', { categoriaId: cat.OUTROS });
      const f = await cadastrarFicha(a, { nome: 'Prato de teste', tipo: 'PRATO', rendimento: '1', descricao: '', modoPreparo: '', itens: [{ insumoId: id, quantidade: '100', unidade: 'g' }] }, { tipo: 'manter' }, 'Marina');
      if (!f.ok) throw new Error(JSON.stringify(f));
      await recusa(id, 'Na ficha', 'fichas');
      expect(await a.fichaItem.count({ where: { fichaId: f.id, insumoId: id } })).toBe(1);
      expect((await vinculosDoInsumo(a, id))!.vinculos.find((v) => v.chave === 'fichas')).toMatchObject({ n: 1, frase: 'Usado em 1 ficha técnica' });
    });

    it('com nota de compra: histórico de preço; só desativa e a nota segue igual', async () => {
      const id = await novo(a, 'Comprado', { categoriaId: cat.OUTROS });
      const n = await lancarNota(a, alcance('DONO'), { lojaId: lojaA, fornecedorId: fornA, numero: '77', serie: '', data: '2026-10-14', frete: '', total: '25,00', itens: [{ insumoId: id, embalagem: 'padrao', quantidade: '1', valor: '25,00' }] }, 'Marina');
      if (!n.ok) throw new Error(JSON.stringify(n));
      await recusa(id, 'Comprado', 'notas');
      expect(await a.notaEntradaItem.count({ where: { insumoId: id } })).toBe(1);
      const r = await lerRemocao(a, id);
      expect(r!.vinculos.find((v) => v.chave === 'notas')!.frase).toMatch(/histórico de preço pago/);
    });

    it('com saldo e movimento de estoque: nunca apaga o movimento', async () => {
      const id = await novo(a, 'Com saldo', { categoriaId: cat.OUTROS });
      await a.saldoEstoque.create({ data: { parceiroId: A.id, lojaId: lojaA, insumoId: id, quantidadeMilesimos: 2000, valorCentavos: 5000 } });
      await a.movimentoEstoque.create({
        data: { parceiroId: A.id, lojaId: lojaA, insumoId: id, tipo: 'AJUSTE', quantidadeMilesimos: 2000, valorCentavos: 5000, saldoAntesMilesimos: 0, saldoDepoisMilesimos: 2000, insumoNomeSnapshot: 'Com saldo', unidadeSnapshot: 'KG', motivo: 'teste' },
      });
      expect(await vinculosDe(id)).toEqual(expect.arrayContaining(['saldos', 'movimentos']));
      await recusa(id, 'Com saldo', 'movimentos');
      expect(await a.movimentoEstoque.count({ where: { insumoId: id } })).toBe(1);
      expect(await a.saldoEstoque.count({ where: { insumoId: id } })).toBe(1);
    });

    it('com etiqueta e com a memória de item do fornecedor', async () => {
      const e = await novo(a, 'Com etiqueta', { categoriaId: cat.OUTROS });
      await a.etiqueta.create({
        data: { parceiroId: A.id, lojaId: lojaA, codigo: 'E-1', insumoId: e, nomeSnapshot: 'Com etiqueta', conservacao: 'SECO', validadeEm: new Date('2027-01-01'), formato: 'E60X40' },
      });
      await recusa(e, 'Com etiqueta', 'etiquetas');
      const m = await novo(a, 'Com memória do fornecedor', { categoriaId: cat.OUTROS });
      await a.vinculoItemFornecedor.create({ data: { parceiroId: A.id, fornecedorId: fornA, codigoProduto: 'COD-1', unidadeComercial: 'PC', insumoId: m, fatorMilesimos: 1000, atualizadoPorNome: 'Marina' } });
      await recusa(m, 'Com memória do fornecedor', 'memoria');
    });

    it('com mudança de custo no histórico: só desativa; mudar só o nome não conta como histórico de preço', async () => {
      const id = await novo(a, 'Mudou de preço', { categoriaId: cat.OUTROS });
      const lido = (await obterInsumo(a, id, alcance('DONO')))!;
      const nomeNovo = await editarInsumo(a, id, { versao: lido.versao, nome: 'Mudou só o nome', tipo: 'INGREDIENTE', unidade: 'KG', categoriaId: cat.OUTROS, conservacao: 'SECO', conteudo: '5', escala: 'base', preco: '25,00' }, 'Marina');
      expect(nomeNovo).toMatchObject({ ok: true });
      expect(await vinculosDe(id)).not.toContain('custoNoHistorico');
      const lido2 = (await obterInsumo(a, id, alcance('DONO')))!;
      const preco = await editarInsumo(a, id, { versao: lido2.versao, nome: 'Mudou só o nome', tipo: 'INGREDIENTE', unidade: 'KG', categoriaId: cat.OUTROS, conservacao: 'SECO', conteudo: '5', escala: 'base', preco: '30,00' }, 'Marina');
      expect(preco).toMatchObject({ ok: true });
      await recusa(id, 'Mudou só o nome', 'custoNoHistorico');
    });

    it('pré-preparo (nasce da ficha) não se remove por aqui', async () => {
      const f = await cadastrarFicha(a, { nome: 'Molho da casa', tipo: 'PRE_PREPARO', rendimento: '1', rendimentoUnidade: 'kg', descricao: '', modoPreparo: '', itens: [{ insumoId: ids.arroz, quantidade: '100', unidade: 'g' }] }, { tipo: 'manter' }, 'Marina');
      if (!f.ok) throw new Error(JSON.stringify(f));
      const preparo = await a.insumo.findFirstOrThrow({ where: { nome: 'Molho da casa' } });
      const r = await excluirInsumo(a, preparo.id, true, 'Marina');
      expect(r).toMatchObject({ ok: false });
      if (!r.ok) expect(r.erros.geral).toMatch(/pré-preparo/);
      expect((await lerRemocao(a, preparo.id))!.preparo).toMatchObject({ nome: 'Molho da casa' });
      await intacto(preparo.id, 'Molho da casa');
    });

    it('os insumos de outro parceiro não existem para quem remove: nada some, e as contagens são do parceiro', async () => {
      const idB = await novo(b, 'Só do B');
      expect(await excluirInsumo(a, idB, true, 'Marina')).toMatchObject({ ok: false, naoEncontrado: true });
      expect(await lerRemocao(a, idB)).toBeNull();
      expect(await vinculosDoInsumo(a, idB)).toBeNull();
      expect((await b.insumo.findUnique({ where: { id: idB } }))?.nome).toBe('Só do B');
    });

    it('a catalogação do banco: toda tabela que aponta para Insumo está nas contas da tela (tabela nova com FK para Insumo reprova aqui)', async () => {
      const r = await db.$queryRaw<{ t: string }[]>`
        SELECT DISTINCT c.conrelid::regclass::text AS t FROM pg_constraint c
        WHERE c.contype = 'f' AND c.confrelid = '"Insumo"'::regclass AND c.conrelid <> '"Insumo"'::regclass`;
      const cobertas = ['"ContagemRetratoItem"', '"InsumoVariante"', '"NotaEntradaItem"', '"DocumentoFiscalItem"', '"VinculoItemFornecedor"', '"FichaTecnica"', '"FichaItem"', '"ProdutoEmbalagem"', '"SaldoEstoque"', '"MovimentoEstoque"', '"ContagemItem"', '"RequisicaoItem"', '"OrdemProducao"', '"Etiqueta"'].map((t) => t.replaceAll('"', ''));
      const noBanco = r.map((x) => x.t.replaceAll('"', '')).sort();
      expect(noBanco).toEqual([...cobertas].sort());
    });
  });

  // ----------------------------------------------------------------------- corrida

  describe('corrida na remoção', () => {
    const depois = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
    const umaEtiqueta = (id: string, codigo: string) => ({
      data: { parceiroId: A.id, lojaId: lojaA, codigo, insumoId: id, nomeSnapshot: 'x', conservacao: 'SECO' as const, validadeEm: new Date('2027-01-01'), formato: 'E60X40' as const },
    });

    it('alguém vincula entre a tela e o clique: a exclusão espera, vê o vínculo e recusa sem apagar nada', async () => {
      const id = await novo(a, 'Corrida 1', { categoriaId: cat.OUTROS });
      expect((await lerRemocao(a, id))!.total).toBe(0); // a tela viu "sem vínculo"
      let soltar!: () => void;
      const segura = new Promise<void>((ok) => (soltar = ok));
      // A outra pessoa está no meio de uma gravação que usa o insumo (a FK trava a linha dele) e ainda não terminou.
      const vincula = a.transacao(async (tx) => {
        await tx.etiqueta.create(umaEtiqueta(id, 'C-1'));
        await segura;
      });
      await depois(300);
      const exclui = excluirInsumo(a, id, true, 'Marina');
      await depois(500);
      soltar();
      await vincula;
      const r = await exclui;
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.erros.geral).toMatch(/registros ligados/);
      expect((await a.insumo.findUnique({ where: { id } }))?.nome).toBe('Corrida 1');
      expect(await a.etiqueta.count({ where: { insumoId: id } })).toBe(1);
    });

    it('a exclusão vence: quem vincula depois falha limpo na FK e nada fica apontando para um insumo que não existe', async () => {
      const id = await novo(a, 'Corrida 2', { categoriaId: cat.OUTROS });
      let soltar!: () => void;
      const segura = new Promise<void>((ok) => (soltar = ok));
      // Quem exclui trava a linha e demora; a outra pessoa tenta vincular nesse meio-tempo.
      const exclui = a.transacao(async (tx) => {
        await tx.sql`SELECT "id" FROM "Insumo" WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ${id} FOR UPDATE`;
        await segura;
        await tx.insumo.deleteMany({ where: { id } });
      });
      await depois(300);
      const vincula = a.etiqueta.create(umaEtiqueta(id, 'C-2')).then(
        () => 'criou',
        () => 'falhou',
      );
      await depois(500);
      soltar();
      await exclui;
      expect(await vincula).toBe('falhou');
      expect(await a.insumo.findUnique({ where: { id } })).toBeNull();
      expect(await a.etiqueta.count({ where: { insumoId: id } })).toBe(0);
    });

    it('20 rodadas de excluir × vincular ao mesmo tempo: sempre um vencedor só e nunca um vínculo órfão', async () => {
      const resultados: string[] = [];
      for (let i = 0; i < 20; i++) {
        const id = await novo(a, `Corrida em massa ${i}`, { categoriaId: cat.OUTROS });
        const [ex, vi] = await Promise.allSettled([excluirInsumo(a, id, true, 'Marina'), a.etiqueta.create(umaEtiqueta(id, `M-${i}`))]);
        const excluiu = ex.status === 'fulfilled' && ex.value.ok;
        const vinculou = vi.status === 'fulfilled';
        expect(excluiu !== vinculou, `rodada ${i}: excluiu=${excluiu} vinculou=${vinculou}`).toBe(true);
        const existe = await a.insumo.findUnique({ where: { id } });
        expect(!!existe, `rodada ${i}`).toBe(!excluiu);
        expect(await a.etiqueta.count({ where: { insumoId: id } }), `rodada ${i}`).toBe(vinculou ? 1 : 0);
        if (ex.status === 'fulfilled' && !ex.value.ok) expect(ex.value.erros.geral, `rodada ${i}`).toMatch(/registros ligados|passou a ter/);
        resultados.push(excluiu ? 'excluiu' : 'vinculou');
      }
      expect(resultados).toHaveLength(20);
    });

    it('duas pessoas excluindo o mesmo insumo ao mesmo tempo: um exclui, o outro ouve "não achou"', async () => {
      const id = await novo(a, 'Corrida 3', { categoriaId: cat.OUTROS });
      const r = await Promise.all([excluirInsumo(a, id, true, 'Marina'), excluirInsumo(a, id, true, 'Gil')]);
      expect(r.filter((x) => x.ok)).toHaveLength(1);
      expect(r.filter((x) => !x.ok && x.naoEncontrado)).toHaveLength(1);
      expect(await a.historicoAlteracao.count({ where: { entidadeId: id, acao: 'EXCLUIU' } })).toBe(1);
    });
  });

  // --------------------------------------------------------- editar com a resposta perdida

  describe('edição reenviada (resposta perdida)', () => {
    const entrada = (versao: string, extra: Record<string, string> = {}) => ({
      versao, nome: 'Farinha reenvio', tipo: 'INGREDIENTE', unidade: 'KG', categoriaId: cat.OUTROS, conservacao: 'SECO', conteudo: '5', escala: 'base', preco: '25,00', ...extra,
    });

    it('o mesmo envio de novo (a primeira vez entrou): sucesso "nada mudou", não "alguém alterou"', async () => {
      const id = await novo(a, 'Farinha reenvio', { categoriaId: cat.OUTROS });
      const v1 = (await obterInsumo(a, id, alcance('DONO')))!.versao;
      const primeira = await editarInsumo(a, id, entrada(v1, { preco: '27,50', marcaReferencia: 'Camil' }), 'Marina');
      expect(primeira).toMatchObject({ ok: true });
      if (primeira.ok) expect(primeira.mudou.length).toBeGreaterThan(0);
      // A resposta se perdeu: a tela ainda tem a versão antiga e manda o mesmo formulário.
      const segunda = await editarInsumo(a, id, entrada(v1, { preco: '27,50', marcaReferencia: 'Camil' }), 'Marina');
      expect(segunda).toMatchObject({ ok: true, mudou: [] });
      expect(await a.historicoAlteracao.count({ where: { entidadeId: id, acao: 'ALTEROU' } })).toBe(1);
    });

    it('versão velha com valores DIFERENTES do gravado segue sendo conflito e não sobrescreve', async () => {
      const id = await novo(a, 'Farinha reenvio dois', { categoriaId: cat.OUTROS });
      const v1 = (await obterInsumo(a, id, alcance('DONO')))!.versao;
      expect((await editarInsumo(a, id, entrada(v1, { nome: 'Farinha reenvio dois', preco: '27,50' }), 'Marina')).ok).toBe(true);
      const r = await editarInsumo(a, id, entrada(v1, { nome: 'Farinha reenvio dois', preco: '99,00' }), 'Gil');
      expect(r).toMatchObject({ ok: false, conflito: true });
      expect((await obterInsumo(a, id, alcance('DONO')))!.precoEmbalagemCentavos).toBe(2750);
    });

    it('versão velha com formulário inválido ou sem versão continua sendo conflito', async () => {
      const id = await novo(a, 'Farinha reenvio três', { categoriaId: cat.OUTROS });
      const v1 = (await obterInsumo(a, id, alcance('DONO')))!.versao;
      await editarInsumo(a, id, entrada(v1, { nome: 'Farinha reenvio três', preco: '30,00' }), 'Marina');
      expect(await editarInsumo(a, id, entrada(v1, { nome: '' }), 'Gil')).toMatchObject({ ok: false, conflito: true });
      expect(await editarInsumo(a, id, { ...entrada(v1, { nome: 'Farinha reenvio três', preco: '30,00' }), versao: 'lixo' }, 'Gil')).toMatchObject({ ok: false, conflito: true });
    });

    it('pedir para confirmar a conservação não é "igual": ainda falta gravar a confirmação', async () => {
      const id = await novo(a, 'Farinha reenvio quatro', { categoriaId: cat.OUTROS });
      await a.insumo.update({ where: { id }, data: { conservacaoConfirmadaEm: null } });
      const v1 = (await obterInsumo(a, id, alcance('DONO')))!.versao;
      await a.insumo.update({ where: { id }, data: { marcaReferencia: 'Camil' } }); // muda a versão
      const r = await editarInsumo(a, id, entrada(v1, { nome: 'Farinha reenvio quatro', marcaReferencia: 'Camil', conservacaoConfirmada: 'on' }), 'Marina');
      expect(r).toMatchObject({ ok: false, conflito: true });
    });
  });

  // ------------------------------------------------------------------------ actions

  describe('actions: permissão, bloqueio, confirmação e o destino de volta', () => {
    const DE = 'q=farinha&por=25&pagina=2';
    const arvores = [
      { nome: 'pessoa do parceiro', base: () => '/erp/insumos', excluir: (i: string, f: FormData, p: P, ctx: unknown) => ((atual.ctx = () => ctx), rodar(daSessao.acaoExcluirInsumo(i, null, f))), editar: (i: string, f: FormData, p: P, ctx: unknown) => ((atual.ctx = () => ctx), rodar(daSessao.acaoEditarInsumo(i, null, f))), situacao: (i: string, f: FormData, p: P, ctx: unknown) => ((atual.ctx = () => ctx), rodar(daSessao.acaoSituacaoInsumo(i, null, f))) },
      { nome: 'nível 1 no parceiro', base: (p: P) => `/rodolfo/erp/${p.slug}/insumos`, excluir: (i: string, f: FormData, p: P, ctx: unknown) => ((atual.ctx = () => ctx), rodar(doNivel1.acaoExcluirInsumo(p.slug, i, null, f))), editar: (i: string, f: FormData, p: P, ctx: unknown) => ((atual.ctx = () => ctx), rodar(doNivel1.acaoEditarInsumo(p.slug, i, null, f))), situacao: (i: string, f: FormData, p: P, ctx: unknown) => ((atual.ctx = () => ctx), rodar(doNivel1.acaoSituacaoInsumo(p.slug, i, null, f))) },
    ] as const;

    for (const t of arvores) {
      describe(t.nome, () => {
        it('operador não exclui nem desativa nem edita (o servidor decide, não o botão escondido)', async () => {
          const id = await novo(a, `Operador não mexe ${t.nome}`, { categoriaId: cat.OUTROS });
          const ctx = ctxDe(A, 'OPERADOR');
          for (const r of [await t.excluir(id, form({ confirmo: 'sim' }), A, ctx), await t.situacao(id, form({ ativo: 'nao' }), A, ctx), await t.editar(id, form({ nome: 'x' }), A, ctx)]) {
            expect(r).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/editar insumos|permiss/i) } });
          }
          expect((await a.insumo.findUnique({ where: { id } }))?.ativo).toBe(true);
        });

        it('parceiro bloqueado só lê: nada é excluído', async () => {
          const id = await novo(a, `Bloqueado ${t.nome}`, { categoriaId: cat.OUTROS });
          const r = await t.excluir(id, form({ confirmo: 'sim' }), A, ctxDe(A, 'DONO', 'Parceiro suspenso: só leitura.'));
          expect(r).toMatchObject({ ok: false, erros: { geral: 'Parceiro suspenso: só leitura.' } });
          expect(await a.insumo.findUnique({ where: { id } })).not.toBeNull();
        });

        it('sem marcar "entendi": erro no campo, nada some; marcando: exclui e volta à LISTA com a página, os filtros e o tamanho', async () => {
          const id = await novo(a, `Excluir pela ação ${t.nome}`, { categoriaId: cat.OUTROS });
          const sem = await t.excluir(id, form({ de: DE, origem: 'lista' }), A, ctxDe(A, 'DONO'));
          expect(sem).toMatchObject({ ok: false, erros: { confirmo: expect.any(String) } });
          const com = await t.excluir(id, form({ confirmo: 'sim', de: DE, origem: 'lista' }), A, ctxDe(A, 'GERENTE'));
          expect(com).toEqual({ destino: `${t.base(A)}?q=farinha&por=25&pagina=2&feito=excluido&ref=${id}` });
          expect(await a.insumo.findUnique({ where: { id } })).toBeNull();
          expect(await a.historicoAlteracao.count({ where: { entidadeId: id, acao: 'EXCLUIU', autorNome: 'Gil Gerente' } })).toBe(1);
        });

        it('com vínculo, a ação recusa com a frase de desativar e o insumo fica', async () => {
          const id = await novo(a, `Com vínculo ${t.nome}`, { categoriaId: cat.OUTROS });
          await a.etiqueta.create({ data: { parceiroId: A.id, lojaId: lojaA, codigo: `V-${t.nome.length}`, insumoId: id, nomeSnapshot: 'x', conservacao: 'SECO', validadeEm: new Date('2027-01-01'), formato: 'E60X40' } });
          const r = await t.excluir(id, form({ confirmo: 'sim', de: DE, origem: 'lista' }), A, ctxDe(A, 'DONO'));
          expect(r).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/não dá para excluir de vez.*Desative/s) } });
          expect(await a.insumo.findUnique({ where: { id } })).not.toBeNull();
        });

        it('id de outro parceiro: "não encontrado" e nada some no outro', async () => {
          const idB = await novo(b, `De B ${t.nome}`);
          const r = await t.excluir(idB, form({ confirmo: 'sim' }), A, ctxDe(A, 'DONO'));
          expect(r).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/não encontrado/i) } });
          expect(await b.insumo.findUnique({ where: { id: idB } })).not.toBeNull();
        });

        it('a caneta da lista volta para a lista como estava; o editar do detalhe volta ao detalhe com a lista na memória', async () => {
          const id = await novo(a, `Editar daqui ${t.nome}`, { categoriaId: cat.OUTROS });
          const v = (await obterInsumo(a, id, alcance('DONO')))!.versao;
          const campos = { versao: v, nome: `Editar daqui ${t.nome}`, tipo: 'INGREDIENTE', unidade: 'KG', categoriaId: cat.OUTROS, conservacao: 'SECO', conteudo: '5', escala: 'base', preco: '26,00' };
          const daLista = await t.editar(id, form({ ...campos, de: DE, origem: 'lista' }), A, ctxDe(A, 'DONO'));
          expect(daLista).toEqual({ destino: `${t.base(A)}?q=farinha&por=25&pagina=2&feito=editado&ref=${id}` });
          const v2 = (await obterInsumo(a, id, alcance('DONO')))!.versao;
          const doDetalhe = await t.editar(id, form({ ...campos, versao: v2, preco: '27,00', de: DE }), A, ctxDe(A, 'DONO'));
          expect(doDetalhe).toEqual({ destino: `${t.base(A)}/${id}?feito=editado&de=${encodeURIComponent('q=farinha&por=25&pagina=2')}` });
          const v3 = (await obterInsumo(a, id, alcance('DONO')))!.versao;
          const igual = await t.editar(id, form({ ...campos, versao: v3, preco: '27,00', de: DE, origem: 'lista' }), A, ctxDe(A, 'DONO'));
          expect(igual).toEqual({ destino: `${t.base(A)}?q=farinha&por=25&pagina=2&feito=igual&ref=${id}` });
        });

        it('o "de" malicioso nunca vira destino: só filtros conhecidos, sempre dentro da lista do próprio parceiro', async () => {
          let n = 0;
          for (const de of ['//evil.com', 'https://evil.com/?q=1', 'javascript:alert(1)', '/\\evil.com', 'q=x&feito=excluido&ref=outro']) {
            const id = await novo(a, `Destino seguro ${t.nome} ${n++}`, { categoriaId: cat.OUTROS });
            const r = (await t.excluir(id, form({ confirmo: 'sim', de, origem: 'lista' }), A, ctxDe(A, 'DONO'))) as { destino: string };
            expect(r.destino.startsWith(`${t.base(A)}`), de).toBe(true);
            expect(r.destino, de).not.toMatch(/evil|javascript/);
            // O `feito` e o `ref` são os do servidor, nunca os que vieram no "de".
            expect(r.destino, de).toMatch(new RegExp(`[?&]feito=excluido&ref=${id}$`));
            expect(r.destino.match(/feito=/g), de).toHaveLength(1);
          }
        });

        it('desativar pela tela de remover volta à lista com o aviso e não apaga nada', async () => {
          const id = await novo(a, `Desativar daqui ${t.nome}`, { categoriaId: cat.OUTROS });
          const r = await t.situacao(id, form({ ativo: 'nao', motivo: 'saiu do cardápio', de: DE, origem: 'lista' }), A, ctxDe(A, 'DONO'));
          expect(r).toEqual({ destino: `${t.base(A)}?q=farinha&por=25&pagina=2&feito=desativado&ref=${id}` });
          expect((await a.insumo.findUnique({ where: { id } }))?.ativo).toBe(false);
        });
      });
    }

    it('o nível 1 deixa rastro de auditoria da exclusão', async () => {
      const id = await novo(a, 'Auditoria da exclusão', { categoriaId: cat.OUTROS });
      const antes = atual.auditoria.length;
      await doNivel1.acaoExcluirInsumo(A.slug, id, null, form({ confirmo: 'sim' })).catch(() => {});
      atual.ctx = () => ctxDe(A, 'DONO');
      await rodar(doNivel1.acaoExcluirInsumo(A.slug, id, null, form({ confirmo: 'sim' })));
      expect(atual.auditoria.slice(antes).some((x) => x.data.evento === 'erp_insumo_excluido')).toBe(true);
    });
  });

  // ------------------------------------------------------------------ guarda do código

  it('só a regra de insumos apaga insumo: nenhum outro arquivo do app usa delete em Insumo', () => {
    const raiz = join(process.cwd(), 'src');
    const achados: string[] = [];
    const varrer = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const p = join(dir, nome);
        if (statSync(p).isDirectory()) varrer(p);
        else if (/\.(ts|tsx)$/.test(nome) && !p.endsWith(join('lib', 'erp', 'insumos.ts'))) {
          const t = readFileSync(p, 'utf8');
          if (/\.insumo\.(delete|deleteMany)\(|DELETE\s+FROM\s+"Insumo"/i.test(t)) achados.push(p.replace(raiz, 'src'));
        }
      }
    };
    varrer(raiz);
    expect(achados).toEqual([]);
  });
});
