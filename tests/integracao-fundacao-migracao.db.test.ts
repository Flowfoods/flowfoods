/**
 * INT-1.1 (decisões 481–483) · a migration `20261115000000_erp_integracao_fundacao` com DADO ANTIGO, como superusuário e como
 * DONO NÃO-SUPERUSUÁRIO (com RLS FORÇADA e sem RLS).
 *
 * Cria bancos descartáveis, leva cada um até a migration anterior, planta dois parceiros com loja e marca e aplica a migration:
 *  - nada some, não avisa; os parceiros antigos nascem fora da homologação; as cinco tabelas nascem (as três de tenant com RLS
 *    forçada onde as outras têm); os CHECKs validados; o índice parcial e os gatilhos;
 *  - as globais (app e token) ficam fora do alcance do papel do tenant;
 *  - pelo papel do tenant: conexão TEST só no parceiro de homologação e PRODUCAO nunca nele; a mesma loja do iFood não fica
 *    ativa em dois parceiros; identidade da conexão não muda; desligada não volta (ligar de novo é linha nova); o módulo usa um
 *    app do mesmo ambiente com o módulo; sem DELETE; o outro parceiro não enxerga;
 *  - o app não se apaga; o conferidor pós-deploy não lista pendência — e lista quando falta o índice, um gatilho, a RLS ou o
 *    REVOKE das globais.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff npx vitest run tests/integracao-fundacao-migracao.db.test.ts
 * Os perfis de dono precisam dos papéis `ff_dono` (com GRANT erp_tenant) e `ff_semrls` (sem ele); sem eles, só o perfil do
 * superusuário roda e os outros aparecem como pulados.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { conferirMigracao } from '../scripts/erp-conferir-migracao';

const URL_TESTE = process.env.ERP_DB_TESTE;
const MIGRACOES = join(process.cwd(), 'prisma', 'migrations');
const DA_INT_1_1 = '20261115000000_erp_integracao_fundacao';
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

const antes = (alvo: string) => readdirSync(MIGRACOES).filter((n) => /^\d{14}_/.test(n) && n < alvo).sort();

interface Perfil {
  nome: string;
  papel?: string;
  rls: boolean;
}
const PERFIS: Perfil[] = [
  { nome: 'superusuário', rls: true },
  { nome: 'dono não-superusuário COM RLS forçada', papel: 'ff_dono', rls: true },
  { nome: 'dono não-superusuário SEM RLS', papel: 'ff_semrls', rls: false },
];

const papelExiste = (papel: string) => !!URL_TESTE && temPsql && psql(urlDe('postgres'), ['-c', `select count(*) from pg_roles where rolname = '${papel}'`]).saida === '1';

const LOJA_TESTE = '0b1f6d3e-8a51-4c2e-9d7a-3f2b6c1e5a90';
const OUTRA_LOJA = '7c2e9a14-5b3d-4f60-a8e1-2d9c4b7f1e63';

describe.skipIf(!URL_TESTE || !temPsql)('INT-1.1 · migration da Central de Integrações, com dado antigo (Postgres real)', { timeout: 420_000 }, () => {
  const sufixo = globalThis.crypto.randomUUID().slice(0, 8).replace(/-/g, '');
  const criados: string[] = [];

  afterAll(() => {
    for (const b of criados) psql(urlDe('postgres'), ['-c', `DROP DATABASE IF EXISTS ${b} WITH (FORCE)`]);
  });

  for (const perfil of PERFIS) {
    const rotulo = perfil.papel ?? 'su';
    describe.skipIf(!!perfil.papel && !papelExiste(perfil.papel))(perfil.nome, () => {
      it('com dado antigo: nada some, sem aviso; tabelas, CHECKs, índice e gatilhos; as regras valem pelo papel do tenant; o conferidor não acha pendência', async () => {
        const banco = `ff_migint11_${rotulo}_${sufixo}`;
        const dono = urlDe(banco, perfil.papel);
        const superuser = urlDe(banco);
        expect(psql(urlDe('postgres'), ['-c', `CREATE DATABASE ${banco}${perfil.papel ? ` OWNER ${perfil.papel}` : ''}`]).ok, `criar ${banco}`).toBe(true);
        criados.push(banco);
        if (perfil.papel) expect(psql(superuser, ['-c', `ALTER SCHEMA public OWNER TO ${perfil.papel}`]).ok).toBe(true);
        for (const m of antes(DA_INT_1_1)) {
          const r = psql(dono, ['-f', join(MIGRACOES, m, 'migration.sql')]);
          expect(r.ok, `${m}: ${r.aviso.slice(0, 300)}`).toBe(true);
        }
        const comRls = psql(superuser, ['-c', `SELECT relforcerowsecurity FROM pg_class WHERE relname = 'Loja'`]).saida === 't';
        expect(comRls, `RLS forçada esperada = ${perfil.rls}`).toBe(perfil.rls);
        const noContexto = (parceiro: string, sql: string) => (comRls ? `SELECT set_config('app.parceiro_id','${parceiro}',true), set_config('role','erp_tenant',true); ${sql}` : sql);

        const db = new PrismaClient({ datasources: { db: { url: superuser } } });
        try {
          // O conferidor no banco da fase anterior: limpo, sem cobrar o que ainda não veio.
          expect(await conferirMigracao(db)).toEqual([]);

          // O que já existia: dois parceiros, cada um com sua loja; o primeiro com uma marca.
          expect(psql(dono, ['-c', `INSERT INTO "ParceiroFlow"(id,nome,slug,status) VALUES ('p1','P1','p1','ATIVO'),('p2','P2','p2','ATIVO')`]).ok).toBe(true);
          for (const [p, sql] of [
            ['p1', `INSERT INTO "Loja"(id,"parceiroId",nome,slug) VALUES ('l1','p1','Loja 1','l1'); INSERT INTO "Marca"(id,"parceiroId",nome) VALUES ('m1','p1','Marca 1');`],
            ['p2', `INSERT INTO "Loja"(id,"parceiroId",nome,slug) VALUES ('l2','p2','Loja 2','l2');`],
          ] as const) {
            const r = psql(dono, ['-c', noContexto(p, sql)]);
            expect(r.ok, r.aviso).toBe(true);
          }
          const conta = () => psql(superuser, ['-c', `SELECT (SELECT count(*) FROM "ParceiroFlow")::text || '/' || (SELECT count(*) FROM "Loja")::text || '/' || (SELECT count(*) FROM "Marca")::text`]).saida;
          const antesDaMigracao = conta();
          expect(antesDaMigracao).toBe('2/2/1');

          const r = psql(dono, ['-f', join(MIGRACOES, DA_INT_1_1, 'migration.sql')]);
          expect(r.ok, r.aviso).toBe(true);
          expect(r.aviso).not.toContain('WARNING');
          expect(conta()).toBe(antesDaMigracao);
          // Os parceiros antigos nascem fora da homologação.
          expect(psql(superuser, ['-c', `SELECT string_agg(id || ':' || "homologacaoDeIntegracao"::text, ',' ORDER BY id) FROM "ParceiroFlow"`]).saida).toBe('p1:false,p2:false');

          // As três de tenant com a RLS como as outras; as globais sem RLS (ficam fora do papel do tenant pelo REVOKE).
          const rls = psql(superuser, ['-c', `SELECT string_agg(relname || ':' || relrowsecurity::text || relforcerowsecurity::text, ',' ORDER BY relname) FROM pg_class WHERE relkind = 'r' AND relname IN ('IntegracaoConexao','IntegracaoConexaoModulo','LiberacaoDeModulo')`]).saida;
          const esperado = perfil.rls ? 'truetrue' : 'falsefalse';
          expect(rls).toBe(`IntegracaoConexao:${esperado},IntegracaoConexaoModulo:${esperado},LiberacaoDeModulo:${esperado}`);
          expect(psql(superuser, ['-c', `SELECT has_table_privilege('erp_tenant','"IntegracaoApp"','SELECT') OR has_table_privilege('erp_tenant','"IntegracaoToken"','SELECT')`]).saida).toBe('f');
          expect(
            psql(superuser, [
              '-c',
              `SELECT count(*) FROM pg_constraint WHERE convalidated AND conname IN ('IntegracaoApp_textos_curtos','IntegracaoApp_client_id','IntegracaoApp_nome_do_segredo','IntegracaoApp_categoria_do_ambiente','IntegracaoApp_com_modulo','IntegracaoToken_cifrado','IntegracaoToken_prazo','IntegracaoConexao_textos_curtos','IntegracaoConexao_id_externo','IntegracaoConexao_desligada','IntegracaoConexaoModulo_textos_curtos','IntegracaoConexaoModulo_ativo_tem_autor','IntegracaoConexaoModulo_erro_dito','LiberacaoDeModulo_modulo','LiberacaoDeModulo_autor')`,
            ]).saida,
          ).toBe('15');
          expect(psql(superuser, ['-c', `SELECT indexdef FROM pg_indexes WHERE indexname = 'IntegracaoConexao_externa_ativa_key'`]).saida).toMatch(/UNIQUE INDEX .* WHERE \(estado = 'ATIVA'::"EstadoDaConexao"\)/);
          expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('IntegracaoConexao_confere','IntegracaoConexao_parceiro_imutavel','IntegracaoConexaoModulo_confere','IntegracaoConexaoModulo_parceiro_imutavel','LiberacaoDeModulo_parceiro_imutavel','IntegracaoApp_nao_apaga')`]).saida).toBe('6');

          // Os apps (globais, do nível 1): só o NOME da variável do cofre; o de teste é do TEST.
          const app = (id: string, ambiente: string, categoria: string, segredo: string, modulos = '{ANALYTICS}') =>
            psql(dono, ['-c', `INSERT INTO "IntegracaoApp"(id,provedor,ambiente,nome,categoria,"clientId","nomeDoSegredo",modulos,"criadoPorNome","atualizadoEm") VALUES ('${id}','IFOOD','${ambiente}','App ${id}','${categoria}','cli-${id}','${segredo}','${modulos}','Rodolfo',now())`]);
          expect(app('a1', 'TEST', 'TEST', 'IFOOD_TEST_CLIENT_SECRET').ok).toBe(true);
          expect(app('a2', 'PRODUCAO', 'BI', 'IFOOD_BI_CLIENT_SECRET').ok).toBe(true);
          expect(app('a3', 'TEST', 'TEST', 'segredo de verdade 123').aviso).toContain('IntegracaoApp_nome_do_segredo');
          expect(app('a4', 'PRODUCAO', 'TEST', 'IFOOD_OUTRO_SECRET').aviso).toContain('IntegracaoApp_categoria_do_ambiente');
          expect(psql(dono, ['-c', `INSERT INTO "IntegracaoToken"(id,"appId","tokenCifrado","emitidoEm","expiraEm","atualizadoEm") VALUES ('t1','a1','v1.aaaa.bbbb.cccccccc',now(),now() + interval '6 hours',now())`]).ok).toBe(true);

          // Pelo papel do tenant.
          const como = (p: string, sql: string) => psql(dono, ['-c', noContexto(p, sql)]);
          if (comRls) {
            for (const t of ['IntegracaoApp', 'IntegracaoToken']) expect(como('p1', `SELECT count(*) FROM "${t}"`).aviso, t).toMatch(new RegExp(`permission denied for table ${t}`));
          }
          const ligar = (p: string, id: string, ambiente: string, loja: string, idExterno: string, marca = 'NULL') =>
            como(p, `INSERT INTO "IntegracaoConexao"(id,"parceiroId","lojaId","marcaId",provedor,ambiente,"idExterno","nomeExterno","criadoPorNome","atualizadoEm") VALUES ('${id}','${p}','${loja}',${marca},'IFOOD','${ambiente}','${idExterno}','Loja do iFood','Rodolfo',now())`);
          // Sem homologação, nem TEST.
          expect(ligar('p1', 'c0', 'TEST', 'l1', LOJA_TESTE).aviso).toMatch(/TEST só no parceiro de homologação/);
          expect(psql(superuser, ['-c', `UPDATE "ParceiroFlow" SET "homologacaoDeIntegracao" = true WHERE id = 'p1'`]).ok).toBe(true);
          const c1 = ligar('p1', 'c1', 'TEST', 'l1', LOJA_TESTE, `'m1'`);
          expect(c1.ok, c1.aviso).toBe(true);
          // PRODUCAO nunca no parceiro de homologação; TEST nunca no parceiro real.
          expect(ligar('p1', 'c2', 'PRODUCAO', 'l1', OUTRA_LOJA).aviso).toMatch(/PRODUCAO nunca nele/);
          expect(ligar('p2', 'c3', 'TEST', 'l2', OUTRA_LOJA).aviso).toMatch(/TEST só no parceiro de homologação/);
          // O merchant do iFood é um UUID.
          expect(ligar('p1', 'c4', 'TEST', 'l1', 'loja-123').aviso).toContain('IntegracaoConexao_id_externo');
          // A loja do iFood ativa num parceiro só, em toda a base (o índice fica fora da RLS).
          expect(psql(superuser, ['-c', `UPDATE "ParceiroFlow" SET "homologacaoDeIntegracao" = true WHERE id = 'p2'`]).ok).toBe(true);
          expect(ligar('p2', 'c5', 'TEST', 'l2', LOJA_TESTE).aviso).toContain('IntegracaoConexao_externa_ativa_key');
          expect(psql(superuser, ['-c', `UPDATE "ParceiroFlow" SET "homologacaoDeIntegracao" = false WHERE id = 'p2'`]).ok).toBe(true);
          // A identidade da conexão não muda; o parceiro também não.
          expect(como('p1', `UPDATE "IntegracaoConexao" SET "idExterno" = '${OUTRA_LOJA}' WHERE id = 'c1'`).aviso).toMatch(/não troca de provedor, ambiente, loja do provedor nem loja/);
          expect(como('p1', `UPDATE "IntegracaoConexao" SET "parceiroId" = 'p2' WHERE id = 'c1'`).ok).toBe(false);
          // Desligar é estado (com quem e quando); desligada não volta; ligar de novo é linha nova.
          expect(como('p1', `UPDATE "IntegracaoConexao" SET estado = 'DESLIGADA' WHERE id = 'c1'`).aviso).toContain('IntegracaoConexao_desligada');
          expect(como('p1', `UPDATE "IntegracaoConexao" SET estado = 'DESLIGADA', "desligadaEm" = now(), "desligadaPorNome" = 'Rodolfo' WHERE id = 'c1'`).ok).toBe(true);
          expect(como('p1', `UPDATE "IntegracaoConexao" SET estado = 'ATIVA', "desligadaEm" = NULL, "desligadaPorNome" = NULL WHERE id = 'c1'`).aviso).toMatch(/desligada não volta/);
          const c6 = ligar('p1', 'c6', 'TEST', 'l1', LOJA_TESTE);
          expect(c6.ok, c6.aviso).toBe(true);

          // O módulo: app do mesmo ambiente e com o módulo; conexão, app e módulo não mudam; ativo tem autor.
          const modulo = (id: string, appId: string, mod: string, conexao = 'c6') =>
            como('p1', `INSERT INTO "IntegracaoConexaoModulo"(id,"parceiroId","conexaoId","appId",modulo,"criadoPorNome","atualizadoEm") VALUES ('${id}','p1','${conexao}','${appId}','${mod}','Rodolfo',now())`);
          const cm1 = modulo('cm1', 'a1', 'ANALYTICS');
          expect(cm1.ok, cm1.aviso).toBe(true);
          expect(modulo('cm2', 'a1', 'FINANCIAL').aviso).toMatch(/o app não serve a esta conexão/);
          expect(modulo('cm3', 'a2', 'ANALYTICS', 'c1').aviso).toMatch(/o app não serve a esta conexão/);
          expect(modulo('cm4', 'nada', 'REVIEW').aviso).toMatch(/app do módulo não existe/);
          expect(como('p1', `UPDATE "IntegracaoConexaoModulo" SET "appId" = 'a2' WHERE id = 'cm1'`).aviso).toMatch(/não troca de conexão, app nem módulo/);
          expect(como('p1', `UPDATE "IntegracaoConexaoModulo" SET estado = 'ATIVO' WHERE id = 'cm1'`).aviso).toContain('IntegracaoConexaoModulo_ativo_tem_autor');
          expect(como('p1', `UPDATE "IntegracaoConexaoModulo" SET estado = 'ERRO_PERMISSAO' WHERE id = 'cm1'`).aviso).toContain('IntegracaoConexaoModulo_erro_dito');
          expect(como('p1', `UPDATE "IntegracaoConexaoModulo" SET estado = 'ATIVO', "ativadoEm" = now(), "ativadoPorNome" = 'Rodolfo' WHERE id = 'cm1'`).ok).toBe(true);

          // A liberação do módulo do parceiro.
          expect(como('p1', `INSERT INTO "LiberacaoDeModulo"(id,"parceiroId",modulo,liberado,"mudadoPorNome") VALUES ('lm1','p1','integracao',true,'Rodolfo')`).ok).toBe(true);
          expect(como('p1', `INSERT INTO "LiberacaoDeModulo"(id,"parceiroId",modulo,liberado,"mudadoPorNome") VALUES ('lm2','p1','Integração!',true,'Rodolfo')`).aviso).toContain('LiberacaoDeModulo_modulo');

          if (comRls) {
            // Sem DELETE para o papel do tenant: desligar, pausar e bloquear são estados.
            for (const t of ['IntegracaoConexao', 'IntegracaoConexaoModulo', 'LiberacaoDeModulo']) {
              expect(como('p1', `DELETE FROM "${t}"`).aviso, t).toMatch(new RegExp(`permission denied for table ${t}`));
            }
            // O outro parceiro não enxerga nem muda.
            const deP2 = (t: string) => como('p2', `SELECT count(*) FROM "${t}"`).saida.split('\n').pop();
            for (const t of ['IntegracaoConexao', 'IntegracaoConexaoModulo', 'LiberacaoDeModulo']) expect(deP2(t), t).toBe('0');
            como('p2', `UPDATE "IntegracaoConexaoModulo" SET "ultimoErro" = 'x', "ultimoErroEm" = now()`);
            expect(psql(superuser, ['-c', `SELECT count(*) FROM "IntegracaoConexaoModulo" WHERE "ultimoErro" IS NOT NULL`]).saida).toBe('0');
            // Nem grava em nome dele.
            expect(como('p2', `INSERT INTO "LiberacaoDeModulo"(id,"parceiroId",modulo,liberado,"mudadoPorNome") VALUES ('lm3','p1','integracao-b',true,'X')`).aviso).toMatch(/row-level security/);
          }

          // O app não se apaga (nem por quem é dono).
          expect(psql(dono, ['-c', `DELETE FROM "IntegracaoApp" WHERE id = 'a1'`]).aviso).toMatch(/o app da integração não se apaga/);
          expect(psql(superuser, ['-c', `SELECT count(*) FROM "IntegracaoApp"`]).saida).toBe('2');

          expect(await conferirMigracao(db)).toEqual([]);
          // O conferidor acusa o que faltar (e diz qual migration rodar).
          expect(psql(superuser, ['-c', `DROP INDEX "IntegracaoConexao_externa_ativa_key"`]).ok).toBe(true);
          expect(psql(superuser, ['-c', `DROP TRIGGER "IntegracaoConexao_confere" ON "IntegracaoConexao"`]).ok).toBe(true);
          expect(await conferirMigracao(db)).toEqual([
            expect.stringMatching(/Índice IntegracaoConexao_externa_ativa_key NÃO existe: a migration 20261115000000_erp_integracao_fundacao/),
            expect.stringMatching(/Gatilho IntegracaoConexao_confere NÃO existe: a migration 20261115000000_erp_integracao_fundacao/),
          ]);
          if (comRls) {
            expect(psql(superuser, ['-c', `ALTER TABLE "IntegracaoConexaoModulo" NO FORCE ROW LEVEL SECURITY`]).ok).toBe(true);
            expect(psql(superuser, ['-c', `GRANT SELECT ON "IntegracaoToken" TO erp_tenant`]).ok).toBe(true);
            const pend = (await conferirMigracao(db)).join('\n');
            expect(pend).toMatch(/Tabela IntegracaoConexaoModulo sem RLS forçada/);
            expect(pend).toMatch(/O papel erp_tenant alcança a tabela global IntegracaoToken/);
          }
        } finally {
          await db.$disconnect();
        }
      });
    });
  }
});
