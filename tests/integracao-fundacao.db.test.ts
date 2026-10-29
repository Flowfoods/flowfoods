/**
 * INT-1.1 (decisões 481 a 483) — a fundação da Central de Integrações no Postgres de verdade:
 *  - o parceiro A não vê nem mexe nas conexões do B (portão; e, com RLS, nem por SQL cru);
 *  - uma loja do iFood fica ativa num parceiro só, em toda a base; desligada, libera; ligar de novo é linha nova;
 *  - loja de TEST só no parceiro de homologação, e de PRODUCAO nunca nele (gatilho);
 *  - o módulo numa conexão só com app do mesmo ambiente que tem o módulo (gatilho, mesmo furando a regra);
 *  - o ciclo do módulo pela tabela de transições, com histórico, e duas mudanças ao mesmo tempo sem gravar duas;
 *  - identidade da conexão imutável, desligada não volta, CHECKs;
 *  - o papel do tenant não alcança as tabelas globais (apps e token); app não se apaga;
 *  - a liberação de módulos: nasce bloqueado, liberar/bloquear com histórico, repetir não grava, outro parceiro intacto.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/integracao-fundacao.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const URL_TESTE = process.env.ERP_DB_TESTE;

// O cliente do portal (apps globais) aponta para o banco de teste, com a mesma trava do portal.
vi.mock('@/lib/db', async () => {
  const { PrismaClient: P } = await import('@prisma/client');
  const real = await vi.importActual<typeof import('@/lib/db')>('@/lib/db');
  return { prisma: real.travarTenant(new P({ datasources: { db: { url: process.env.ERP_DB_TESTE ?? 'postgresql://sem-banco/x' } } })) };
});

import { prisma } from '@/lib/db';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { moduloLiberado, mudarLiberacao, liberacoesDoParceiro } from '@/lib/erp/liberacao';
import { registrarApp } from '@/lib/integracoes/core/apps';
import { conexoesDoParceiro, desligarConexao, ligarConexao, MENSAGEM_LOJA_EXTERNA_EM_USO, mudarModulo, prepararModulo } from '@/lib/integracoes/core/conexoes';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const AUTOR = { nome: 'Rodolfo (FlowFoods)' };
const uuid = () => globalThis.crypto.randomUUID();

describe.skipIf(!URL_TESTE)('INT-1.1 · fundação da Central de Integrações (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = uuid().slice(0, 8);
  const ids: string[] = [];
  const apps: string[] = [];
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  let h: ClienteDoParceiro;
  let lojaA = '';
  let lojaB = '';
  let lojaH = '';
  let marcaA = '';
  let appTeste = '';
  let appBi = '';

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE! } } });
    perfil = await perfilDoBanco(db);
    const A = await db.parceiroFlow.create({ data: { nome: `Int A ${sufixo}`, slug: `int-a-${sufixo}`, status: 'ATIVO' } });
    const B = await db.parceiroFlow.create({ data: { nome: `Int B ${sufixo}`, slug: `int-b-${sufixo}`, status: 'ATIVO' } });
    const H = await db.parceiroFlow.create({ data: { nome: `Int Homologação ${sufixo}`, slug: `int-h-${sufixo}`, status: 'ATIVO', homologacaoDeIntegracao: true } });
    ids.push(A.id, B.id, H.id);
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    h = doParceiro(H.id, db);
    const loja = async (c: ClienteDoParceiro, nome: string) => {
      const r = await cadastrarLoja(c, { nome }, 'teste');
      if (!r.ok) throw new Error(JSON.stringify(r));
      return r.id;
    };
    lojaA = await loja(a, 'Vila da Penha');
    lojaB = await loja(b, 'Tijuca');
    lojaH = await loja(h, 'Loja de teste');
    marcaA = (await a.marca.create({ data: { parceiroId: A.id, nome: `Burger ${sufixo}` } })).id;
    const t = await registrarApp({ provedor: 'IFOOD', ambiente: 'TEST', nome: 'Teste (C)', categoria: 'TEST', clientId: `teste-${sufixo}`, nomeDoSegredo: 'IFOOD_TEST_CLIENT_SECRET', modulos: ['ANALYTICS'] }, AUTOR.nome);
    const bi = await registrarApp({ provedor: 'IFOOD', ambiente: 'PRODUCAO', nome: 'FlowFoods ERP · BI', categoria: 'BI', clientId: `bi-${sufixo}`, nomeDoSegredo: 'IFOOD_BI_CLIENT_SECRET', modulos: ['ANALYTICS'] }, AUTOR.nome);
    if (!t.ok || !bi.ok) throw new Error('apps de teste não entraram');
    appTeste = t.id;
    appBi = bi.id;
    apps.push(t.id, bi.id);
  });

  afterAll(async () => {
    if (!db) return;
    await limparParceiros(db, perfil, ids);
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`ALTER TABLE "IntegracaoApp" DISABLE TRIGGER "IntegracaoApp_nao_apaga"`);
      await tx.$executeRawUnsafe(`DELETE FROM "IntegracaoApp" WHERE id = ANY($1::text[])`, apps);
      await tx.$executeRawUnsafe(`ALTER TABLE "IntegracaoApp" ENABLE TRIGGER "IntegracaoApp_nao_apaga"`);
    });
    await db.$disconnect();
    await prisma.$disconnect();
  });

  const ligacao = (lojaId: string, idExterno: string, ambiente: 'TEST' | 'PRODUCAO' = 'PRODUCAO', extra: Record<string, unknown> = {}) => ({
    lojaId,
    provedor: 'IFOOD',
    ambiente,
    idExterno,
    nomeExterno: 'Valentin’s Burger - Vila da Penha',
    ...extra,
  });

  it('A liga uma loja do iFood (com marca), com histórico; o B não vê, não acha pelo id e não muda', async () => {
    const m1 = uuid().toUpperCase();
    const r = await ligarConexao(a, ligacao(lojaA, m1, 'PRODUCAO', { marcaId: marcaA, idCurto: '123456' }), AUTOR);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    const doA = await conexoesDoParceiro(a);
    expect(doA.map((c) => [c.id, c.idExterno, c.loja.nome, c.marca?.nome])).toEqual([[r.id, m1.toLowerCase(), 'Vila da Penha', `Burger ${sufixo}`]]);
    const hist = await a.historicoAlteracao.findMany({ where: { entidade: 'IntegracaoConexao', entidadeId: r.id } });
    expect(hist.map((x) => x.acao)).toEqual(['LIGOU']);
    expect(await conexoesDoParceiro(b)).toEqual([]);
    expect(await b.integracaoConexao.findUnique({ where: { id: r.id } })).toBeNull();
    expect((await b.integracaoConexao.updateMany({ where: { id: r.id }, data: { nomeExterno: 'invadido' } })).count).toBe(0);
    expect((await desligarConexao(b, r.id, AUTOR.nome)).ok).toBe(false);
    if (perfil.rls) {
      // Com a RLS, nem SQL cru no contexto do B enxerga a linha do A.
      const n = await b.transacao(async (tx) => tx.sql<{ n: number }>`SELECT count(*)::int AS n FROM "IntegracaoConexao"`);
      expect(n[0].n).toBe(0);
    }
  });

  it('a mesma loja do iFood não fica ativa em dois parceiros; desligada no A, liga no B; ligar de novo no A é recusado', async () => {
    const m2 = uuid();
    const noA = await ligarConexao(a, ligacao(lojaA, m2), AUTOR);
    expect(noA.ok).toBe(true);
    const noB = await ligarConexao(b, ligacao(lojaB, m2), AUTOR);
    expect(!noB.ok && noB.erros.idExterno).toBe(MENSAGEM_LOJA_EXTERNA_EM_USO);
    if (!noA.ok) return;
    expect(await desligarConexao(a, noA.id, AUTOR.nome)).toEqual({ ok: true, mudou: true });
    expect(await desligarConexao(a, noA.id, AUTOR.nome)).toEqual({ ok: true, mudou: false });
    const agoraNoB = await ligarConexao(b, ligacao(lojaB, m2), AUTOR);
    expect(agoraNoB.ok).toBe(true);
    const deNovoNoA = await ligarConexao(a, ligacao(lojaA, m2), AUTOR);
    expect(!deNovoNoA.ok && deNovoNoA.erros.idExterno).toBe(MENSAGEM_LOJA_EXTERNA_EM_USO);
  });

  it('loja de TEST só no parceiro de homologação; de PRODUCAO nunca nele (o banco recusa mesmo furando a regra)', async () => {
    const testNoA = await ligarConexao(a, ligacao(lojaA, uuid(), 'TEST'), AUTOR);
    expect(!testNoA.ok && testNoA.erros.ambiente).toMatch(/parceiro de homologação/);
    const prodNoH = await ligarConexao(h, ligacao(lojaH, uuid(), 'PRODUCAO'), AUTOR);
    expect(!prodNoH.ok && prodNoH.erros.ambiente).toMatch(/parceiro de homologação/);
    // Furando a regra: o gatilho recusa.
    await expect(
      a.integracaoConexao.create({ data: { parceiroId: ids[0], lojaId: lojaA, provedor: 'IFOOD', ambiente: 'TEST', idExterno: uuid(), nomeExterno: 'x', criadoPorNome: 'x' } }),
    ).rejects.toThrow(/TEST só no parceiro de homologação/);
    expect((await ligarConexao(h, ligacao(lojaH, uuid(), 'TEST'), AUTOR)).ok).toBe(true);
  });

  it('o módulo: app de outro ambiente ou sem o módulo é recusado (regra e banco); o ciclo pela tabela, com histórico', async () => {
    const lig = await ligarConexao(h, ligacao(lojaH, uuid(), 'TEST'), AUTOR);
    if (!lig.ok) throw new Error('sem conexão TEST');
    const comBi = await prepararModulo(h, lig.id, appBi, 'ANALYTICS', AUTOR.nome);
    expect(!comBi.ok && comBi.erro).toMatch(/não serve a esta loja/);
    await expect(h.integracaoConexaoModulo.create({ data: { parceiroId: ids[2], conexaoId: lig.id, appId: appBi, modulo: 'ANALYTICS', criadoPorNome: 'x' } })).rejects.toThrow(/o app não serve a esta conexão/);
    await expect(h.integracaoConexaoModulo.create({ data: { parceiroId: ids[2], conexaoId: lig.id, appId: appTeste, modulo: 'REVIEW', criadoPorNome: 'x' } })).rejects.toThrow(/sem o módulo REVIEW/);

    const p1 = await prepararModulo(h, lig.id, appTeste, 'ANALYTICS', AUTOR.nome);
    const p2 = await prepararModulo(h, lig.id, appTeste, 'ANALYTICS', AUTOR.nome);
    expect(p1.ok && p1.estado).toBe('NAO_SOLICITADO');
    expect(p2.ok && p1.ok && p2.id === p1.id && !p2.mudou).toBe(true);
    if (!p1.ok) return;
    const id = p1.id;
    expect((await mudarModulo(h, id, 'ativar', AUTOR.nome)).ok).toBe(false);
    expect(await mudarModulo(h, id, 'autorizar', AUTOR.nome)).toMatchObject({ ok: true, estado: 'AUTORIZADO' });
    expect(await mudarModulo(h, id, 'ativar', AUTOR.nome)).toMatchObject({ ok: true, estado: 'ATIVO' });
    const deNovo = await mudarModulo(h, id, 'ativar', AUTOR.nome);
    expect(!deNovo.ok && deNovo.erro).toBe('Este módulo está ativo: não dá para ativar agora.');
    expect(await mudarModulo(h, id, 'erro-permissao', AUTOR.nome)).toMatchObject({ ok: false, erro: 'Diga qual foi o erro de permissão.' });
    // Duas pausas ao mesmo tempo: uma grava, a outra não (conflito ou "não dá").
    const [x, y] = await Promise.all([mudarModulo(h, id, 'pausar', AUTOR.nome), mudarModulo(h, id, 'pausar', AUTOR.nome)]);
    expect([x.ok, y.ok].filter(Boolean)).toHaveLength(1);
    expect(await mudarModulo(h, id, 'retomar', AUTOR.nome)).toMatchObject({ ok: true, estado: 'ATIVO' });
    expect(await mudarModulo(h, id, 'erro-permissao', 'Serviço da integração', { erro: '403 do iFood: a loja não autorizou o app' })).toMatchObject({ ok: true, estado: 'ERRO_PERMISSAO' });
    const linha = await h.integracaoConexaoModulo.findUnique({ where: { id } });
    expect(linha).toMatchObject({ estado: 'ERRO_PERMISSAO', ultimoErro: '403 do iFood: a loja não autorizou o app', ativadoPorNome: AUTOR.nome });
    const hist = await h.historicoAlteracao.findMany({ where: { entidade: 'IntegracaoConexaoModulo', entidadeId: id }, orderBy: { ocorridoEm: 'asc' } });
    expect(hist.map((r) => r.acao)).toEqual(['PREPAROU', 'ALTEROU', 'ATIVOU', 'SUSPENDEU', 'REATIVOU', 'ALTEROU']);
    // CHECK: erro de permissão sem a frase não grava, nem furando a regra.
    await expect(h.integracaoConexaoModulo.update({ where: { id }, data: { ultimoErro: null } })).rejects.toThrow();
  });

  it('identidade da conexão imutável; desligada não volta; desligada sem quando/quem não grava', async () => {
    const lig = await ligarConexao(a, ligacao(lojaA, uuid()), AUTOR);
    if (!lig.ok) throw new Error('sem conexão');
    await expect(a.integracaoConexao.update({ where: { id: lig.id }, data: { idExterno: uuid() } })).rejects.toThrow(/não troca de provedor, ambiente/);
    await expect(a.integracaoConexao.update({ where: { id: lig.id }, data: { estado: 'DESLIGADA' } })).rejects.toThrow();
    expect((await desligarConexao(a, lig.id, AUTOR.nome)).ok).toBe(true);
    await expect(a.integracaoConexao.update({ where: { id: lig.id }, data: { estado: 'ATIVA', desligadaEm: null, desligadaPorNome: null } })).rejects.toThrow(/desligada não volta/);
    // Módulo em conexão desligada não ativa.
    const p = await prepararModulo(a, lig.id, appBi, 'ANALYTICS', AUTOR.nome);
    expect(!p.ok && p.erro).toBe('Esta integração está desligada.');
  });

  it('o papel do tenant não alcança as tabelas globais; o app não se apaga; o banco recusa segredo no lugar do nome', async () => {
    const papel = await db.$queryRaw<{ existe: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') AS existe`;
    if (papel[0].existe) {
      const r = await db.$queryRaw<{ app: boolean; token: boolean }[]>`
        SELECT has_table_privilege('erp_tenant', '"IntegracaoApp"', 'SELECT') AS app, has_table_privilege('erp_tenant', '"IntegracaoToken"', 'SELECT') AS token`;
      expect(r[0]).toEqual({ app: false, token: false });
    }
    await expect(prisma.integracaoApp.delete({ where: { id: appBi } })).rejects.toThrow(/não se apaga/);
    await expect(
      db.$executeRawUnsafe(`INSERT INTO "IntegracaoApp"(id,provedor,ambiente,nome,categoria,"clientId","nomeDoSegredo",modulos,"criadoPorNome","atualizadoEm") VALUES ($1,'IFOOD','PRODUCAO','x','BI',$2,'sk_live_abc123','{ANALYTICS}','x',now())`, `seg-${sufixo}`, `seg-${sufixo}`),
    ).rejects.toThrow(/IntegracaoApp_nome_do_segredo/);
    const repetido = await registrarApp({ provedor: 'IFOOD', ambiente: 'PRODUCAO', nome: 'Outro', categoria: 'BI', clientId: `bi-${sufixo}`, nomeDoSegredo: 'IFOOD_BI_CLIENT_SECRET', modulos: ['ANALYTICS'] }, AUTOR.nome);
    expect(!repetido.ok && repetido.erros.clientId).toMatch(/já está cadastrado/);
  });

  it('a liberação de módulos: nasce bloqueado, liberar e bloquear com histórico, repetir não grava, três cliques juntos gravam um, o B intacto', async () => {
    expect(await moduloLiberado(a, 'integracao')).toBe(false);
    expect(await mudarLiberacao(a, 'integracao', false, AUTOR.nome)).toEqual({ ok: true, mudou: false, liberado: false });
    const juntos = await Promise.all([1, 2, 3].map(() => mudarLiberacao(a, 'integracao', true, AUTOR.nome)));
    expect(juntos.filter((r) => r.ok && r.mudou)).toHaveLength(1);
    expect(await moduloLiberado(a, 'integracao')).toBe(true);
    expect(await moduloLiberado(b, 'integracao')).toBe(false);
    expect(await mudarLiberacao(a, 'integracao', false, AUTOR.nome)).toEqual({ ok: true, mudou: true, liberado: false });
    expect(await moduloLiberado(a, 'integracao')).toBe(false);
    const hist = await a.historicoAlteracao.findMany({ where: { entidade: 'LiberacaoDeModulo' }, orderBy: { ocorridoEm: 'asc' } });
    expect(hist.map((r) => r.acao)).toEqual(['LIBEROU', 'BLOQUEOU']);
    expect((await liberacoesDoParceiro(a)).map((l) => [l.modulo, l.liberado, l.mudadoPorNome])).toEqual([['integracao', false, AUTOR.nome]]);
    expect(await mudarLiberacao(a, 'compras', true, AUTOR.nome)).toEqual({ ok: false, erro: 'Módulo desconhecido.' });
    // Bloquear não apagou conexão nenhuma.
    expect((await conexoesDoParceiro(a)).length).toBeGreaterThan(0);
  });

  // ------------------------------------------------------------ decisão 487 (rodada de correção da revisão independente)

  /** Roda SQL como o papel do tenant no contexto do parceiro (ou como o dono, num banco sem RLS), numa transação só. */
  const comoTenant = (parceiroId: string, f: (tx: { exec: (sql: string, ...v: unknown[]) => Promise<number> }) => Promise<void>) =>
    db.$transaction(async (tx) => {
      if (perfil.rls) await tx.$queryRaw`SELECT set_config('app.parceiro_id', ${parceiroId}, true), set_config('role', 'erp_tenant', true)`;
      await f({ exec: (sql, ...v) => tx.$executeRawUnsafe(sql, ...v) });
    });

  it('487: tabela temporária com o nome de "ParceiroFlow" ou "IntegracaoApp" não engana os gatilhos', async () => {
    // TEST num parceiro real, com um "ParceiroFlow" falso dizendo que ele é de homologação.
    await expect(
      comoTenant(ids[0], async (tx) => {
        await tx.exec(`CREATE TEMP TABLE "ParceiroFlow" (id text, "homologacaoDeIntegracao" boolean) ON COMMIT DROP`);
        await tx.exec(`INSERT INTO "ParceiroFlow" VALUES ($1, true)`, ids[0]);
        await tx.exec(
          `INSERT INTO "IntegracaoConexao"(id,"parceiroId","lojaId",provedor,ambiente,"idExterno","nomeExterno","criadoPorNome","atualizadoEm") VALUES ($1,$2,$3,'IFOOD','TEST',$4,'x','x',now())`,
          `tmp-${sufixo}`,
          ids[0],
          lojaA,
          uuid(),
        );
      }),
    ).rejects.toThrow(/TEST só no parceiro de homologação/);
    // O app BI de produção numa conexão TEST, com um "IntegracaoApp" falso dizendo que ele é de TEST.
    const lig = await ligarConexao(h, ligacao(lojaH, uuid(), 'TEST'), AUTOR);
    if (!lig.ok) throw new Error('sem conexão TEST');
    await expect(
      comoTenant(ids[2], async (tx) => {
        await tx.exec(`CREATE TEMP TABLE "IntegracaoApp" (id text, provedor text, ambiente text, modulos text[], "estadoHomologacao" text) ON COMMIT DROP`);
        await tx.exec(`INSERT INTO "IntegracaoApp" VALUES ($1, 'IFOOD', 'TEST', '{REVIEW}', 'NAO_SE_APLICA')`, appBi);
        await tx.exec(`INSERT INTO "IntegracaoConexaoModulo"(id,"parceiroId","conexaoId","appId",modulo,"criadoPorNome","atualizadoEm") VALUES ($1,$2,$3,$4,'REVIEW','x',now())`, `tmpm-${sufixo}`, ids[2], lig.id, appBi);
      }),
    ).rejects.toThrow(/o app não serve a esta conexão/);
  });

  it('487: SQL cru do outro parceiro não enxerga nenhuma das três tabelas; o tenant não apaga; nas globais, nenhum privilégio', async () => {
    await mudarLiberacao(a, 'integracao', true, AUTOR.nome);
    if (perfil.rls) {
      const n = await b.transacao(async (tx) =>
        tx.sql<{ c: number; m: number; l: number }>`SELECT (SELECT count(*) FROM "IntegracaoConexao" WHERE "parceiroId" <> ${ids[1]})::int AS c, (SELECT count(*) FROM "IntegracaoConexaoModulo" WHERE "parceiroId" <> ${ids[1]})::int AS m, (SELECT count(*) FROM "LiberacaoDeModulo" WHERE "parceiroId" <> ${ids[1]})::int AS l`,
      );
      expect(n[0]).toEqual({ c: 0, m: 0, l: 0 });
      // De outros parceiros, nada; e o A enxerga os dele (o zero acima não é tabela vazia).
      const doA = await a.transacao(async (tx) => tx.sql<{ l: number }>`SELECT count(*)::int AS l FROM "LiberacaoDeModulo"`);
      expect(doA[0].l).toBe(1);
    }
    const papel = await db.$queryRaw<{ existe: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') AS existe`;
    if (papel[0].existe) {
      for (const t of ['IntegracaoConexao', 'IntegracaoConexaoModulo', 'LiberacaoDeModulo']) {
        const r = await db.$queryRaw<{ pode: boolean }[]>`SELECT has_table_privilege('erp_tenant', ${`"${t}"`}, 'DELETE') AS pode`;
        expect(r[0].pode, t).toBe(false);
      }
      for (const t of ['IntegracaoApp', 'IntegracaoToken']) {
        for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
          const r = await db.$queryRaw<{ pode: boolean }[]>`SELECT has_table_privilege('erp_tenant', ${`"${t}"`}, ${p}) AS pode`;
          expect(r[0].pode, `${t} ${p}`).toBe(false);
        }
      }
    }
  });

  it('487: trocar a marca de homologação com conexão ligada não prende a conexão (desligar passa); módulo novo nela é recusado', async () => {
    const H2 = await db.parceiroFlow.create({ data: { nome: `Int H2 ${sufixo}`, slug: `int-h2-${sufixo}`, status: 'ATIVO', homologacaoDeIntegracao: true } });
    ids.push(H2.id);
    const h2 = doParceiro(H2.id, db);
    const l = await cadastrarLoja(h2, { nome: 'Loja H2' }, 'teste');
    if (!l.ok) throw new Error('sem loja');
    const lig = await ligarConexao(h2, ligacao(l.id, uuid(), 'TEST'), AUTOR);
    if (!lig.ok) throw new Error('sem conexão');
    await db.parceiroFlow.update({ where: { id: H2.id }, data: { homologacaoDeIntegracao: false } });
    const p = await prepararModulo(h2, lig.id, appTeste, 'ANALYTICS', AUTOR.nome);
    expect(!p.ok && p.erro).toMatch(/não combina mais com o parceiro/);
    expect(await desligarConexao(h2, lig.id, AUTOR.nome)).toEqual({ ok: true, mudou: true });
  });

  it('487: desligar pausa os módulos ativos; em produção, ativar exige o app homologado (regra e banco); o app não muda de identidade', async () => {
    const lig = await ligarConexao(a, ligacao(lojaA, uuid()), AUTOR);
    if (!lig.ok) throw new Error('sem conexão');
    const m = await prepararModulo(a, lig.id, appBi, 'ANALYTICS', AUTOR.nome);
    if (!m.ok) throw new Error(JSON.stringify(m));
    expect(await mudarModulo(a, m.id, 'solicitar', AUTOR.nome)).toMatchObject({ ok: true, estado: 'SOLICITADO' });
    expect(await mudarModulo(a, m.id, 'autorizar', AUTOR.nome)).toMatchObject({ ok: true, estado: 'AUTORIZADO' });
    // App de produção ainda PENDENTE: a regra recusa; furando a regra, o banco recusa.
    expect(await mudarModulo(a, m.id, 'ativar', AUTOR.nome)).toEqual({ ok: false, erro: 'Em produção, o módulo só ativa depois que o app for homologado pelo iFood.' });
    await expect(a.integracaoConexaoModulo.update({ where: { id: m.id }, data: { estado: 'ATIVO', ativadoEm: new Date(), ativadoPorNome: 'x' } })).rejects.toThrow(/só ativa com o app homologado/);
    await prisma.integracaoApp.update({ where: { id: appBi }, data: { estadoHomologacao: 'HOMOLOGADO' } });
    expect(await mudarModulo(a, m.id, 'ativar', AUTOR.nome)).toMatchObject({ ok: true, estado: 'ATIVO' });
    // Desligar a conexão pausa o módulo ativo, na mesma transação, e conta no histórico.
    expect(await desligarConexao(a, lig.id, AUTOR.nome)).toEqual({ ok: true, mudou: true });
    expect((await a.integracaoConexaoModulo.findUnique({ where: { id: m.id } }))?.estado).toBe('PAUSADO');
    const hist = await a.historicoAlteracao.findFirst({ where: { entidade: 'IntegracaoConexao', entidadeId: lig.id, acao: 'DESLIGOU' } });
    expect(hist?.depois).toMatchObject({ modulosPausados: 1 });
    // Nem furando a regra o módulo volta a ATIVO numa conexão desligada.
    await expect(a.integracaoConexaoModulo.update({ where: { id: m.id }, data: { estado: 'ATIVO' } })).rejects.toThrow(/conexão está desligada/);
    // O app não troca de ambiente, categoria nem Client ID.
    await expect(prisma.integracaoApp.update({ where: { id: appBi }, data: { ambiente: 'TEST', categoria: 'TEST' } })).rejects.toThrow(/não troca de provedor, ambiente, categoria nem Client ID/);
    await expect(prisma.integracaoApp.update({ where: { id: appBi }, data: { clientId: `outro-${sufixo}` } })).rejects.toThrow(/não troca/);
    // O nome do segredo: só IFOOD_<NOME>_CLIENT_SECRET (regra e banco).
    const ruim = await registrarApp({ provedor: 'IFOOD', ambiente: 'PRODUCAO', nome: 'Errado', categoria: 'BI', clientId: `ruim-${sufixo}`, nomeDoSegredo: 'INTEGRACAO_CHAVE_CIFRAGEM', modulos: ['ANALYTICS'] }, AUTOR.nome);
    expect(!ruim.ok && ruim.erros.nomeDoSegredo).toMatch(/IFOOD_<NOME>_CLIENT_SECRET/);
    await expect(
      db.$executeRawUnsafe(`INSERT INTO "IntegracaoApp"(id,provedor,ambiente,nome,categoria,"clientId","nomeDoSegredo",modulos,"criadoPorNome","atualizadoEm") VALUES ($1,'IFOOD','PRODUCAO','x','BI',$2,'DATABASE_URL','{ANALYTICS}','x',now())`, `db-${sufixo}`, `db-${sufixo}`),
    ).rejects.toThrow(/IntegracaoApp_nome_do_segredo/);
  });
});
