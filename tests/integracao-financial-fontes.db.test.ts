import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as esperar } from 'node:timers/promises';
import { PrismaClient, type IntegracaoApp } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ContextoDoParceiro } from '@/lib/erp/contexto-base';
import { mudarLiberacao } from '@/lib/erp/liberacao';
import { ALCANCE_FLOWFOODS, type Alcance } from '@/lib/erp/permissoes';
import { doParceiro } from '@/lib/erp/tenant';
import { listarRecibosFontesFinancial, registrarFontesFinancial } from '@/lib/integracoes/core/fontes-financial';
import type { EscopoFontesFinancial } from '@/lib/integracoes/ifood/financial-v3-pacote-fontes';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';
import { criarFontesFinancial } from './fixtures/ifood-financial-pacote';

const url = process.env.ERP_DB_TESTE;
const autor = { userId: 'operador-n1-fixture', autorNome: 'Nível 1 sintético' };
const competencia = '2024-02';
const rede: Alcance = { nivel: 'REDE', lojas: 'todas', permissoes: new Set(['integracao.ver', 'faturamento.ver']) };
type Massa = { ctx: ContextoDoParceiro; escopo: EscopoFontesFinancial; moduloId: string };

describe.skipIf(!url)('recibos das fontes Financial no PostgreSQL descartável', () => {
  let db: PrismaClient, perfil: PerfilDoBanco, app: IntegracaoApp;
  const parceiros: string[] = [];

  beforeAll(async () => {
    if (!['127.0.0.1', 'localhost'].includes(new URL(url!).hostname)) throw new Error('A suíte de recebimento exige PostgreSQL local descartável.');
    db = new PrismaClient({ datasources: { db: { url: url! } } });
    perfil = await perfilDoBanco(db);
    app = await db.integracaoApp.create({ data: {
      nome: 'App sintético de homologação', provedor: 'IFOOD', ambiente: 'TEST', categoria: 'TEST',
      clientId: 'recibos-' + randomUUID(), nomeDoSegredo: 'IFOOD_TEST_CLIENT_SECRET', modulos: ['FINANCIAL'], criadoPorNome: autor.autorNome,
    } });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      if (parceiros.length) await limparParceiros(db, perfil, parceiros);
      if (app) await db.$transaction(async tx => {
        await tx.$executeRaw`ALTER TABLE "IntegracaoApp" DISABLE TRIGGER "IntegracaoApp_nao_apaga"`;
        await tx.integracaoApp.delete({ where: { id: app.id } });
        await tx.$executeRaw`ALTER TABLE "IntegracaoApp" ENABLE TRIGGER "IntegracaoApp_nao_apaga"`;
      });
    } finally { await db.$disconnect(); }
  }, 60_000);

  async function vinculo(ctx: ContextoDoParceiro, lojaId: string, merchantId: string = randomUUID()): Promise<Massa> {
    const { cliente } = ctx, parceiroId = cliente.parceiroId;
    const conexao = await cliente.integracaoConexao.create({ data: {
      parceiroId, lojaId, provedor: 'IFOOD', ambiente: 'TEST', idExterno: merchantId,
      nomeExterno: 'Vínculo sintético', criadoPorNome: autor.autorNome,
    } });
    const modulo = await cliente.integracaoConexaoModulo.create({ data: {
      parceiroId, conexaoId: conexao.id, modulo: 'FINANCIAL', estado: 'AUTORIZADO', appId: app.id, criadoPorNome: autor.autorNome,
    } });
    return { ctx, escopo: { parceiroId, lojaId, conexaoId: conexao.id, merchantId, ambiente: 'TEST', competencia }, moduloId: modulo.id };
  }

  async function preparar(): Promise<Massa> {
    const parceiro = await db.parceiroFlow.create({ data: {
      nome: 'Parceiro sintético', slug: 'recibos-' + randomUUID(), status: 'ATIVO', homologacaoDeIntegracao: true,
    } });
    parceiros.push(parceiro.id);
    const cliente = doParceiro(parceiro.id, db);
    const ctx = { parceiro, cliente, alcance: ALCANCE_FLOWFOODS, podeEscrever: true, bloqueio: null, sessao: autor };
    const loja = await cliente.loja.create({ data: { parceiroId: parceiro.id, nome: 'Loja sintética', slug: 'loja' } });
    await mudarLiberacao(cliente, 'integracao', true, autor.autorNome);
    return vinculo(ctx, loja.id);
  }

  function entrada(escopo: EscopoFontesFinancial, comissaoBp = 1200, identar = false) {
    const { arquivoGzip, manifesto } = criarFontesFinancial(escopo.competencia, escopo);
    manifesto.configuracao.vigencias[0].comissaoBp = comissaoBp;
    const manifestoJson = Buffer.from(JSON.stringify(manifesto, null, identar ? 2 : undefined));
    return { lojaId: escopo.lojaId, conexaoId: escopo.conexaoId, competencia: escopo.competencia, arquivoGzip, manifestoJson };
  }
  const listar = (m: Massa, alcance = rede, filtro = m.escopo) =>
    m.ctx.cliente.transacao(tx => listarRecibosFontesFinancial(tx, alcance, filtro));

  it('vincula cada entidade ao mesmo tenant por FK composta e só aceita UUID iFood canônico no cadastro', async () => {
    const fks = await db.$queryRaw<{ nome: string; definicao: string }[]>`SELECT conname AS nome, pg_get_constraintdef(oid) AS definicao
      FROM pg_constraint WHERE conrelid = to_regclass('"IntegracaoReciboFinancial"') AND contype = 'f' AND convalidated ORDER BY conname`;
    for (const [chave, tabela, coluna] of [
      ['IFRecibo_loja_fkey', 'Loja', 'lojaId'], ['IFRecibo_conexao_fkey', 'IntegracaoConexao', 'conexaoId'],
      ['IFRecibo_modulo_fkey', 'IntegracaoConexaoModulo', 'moduloId'],
    ]) {
      expect(fks.find(fk => fk.nome === chave)?.definicao)
        .toContain(`FOREIGN KEY ("parceiroId", "${coluna}") REFERENCES "${tabela}"("parceiroId", id)`);
    }
    const m = await preparar();
    const maiusculo = 'ABCDEFAB-1234-4234-8234-ABCDEF123456';
    await expect(vinculo(m.ctx, m.escopo.lojaId, maiusculo)).rejects.toThrow(/IntegracaoConexao_id_externo/);
    const { manifesto, arquivoGzip } = criarFontesFinancial(competencia, m.escopo);
    manifesto.escopo.merchantId = m.escopo.merchantId.toUpperCase();
    expect(await registrarFontesFinancial(m.ctx, { ...entrada(m.escopo), arquivoGzip, manifestoJson: Buffer.from(JSON.stringify(manifesto)) }))
      .toMatchObject({ ok: true, reenvio: false });
    expect((await m.ctx.cliente.integracaoReciboFinancial.findFirstOrThrow()).merchantId).toBe(m.escopo.merchantId);
  });

  it('reenvios simultâneos e JSON equivalente dão o mesmo recibo; a revisão fica em outro registro', async () => {
    const m = await preparar(), { cliente } = m.ctx, dados = entrada(m.escopo);
    const retornos = await Promise.all(Array.from({ length: 4 }, () => registrarFontesFinancial(m.ctx, dados)));
    expect(retornos.every(r => r.ok)).toBe(true);
    const primeira = retornos.find(r => r.ok && !r.reenvio);
    if (!primeira?.ok) throw new Error('O primeiro recibo deveria ter sido gravado.');
    expect(retornos.filter(r => r.ok && !r.reenvio)).toHaveLength(1);
    for (const r of retornos) expect(r).toMatchObject({ ok: true, reciboId: primeira.reciboId });
    expect(await registrarFontesFinancial(m.ctx, entrada(m.escopo, 1200, true))).toEqual({ ...primeira, reenvio: true });
    const revisao = await registrarFontesFinancial(m.ctx, entrada(m.escopo, 1250));
    expect(revisao).toMatchObject({ ok: true, reenvio: false });
    if (!revisao.ok) throw new Error('Revisão indisponível.');
    expect(revisao.reciboId).not.toBe(primeira.reciboId);

    const gravado = await cliente.integracaoReciboFinancial.findUniqueOrThrow({ where: { id: primeira.reciboId } });
    expect(gravado).toMatchObject({
      ...m.escopo, moduloId: m.moduloId, recebidoPorId: autor.userId, recebidoEm: expect.any(Date),
      origem: 'MANUAL_DECLARADA', situacao: 'RECEBIDO_PARA_CONFERENCIA', linhasArquivo: 2, pedidosDistintos: 1,
      quantidadeEventos: 1, paginasEventos: 1, vigencias: [{ inicio: '2024-02-01', fim: '2024-02-29', comissaoBp: 1200, pagamentoBp: 0 }],
      arquivoSha256: createHash('sha256').update(dados.arquivoGzip).digest('hex'),
      manifestoSha256: createHash('sha256').update(dados.manifestoJson).digest('hex'),
      requestIdSha256: createHash('sha256').update('protocolo-sintetico').digest('hex'),
    });
    expect(JSON.stringify(gravado)).not.toMatch(/pedido-sintetico|protocolo-sintetico|ORDER_COMMISSION/);
    const consultados = await listar(m);
    expect(consultados).toMatchObject({ total: 2, pagina: 1, paginas: 1 });
    expect(consultados.itens.map(i => i.id)).toEqual([revisao.reciboId, primeira.reciboId]);
    expect(consultados.itens[0]).not.toHaveProperty('recebidoPorId');
    expect(consultados.itens[0]).not.toHaveProperty('merchantId');
    expect(await cliente.integracaoExecucao.count()).toBe(0);
    expect(await cliente.faturamentoLancamento.count()).toBe(0);
    expect(await cliente.dreFotografia.count()).toBe(0);
    await expect(cliente.integracaoReciboFinancial.update({ where: { id: primeira.reciboId }, data: { recebidoPorId: 'outro' } })).rejects.toThrow();
    await expect(cliente.integracaoReciboFinancial.delete({ where: { id: primeira.reciboId } })).rejects.toThrow();
  }, 30_000);

  it('restringe recebimento e consulta ao parceiro, papel, permissões, loja, ambiente e competência', async () => {
    const a = await preparar(), b = await preparar(), dados = entrada(a.escopo);
    expect(await registrarFontesFinancial({ ...a.ctx, alcance: rede }, dados)).toMatchObject({ ok: false, motivo: 'sem-permissao' });
    expect(await registrarFontesFinancial({ ...a.ctx, podeEscrever: false }, dados)).toMatchObject({ ok: false, motivo: 'sem-permissao' });
    expect(await registrarFontesFinancial({ ...a.ctx, bloqueio: 'Parceiro bloqueado' }, dados)).toMatchObject({ ok: false, motivo: 'sem-permissao' });
    expect(await registrarFontesFinancial({ ...a.ctx, cliente: b.ctx.cliente }, dados)).toMatchObject({ ok: false, motivo: 'sem-permissao' });
    expect(await registrarFontesFinancial(b.ctx, dados)).toMatchObject({ ok: false, motivo: 'indisponivel' });
    expect(await registrarFontesFinancial(a.ctx, { ...dados, manifestoJson: entrada(b.escopo).manifestoJson })).toMatchObject({ ok: false, motivo: 'pacote-invalido' });
    const r = await registrarFontesFinancial(a.ctx, dados);
    if (!r.ok) throw new Error('Recibo ausente.');
    const vazia = { itens: [], total: 0, pagina: 1, paginas: 0 };
    expect(await listar(b, rede, a.escopo)).toEqual(vazia);
    expect(await listar(a, { ...rede, nivel: 'LOJA', lojas: [b.escopo.lojaId] })).toEqual(vazia);
    expect(await listar(a, { ...rede, permissoes: new Set(['integracao.ver']) })).toEqual(vazia);
    expect(await listar(a, rede, { ...a.escopo, ambiente: 'PRODUCAO' })).toEqual(vazia);
    expect(await listar(a, rede, { ...a.escopo, competencia: '2024-03' })).toEqual(vazia);
    if (perfil.rls) {
      const [isolamento] = await b.ctx.cliente.sql<{ fora: bigint; forca: boolean; inserir: boolean; mudar: boolean }>`SELECT
        (SELECT count(*) FROM "IntegracaoReciboFinancial" WHERE "id" = ${r.reciboId}) AS fora,
        relrowsecurity AND relforcerowsecurity AS forca,
        has_table_privilege(current_user, '"IntegracaoReciboFinancial"', 'INSERT') AS inserir,
        has_table_privilege(current_user, '"IntegracaoReciboFinancial"', 'UPDATE,DELETE,TRUNCATE') AS mudar
        FROM pg_class WHERE oid = to_regclass('"IntegracaoReciboFinancial"')`;
      expect(isolamento).toEqual({ fora: 0n, forca: true, inserir: true, mudar: false });
    }
    const atual = await a.ctx.cliente.integracaoReciboFinancial.findUniqueOrThrow({ where: { id: r.reciboId } });
    await expect(a.ctx.cliente.integracaoReciboFinancial.createMany({
      data: { ...atual, id: randomUUID(), vigencias: [], lojaId: b.escopo.lojaId },
    })).rejects.toThrow(/erp_financial_fontes_indisponiveis/);
    await mudarLiberacao(a.ctx.cliente, 'integracao', false, autor.autorNome);
    expect(await listar(a)).toEqual(vazia);
    expect(await registrarFontesFinancial(a.ctx, dados)).toMatchObject({ ok: false, motivo: 'indisponivel' });
    expect(await a.ctx.cliente.integracaoReciboFinancial.count()).toBe(1);
  }, 30_000);

  it('revalida status e ambiente do parceiro e preserva a versão anterior ao religar um merchant', async () => {
    const m = await preparar(), { ctx, escopo } = m;
    expect(await registrarFontesFinancial(ctx, entrada(escopo))).toMatchObject({ ok: true });
    await db.parceiroFlow.update({ where: { id: escopo.parceiroId }, data: { status: 'SUSPENSO' } });
    expect(await registrarFontesFinancial(ctx, entrada(escopo, 1300))).toMatchObject({ ok: false, motivo: 'indisponivel' });
    await db.parceiroFlow.update({ where: { id: escopo.parceiroId }, data: { status: 'ATIVO', homologacaoDeIntegracao: false } });
    expect(await registrarFontesFinancial(ctx, entrada(escopo, 1300))).toMatchObject({ ok: false, motivo: 'indisponivel' });
    await db.parceiroFlow.update({ where: { id: escopo.parceiroId }, data: { homologacaoDeIntegracao: true } });
    await ctx.cliente.integracaoConexao.update({
      where: { id: escopo.conexaoId }, data: { estado: 'DESLIGADA', desligadaEm: new Date(), desligadaPorNome: autor.autorNome },
    });
    const nova = await vinculo(ctx, escopo.lojaId, escopo.merchantId);
    expect(await registrarFontesFinancial(ctx, entrada(escopo))).toMatchObject({ ok: false, motivo: 'indisponivel' });
    expect(await registrarFontesFinancial(ctx, entrada(nova.escopo))).toMatchObject({ ok: true, reenvio: false });
    expect((await listar(m)).itens.map(i => i.conexaoId)).toEqual([nova.escopo.conexaoId, escopo.conexaoId]);
  }, 30_000);

  it('um recebimento em curso aguarda a revogação e não insere após o commit dela', async () => {
    const m = await preparar(), { ctx, moduloId } = m;
    let iniciar!: (pid: number) => void, terminar!: () => void;
    const travada = new Promise<number>(resolve => { iniciar = resolve; });
    const liberar = new Promise<void>(resolve => { terminar = resolve; });
    const revogacao = ctx.cliente.transacao(async tx => {
      await tx.integracaoConexaoModulo.update({ where: { id: moduloId }, data: { estado: 'PAUSADO', pausadoEm: new Date() } });
      const [dono] = await tx.sql<{ pid: number }>`SELECT pg_backend_pid() AS pid`;
      iniciar(dono.pid);
      await liberar;
    }, { timeout: 20_000 });
    const pid = await Promise.race([travada, revogacao.then(() => { throw new Error('A revogação não obteve a trava.'); })]);
    const registro = registrarFontesFinancial(ctx, entrada(m.escopo));
    try {
      const fim = Date.now() + 6_000;
      let bloqueada = false;
      while (!bloqueada && Date.now() < fim) {
        const [l] = await db.$queryRaw<{ bloqueada: boolean }[]>`SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity a WHERE a.datname = current_database() AND ${pid} = ANY(pg_blocking_pids(a.pid))
        ) AS bloqueada`;
        bloqueada = l.bloqueada;
        if (!bloqueada) await esperar(25);
      }
      expect(bloqueada).toBe(true);
    } finally {
      terminar();
      await revogacao;
    }
    expect(await registro).toMatchObject({ ok: false, motivo: 'indisponivel' });
    expect(await ctx.cliente.integracaoReciboFinancial.count()).toBe(0);
  }, 30_000);
});
