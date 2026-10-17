/**
 * ERP 3.1 · a migration `20261029000000_erp_producao` com DADO ANTIGO plantado, como superusuário e como DONO NÃO-SUPERUSUÁRIO
 * (com RLS FORÇADA e sem RLS).
 *
 * Cria bancos descartáveis, leva cada um até a migration anterior (a 2.3), planta ordens de produção (a 0.1 desenhou a tabela
 * e nenhuma tela a usava, mas a migration não pode supor isso) e aplica a migration:
 *  - banco LIMPO: nada some, não avisa, todos os CHECKs entram validados, o índice (parceiro, requisição) nasce, os dois
 *    gatilhos existem e o conferidor pós-deploy não lista pendência;
 *  - banco com DADO RUIM (concluída sem resultado, código de lote fora do formato, duas ordens na mesma requisição): a
 *    migration NÃO falha; os CHECKs que a linha antiga viola ficam NOT VALID (e valem para toda escrita nova), o índice
 *    único não nasce, avisa com WARNING, e o conferidor lista cada pendência;
 *  - depois da migration, o lote anda (planejada → concluída pelo papel do tenant), a concluída não muda mais, o estorno
 *    (CONCLUIDA → CANCELADA) passa, e a entrada do lote só cai no insumo produzido da loja da ordem.
 * Nenhum passo da migration depende de SELECT sob RLS.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-producao-migracao.db.test.ts
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { conferirMigracao } from '../scripts/erp-conferir-migracao';

const URL_TESTE = process.env.ERP_DB_TESTE;
const MIGRACOES = join(process.cwd(), 'prisma', 'migrations');
const DA_3_1 = '20261029000000_erp_producao';
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

// A concluída sem resultado e sem início viola dois; o código "ABC" viola o do formato.
const CHECKS_QUE_O_DADO_RUIM_VIOLA = ['OrdemProducao_concluida_tem_resultado', 'OrdemProducao_iniciada_tem_data', 'OrdemProducao_codigo_do_lote'];

describe.skipIf(!URL_TESTE || !temPsql)('ERP 3.1 · migration com dado antigo (Postgres real)', { timeout: 360_000 }, () => {
  const sufixo = globalThis.crypto.randomUUID().slice(0, 8).replace(/-/g, '');
  const criados: string[] = [];

  afterAll(() => {
    for (const b of criados) psql(urlDe('postgres'), ['-c', `DROP DATABASE IF EXISTS ${b} WITH (FORCE)`]);
  });

  /** Cria o banco, leva até a 2.3, planta o que a 0.1 permitia gravar e devolve o necessário para seguir. */
  function prepararBanco(perfil: Perfil, rotulo: string, ruim: boolean) {
    const banco = `ff_mig31_${rotulo}_${ruim ? 'ruim' : 'limpo'}_${sufixo}`;
    const dono = urlDe(banco, perfil.papel);
    const superuser = urlDe(banco);
    expect(psql(urlDe('postgres'), ['-c', `CREATE DATABASE ${banco}${perfil.papel ? ` OWNER ${perfil.papel}` : ''}`]).ok, `criar ${banco}`).toBe(true);
    criados.push(banco);
    if (perfil.papel) expect(psql(superuser, ['-c', `ALTER SCHEMA public OWNER TO ${perfil.papel}`]).ok).toBe(true);
    for (const m of antes(DA_3_1)) {
      const r = psql(dono, ['-f', join(MIGRACOES, m, 'migration.sql')]);
      expect(r.ok, `${m}: ${r.aviso.slice(0, 300)}`).toBe(true);
    }
    const comRls = psql(superuser, ['-c', `SELECT relforcerowsecurity FROM pg_class WHERE relname = 'OrdemProducao'`]).saida === 't';
    expect(comRls, `RLS forçada esperada = ${perfil.rls}`).toBe(perfil.rls);
    const comContexto = (sql: string) => (comRls ? `SELECT set_config('app.parceiro_id','p1',true), set_config('role','erp_tenant',true); ${sql}` : sql);
    expect(psql(dono, ['-c', `INSERT INTO "ParceiroFlow"(id,nome,slug,status) VALUES ('p1','P1','p1','ATIVO')`]).ok).toBe(true);
    const base = `
      INSERT INTO "Loja"(id,"parceiroId",nome,slug) VALUES ('l1','p1','Loja 1','l1'),('l2','p1','Loja 2','l2');
      INSERT INTO "Insumo"(id,"parceiroId",nome,unidade,tipo,"conteudoMilesimos","precoEmbalagemCentavos","conservacao","atualizadoEm") VALUES
        ('i1','p1','Molho','KG','PRE_PREPARO',1000,0,'REFRIGERADO',now());
      INSERT INTO "FichaTecnica"(id,"parceiroId",nome,tipo,"rendimentoMilesimos","unidadeRendimento","insumoProduzidoId","atualizadoEm") VALUES ('f1','p1','Molho','PRE_PREPARO',2000,'KG','i1',now());
      INSERT INTO "Requisicao"(id,"parceiroId","lojaId") VALUES ('r1','p1','l1'),('r2','p1','l1'),('r3','p1','l1');`;
    const ordens = `
      INSERT INTO "OrdemProducao"(id,"parceiroId","lojaId","fichaId","insumoProduzidoId","codigoLote",status,"dataPlanejada","planejadoMilesimos","fichaNomeSnapshot","requisicaoId") VALUES
        ('o1','p1','l1','f1','i1','261001-01','PLANEJADA','2026-10-01',5000,'Molho','r1')
        ${ruim ? `,('o2','p1','l1','f1','i1','261001-02','CONCLUIDA','2026-10-01',5000,'Molho','r2')
        ,('o3','p1','l1','f1','i1','ABC','PLANEJADA','2026-10-01',5000,'Molho','r3')
        ,('o4','p1','l1','f1','i1','261001-04','PLANEJADA','2026-10-01',5000,'Molho','r3')` : `,('o2','p1','l1','f1','i1','261001-02','CONCLUIDA','2026-10-01',5000,'Molho','r2')`};`;
    // No banco limpo a concluída tem o resultado completo; no ruim ela não tem (a 0.1 deixava gravar assim).
    const limpoConcluida = ruim ? '' : `UPDATE "OrdemProducao" SET "produzidoMilesimos" = 4600, "custoTotalCentavos" = 11781, "concluidaEm" = now(), "iniciadaEm" = now() WHERE id = 'o2';`;
    const plantado = psql(dono, ['-c', comContexto(`${base} ${ordens} ${limpoConcluida}`)]);
    expect(plantado.ok, plantado.aviso).toBe(true);
    return { banco, dono, superuser, comContexto, comRls };
  }

  for (const perfil of PERFIS) {
    const rotulo = perfil.papel ?? 'su';
    describe.skipIf(!!perfil.papel && !papelExiste(perfil.papel))(perfil.nome, () => {
      it('banco LIMPO: nada some, sem aviso, CHECKs validados, índice criado, gatilhos presentes, o lote anda e a concluída não muda; o conferidor não acha pendência', async () => {
        const { dono, superuser, comContexto } = prepararBanco(perfil, rotulo, false);
        const conta = () => psql(superuser, ['-c', `SELECT count(*) FROM "OrdemProducao"`]).saida;
        expect(conta()).toBe('2');

        const r = psql(dono, ['-f', join(MIGRACOES, DA_3_1, 'migration.sql')]);
        expect(r.ok, r.aviso).toBe(true);
        expect(r.aviso).not.toContain('WARNING');
        expect(conta()).toBe('2');
        // As linhas antigas ganham os padrões: versão 0 e o resto nulo.
        expect(psql(superuser, ['-c', `SELECT count(*) FROM "OrdemProducao" WHERE versao = 0 AND "canceladaEm" IS NULL AND "chaveIdempotencia" IS NULL AND "validadeEm" IS NULL`]).saida).toBe('2');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_constraint WHERE conname LIKE 'OrdemProducao\\_%' AND NOT convalidated`]).saida).toBe('0');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_indexes WHERE indexname = 'OrdemProducao_parceiroId_requisicaoId_key'`]).saida).toBe('1');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_trigger WHERE tgname IN ('OrdemProducao_concluida_imutavel','MovimentoEstoque_producao_confere')`]).saida).toBe('2');

        // A concluída não muda (produzido, custo, status), mas pode ser estornada: CONCLUIDA → CANCELADA com data e motivo.
        const mexe = psql(dono, ['-c', comContexto(`UPDATE "OrdemProducao" SET "produzidoMilesimos" = 1 WHERE id = 'o2'`)]);
        expect(mexe.ok).toBe(false);
        expect(mexe.aviso).toContain('OrdemProducao_concluida_imutavel');
        const volta = psql(dono, ['-c', comContexto(`UPDATE "OrdemProducao" SET status = 'PLANEJADA' WHERE id = 'o2'`)]);
        expect(volta.ok).toBe(false);
        const semMotivo = psql(dono, ['-c', comContexto(`UPDATE "OrdemProducao" SET status = 'CANCELADA', "canceladaEm" = now() WHERE id = 'o2'`)]);
        expect(semMotivo.ok).toBe(false);
        expect(semMotivo.aviso).toContain('OrdemProducao_cancelada_tem_motivo');
        const estorna = psql(dono, ['-c', comContexto(`UPDATE "OrdemProducao" SET status = 'CANCELADA', "canceladaEm" = now(), "canceladaPorNome" = 'Gil', "motivoCancelamento" = 'Lote contaminado', versao = versao + 1 WHERE id = 'o2'`)]);
        expect(estorna.ok, estorna.aviso).toBe(true);
        // E a cancelada não muda mais.
        expect(psql(dono, ['-c', comContexto(`UPDATE "OrdemProducao" SET observacao = 'x' WHERE id = 'o2'`)]).ok).toBe(false);

        // A planejada conclui: com resultado completo passa; sem o resultado o CHECK recusa.
        const incompleta = psql(dono, ['-c', comContexto(`UPDATE "OrdemProducao" SET status = 'CONCLUIDA' WHERE id = 'o1'`)]);
        expect(incompleta.ok).toBe(false);
        expect(incompleta.aviso).toContain('OrdemProducao_concluida_tem_resultado');
        const conclui = psql(dono, [
          '-c',
          comContexto(`UPDATE "OrdemProducao" SET status = 'CONCLUIDA', "produzidoMilesimos" = 4600, "custoTotalCentavos" = 11781, "concluidaEm" = now(), "iniciadaEm" = now(), "concluidaPorNome" = 'Caio', "insumosSemPreco" = 0, "conservacaoSnapshot" = 'REFRIGERADO', "validadeMinSnapshot" = 4320, "validadeEm" = now() + interval '3 days', versao = versao + 1 WHERE id = 'o1'`),
        ]);
        expect(conclui.ok, conclui.aviso).toBe(true);

        // A entrada do lote: só no insumo que a ficha produz, na loja da ordem.
        const entrada = (loja: string, insumo: string, chave: string) =>
          `INSERT INTO "MovimentoEstoque"(id,"parceiroId","lojaId","insumoId",tipo,"quantidadeMilesimos","valorCentavos","saldoAntesMilesimos","saldoDepoisMilesimos","insumoNomeSnapshot","unidadeSnapshot","ordemProducaoId","chaveIdempotencia") VALUES ('m-${chave}','p1','${loja}','${insumo}','PRODUCAO_ENTRADA',4600,11781,0,4600,'Molho','KG','o1','${chave}')`;
        const outraLoja = psql(dono, ['-c', comContexto(entrada('l2', 'i1', 'k1'))]);
        expect(outraLoja.ok).toBe(false);
        expect(outraLoja.aviso).toContain('MovimentoEstoque_producao_confere');
        const certa = psql(dono, ['-c', comContexto(`INSERT INTO "SaldoEstoque"(id,"parceiroId","lojaId","insumoId","atualizadoEm") VALUES ('s1','p1','l1','i1',now()); ${entrada('l1', 'i1', 'k2')}`)]);
        expect(certa.ok, certa.aviso).toBe(true);
        // Sem a ordem: recusado (gatilho e CHECK).
        const semOrdem = psql(dono, [
          '-c',
          comContexto(
            `INSERT INTO "MovimentoEstoque"(id,"parceiroId","lojaId","insumoId",tipo,"quantidadeMilesimos","valorCentavos","saldoAntesMilesimos","saldoDepoisMilesimos","insumoNomeSnapshot","unidadeSnapshot","chaveIdempotencia") VALUES ('m-x','p1','l1','i1','PRODUCAO_ENTRADA',1000,100,4600,5600,'Molho','KG','k3')`,
          ),
        ]);
        expect(semOrdem.ok).toBe(false);

        const db = new PrismaClient({ datasources: { db: { url: superuser } } });
        try {
          expect(await conferirMigracao(db)).toEqual([]);
        } finally {
          await db.$disconnect();
        }
      });

      it('banco com DADO RUIM: a migration não falha, avisa; CHECK violado fica NOT VALID (e vale para o novo), o índice único não nasce, e o conferidor lista cada pendência', async () => {
        const { dono, superuser, comContexto } = prepararBanco(perfil, rotulo, true);
        const r = psql(dono, ['-f', join(MIGRACOES, DA_3_1, 'migration.sql')]);
        expect(r.ok, r.aviso).toBe(true);
        expect(r.aviso).toContain('WARNING');
        for (const c of CHECKS_QUE_O_DADO_RUIM_VIOLA) expect(r.aviso, c).toContain(c);
        expect(r.aviso).toContain('OrdemProducao_parceiroId_requisicaoId_key');
        // Nada some.
        expect(psql(superuser, ['-c', `SELECT count(*) FROM "OrdemProducao"`]).saida).toBe('4');
        // Só os CHECKs violados ficam NOT VALID; os outros foram validados.
        const invalidos = psql(superuser, ['-c', `SELECT conname FROM pg_constraint WHERE conname LIKE 'OrdemProducao\\_%' AND NOT convalidated ORDER BY 1`]).saida.split('\n').filter(Boolean);
        expect(invalidos).toEqual([...CHECKS_QUE_O_DADO_RUIM_VIOLA].sort());
        // O índice único não foi criado (duas ordens na requisição r3); os outros índices e os gatilhos sim.
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_indexes WHERE indexname = 'OrdemProducao_parceiroId_requisicaoId_key'`]).saida).toBe('0');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_indexes WHERE indexname IN ('OrdemProducao_parceiroId_chaveIdempotencia_key','OrdemProducao_parceiroId_lojaId_status_idx')`]).saida).toBe('2');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_trigger WHERE tgname IN ('OrdemProducao_concluida_imutavel','MovimentoEstoque_producao_confere')`]).saida).toBe('2');
        // O CHECK NOT VALID vale para toda escrita NOVA: código fora do formato é recusado.
        const novo = psql(dono, [
          '-c',
          comContexto(`INSERT INTO "OrdemProducao"(id,"parceiroId","lojaId","fichaId","codigoLote","dataPlanejada","planejadoMilesimos","fichaNomeSnapshot") VALUES ('o9','p1','l1','f1','xyz','2026-10-01',1000,'Molho')`),
        ]);
        expect(novo.ok).toBe(false);
        expect(novo.aviso).toContain('OrdemProducao_codigo_do_lote');
        // O conferidor lista cada pendência com a frase de como resolver.
        const db = new PrismaClient({ datasources: { db: { url: superuser } } });
        try {
          const pend = await conferirMigracao(db);
          const texto = pend.join('\n');
          for (const c of CHECKS_QUE_O_DADO_RUIM_VIOLA) expect(texto, c).toContain(c);
          expect(texto).toContain('OrdemProducao_parceiroId_requisicaoId_key');
          expect(pend).toHaveLength(CHECKS_QUE_O_DADO_RUIM_VIOLA.length + 1);
        } finally {
          await db.$disconnect();
        }
      });
    });
  }
});
