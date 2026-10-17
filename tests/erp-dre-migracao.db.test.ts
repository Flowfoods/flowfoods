/**
 * ERP 2.2a · a migration `20261026000000_erp_dre_despesas` com DADO ANTIGO plantado,
 * como superusuário e como DONO NÃO-SUPERUSUÁRIO (com RLS FORÇADA e sem RLS).
 *
 * Cria bancos descartáveis, leva cada um até a migration anterior, planta linhas de
 * plano de contas, despesa e período (boas, que violam cada CHECK novo, e períodos antigos
 * que se cruzam) e parceiros com a configuração antiga de período, e aplica a migration:
 *  - nenhuma linha some e a migration NÃO falha por causa de dado antigo (lição da 2.1:
 *    nenhum passo depende de SELECT sob RLS);
 *  - o CHECK violado fica NOT VALID (convalidated = false) e vale para escrita nova; os
 *    outros ficam validados; o conferidor pós-deploy lista exatamente os pendentes;
 *  - a primeira regra do período de cada parceiro é copiada da configuração antiga
 *    (personalizado vira o mês civil; semanal com dia acima de 7 vira segunda);
 *  - a RLS da tabela nova só existe onde dá para instalar (FORCE = o perfil);
 *  - o gatilho recusa período que cruza outro e deixa os cruzados antigos como estão.
 *
 * Precisa de `psql`, de permissão para criar banco e, para os cenários de dono, dos papéis
 * `ff_dono` e `ff_semrls`:
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-dre-migracao.db.test.ts
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { conferirMigracao } from '../scripts/erp-conferir-migracao';

const URL_TESTE = process.env.ERP_DB_TESTE;
const MIGRACOES = join(process.cwd(), 'prisma', 'migrations');
const DA_2_2A = '20261026000000_erp_dre_despesas';
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

describe.skipIf(!URL_TESTE || !temPsql)('ERP 2.2a · migration com dado antigo (Postgres real)', { timeout: 240_000 }, () => {
  const sufixo = globalThis.crypto.randomUUID().slice(0, 8).replace(/-/g, '');
  const criados: string[] = [];

  afterAll(() => {
    for (const b of criados) psql(urlDe('postgres'), ['-c', `DROP DATABASE IF EXISTS ${b} WITH (FORCE)`]);
  });

  /** Banco novo, dono = o perfil, migrations até a anterior, e o dado antigo plantado COM o papel do dono (no contexto do parceiro, se há RLS). */
  function preparar(perfil: Perfil, rotulo: string, plantar: boolean): { dono: string; superuser: string; comContexto: (sql: string) => string } {
    const banco = `ff_mig22a_${rotulo}_${sufixo}`;
    const dono = urlDe(banco, perfil.papel);
    const superuser = urlDe(banco);
    expect(psql(urlDe('postgres'), ['-c', `CREATE DATABASE ${banco}${perfil.papel ? ` OWNER ${perfil.papel}` : ''}`]).ok, `criar ${banco}`).toBe(true);
    criados.push(banco);
    if (perfil.papel) expect(psql(superuser, ['-c', `ALTER SCHEMA public OWNER TO ${perfil.papel}`]).ok).toBe(true);
    for (const m of antes(DA_2_2A)) {
      const r = psql(dono, ['-f', join(MIGRACOES, m, 'migration.sql')]);
      expect(r.ok, `${m}: ${r.aviso.slice(0, 300)}`).toBe(true);
    }
    const comRls = psql(superuser, ['-c', `SELECT relforcerowsecurity FROM pg_class WHERE relname = 'Despesa'`]).saida === 't';
    expect(comRls, `RLS forçada esperada = ${perfil.rls}`).toBe(perfil.rls);
    const comContexto = (sql: string) => (comRls ? `SELECT set_config('app.parceiro_id','p1',true), set_config('role','erp_tenant',true); ${sql}` : sql);
    // Configuração antiga de período (ParceiroFlow não é de tenant).
    const parceiros = [
      ['p1', 'SEMANAL', 3],
      ['p2', 'PERSONALIZADO', 1],
      ['p3', 'SEMANAL', 20],
      ['p4', 'MENSAL', 15],
      ['p5', 'MENSAL', 1],
      ['p6', 'QUINZENAL', 10],
    ];
    const valores = parceiros.map(([id, tipo, d]) => `('${id}','${id}','${id}','ATIVO','${tipo}',${d})`).join(',');
    expect(psql(dono, ['-c', `INSERT INTO "ParceiroFlow"(id,nome,slug,status,"periodoTipo","periodoDiaInicio") VALUES ${valores}`]).ok).toBe(true);
    if (plantar) {
      const sql = `
        INSERT INTO "Loja"(id,"parceiroId",nome,slug) VALUES ('l1','p1','Loja 1','l1');
        INSERT INTO "DreLinha"(id,"parceiroId",nome,grupo,calculada) VALUES
          ('dl_boa','p1','Aluguel','OCUPACAO',false),
          ('dl_nome','p1','','OUTRAS',false),
          ('dl_calc','p1','Linha calculada antiga','OUTRAS',true);
        INSERT INTO "Despesa"(id,"parceiroId","lojaId","linhaId",descricao,competencia,"valorCentavos","atualizadoEm") VALUES
          ('d_boa','p1','l1','dl_boa','Aluguel antigo','2026-09-01',310000,now()),
          ('d_valor','p1','l1','dl_boa','Valor zero','2026-09-02',0,now()),
          ('d_antiga','p1','l1','dl_boa','De 2019','2019-12-31',100,now()),
          ('d_desc','p1','l1','dl_boa','','2026-09-03',100,now());
        INSERT INTO "Despesa"(id,"parceiroId","lojaId","linhaId",descricao,competencia,"valorCentavos",canal,"atualizadoEm") VALUES
          ('d_canal','p1','l1','dl_boa','Com canal','2026-09-04',100,'IFOOD',now());
        INSERT INTO "PeriodoApuracao"(id,"parceiroId",nome,inicio,fim) VALUES
          ('per1','p1','Antigo 1','2026-09-01','2026-09-15'),
          ('per2','p1','Antigo 2 (cruza o 1)','2026-09-10','2026-09-30');`;
      const r = psql(dono, ['-c', comContexto(sql)]);
      expect(r.ok, r.aviso).toBe(true);
    }
    return { dono, superuser, comContexto };
  }

  for (const perfil of PERFIS) {
    const rotulo = perfil.papel ?? 'su';
    describe.skipIf(!!perfil.papel && !papelExiste(perfil.papel))(perfil.nome, () => {
      it('dado antigo que viola: a migration passa, avisa, nada some, a regra do período é copiada e o conferidor lista as pendências', async () => {
        const { dono, superuser, comContexto } = preparar(perfil, `${rotulo}s`, true);
        const conta = (t: string) => psql(superuser, ['-c', `SELECT count(*) FROM "${t}"`]).saida;
        expect([conta('DreLinha'), conta('Despesa'), conta('PeriodoApuracao')]).toEqual(['3', '5', '2']);
        const r = psql(dono, ['-f', join(MIGRACOES, DA_2_2A, 'migration.sql')]);
        expect(r.ok, r.aviso).toBe(true);
        expect(r.aviso).toContain('ficou NOT VALID');
        expect([conta('DreLinha'), conta('Despesa'), conta('PeriodoApuracao')]).toEqual(['3', '5', '2']);

        const estado = Object.fromEntries(
          psql(superuser, ['-c', `SELECT conname || '=' || convalidated FROM pg_constraint WHERE conname LIKE 'Despesa\\_%' OR conname LIKE 'DreLinha\\_%' ORDER BY 1`])
            .saida.split('\n')
            .map((l) => l.split('=')),
        );
        for (const nome of ['DreLinha_nome_curto', 'DreLinha_calculada_tem_codigo', 'Despesa_valor_faixa', 'Despesa_competencia_minima', 'Despesa_descricao_curta', 'Despesa_canal_nulo']) expect(estado[nome], nome).toBe('false');
        for (const nome of ['DreLinha_codigo_curto', 'Despesa_competencia_fim', 'Despesa_textos_curtos', 'Despesa_recorrente_de_mes_inteiro']) expect(estado[nome], nome).toBe('true');

        // Os CHECKs NOT VALID valem para escrita nova; a linha antiga boa continua editável.
        const nova = psql(dono, ['-c', comContexto(`INSERT INTO "Despesa"(id,"parceiroId","linhaId",descricao,competencia,"valorCentavos","atualizadoEm") VALUES ('n1','p1','dl_boa','x','2026-10-01',0,now())`)]);
        expect(nova.ok).toBe(false);
        expect(nova.aviso).toContain('Despesa_valor_faixa');
        expect(psql(dono, ['-c', comContexto(`UPDATE "Despesa" SET "valorCentavos" = 320000 WHERE id = 'd_boa'`)]).ok).toBe(true);

        // A regra do período: copiada da configuração antiga (visível ao superusuário: a RLS entra depois da cópia).
        const regras = Object.fromEntries(
          psql(superuser, ['-c', `SELECT "parceiroId" || '=' || tipo || ':' || "diaInicio" || ':' || "vigenteDesde" FROM "RegraDoPeriodo" ORDER BY 1`])
            .saida.split('\n')
            .map((l) => [l.split('=')[0], l.split('=')[1]]),
        );
        expect(regras).toEqual({
          p1: 'SEMANAL:3:2020-01-01',
          p2: 'MENSAL:1:2020-01-01', // personalizado (legado) vale o mês civil
          p3: 'SEMANAL:1:2020-01-01', // semanal com dia acima de 7 já valia segunda
          p4: 'MENSAL:15:2020-01-01',
          p5: 'MENSAL:1:2020-01-01',
          p6: 'QUINZENAL:10:2020-01-01',
        });
        // A RLS da tabela nova existe onde dá para instalar.
        expect(psql(superuser, ['-c', `SELECT relforcerowsecurity FROM pg_class WHERE relname = 'RegraDoPeriodo'`]).saida).toBe(perfil.rls ? 't' : 'f');
        if (perfil.rls) expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_policies WHERE tablename = 'RegraDoPeriodo'`]).saida).toBe('1');
        // Só se inclui.
        const up = psql(dono, ['-c', comContexto(`UPDATE "RegraDoPeriodo" SET "diaInicio" = 5 WHERE "parceiroId" = 'p1'`)]);
        expect(up.ok).toBe(false);
        expect(up.aviso).toContain('só se inclui');

        // O gatilho: período novo que cruza é recusado; os cruzados antigos continuam e ainda dá para mudar o status deles.
        const cruza = psql(dono, ['-c', comContexto(`INSERT INTO "PeriodoApuracao"(id,"parceiroId",nome,inicio,fim) VALUES ('per3','p1','Novo','2026-09-14','2026-09-20')`)]);
        expect(cruza.ok).toBe(false);
        expect(cruza.aviso).toContain('sobrepõe');
        expect(psql(dono, ['-c', comContexto(`INSERT INTO "PeriodoApuracao"(id,"parceiroId",nome,inicio,fim) VALUES ('per4','p1','Depois','2026-10-01','2026-10-31')`)]).ok).toBe(true);
        expect(psql(dono, ['-c', comContexto(`UPDATE "PeriodoApuracao" SET status = 'FECHADO' WHERE id = 'per2'`)]).ok).toBe(true);

        // O passo pós-deploy: nada fica escondido no WARNING.
        const db = new PrismaClient({ datasources: { db: { url: superuser } } });
        try {
          const p = await conferirMigracao(db);
          expect(p.filter((x) => x.includes('NOT VALID')).map((x) => /CHECK (\S+)/.exec(x)![1]).sort()).toEqual(
            ['Despesa_canal_nulo', 'Despesa_competencia_minima', 'Despesa_descricao_curta', 'Despesa_valor_faixa', 'DreLinha_calculada_tem_codigo', 'DreLinha_nome_curto'],
          );
          expect(p.every((x) => x.includes('NOT VALID'))).toBe(true);
        } finally {
          await db.$disconnect();
        }
      });

      it('dado antigo bom (ou nenhum): tudo validado, nenhum aviso, a tabela nova tem a regra de cada parceiro e o conferidor sai limpo', async () => {
        const { dono, superuser, comContexto } = preparar(perfil, `${rotulo}l`, false);
        const r = psql(dono, ['-f', join(MIGRACOES, DA_2_2A, 'migration.sql')]);
        expect(r.ok, r.aviso).toBe(true);
        expect(r.aviso).not.toContain('WARNING');
        expect(psql(superuser, ['-c', 'SELECT count(*) FROM "RegraDoPeriodo"']).saida).toBe('6');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_constraint WHERE (conname LIKE 'Despesa\\_%' OR conname LIKE 'DreLinha\\_%') AND NOT convalidated`]).saida).toBe('0');
        // Os CHECKs novos recusam por SQL cru; o caminho feliz passa.
        const insere = (id: string, campos: string, valores: string) =>
          psql(dono, ['-c', comContexto(`INSERT INTO "Despesa"(id,"parceiroId","linhaId",descricao,competencia,"valorCentavos","atualizadoEm"${campos}) VALUES ('${id}','p1','dl1','x','2026-10-01',100,now()${valores})`)]);
        expect(psql(dono, ['-c', comContexto(`INSERT INTO "DreLinha"(id,"parceiroId",nome,grupo,codigo,"atualizadoEm") VALUES ('dl1','p1','Aluguel','OCUPACAO','aluguel',now())`)]).ok).toBe(true);
        expect(insere('ok1', '', '').ok).toBe(true);
        const quebrado = insere('ok2', ',"competenciaFim","recorrente"', `,'2026-10-30',true`); // recorrente exige o mês inteiro
        expect(quebrado.ok).toBe(false);
        expect(quebrado.aviso).toContain('recorrente_de_mes_inteiro');
        const mes = psql(dono, ['-c', comContexto(`INSERT INTO "Despesa"(id,"parceiroId","linhaId",descricao,competencia,"competenciaFim",recorrente,"valorCentavos","atualizadoEm") VALUES ('ok3','p1','dl1','mes','2026-10-01','2026-10-31',true,100,now())`)]);
        expect(mes.ok, mes.aviso).toBe(true);
        const dup = psql(dono, ['-c', comContexto(`INSERT INTO "Despesa"(id,"parceiroId","linhaId",descricao,competencia,"competenciaFim",recorrente,"repeteDeId","valorCentavos","atualizadoEm") VALUES ('f1','p1','dl1','a','2026-11-01','2026-11-30',true,'ok3',100,now()),('f2','p1','dl1','b','2026-11-01','2026-11-30',true,'ok3',100,now())`)]);
        expect(dup.ok).toBe(false); // a mesma origem não repete duas vezes
        expect(dup.aviso).toContain('repeteDeId');
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
