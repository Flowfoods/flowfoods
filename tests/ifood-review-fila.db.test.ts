import { aprovarReviewFila, consultarReviewFila, gravarReviewFila, listarReviewFila } from '@/lib/integracoes/ifood/review-fila';
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
const MIGRACAO = '20261203000000_erp_review_fila';

// Os três perfis são obrigatórios quando há URL: papéis/psql ausentes FALHAM, não pulam.
describe.skipIf(!URL_TESTE)('Review · fila editorial persistente em PostgreSQL 16 descartável', { timeout: 180_000 }, () => {
  for (const papel of ['ff', 'ff_dono', 'ff_semrls']) describe(papel, () => {
    const banco = `ff_reviewfila_${papel}_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
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
      expect(sql(`SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class WHERE relname IN ('ReviewSugestao','ReviewSugestaoRevisao','ReviewSugestaoAprovacao')`)).toBe(papel === 'ff_semrls' ? 'f' : 't');
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
        expect(/^ff_reviewfila_(ff|ff_dono|ff_semrls)_[a-f0-9]{12}$/.test(banco)).toBe(true);
        const r = executarPsqlDeTeste(url('postgres'), ['-c', `DROP DATABASE ${banco} WITH (FORCE)`]);
        expect(r.ok, r.aviso).toBe(true);
      }
    });

    const identidade = (id = 'avaliacao-sintetica', lojaId = a1) => ({ lojaId, avaliacaoLocalId: id });
    const rascunho = (revisaoEsperada = 0, texto = 'Resposta sintética', id?: string, lojaId = a1) => ({
      ...identidade(id, lojaId), revisaoEsperada, fatos: { versao: 'fonte-1', comentario: 'Comentário sintético' },
      texto, visibilidade: 'PUBLICA', motivo: 'Preparação local',
    });
    const aprovacao = (revisaoEsperada = 1) => ({ ...identidade(), revisaoEsperada, motivo: 'Revisão humana local' });
    const preparar = async () => { await versionarReviewPolitica(a, AUTOR, entrada(null)); };
    const consultar = () => consultarReviewFila(a, identidade());

    it('aprovação aplica limite editorial do snapshot; rascunho acima do teto continua preservado', async () => {
      await versionarReviewPolitica(a, AUTOR, { ...entrada(null), conteudo: { ...conteudo(), limiteEditorial: 3 } });
      const salvo = await gravarReviewFila(a, AUTOR, rascunho(0, '😀😀😀😀'));
      await expect(aprovarReviewFila(a, AUTOR, aprovacao())).rejects.toThrow('limite editorial');
      expect(await consultar()).toEqual(salvo);
      expect(await a.historicoAlteracao.count({ where: { entidade: 'ReviewSugestao' } })).toBe(1);
      await versionarReviewPolitica(a, AUTOR, { ...entrada(null, 1), conteudo: { ...conteudo(), limiteEditorial: 4 } });
      await expect(aprovarReviewFila(a, AUTOR, aprovacao())).rejects.toThrow('limite editorial');
      await gravarReviewFila(a, AUTOR, rascunho(1, '😀😀😀😀'));
      const aprovada = await aprovarReviewFila(a, AUTOR, aprovacao(2));
      expect(aprovada).toMatchObject({ estado: 'APROVADA', revisaoAtual: 2 });
      expect(aprovada!.revisoes[0]).toEqual(salvo!.revisoes[0]);
      expect(aprovada!.revisoes[1].texto).toBe('😀😀😀😀');
    });

    it('política concorrente não mistura versões no snapshot transacional', async () => {
      await preparar(); let alterou = false;
      const interceptado: ClienteDoParceiro = { ...a, transacao: (fn, opcoes) => a.transacao(async tx => {
        const original = tx.reviewPoliticaVersao.findFirst;
        const adaptado = { ...tx, reviewPoliticaVersao: { ...tx.reviewPoliticaVersao,
          findFirst: (async (args: Parameters<typeof original>[0]) => {
            const resultado = await original(args);
            if (!alterou) { alterou = true; await versionarReviewPolitica(a, AUTOR, entrada(null, 1, 'Nova durante a transação')); }
            return resultado;
          }) as typeof original,
        } };
        return fn(adaptado);
      }, opcoes) };
      const salvo = await gravarReviewFila(interceptado, AUTOR, rascunho());
      expect(salvo!.revisoes[0].politicaSnapshot).toMatchObject({ numero: 1, conteudo: { tom: 'Cordial' } });
      expect(await resolverReviewPolitica(a, a1)).toMatchObject({ numero: 2, conteudo: { tom: 'Nova durante a transação' } });
    });

    it('ausência de política bloqueia; herança/exceção e fatos sintéticos são preservados', async () => {
      await expect(gravarReviewFila(a, AUTOR, rascunho())).rejects.toThrow('Política editorial obrigatória');
      expect(await a.reviewSugestao.count()).toBe(0);
      await preparar();
      const antes = Date.now(); const salvo = await gravarReviewFila(a, AUTOR, rascunho());
      expect(salvo).toMatchObject({ estado: 'RASCUNHO', origem: 'LOCAL_SIMULATION', capacidade: 'INATIVA', revisaoAtual: 1, aprovacaoAtual: null });
      expect(salvo!.revisoes[0]).toMatchObject({ editorUserId: AUTOR.userId, fatosVersao: 'fonte-1', politicaSnapshot: { origem: 'PARCEIRO', numero: 1 } });
      expect(new Date(salvo!.criadoEm).getTime()).toBeGreaterThanOrEqual(antes - 1);
      expect(new Date(salvo!.criadoEm).getTime()).toBeLessThanOrEqual(Date.now());
      await versionarReviewPolitica(a, AUTOR, entrada(a2, 0, 'Exceção completa'));
      const outra = await gravarReviewFila(a, AUTOR, rascunho(0, 'Outro texto', undefined, a2));
      expect(outra!.revisoes[0].politicaSnapshot).toMatchObject({ origem: 'LOJA', lojaDaPoliticaId: a2, conteudo: { tom: 'Exceção completa' } });
      expect(await a.integracaoConexao.count()).toBe(0); expect(await a.liberacaoDeModulo.count()).toBe(0);
    });
    it('aprovar fixa a revisão; política posterior não troca snapshot; edição invalida e mantém história', async () => {
      await preparar(); const inicial = await gravarReviewFila(a, AUTOR, rascunho());
      await versionarReviewPolitica(a, AUTOR, entrada(null, 1, 'Política posterior'));
      const aprovada = await aprovarReviewFila(a, AUTOR, aprovacao());
      expect(aprovada!.aprovacaoAtual).toMatchObject({ revisao: 1, aprovadorUserId: AUTOR.userId });
      expect(aprovada!.revisoes).toEqual(inicial!.revisoes);
      expect(await aprovarReviewFila(a, AUTOR, aprovacao())).toEqual(aprovada);
      expect(await a.historicoAlteracao.count({ where: { entidade: 'ReviewSugestao' } })).toBe(2);
      await expect(aprovarReviewFila(a, { ...AUTOR, userId: 'outro-humano' }, aprovacao())).rejects.toMatchObject({ name: 'ConflitoReviewFila' });
      await expect(aprovarReviewFila(a, AUTOR, { ...aprovacao(), motivo: 'Outra intenção' })).rejects.toMatchObject({ name: 'ConflitoReviewFila' });
      const editada = await gravarReviewFila(a, AUTOR, rascunho(1, 'Texto revisto'));
      expect(editada).toMatchObject({ estado: 'RASCUNHO', revisaoAtual: 2, aprovacaoAtual: null });
      expect(editada!.aprovacoes).toEqual(aprovada!.aprovacoes);
      expect(editada!.revisoes[0]).toEqual(inicial!.revisoes[0]);
      expect(editada!.revisoes[1].politicaSnapshot).toMatchObject({ numero: 2 });
      await expect(aprovarReviewFila(a, AUTOR, aprovacao(1))).rejects.toMatchObject({ name: 'ConflitoReviewFila' });
      expect((await aprovarReviewFila(a, AUTOR, aprovacao(2)))!.aprovacoes).toHaveLength(2);
    });
    it('reenvio sem alteração material preserva aprovação e não duplica auditoria', async () => {
      await preparar(); await gravarReviewFila(a, AUTOR, rascunho());
      const aprovada = await aprovarReviewFila(a, AUTOR, aprovacao());
      expect(await gravarReviewFila(a, AUTOR, rascunho(1))).toEqual(aprovada);
      expect(await a.historicoAlteracao.count({ where: { entidade: 'ReviewSugestao' } })).toBe(2);
    });
    it('versão de fatos vale por identidade, inclusive revisão antiga nunca aprovada', async () => {
      await preparar(); await gravarReviewFila(a, AUTOR, rascunho());
      await gravarReviewFila(a, AUTOR, { ...rascunho(1, 'Segundo texto'), fatos: { versao: 'fonte-2', comentario: 'Outro comentário' } });
      await expect(gravarReviewFila(a, AUTOR, { ...rascunho(2, 'Terceiro'), fatos: { versao: 'fonte-1', comentario: 'Alterado' } })).rejects.toThrow('Versão de fatos');
      expect((await consultar())!.revisaoAtual).toBe(2);
      await gravarReviewFila(a, AUTOR, { ...rascunho(0, 'Outra avaliação', 'avaliacao-distinta'), fatos: { versao: 'fonte-1', comentario: 'Alterado' } });
      await gravarReviewFila(a, AUTOR, rascunho(2, 'Terceiro correto'));
      expect(await a.reviewSugestaoRevisao.count()).toBe(4);
    });
    it.each([false, true])('CAS criação/edição tem um vencedor, existente=%s', async existente => {
      await preparar(); if (existente) await gravarReviewFila(a, AUTOR, rascunho());
      const numero = existente ? 1 : 0;
      const resultados = await Promise.allSettled([gravarReviewFila(a, AUTOR, rascunho(numero, 'A')), gravarReviewFila(a, AUTOR, rascunho(numero, 'B'))]);
      expect(resultados.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      expect(resultados.find(r => r.status === 'rejected')).toMatchObject({ reason: { name: 'ConflitoReviewFila' } });
      expect((await consultar())!.revisoes).toHaveLength(numero + 1);
    });
    it('aprovação concorrente não duplica, e edição × aprovação conserva ordem serial válida', async () => {
      await preparar(); await gravarReviewFila(a, AUTOR, rascunho());
      const simultaneas = await Promise.allSettled([aprovarReviewFila(a, AUTOR, aprovacao()), aprovarReviewFila(a, AUTOR, aprovacao())]);
      expect(simultaneas.some(r => r.status === 'fulfilled')).toBe(true);
      expect((await consultar())!.aprovacoes).toHaveLength(1);
      expect(await a.historicoAlteracao.count({ where: { entidade: 'ReviewSugestao', acao: 'APROVOU' } })).toBe(1);
      await gravarReviewFila(a, AUTOR, rascunho(1, 'Revisão 2'));
      const disputa = await Promise.allSettled([gravarReviewFila(a, AUTOR, rascunho(2, 'Revisão 3')), aprovarReviewFila(a, AUTOR, aprovacao(2))]);
      expect(disputa.some(r => r.status === 'fulfilled')).toBe(true);
      const final = (await consultar())!;
      if (disputa[0].status === 'fulfilled') {
        expect(final).toMatchObject({ revisaoAtual: 3, estado: 'RASCUNHO', aprovacaoAtual: null });
      } else { expect(final).toMatchObject({ revisaoAtual: 2, estado: 'APROVADA', aprovacaoAtual: { revisao: 2 } }); }
    });
    it.each(['auditoria', 'revisao', 'aprovacao'])('falha em %s desfaz todo o efeito', async etapa => {
      await preparar(); await gravarReviewFila(a, AUTOR, rascunho()); const antes = await consultar();
      const tabela = { auditoria: 'HistoricoAlteracao', revisao: 'ReviewSugestaoRevisao', aprovacao: 'ReviewSugestaoAprovacao' }[etapa]!;
      sql(`CREATE FUNCTION fila_teste_falha() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'falha sintética fila'; END $$; CREATE TRIGGER fila_teste_falha BEFORE INSERT ON "${tabela}" FOR EACH ROW EXECUTE FUNCTION fila_teste_falha()`);
      try {
        if (etapa !== 'revisao') await expect(aprovarReviewFila(a, AUTOR, aprovacao())).rejects.toThrow('falha sintética fila');
        if (etapa !== 'aprovacao') {
          await expect(gravarReviewFila(a, AUTOR, rascunho(1, 'Novo'))).rejects.toThrow('falha sintética fila');
          await expect(gravarReviewFila(a, AUTOR, rascunho(0, 'Nova criação', 'outra'))).rejects.toThrow('falha sintética fila');
        }
      } finally { sql(`DROP TRIGGER fila_teste_falha ON "${tabela}"; DROP FUNCTION fila_teste_falha()`); }
      expect(await consultar()).toEqual(antes);
      expect(await a.reviewSugestao.count()).toBe(1);
      expect(await a.historicoAlteracao.count({ where: { entidade: 'ReviewSugestao' } })).toBe(1);
    });
    it('tenant, loja, somente leitura e suspensão barram efeitos; não usa integracao.ver', async () => {
      await preparar(); await gravarReviewFila(a, AUTOR, rascunho());
      await expect(gravarReviewFila(a, AUTOR, rascunho(0, 'Cruzado', 'outra', b1))).rejects.toThrow('Loja não pertence');
      await expect(consultarReviewFila(b, identidade())).rejects.toThrow('Loja não pertence');
      await expect(aprovarReviewFila(b, AUTOR, aprovacao())).rejects.toThrow('Loja não pertence');
      await expect(a.reviewSugestao.findMany({ where: { parceiroId: b.parceiroId } })).rejects.toThrow();
      expect(await b.reviewSugestao.count()).toBe(0);
      if (papel !== 'ff_semrls') expect(await b.sql`SELECT id FROM "ReviewSugestao"`).toEqual([]);
      const somenteLeitura = doParceiro(a.parceiroId, db, { somenteLeitura: true });
      await expect(gravarReviewFila(somenteLeitura, AUTOR, rascunho(1, 'Outro'))).rejects.toThrow('somente leitura');
      await expect(aprovarReviewFila(somenteLeitura, AUTOR, aprovacao())).rejects.toThrow('somente leitura');
      await expect(gravarReviewFila(a, { userId: '', autorNome: '' }, rascunho(1, 'Outro'))).rejects.toThrow('Autor de servidor');
      await db.parceiroFlow.update({ where: { id: a.parceiroId }, data: { status: 'SUSPENSO' } });
      await expect(aprovarReviewFila(a, AUTOR, aprovacao())).rejects.toThrow(/não está ATIVO/);
      await expect(gravarReviewFila(a, AUTOR, rascunho(1, 'Outro'))).rejects.toThrow(/não está ATIVO/);
      expect((await consultar())!.estado).toBe('RASCUNHO');
    });
    it('SQL não altera/deleta/trunca fatos, aprovações ou sua auditoria; ponteiros não ficam órfãos', async () => {
      await preparar(); await gravarReviewFila(a, AUTOR, rascunho()); const salvo = (await aprovarReviewFila(a, AUTOR, aprovacao()))!;
      const contexto = papel === 'ff_semrls' ? '' : `SELECT set_config('app.parceiro_id','${a.parceiroId}',true),set_config('role','erp_tenant',true);`;
      const comandos = [
        `UPDATE "ReviewSugestao" SET "revisaoAtual"=2,estado='RASCUNHO' WHERE id='${salvo.id}'`,
        `UPDATE "ReviewSugestao" SET "revisaoAtual"=3 WHERE id='${salvo.id}'`,
        `UPDATE "ReviewSugestao" SET "lojaId"='${a2}' WHERE id='${salvo.id}'`,
        `UPDATE "ReviewSugestao" SET estado='EM_ENVIO' WHERE id='${salvo.id}'`,
        `DELETE FROM "ReviewSugestao" WHERE id='${salvo.id}'`,
        `UPDATE "HistoricoAlteracao" SET motivo='forjado' WHERE id='${salvo.revisoes[0].historicoId}'`,
        `DELETE FROM "HistoricoAlteracao" WHERE id='${salvo.revisoes[0].historicoId}'`,
      ];
      for (const tabela of ['ReviewSugestaoRevisao','ReviewSugestaoAprovacao']) comandos.push(`UPDATE "${tabela}" SET motivo='forjado'`, `DELETE FROM "${tabela}"`, `TRUNCATE "${tabela}" CASCADE`);
      for (const comando of comandos) {
        const r = executarPsqlDeTeste(url(banco, papel), ['-c', `BEGIN; ${contexto} ${comando}; COMMIT;`]);
        expect(r.ok, comando).toBe(false);
      }
      expect(await consultar()).toEqual(salvo);
    });
    it('snapshot ou fonte adulterados por SQL/domain bypass não viram nova revisão', async () => {
      await preparar(); await gravarReviewFila(a, AUTOR, rascunho()); const salvo = (await consultar())!;
      const politicaB = await versionarReviewPolitica(b, AUTOR, entrada(null));
      for (const alteracao of [{ fatosComentario: 'Adulterado' }, { politicaSnapshot: { forjado: true } }, { politicaVersaoId: 'ausente' }, { politicaVersaoId: politicaB.versaoId }]) {
        await expect(a.transacao(async tx => {
          await tx.reviewSugestao.updateMany({ where: { id: salvo.id, revisaoAtual: 1 }, data: { revisaoAtual: 2, estado: 'RASCUNHO' } });
          const id = crypto.randomUUID();
          const h = await tx.historicoAlteracao.create({ data: { parceiroId: tx.parceiroId, entidade: 'ReviewSugestao', entidadeId: salvo.id, acao: 'EDITOU', autorNome: AUTOR.autorNome, motivo: 'Preparação local', depois: { revisaoId: id, revisao: 2, estado: 'RASCUNHO', origem: 'LOCAL_SIMULATION', capacidade: 'INATIVA', autorUserId: AUTOR.userId } } });
          const original = await tx.reviewSugestaoRevisao.findFirstOrThrow({ where: { sugestaoId: salvo.id, numero: 1 } });
          await tx.reviewSugestaoRevisao.create({ data: { ...original, politicaSnapshot: original.politicaSnapshot!, id, numero: 2, historicoId: h.id, ...alteracao } });
        })).rejects.toThrow();
      }
      expect(await consultar()).toEqual(salvo);
    });
    it('consulta com novo cliente recupera todos os snapshots; listagem paginada respeita loja/estado', async () => {
      await preparar(); await gravarReviewFila(a, AUTOR, rascunho()); const salvo = await aprovarReviewFila(a, AUTOR, aprovacao());
      await gravarReviewFila(a, AUTOR, rascunho(0, 'Segunda', 'segunda'));
      await gravarReviewFila(a, AUTOR, rascunho(0, 'Outra loja', 'terceira', a2));
      const novoDb = new PrismaClient({ datasources: { db: { url: url(banco, papel) } } });
      try { expect(await consultarReviewFila(doParceiro(a.parceiroId, novoDb), identidade())).toEqual(salvo); }
      finally { await novoDb.$disconnect(); }
      const pagina = await listarReviewFila(a, { lojaId: a1, limite: 1 });
      expect(pagina.itens).toHaveLength(1); expect(pagina.proximoId).not.toBeNull();
      const ultima = await listarReviewFila(a, { lojaId: a1, limite: 1, depoisId: pagina.proximoId! });
      expect(ultima.itens).toHaveLength(1); expect(ultima.proximoId).toBeNull();
      expect(new Set([...pagina.itens,...ultima.itens].map(i => i.id)).size).toBe(2);
      expect((await listarReviewFila(a, { lojaId: a1, limite: 10, estado: 'APROVADA' })).itens.map(i => i.id)).toEqual([salvo!.id]);
    });
  });
});
