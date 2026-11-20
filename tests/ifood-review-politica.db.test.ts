import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { versionarReviewPolitica, resolverReviewPolitica } from '@/lib/integracoes/ifood/review-politica';
import { executarPsqlDeTeste } from './erp-psql-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const AUTOR = { userId: 'autor-sintetico-nivel1', autorNome: 'Autor de teste' };
const conteudo = (tom = 'Cordial') => ({ tom, assinatura: '', exemplos: ['Exemplo sintético'], restricoes: ['Não prometer benefício'], limiteEditorial: 900 });
const entrada = (lojaId: string | null, versaoEsperada = 0, tom?: string) => ({ lojaId, versaoEsperada, conteudo: conteudo(tom), motivo: 'Teste sintético' });
const MIGRACAO = '20261202000000_erp_review_politica';

// Os três perfis são obrigatórios quando há URL: papéis/psql ausentes FALHAM, não pulam.
describe.skipIf(!URL_TESTE)('Review · política persistente em PostgreSQL 16 descartável', { timeout: 180_000 }, () => {
  for (const papel of ['ff', 'ff_dono', 'ff_semrls']) describe(papel, () => {
    const banco = `ff_reviewpolitica_${papel}_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
    let db: PrismaClient;
    let criado = false;
    let a: ClienteDoParceiro; let b: ClienteDoParceiro;
    let a1: string; let a2: string; let b1: string;
    const url = (nome: string, usuario?: string) => {
      const u = new URL(URL_TESTE!); u.pathname = `/${nome}`; u.search = '';
      if (usuario && usuario !== 'ff') { u.username = usuario; u.password = usuario; }
      return u.toString();
    };
    const sql = (texto: string, comoDono = true) => {
      const r = executarPsqlDeTeste(url(banco, comoDono ? papel : undefined), ['-c', texto]);
      if (!r.ok) throw new Error(r.aviso);
      return r.saida;
    };
    beforeAll(async () => {
      expect(['localhost', '127.0.0.1']).toContain(new URL(URL_TESTE!).hostname);
      const criar = executarPsqlDeTeste(url('postgres'), ['-c', `CREATE DATABASE ${banco}${papel !== 'ff' ? ` OWNER ${papel}` : ''}`]);
      expect(criar.ok, criar.aviso).toBe(true); criado = true;
      if (papel !== 'ff') sql(`ALTER SCHEMA public OWNER TO ${papel}`, false);
      const raiz = join(process.cwd(), 'prisma', 'migrations');
      for (const migration of readdirSync(raiz).filter((n) => /^\d{14}_/.test(n) && n < MIGRACAO).sort()) {
        const r = executarPsqlDeTeste(url(banco, papel), ['-f', join(raiz, migration, 'migration.sql')]);
        expect(r.ok, `${migration}: ${r.aviso}`).toBe(true);
      }
      sql(`INSERT INTO "ParceiroFlow"(id,nome,slug,status) VALUES ('preexistente','Sintético anterior','preexistente','ATIVO')`);
      const r = executarPsqlDeTeste(url(banco, papel), ['-f', join(raiz, MIGRACAO, 'migration.sql')]);
      expect(r.ok, r.aviso).toBe(true);
      expect(sql(`SELECT nome FROM "ParceiroFlow" WHERE id='preexistente'`)).toBe('Sintético anterior');
      expect(sql(`SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class WHERE relname IN ('ReviewPolitica','ReviewPoliticaVersao')`)).toBe(papel === 'ff_semrls' ? 'f' : 't');
      db = new PrismaClient({ datasources: { db: { url: url(banco, papel) } } });
    }, 180_000);
    beforeEach(async () => {
      const criar = async () => {
        const id = crypto.randomUUID();
        await db.parceiroFlow.create({ data: { id, nome: `Parceiro ${id}`, slug: id, status: 'ATIVO' } });
        return doParceiro(id, db);
      };
      a = await criar(); b = await criar();
      const loja = (c: ClienteDoParceiro) => c.loja.create({ data: { parceiroId: c.parceiroId, nome: crypto.randomUUID(), slug: crypto.randomUUID() } });
      a1 = (await loja(a)).id; a2 = (await loja(a)).id; b1 = (await loja(b)).id;
    });
    afterAll(async () => {
      await db?.$disconnect();
      if (criado) {
        expect(/^ff_reviewpolitica_(ff|ff_dono|ff_semrls)_[a-f0-9]{12}$/.test(banco)).toBe(true);
        const r = executarPsqlDeTeste(url('postgres'), ['-c', `DROP DATABASE ${banco} WITH (FORCE)`]);
        expect(r.ok, r.aviso).toBe(true);
      }
    });

    it('ausência não vira padrão; loja inexistente ou de outro parceiro é recusada', async () => {
      expect(await resolverReviewPolitica(a, a1)).toBeNull();
      await expect(resolverReviewPolitica(a, b1)).rejects.toThrow('Loja não pertence');
      await expect(versionarReviewPolitica(a, AUTOR, entrada(b1))).rejects.toThrow('Loja não pertence');
      await expect(resolverReviewPolitica(a, 'inexistente')).rejects.toThrow();
      expect(await a.reviewPolitica.count()).toBe(0);
    });
    it('herança preserva snapshot anterior e registra autoria/histórico na mesma versão', async () => {
      const v1 = await versionarReviewPolitica(a, AUTOR, entrada(null));
      const primeiro = await resolverReviewPolitica(a, a1);
      expect(primeiro).toMatchObject({ origem: 'PARCEIRO', numero: 1, politicaId: v1.politicaId, capacidade: 'INATIVA', lojaConsultadaId: a1 });
      await versionarReviewPolitica(a, AUTOR, entrada(null, 1, 'Objetivo'));
      expect((await resolverReviewPolitica(a, a2))?.conteudo.tom).toBe('Objetivo');
      expect(primeiro?.conteudo.tom).toBe('Cordial'); expect(Object.isFrozen(primeiro?.conteudo.exemplos)).toBe(true);
      const versoes = await a.reviewPoliticaVersao.findMany({ orderBy: { numero: 'asc' } });
      expect(versoes.map((v) => [v.numero, v.tom, v.autorUserId])).toEqual([[1, 'Cordial', AUTOR.userId], [2, 'Objetivo', AUTOR.userId]]);
      const logs = await a.historicoAlteracao.findMany({ where: { entidade: 'ReviewPolitica' } });
      expect(logs).toHaveLength(2); expect(logs[0].depois).toMatchObject({ autorUserId: AUTOR.userId, capacidade: 'INATIVA' });
      expect(await resolverReviewPolitica(b, b1)).toBeNull();
    });
    it('exceção é completa e estável; outra loja segue parceiro e nenhuma integração é ativada', async () => {
      await versionarReviewPolitica(a, AUTOR, entrada(null));
      await versionarReviewPolitica(a, AUTOR, entrada(a1, 0, 'Exceção explícita'));
      const anterior = await resolverReviewPolitica(a, a1);
      await versionarReviewPolitica(a, AUTOR, entrada(null, 1, 'Nova política da rede'));
      expect(await resolverReviewPolitica(a, a1)).toEqual(anterior);
      expect(anterior?.origem).toBe('LOJA');
      expect((await resolverReviewPolitica(a, a2))?.conteudo.tom).toBe('Nova política da rede');
      expect(await a.integracaoConexao.count()).toBe(0); expect(await a.liberacaoDeModulo.count()).toBe(0);
    });
    it.each([false, true])('CAS permite um único vencedor; criação anterior=%s', async (existia) => {
      if (existia) await versionarReviewPolitica(a, AUTOR, entrada(a1));
      const n = existia ? 1 : 0;
      const resultados = await Promise.allSettled([versionarReviewPolitica(a, AUTOR, entrada(a1, n, 'Texto A')), versionarReviewPolitica(a, AUTOR, entrada(a1, n, 'Texto B'))]);
      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(resultados.find((r) => r.status === 'rejected')).toMatchObject({ reason: { name: 'ConflitoReviewPolitica' } });
      expect(await a.reviewPoliticaVersao.count()).toBe(n + 1);
      expect(await a.historicoAlteracao.count({ where: { entidade: 'ReviewPolitica' } })).toBe(n + 1);
      await expect(versionarReviewPolitica(a, AUTOR, entrada(a1, n))).rejects.toMatchObject({ name: 'ConflitoReviewPolitica' });
    });
    it('auditoria que falha reverte ponteiro, versão e criação integralmente', async () => {
      await versionarReviewPolitica(a, AUTOR, entrada(a1));
      sql(`CREATE FUNCTION review_teste_falha() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entidade='ReviewPolitica' THEN RAISE EXCEPTION 'falha sintética auditoria'; END IF; RETURN NEW; END $$; CREATE TRIGGER review_teste_falha BEFORE INSERT ON "HistoricoAlteracao" FOR EACH ROW EXECUTE FUNCTION review_teste_falha()`);
      try {
        await expect(versionarReviewPolitica(a, AUTOR, entrada(a1, 1))).rejects.toThrow('falha sintética auditoria');
        await expect(versionarReviewPolitica(a, AUTOR, entrada(a2))).rejects.toThrow('falha sintética auditoria');
      } finally { sql('DROP TRIGGER review_teste_falha ON "HistoricoAlteracao"; DROP FUNCTION review_teste_falha()'); }
      expect(await a.reviewPolitica.count()).toBe(1); expect(await a.reviewPoliticaVersao.count()).toBe(1);
      expect((await resolverReviewPolitica(a, a1))?.numero).toBe(1);
      expect(await a.historicoAlteracao.count({ where: { entidade: 'ReviewPolitica' } })).toBe(1);
    });
    it('imutabilidade e completude também barram SQL indevido', async () => {
      const v = await versionarReviewPolitica(a, AUTOR, entrada(a1));
      const contexto = papel === 'ff_semrls' ? '' : `SELECT set_config('app.parceiro_id','${a.parceiroId}',true), set_config('role','erp_tenant',true);`;
      for (const indevido of [
        `UPDATE "ReviewPoliticaVersao" SET tom='Adulterado' WHERE id='${v.versaoId}'`,
        `DELETE FROM "ReviewPoliticaVersao" WHERE id='${v.versaoId}'`,
        `TRUNCATE "ReviewPoliticaVersao"`,
        `UPDATE "ReviewPolitica" SET "versaoAtual"=3 WHERE id='${v.politicaId}'`,
        `UPDATE "ReviewPolitica" SET "versaoAtual"=2 WHERE id='${v.politicaId}'`,
        `DELETE FROM "ReviewPolitica" WHERE id='${v.politicaId}'`,
        `UPDATE "ReviewPolitica" SET "lojaId"='${a2}',alvo='LOJA:${a2}' WHERE id='${v.politicaId}'`,
      ]) {
        const r = executarPsqlDeTeste(url(banco, papel), ['-c', `BEGIN; ${contexto} ${indevido}; COMMIT;`]);
        expect(r.ok, indevido).toBe(false);
      }
      expect((await resolverReviewPolitica(a, a1))?.numero).toBe(1);
    });
    it('FK composta e portão barram parceiro/loja cruzados, inclusive gravando SQL direto', async () => {
      await expect(a.reviewPolitica.create({ data: { parceiroId: a.parceiroId, alvo: `LOJA:${b1}`, lojaId: b1, versaoAtual: 1 } })).rejects.toThrow();
      await expect(a.reviewPolitica.findMany({ where: { parceiroId: b.parceiroId } })).rejects.toThrow();
      await versionarReviewPolitica(b, AUTOR, entrada(null));
      expect(await a.reviewPolitica.findMany()).toEqual([]);
      if (papel !== 'ff_semrls') {
        const linhas = await a.sql<{ parceiroId: string }>`SELECT "parceiroId" FROM "ReviewPolitica"`;
        expect(linhas).toEqual([]);
        await expect(a.sql`INSERT INTO "ReviewPolitica" (id,"parceiroId",alvo,"versaoAtual") VALUES ('invasao',${b.parceiroId},'PARCEIRO',1)`).rejects.toThrow();
      } else {
        // Neste perfil, o contrato é portão + FK + triggers; não alegamos RLS inexistente.
        expect(sql(`SELECT relrowsecurity FROM pg_class WHERE relname='ReviewPolitica'`)).toBe('f');
      }
    });
    it('cliente read-only e status suspenso depois de criar contexto bloqueiam antes de persistir', async () => {
      await expect(versionarReviewPolitica(doParceiro(a.parceiroId, db, { somenteLeitura: true }), AUTOR, entrada(null))).rejects.toThrow(/somente leitura/);
      await db.parceiroFlow.update({ where: { id: a.parceiroId }, data: { status: 'SUSPENSO' } });
      await expect(versionarReviewPolitica(a, AUTOR, entrada(null))).rejects.toThrow(/não está ATIVO/);
      expect(await a.reviewPolitica.count()).toBe(0);
    });
    it('CHECKs rejeitam conteúdo inválido mesmo passando por fora do validador do domínio', async () => {
      for (const invalido of [{ tom: '\u00a0\u2003' }, { exemplos: ['\n\t'] }, { restricoes: ['\uFEFF'] }, { limiteEditorial: 0 }, { motivo: '   ' }, { autorUserId: '' }]) {
        await expect(a.transacao(async (tx) => {
          const p = await tx.reviewPolitica.create({ data: { parceiroId: tx.parceiroId, alvo: 'PARCEIRO', versaoAtual: 1 } });
          await tx.reviewPoliticaVersao.create({ data: { parceiroId: tx.parceiroId, politicaId: p.id, numero: 1, ...conteudo(), autorUserId: AUTOR.userId, autorNome: AUTOR.autorNome, motivo: 'Teste', ...invalido } });
        })).rejects.toThrow();
      }
      expect(await a.reviewPolitica.count()).toBe(0);
    });
    it('suspensão concorrente confirmada antes da primeira escrita não deixa política passar', async () => {
      let soltar!: () => void; let travou!: () => void;
      const trava = new Promise<void>((r) => { travou = r; }); const liberar = new Promise<void>((r) => { soltar = r; });
      const suspender = db.$transaction(async (tx) => {
        await tx.parceiroFlow.update({ where: { id: a.parceiroId }, data: { status: 'SUSPENSO' } });
        travou(); await liberar;
      });
      await trava;
      const tentativa = versionarReviewPolitica(a, AUTOR, entrada(null));
      // O gate precisa aguardar a linha travada; soltá-la confirma SUSPENSO.
      soltar(); await suspender;
      await expect(tentativa).rejects.toThrow(/não está ATIVO/);
      expect(await a.reviewPolitica.count()).toBe(0);
    });
  });
});
