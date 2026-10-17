/**
 * ERP 2.2b · a migration `20261027000000_erp_dre_fechamento` com DADO ANTIGO plantado, como superusuário e como
 * DONO NÃO-SUPERUSUÁRIO (com RLS FORÇADA e sem RLS).
 *
 * Cria bancos descartáveis, leva cada um até a migration anterior (a 2.2a), planta metas, linhas do plano e períodos (um
 * aberto, um FECHADO sem data de fechamento — que viola o CHECK novo — e um FECHADO antigo, de antes da fotografia) e aplica a
 * migration:
 *  - nada some e a migration NÃO falha por causa de dado antigo (lição da 2.1: nenhum passo depende de SELECT sob RLS);
 *  - o CHECK violado fica NOT VALID e vale para escrita nova; os outros ficam validados; o conferidor pós-deploy lista
 *    exatamente isso e que não há CHECK pendente;
 *  - as metas antigas ganham os valores padrão (`semMeta` falso) e continuam legíveis;
 *  - as duas tabelas novas nascem com RLS onde dá para instalar, sem DELETE (nem UPDATE na linha) para o papel do tenant;
 *  - os gatilhos valem: a fotografia nasce com as linhas na mesma transação e depois não muda; o período só fica FECHADO com
 *    fotografia vigente; datas de período fechado não mudam; marcar a fotografia como substituída sem reabrir o período é recusado.
 *
 * Precisa de `psql`, de permissão para criar banco e, para os cenários de dono, dos papéis `ff_dono` e `ff_semrls`:
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-dre-fechamento-migracao.db.test.ts
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { conferirMigracao } from '../scripts/erp-conferir-migracao';

const URL_TESTE = process.env.ERP_DB_TESTE;
const MIGRACOES = join(process.cwd(), 'prisma', 'migrations');
const DA_2_2B = '20261027000000_erp_dre_fechamento';
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

const admin = () => psql(urlDe('postgres'), ['-c', 'select 1']);
const papelExiste = (papel: string) => !!URL_TESTE && temPsql && psql(urlDe('postgres'), ['-c', `select count(*) from pg_roles where rolname = '${papel}'`]).saida === '1';

describe.skipIf(!URL_TESTE || !temPsql)('ERP 2.2b · migration com dado antigo (Postgres real)', { timeout: 240_000 }, () => {
  const sufixo = globalThis.crypto.randomUUID().slice(0, 8).replace(/-/g, '');
  const criados: string[] = [];

  afterAll(() => {
    for (const b of criados) psql(urlDe('postgres'), ['-c', `DROP DATABASE IF EXISTS ${b} WITH (FORCE)`]);
  });

  /** Banco novo, dono = o perfil, migrations até a anterior, e o dado antigo plantado COM o papel do dono (no contexto do parceiro, se há RLS). */
  function preparar(perfil: Perfil, rotulo: string, plantar: boolean) {
    const banco = `ff_mig22b_${rotulo}_${sufixo}`;
    const dono = urlDe(banco, perfil.papel);
    const superuser = urlDe(banco);
    expect(psql(urlDe('postgres'), ['-c', `CREATE DATABASE ${banco}${perfil.papel ? ` OWNER ${perfil.papel}` : ''}`]).ok, `criar ${banco}`).toBe(true);
    criados.push(banco);
    if (perfil.papel) expect(psql(superuser, ['-c', `ALTER SCHEMA public OWNER TO ${perfil.papel}`]).ok).toBe(true);
    for (const m of antes(DA_2_2B)) {
      const r = psql(dono, ['-f', join(MIGRACOES, m, 'migration.sql')]);
      expect(r.ok, `${m}: ${r.aviso.slice(0, 300)}`).toBe(true);
    }
    const comRls = psql(superuser, ['-c', `SELECT relforcerowsecurity FROM pg_class WHERE relname = 'DreMeta'`]).saida === 't';
    expect(comRls, `RLS forçada esperada = ${perfil.rls}`).toBe(perfil.rls);
    const comContexto = (sql: string, parceiro = 'p1') => (comRls ? `SELECT set_config('app.parceiro_id','${parceiro}',true), set_config('role','erp_tenant',true); ${sql}` : sql);
    expect(psql(dono, ['-c', `INSERT INTO "ParceiroFlow"(id,nome,slug,status) VALUES ('p1','P1','p1','ATIVO'),('p2','P2','p2','ATIVO')`]).ok).toBe(true);
    if (plantar) {
      const sql = `
        INSERT INTO "Loja"(id,"parceiroId",nome,slug) VALUES ('l1','p1','Loja 1','l1');
        INSERT INTO "DreLinha"(id,"parceiroId",nome,grupo,calculada,codigo,"atualizadoEm") VALUES
          ('dl1','p1','Aluguel','OCUPACAO',false,'aluguel',now()),
          ('dl2','p1','CMV','CMV',true,'cmv',now());
        INSERT INTO "DreMeta"(id,"parceiroId","linhaId","percentualBp","vigenteDesde") VALUES
          ('m1','p1','dl1',1500,'2026-01-01'),
          ('m2','p1','dl2',3000,'2026-01-01');
        INSERT INTO "PeriodoApuracao"(id,"parceiroId",nome,inicio,fim,status,"fechadoEm") VALUES
          ('pa','p1','Agosto (aberto)','2026-08-01','2026-08-31','ABERTO',NULL),
          ('pf','p1','Julho (fechado sem data)','2026-07-01','2026-07-31','FECHADO',NULL),
          ('pg','p1','Junho (fechado antigo)','2026-06-01','2026-06-30','FECHADO',now());`;
      const r = psql(dono, ['-c', comContexto(sql)]);
      expect(r.ok, r.aviso).toBe(true);
    }
    return { dono, superuser, comContexto };
  }

  for (const perfil of PERFIS) {
    const rotulo = perfil.papel ?? 'su';
    describe.skipIf(!!perfil.papel && !papelExiste(perfil.papel))(perfil.nome, () => {
      it('dado antigo (meta, período fechado sem data, fechado antigo sem fotografia): a migration passa, avisa, nada some, e o conferidor lista só o CHECK pendente', async () => {
        const { dono, superuser, comContexto } = preparar(perfil, `${rotulo}s`, true);
        const conta = (t: string) => psql(superuser, ['-c', `SELECT count(*) FROM "${t}"`]).saida;
        expect([conta('DreMeta'), conta('PeriodoApuracao')]).toEqual(['2', '3']);
        const r = psql(dono, ['-f', join(MIGRACOES, DA_2_2B, 'migration.sql')]);
        expect(r.ok, r.aviso).toBe(true);
        expect(r.aviso).toContain('ficou NOT VALID');
        expect(r.aviso).toContain('PeriodoApuracao_fechado_tem_data');
        expect([conta('DreMeta'), conta('PeriodoApuracao')]).toEqual(['2', '3']);

        const estado = Object.fromEntries(
          psql(superuser, ['-c', `SELECT conname || '=' || convalidated FROM pg_constraint WHERE conname LIKE 'DreMeta\\_%' OR conname LIKE 'PeriodoApuracao\\_%' ORDER BY 1`])
            .saida.split('\n')
            .map((l) => l.split('=')),
        );
        expect(estado['PeriodoApuracao_fechado_tem_data']).toBe('false');
        for (const nome of ['DreMeta_sem_meta_zera', 'DreMeta_nome_curto', 'PeriodoApuracao_fechadoPor_curto']) expect(estado[nome], nome).toBe('true');

        // As metas antigas ganham os padrões e seguem lidas; o CHECK novo vale para escrita nova.
        expect(psql(superuser, ['-c', `SELECT "semMeta"::text || ':' || "criadoPorNome" || ':' || ("atualizadoEm" IS NOT NULL)::text FROM "DreMeta" WHERE id = 'm1'`]).saida).toBe('false::true');
        const ruim = psql(dono, ['-c', comContexto(`INSERT INTO "DreMeta"(id,"parceiroId","linhaId","percentualBp","vigenteDesde","semMeta") VALUES ('m3','p1','dl1',500,'2026-09-01',true)`)]);
        expect(ruim.ok).toBe(false);
        expect(ruim.aviso).toContain('DreMeta_sem_meta_zera');
        expect(psql(dono, ['-c', comContexto(`INSERT INTO "DreMeta"(id,"parceiroId","linhaId","percentualBp","vigenteDesde","semMeta") VALUES ('m3','p1','dl1',0,'2026-09-01',true)`)]).ok).toBe(true);
        // O período antigo fechado sem data: a escrita nova que o deixa FECHADO sem data é recusada pelo CHECK.
        const semData = psql(dono, ['-c', comContexto(`UPDATE "PeriodoApuracao" SET "fechadoPorNome" = 'x' WHERE id = 'pf'`)]);
        expect(semData.ok).toBe(false); // a linha violadora não aceita nenhuma escrita nova até ser corrigida
        // Reabrir um fechado antigo (sem fotografia) é possível: vira ABERTO e passa em todos os cintos.
        expect(psql(dono, ['-c', comContexto(`UPDATE "PeriodoApuracao" SET "status" = 'ABERTO', "fechadoEm" = NULL WHERE id IN ('pf','pg')`)]).ok).toBe(true);
        // ...e a que continua FECHADO sem fotografia não aceita escrita (o cinto adiado), mas o dado dela está intacto.
        expect(psql(superuser, ['-c', `SELECT count(*) FROM "PeriodoApuracao" WHERE status = 'ABERTO'`]).saida).toBe('3');
        const db = new PrismaClient({ datasources: { db: { url: superuser } } });
        try {
          const p = await conferirMigracao(db);
          expect(p.filter((x) => x.includes('NOT VALID')).map((x) => /CHECK (\S+)/.exec(x)![1])).toEqual(['PeriodoApuracao_fechado_tem_data']);
          expect(p.every((x) => x.includes('NOT VALID'))).toBe(true);
        } finally {
          await db.$disconnect();
        }
      });

      it('a fotografia: nasce com as linhas na MESMA transação, depois não muda; o período só fecha com ela; reabrir é a única saída', async () => {
        const { dono, superuser, comContexto } = preparar(perfil, `${rotulo}l`, false);
        const r = psql(dono, ['-f', join(MIGRACOES, DA_2_2B, 'migration.sql')]);
        expect(r.ok, r.aviso).toBe(true);
        expect(r.aviso).not.toContain('WARNING');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_constraint WHERE (conname LIKE 'DreMeta\\_%' OR conname LIKE 'PeriodoApuracao\\_%' OR conname LIKE 'DreFotografia%') AND NOT convalidated`]).saida).toBe('0');

        // RLS e privilégios das tabelas novas, conforme o perfil.
        for (const t of ['DreFotografia', 'DreFotografiaLinha']) {
          expect(psql(superuser, ['-c', `SELECT relforcerowsecurity FROM pg_class WHERE relname = '${t}'`]).saida, t).toBe(perfil.rls ? 't' : 'f');
          if (perfil.rls) {
            expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_policies WHERE tablename = '${t}'`]).saida, t).toBe('1');
            const priv = (op: string) => psql(superuser, ['-c', `SELECT has_table_privilege('erp_tenant', '"${t}"', '${op}')::text`]).saida;
            expect([priv('SELECT'), priv('INSERT'), priv('DELETE')], t).toEqual(['true', 'true', 'false']);
            expect(priv('UPDATE'), t).toBe(t === 'DreFotografia' ? 'false' : 'false'); // só colunas específicas, nunca a tabela inteira
          }
        }
        if (perfil.rls) {
          const col = (c: string) => psql(superuser, ['-c', `SELECT has_column_privilege('erp_tenant', '"DreFotografia"', '${c}', 'UPDATE')::text`]).saida;
          expect([col('substituidaEm'), col('reabertaPorNome'), col('motivoReabertura'), col('entrada'), col('fechadoPorNome')]).toEqual(['true', 'true', 'true', 'false', 'false']);
        }

        const ctx = (sql: string) => comContexto(sql);
        const base = `
          INSERT INTO "PeriodoApuracao"(id,"parceiroId",nome,inicio,fim) VALUES ('pa','p1','Setembro','2026-09-01','2026-09-30'),('pb','p1','Agosto','2026-08-01','2026-08-31');`;
        expect(psql(dono, ['-c', ctx(base)]).ok).toBe(true);
        const foto = (id: string, periodo: string, versao: number) =>
          `INSERT INTO "DreFotografia"(id,"parceiroId","periodoId",versao,inicio,fim,"nomeDoPeriodo","fechadoPorNome",entrada) VALUES ('${id}','p1','${periodo}',${versao},'2026-09-01','2026-09-30','Setembro','Ana','{}'::jsonb);`;
        const linhaDe = (id: string, f: string) =>
          `INSERT INTO "DreFotografiaLinha"(id,"parceiroId","fotografiaId","ordem",chave,nome,grupo,tipo,nivel,sentido,"valorCentavos","semContar") VALUES ('${id}','p1','${f}',0,'grupo:RECEITA','Receita bruta','RESULTADO','subtotal',0,'MAIOR_MELHOR',100,'{}');`;

        // FECHADO sem fotografia: recusado ao fim da transação.
        const sem = psql(dono, ['-c', ctx(`UPDATE "PeriodoApuracao" SET status = 'FECHADO', "fechadoEm" = now() WHERE id = 'pa'`)]);
        expect(sem.ok).toBe(false);
        expect(sem.aviso).toContain('PeriodoApuracao_fechado_tem_fotografia');
        // Fotografia + linhas + período FECHADO na MESMA transação: passa.
        const ok = psql(dono, ['-c', ctx(`${foto('f1', 'pa', 1)} ${linhaDe('ln1', 'f1')} UPDATE "PeriodoApuracao" SET status = 'FECHADO', "fechadoEm" = now(), "fechadoPorNome" = 'Ana' WHERE id = 'pa';`)]);
        expect(ok.ok, ok.aviso).toBe(true);
        // Linha numa fotografia que já existe (outra transação): recusada.
        const outra = psql(dono, ['-c', ctx(linhaDe('ln2', 'f1').replace("'grupo:RECEITA'", "'outra'"))]);
        expect(outra.ok).toBe(false);
        expect(outra.aviso).toContain('DreFotografiaLinha_so_inclusao');
        // Não muda, não apaga: nem como dono (os gatilhos valem para quem for).
        for (const sql of [
          `UPDATE "DreFotografiaLinha" SET "valorCentavos" = 1 WHERE id = 'ln1'`,
          `DELETE FROM "DreFotografiaLinha" WHERE id = 'ln1'`,
          `UPDATE "DreFotografia" SET "fechadoPorNome" = 'Outra' WHERE id = 'f1'`,
          `DELETE FROM "DreFotografia" WHERE id = 'f1'`,
          `UPDATE "PeriodoApuracao" SET inicio = '2026-09-02' WHERE id = 'pa'`,
          `UPDATE "PeriodoApuracao" SET nome = 'Outro' WHERE id = 'pa'`,
          // Substituir a fotografia sem reabrir o período deixaria o FECHADO sem fotografia vigente.
          `UPDATE "DreFotografia" SET "substituidaEm" = now(), "reabertaPorNome" = 'x', "motivoReabertura" = 'abc' WHERE id = 'f1'`,
          // Duas vigentes do mesmo período.
          foto('f2', 'pa', 2),
        ]) {
          expect(psql(dono, ['-c', ctx(sql)]).ok, sql).toBe(false);
        }
        // A reabertura de verdade: marca a fotografia e volta o período a ABERTO, na mesma transação.
        const reabre = psql(dono, ['-c', ctx(`UPDATE "DreFotografia" SET "substituidaEm" = now(), "reabertaPorNome" = 'Rodolfo', "motivoReabertura" = 'nota esquecida' WHERE id = 'f1'; UPDATE "PeriodoApuracao" SET status = 'ABERTO', "fechadoEm" = NULL, "fechadoPorNome" = NULL WHERE id = 'pa';`)]);
        expect(reabre.ok, reabre.aviso).toBe(true);
        // Marcar de novo a mesma (substituída duas vezes): recusado.
        expect(psql(dono, ['-c', ctx(`UPDATE "DreFotografia" SET "substituidaEm" = now(), "reabertaPorNome" = 'Outro', "motivoReabertura" = 'de novo' WHERE id = 'f1'`)]).ok).toBe(false);
        // Fecha de novo: a versão 2, a única vigente.
        expect(psql(dono, ['-c', ctx(`${foto('f2', 'pa', 2)} ${linhaDe('ln3', 'f2')} UPDATE "PeriodoApuracao" SET status = 'FECHADO', "fechadoEm" = now() WHERE id = 'pa';`)]).ok).toBe(true);
        expect(psql(superuser, ['-c', `SELECT count(*) FROM "DreFotografia" WHERE "substituidaEm" IS NULL`]).saida).toBe('1');
        // A chave não repete na mesma fotografia, nem para a rede (loja nula).
        expect(psql(dono, ['-c', ctx(`${linhaDe('ln4', 'f2')}`)]).ok).toBe(false);

        // O papel do tenant só enxerga o parceiro dele e não apaga (quando há RLS).
        if (perfil.rls) {
          const outroParceiro = psql(dono, ['-c', comContexto(`SELECT count(*) FROM "DreFotografia"`, 'p2')]);
          expect(outroParceiro.saida.split('\n').pop()).toBe('0');
          const del = psql(dono, ['-c', comContexto(`DELETE FROM "DreFotografia" WHERE true`)]);
          expect(del.ok).toBe(false);
        }
        // Sem dado antigo: o conferidor sai limpo.
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
