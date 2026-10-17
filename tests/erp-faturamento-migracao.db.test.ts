/**
 * ERP 2.1 · a migration `20261025000000_erp_faturamento` com DADO ANTIGO plantado,
 * como superusuário e como DONO NÃO-SUPERUSUÁRIO (com RLS FORÇADA e sem RLS).
 *
 * Cria bancos descartáveis, leva cada um até a migration anterior, planta linhas de
 * faturamento (boas e que violam cada CHECK novo, mais um grão humano duplicado) e
 * aplica a migration da 2.1:
 *  - nenhuma linha some e a migration NÃO falha por causa de dado antigo;
 *  - o CHECK violado fica NOT VALID (convalidated = false) e vale para escrita nova; os
 *    outros ficam validados;
 *  - com duplicidade humana o índice único parcial não é criado (aviso); sem ela, é
 *    criado e recusa o segundo lançamento do mesmo grão;
 *  - as lojas antigas ganham os três canais;
 *  - os CHECKs recusam por SQL cru;
 *  - `npm run erp:conferir-migracao` lista exatamente o que ficou pendente.
 *
 * O caso do dono com FORCE RLS é o que quebrava (veto do Guardião): o SELECT de
 * pré-checagem da migration enxergava 0 linhas, "passava", e o CREATE UNIQUE INDEX
 * (que lê a tabela inteira) falhava com 23505 e prendia o deploy. Rodado contra a
 * migration antiga, o cenário "dono com RLS e duplicada" falha em "a migration passa".
 *
 * Precisa de `psql`, de permissão para criar banco e, para os cenários de dono, dos
 * papéis `ff_dono` e `ff_semrls` (dono não-superusuário, com e sem a RLS instalada):
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-faturamento-migracao.db.test.ts
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { conferirMigracao } from '../scripts/erp-conferir-migracao';

const URL_TESTE = process.env.ERP_DB_TESTE;
const MIGRACOES = join(process.cwd(), 'prisma', 'migrations');
const DA_2_1 = '20261025000000_erp_faturamento';
const temPsql = spawnSync('psql', ['--version']).status === 0;

function urlDe(banco: string, papel?: string): string {
  const u = new URL(URL_TESTE!);
  u.pathname = `/${banco}`;
  u.search = '';
  if (papel) {
    u.username = papel;
    u.password = papel;
  }
  return u.toString();
}

function psql(url: string, args: string[]) {
  const r = spawnSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', ...args], { encoding: 'utf8' });
  return { ok: r.status === 0, saida: (r.stdout ?? '').trim(), aviso: r.stderr ?? '' };
}

const antes = (anteriorA: string) => readdirSync(MIGRACOES).filter((n) => /^\d{14}_/.test(n) && n < anteriorA).sort();

const CAMPOS = '(id,"parceiroId","lojaId",canal,data,"valorCentavos",pedidos,clientes,origem,"chaveIdempotencia","origemRef","atualizadoEm")';
const linha = (id: string, loja: string, canal: string, data: string, valor: number, pedidos: number, origem: string, chave: string, ref = 'NULL') =>
  `('${id}','p1','${loja}','${canal}','${data}',${valor},${pedidos},${pedidos},'${origem}','${chave}',${ref},now())`;

interface Perfil {
  nome: string;
  /** Papel dono do banco (undefined = o próprio usuário do teste, superusuário). */
  papel?: string;
  /** Esperado: a RLS FORÇADA está instalada neste perfil. */
  rls: boolean;
}
const PERFIS: Perfil[] = [
  { nome: 'superusuário', rls: true },
  { nome: 'dono não-superusuário COM RLS forçada', papel: 'ff_dono', rls: true },
  { nome: 'dono não-superusuário SEM RLS', papel: 'ff_semrls', rls: false },
];

const admin = () => psql(urlDe('postgres'), ['-c', 'select 1']);
const papelExiste = (papel: string) => !!URL_TESTE && temPsql && psql(urlDe('postgres'), ['-c', `select count(*) from pg_roles where rolname = '${papel}'`]).saida === '1';

describe.skipIf(!URL_TESTE || !temPsql)('ERP 2.1 · migration com dado antigo (Postgres real)', { timeout: 240_000 }, () => {
  const sufixo = globalThis.crypto.randomUUID().slice(0, 8).replace(/-/g, '');
  const criados: string[] = [];

  afterAll(() => {
    for (const b of criados) psql(urlDe('postgres'), ['-c', `DROP DATABASE IF EXISTS ${b} WITH (FORCE)`]);
  });

  /** Banco novo, dono = o perfil, migrations até a anterior, e o dado antigo plantado COM o papel do dono (no contexto do parceiro, se há RLS). */
  function preparar(perfil: Perfil, rotulo: string, plantar: string): { banco: string; dono: string; superuser: string } {
    const banco = `ff_mig21_${rotulo}_${sufixo}`;
    const dono = urlDe(banco, perfil.papel);
    const superuser = urlDe(banco);
    expect(psql(urlDe('postgres'), ['-c', `CREATE DATABASE ${banco}${perfil.papel ? ` OWNER ${perfil.papel}` : ''}`]).ok, `criar ${banco}`).toBe(true);
    criados.push(banco);
    if (perfil.papel) expect(psql(superuser, ['-c', `ALTER SCHEMA public OWNER TO ${perfil.papel}`]).ok).toBe(true);
    for (const m of antes(DA_2_1)) {
      const r = psql(dono, ['-f', join(MIGRACOES, m, 'migration.sql')]);
      expect(r.ok, `${m}: ${r.aviso.slice(0, 300)}`).toBe(true);
    }
    const comRls = psql(superuser, ['-c', `SELECT relforcerowsecurity FROM pg_class WHERE relname = 'FaturamentoLancamento'`]).saida === 't';
    expect(comRls, `RLS forçada esperada = ${perfil.rls}`).toBe(perfil.rls);
    expect(psql(dono, ['-c', `INSERT INTO "ParceiroFlow"(id,nome,slug,status) VALUES ('p1','P1','p1','ATIVO')`]).ok).toBe(true);
    // Sob RLS forçada o dono só escreve no contexto do parceiro (como o portão).
    const contexto = comRls ? `SELECT set_config('app.parceiro_id','p1',true), set_config('role','erp_tenant',true);` : '';
    const r = psql(dono, ['-c', `${contexto} INSERT INTO "Loja"(id,"parceiroId",nome,slug) VALUES ('l1','p1','Loja 1','l1'),('l2','p1','Loja 2','l2'); ${plantar}`]);
    expect(r.ok, r.aviso).toBe(true);
    return { banco, dono, superuser };
  }

  const comContexto = (perfil: Perfil, sql: string) => (perfil.rls ? `SELECT set_config('app.parceiro_id','p1',true), set_config('role','erp_tenant',true); ${sql}` : sql);

  const SUJO = () =>
    `INSERT INTO "FaturamentoLancamento"${CAMPOS} VALUES
        ${linha('boa1', 'l1', 'LOJA', '2026-10-01', 100000, 20, 'MANUAL', 'manual:l1:-:LOJA:2026-10-01')},
        ${linha('boa2', 'l1', 'IFOOD', '2026-10-01', 50000, 10, 'INTEGRACAO', 'ifood:dia:abc', `'abc'`)},
        ${linha('v_valor_sem_pedido', 'l2', 'LOJA', '2026-10-01', 500, 0, 'MANUAL', 'manual:l2:-:LOJA:2026-10-01')},
        ${linha('v_data_antiga', 'l2', 'IFOOD', '2019-01-01', 500, 1, 'MANUAL', 'manual:l2:-:IFOOD:2019-01-01')},
        ${linha('v_chave_fora', 'l2', 'DELIVERY_PROPRIO', '2026-10-02', 500, 1, 'MANUAL', 'qualquer-coisa')},
        ${linha('v_integracao_sem_ref', 'l2', 'DELIVERY_PROPRIO', '2026-10-03', 500, 1, 'INTEGRACAO', 'ifood:dia:xyz')},
        ${linha('v_teto', 'l2', 'LOJA', '2026-10-04', 200000000, 5, 'MANUAL', 'manual:l2:-:LOJA:2026-10-04')},
        ${linha('dup1', 'l1', 'DELIVERY_PROPRIO', '2026-10-05', 700, 1, 'MANUAL', 'manual:l1:-:DELIVERY_PROPRIO:2026-10-05')},
        ${linha('dup2', 'l1', 'DELIVERY_PROPRIO', '2026-10-05', 800, 1, 'IMPORTACAO', 'manual:l1:-:DELIVERY_PROPRIO:2026-10-05:b')};`;

  const LIMPO = () =>
    `INSERT INTO "FaturamentoLancamento"${CAMPOS} VALUES
          ${linha('boa1', 'l1', 'LOJA', '2026-10-01', 100000, 20, 'MANUAL', 'manual:l1:-:LOJA:2026-10-01')},
          ${linha('boa2', 'l1', 'IFOOD', '2026-10-01', 50000, 10, 'INTEGRACAO', 'ifood:dia:abc', `'abc'`)};`;

  for (const perfil of PERFIS) {
    const rotulo = perfil.papel ?? 'su';
    describe.skipIf(!!perfil.papel && !papelExiste(perfil.papel))(perfil.nome, () => {
      it('dado antigo que viola (e grão duplicado): a migration passa, avisa, nenhuma linha some e o conferidor lista as pendências', async () => {
        const { dono, superuser } = preparar(perfil, `${rotulo}s`, SUJO());
        const contagem = () => psql(superuser, ['-c', 'SELECT count(*) FROM "FaturamentoLancamento"']).saida;
        expect(contagem()).toBe('9');
        const r = psql(dono, ['-f', join(MIGRACOES, DA_2_1, 'migration.sql')]);
        expect(r.ok, r.aviso).toBe(true);
        expect(r.aviso).toContain('ficou NOT VALID');
        expect(r.aviso).toContain('grao_humano');
        expect(contagem()).toBe('9');
        expect(psql(superuser, ['-c', 'SELECT count(*) FROM "Loja"']).saida).toBe('2');

        const estado = Object.fromEntries(
          psql(superuser, ['-c', `SELECT conname || '=' || convalidated FROM pg_constraint WHERE conname LIKE 'FaturamentoLancamento\\_%' OR conname = 'Loja_canais_ao_menos_um' ORDER BY 1`])
            .saida.split('\n')
            .map((l) => l.split('=')),
        );
        for (const nome of ['valor_tem_pedido', 'data_minima', 'chave_do_espaco', 'integracao_tem_ref', 'valor_teto']) expect(estado[`FaturamentoLancamento_${nome}`], nome).toBe('false');
        for (const nome of ['pedidos_teto', 'clientes_teto', 'textos_curtos']) expect(estado[`FaturamentoLancamento_${nome}`], nome).toBe('true');
        expect(estado['Loja_canais_ao_menos_um']).toBe('true');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_indexes WHERE indexname = 'FaturamentoLancamento_grao_humano'`]).saida).toBe('0');
        expect(psql(superuser, ['-c', `SELECT DISTINCT "canaisDeVenda"::text FROM "Loja"`]).saida).toBe('{LOJA,DELIVERY_PROPRIO,IFOOD}');

        // O CHECK NOT VALID vale para escrita nova; a linha antiga boa continua editável.
        const nova = psql(dono, ['-c', comContexto(perfil, `INSERT INTO "FaturamentoLancamento"${CAMPOS} VALUES ${linha('n1', 'l1', 'LOJA', '2026-10-09', 900, 0, 'MANUAL', 'manual:l1:-:LOJA:2026-10-09')}`)]);
        expect(nova.ok).toBe(false);
        expect(nova.aviso).toContain('FaturamentoLancamento_valor_tem_pedido');
        expect(psql(dono, ['-c', comContexto(perfil, `UPDATE "FaturamentoLancamento" SET pedidos = 21 WHERE id = 'boa1'`)]).ok).toBe(true);

        // O passo pós-deploy: nada fica escondido no WARNING.
        const db = new PrismaClient({ datasources: { db: { url: superuser } } });
        try {
          const p = await conferirMigracao(db);
          expect(p.filter((x) => x.includes('NOT VALID')).map((x) => /CHECK (\S+)/.exec(x)![1]).sort()).toEqual(
            ['FaturamentoLancamento_chave_do_espaco', 'FaturamentoLancamento_data_minima', 'FaturamentoLancamento_integracao_tem_ref', 'FaturamentoLancamento_valor_tem_pedido', 'FaturamentoLancamento_valor_teto'],
          );
          expect(p.some((x) => x.includes('grao_humano') && x.includes('NÃO existe'))).toBe(true);
        } finally {
          await db.$disconnect();
        }
      });

      it('só a duplicada (nada viola CHECK): o índice não é criado e a migration passa, mesmo sob RLS forçada', () => {
        const dup = `INSERT INTO "FaturamentoLancamento"${CAMPOS} VALUES
          ${linha('dup1', 'l1', 'DELIVERY_PROPRIO', '2026-10-05', 700, 1, 'MANUAL', 'manual:l1:-:DELIVERY_PROPRIO:2026-10-05')},
          ${linha('dup2', 'l1', 'DELIVERY_PROPRIO', '2026-10-05', 800, 1, 'IMPORTACAO', 'manual:l1:-:DELIVERY_PROPRIO:2026-10-05:b')};`;
        const { dono, superuser } = preparar(perfil, `${rotulo}d`, dup);
        const r = psql(dono, ['-f', join(MIGRACOES, DA_2_1, 'migration.sql')]);
        expect(r.ok, r.aviso).toBe(true); // com o SELECT de pré-checagem antigo, a RLS escondia as linhas e o índice quebrava aqui (23505)
        expect(r.aviso).toContain('grao_humano');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_indexes WHERE indexname = 'FaturamentoLancamento_grao_humano'`]).saida).toBe('0');
        expect(psql(superuser, ['-c', 'SELECT count(*) FROM "FaturamentoLancamento"']).saida).toBe('2');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_constraint WHERE (conname LIKE 'FaturamentoLancamento\\_%' OR conname = 'Loja_canais_ao_menos_um') AND NOT convalidated`]).saida).toBe('0');
      });

      it('dado antigo bom: tudo validado, índice criado, mesma contagem, CHECKs e índice recusam por SQL cru', async () => {
        const { dono, superuser } = preparar(perfil, `${rotulo}l`, LIMPO());
        const r = psql(dono, ['-f', join(MIGRACOES, DA_2_1, 'migration.sql')]);
        expect(r.ok, r.aviso).toBe(true);
        expect(r.aviso).not.toContain('WARNING');
        expect(psql(superuser, ['-c', 'SELECT count(*) FROM "FaturamentoLancamento"']).saida).toBe('2');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_constraint WHERE (conname LIKE 'FaturamentoLancamento\\_%' OR conname = 'Loja_canais_ao_menos_um') AND NOT convalidated`]).saida).toBe('0');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_indexes WHERE indexname = 'FaturamentoLancamento_grao_humano'`]).saida).toBe('1');

        const tenta = (id: string, resto: string, esperado: string) => {
          const x = psql(dono, ['-c', comContexto(perfil, `INSERT INTO "FaturamentoLancamento"${CAMPOS} VALUES ${resto.replace('$ID', id)}`)]);
          expect(x.ok, `${id} deveria ser recusada`).toBe(false);
          expect(x.aviso, id).toContain(esperado);
        };
        tenta('x1', linha('$ID', 'l1', 'LOJA', '2026-10-02', 100000001, 5, 'MANUAL', 'manual:l1:-:LOJA:2026-10-02'), 'FaturamentoLancamento_valor_teto');
        tenta('x2', linha('$ID', 'l1', 'LOJA', '2026-10-03', 100, 0, 'MANUAL', 'manual:l1:-:LOJA:2026-10-03'), 'FaturamentoLancamento_valor_tem_pedido');
        tenta('x3', linha('$ID', 'l1', 'LOJA', '2026-10-04', 100, 1, 'MANUAL', 'sem-prefixo'), 'FaturamentoLancamento_chave_do_espaco');
        tenta('x4', linha('$ID', 'l1', 'LOJA', '2026-10-05', 100, 1, 'INTEGRACAO', 'manual:l1:-:LOJA:2026-10-05', `'r'`), 'FaturamentoLancamento_chave_do_espaco');
        tenta('x5', linha('$ID', 'l1', 'LOJA', '2026-10-06', 100, 1, 'INTEGRACAO', 'ifood:pedido:9'), 'FaturamentoLancamento_integracao_tem_ref');
        tenta('x6', linha('$ID', 'l1', 'LOJA', '2019-12-31', 100, 1, 'MANUAL', 'manual:l1:-:LOJA:2019-12-31'), 'FaturamentoLancamento_data_minima');
        tenta('x7', linha('$ID', 'l1', 'LOJA', '2026-10-07', 100, 100001, 'MANUAL', 'manual:l1:-:LOJA:2026-10-07'), 'FaturamentoLancamento_clientes_teto');
        // Grão humano repetido com chave diferente: o índice parcial segura (a chave determinística não bastaria).
        tenta('x8', linha('$ID', 'l1', 'LOJA', '2026-10-01', 1, 1, 'IMPORTACAO', 'manual:l1:-:LOJA:2026-10-01:outra'), 'FaturamentoLancamento_grao_humano');
        // Integração no mesmo grão do humano pode (vários pedidos): o índice só vale para o humano.
        expect(psql(dono, ['-c', comContexto(perfil, `INSERT INTO "FaturamentoLancamento"${CAMPOS} VALUES ${linha('i1', 'l1', 'IFOOD', '2026-10-01', 10, 1, 'INTEGRACAO', 'ifood:pedido:1', `'1'`)}, ${linha('i2', 'l1', 'IFOOD', '2026-10-01', 20, 1, 'INTEGRACAO', 'ifood:pedido:2', `'2'`)}`)]).ok).toBe(true);
        const loja = psql(dono, ['-c', comContexto(perfil, `UPDATE "Loja" SET "canaisDeVenda" = '{}' WHERE id = 'l1'`)]);
        expect(loja.ok).toBe(false);
        expect(loja.aviso).toContain('Loja_canais_ao_menos_um');
        expect(psql(dono, ['-c', comContexto(perfil, `UPDATE "Loja" SET "canaisDeVenda" = '{DELIVERY_PROPRIO}' WHERE id = 'l1'`)]).ok).toBe(true);

        const db = new PrismaClient({ datasources: { db: { url: superuser } } });
        try {
          expect(await conferirMigracao(db)).toEqual([]);
        } finally {
          await db.$disconnect();
        }
      });
    });
  }

  it('o ambiente permite criar banco (senão tudo acima é pulado em silêncio)', () => {
    expect(admin().ok).toBe(true);
  });
});
