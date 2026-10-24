/**
 * ERP I.1a · categorias de insumo, obrigatoriedade, idempotência do cadastro e classificação assistida — no Postgres de verdade.
 *
 * Prova: as dez padrão (nomes exatos, idempotente, nunca pela migration); criar, renomear, reordenar, desativar (com uso),
 * reativar e excluir (só sem uso) com histórico; a categoria do sistema que não muda (regra e gatilho); isolamento entre
 * parceiros (regra, FK composta e RLS); categoria obrigatória no servidor, com sugestão pelo nome (SUGESTAO × MANUAL); reenvio
 * do mesmo cadastro (mesma chave = um insumo só, inclusive em paralelo); nome único sem caixa nem acento, também em paralelo;
 * insumo antigo sem categoria; pré-preparo da ficha; a classificação assistida (prévia sem gravar, aplicar idempotente, reverter
 * só o intocado, fila em lote) sem mexer em nada além da categoria; as actions de verdade por perfil.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-categorias.db.test.ts
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
import { cadastrarInsumo, editarInsumo, hashDoEnvio, listarInsumos, mudarSituacaoInsumo, obterInsumo } from '@/lib/erp/insumos';
import {
  categoriasDoFormulario,
  categoriasParaEscolher,
  criarCategoria,
  excluirCategoria,
  garantirCategoriasPadrao,
  listarCategorias,
  moverCategoria,
  mudarSituacaoCategoria,
  renomearCategoria,
  sugestaoParaInsumo,
} from '@/lib/erp/categorias';
import {
  aceitarSugestoes,
  aplicarClassificacao,
  classificarEmLote,
  filaDeRevisao,
  lotesDeClassificacao,
  nomesParecidos,
  previaDaClassificacao,
  resumoDoQueFalta,
  reverterLote,
} from '@/lib/erp/classificar';
import { cadastrarFicha } from '@/lib/erp/fichas';
import { CATEGORIAS_PADRAO, chaveDoNome } from '@/lib/erp/categoria-campos';
import { lerFormInsumo } from '@/lib/erp/insumo-campos';
import { ALCANCE_FLOWFOODS, resolverAlcance } from '@/lib/erp/permissoes';
import * as daSessao from '@/app/erp/insumos/actions';
import * as doNivel1 from '@/app/rodolfo/(painel)/erp/[slug]/insumos/actions';
import { cru, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;

describe.skipIf(!URL_TESTE)('ERP I.1a · categorias, cadastro e classificação (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  let pasta: string;
  const sufixo = `c${globalThis.crypto.randomUUID().slice(0, 8)}`;
  type P = { id: string; slug: string; nome: string };
  let A: P;
  let B: P;
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const cat: Record<string, string> = {}; // chave → id, no parceiro A
  const catB: Record<string, string> = {};
  let nomeDasSobremesas = '';

  const farinha = { tipo: 'INGREDIENTE', unidade: 'KG', conservacao: 'SECO', conteudo: '5', escala: 'base', preco: '25,00' };
  const novo = (nome: string, extra: Record<string, string> = {}) => ({ ...farinha, nome, categoriaId: cat.MERCEARIA, ...extra });
  const form = (campos: Record<string, string | string[]>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
    return f;
  };
  const ctxDe = (parceiro: P, perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR', bloqueio: string | null = null) => ({
    parceiro,
    alcance: resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] }),
    cliente: doParceiro(parceiro.id, db, { somenteLeitura: bloqueio !== null }),
    bloqueio,
    podeEscrever: bloqueio === null,
    sessao: { userId: 'u', autorNome: { DONO: 'Marina Dona', GERENTE: 'Gil Gerente', OPERADOR: 'Paulo Operador' }[perfilBase] },
  });
  async function rodar<T>(p: Promise<T>): Promise<{ destino: string } | T> {
    try {
      return await p;
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('REDIRECT ')) return { destino: (e as Error & { url: string }).url };
      throw e;
    }
  }
  /** Tudo que NÃO é categoria de todos os insumos do parceiro: a classificação não pode mexer em nada disso. */
  const retratoSemCategoria = async (c: ClienteDoParceiro) =>
    JSON.stringify(
      (
        await c.insumo.findMany({
          orderBy: { id: 'asc' },
          select: {
            id: true,
            nome: true,
            tipo: true,
            unidade: true,
            conteudoMilesimos: true,
            precoEmbalagemCentavos: true,
            taxaEntregaCentavos: true,
            conservacao: true,
            validadeSecoMin: true,
            validadeRefrigeradoMin: true,
            ativo: true,
            origem: true,
            criadoEm: true,
          },
        })
      ).map((i) => i),
    );
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
    pasta = mkdtempSync(join(tmpdir(), 'erp-cat-'));
    process.env.ERP_ARQUIVOS_DIR = pasta;
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Cat A', slug: `cat-a-${sufixo}`, status: 'ATIVO' } });
    B = await db.parceiroFlow.create({ data: { nome: 'Cat B', slug: `cat-b-${sufixo}`, status: 'ATIVO' } });
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
    if (pasta) rmSync(pasta, { recursive: true, force: true });
  });

  // ------------------------------------------------------------ as dez padrão

  it('antes de semear a casa não tem categoria nenhuma (a migration não semeia); semear cria as dez com os nomes exatos, na ordem, e Outros é do sistema', async () => {
    expect(await a.categoriaInsumo.count()).toBe(0);
    expect(await garantirCategoriasPadrao(a)).toBe(10);
    const lista = await listarCategorias(a);
    expect(lista.map((c) => c.nome)).toEqual(CATEGORIAS_PADRAO.map((c) => c.nome));
    expect(lista.map((c) => c.chave)).toEqual(CATEGORIAS_PADRAO.map((c) => c.chave));
    expect(lista.filter((c) => c.sistema).map((c) => c.nome)).toEqual(['Outros / a classificar']);
    expect(lista.every((c) => c.ativa && c.nInsumos === 0)).toBe(true);
    for (const c of lista) cat[c.chave!] = c.id;
    // Cada criação foi para o histórico.
    const h = await listarHistorico(a, { entidade: 'CategoriaInsumo', verPrecos: false, limite: 50 });
    expect(h).toHaveLength(10);
    expect(h.every((l) => l.acao === 'CRIOU')).toBe(true);
  });

  it('semear de novo cria 0 (idempotente); semear em paralelo também não duplica; o nome que a casa mudou continua sendo da padrão', async () => {
    expect(await garantirCategoriasPadrao(a)).toBe(0);
    await Promise.all([garantirCategoriasPadrao(a), garantirCategoriasPadrao(a), garantirCategoriasPadrao(a)]);
    expect(await a.categoriaInsumo.count()).toBe(10);
    // Outro parceiro semeia o seu em paralelo, sem tocar no de A.
    const [c1, c2] = await Promise.all([garantirCategoriasPadrao(b), garantirCategoriasPadrao(b)]);
    expect(c1 + c2).toBe(10);
    for (const c of await listarCategorias(b)) catB[c.chave!] = c.id;
    expect(await a.categoriaInsumo.count()).toBe(10);
    expect(Object.values(catB).some((id) => Object.values(cat).includes(id))).toBe(false);
  });

  // ------------------------------------------------------------------- CRUD

  it('criar: entra antes de Outros; nome vazio, curto ou parecido (caixa, acento) é recusado; no histórico', async () => {
    const r = await criarCategoria(a, { nome: '  Frios   e queijos ' }, 'Marina');
    expect(r).toMatchObject({ ok: true, nome: 'Frios e queijos' });
    if (!r.ok) return;
    cat.FRIOS = r.id;
    const lista = await listarCategorias(a);
    expect(lista.at(-1)!.nome).toBe('Outros / a classificar');
    expect(lista.at(-2)!.nome).toBe('Frios e queijos');
    expect(lista.map((c) => c.ordem)).toEqual([...lista.map((c) => c.ordem)].sort((x, y) => x - y));
    expect(await criarCategoria(a, { nome: 'a' }, 'Marina')).toMatchObject({ ok: false, erros: { nome: expect.stringMatching(/2 letras/) } });
    expect(await criarCategoria(a, { nome: '' }, 'Marina')).toMatchObject({ ok: false });
    for (const parecido of ['frios e queijos', 'FRIOS E QUEIJOS', 'Bebidas', 'bebídas', 'proteina', 'PROTEÍNA']) {
      expect(await criarCategoria(a, { nome: parecido }, 'Marina'), parecido).toMatchObject({ ok: false, erros: { nome: expect.stringMatching(/Já existe a categoria/) } });
    }
    const [h] = await listarHistorico(a, { entidade: 'CategoriaInsumo', verPrecos: false, limite: 1 });
    expect(h).toMatchObject({ acao: 'CRIOU', alvo: 'Frios e queijos', autorNome: 'Marina' });
    // Duas pessoas criando o mesmo nome ao mesmo tempo: só uma passa.
    const par = await Promise.all([criarCategoria(a, { nome: 'Sobremesas' }, 'x'), criarCategoria(a, { nome: 'SOBREMESAS' }, 'y'), criarCategoria(a, { nome: 'sobremesas' }, 'z')]);
    expect(par.filter((p) => p.ok)).toHaveLength(1);
    const vencedora = par.find((p) => p.ok) as { id: string; nome: string };
    cat.SOBREMESAS = vencedora.id;
    nomeDasSobremesas = vencedora.nome;
  });

  it('renomear: com a versão lida, histórico antes/depois; versão velha é conflito; igual não grava; nome de outra é recusado; a chave da padrão fica', async () => {
    const antes = (await listarCategorias(a)).find((c) => c.id === cat.FRIOS)!;
    const r = await renomearCategoria(a, cat.FRIOS, { nome: 'Frios e laticínios especiais', versao: antes.versao }, 'Marina');
    expect(r).toMatchObject({ ok: true, nome: 'Frios e laticínios especiais', mudou: ['nome'] });
    const [h] = await listarHistorico(a, { entidade: 'CategoriaInsumo', verPrecos: false, limite: 1 });
    expect(h.acao).toBe('RENOMEOU');
    expect(h.mudancas.find((m) => m.campo === 'nome')).toMatchObject({ antes: 'Frios e queijos', depois: 'Frios e laticínios especiais' });
    // Versão velha.
    expect(await renomearCategoria(a, cat.FRIOS, { nome: 'Outro nome', versao: antes.versao }, 'Marina')).toMatchObject({ ok: false, conflito: true });
    const depois = (await listarCategorias(a)).find((c) => c.id === cat.FRIOS)!;
    expect(await renomearCategoria(a, cat.FRIOS, { nome: 'Frios e laticínios especiais', versao: depois.versao }, 'Marina')).toMatchObject({ ok: true, mudou: [] });
    expect(await renomearCategoria(a, cat.FRIOS, { nome: 'bebidas', versao: depois.versao }, 'Marina')).toMatchObject({ ok: false, erros: { nome: expect.stringMatching(/Já existe/) } });
    // A padrão renomeada continua com a chave (a sugestão pelo nome ainda a acha).
    const prot = (await listarCategorias(a)).find((c) => c.chave === 'PROTEINA')!;
    expect((await renomearCategoria(a, prot.id, { nome: 'Carnes e peixes', versao: prot.versao }, 'Marina')).ok).toBe(true);
    const sug = await sugestaoParaInsumo(a, 'Coxa de frango congelada');
    expect(sug).toMatchObject({ categoriaId: cat.PROTEINA, chave: 'PROTEINA', nome: 'Carnes e peixes' });
    // Semear de novo não recria a "Proteína": a chave já existe, com o nome novo.
    expect(await garantirCategoriasPadrao(a)).toBe(0);
    expect(await a.categoriaInsumo.count({ where: { nome: 'Proteína' } })).toBe(0);
    await renomearCategoria(a, prot.id, { nome: 'Proteína', versao: (await listarCategorias(a)).find((c) => c.id === prot.id)!.versao }, 'Marina');
  });

  it('"Outros / a classificar" é do sistema: a regra e o gatilho do banco (SQL cru) recusam renomear, desativar e excluir; nem de lado muda a chave', async () => {
    const outros = (await listarCategorias(a)).find((c) => c.chave === 'OUTROS')!;
    expect(outros.sistema).toBe(true);
    expect(await renomearCategoria(a, outros.id, { nome: 'Pendentes', versao: outros.versao }, 'Marina')).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/do sistema/) } });
    expect(await mudarSituacaoCategoria(a, outros.id, false, null, 'Marina')).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/do sistema/) } });
    expect(await excluirCategoria(a, outros.id, 'Marina')).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/do sistema/) } });
    expect(await moverCategoria(a, outros.id, 'subir', 'Marina')).toMatchObject({ ok: false });
    // O gatilho: mesmo por SQL cru, como o dono do banco.
    await expect(cru(db, perfil, A.id, `UPDATE "CategoriaInsumo" SET "nome" = 'Pendentes' WHERE "id" = $1`, outros.id)).rejects.toThrow(/sistema_protegida/);
    await expect(cru(db, perfil, A.id, `UPDATE "CategoriaInsumo" SET "ativa" = false, "desativadaEm" = now() WHERE "id" = $1`, outros.id)).rejects.toThrow();
    await expect(cru(db, perfil, A.id, `UPDATE "CategoriaInsumo" SET "chave" = 'OUTRA' WHERE "id" = $1`, outros.id)).rejects.toThrow(/sistema_protegida/);
    await expect(cru(db, perfil, A.id, `DELETE FROM "CategoriaInsumo" WHERE "id" = $1`, outros.id)).rejects.toThrow(/sistema_protegida/);
    expect((await listarCategorias(a)).find((c) => c.chave === 'OUTROS')).toMatchObject({ nome: 'Outros / a classificar', ativa: true });
  });

  it('reordenar: sobe e desce uma posição, Outros fica sempre por último, no histórico; nas pontas não faz nada', async () => {
    const nomes = async () => (await listarCategorias(a)).map((c) => c.nome);
    const antes = await nomes();
    expect(antes.at(-1)).toBe('Outros / a classificar');
    const hort = cat.HORTIFRUTI;
    expect(await moverCategoria(a, hort, 'subir', 'Marina')).toMatchObject({ ok: true, mudou: ['posicao'] });
    const depois = await nomes();
    expect(depois.slice(0, 2)).toEqual(['Hortifruti', 'Proteína']);
    expect(depois.at(-1)).toBe('Outros / a classificar');
    expect(await moverCategoria(a, hort, 'subir', 'Marina')).toMatchObject({ ok: true, mudou: [] }); // já é a primeira
    const [h] = await listarHistorico(a, { entidade: 'CategoriaInsumo', verPrecos: false, limite: 1 });
    expect(h).toMatchObject({ acao: 'REORDENOU', alvo: 'Hortifruti' });
    expect(h.mudancas.find((m) => m.campo === 'posição na lista')).toMatchObject({ antes: '2ª', depois: '1ª' });
    await moverCategoria(a, hort, 'descer', 'Marina');
    expect(await nomes()).toEqual(antes);
  });

  it('desativar com uso: o insumo continua nela, ela sai das opções do cadastro novo e o insumo antigo segue exibindo; reativar volta', async () => {
    const r = await cadastrarInsumo(a, novo('Presunto fatiado', { categoriaId: cat.FRIOS }), 'Marina');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await mudarSituacaoCategoria(a, cat.FRIOS, false, 'Não usamos mais', 'Marina')).toMatchObject({ ok: true });
    const lista = (await listarCategorias(a)).find((c) => c.id === cat.FRIOS)!;
    expect(lista).toMatchObject({ ativa: false, nInsumos: 1, nAtivos: 1 });
    expect(lista.desativadaEm).not.toBeNull();
    // O insumo continua nela, e a tela do insumo a mostra como desativada.
    const d = (await obterInsumo(a, r.id, ALCANCE_FLOWFOODS))!;
    expect(d.categoria).toMatchObject({ id: cat.FRIOS, ativa: false });
    // Fora das opções do cadastro novo; dentro das do insumo que já está nela (para não obrigar a trocar).
    expect((await categoriasParaEscolher(a)).map((c) => c.id)).not.toContain(cat.FRIOS);
    expect((await categoriasParaEscolher(a, cat.FRIOS)).map((c) => c.id)).toContain(cat.FRIOS);
    expect((await categoriasParaEscolher(a, null, true)).map((c) => c.id)).toContain(cat.FRIOS);
    // Insumo novo não pode usá-la.
    expect(await cadastrarInsumo(a, novo('Salame', { categoriaId: cat.FRIOS }), 'Marina')).toMatchObject({ ok: false, erros: { categoriaId: expect.stringMatching(/desativada/) } });
    // Editar o insumo que já está nela, sem trocar a categoria, passa.
    const e = await editarInsumo(a, r.id, novo('Presunto fatiado', { categoriaId: cat.FRIOS, preco: '30,00', versao: d.versao }), 'Marina');
    expect(e).toMatchObject({ ok: true });
    // Desativar de novo é recusado; reativar volta.
    expect(await mudarSituacaoCategoria(a, cat.FRIOS, false, null, 'Marina')).toMatchObject({ ok: false, conflito: true });
    expect(await mudarSituacaoCategoria(a, cat.FRIOS, true, null, 'Marina')).toMatchObject({ ok: true });
    expect((await categoriasParaEscolher(a)).map((c) => c.id)).toContain(cat.FRIOS);
    const hs = await listarHistorico(a, { entidade: 'CategoriaInsumo', verPrecos: false, limite: 3 });
    expect(hs.map((h) => h.acao)).toEqual(['REATIVOU', 'DESATIVOU', 'REORDENOU']);
    expect(hs[1].motivo).toBe('Não usamos mais');
  });

  it('excluir: com insumo é recusado (desative); sem uso e sem passagem no histórico exclui de verdade; usada e depois esvaziada também é recusada', async () => {
    const recusa = await excluirCategoria(a, cat.FRIOS, 'Marina');
    expect(recusa).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/tem 1 insumo.*Desative/s) } });
    expect(await a.categoriaInsumo.count({ where: { id: cat.FRIOS } })).toBe(1);
    // Sem uso nenhum: exclui, com o registro.
    expect(await excluirCategoria(a, cat.SOBREMESAS, 'Marina')).toMatchObject({ ok: true });
    expect(await a.categoriaInsumo.count({ where: { id: cat.SOBREMESAS } })).toBe(0);
    const [h] = await listarHistorico(a, { entidade: 'CategoriaInsumo', verPrecos: false, limite: 1 });
    expect(h).toMatchObject({ acao: 'EXCLUIU', alvo: nomeDasSobremesas });
    // Já foi usada e o insumo saiu dela: o histórico guarda a passagem, então não exclui.
    const t = await criarCategoria(a, { nome: 'Temporária' }, 'Marina');
    if (!t.ok) throw new Error('criar');
    const i = await cadastrarInsumo(a, novo('Insumo passageiro', { categoriaId: t.id }), 'Marina');
    if (!i.ok) throw new Error('cadastrar');
    const d = (await obterInsumo(a, i.id, ALCANCE_FLOWFOODS))!;
    expect((await editarInsumo(a, i.id, novo('Insumo passageiro', { categoriaId: cat.MERCEARIA, versao: d.versao }), 'Marina')).ok).toBe(true);
    expect((await listarCategorias(a)).find((c) => c.id === t.id)!.nInsumos).toBe(0);
    expect(await excluirCategoria(a, t.id, 'Marina')).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/histórico.*Desative/s) } });
    // E a FK (Restrict) é a última palavra, mesmo por SQL cru.
    await expect(cru(db, perfil, A.id, `DELETE FROM "CategoriaInsumo" WHERE "id" = $1`, cat.FRIOS)).rejects.toThrow();
  });

  // ------------------------------------------------------------- isolamento

  it('isolamento: B não lê, não usa, não renomeia, não desativa e não exclui a categoria de A; a FK composta e a RLS fecham o resto', async () => {
    expect((await listarCategorias(b)).map((c) => c.id)).not.toContain(cat.MERCEARIA);
    expect(await b.categoriaInsumo.findUnique({ where: { id: cat.MERCEARIA } })).toBeNull();
    // Usar a categoria de A no cadastro de B.
    expect(await cadastrarInsumo(b, { ...farinha, nome: 'Farinha de B', categoriaId: cat.MERCEARIA }, 'Bia')).toMatchObject({ ok: false, erros: { categoriaId: expect.stringMatching(/não existe/) } });
    expect(await b.insumo.count()).toBe(0);
    // Mexer na categoria de A.
    expect(await renomearCategoria(b, cat.MERCEARIA, { nome: 'Hackeada', versao: new Date().toISOString() }, 'Bia')).toMatchObject({ ok: false, naoEncontrado: true });
    expect(await mudarSituacaoCategoria(b, cat.MERCEARIA, false, null, 'Bia')).toMatchObject({ ok: false, naoEncontrado: true });
    expect(await excluirCategoria(b, cat.MERCEARIA, 'Bia')).toMatchObject({ ok: false, naoEncontrado: true });
    expect(await moverCategoria(b, cat.MERCEARIA, 'subir', 'Bia')).toMatchObject({ ok: false, naoEncontrado: true });
    expect((await listarCategorias(a)).find((c) => c.id === cat.MERCEARIA)).toMatchObject({ nome: 'Mercearias e secos', ativa: true });
    // Pelo portão cru de B: o insumo de B apontando para a categoria de A é recusado pelo banco (FK composta).
    await expect(
      b.insumo.create({ data: { parceiroId: B.id, nome: 'Furando', unidade: 'KG', conteudoMilesimos: 1000, precoEmbalagemCentavos: 100, categoriaId: cat.MERCEARIA } }),
    ).rejects.toThrow();
    // Classificar em lote de B com id de A e categoria de A: nada.
    const ib = await cadastrarInsumo(b, { ...farinha, nome: 'Farinha de B', categoriaId: catB.MERCEARIA }, 'Bia');
    if (!ib.ok) throw new Error('b');
    expect(await classificarEmLote(b, [ib.id], cat.HORTIFRUTI, 'Bia')).toMatchObject({ ok: false });
    // A classificação de B nunca toca os insumos de A.
    const antesA = await retratoSemCategoria(a);
    await aplicarClassificacao(b, 'Bia');
    expect(await retratoSemCategoria(a)).toBe(antesA);
    if (perfil.rls) {
      // Debaixo do papel do tenant, SQL cru sem WHERE no contexto de B não enxerga a tabela de A.
      const contagem = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.parceiro_id', ${B.id}, true), set_config('role', 'erp_tenant', true)`;
        return tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "CategoriaInsumo"`);
      });
      expect(contagem[0].n).toBe(10);
    }
  });

  // ------------------------------------------------------- cadastro: obrigatoriedade

  it('categoria obrigatória no servidor: sem ela, sem unidade ou com nome em branco, nada é gravado e cada falta volta no campo', async () => {
    const antes = await a.insumo.count();
    const r = await cadastrarInsumo(a, { ...farinha, nome: '   ', categoriaId: '', unidade: '' }, 'Marina');
    expect(r).toMatchObject({ ok: false });
    if (r.ok) return;
    expect(Object.keys(r.erros).sort()).toEqual(['categoriaId', 'nome', 'unidade']);
    expect(await cadastrarInsumo(a, { ...farinha, nome: 'Sem categoria' }, 'Marina')).toMatchObject({ ok: false, erros: { categoriaId: expect.stringMatching(/Escolha a categoria/) } });
    expect(await cadastrarInsumo(a, { ...farinha, nome: 'Categoria falsa', categoriaId: 'nao-existe' }, 'Marina')).toMatchObject({ ok: false, erros: { categoriaId: expect.stringMatching(/não existe/) } });
    expect(await cadastrarInsumo(a, { ...farinha, nome: 'Unidade torta', unidade: 'Selecione', categoriaId: cat.MERCEARIA }, 'Marina')).toMatchObject({ ok: false, erros: { unidade: expect.stringMatching(/unidade base/) } });
    expect(await a.insumo.count()).toBe(antes);
    // Corrigindo e reenviando, passa.
    expect(await cadastrarInsumo(a, novo('Farinha de trigo'), 'Marina')).toMatchObject({ ok: true });
  });

  it('a sugestão pelo nome: SUGESTAO quando a escolha é a sugerida, MANUAL quando a pessoa trocou; em Outros por dúvida, o motivo fica para a fila', async () => {
    const sug = await sugestaoParaInsumo(a, 'Coxa de frango congelada');
    expect(sug).toMatchObject({ categoriaId: cat.PROTEINA, nome: 'Proteína', origem: 'termo' });
    const aceita = await cadastrarInsumo(a, novo('Coxa de frango congelada', { categoriaId: sug.categoriaId! }), 'Marina');
    const trocada = await cadastrarInsumo(a, novo('Coxa de frango resfriada', { categoriaId: cat.CONGELADOS }), 'Marina');
    const duvida = await cadastrarInsumo(a, novo('Xpto 3000', { categoriaId: cat.OUTROS }), 'Marina');
    const outraDuvida = await cadastrarInsumo(a, novo('Batata murcha', { categoriaId: cat.OUTROS }), 'Marina');
    for (const r of [aceita, trocada, duvida, outraDuvida]) expect(r.ok).toBe(true);
    const ler = (r: unknown) => a.insumo.findUniqueOrThrow({ where: { id: (r as { id: string }).id }, select: { categoriaId: true, classificadoPor: true, classificacaoMotivo: true, classificacaoLote: true, classificadoEm: true } });
    expect(await ler(aceita)).toMatchObject({ categoriaId: cat.PROTEINA, classificadoPor: 'SUGESTAO', classificacaoMotivo: null, classificacaoLote: null });
    expect((await ler(aceita)).classificadoEm).not.toBeNull();
    expect(await ler(trocada)).toMatchObject({ categoriaId: cat.CONGELADOS, classificadoPor: 'MANUAL', classificacaoMotivo: null });
    // "Xpto 3000" não diz nada e ficou em Outros: igual à sugestão, com o motivo. "Batata murcha" a sugestão era Hortifruti: ela escolheu Outros de propósito.
    expect(await ler(duvida)).toMatchObject({ categoriaId: cat.OUTROS, classificadoPor: 'SUGESTAO', classificacaoMotivo: expect.stringMatching(/Sem palavra conhecida/) });
    expect(await ler(outraDuvida)).toMatchObject({ categoriaId: cat.OUTROS, classificadoPor: 'MANUAL', classificacaoMotivo: null });
    // O histórico da criação traz a categoria pelo nome (o id é técnico e não aparece).
    const [h] = await listarHistorico(a, { de: [{ entidade: 'Insumo', ids: [(aceita as { id: string }).id] }], verPrecos: true, limite: 1 });
    expect(h.acao).toBe('CRIOU');
    expect(h.mudancas.find((m) => m.campo === 'categoria')?.depois).toBe('Proteína');
    expect(h.mudancas.find((m) => m.campo === 'como foi classificada')?.depois).toBe('sugestão pelo nome, aceita');
    expect(h.mudancas.map((m) => m.campo)).not.toContain('categoriaId');
    // Insumo do tipo embalagem: Descartáveis pelo tipo.
    expect(await sugestaoParaInsumo(a, 'Qualquer coisa', 'EMBALAGEM')).toMatchObject({ categoriaId: cat.DESCARTAVEIS, origem: 'tipo' });
  });

  it('a lista filtra por categoria, "sem categoria" e "a revisar"; cada linha traz a categoria e o motivo', async () => {
    const id = await legado(a, 'Insumo antigo sem categoria');
    const todas = await listarInsumos(a, { categoria: null });
    expect(todas.linhas.find((l) => l.id === id)).toMatchObject({ categoria: null });
    expect((await listarInsumos(a, { categoria: 'sem' })).linhas.map((l) => l.nome)).toEqual(['Insumo antigo sem categoria']);
    expect((await listarInsumos(a, { categoria: cat.PROTEINA })).linhas.map((l) => l.nome).sort()).toEqual(['Coxa de frango congelada']);
    const revisar = (await listarInsumos(a, { categoria: 'revisar' })).linhas;
    expect(revisar.map((l) => l.nome).sort()).toEqual(['Batata murcha', 'Insumo antigo sem categoria', 'Xpto 3000']);
    expect(revisar.find((l) => l.nome === 'Xpto 3000')).toMatchObject({ categoria: { chave: 'OUTROS' }, classificacaoMotivo: expect.stringMatching(/Sem palavra/) });
    // Combinado com outro filtro (a conservação usa OR por dentro: os dois valem).
    expect((await listarInsumos(a, { categoria: 'revisar', conservacao: 'SECO' })).linhas.map((l) => l.nome)).toEqual(expect.arrayContaining(['Xpto 3000']));
    await a.insumo.deleteMany({ where: { id } });
  });

  // ------------------------------------------------------------- idempotência

  it('reenvio do mesmo cadastro (mesma chave, mesmo conteúdo): um insumo só, e o reenvio volta como sucesso apontando para ele', async () => {
    const antes = await a.insumo.count();
    const entrada = novo('Azeite extra virgem', { envio: 'envio-0001-abcd' });
    const primeira = await cadastrarInsumo(a, entrada, 'Marina');
    expect(primeira).toMatchObject({ ok: true });
    if (!primeira.ok) return;
    expect(primeira.repetido).toBeUndefined();
    const segunda = await cadastrarInsumo(a, entrada, 'Marina');
    expect(segunda).toMatchObject({ ok: true, id: primeira.id, nome: 'Azeite extra virgem', repetido: true });
    expect(await a.insumo.count()).toBe(antes + 1);
    // Nem o histórico dobra.
    const criacoes = (await listarHistorico(a, { de: [{ entidade: 'Insumo', ids: [primeira.id] }], verPrecos: true })).filter((h) => h.acao === 'CRIOU');
    expect(criacoes).toHaveLength(1);
    // Mesmo se o insumo foi editado depois: a chave segue apontando para ele.
    const d = (await obterInsumo(a, primeira.id, ALCANCE_FLOWFOODS))!;
    await editarInsumo(a, primeira.id, novo('Azeite extra virgem', { preco: '40,00', versao: d.versao }), 'Marina');
    expect(await cadastrarInsumo(a, entrada, 'Marina')).toMatchObject({ ok: true, id: primeira.id, repetido: true });
  });

  it('mesma chave com conteúdo diferente é recusada (outro pedido, não reenvio) e nada é criado; a chave é por parceiro', async () => {
    const antes = await a.insumo.count();
    const r = await cadastrarInsumo(a, novo('Outro nome qualquer', { envio: 'envio-0001-abcd' }), 'Marina');
    expect(r).toMatchObject({ ok: false, conflito: true, erros: { geral: expect.stringMatching(/Azeite extra virgem.*dados diferentes/s) } });
    expect(await a.insumo.count()).toBe(antes);
    // O parceiro B pode usar a mesma chave: a chave só vale dentro do parceiro.
    const rb = await cadastrarInsumo(b, { ...farinha, nome: 'Azeite de B', categoriaId: catB.MERCEARIA, envio: 'envio-0001-abcd' }, 'Bia');
    expect(rb).toMatchObject({ ok: true });
    expect(rb.ok && rb.repetido).toBeFalsy();
    // Chave torta (curta, com espaço, script): recusada, nada grava.
    for (const torta of ['curta', 'com espaco aqui', '<script>alert(1)</script>']) {
      expect(await cadastrarInsumo(a, novo('Chave torta', { envio: torta }), 'Marina'), torta).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/chave válida/) } });
    }
    expect(await a.insumo.count()).toBe(antes);
  });

  it('o mesmo envio chegando ao mesmo tempo (duplo clique em duas abas, rede lenta): cinco pedidos, um insumo, todos com sucesso', async () => {
    const antes = await a.insumo.count();
    const entrada = novo('Vinagre de maçã', { envio: 'envio-paralelo-77' });
    const rs = await Promise.all(Array.from({ length: 5 }, () => cadastrarInsumo(a, entrada, 'Marina')));
    expect(rs.every((r) => r.ok)).toBe(true);
    expect(new Set(rs.map((r) => (r.ok ? r.id : ''))).size).toBe(1);
    expect(rs.filter((r) => r.ok && !r.repetido)).toHaveLength(1);
    expect(await a.insumo.count()).toBe(antes + 1);
  });

  it('nome único sem diferenciar maiúscula nem acento: recusa com o link do que existe; desativado oferece reativar; em paralelo só um passa', async () => {
    const f = await cadastrarInsumo(a, novo('Farinha de Trigo Especial'), 'Marina');
    if (!f.ok) throw new Error('farinha');
    for (const parecido of ['farinha de trigo especial', 'FARINHA DE TRIGO ESPECIAL', 'Farinha  de   trigo especial']) {
      expect(await cadastrarInsumo(a, novo(parecido), 'Marina'), parecido).toMatchObject({ ok: false, existenteId: f.id, erros: { nome: expect.stringMatching(/o mesmo nome, escrito de outro jeito/) } });
    }
    const pao = await cadastrarInsumo(a, novo('Pão de forma', { categoriaId: cat.PANIFICACAO }), 'Marina');
    if (!pao.ok) throw new Error('pao');
    expect(await cadastrarInsumo(a, novo('pao de forma', { categoriaId: cat.PANIFICACAO }), 'Marina')).toMatchObject({ ok: false, existenteId: pao.id });
    // O nome idêntico segue com a frase de sempre.
    expect(await cadastrarInsumo(a, novo('Pão de forma', { categoriaId: cat.PANIFICACAO }), 'Marina')).toMatchObject({ ok: false, erros: { nome: 'Já existe um insumo com esse nome.' }, existenteId: pao.id });
    // Desativado: oferece reativar.
    await mudarSituacaoInsumo(a, pao.id, false, null, 'Marina');
    expect(await cadastrarInsumo(a, novo('PÃO DE FORMA', { categoriaId: cat.PANIFICACAO }), 'Marina')).toMatchObject({ ok: false, desativadoId: pao.id });
    // Em parceiro diferente o mesmo nome vale.
    expect(await cadastrarInsumo(b, { ...farinha, nome: 'Farinha de Trigo Especial', categoriaId: catB.MERCEARIA }, 'Bia')).toMatchObject({ ok: true });
    // Ao mesmo tempo: "Fubá" e "fuba" e "FUBÁ" — um só.
    const par = await Promise.all(['Fubá', 'fuba', 'FUBÁ'].map((n) => cadastrarInsumo(a, novo(n), 'Marina')));
    expect(par.filter((p) => p.ok)).toHaveLength(1);
    expect(await a.insumo.count({ where: { nome: { in: ['Fubá', 'fuba', 'FUBÁ'] } } })).toBe(1);
    // Renomear para um nome parecido de outro é recusado; mudar só a caixa do próprio nome passa.
    const d = (await obterInsumo(a, f.id, ALCANCE_FLOWFOODS))!;
    expect(await editarInsumo(a, f.id, novo('fubá', { versao: d.versao }), 'Marina')).toMatchObject({ ok: false, erros: { nome: expect.stringMatching(/Já existe/) } });
    expect(await editarInsumo(a, f.id, novo('farinha de trigo especial', { versao: d.versao }), 'Marina')).toMatchObject({ ok: true });
  });

  it('nomes que já eram parecidos (de antes da regra) são só reportados: a migration não quebra e nada é mexido', async () => {
    await legado(a, 'Cebola', {});
    await legado(a, 'cebola', {});
    const grupos = await nomesParecidos(a);
    const cebolas = grupos.find((g) => g.itens.some((i) => i.nome === 'cebola'));
    expect(cebolas?.itens.map((i) => i.nome).sort()).toEqual(expect.arrayContaining(['Cebola', 'cebola']));
    // Elas continuam existindo e editáveis (sem mudar o nome).
    const [c1] = cebolas!.itens;
    const d = (await obterInsumo(a, c1.id, ALCANCE_FLOWFOODS))!;
    expect(await editarInsumo(a, c1.id, novo(c1.nome, { categoriaId: cat.HORTIFRUTI, preco: '12,00', versao: d.versao }), 'Marina')).toMatchObject({ ok: true });
    await a.insumo.deleteMany({ where: { nome: { in: ['Cebola', 'cebola'] } } });
  });

  // ------------------------------------------------------ insumo antigo e edição

  it('editar: insumo antigo sem categoria só salva escolhendo uma; o que já tem categoria a mantém se o campo nem vier, e vazio é recusado', async () => {
    const id = await legado(a, 'Mostarda dijon', { conservacao: 'SECO' });
    const d = (await obterInsumo(a, id, ALCANCE_FLOWFOODS))!;
    expect(d.categoria).toBeNull();
    const semCampo = { ...farinha, nome: 'Mostarda dijon', versao: d.versao };
    expect(await editarInsumo(a, id, semCampo, 'Marina')).toMatchObject({ ok: false, erros: { categoriaId: expect.stringMatching(/Escolha a categoria/) } });
    expect(await editarInsumo(a, id, { ...semCampo, categoriaId: '' }, 'Marina')).toMatchObject({ ok: false });
    const sug = await sugestaoParaInsumo(a, 'Mostarda dijon');
    const ok = await editarInsumo(a, id, { ...semCampo, categoriaId: sug.categoriaId! }, 'Marina');
    expect(ok).toMatchObject({ ok: true });
    expect(ok.ok && ok.mudou).toEqual(expect.arrayContaining(['categoria', 'categoriaId']));
    const [h] = await listarHistorico(a, { de: [{ entidade: 'Insumo', ids: [id] }], verPrecos: true, limite: 1 });
    expect(h.mudancas.find((m) => m.campo === 'categoria')).toMatchObject({ antes: '—', depois: 'Mercearias e secos' });
    expect(await a.insumo.findUniqueOrThrow({ where: { id }, select: { classificadoPor: true } })).toMatchObject({ classificadoPor: 'SUGESTAO' });
    // Já tem categoria: sem o campo, mantém; vazio, recusa; trocar, classifica como MANUAL.
    const d2 = (await obterInsumo(a, id, ALCANCE_FLOWFOODS))!;
    expect(await editarInsumo(a, id, { ...farinha, nome: 'Mostarda dijon', preco: '31,00', versao: d2.versao }, 'Marina')).toMatchObject({ ok: true });
    expect((await obterInsumo(a, id, ALCANCE_FLOWFOODS))!.categoria?.id).toBe(sug.categoriaId);
    const d3 = (await obterInsumo(a, id, ALCANCE_FLOWFOODS))!;
    expect(await editarInsumo(a, id, { ...farinha, nome: 'Mostarda dijon', categoriaId: '', versao: d3.versao }, 'Marina')).toMatchObject({ ok: false });
    expect(await editarInsumo(a, id, novo('Mostarda dijon', { categoriaId: cat.CONGELADOS, versao: d3.versao }), 'Marina')).toMatchObject({ ok: true });
    expect(await a.insumo.findUniqueOrThrow({ where: { id }, select: { categoriaId: true, classificadoPor: true } })).toMatchObject({ categoriaId: cat.CONGELADOS, classificadoPor: 'MANUAL' });
  });

  it('o pré-preparo criado pela ficha recebe a sugestão; na dúvida vai para Outros / a classificar e a ficha não trava', async () => {
    const cebola = await cadastrarInsumo(a, novo('Cebola caramelo', { categoriaId: cat.HORTIFRUTI }), 'Marina');
    if (!cebola.ok) throw new Error('cebola');
    const ficha = (nome: string) => ({ nome, tipo: 'PRE_PREPARO', rendimento: '1', rendimentoUnidade: 'kg', itens: [{ insumoId: cebola.id, quantidade: '100', unidade: 'g' }] });
    const molho = await cadastrarFicha(a, ficha('Molho barbecue da casa'), { tipo: 'manter' }, 'Marina');
    const duvida = await cadastrarFicha(a, ficha('Xpto da cozinha'), { tipo: 'manter' }, 'Marina');
    expect(molho.ok && duvida.ok).toBe(true);
    const insumo = (nome: string) => a.insumo.findFirstOrThrow({ where: { nome }, select: { tipo: true, categoriaId: true, classificadoPor: true, classificacaoMotivo: true } });
    expect(await insumo('Molho barbecue da casa')).toMatchObject({ tipo: 'PRE_PREPARO', categoriaId: cat.MERCEARIA, classificadoPor: 'SUGESTAO', classificacaoMotivo: null });
    expect(await insumo('Xpto da cozinha')).toMatchObject({ tipo: 'PRE_PREPARO', categoriaId: cat.OUTROS, classificadoPor: 'SUGESTAO', classificacaoMotivo: expect.stringMatching(/Sem palavra/) });
    // Casa nova, sem as dez ainda: a ficha as cria na hora e o pré-preparo nasce classificado igual.
    const sem = await db.parceiroFlow.create({ data: { nome: 'Cat C', slug: `cat-c-${sufixo}`, status: 'ATIVO' } });
    try {
      const c = doParceiro(sem.id, db);
      const ci = await c.insumo.create({ data: { parceiroId: sem.id, nome: 'Cebola do C', unidade: 'KG', conteudoMilesimos: 1000, precoEmbalagemCentavos: 500 } });
      expect(await c.categoriaInsumo.count()).toBe(0);
      const r = await cadastrarFicha(c, { nome: 'Molho da C', tipo: 'PRE_PREPARO', rendimento: '1', rendimentoUnidade: 'kg', itens: [{ insumoId: ci.id, quantidade: '100', unidade: 'g' }] }, { tipo: 'manter' }, 'Marina');
      expect(r.ok).toBe(true);
      expect(await c.categoriaInsumo.count()).toBe(10);
      expect(await c.insumo.findFirstOrThrow({ where: { nome: 'Molho da C' }, select: { categoria: { select: { chave: true } } } })).toMatchObject({ categoria: { chave: 'MERCEARIA' } });
    } finally {
      await limparParceiros(db, perfil, [sem.id]);
    }
  });

  it('categoriasDoFormulario semeia na primeira vez e devolve as ativas na ordem da casa, mais a que o insumo já tem', async () => {
    const lista = await categoriasDoFormulario(a);
    expect(lista.map((c) => c.nome).at(-1)).toBe('Outros / a classificar');
    expect(lista.every((c) => c.ativa)).toBe(true);
  });

  it('abrir tela nunca recria a padrão que a casa excluiu, nem grava histórico em nome de quem abriu; só o script (completar) devolve', async () => {
    const N = await db.parceiroFlow.create({ data: { nome: 'Cat N', slug: `cat-n-${sufixo}`, status: 'ATIVO' } });
    try {
      const n = doParceiro(N.id, db);
      // A primeira abertura (o Operador) semeia as dez, em nome do Sistema.
      const primeira = await categoriasDoFormulario(n);
      expect(primeira).toHaveLength(10);
      const criou = async () => (await listarHistorico(n, { entidade: 'CategoriaInsumo', verPrecos: false, limite: 100 })).filter((h) => h.acao === 'CRIOU');
      expect((await criou()).map((h) => h.autorNome)).toEqual(Array(10).fill('Sistema'));
      // A Dona exclui "Bebidas" (sem uso).
      const bebidas = (await listarCategorias(n)).find((c) => c.chave === 'BEBIDAS')!;
      expect(await excluirCategoria(n, bebidas.id, 'Marina Dona')).toMatchObject({ ok: true });
      // Outra pessoa abre o formulário, as categorias e a classificação: continua excluída e o histórico não ganha CRIOU.
      await categoriasDoFormulario(n);
      await garantirCategoriasPadrao(n);
      await aplicarClassificacao(n, 'Paulo Operador');
      await previaDaClassificacao(n, ALCANCE_FLOWFOODS);
      expect(await n.categoriaInsumo.count({ where: { chave: 'BEBIDAS' } })).toBe(0);
      expect(await n.categoriaInsumo.count()).toBe(9);
      expect(await criou()).toHaveLength(10);
      // O pré-preparo da ficha também não a traz de volta.
      expect((await categoriasParaEscolher(n)).map((c) => c.nome)).not.toContain('Bebidas');
      // O ato explícito (script) devolve, com o autor dado.
      expect(await garantirCategoriasPadrao(n, { completar: true, autorNome: 'script' })).toBe(1);
      expect(await n.categoriaInsumo.count({ where: { chave: 'BEBIDAS' } })).toBe(1);
      expect((await criou()).filter((h) => h.autorNome === 'script')).toHaveLength(1);
    } finally {
      await limparParceiros(db, perfil, [N.id]);
    }
  });

  it('o nome é comparado na forma composta e sem caracteres invisíveis: "Farínha" decomposto e "Proteína" com largura zero são os mesmos nomes', async () => {
    const composto = 'Farínha de teste';
    const decomposto = composto.normalize('NFD'); // i + acento combinante
    expect(decomposto).not.toBe(composto);
    expect(chaveDoNome(decomposto)).toBe(chaveDoNome(composto));
    expect(chaveDoNome('Proteína\u200b')).toBe(chaveDoNome('proteina'));
    const primeiro = await cadastrarInsumo(a, novo(composto), 'Marina');
    expect(primeiro).toMatchObject({ ok: true, nome: composto });
    const segundo = await cadastrarInsumo(a, novo(decomposto), 'Marina');
    expect(segundo).toMatchObject({ ok: false, erros: { nome: expect.stringMatching(/Já existe/) } });
    // Invisível no meio e nas pontas: o nome gravado sai limpo e o repetido é reconhecido.
    const invisivel = await cadastrarInsumo(a, novo('\u200bFarínha\u200b de\ufeff teste'), 'Marina');
    expect(invisivel).toMatchObject({ ok: false, erros: { nome: expect.stringMatching(/Já existe/) } });
    const limpo = await cadastrarInsumo(a, novo('Sal\u200b grosso\u00ad'), 'Marina');
    expect(limpo).toMatchObject({ ok: true, nome: 'Sal grosso' });
    // Só invisível não é nome.
    expect(await cadastrarInsumo(a, novo('\u200b\u200b\u200b'), 'Marina')).toMatchObject({ ok: false, erros: { nome: expect.any(String) } });
    // Categoria: "Proteína" + largura zero é a mesma que já existe.
    expect(await criarCategoria(a, { nome: 'Proteína\u200b' }, 'Marina')).toMatchObject({ ok: false, erros: { nome: expect.stringMatching(/Já existe/) } });
    expect(await criarCategoria(a, { nome: 'Bebídas'.normalize('NFD') }, 'Marina')).toMatchObject({ ok: false, erros: { nome: expect.stringMatching(/Já existe/) } });
  });

  it('a chave de envio é por pessoa: a mesma chave de outra pessoa não reconhece nem revela o envio dela', async () => {
    const entrada = novo('Pimenta do reino', { envio: 'envio-pessoa-0001' });
    const dela = await cadastrarInsumo(a, entrada, 'Marina', 'user-marina');
    expect(dela).toMatchObject({ ok: true });
    // A mesma pessoa reenviando: o mesmo insumo.
    expect(await cadastrarInsumo(a, entrada, 'Marina', 'user-marina')).toMatchObject({ ok: true, repetido: true });
    // Outra pessoa com a MESMA chave e conteúdo diferente: não é recusa "dados diferentes de Pimenta do reino" (que revelaria o envio dela).
    const outra = await cadastrarInsumo(a, novo('Cominho em pó', { envio: 'envio-pessoa-0001' }), 'Paulo', 'user-paulo');
    expect(outra).toMatchObject({ ok: true, nome: 'Cominho em pó' });
    expect(outra.ok && outra.repetido).toBeFalsy();
    // Com o mesmo conteúdo, a outra pessoa também não é tratada como reenvio: vai pela regra do nome.
    expect(await cadastrarInsumo(a, { ...entrada, envio: 'envio-pessoa-0002' }, 'Paulo', 'user-paulo')).toMatchObject({ ok: false, erros: { nome: expect.stringMatching(/Já existe/) } });
  });

  // ------------------------------------------------------ classificação assistida

  describe('classificação assistida dos insumos antigos', () => {
    const nomesLegado = ['Blend bovino 180 g', 'Pão brioche', 'Queijo cheddar fatiado', 'Cebola roxa', 'Molho especial', 'Xpto 3000', 'Combo hambúrguer e pão', 'Detergente neutro', 'Coca-Cola lata', 'Caixa kraft'];
    const ids: Record<string, string> = {};
    let L: P; // um parceiro só para a classificação, para a contagem ser exata

    beforeAll(async () => {
      L = await db.parceiroFlow.create({ data: { nome: 'Cat L', slug: `cat-l-${sufixo}`, status: 'ATIVO' } });
    });
    afterAll(async () => {
      await limparParceiros(db, perfil, [L.id]);
    });

    it('prévia: lista todos os sem categoria com a sugestão e o motivo, e NÃO grava nada (nem as categorias, nem o histórico)', async () => {
      const l = doParceiro(L.id, db);
      for (const n of nomesLegado) ids[n] = await legado(l, n, n === 'Caixa kraft' ? { tipo: 'EMBALAGEM', unidade: 'UN' } : {});
      ids['Desativado antigo'] = await legado(l, 'Presunto antigo', { ativo: false });
      const loja = await l.loja.create({ data: { parceiroId: L.id, nome: 'Loja L', slug: `loja-l-${sufixo}` } });
      await l.saldoEstoque.create({ data: { parceiroId: L.id, lojaId: loja.id, insumoId: ids['Blend bovino 180 g'], quantidadeMilesimos: 5000, valorCentavos: 25000 } });
      await l.saldoEstoque.create({ data: { parceiroId: L.id, lojaId: loja.id, insumoId: ids['Xpto 3000'], quantidadeMilesimos: 2000, valorCentavos: 4000 } });
      const antes = { insumos: await retratoSemCategoria(l), categorias: await l.categoriaInsumo.count(), historico: await l.historicoAlteracao.count() };
      const p = await previaDaClassificacao(l, ALCANCE_FLOWFOODS);
      expect(p.total).toBe(11);
      expect(p.semCategoriasNaCasa).toBe(true);
      const destino = Object.fromEntries(p.linhas.map((x) => [x.nome, x.chave]));
      expect(destino).toMatchObject({
        'Blend bovino 180 g': 'PROTEINA',
        'Pão brioche': 'PANIFICACAO',
        'Queijo cheddar fatiado': 'LATICINIOS',
        'Cebola roxa': 'HORTIFRUTI',
        'Molho especial': 'MERCEARIA',
        'Detergente neutro': 'LIMPEZA',
        'Coca-Cola lata': 'BEBIDAS',
        'Caixa kraft': 'DESCARTAVEIS',
        'Xpto 3000': 'OUTROS',
        'Combo hambúrguer e pão': 'OUTROS',
      });
      expect(p.paraRevisar).toBe(2);
      expect(p.linhas.find((x) => x.nome === 'Xpto 3000')!.motivo).toMatch(/Sem palavra conhecida/);
      expect(p.linhas.find((x) => x.nome === 'Combo hambúrguer e pão')!.motivo).toMatch(/Ambíguo.*Proteína.*Panificação/);
      expect(p.linhas.find((x) => x.nome === 'Blend bovino 180 g')!.valorCentavos).toBe(25000);
      // Nada foi gravado.
      expect(await retratoSemCategoria(l)).toBe(antes.insumos);
      expect(await l.categoriaInsumo.count()).toBe(antes.categorias);
      expect(await l.historicoAlteracao.count()).toBe(antes.historico);
      expect(await l.insumo.count({ where: { categoriaId: { not: null } } })).toBe(0);
    });

    it('contagem e valor sem categoria visíveis (e o valor só para quem vê o estoque)', async () => {
      const l = doParceiro(L.id, db);
      const r = await resumoDoQueFalta(l, ALCANCE_FLOWFOODS);
      expect(r).toMatchObject({ semCategoria: 10, emOutros: 0, total: 10, valorCentavos: 29000 });
      const semEstoque = resolverAlcance({ perfilBase: null, perfilProprio: ['insumos.ver', 'insumos.editar'], permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
      expect((await resumoDoQueFalta(l, semEstoque)).valorCentavos).toBeNull();
    });

    it('aplicar: só onde não há categoria, um registro antes/depois por insumo, ambíguos em Outros com o motivo; nada além da categoria muda', async () => {
      const l = doParceiro(L.id, db);
      const antes = await retratoSemCategoria(l);
      const contagens = async () => ({ saldos: await l.saldoEstoque.count(), movimentos: await l.movimentoEstoque.count(), fichas: await l.fichaTecnica.count(), notas: await l.notaEntrada.count() });
      const c0 = await contagens();
      const r = await aplicarClassificacao(l, 'Marina');
      expect(r.classificados).toBe(11);
      expect(r.emOutros).toBe(2);
      expect(r.lote).toMatch(/^lote-\d{8}-\d{4}-[0-9a-f]{4}$/);
      // Nome, tipo, unidade, preço, frete, conservação, validade e situação: idênticos. Ids também.
      expect(await retratoSemCategoria(l)).toBe(antes);
      expect(await contagens()).toEqual(c0);
      expect(await l.insumo.count({ where: { categoriaId: null } })).toBe(0);
      const cs = await listarCategorias(l);
      expect(cs).toHaveLength(10);
      const porChave = Object.fromEntries(cs.map((c) => [c.chave!, c]));
      expect(porChave.PROTEINA.nInsumos).toBe(1);
      expect(porChave.OUTROS.nInsumos).toBe(2);
      // Um CLASSIFICOU por insumo, com antes (sem categoria) e depois, e o lote.
      const hs = (await listarHistorico(l, { entidade: 'Insumo', verPrecos: true, limite: 100 })).filter((h) => h.acao === 'CLASSIFICOU');
      expect(hs).toHaveLength(11);
      const cheddar = hs.find((h) => h.alvo === 'Queijo cheddar fatiado')!;
      expect(cheddar.mudancas.find((m) => m.campo === 'categoria')).toMatchObject({ antes: '—', depois: 'Laticínios, frios e embutidos' });
      expect(cheddar.mudancas.find((m) => m.campo === 'como foi classificada')?.depois).toBe('classificação assistida');
      expect(cheddar.motivo).toMatch(/Classificação assistida/);
      const xpto = hs.find((h) => h.alvo === 'Xpto 3000')!;
      expect(xpto.motivo).toMatch(/Sem palavra conhecida/);
      const ins = await l.insumo.findUniqueOrThrow({ where: { id: ids['Xpto 3000'] }, select: { categoriaId: true, classificadoPor: true, classificacaoLote: true, classificacaoMotivo: true } });
      expect(ins).toMatchObject({ categoriaId: porChave.OUTROS.id, classificadoPor: 'MIGRACAO', classificacaoLote: r.lote, classificacaoMotivo: expect.stringMatching(/Sem palavra/) });
      expect(await lotesDeClassificacao(l)).toEqual([expect.objectContaining({ lote: r.lote, nInsumos: 11 })]);
      ids.lote = r.lote!;
    });

    it('aplicar de novo muda 0 (idempotente); a prévia fica vazia e nenhum registro novo nasce', async () => {
      const l = doParceiro(L.id, db);
      const historico = await l.historicoAlteracao.count();
      const retrato = await retratoSemCategoria(l);
      expect(await aplicarClassificacao(l, 'Marina')).toEqual({ lote: null, classificados: 0, emOutros: 0 });
      expect(await aplicarClassificacao(l, 'Marina')).toMatchObject({ classificados: 0 });
      expect((await previaDaClassificacao(l, ALCANCE_FLOWFOODS)).total).toBe(0);
      expect(await l.historicoAlteracao.count()).toBe(historico);
      expect(await retratoSemCategoria(l)).toBe(retrato);
    });

    it('a fila de revisão traz os de Outros (com o motivo e a sugestão) e o valor; a edição em lote classifica com registro, tira do lote e recusa o que não vale', async () => {
      const l = doParceiro(L.id, db);
      const fila = await filaDeRevisao(l, ALCANCE_FLOWFOODS);
      expect(fila.total).toBe(2);
      expect(fila.linhas.map((x) => x.nome)).toEqual(['Combo hambúrguer e pão', 'Xpto 3000']);
      expect(fila.linhas.find((x) => x.nome === 'Xpto 3000')).toMatchObject({ categoria: 'Outros / a classificar', motivo: expect.stringMatching(/Sem palavra/), valorCentavos: 4000, sugestao: { ambigua: true } });
      // Classifica o Xpto em Mercearias (por uma pessoa) e o combo em Proteína.
      const cs = Object.fromEntries((await listarCategorias(l)).map((c) => [c.chave!, c.id]));
      expect(await classificarEmLote(l, [ids['Xpto 3000'], ids['Combo hambúrguer e pão']], cs.MERCEARIA, 'Gil')).toEqual({ ok: true, classificados: 2, iguais: 0, naoEncontrados: 0 });
      expect(await classificarEmLote(l, [ids['Combo hambúrguer e pão']], cs.PROTEINA, 'Gil')).toMatchObject({ ok: true, classificados: 1 });
      const xpto = await l.insumo.findUniqueOrThrow({ where: { id: ids['Xpto 3000'] }, select: { categoriaId: true, classificadoPor: true, classificacaoLote: true, classificacaoMotivo: true } });
      expect(xpto).toEqual({ categoriaId: cs.MERCEARIA, classificadoPor: 'MANUAL', classificacaoLote: null, classificacaoMotivo: null });
      const [h] = await listarHistorico(l, { de: [{ entidade: 'Insumo', ids: [ids['Xpto 3000']] }], verPrecos: true, limite: 1 });
      expect(h).toMatchObject({ acao: 'RECLASSIFICOU', autorNome: 'Gil', motivo: 'Revisão em lote' });
      expect(h.mudancas.find((m) => m.campo === 'categoria')).toMatchObject({ antes: 'Outros / a classificar', depois: 'Mercearias e secos' });
      expect((await filaDeRevisao(l, ALCANCE_FLOWFOODS)).total).toBe(0);
      // O que a edição em lote recusa: nada marcado, sem categoria, categoria que não existe, mais de 200, ids de outro parceiro, mesma categoria.
      expect(await classificarEmLote(l, [], cs.PROTEINA, 'Gil')).toMatchObject({ ok: false, erro: expect.stringMatching(/Marque/) });
      expect(await classificarEmLote(l, [ids['Pão brioche']], '', 'Gil')).toMatchObject({ ok: false, erro: expect.stringMatching(/Escolha a categoria/) });
      expect(await classificarEmLote(l, [ids['Pão brioche']], 'fantasma', 'Gil')).toMatchObject({ ok: false, erro: expect.stringMatching(/não existe/) });
      expect(await classificarEmLote(l, Array.from({ length: 201 }, (_, i) => `id${i}`), cs.PROTEINA, 'Gil')).toMatchObject({ ok: false, erro: expect.stringMatching(/até 200/) });
      expect(await classificarEmLote(l, [ids['Pão brioche']], cs.PANIFICACAO, 'Gil')).toEqual({ ok: true, classificados: 0, iguais: 1, naoEncontrados: 0 });
      expect(await classificarEmLote(l, [(await a.insumo.findFirstOrThrow({ select: { id: true } })).id], cs.PROTEINA, 'Gil')).toEqual({ ok: true, classificados: 0, iguais: 0, naoEncontrados: 1 });
      // Categoria desativada não recebe lote.
      const t = await criarCategoria(l, { nome: 'Desativada L' }, 'x');
      if (!t.ok) throw new Error('t');
      await mudarSituacaoCategoria(l, t.id, false, null, 'x');
      expect(await classificarEmLote(l, [ids['Pão brioche']], t.id, 'Gil')).toMatchObject({ ok: false, erro: expect.stringMatching(/desativada/) });
    });

    it('reverter: volta a "sem categoria" só os intocados do lote; os que uma pessoa mexeu depois ficam; o lote de outro parceiro ou inventado não existe', async () => {
      const l = doParceiro(L.id, db);
      const retrato = await retratoSemCategoria(l);
      expect(await reverterLote(l, 'lote-inventado-0000', 'Marina')).toMatchObject({ ok: false });
      expect(await reverterLote(l, "lote-x'; DROP TABLE", 'Marina')).toMatchObject({ ok: false, erro: 'Lote inválido.' });
      expect(await reverterLote(b, ids.lote, 'Bia')).toMatchObject({ ok: false });
      const r = await reverterLote(l, ids.lote, 'Marina');
      // 11 no lote; 2 foram reclassificados à mão (Xpto e o combo): ficam como estão.
      expect(r).toEqual({ ok: true, voltaram: 9, mantidos: 2 });
      expect(await retratoSemCategoria(l)).toBe(retrato);
      expect(await l.insumo.count({ where: { categoriaId: null } })).toBe(9);
      const cs = Object.fromEntries((await listarCategorias(l)).map((c) => [c.chave!, c.id]));
      expect(await l.insumo.findUniqueOrThrow({ where: { id: ids['Xpto 3000'] }, select: { categoriaId: true } })).toEqual({ categoriaId: cs.MERCEARIA });
      expect(await l.insumo.findUniqueOrThrow({ where: { id: ids['Blend bovino 180 g'] }, select: { categoriaId: true, classificadoPor: true, classificacaoLote: true, classificadoEm: true } })).toEqual({ categoriaId: null, classificadoPor: null, classificacaoLote: null, classificadoEm: null });
      const rev = (await listarHistorico(l, { entidade: 'Insumo', verPrecos: true, limite: 100 })).filter((h) => h.motivo?.startsWith('Reversão'));
      expect(rev).toHaveLength(9);
      expect(rev[0].acao).toBe('RECLASSIFICOU');
      // Desfazer de novo não muda nada.
      expect(await reverterLote(l, ids.lote, 'Marina')).toEqual({ ok: true, voltaram: 0, mantidos: 11 });
      expect(await lotesDeClassificacao(l)).toEqual([]);
      // E dá para aplicar de novo (um lote novo) só nos 9 que voltaram.
      const outra = await aplicarClassificacao(l, 'Marina', new Date(Date.now() + 120_000));
      expect(outra.classificados).toBe(9);
      expect(outra.lote).not.toBe(ids.lote);
    });

    it('o insumo que uma pessoa salvou depois (mesmo sem trocar a categoria) sai do lote: desfazer não tira a categoria dele', async () => {
      const l = doParceiro(L.id, db);
      const lote = (await lotesDeClassificacao(l))[0].lote;
      const d = (await obterInsumo(l, ids['Cebola roxa'], ALCANCE_FLOWFOODS))!;
      expect(await l.insumo.findUniqueOrThrow({ where: { id: ids['Cebola roxa'] }, select: { classificacaoLote: true } })).toEqual({ classificacaoLote: lote });
      // Salva só o preço, a categoria é a mesma.
      expect(await editarInsumo(l, ids['Cebola roxa'], { ...farinha, nome: 'Cebola roxa', categoriaId: d.categoria!.id, preco: '33,00', versao: d.versao }, 'Marina')).toMatchObject({ ok: true });
      const depois = await l.insumo.findUniqueOrThrow({ where: { id: ids['Cebola roxa'] }, select: { categoriaId: true, classificacaoLote: true, classificadoPor: true } });
      expect(depois).toEqual({ categoriaId: d.categoria!.id, classificacaoLote: null, classificadoPor: 'MIGRACAO' });
      const r = await reverterLote(l, lote, 'Marina');
      expect(r.ok && r.mantidos).toBeGreaterThanOrEqual(1);
      expect((await l.insumo.findUniqueOrThrow({ where: { id: ids['Cebola roxa'] }, select: { categoriaId: true } })).categoriaId).toBe(d.categoria!.id);
      expect(await l.insumo.count({ where: { categoriaId: null } })).toBe(8);
    });

    it('"Classificar os N" fica preso à prévia mostrada: se algo mudou desde então, nada é gravado e a prévia é refeita', async () => {
      const l = doParceiro(L.id, db);
      const vista = await previaDaClassificacao(l, ALCANCE_FLOWFOODS);
      expect(vista.total).toBe(8);
      expect(vista.assinatura).toMatch(/^[0-9a-f]{32}$/);
      // Mesmo estado, mesma assinatura.
      expect((await previaDaClassificacao(l, ALCANCE_FLOWFOODS)).assinatura).toBe(vista.assinatura);
      // Entre a prévia e o clique, alguém cadastra um insumo antigo (sem categoria).
      await legado(l, 'Tomate italiano');
      const preso = await aplicarClassificacao(l, 'Marina', new Date(), vista.assinatura);
      expect(preso).toMatchObject({ lote: null, classificados: 0, previaMudou: true });
      expect(await l.insumo.count({ where: { categoriaId: null } })).toBe(9);
      // A prévia nova tem outra assinatura e, com ela, aplica.
      const nova = await previaDaClassificacao(l, ALCANCE_FLOWFOODS);
      expect(nova.assinatura).not.toBe(vista.assinatura);
      const feito = await aplicarClassificacao(l, 'Marina', new Date(Date.now() + 240_000), nova.assinatura);
      expect(feito.previaMudou).toBeUndefined();
      expect(feito.classificados).toBe(9);
      expect(await l.insumo.count({ where: { categoriaId: null } })).toBe(0);
    });

    it('aceitar a sugestão dos marcados: classifica pelo nome o que o nome decide e deixa na fila o que não decide', async () => {
      const l = doParceiro(L.id, db);
      const alface = await legado(l, 'Alface crespa');
      const zz = await legado(l, 'Zzz 99');
      const r = await aceitarSugestoes(l, [alface, zz, alface], 'Marina');
      expect(r).toEqual({ ok: true, classificados: 1, iguais: 0, semSugestao: 1, naoEncontrados: 0 });
      const cs = Object.fromEntries((await listarCategorias(l)).map((c) => [c.chave!, c.id]));
      expect(await l.insumo.findUniqueOrThrow({ where: { id: alface }, select: { categoriaId: true, classificadoPor: true, classificacaoLote: true } })).toEqual({ categoriaId: cs.HORTIFRUTI, classificadoPor: 'SUGESTAO', classificacaoLote: null });
      expect((await l.insumo.findUniqueOrThrow({ where: { id: zz }, select: { categoriaId: true } })).categoriaId).toBeNull();
      const [h] = await listarHistorico(l, { de: [{ entidade: 'Insumo', ids: [alface] }], verPrecos: true });
      expect(h).toMatchObject({ acao: 'CLASSIFICOU', motivo: 'Sugestão pelo nome aceita em lote' });
      // De novo: já está nela.
      expect(await aceitarSugestoes(l, [alface], 'Marina')).toMatchObject({ ok: true, classificados: 0, iguais: 1 });
      expect(await aceitarSugestoes(l, [], 'Marina')).toMatchObject({ ok: false });
      expect(await aceitarSugestoes(b, [alface], 'Bia')).toMatchObject({ ok: true, classificados: 0, naoEncontrados: 1 });
    });
  });

  // ---------------------------------------------------------------- as actions

  describe('as actions de verdade, por perfil', () => {
    it('operador e gerente NÃO gerem categorias nem aplicam a classificação (o servidor recusa); o dono sim; o gerente classifica em lote', async () => {
      const antes = await a.categoriaInsumo.count();
      for (const quem of ['OPERADOR', 'GERENTE'] as const) {
        atual.ctx = () => ctxDe(A, quem);
        const r = await daSessao.acaoCriarCategoria(null, form({ nome: `Pirata ${quem}` }));
        expect(r, quem).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/gerir categorias de insumos/) } });
        expect(await daSessao.acaoRenomearCategoria(cat.MERCEARIA, null, form({ nome: 'X', versao: new Date().toISOString() }))).toMatchObject({ ok: false });
        expect(await daSessao.acaoExcluirCategoria(cat.SOBREMESAS, null)).toMatchObject({ ok: false });
        expect(await rodar(daSessao.acaoAplicarClassificacao(form({})))).toEqual({ destino: '/erp/insumos/classificar?feito=recusado' });
        expect(await rodar(daSessao.acaoReverterLote(form({ lote: 'lote-qualquer-1234' })))).toEqual({ destino: '/erp/insumos/classificar?feito=recusado' });
      }
      expect(await a.categoriaInsumo.count()).toBe(antes);
      // O gerente classifica insumos (é insumos.editar); o operador não.
      const id = await legado(a, 'Item do gerente');
      atual.ctx = () => ctxDe(A, 'OPERADOR');
      expect(await daSessao.acaoClassificarEmLote(null, form({ ids: [id], categoriaId: cat.MERCEARIA }))).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/cadastrar e editar insumos/) } });
      atual.ctx = () => ctxDe(A, 'GERENTE');
      const ok = await rodar(daSessao.acaoClassificarEmLote(null, form({ ids: [id], categoriaId: cat.MERCEARIA })));
      expect(ok).toEqual({ destino: '/erp/insumos/classificar?feito=lote&n=1&iguais=0' });
      // O dono cria, renomeia (com a versão lida), move, desativa e exclui pelas mesmas actions.
      atual.ctx = () => ctxDe(A, 'DONO');
      expect(await rodar(daSessao.acaoCriarCategoria(null, form({ nome: 'Doces finos' })))).toMatchObject({ destino: expect.stringMatching(/^\/erp\/insumos\/categorias\?feito=criada&cat=/) });
      const doces = (await listarCategorias(a)).find((c) => c.nome === 'Doces finos')!;
      expect(await rodar(daSessao.acaoRenomearCategoria(doces.id, null, form({ nome: 'Doces', versao: doces.versao })))).toMatchObject({ destino: expect.stringContaining('feito=renomeada') });
      expect(await rodar(daSessao.acaoMoverCategoria(doces.id, 'subir'))).toMatchObject({ destino: expect.stringContaining('feito=moveu') });
      expect(await rodar(daSessao.acaoSituacaoCategoria(doces.id, null, form({ ativo: 'nao', motivo: 'teste' })))).toMatchObject({ destino: expect.stringContaining('feito=desativada') });
      expect(await rodar(daSessao.acaoExcluirCategoria(doces.id, null))).toEqual({ destino: '/erp/insumos/categorias?feito=excluida' });
      expect(await a.categoriaInsumo.count()).toBe(antes);
    });

    it('F4 · pelo painel da lista: cada ação volta para a lista como estava, com o painel aberto; "Alterar categoria" dos marcados volta com o aviso', async () => {
      atual.ctx = () => ctxDe(A, 'DONO');
      const naLista = 'q=item&categoria=lixo&pagina=2&estranho=1';
      const criada = await rodar(daSessao.acaoCriarCategoria(null, form({ nome: 'Do painel', naLista })));
      // só os filtros que a lista conhece sobrevivem (o resto cai), e o painel volta aberto
      expect(criada).toMatchObject({ destino: expect.stringMatching(/^\/erp\/insumos\?q=item.*pagina=2&painel=categorias&feito=criada&cat=/) });
      expect((criada as { destino: string }).destino).not.toContain('estranho');
      const doPainel = (await listarCategorias(a)).find((c) => c.nome === 'Do painel')!;
      expect(await rodar(daSessao.acaoMoverCategoria(doPainel.id, 'subir', form({ naLista: '' })))).toMatchObject({ destino: expect.stringMatching(/^\/erp\/insumos\?painel=categorias&feito=moveu/) });
      expect(await rodar(daSessao.acaoExcluirCategoria(doPainel.id, null, form({ naLista: 'q=item' })))).toEqual({ destino: '/erp/insumos?q=item&painel=categorias&feito=excluida' });
      // sem o campo, continua indo para a tela de Categorias
      const outra = await rodar(daSessao.acaoCriarCategoria(null, form({ nome: 'Fora do painel' })));
      expect(outra).toMatchObject({ destino: expect.stringMatching(/^\/erp\/insumos\/categorias\?feito=criada/) });
      const fora = (await listarCategorias(a)).find((c) => c.nome === 'Fora do painel')!;
      await excluirCategoria(a, fora.id, 'Marina');

      // marcados na lista → outra categoria: o operador não pode; o gerente pode; volta com quantos e qual
      const x1 = await legado(a, 'Marcado um');
      const x2 = await legado(a, 'Marcado dois');
      atual.ctx = () => ctxDe(A, 'OPERADOR');
      expect(await daSessao.acaoAlterarCategoriaNaLista(null, form({ ids: [x1, x2], categoriaId: cat.MERCEARIA, de: 'q=marcado' }))).toMatchObject({ ok: false });
      atual.ctx = () => ctxDe(A, 'GERENTE');
      expect(await daSessao.acaoAlterarCategoriaNaLista(null, form({ ids: [x1, x2], categoriaId: '', de: '' }))).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/Escolha a categoria/) } });
      expect(await rodar(daSessao.acaoAlterarCategoriaNaLista(null, form({ ids: [x1, x2, x1], categoriaId: cat.MERCEARIA, de: 'q=marcado' })))).toEqual({
        destino: `/erp/insumos?q=marcado&feito=categorias&n=2&cat=${cat.MERCEARIA}`,
      });
      const lidos = await a.insumo.findMany({ where: { id: { in: [x1, x2] } }, select: { categoriaId: true, classificadoPor: true } });
      expect(lidos.every((i) => i.categoriaId === cat.MERCEARIA && i.classificadoPor === 'MANUAL')).toBe(true);
      // de novo: nada muda, e o aviso diz isso (n=0)
      expect(await rodar(daSessao.acaoAlterarCategoriaNaLista(null, form({ ids: [x1], categoriaId: cat.MERCEARIA, de: '' })))).toEqual({ destino: `/erp/insumos?feito=categorias&n=0&cat=${cat.MERCEARIA}` });
      // B não muda os de A (o id não é achado no portão de B)
      atual.ctx = () => ctxDe(B, 'DONO');
      const catB = (await listarCategorias(b)).find((c) => c.ativa && !c.sistema)!.id;
      expect(await rodar(doNivel1.acaoAlterarCategoriaNaLista(B.slug, null, form({ ids: [x1], categoriaId: catB, de: '' })))).toMatchObject({ destino: expect.stringContaining('n=0') });
      expect((await a.insumo.findUnique({ where: { id: x1 }, select: { categoriaId: true } }))!.categoriaId).toBe(cat.MERCEARIA);
    });

    it('o nível 1 faz o mesmo no parceiro do slug, com rastro no auditLog; categoria de outro parceiro não é alcançada', async () => {
      atual.ctx = () => ctxDe(A, 'DONO');
      atual.auditoria.length = 0;
      const base = `/rodolfo/erp/${A.slug}/insumos`;
      expect(await rodar(doNivel1.acaoCriarCategoria(A.slug, null, form({ nome: 'Embalagens especiais' })))).toMatchObject({ destino: expect.stringContaining(`${base}/categorias?feito=criada`) });
      const e = (await listarCategorias(a)).find((c) => c.nome === 'Embalagens especiais')!;
      expect(await rodar(doNivel1.acaoExcluirCategoria(A.slug, e.id, null))).toEqual({ destino: `${base}/categorias?feito=excluida` });
      expect(atual.auditoria).toHaveLength(2);
      // Pelo slug de B, a categoria de A não existe.
      atual.ctx = () => ctxDe(B, 'DONO');
      expect(await doNivel1.acaoExcluirCategoria(B.slug, cat.MERCEARIA, null)).toMatchObject({ ok: false, erros: { geral: 'Categoria não encontrada.' } });
      expect(await a.categoriaInsumo.count({ where: { id: cat.MERCEARIA } })).toBe(1);
    });

    it('cadastrar pela action: a categoria vai junto; sem ela volta no campo; o reenvio vai ao mesmo insumo com a frase de "repetido"', async () => {
      atual.ctx = () => ctxDe(A, 'DONO');
      const sem = await daSessao.acaoCadastrarInsumo(null, form({ ...farinha, nome: 'Pela action sem categoria' }));
      expect(sem).toMatchObject({ ok: false, erros: { categoriaId: expect.stringMatching(/Escolha a categoria/) } });
      const campos = { ...farinha, nome: 'Pela action', categoriaId: cat.MERCEARIA, envio: 'envio-action-0001' };
      const primeira = await rodar(daSessao.acaoCadastrarInsumo(null, form(campos)));
      expect(primeira).toMatchObject({ destino: expect.stringMatching(/^\/erp\/insumos\/\w+\?feito=criado$/) });
      const segunda = await rodar(daSessao.acaoCadastrarInsumo(null, form(campos)));
      expect(segunda).toMatchObject({ destino: expect.stringMatching(/^\/erp\/insumos\/\w+\?feito=criado-repetido$/) });
      expect((primeira as { destino: string }).destino.split('?')[0]).toBe((segunda as { destino: string }).destino.split('?')[0]);
      expect(await a.insumo.count({ where: { nome: 'Pela action' } })).toBe(1);
    });
  });

  // ---------------------------------------------------------------- o banco

  it('o banco recusa por fora: classificação sem categoria, motivo gigante, lote que não é da migração, chave sem impressão, categoria de outro parceiro', async () => {
    const id = await legado(a, 'Para o banco');
    const tentar = (set: string, ...v: unknown[]) => cru(db, perfil, A.id, `UPDATE "Insumo" SET ${set} WHERE "id" = $1`, id, ...v);
    await expect(tentar(`"classificadoPor" = 'MANUAL'`)).rejects.toThrow(/Insumo_classificacao_so_com_categoria/);
    await expect(tentar(`"categoriaId" = $2, "classificadoPor" = 'ALGUEM'`, cat.MERCEARIA)).rejects.toThrow(/Insumo_classificadoPor_valido/);
    await expect(tentar(`"categoriaId" = $2, "classificadoPor" = 'MANUAL', "classificacaoLote" = 'lote-1'`, cat.MERCEARIA)).rejects.toThrow(/Insumo_classificacaoLote_da_migracao/);
    await expect(tentar(`"categoriaId" = $2, "classificadoPor" = 'MANUAL', "classificacaoMotivo" = $3`, cat.MERCEARIA, 'x'.repeat(201))).rejects.toThrow(/Insumo_classificacaoMotivo_curto/);
    await expect(tentar(`"chaveEnvio" = 'chave-sem-impressao'`)).rejects.toThrow(/Insumo_chaveEnvio_completa/);
    await expect(tentar(`"chaveEnvio" = 'curta', "hashEnvio" = 'h'`)).rejects.toThrow(/Insumo_chaveEnvio_completa/);
    await expect(tentar(`"categoriaId" = $2`, catB.MERCEARIA)).rejects.toThrow(/Insumo_parceiroId_categoriaId_fkey|foreign key/);
    await expect(cru(db, perfil, A.id, `UPDATE "CategoriaInsumo" SET "ordem" = 1000 WHERE "id" = $1`, cat.MERCEARIA)).rejects.toThrow(/CategoriaInsumo_ordem_faixa/);
    await expect(cru(db, perfil, A.id, `UPDATE "CategoriaInsumo" SET "ativa" = false WHERE "id" = $1`, cat.MERCEARIA)).rejects.toThrow(/CategoriaInsumo_desativada_tem_data/);
    // O dono da linha é imutável.
    await expect(cru(db, perfil, A.id, `UPDATE "CategoriaInsumo" SET "parceiroId" = $2 WHERE "id" = $1`, cat.MERCEARIA, B.id)).rejects.toThrow();
  });

  it('a impressão do envio muda com qualquer campo do cadastro (e só com eles)', () => {
    const base = lerFormInsumo({ ...farinha, nome: 'Fubá', categoriaId: 'c1' });
    if (!base.ok) throw new Error('base');
    const h = hashDoEnvio(base.dados);
    expect(hashDoEnvio({ ...base.dados })).toBe(h);
    for (const mudado of [{ nome: 'Fubá fino' }, { unidade: 'L' as const }, { categoriaId: 'c2' }, { precoEmbalagemCentavos: 1 }, { conteudoMilesimos: 1 }, { taxaEntregaCentavos: 7 }]) {
      expect(hashDoEnvio({ ...base.dados, ...mudado }), JSON.stringify(mudado)).not.toBe(h);
    }
    // O nome da categoria no retrato não entra: renomear a categoria não invalida um reenvio.
    expect(hashDoEnvio({ ...base.dados, categoriaNome: 'Outro nome' })).toBe(h);
  });
});
