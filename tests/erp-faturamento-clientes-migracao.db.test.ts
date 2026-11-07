/** INT-1.7A: NULL somente integrado; migration aditiva e catálogo em três perfis. */
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { CHECK_DOS_CLIENTES_DO_FATURAMENTO, conferirClientesDoFaturamento, conferirMigracao } from '../scripts/erp-conferir-migracao';
import { executarPsqlDeTeste } from './erp-psql-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const MIGRACAO = '20261124000000_erp_faturamento_clientes_ausentes';
const RAIZ = join(process.cwd(), 'prisma/migrations');
const ARQUIVO = join(RAIZ, MIGRACAO, 'migration.sql');
const temPsql = spawnSync('psql', ['--version']).status === 0;
const PERFIS = [
  { nome: 'superusuário', papel: '', rls: true },
  { nome: 'dono com RLS forçada', papel: 'ff_dono', rls: true },
  { nome: 'dono sem RLS', papel: 'ff_semrls', rls: false },
] as const;
const psql = executarPsqlDeTeste;
const ERRO_COLUNA = 'INT-1.7A: coluna FaturamentoLancamento.clientes deve ser INTEGER nullable sem default.';
const ERRO_CHECK = `INT-1.7A: CHECK ${CHECK_DOS_CLIENTES_DO_FATURAMENTO} ausente, NOT VALID ou incorreto.`;

function urlDe(banco: string, papel = '') {
  const u = new URL(URL_TESTE!);
  if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('ERP_DB_TESTE precisa ser local.');
  u.pathname = `/${banco}`;
  u.search = '';
  if (papel) { u.username = papel; u.password = papel; }
  return u.toString();
}
const papelExiste = (papel: string) => !!URL_TESTE && temPsql
  && psql(urlDe('postgres'), ['-c', `SELECT count(*) FROM pg_roles WHERE rolname='${papel}'`]).saida === '1';

// Apenas valores sintéticos fixos deste teste, nunca entrada externa.
function inserir(id: string, o: {
  origem?: 'MANUAL' | 'IMPORTACAO' | 'INTEGRACAO'; clientes?: number | null;
  valor?: number; pedidos?: number; data?: string; parceiro?: string; loja?: string; ref?: boolean;
} = {}) {
  const origem = o.origem ?? 'INTEGRACAO';
  const clientes = o.clientes === null ? 'NULL' : o.clientes ?? 7;
  return `INSERT INTO "FaturamentoLancamento"
    (id,"parceiroId","lojaId",canal,data,"valorCentavos",pedidos,clientes,origem,"chaveIdempotencia","origemRef","atualizadoEm")
    VALUES ('${id}','${o.parceiro ?? 'p1'}','${o.loja ?? 'l-p1'}','IFOOD','${o.data ?? '2026-11-10'}',
      ${o.valor ?? 12345},${o.pedidos ?? 7},${clientes},'${origem}',
      '${origem === 'INTEGRACAO' ? 'fixture:dia:' : 'manual:'}${id}',${o.ref === false ? 'NULL' : `'fixture:${id}'`},now())`;
}

describe.skipIf(!URL_TESTE || !temPsql)('INT-1.7A · clientes ausentes, migration e catálogo', { timeout: 480_000 }, () => {
  const sufixo = randomUUID().replaceAll('-', '').slice(0, 10);
  const bancos: string[] = [];
  afterAll(() => {
    for (const banco of bancos) {
      expect(banco).toMatch(/^ff_mig_clientes_[a-z0-9_]+$/);
      const r = psql(urlDe('postgres'), ['-c', `DROP DATABASE IF EXISTS ${banco} WITH (FORCE)`]);
      expect(r.ok, r.aviso).toBe(true);
    }
  }, 360_000);

  for (const perfil of PERFIS) {
    it.skipIf(!!perfil.papel && !papelExiste(perfil.papel))(`${perfil.nome}: legado, ausência, limites, isolamento e seis sabotagens`, async () => {
      const banco = `ff_mig_clientes_${perfil.papel || 'su'}_${sufixo}`;
      const administrador = urlDe(banco);
      const dono = urlDe(banco, perfil.papel);
      const exigir = (r: ReturnType<typeof psql>) => { expect(r.ok, r.aviso).toBe(true); return r.saida; };
      exigir(psql(urlDe('postgres'), ['-c', `CREATE DATABASE ${banco}${perfil.papel ? ` OWNER ${perfil.papel}` : ''}`]));
      bancos.push(banco);
      if (perfil.papel) exigir(psql(administrador, ['-c', `ALTER SCHEMA public OWNER TO ${perfil.papel}`]));
      for (const anterior of readdirSync(RAIZ).filter(n => /^\d{14}_/.test(n) && n < MIGRACAO).sort()) {
        const r = psql(dono, ['-f', join(RAIZ, anterior, 'migration.sql')]);
        expect(r.ok, `${anterior}: ${r.aviso}`).toBe(true);
      }
      const como = (parceiro: string, sql: string) => psql(dono, ['-c',
        `SELECT set_config('app.parceiro_id','${parceiro}',true)${perfil.rls ? ",set_config('role','erp_tenant',true)" : ''}; ${sql}`]);
      const db = new PrismaClient({ datasources: { db: { url: administrador } } });
      try {
        // A fase anterior é um catálogo válido, ainda sem NULL nem CHECK novo.
        expect(await conferirClientesDoFaturamento(db)).toEqual([]);
        expect(await conferirMigracao(db)).toEqual([]);
        exigir(psql(dono, ['-c', `INSERT INTO "ParceiroFlow"(id,nome,slug,status) VALUES
          ('p1','Sintético A','qa-clientes-a','ATIVO'),('p2','Sintético B','qa-clientes-b','ATIVO')`]));
        for (const parceiro of ['p1', 'p2']) exigir(como(parceiro,
          `INSERT INTO "Loja"(id,"parceiroId",nome,slug) VALUES ('l-${parceiro}','${parceiro}','Loja sintética','loja')`));
        exigir(como('p1', [
          inserir('manual', { origem: 'MANUAL', clientes: 12, data: '2026-11-01' }),
          inserir('importado', { origem: 'IMPORTACAO', clientes: 16, data: '2026-11-02' }),
          inserir('integrado', { clientes: 21, data: '2026-11-01' }),
          inserir('zero', { origem: 'MANUAL', clientes: 0, valor: 0, pedidos: 0, data: '2026-11-03' }),
        ].join(';')));
        exigir(como('p2', inserir('outro-parceiro', { parceiro: 'p2', loja: 'l-p2', clientes: 8 })));
        const antigos = () => db.$queryRaw`SELECT * FROM "FaturamentoLancamento"
          WHERE id IN ('manual','importado','integrado','zero','outro-parceiro') ORDER BY id`;
        const seguranca = () => Promise.all([
          db.$queryRaw`SELECT c.relrowsecurity,c.relforcerowsecurity,c.relacl::text FROM pg_class c
            JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relname='FaturamentoLancamento'`,
          db.$queryRaw`SELECT c.conname,c.contype::text,c.convalidated,pg_get_constraintdef(c.oid) AS definicao
            FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
            WHERE n.nspname=current_schema() AND t.relname='FaturamentoLancamento'
              AND c.conname<>${CHECK_DOS_CLIENTES_DO_FATURAMENTO} ORDER BY c.conname`,
          db.$queryRaw`SELECT indexname,indexdef FROM pg_indexes WHERE schemaname=current_schema()
            AND tablename='FaturamentoLancamento' ORDER BY indexname`,
          db.$queryRaw`SELECT tr.tgname,tr.tgtype::int,tr.tgenabled::text,pg_get_triggerdef(tr.oid) AS definicao
            FROM pg_trigger tr JOIN pg_class t ON t.oid=tr.tgrelid JOIN pg_namespace n ON n.oid=t.relnamespace
            WHERE n.nspname=current_schema() AND t.relname='FaturamentoLancamento' AND NOT tr.tgisinternal ORDER BY tr.tgname`,
          db.$queryRaw`SELECT policyname,permissive,roles::text,cmd,qual,with_check FROM pg_policies
            WHERE schemaname=current_schema() AND tablename='FaturamentoLancamento' ORDER BY policyname`,
        ]);
        const antes = await antigos();
        const protecoes = await seguranca();
        const negadoAntes = como('p1', inserir('ausente-antes', { clientes: null }));
        expect(negadoAntes.ok).toBe(false);
        expect(negadoAntes.aviso).toContain('clientes');
        const aplicada = psql(dono, ['-f', ARQUIVO]);
        expect(aplicada.ok, aplicada.aviso).toBe(true);
        expect(aplicada.aviso).not.toContain('WARNING');
        expect(await antigos()).toEqual(antes);
        expect(await seguranca()).toEqual(protecoes);
        expect(await conferirMigracao(db)).toEqual([]);
        const rls = await db.$queryRaw<{ ativa: boolean; forcada: boolean }[]>`SELECT relrowsecurity AS ativa,relforcerowsecurity AS forcada
          FROM pg_class WHERE oid='"FaturamentoLancamento"'::regclass`;
        expect(rls).toEqual([{ ativa: perfil.rls, forcada: perfil.rls }]);

        // NULL real, zero real e valor conhecido continuam três estados distintos.
        exigir(como('p1', inserir('sem-clientes', { clientes: null })));
        exigir(como('p1', inserir('zero-sem-clientes', { clientes: null, valor: 0, pedidos: 0 })));
        exigir(como('p1', inserir('tetos', { clientes: 100_000, valor: 100_000_000, pedidos: 100_000 })));
        const estados = await db.$queryRaw<{ id: string; clientes: number | null }[]>`SELECT id,clientes FROM "FaturamentoLancamento"
          WHERE id IN ('sem-clientes','zero-sem-clientes','zero','tetos') ORDER BY id`;
        expect(estados).toEqual([
          { id: 'sem-clientes', clientes: null }, { id: 'tetos', clientes: 100_000 },
          { id: 'zero', clientes: 0 }, { id: 'zero-sem-clientes', clientes: null },
        ]);
        const recusar = (sql: string, regra: string) => {
          const r = como('p1', sql);
          expect(r.ok, `Era preciso recusar ${regra}`).toBe(false);
          expect(r.aviso).toContain(regra);
        };
        for (const origem of ['MANUAL', 'IMPORTACAO'] as const) recusar(
          inserir(`null-${origem}`, { origem, clientes: null }), CHECK_DOS_CLIENTES_DO_FATURAMENTO);
        recusar(`UPDATE "FaturamentoLancamento" SET clientes=NULL WHERE id='manual'`, CHECK_DOS_CLIENTES_DO_FATURAMENTO);
        recusar(`UPDATE "FaturamentoLancamento" SET origem='MANUAL',"chaveIdempotencia"='manual:sem-clientes' WHERE id='sem-clientes'`, CHECK_DOS_CLIENTES_DO_FATURAMENTO);
        for (const [id, dados, regra] of [
          ['cliente-negativo', { clientes: -1 }, 'FaturamentoLancamento_naoneg'],
          ['valor-negativo', { clientes: null, valor: -1 }, 'FaturamentoLancamento_naoneg'],
          ['pedido-negativo', { clientes: null, pedidos: -1, valor: 0 }, 'FaturamentoLancamento_naoneg'],
          ['cliente-alto', { clientes: 100_001 }, 'FaturamentoLancamento_clientes_teto'],
          ['valor-alto', { clientes: null, valor: 100_000_001 }, 'FaturamentoLancamento_valor_teto'],
          ['pedido-alto', { clientes: null, pedidos: 100_001 }, 'FaturamentoLancamento_pedidos_teto'],
          ['valor-sem-pedido', { clientes: null, pedidos: 0 }, 'FaturamentoLancamento_valor_tem_pedido'],
          ['sem-referencia', { clientes: null, ref: false }, 'FaturamentoLancamento_integracao_tem_ref'],
        ] as const) recusar(inserir(id, dados), regra);
        recusar(inserir('loja-alheia', { clientes: null, loja: 'l-p2' }), 'FaturamentoLancamento_parceiroId_lojaId_fkey');
        if (perfil.rls) expect(exigir(como('p2', `SELECT count(*) FROM "FaturamentoLancamento" WHERE "parceiroId"='p1'`)).split('\n').at(-1)).toBe('0');
        expect(await antigos()).toEqual(antes);

        // O psql aplica SQL sem a tabela de tracking do Prisma. Registrar só a
        // migration desta fase permite provar detecção mesmo após dupla deriva.
        exigir(psql(dono, ['-c', `CREATE TABLE "_prisma_migrations" (
          id varchar(36) PRIMARY KEY,checksum varchar(64) NOT NULL,finished_at timestamptz,
          migration_name varchar(255) NOT NULL,logs text,rolled_back_at timestamptz,
          started_at timestamptz NOT NULL DEFAULT now(),applied_steps_count integer NOT NULL DEFAULT 0);
          INSERT INTO "_prisma_migrations"(id,checksum,finished_at,migration_name,applied_steps_count)
          VALUES ('${randomUUID()}','${createHash('sha256').update(readFileSync(ARQUIVO)).digest('hex')}',now(),'${MIGRACAO}',1)`]));
        const desfazer = new Error('rollback sintético da sabotagem');
        async function sabotagem(sqls: string[], esperado: string[]) {
          await expect(db.$transaction(async tx => {
            for (const sql of sqls) await tx.$executeRawUnsafe(sql);
            expect(await conferirClientesDoFaturamento(tx)).toEqual(esperado);
            throw desfazer;
          })).rejects.toBe(desfazer);
          expect(await conferirMigracao(db)).toEqual([]);
        }
        const removerCheck = `ALTER TABLE "FaturamentoLancamento" DROP CONSTRAINT "${CHECK_DOS_CLIENTES_DO_FATURAMENTO}"`;
        const adicionarCheck = (expressao: string, fim = '') => `ALTER TABLE "FaturamentoLancamento" ADD CONSTRAINT "${CHECK_DOS_CLIENTES_DO_FATURAMENTO}" CHECK (${expressao}) ${fim}`;
        await sabotagem([removerCheck], [ERRO_CHECK]);
        await sabotagem([removerCheck, adicionarCheck(`origem IN ('INTEGRACAO','MANUAL') OR clientes IS NOT NULL`)], [ERRO_CHECK]);
        await sabotagem([removerCheck, adicionarCheck(`origem='INTEGRACAO' OR clientes IS NOT NULL`, 'NOT VALID')], [ERRO_CHECK]);
        await sabotagem([`ALTER TABLE "FaturamentoLancamento" ALTER COLUMN clientes SET DEFAULT 0`], [ERRO_COLUNA]);
        const tornarObrigatorio = [
          `UPDATE "FaturamentoLancamento" SET clientes=0 WHERE clientes IS NULL`,
          `ALTER TABLE "FaturamentoLancamento" ALTER COLUMN clientes SET NOT NULL`,
        ];
        await sabotagem(tornarObrigatorio, [ERRO_COLUNA]);
        await sabotagem([...tornarObrigatorio, removerCheck], [ERRO_COLUNA, ERRO_CHECK]);
        expect(await antigos()).toEqual(antes);
        expect(await seguranca()).toEqual(protecoes);
        expect(await db.$queryRaw`SELECT clientes FROM "FaturamentoLancamento" WHERE id='sem-clientes'`).toEqual([{ clientes: null }]);
      } finally {
        await db.$disconnect();
      }
    });
  }
});
