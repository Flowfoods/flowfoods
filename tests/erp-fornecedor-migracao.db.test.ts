/**
 * ERP F.1a · a migration `20261105000000_erp_fornecedor_cadastro` com DADO ANTIGO, como superusuário e como DONO NÃO-SUPERUSUÁRIO
 * (com RLS FORÇADA e sem RLS).
 *
 * Cria bancos descartáveis, leva cada um até a migration anterior (a I.2b), planta fornecedores como eram na 1.5 (com CNPJ, sem
 * documento, com documento que não passa nos dígitos verificadores, com contato em texto livre), insumos que os usam como padrão e
 * notas de compra, e aplica a migration:
 *  - critério 6: nada some e NADA muda (mesmos ids, mesmas notas, mesmos vínculos, mesmo contato e mesmo documento, inclusive o
 *    inválido); todos viram "A_COMPLETAR"; a loja ganha a coluna `cnpj` vazia; sem nenhum aviso;
 *  - critério 7: com CNPJ REPETIDO no mesmo parceiro a migration TERMINA, avisa (WARNING com o primeiro par), o índice único do
 *    documento NÃO é criado, o resto fica no lugar, e `erp:conferir-migracao` lista os dois; corrigido o cadastro, o índice entra e o
 *    conferidor fica limpo;
 *  - pelo papel do tenant: o documento repetido, o "completo" sem o básico e o CNPJ torto são recusados pelo banco; a filial (outro
 *    CNPJ) e o mesmo CNPJ em OUTRO parceiro passam; o outro parceiro não enxerga.
 * Nenhum passo da migration depende de SELECT sob RLS.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-fornecedor-migracao.db.test.ts
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { conferirMigracao, relatorioDeFornecedores } from '../scripts/erp-conferir-migracao';

const URL_TESTE = process.env.ERP_DB_TESTE;
const MIGRACOES = join(process.cwd(), 'prisma', 'migrations');
const ESTA = '20261105000000_erp_fornecedor_cadastro';
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

describe.skipIf(!URL_TESTE || !temPsql)('ERP F.1a · migration do cadastro do fornecedor com dado antigo (Postgres real)', { timeout: 360_000 }, () => {
  const sufixo = globalThis.crypto.randomUUID().slice(0, 8).replace(/-/g, '');
  const criados: string[] = [];

  afterAll(() => {
    for (const b of criados) psql(urlDe('postgres'), ['-c', `DROP DATABASE IF EXISTS ${b} WITH (FORCE)`]);
  });

  /** Banco até a migration anterior, com o que a 1.5 deixava gravado. `repetido`: dois fornecedores do mesmo parceiro com o mesmo CNPJ. */
  function prepararBanco(perfil: Perfil, nomeDoBanco: string, repetido: boolean) {
    const dono = urlDe(nomeDoBanco, perfil.papel);
    const superuser = urlDe(nomeDoBanco);
    expect(psql(urlDe('postgres'), ['-c', `CREATE DATABASE ${nomeDoBanco}${perfil.papel ? ` OWNER ${perfil.papel}` : ''}`]).ok, `criar ${nomeDoBanco}`).toBe(true);
    criados.push(nomeDoBanco);
    if (perfil.papel) expect(psql(superuser, ['-c', `ALTER SCHEMA public OWNER TO ${perfil.papel}`]).ok).toBe(true);
    for (const m of antes(ESTA)) {
      const r = psql(dono, ['-f', join(MIGRACOES, m, 'migration.sql')]);
      expect(r.ok, `${m}: ${r.aviso.slice(0, 300)}`).toBe(true);
    }
    const comRls = psql(superuser, ['-c', `SELECT relforcerowsecurity FROM pg_class WHERE relname = 'Fornecedor'`]).saida === 't';
    expect(comRls, `RLS forçada esperada = ${perfil.rls}`).toBe(perfil.rls);
    const noContexto = (parceiro: string, sql: string) => (comRls ? `SELECT set_config('app.parceiro_id','${parceiro}',true), set_config('role','erp_tenant',true); ${sql}` : sql);

    expect(psql(dono, ['-c', `INSERT INTO "ParceiroFlow"(id,nome,slug,status) VALUES ('p1','P1','p1','ATIVO'),('p2','P2','p2','ATIVO')`]).ok).toBe(true);
    const plantado = psql(dono, [
      '-c',
      noContexto(
        'p1',
        `INSERT INTO "Loja"(id,"parceiroId",nome,slug) VALUES ('l1','p1','Loja 1','l1');
         INSERT INTO "Fornecedor"(id,"parceiroId",nome,documento,contato,"atualizadoEm") VALUES
           ('f1','p1','Laticínios Rio','11222333000181','Seu Jorge (21) 99999-0000',now()),
           ('f2','p1','Feira do Zé',NULL,'zap do Zé 98888-7777',now()),
           ('f3','p1','Frigorífico Velho','11222333000199',NULL,now()),
           ('f4','p1','Atacarejo',NULL,NULL,now())${repetido ? `,
           ('f5','p1','Laticínios Rio - Penha','11222333000181','mesmo CNPJ por engano',now())` : ''};
         INSERT INTO "Insumo"(id,"parceiroId",nome,unidade,tipo,"conteudoMilesimos","precoEmbalagemCentavos","conservacao","fornecedorPadraoId","atualizadoEm") VALUES
           ('i1','p1','Cheddar','KG','INGREDIENTE',5000,8990,'SECO','f1',now());
         INSERT INTO "NotaEntrada"(id,"parceiroId","lojaId","fornecedorId","entradaEm","totalCentavos",status,"lancadaEm","atualizadoEm") VALUES
           ('n1','p1','l1','f1','2026-10-01',8990,'LANCADA',now(),now()), ('n2','p1','l1','f3','2026-10-02',1000,'LANCADA',now(),now());`,
      ),
    ]);
    expect(plantado.ok, plantado.aviso).toBe(true);
    expect(psql(dono, ['-c', noContexto('p2', `INSERT INTO "Fornecedor"(id,"parceiroId",nome,documento,"atualizadoEm") VALUES ('g1','p2','Fornecedor de P2','11222333000181',now())`)]).ok).toBe(true);
    return { dono, superuser, comRls, noContexto };
  }

  const retratoAntigo = (superuser: string) =>
    psql(superuser, ['-c', `SELECT string_agg(id || ':' || nome || ':' || coalesce(documento,'-') || ':' || coalesce(contato,'-') || ':' || ativo, ',' ORDER BY id) FROM "Fornecedor"`]).saida;
  const contagens = (superuser: string) =>
    psql(superuser, ['-c', `SELECT (SELECT count(*) FROM "Fornecedor") || '/' || (SELECT count(*) FROM "NotaEntrada" WHERE "fornecedorId" IS NOT NULL) || '/' || (SELECT count(*) FROM "Insumo" WHERE "fornecedorPadraoId" IS NOT NULL)`]).saida;

  for (const perfil of PERFIS) {
    const rotulo = perfil.papel ?? 'su';
    describe.skipIf(!!perfil.papel && !papelExiste(perfil.papel))(perfil.nome, () => {
      it('critério 6: com fornecedores antigos nada some nem muda, sem aviso; todos viram "a completar"; o índice do documento entra', async () => {
        const { dono, superuser, noContexto } = prepararBanco(perfil, `ff_migf1a_${rotulo}_${sufixo}`, false);
        const retrato = retratoAntigo(superuser);
        const contagem = contagens(superuser);
        expect(contagem).toBe('5/2/1'); // 4 de p1 e 1 de p2

        const r = psql(dono, ['-f', join(MIGRACOES, ESTA, 'migration.sql')]);
        expect(r.ok, r.aviso).toBe(true);
        expect(r.aviso).not.toContain('WARNING');

        // Mesmos ids, nomes, documentos (inclusive o que não passa nos dígitos), contatos em texto livre; mesmas notas e vínculos.
        expect(retratoAntigo(superuser)).toBe(retrato);
        expect(contagens(superuser)).toBe(contagem);
        expect(psql(superuser, ['-c', `SELECT count(*) FROM "Fornecedor" WHERE "situacaoCadastro" = 'A_COMPLETAR'`]).saida).toBe('5'); // 4 de p1 + 1 de p2
        expect(psql(superuser, ['-c', `SELECT count(*) FROM "Fornecedor" WHERE "razaoSocial" IS NOT NULL OR email IS NOT NULL OR whatsapp IS NOT NULL OR "semNotaFiscal" OR "chaveEnvio" IS NOT NULL OR "prazoPagamentoDias" IS NOT NULL`]).saida).toBe('0');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM "Loja" WHERE cnpj IS NOT NULL`]).saida).toBe('0');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_indexes WHERE indexname = 'Fornecedor_parceiroId_documento_key'`]).saida).toBe('1');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_constraint WHERE conname LIKE 'Fornecedor\\_%' AND NOT convalidated`]).saida).toBe('0');

        // Pelo papel do tenant (ou o dono, sem RLS).
        const comoP1 = (sql: string) => psql(dono, ['-c', noContexto('p1', sql)]);
        const base = `INSERT INTO "Fornecedor"(id,"parceiroId",nome,documento,"atualizadoEm"`;
        expect(comoP1(`${base}) VALUES ('x1','p1','Repetido','11222333000181',now())`).aviso).toMatch(/Fornecedor_parceiroId_documento_key/); // o mesmo CNPJ
        expect(comoP1(`${base}) VALUES ('x2','p1','Filial Penha','11222333000262',now())`).ok).toBe(true); // outro CNPJ da mesma raiz
        expect(comoP1(`${base}) VALUES ('x3','p1','Outro sem doc A',NULL,now()), ('x4','p1','Outro sem doc B',NULL,now())`).ok).toBe(true); // sem documento não conflita
        expect(comoP1(`${base},"situacaoCadastro") VALUES ('x5','p1','Completo sem nada',NULL,now(),'COMPLETO')`).aviso).toContain('Fornecedor_completo_tem_o_basico');
        expect(comoP1(`UPDATE "Loja" SET cnpj = '123' WHERE id = 'l1'`).aviso).toContain('Loja_cnpj_formato');
        expect(comoP1(`UPDATE "Loja" SET cnpj = '11444777000161' WHERE id = 'l1'`).ok).toBe(true);
        // O completo de verdade passa.
        expect(
          comoP1(
            `INSERT INTO "Fornecedor"(id,"parceiroId",nome,"razaoSocial",documento,email,whatsapp,"situacaoCadastro","chaveEnvio","hashEnvio","atualizadoEm") VALUES ('x6','p1','Completo','Completo Ltda','07526557000100','a@b.com','21996416060','COMPLETO','chave-de-envio-1','h',now())`,
          ).ok,
        ).toBe(true);
        // O mesmo CNPJ em outro parceiro é outro mundo.
        expect(psql(dono, ['-c', noContexto('p2', `${base}) VALUES ('y1','p2','Do outro lado','11222333000262',now())`)]).ok).toBe(true);
        if (perfil.rls) expect(psql(dono, ['-c', noContexto('p2', `SELECT count(*) FROM "Fornecedor" WHERE "parceiroId" = 'p1'`)]).saida.split('\n').pop()).toBe('0');

        const db = new PrismaClient({ datasources: { db: { url: superuser } } });
        try {
          expect(await conferirMigracao(db)).toEqual([]);
          // O que o conferidor conta, como o dono NÃO-superusuário o roda: cada parceiro no contexto dele.
          const rel = await relatorioDeFornecedores(db);
          expect(rel.repetidos).toEqual([]);
          expect(rel.documentosAConferir).toEqual([{ parceiro: 'p1', nome: 'Frigorífico Velho', documento: '11222333000199' }]);
          expect(rel.aCompletar).toBe(9); // f1..f4 e g1 (antigos) + x2, x3, x4 e y1 (inseridos por SQL sem dizer a situação: o default é o seguro); x6 é COMPLETO
          // O conferidor acusa o CHECK que ficar NOT VALID e o índice que faltar.
          expect(psql(superuser, ['-c', `ALTER TABLE "Fornecedor" DROP CONSTRAINT "Fornecedor_uf_valida"; ALTER TABLE "Fornecedor" ADD CONSTRAINT "Fornecedor_uf_valida" CHECK ("uf" IS NULL OR char_length("uf") = 2) NOT VALID`]).ok).toBe(true);
          expect((await conferirMigracao(db)).join('\n')).toMatch(/CHECK Fornecedor_uf_valida ficou NOT VALID/);
          expect(psql(superuser, ['-c', `ALTER TABLE "Fornecedor" DROP CONSTRAINT "Fornecedor_uf_valida"; DROP INDEX "Fornecedor_parceiroId_chaveEnvio_key"`]).ok).toBe(true);
          const sem = (await conferirMigracao(db)).join('\n');
          expect(sem).toMatch(/CHECK Fornecedor_uf_valida \(Fornecedor\) NÃO existe/);
          expect(sem).toMatch(/Índice Fornecedor_parceiroId_chaveEnvio_key NÃO existe/);
        } finally {
          await db.$disconnect();
        }
      });

      it('critério 7: com CNPJ repetido no mesmo parceiro a migration termina, avisa, NÃO cria o índice e o conferidor lista os dois', async () => {
        const { dono, superuser, noContexto } = prepararBanco(perfil, `ff_migf1b_${rotulo}_${sufixo}`, true);
        const retrato = retratoAntigo(superuser);
        const contagem = contagens(superuser);

        const r = psql(dono, ['-f', join(MIGRACOES, ESTA, 'migration.sql')]);
        expect(r.ok, r.aviso).toBe(true); // a migration NÃO reprova
        expect(r.aviso).toMatch(/WARNING:.*Fornecedor_parceiroId_documento_key NÃO foi criado/);
        expect(r.aviso).toContain('npm run erp:conferir-migracao'); // o aviso manda para a lista (a migration não faz SELECT)
        expect(retratoAntigo(superuser)).toBe(retrato);
        expect(contagens(superuser)).toBe(contagem);
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_indexes WHERE indexname = 'Fornecedor_parceiroId_documento_key'`]).saida).toBe('0');
        // O resto da migration ficou no lugar (colunas, chave de envio, CHECKs validados).
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_indexes WHERE indexname = 'Fornecedor_parceiroId_chaveEnvio_key'`]).saida).toBe('1');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_constraint WHERE conname LIKE 'Fornecedor\\_%' AND NOT convalidated`]).saida).toBe('0');

        const db = new PrismaClient({ datasources: { db: { url: superuser } } });
        try {
          const pend = (await conferirMigracao(db)).join('\n');
          expect(pend).toMatch(/Índice Fornecedor_parceiroId_documento_key NÃO existe: há fornecedores do mesmo parceiro com o mesmo CNPJ/);
          expect(pend).toContain('CNPJ/CPF repetido no parceiro p1: 11.222.333/0001-81 em “Laticínios Rio” e “Laticínios Rio - Penha”');
          expect(pend).not.toContain('p2'); // o mesmo CNPJ em OUTRO parceiro não é repetição
          expect((await relatorioDeFornecedores(db)).repetidos).toEqual([{ parceiro: 'p1', documento: '11222333000181', nomes: ['Laticínios Rio', 'Laticínios Rio - Penha'] }]);

          // Corrigido o cadastro (o certo é a filial), o CREATE UNIQUE INDEX da migration entra e o conferidor fica limpo.
          const comoP1 = (sql: string) => psql(dono, ['-c', noContexto('p1', sql)]);
          // Enquanto o índice não existe, o banco ainda não segura o repetido (o servidor é quem recusa).
          expect(comoP1(`UPDATE "Fornecedor" SET documento = '11222333000262' WHERE id = 'f5'`).ok).toBe(true);
          expect(psql(dono, ['-c', `CREATE UNIQUE INDEX "Fornecedor_parceiroId_documento_key" ON "Fornecedor"("parceiroId", "documento") WHERE "documento" IS NOT NULL`]).ok).toBe(true);
          expect(await conferirMigracao(db)).toEqual([]);
        } finally {
          await db.$disconnect();
        }
      });
    });
  }
});
