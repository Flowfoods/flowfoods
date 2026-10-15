/**
 * ERP 0.2 — defesa em profundidade no BANCO (Row-Level Security) e as regras
 * do Parceiro Flow, no Postgres de verdade.
 *
 * O ponto: mesmo SQL cru, que esquece o `WHERE "parceiroId"`, rodando DENTRO
 * do contexto do parceiro B não enxerga nem toca linha de A. E sem contexto,
 * debaixo do papel `erp_tenant`, nada aparece.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-rls.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doParceiro, ErroDeTenant, gravarParceiroFlow, MODELOS_DE_TENANT, PAPEL_DE_TENANT } from '@/lib/erp/tenant';
import { cadastrarInsumo } from '@/lib/erp/insumos';
import { cadastrarLoja, cadastrarMarca, listarEstrutura } from '@/lib/erp/estrutura';
import { criarParceiro, mudarStatusParceiro, renomearParceiro } from '@/lib/erp/parceiros';
import { listarHistorico } from '@/lib/erp/historico';

const URL_TESTE = process.env.ERP_DB_TESTE;
const TABELAS = MODELOS_DE_TENANT.map((m) => m[0].toUpperCase() + m.slice(1));

describe.skipIf(!URL_TESTE)('ERP 0.2 · RLS e Parceiro Flow (Postgres real)', () => {
  let db: PrismaClient;
  const sufixo = Date.now().toString(36);
  const ids: string[] = [];
  let A: string;
  let B: string;
  let insumoDeA: string;

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
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
    if (!db) return;
    // Superusuário ignora RLS: a limpeza enxerga tudo. Filhos antes dos pais.
    const ordem = [
      'HistoricoAlteracao', 'Etiqueta', 'MovimentoEstoque', 'SaldoEstoque', 'ContagemItem', 'Contagem',
      'OrdemProducao', 'RequisicaoItem', 'Requisicao', 'NotaEntradaItem', 'NotaEntrada', 'ProdutoEmbalagem',
      'ProdutoCanal', 'ProdutoVenda', 'FichaItem', 'FichaTecnica', 'InsumoVariante', 'FaturamentoLancamento',
      'Despesa', 'DreMeta', 'FarolFaixa', 'DreLinha', 'PeriodoApuracao', 'CanalConfig', 'Insumo', 'Fornecedor',
      'Colaborador', 'Marca', 'Loja',
    ];
    for (const t of ordem) await db.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "parceiroId" = ANY($1)`, ids);
    await db.parceiroFlow.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  // ------------------------------------------------ o esquema da RLS

  it('toda tabela com parceiroId tem RLS ligada, FORÇADA e política para erp_tenant', async () => {
    const linhas = await db.$queryRaw<{ tabela: string; rls: boolean; forcada: boolean; politicas: number }[]>`
      SELECT c.relname AS tabela, c.relrowsecurity AS rls, c.relforcerowsecurity AS forcada,
             (SELECT count(*)::int FROM pg_policies p
               WHERE p.tablename = c.relname AND p.schemaname = n.nspname
                 AND ${PAPEL_DE_TENANT} = ANY(p.roles)) AS politicas
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = current_schema() AND c.relkind = 'r'
        AND EXISTS (SELECT 1 FROM pg_attribute a
                     WHERE a.attrelid = c.oid AND a.attname = 'parceiroId' AND NOT a.attisdropped)`;
    expect(linhas.map((l) => l.tabela).sort()).toEqual([...TABELAS].sort());
    expect(linhas.filter((l) => !l.rls || !l.forcada || l.politicas !== 1)).toEqual([]);
  });

  it('o papel é sem login, sem BYPASSRLS, e não alcança tabela fora do tenant', async () => {
    const [papel] = await db.$queryRaw<{ rolcanlogin: boolean; rolbypassrls: boolean; rolsuper: boolean }[]>`
      SELECT rolcanlogin, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = ${PAPEL_DE_TENANT}`;
    expect(papel).toEqual({ rolcanlogin: false, rolbypassrls: false, rolsuper: false });
    for (const t of ['User', 'ParceiroFlow', 'Lead', 'AuditLog', 'PortalCliente', '_prisma_migrations']) {
      const [p] = await db.$queryRaw<{ ok: boolean }[]>`
        SELECT has_table_privilege(${PAPEL_DE_TENANT}, quote_ident(${t}), 'SELECT,INSERT,UPDATE,DELETE') AS ok`;
      expect(p.ok, t).toBe(false);
    }
    // Livro-razão e histórico: só ler e acrescentar.
    for (const t of ['MovimentoEstoque', 'HistoricoAlteracao']) {
      const [p] = await db.$queryRaw<{ upd: boolean; del: boolean; ins: boolean }[]>`
        SELECT has_table_privilege(${PAPEL_DE_TENANT}, quote_ident(${t}), 'UPDATE') AS upd,
               has_table_privilege(${PAPEL_DE_TENANT}, quote_ident(${t}), 'DELETE') AS del,
               has_table_privilege(${PAPEL_DE_TENANT}, quote_ident(${t}), 'INSERT') AS ins`;
      expect(p, t).toEqual({ upd: false, del: false, ins: true });
    }
  });

  // ------------------------------------------------ SQL cru dentro do contexto de B

  it('SQL cru sem WHERE, no contexto de B, só devolve linhas de B', async () => {
    const b = doParceiro(B, db);
    const nomes = await b.sql<{ nome: string }>`SELECT "nome" FROM "Insumo" ORDER BY "nome"`;
    expect(nomes.map((n) => n.nome)).toEqual(['Coisa de B']);
    // Nem pedindo explicitamente o parceiro A, nem pelo id.
    expect(await b.sql`SELECT * FROM "Insumo" WHERE "parceiroId" = ${A}`).toEqual([]);
    expect(await b.sql`SELECT * FROM "Insumo" WHERE "id" = ${insumoDeA}`).toEqual([]);
    // Agregado cru também não soma o que é de A.
    const [{ total }] = await b.sql<{ total: number }>`SELECT count(*)::int AS total FROM "HistoricoAlteracao"`;
    const [{ deB }] = await db.$queryRaw<{ deB: number }[]>`
      SELECT count(*)::int AS "deB" FROM "HistoricoAlteracao" WHERE "parceiroId" = ${B}`;
    expect(total).toBe(deB);
  });

  it('dentro de uma transação do portão também (o caso do relatório em SQL cru)', async () => {
    const b = doParceiro(B, db);
    const visto = await b.transacao(async (tx) => {
      const [{ user }] = await tx.sql<{ user: string }>`SELECT current_user AS "user"`;
      const linhas = await tx.sql<{ nome: string }>`SELECT "nome" FROM "Insumo"`;
      const deA = await tx.sql`SELECT 1 FROM "Insumo" WHERE "id" = ${insumoDeA}`;
      const viaModelo = await tx.insumo.findMany();
      return { user, nomes: linhas.map((l) => l.nome), deA: deA.length, viaModelo: viaModelo.length };
    });
    expect(visto).toEqual({ user: PAPEL_DE_TENANT, nomes: ['Coisa de B'], deA: 0, viaModelo: 1 });
  });

  it('SQL cru de B não altera, não apaga e não grava em A (WITH CHECK)', async () => {
    const b = doParceiro(B, db);
    expect(await b.sql`UPDATE "Insumo" SET "nome" = 'hack' WHERE "id" = ${insumoDeA} RETURNING "id"`).toEqual([]);
    expect(await b.sql`DELETE FROM "Insumo" WHERE "parceiroId" = ${A} RETURNING "id"`).toEqual([]);
    await expect(
      b.sql`INSERT INTO "Insumo" ("id","parceiroId","nome","unidade","conteudoMilesimos","precoEmbalagemCentavos")
            VALUES (${`rls-${sufixo}`}, ${A}, 'Intruso', 'UN', 1000, 1)`,
    ).rejects.toThrow(/row-level security/);
    const [intacto] = await db.$queryRaw<{ nome: string }[]>`SELECT "nome" FROM "Insumo" WHERE "id" = ${insumoDeA}`;
    expect(intacto.nome).toBe('Segredo de A');
    expect(await doParceiro(A, db).insumo.count()).toBe(1);
  });

  it('sem app.parceiro_id, debaixo do papel, nada aparece e nada entra', async () => {
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

  it('o papel não vaza para o pool: depois do portão, a conexão volta ao usuário do app', async () => {
    for (let i = 0; i < 8; i++) await doParceiro(B, db).insumo.count();
    const voltas = await Promise.all(
      Array.from({ length: 8 }, () =>
        db.$queryRaw<{ u: string; p: string | null }[]>`
          SELECT current_user AS u, NULLIF(current_setting('app.parceiro_id', true), '') AS p`,
      ),
    );
    for (const [v] of voltas) expect(v).toMatchObject({ p: null });
    expect(voltas.every(([v]) => v.u !== PAPEL_DE_TENANT)).toBe(true);
  });

  // ------------------------------------------------ somente leitura (parceiro suspenso)

  it('cliente somente leitura: lê, mas o portão recusa escrita e o banco abre read-only', async () => {
    const leitura = doParceiro(A, db, { somenteLeitura: true });
    expect(await leitura.insumo.count()).toBe(1);
    await expect(leitura.marca.create({ data: { parceiroId: A, nome: 'Não entra' } })).rejects.toThrow(ErroDeTenant);
    await expect(leitura.insumo.updateMany({ data: { nome: 'x' } })).rejects.toThrow(ErroDeTenant);
    // Nem por SQL cru: a transação é read-only no Postgres.
    await expect(leitura.sql`UPDATE "Insumo" SET "nome" = 'x'`).rejects.toThrow(/read-only/);
    await expect(
      leitura.transacao((tx) => tx.sql`INSERT INTO "Marca" ("id","parceiroId","nome") VALUES ('ro', ${A}, 'x')`),
    ).rejects.toThrow(/read-only/);
    expect(await leitura.transacao((tx) => tx.insumo.count())).toBe(1);
    expect(await doParceiro(A, db).marca.count({ where: { nome: 'Não entra' } })).toBe(0);
  });

  // ------------------------------------------------ Parceiro Flow (nível 1) e histórico

  it('criar parceiro grava o "depois" no histórico do próprio parceiro', async () => {
    const h = await listarHistorico(doParceiro(A, db), { entidade: 'ParceiroFlow' });
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ acao: 'CRIOU', autorNome: 'Teste' });
    expect(h[0].mudancas.map((m) => m.campo)).toEqual(['nome', 'endereço', 'status']);
  });

  it('slug: gerado do nome, editável, único e validado', async () => {
    const gerado = await criarParceiro({ nome: `Grupo Valentin's ${sufixo}`, status: 'RASCUNHO' }, 'Teste', db);
    expect(gerado).toMatchObject({ ok: true, slug: `grupo-valentins-${sufixo}` });
    if (gerado.ok) ids.push(gerado.id);
    expect(await criarParceiro({ nome: 'Outro', slug: `rls-a-${sufixo}`, status: 'ATIVO' }, 'Teste', db)).toEqual({
      ok: false,
      erros: { slug: 'Esse endereço já é de outro parceiro.' },
    });
    const ruim = await criarParceiro({ nome: 'Outro', slug: 'Com Espaço', status: 'ATIVO' }, 'Teste', db);
    expect(ruim.ok).toBe(false);
    expect(await criarParceiro({ nome: 'x', status: 'ATIVO' }, 'Teste', db)).toMatchObject({ ok: false });
  });

  it('renomear grava antes/depois; o mesmo nome não grava nada', async () => {
    expect(await renomearParceiro(A, { nome: 'RLS A Renomeado' }, 'Teste', db)).toMatchObject({ ok: true });
    expect(await renomearParceiro(A, { nome: '  RLS A   Renomeado ' }, 'Teste', db)).toMatchObject({
      ok: true,
      mensagem: 'Nada mudou.',
    });
    const h = await listarHistorico(doParceiro(A, db), { entidade: 'ParceiroFlow' });
    expect(h).toHaveLength(2);
    expect(h[0]).toMatchObject({ acao: 'ALTEROU', mudancas: [{ campo: 'nome', antes: 'RLS A', depois: 'RLS A Renomeado' }] });
  });

  it('suspender exige motivo e grava; transição inválida é recusada; reativar volta', async () => {
    expect(await mudarStatusParceiro(A, 'SUSPENSO', '', 'Teste', db)).toMatchObject({ ok: false, erros: { motivo: expect.any(String) } });
    expect(await mudarStatusParceiro(A, 'SUSPENSO', 'Contrato pausado', 'Teste', db)).toMatchObject({ ok: true });
    expect((await db.parceiroFlow.findUnique({ where: { id: A } }))?.status).toBe('SUSPENSO');
    expect(await mudarStatusParceiro(A, 'SUSPENSO', 'de novo', 'Teste', db)).toMatchObject({ ok: false });
    expect(await mudarStatusParceiro(A, 'RASCUNHO', '', 'Teste', db)).toMatchObject({ ok: false });
    expect(await mudarStatusParceiro(A, 'ATIVO', '', 'Teste', db)).toMatchObject({ ok: true });
    const h = await listarHistorico(doParceiro(A, db), { entidade: 'ParceiroFlow' });
    expect(h.slice(0, 2).map((x) => x.acao)).toEqual(['ATIVOU', 'SUSPENDEU']);
    expect(h[1]).toMatchObject({ motivo: 'Contrato pausado', mudancas: [{ campo: 'status', antes: 'Ativo', depois: 'Suspenso' }] });
  });

  it('gravarParceiroFlow é atômico: se o histórico falha, o parceiro não fica', async () => {
    const slug = `atomico-${sufixo}`;
    await expect(
      gravarParceiroFlow(async (pf) => {
        const p = await pf.create({ data: { nome: 'Atômico', slug, status: 'ATIVO' } });
        // Histórico inválido (ação nula): a gravação dele estoura → rollback de tudo.
        return {
          parceiroId: p.id,
          resultado: p,
          historico: { entidade: 'ParceiroFlow', entidadeId: p.id, acao: null as unknown as string, autorNome: 't' },
        };
      }, db),
    ).rejects.toThrow();
    expect(await db.parceiroFlow.findUnique({ where: { slug } })).toBeNull();

    // E o caso direto: erro depois de gravar o ParceiroFlow desfaz o ParceiroFlow.
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
    expect(await cadastrarLoja(b, { nome: 'Vila da Penha' }, 'Teste')).toMatchObject({ ok: true });
    expect(await cadastrarMarca(a, { nome: "Valentin's Burger" }, 'Teste')).toMatchObject({ ok: true });
    expect(await cadastrarMarca(a, { nome: 'x' }, 'Teste')).toMatchObject({ ok: false });

    const estA = await listarEstrutura(a);
    expect(estA.lojas.map((l) => [l.nome, l.slug])).toEqual([['Vila da Penha', 'vila-da-penha']]);
    expect(estA.marcas.map((m) => m.nome)).toEqual(["Valentin's Burger"]);
    expect((await listarEstrutura(b)).marcas).toEqual([]);

    const h = await listarHistorico(a);
    expect(h.filter((x) => x.entidade === 'Loja' || x.entidade === 'Marca').map((x) => `${x.entidade}:${x.acao}`).sort()).toEqual([
      'Loja:CRIOU',
      'Marca:CRIOU',
    ]);
    // O que falhou (nome repetido) não deixou histórico pela metade.
    expect(h.filter((x) => x.entidade === 'Loja')).toHaveLength(1);
  });

  it('parceiro suspenso: cadastro de loja recusado no servidor, mesmo chamando a regra direto', async () => {
    const leitura = doParceiro(A, db, { somenteLeitura: true });
    await expect(cadastrarLoja(leitura, { nome: 'Méier' }, 'Teste')).rejects.toThrow(ErroDeTenant);
    expect((await listarEstrutura(doParceiro(A, db))).lojas).toHaveLength(1);
  });
});
