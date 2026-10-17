/**
 * ERP 0.2 — defesa em profundidade no BANCO e as regras do Parceiro Flow, no
 * Postgres de verdade.
 *
 * - RLS: SQL cru que ESQUECE o `WHERE "parceiroId"`, rodando dentro do contexto
 *   de B, não enxerga nem toca linha de A; sem contexto, nada aparece.
 * - Status: escrita confere, DENTRO da transação, que o parceiro está ATIVO —
 *   vale para qualquer `doParceiro` (worker, webhook), e respeita suspensão
 *   concorrente.
 * - `cliente.sql` não mexe no contexto (set_config, role, reset, commit...).
 *
 * Roda nos dois cenários: superusuário (produção hoje) e dono não-superusuário,
 * com ou sem a RLS instalada; o que depende da RLS é pulado sem ela.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-rls.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { doParceiro, ErroDeTenant, gravarParceiroFlow, PAPEL_DE_TENANT } from '@/lib/erp/tenant';
import { cadastrarInsumo } from '@/lib/erp/insumos';
import { cadastrarLoja, cadastrarMarca, listarEstrutura } from '@/lib/erp/estrutura';
import { criarParceiro, mudarStatusParceiro, renomearParceiro } from '@/lib/erp/parceiros';
import { listarHistorico } from '@/lib/erp/historico';
import { MODELOS_DE_CREDENCIAL, MODELOS_DE_PEDIDO } from '@/lib/erp/modelos';
import { ALCANCE_FLOWFOODS } from '@/lib/erp/permissoes';
import { limparParceiros, perfilDoBanco, TABELAS_DE_TENANT, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const TABELAS_DE_CREDENCIAL = MODELOS_DE_CREDENCIAL.map((m) => m[0].toUpperCase() + m.slice(1)) as string[];
const TABELAS_DE_PEDIDO = MODELOS_DE_PEDIDO.map((m) => m[0].toUpperCase() + m.slice(1)) as string[];
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!URL_TESTE)('ERP 0.2 · RLS, status e Parceiro Flow (Postgres real)', () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const avisos = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const sufixo = globalThis.crypto.randomUUID().slice(0, 8);
  const ids: string[] = [];
  let A: string;
  let B: string;
  let insumoDeA: string;

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    const a = await criarParceiro({ nome: 'RLS A', slug: `rls-a-${sufixo}`, status: 'ATIVO' }, 'Teste', db);
    const b = await criarParceiro({ nome: 'RLS B', slug: `rls-b-${sufixo}`, status: 'ATIVO' }, 'Teste', db);
    if (!a.ok || !b.ok) throw new Error('setup');
    A = a.id;
    B = b.id;
    ids.push(A, B);
    const r = await cadastrarInsumo(doParceiro(A, db), { nome: 'Segredo de A', unidade: 'KG', conteudo: '1', preco: '10,00' });
    if (!r.ok) throw new Error('setup insumo');
    insumoDeA = r.id;
    await cadastrarInsumo(doParceiro(B, db), { nome: 'Coisa de B', unidade: 'UN', conteudo: '1', preco: '1,00' });
  });

  afterAll(async () => {
    avisos.mockRestore();
    if (!db) return;
    await limparParceiros(db, perfil, ids);
    await db.$disconnect();
  });

  // ------------------------------------------------ papel disponível ou não

  it('o portão detecta o papel; sem ele, avisa UMA vez no log e segue', async () => {
    const sobre = avisos.mock.calls.filter(([m]) => String(m).includes(PAPEL_DE_TENANT));
    expect(sobre).toHaveLength(perfil.rls ? 0 : 1);
    if (!perfil.rls) expect(String(sobre[0][0])).toMatch(/indisponível.*isolado pelo portão/);
    // Em qualquer cenário, o portão isola pelos modelos.
    expect(await doParceiro(B, db).insumo.findUnique({ where: { id: insumoDeA } })).toBeNull();
  });

  // ------------------------------------------------ o esquema da RLS

  it('toda tabela com parceiroId tem RLS ligada, FORÇADA e política para erp_tenant', async (ctx) => {
    if (!perfil.rls) return ctx.skip();
    const linhas = await db.$queryRaw<{ tabela: string; rls: boolean; forcada: boolean; politicas: number }[]>`
      SELECT c.relname AS tabela, c.relrowsecurity AS rls, c.relforcerowsecurity AS forcada,
             (SELECT count(*)::int FROM pg_policies p
               WHERE p.tablename = c.relname AND p.schemaname = n.nspname
                 AND ${PAPEL_DE_TENANT} = ANY(p.roles)) AS politicas
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = current_schema() AND c.relkind = 'r'
        AND EXISTS (SELECT 1 FROM pg_attribute a
                     WHERE a.attrelid = c.oid AND a.attname = 'parceiroId' AND NOT a.attisdropped)`;
    // Credenciais (0.3) têm parceiroId mas ficam FORA do tenant de propósito (lidas
    // antes de saber o parceiro): sem RLS, sem política, sem GRANT para o papel.
    const deTenant = linhas.filter((l) => !TABELAS_DE_CREDENCIAL.includes(l.tabela));
    expect(deTenant.map((l) => l.tabela).sort()).toEqual([...TABELAS_DE_TENANT].sort());
    expect(deTenant.filter((l) => !l.rls || !l.forcada || l.politicas !== 1)).toEqual([]);
    expect(linhas.filter((l) => TABELAS_DE_CREDENCIAL.includes(l.tabela) && (l.rls || l.politicas > 0))).toEqual([]);
  });

  it('o papel é sem login, sem BYPASSRLS, e não alcança tabela fora do tenant', async (ctx) => {
    if (!perfil.rls) return ctx.skip();
    const [papel] = await db.$queryRaw<{ rolcanlogin: boolean; rolbypassrls: boolean; rolsuper: boolean }[]>`
      SELECT rolcanlogin, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = ${PAPEL_DE_TENANT}`;
    expect(papel).toEqual({ rolcanlogin: false, rolbypassrls: false, rolsuper: false });
    for (const t of ['User', 'ParceiroFlow', 'Lead', 'AuditLog', 'PortalCliente', '_prisma_migrations', ...TABELAS_DE_CREDENCIAL, ...TABELAS_DE_PEDIDO]) {
      const [p] = await db.$queryRaw<{ ok: boolean }[]>`
        SELECT has_table_privilege(${PAPEL_DE_TENANT}, quote_ident(${t}), 'SELECT,INSERT,UPDATE,DELETE') AS ok`;
      expect(p.ok, t).toBe(false);
    }
    for (const t of ['MovimentoEstoque', 'HistoricoAlteracao']) {
      const [p] = await db.$queryRaw<{ upd: boolean; del: boolean; ins: boolean }[]>`
        SELECT has_table_privilege(${PAPEL_DE_TENANT}, quote_ident(${t}), 'UPDATE') AS upd,
               has_table_privilege(${PAPEL_DE_TENANT}, quote_ident(${t}), 'DELETE') AS del,
               has_table_privilege(${PAPEL_DE_TENANT}, quote_ident(${t}), 'INSERT') AS ins`;
      expect(p, t).toEqual({ upd: false, del: false, ins: true });
    }
    // 2.2b: a fotografia do fechamento só se inclui e se lê; o único UPDATE é nas três colunas da reabertura, nunca DELETE.
    for (const t of ['DreFotografia', 'DreFotografiaLinha']) {
      const [p] = await db.$queryRaw<{ upd: boolean; del: boolean; ins: boolean; sel: boolean }[]>`
        SELECT has_table_privilege(${PAPEL_DE_TENANT}, quote_ident(${t}), 'UPDATE') AS upd,
               has_table_privilege(${PAPEL_DE_TENANT}, quote_ident(${t}), 'DELETE') AS del,
               has_table_privilege(${PAPEL_DE_TENANT}, quote_ident(${t}), 'INSERT') AS ins,
               has_table_privilege(${PAPEL_DE_TENANT}, quote_ident(${t}), 'SELECT') AS sel`;
      expect(p, t).toEqual({ upd: false, del: false, ins: true, sel: true });
    }
    const [col] = await db.$queryRaw<{ ok: boolean; no: boolean }[]>`
      SELECT has_column_privilege(${PAPEL_DE_TENANT}, '"DreFotografia"', 'substituidaEm', 'UPDATE') AS ok,
             has_column_privilege(${PAPEL_DE_TENANT}, '"DreFotografia"', 'entrada', 'UPDATE') AS no`;
    expect(col).toEqual({ ok: true, no: false });
  });

  it('0.5 · o papel do tenant recebe "permission denied" ao ler o pedido de acesso (mesmo dentro do contexto de um parceiro)', async (ctx) => {
    if (!perfil.rls) return ctx.skip();
    const b = doParceiro(B, db);
    for (const t of TABELAS_DE_PEDIDO) {
      const texto = `SELECT count(*) FROM "${t}"`;
      const consulta = Object.assign([texto], { raw: [texto] }) as unknown as TemplateStringsArray;
      await expect(b.sql(consulta), t).rejects.toThrow(/permission denied/i);
    }
  });

  // ------------------------------------------------ SQL cru dentro do contexto de B

  it('SQL cru sem WHERE, no contexto de B, só devolve linhas de B', async (ctx) => {
    if (!perfil.rls) return ctx.skip();
    const b = doParceiro(B, db);
    const nomes = await b.sql<{ nome: string }>`SELECT "nome" FROM "Insumo" ORDER BY "nome"`;
    expect(nomes.map((n) => n.nome)).toEqual(['Coisa de B']);
    expect(await b.sql`SELECT * FROM "Insumo" WHERE "parceiroId" = ${A}`).toEqual([]);
    expect(await b.sql`SELECT * FROM "Insumo" WHERE "id" = ${insumoDeA}`).toEqual([]);
    const [{ total }] = await b.sql<{ total: number }>`SELECT count(*)::int AS total FROM "HistoricoAlteracao"`;
    const deB = await doParceiro(B, db).historicoAlteracao.count();
    expect(total).toBe(deB);
  });

  it('dentro de uma transação do portão também (o caso do relatório em SQL cru)', async (ctx) => {
    if (!perfil.rls) return ctx.skip();
    const visto = await doParceiro(B, db).transacao(async (tx) => {
      const [{ usuario }] = await tx.sql<{ usuario: string }>`SELECT current_user AS "usuario"`;
      const linhas = await tx.sql<{ nome: string }>`SELECT "nome" FROM "Insumo"`;
      const deA = await tx.sql`SELECT 1 FROM "Insumo" WHERE "id" = ${insumoDeA}`;
      const viaModelo = await tx.insumo.findMany();
      return { usuario, nomes: linhas.map((l) => l.nome), deA: deA.length, viaModelo: viaModelo.length };
    });
    expect(visto).toEqual({ usuario: PAPEL_DE_TENANT, nomes: ['Coisa de B'], deA: 0, viaModelo: 1 });
  });

  it('SQL cru de B não altera, não apaga e não grava em A (WITH CHECK)', async (ctx) => {
    if (!perfil.rls) return ctx.skip();
    const b = doParceiro(B, db);
    expect(await b.sql`UPDATE "Insumo" SET "nome" = 'hack' WHERE "id" = ${insumoDeA} RETURNING "id"`).toEqual([]);
    expect(await b.sql`DELETE FROM "Insumo" WHERE "parceiroId" = ${A} RETURNING "id"`).toEqual([]);
    await expect(
      b.sql`INSERT INTO "Insumo" ("id","parceiroId","nome","unidade","conteudoMilesimos","precoEmbalagemCentavos")
            VALUES (${`rls-${sufixo}`}, ${A}, 'Intruso', 'UN', 1000, 1)`,
    ).rejects.toThrow(/row-level security/);
    const intacto = await doParceiro(A, db).insumo.findUnique({ where: { id: insumoDeA } });
    expect(intacto?.nome).toBe('Segredo de A');
    expect(await doParceiro(A, db).insumo.count()).toBe(1);
  });

  it('sem app.parceiro_id, debaixo do papel, nada aparece e nada entra', async (ctx) => {
    if (!perfil.rls) return ctx.skip();
    const visto = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${PAPEL_DE_TENANT}`);
      const [{ n }] = await tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "Insumo"`;
      const [{ h }] = await tx.$queryRaw<{ h: number }[]>`SELECT count(*)::int AS h FROM "HistoricoAlteracao"`;
      return n + h;
    });
    expect(visto).toBe(0);
    await expect(
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${PAPEL_DE_TENANT}`);
        await tx.$executeRaw`INSERT INTO "Marca" ("id","parceiroId","nome") VALUES (${`rls-m-${sufixo}`}, ${A}, 'x')`;
      }),
    ).rejects.toThrow(/row-level security/);
  });

  it('o papel e o parceiro não vazam para o pool', async () => {
    for (let i = 0; i < 8; i++) await doParceiro(B, db).insumo.count();
    const voltas = await Promise.all(
      Array.from({ length: 8 }, () =>
        db.$queryRaw<{ u: string; p: string | null; ro: string }[]>`
          SELECT current_user AS u, NULLIF(current_setting('app.parceiro_id', true), '') AS p,
                 current_setting('transaction_read_only') AS ro`,
      ),
    );
    for (const [v] of voltas) expect(v).toMatchObject({ p: null, ro: 'off' });
    expect(voltas.every(([v]) => v.u !== PAPEL_DE_TENANT)).toBe(true);
  });

  // ------------------------------------------------ cliente.sql não mexe no contexto (NB1)

  it('cliente.sql recusa set_config, SET, RESET, ROLE e controle de transação', async () => {
    const b = doParceiro(B, db);
    const ataques = [
      b.sql`SELECT set_config('app.parceiro_id', ${A}, true)`,
      b.sql`SELECT pg_catalog.SET_CONFIG('role', 'x', true)`,
      b.sql`SET LOCAL app.parceiro_id = 'x'`,
      b.sql`set role none`,
      b.sql`RESET ROLE`,
      b.sql`SELECT 1; COMMIT`,
      b.sql`ROLLBACK`,
      b.sql`BEGIN`,
      b.sql`START TRANSACTION`,
      b.sql`SAVEPOINT s1`,
      b.transacao((tx) => tx.sql`RESET role`),
    ];
    for (const a of ataques) await expect(a).rejects.toThrow(ErroDeTenant);
    // Parâmetro não conta: o valor viaja à parte, não vira SQL.
    expect(await b.sql<{ v: string }>`SELECT ${'set role; reset'}::text AS v`).toEqual([{ v: 'set role; reset' }]);
    // E UPDATE ... SET (cláusula, não comando) é SQL legítimo.
    await expect(b.sql`UPDATE "Insumo" SET "nome" = "nome" WHERE false`).resolves.toEqual([]);
  });

  it('leitura avulsa por cliente.sql abre read-only no banco', async () => {
    const [{ ro }] = await doParceiro(B, db).sql<{ ro: string }>`SELECT current_setting('transaction_read_only') AS ro`;
    expect(ro).toBe('on');
  });

  // ------------------------------------------------ somente leitura (exigirParceiro em suspenso)

  it('cliente somente leitura: lê, mas recusa escrita (portão) e o banco abre read-only', async () => {
    const leitura = doParceiro(A, db, { somenteLeitura: true });
    expect(await leitura.insumo.count()).toBe(1);
    await expect(leitura.marca.create({ data: { parceiroId: A, nome: 'Não entra' } })).rejects.toThrow(ErroDeTenant);
    await expect(leitura.insumo.updateMany({ data: { nome: 'x' } })).rejects.toThrow(ErroDeTenant);
    await expect(leitura.sql`UPDATE "Insumo" SET "nome" = 'x'`).rejects.toThrow(ErroDeTenant);
    const ro = await leitura.transacao(async (tx) => {
      const [r] = await tx.sql<{ ro: string }>`SELECT current_setting('transaction_read_only') AS ro`;
      return r.ro;
    });
    expect(ro).toBe('on');
    expect(await doParceiro(A, db).marca.count({ where: { nome: 'Não entra' } })).toBe(0);
  });

  // ------------------------------------------------ status conferido NA transação da escrita (NB2/NB4)

  it('parceiro suspenso: doParceiro gravável (worker, webhook) também não escreve; leitura segue', async () => {
    const c = await criarParceiro({ nome: 'RLS C', slug: `rls-c-${sufixo}`, status: 'ATIVO' }, 'Teste', db);
    if (!c.ok) throw new Error('setup C');
    ids.push(c.id);
    const worker = doParceiro(c.id, db); // gravável por padrão, sem passar por exigirParceiro
    expect(await cadastrarLoja(worker, { nome: 'Antes' }, 'Worker')).toMatchObject({ ok: true });
    expect(await mudarStatusParceiro(c.id, 'SUSPENSO', 'teste de worker', 'Teste', db)).toMatchObject({ ok: true });

    await expect(worker.marca.create({ data: { parceiroId: c.id, nome: 'Depois' } })).rejects.toThrow(ErroDeTenant);
    await expect(cadastrarLoja(worker, { nome: 'Depois' }, 'Worker')).rejects.toThrow(/não está ATIVO/);
    await expect(worker.loja.updateMany({ data: { ativa: false } })).rejects.toThrow(ErroDeTenant);
    await expect(worker.sql`DELETE FROM "Loja"`).rejects.toThrow(ErroDeTenant);
    expect((await worker.loja.findMany()).map((l) => l.nome)).toEqual(['Antes']);
    expect(await worker.sql`SELECT 1 AS um`).toEqual([{ um: 1 }]);

    // Aguardando liberação também não recebe escrita.
    const d = await criarParceiro({ nome: 'RLS D', slug: `rls-d-${sufixo}`, status: 'RASCUNHO' }, 'Teste', db);
    if (!d.ok) throw new Error('setup D');
    ids.push(d.id);
    await expect(doParceiro(d.id, db).loja.create({ data: { parceiroId: d.id, nome: 'x', slug: 'x' } })).rejects.toThrow(
      ErroDeTenant,
    );
  });

  it('suspensão concorrente espera a escrita em curso terminar; a escrita seguinte já é recusada', async () => {
    const e = await criarParceiro({ nome: 'RLS E', slug: `rls-e-${sufixo}`, status: 'ATIVO' }, 'Teste', db);
    if (!e.ok) throw new Error('setup E');
    ids.push(e.id);
    const cliente = doParceiro(e.id, db);
    const marcos: string[] = [];

    const escrita = cliente.transacao(async (tx) => {
      await tx.marca.create({ data: { parceiroId: e.id, nome: 'Em curso' } }); // confere status e segura a linha
      marcos.push('escreveu');
      await espera(400);
      marcos.push('commit');
    });
    await espera(100);
    const suspensao = mudarStatusParceiro(e.id, 'SUSPENSO', 'concorrente', 'Teste', db).then((r) => {
      marcos.push('suspendeu');
      return r;
    });
    await Promise.all([escrita, suspensao]);
    expect(marcos).toEqual(['escreveu', 'commit', 'suspendeu']);
    expect(await cliente.marca.count()).toBe(1);
    await expect(cliente.marca.create({ data: { parceiroId: e.id, nome: 'Tarde demais' } })).rejects.toThrow(ErroDeTenant);
  });

  // ------------------------------------------------ Parceiro Flow (nível 1) e histórico

  it('criar parceiro grava o "depois" no histórico do próprio parceiro', async () => {
    const h = await listarHistorico(doParceiro(A, db), { entidade: 'ParceiroFlow', verPrecos: true });
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ acao: 'CRIOU', autorNome: 'Teste' });
    expect(h[0].mudancas.map((m) => m.campo)).toEqual(['nome', 'link', 'status']);
  });

  it('slug: gerado do nome, editável, único e validado', async () => {
    const gerado = await criarParceiro({ nome: `Grupo Valentin's ${sufixo}`, status: 'RASCUNHO' }, 'Teste', db);
    expect(gerado).toMatchObject({ ok: true, slug: `grupo-valentins-${sufixo}` });
    if (gerado.ok) ids.push(gerado.id);
    expect(await criarParceiro({ nome: 'Outro', slug: `rls-a-${sufixo}`, status: 'ATIVO' }, 'Teste', db)).toEqual({
      ok: false,
      erros: { slug: 'Esse link já é de outro parceiro.' },
    });
    expect((await criarParceiro({ nome: 'Outro', slug: 'Com Espaço', status: 'ATIVO' }, 'Teste', db)).ok).toBe(false);
    expect(await criarParceiro({ nome: 'x', status: 'ATIVO' }, 'Teste', db)).toMatchObject({ ok: false });
  });

  it('renomear grava antes/depois; o mesmo nome não grava nada', async () => {
    expect(await renomearParceiro(A, { nome: 'RLS A Renomeado' }, 'Teste', db)).toMatchObject({ ok: true });
    expect(await renomearParceiro(A, { nome: '  RLS A   Renomeado ' }, 'Teste', db)).toMatchObject({
      ok: true,
      mensagem: 'Nada mudou.',
    });
    const h = await listarHistorico(doParceiro(A, db), { entidade: 'ParceiroFlow', verPrecos: true });
    expect(h).toHaveLength(2);
    expect(h[0]).toMatchObject({ acao: 'ALTEROU', mudancas: [{ campo: 'nome', antes: 'RLS A', depois: 'RLS A Renomeado' }] });
  });

  it('suspender exige motivo e grava; renomear segue permitido em suspenso; reativar volta', async () => {
    expect(await mudarStatusParceiro(A, 'SUSPENSO', '', 'Teste', db)).toMatchObject({ ok: false, erros: { motivo: expect.any(String) } });
    expect(await mudarStatusParceiro(A, 'SUSPENSO', 'Contrato pausado', 'Teste', db)).toMatchObject({ ok: true });
    expect((await db.parceiroFlow.findUnique({ where: { id: A } }))?.status).toBe('SUSPENSO');
    // Nível 1 corrige o nome mesmo suspenso (caminho próprio, com histórico).
    expect(await renomearParceiro(A, { nome: 'RLS A Suspenso' }, 'Teste', db)).toMatchObject({ ok: true });
    expect(await mudarStatusParceiro(A, 'SUSPENSO', 'de novo', 'Teste', db)).toMatchObject({ ok: false });
    expect(await mudarStatusParceiro(A, 'RASCUNHO', '', 'Teste', db)).toMatchObject({ ok: false });
    expect(await mudarStatusParceiro(A, 'ATIVO', '', 'Teste', db)).toMatchObject({ ok: true });
    const h = await listarHistorico(doParceiro(A, db), { entidade: 'ParceiroFlow', verPrecos: true });
    expect(h.slice(0, 3).map((x) => x.acao)).toEqual(['ATIVOU', 'ALTEROU', 'SUSPENDEU']);
    expect(h[2]).toMatchObject({ motivo: 'Contrato pausado', mudancas: [{ campo: 'status', antes: 'Ativo', depois: 'Suspenso' }] });
  });

  it('gravarParceiroFlow é atômico: se o histórico falha, o parceiro não fica', async () => {
    const slug = `atomico-${sufixo}`;
    await expect(
      gravarParceiroFlow(async (pf) => {
        const p = await pf.create({ data: { nome: 'Atômico', slug, status: 'ATIVO' } });
        return {
          parceiroId: p.id,
          resultado: p,
          historico: { entidade: 'ParceiroFlow', entidadeId: p.id, acao: null as unknown as string, autorNome: 't' },
        };
      }, db),
    ).rejects.toThrow();
    expect(await db.parceiroFlow.findUnique({ where: { slug } })).toBeNull();

    const slug2 = `atomico2-${sufixo}`;
    await expect(
      gravarParceiroFlow(async (pf) => {
        await pf.create({ data: { nome: 'Atômico 2', slug: slug2, status: 'ATIVO' } });
        throw new Error('falhou no meio');
      }, db),
    ).rejects.toThrow('falhou no meio');
    expect(await db.parceiroFlow.findUnique({ where: { slug: slug2 } })).toBeNull();
  });

  // ------------------------------------------------ lojas e marcas (N2 → N3)

  it('lojas e marcas: cadastro com histórico, nome único no parceiro, isoladas entre parceiros', async () => {
    const a = doParceiro(A, db);
    const b = doParceiro(B, db);
    expect(await cadastrarLoja(a, { nome: 'Vila da Penha' }, 'Teste')).toMatchObject({ ok: true, nome: 'Vila da Penha' });
    expect(await cadastrarLoja(a, { nome: 'Vila da Penha' }, 'Teste')).toEqual({
      ok: false,
      erros: { nome: 'Já existe uma loja com esse nome.' },
    });
    // Nome diferente que gera o mesmo link: mensagem própria (QA).
    expect(await cadastrarLoja(a, { nome: 'Vila da Penha!' }, 'Teste')).toEqual({
      ok: false,
      erros: { nome: 'Esse nome gera o mesmo link da loja “Vila da Penha” (vila-da-penha). Diferencie o nome.' },
    });
    expect(await cadastrarLoja(b, { nome: 'Vila da Penha' }, 'Teste')).toMatchObject({ ok: true });
    expect(await cadastrarMarca(a, { nome: "Valentin's Burger" }, 'Teste')).toMatchObject({ ok: true });
    expect(await cadastrarMarca(a, { nome: 'x' }, 'Teste')).toMatchObject({ ok: false });

    const estA = await listarEstrutura(a, ALCANCE_FLOWFOODS);
    expect(estA.lojas.map((l) => [l.nome, l.slug])).toEqual([['Vila da Penha', 'vila-da-penha']]);
    expect(estA.marcas.map((m) => m.nome)).toEqual(["Valentin's Burger"]);
    expect((await listarEstrutura(b, ALCANCE_FLOWFOODS)).marcas).toEqual([]);

    const h = await listarHistorico(a, { verPrecos: true });
    expect(h.filter((x) => x.entidade === 'Loja')).toHaveLength(1);
    expect(h.filter((x) => x.entidade === 'Marca')).toHaveLength(1);
  });

  it('cliente somente leitura: cadastro de loja recusado mesmo chamando a regra direto', async () => {
    const leitura = doParceiro(A, db, { somenteLeitura: true });
    await expect(cadastrarLoja(leitura, { nome: 'Méier' }, 'Teste')).rejects.toThrow(ErroDeTenant);
    expect((await listarEstrutura(doParceiro(A, db), ALCANCE_FLOWFOODS)).lojas).toHaveLength(1);
  });
});
