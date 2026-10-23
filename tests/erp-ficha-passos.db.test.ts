/**
 * ERP N.4 · modo de preparo em ETAPAS numeradas (Postgres real e regra pura):
 * - etapas gravadas na ordem, etapa em branco descartada, limite de etapas e de tamanho, com a frase;
 * - reordenar é mudança (histórico "modo de preparo em etapas" com antes e depois numerados);
 * - ficha antiga: o texto corrido continua INTEIRO e intocado; gravar etapas não o apaga nem divide;
 * - importar planilha por cima não apaga as etapas (a planilha não traz etapas);
 * - o banco recusa mais de 40 etapas (CHECK) mesmo sem passar pela regra.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-ficha-passos.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarInsumoDeTeste as cadastrarInsumo, cru, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';
import { cadastrarFicha, editarFicha, obterFicha } from '@/lib/erp/fichas';
import { importarFichas } from '@/lib/erp/ficha-importar';
import { LIMITES_DA_FICHA, lerFormFicha, passosEmTexto } from '@/lib/erp/ficha-campos';
import { listarHistorico } from '@/lib/erp/historico';

const URL_TESTE = process.env.ERP_DB_TESTE;
const sp = (t: unknown) => String(t).replace(/\s/g, ' ');

describe('N.4 · etapas do preparo (regra pura)', () => {
  const base = { nome: 'X', tipo: 'PRATO', rendimento: '1', itens: [] };
  it('limpa espaço, descarta etapa em branco e mantém a ordem; a quebra de linha dentro da etapa fica', () => {
    const r = lerFormFicha({ ...base, passos: ['  Selar   o blend. ', '', '   ', 'Montar:\npão e blend.'] }, new Map());
    // Sem itens dá erro de itens, mas as etapas já se leem igual: conferimos pelo erro ausente.
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.erros).filter((k) => k.startsWith('passo'))).toEqual([]);
    expect(passosEmTexto(['Selar o blend.', 'Montar.'])).toBe('1. Selar o blend.\n2. Montar.');
    expect(passosEmTexto([])).toBeNull();
  });
  it('mais de 40 etapas e etapa longa demais viram frase, com o número da etapa', () => {
    const muitas = Array.from({ length: LIMITES_DA_FICHA.passos + 1 }, (_, i) => `Etapa ${i}`);
    const r = lerFormFicha({ ...base, passos: muitas }, new Map());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.passos).toMatch(/Até 40 etapas/);
    const longa = lerFormFicha({ ...base, passos: ['ok', 'x'.repeat(LIMITES_DA_FICHA.passo + 1)] }, new Map());
    if (!longa.ok) expect(longa.erros['passo-1']).toMatch(/Etapa 2 longa demais/);
  });
});

describe.skipIf(!URL_TESTE)('N.4 · etapas do preparo (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `e${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let P: { id: string };
  let a: ClienteDoParceiro;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    P = await db.parceiroFlow.create({ data: { nome: 'Etapas (N.4)', slug: `etapas-${sufixo}`, status: 'ATIVO' } });
    a = doParceiro(P.id, db);
    const pao = await cadastrarInsumo(a, { escala: 'base', tipo: 'INGREDIENTE', nome: 'Pão', unidade: 'UN', conteudo: '10', preco: '10,00' });
    if (!pao.ok) throw new Error(JSON.stringify(pao));
    ids.pao = pao.id;
  });

  afterAll(async () => {
    if (db) {
      await limparParceiros(db, perfil, [P.id]);
      await db.$disconnect();
    }
  });

  const itens = () => [{ insumoId: ids.pao, quantidade: '1', unidade: 'un' }];

  it('cria com as etapas na ordem; em branco não entra; o histórico guarda numerado', async () => {
    const r = await cadastrarFicha(a, { nome: 'Burger', tipo: 'PRATO', rendimento: '1', itens: itens(), passos: ['Selar o blend.', '', 'Montar.'] }, { tipo: 'manter' }, 'Marina');
    if (!r.ok) throw new Error(JSON.stringify(r));
    ids.burger = r.id;
    const f = (await obterFicha(a, r.id))!;
    expect(f.passosPreparo).toEqual(['Selar o blend.', 'Montar.']);
    expect(f.modoPreparo).toBeNull();
    const h = await listarHistorico(a, { de: [{ entidade: 'FichaTecnica', ids: [r.id] }], limite: 1, verPrecos: false });
    expect(h[0].mudancas.find((m) => m.campo === 'modo de preparo em etapas')?.depois).toBe('1. Selar o blend.\n2. Montar.');
  });

  it('trocar a ordem é mudança, com antes e depois numerados; a versão lida protege de duas abas', async () => {
    const f = (await obterFicha(a, ids.burger))!;
    const versao = f.versao;
    const r = await editarFicha(a, ids.burger, { nome: 'Burger', tipo: 'PRATO', rendimento: '1', itens: itens(), passos: ['Montar.', 'Selar o blend.'], versao }, { tipo: 'manter' }, 'Marina');
    expect(r).toMatchObject({ ok: true });
    const h = await listarHistorico(a, { de: [{ entidade: 'FichaTecnica', ids: [ids.burger] }], limite: 1, verPrecos: false });
    const m = h[0].mudancas.find((x) => x.campo === 'modo de preparo em etapas')!;
    expect(sp(m.antes)).toBe('1. Selar o blend. 2. Montar.');
    expect(sp(m.depois)).toBe('1. Montar. 2. Selar o blend.');
    // A mesma versão de antes: conflito, nada muda.
    expect(await editarFicha(a, ids.burger, { nome: 'Burger', tipo: 'PRATO', rendimento: '1', itens: itens(), passos: ['Outra'], versao }, { tipo: 'manter' }, 'Marina')).toMatchObject({
      ok: false,
      conflito: true,
    });
    expect((await obterFicha(a, ids.burger))!.passosPreparo).toEqual(['Montar.', 'Selar o blend.']);
  });

  it('ficha antiga: o texto corrido fica inteiro; gravar etapas não o apaga nem divide', async () => {
    const antigo = 'Selar o blend 2 min.\nDerreter o cheddar.\n\nMontar.';
    const r = await cadastrarFicha(a, { nome: 'Antiga', tipo: 'PRATO', rendimento: '1', itens: itens(), modoPreparo: antigo }, { tipo: 'manter' }, 'Marina');
    if (!r.ok) throw new Error(JSON.stringify(r));
    let f = (await obterFicha(a, r.id))!;
    expect(f.passosPreparo).toEqual([]);
    expect(f.modoPreparo).toBe(antigo);
    // A tela manda o texto anterior de volta junto com as etapas que a pessoa escreveu.
    const e = await editarFicha(
      a,
      r.id,
      { nome: 'Antiga', tipo: 'PRATO', rendimento: '1', itens: itens(), modoPreparo: antigo, passos: ['Selar o blend 2 min.'], versao: f.versao },
      { tipo: 'manter' },
      'Marina',
    );
    expect(e).toMatchObject({ ok: true });
    f = (await obterFicha(a, r.id))!;
    expect(f.modoPreparo).toBe(antigo);
    expect(f.passosPreparo).toEqual(['Selar o blend 2 min.']);
  });

  it('importar planilha por cima não apaga as etapas (a planilha não traz etapas)', async () => {
    const planilha = ['ficha;tipo;rende;insumo;quantidade;unidade', 'Burger;prato;1;Pão;2;un'].join('\n');
    const r = await importarFichas(a, planilha, 'Marina');
    expect(r).toMatchObject({ ok: true });
    const f = (await obterFicha(a, ids.burger))!;
    expect(f.passosPreparo).toEqual(['Montar.', 'Selar o blend.']);
  });

  it('o banco recusa mais de 40 etapas mesmo por SQL cru (CHECK)', async () => {
    const muitas = Array.from({ length: 41 }, (_, i) => `e${i}`);
    await expect(cru(db, perfil, P.id, `UPDATE "FichaTecnica" SET "passosPreparo" = $1 WHERE "id" = $2`, muitas, ids.burger)).rejects.toThrow(/passosPreparo_limite/);
  });
});
