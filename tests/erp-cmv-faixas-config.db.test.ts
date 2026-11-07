import { PrismaClient } from '@prisma/client';
import { setTimeout as esperar } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { obterFaixasDeCmv, salvarFaixasDeCmv, obterTaxaDoIfood, salvarMetasDeCmv, salvarTaxaDoIfood, salvarMargensAlvo } from '@/lib/erp/canais';
import { listarHistorico } from '@/lib/erp/historico';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const textos = { a: '20', b: '30', c: '40', d: '50' }, outros = { a: '21', b: '31', c: '41', d: '51' }, vazios = { a: '', b: '', c: '', d: '' };
const entrada = (valores = textos) => ({ LOJA: valores, DELIVERY_PROPRIO: valores, IFOOD: valores });

describe.skipIf(!URL_TESTE)('3B · configuração, versões e transações reais', { timeout: 120_000 }, () => {
  let db: PrismaClient, perfil: PerfilDoBanco;
  const parceiros: string[] = [];
  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('Banco precisa ser local');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } }); perfil = await perfilDoBanco(db);
  });
  afterAll(async () => { if (db) { await limparParceiros(db, perfil, parceiros); await db.$disconnect(); } }, 120_000);
  async function novo() {
    const p = await db.parceiroFlow.create({ data: { nome: 'Configuração sintética 3B', slug: `config3b-${crypto.randomUUID()}`, status: 'ATIVO' } });
    parceiros.push(p.id); return doParceiro(p.id, db);
  }
  async function salvar(a: ClienteDoParceiro, faixas: unknown = entrada()) {
    return salvarFaixasDeCmv(a, { faixas, versao: (await obterFaixasDeCmv(a)).versao }, 'Pessoa sintética');
  }
  const linhas = (a: ClienteDoParceiro) => a.canalConfig.findMany({ orderBy: { canal: 'asc' } });

  it('ausência não cria default; primeiro envio cria três conjuntos e iFood continua sem taxa conhecida', async () => {
    const a = await novo();
    expect((await obterFaixasDeCmv(a)).faixas).toEqual({ LOJA: null, DELIVERY_PROPRIO: null, IFOOD: null });
    expect(await a.canalConfig.count()).toBe(0);
    expect(await salvar(a)).toMatchObject({ ok: true, mudou: ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'] });
    expect(await a.canalConfig.count()).toBe(3);
    expect(await a.canalConfig.findFirst({ where: { canal: 'IFOOD' } })).toMatchObject({ taxaConfigurada: false, taxaBp: 0, taxaPagamentoBp: 0, metaCmvPadraoBp: null });
    expect(await a.historicoAlteracao.count({ where: { entidade: 'CanalConfig' } })).toBe(3);
    expect(await a.produtoCanal.count()).toBe(0);
  });

  it('reenvio igual não muda versão nem histórico; retirada limpa só os cortes do canal escolhido', async () => {
    const a = await novo(); await salvar(a);
    await a.canalConfig.updateMany({ where: { canal: 'IFOOD' }, data: { taxaConfigurada: true, taxaBp: 1700, taxaPagamentoBp: 320, metaCmvPadraoBp: 2800, margemAlvoPadraoBp: 5000 } });
    await a.canalConfig.updateMany({ data: { atualizadoEm: new Date('2050-01-01T00:00:00Z') } });
    const antes = await linhas(a), versao = (await obterFaixasDeCmv(a)).versao, historico = await a.historicoAlteracao.findMany({ orderBy: { id: 'asc' } });
    expect(await salvar(a)).toMatchObject({ ok: true, mudou: [] });
    expect(await linhas(a)).toEqual(antes);
    expect((await obterFaixasDeCmv(a)).versao).toBe(versao);
    expect(await a.historicoAlteracao.findMany({ orderBy: { id: 'asc' } })).toEqual(historico);
    expect(await salvar(a, { ...entrada(), IFOOD: vazios })).toMatchObject({ ok: true, mudou: ['IFOOD'] });
    const depois = await linhas(a), ifood = depois.find(c => c.canal === 'IFOOD')!;
    expect(ifood).toMatchObject({ id: antes.find(c => c.canal === 'IFOOD')!.id, farolABp: null, farolBBp: null, farolCBp: null, farolDBp: null, taxaConfigurada: true, taxaBp: 1700, taxaPagamentoBp: 320, metaCmvPadraoBp: 2800, margemAlvoPadraoBp: 5000 });
    expect(ifood.atualizadoEm.getTime()).toBe(antes.find(c => c.canal === 'IFOOD')!.atualizadoEm.getTime() + 1);
    expect(depois.filter(c => c.canal !== 'IFOOD')).toEqual(antes.filter(c => c.canal !== 'IFOOD'));
  });

  it('um canal inválido ou ausente recusa os três e conserva todas as linhas/eventos', async () => {
    const a = await novo(); await salvar(a);
    const antes = await linhas(a), historico = await a.historicoAlteracao.count();
    for (const faixas of [{ LOJA: outros, DELIVERY_PROPRIO: outros }, { ...entrada(outros), IFOOD: { ...outros, d: '1' } }, { ...entrada(outros), IFOOD: { ...outros, c: null } }]) {
      expect(await salvar(a, faixas)).toMatchObject({ ok: false });
      expect(await linhas(a)).toEqual(antes); expect(await a.historicoAlteracao.count()).toBe(historico);
    }
  });

  it('versões conflitam nos dois sentidos com meta, taxa e margem sem sobrescrever seus campos', async () => {
    const a = await novo(); await salvar(a);
    for (const tipo of ['meta', 'taxa', 'margem'] as const) {
      const cfg = await obterTaxaDoIfood(a), faixas = await obterFaixasDeCmv(a);
      const alterar = (origem: typeof cfg) => tipo === 'meta'
        ? salvarMetasDeCmv(a, { versao: origem.versaoDasMetas, metas: { LOJA: '25', DELIVERY_PROPRIO: '26', IFOOD: '27' } })
        : tipo === 'taxa' ? salvarTaxaDoIfood(a, { versao: origem.versao, comissao: '17', pagamento: '3,2' })
          : salvarMargensAlvo(a, { versao: origem.versaoDasMargens, margens: { LOJA: '40', DELIVERY_PROPRIO: '41', IFOOD: '42' } });
      expect(await alterar(cfg)).toMatchObject({ ok: true });
      const atual = await linhas(a);
      expect(await salvarFaixasDeCmv(a, { versao: faixas.versao, faixas: entrada(outros) })).toMatchObject({ ok: false, conflito: true });
      expect(await linhas(a)).toEqual(atual);
      const antigo = await obterTaxaDoIfood(a);
      expect(await salvar(a, entrada(outros))).toMatchObject({ ok: true });
      expect(await alterar(antigo)).toMatchObject({ ok: false, conflito: true });
      await salvar(a, entrada());
    }
  });

  it('CHECK real no terceiro canal desfaz os dois primeiros updates e seus históricos', async () => {
    const a = await novo(); await salvar(a);
    const antes = await linhas(a), contador = await a.historicoAlteracao.count(), ifood = antes.find(c => c.canal === 'IFOOD')!;
    let chamadas = 0;
    const durante: ClienteDoParceiro = { ...a, transacao: (fn, opcoes) => a.transacao(tx => fn({ ...tx, canalConfig: new Proxy({ ...tx.canalConfig }, { get(alvo, prop, receptor) {
      if (prop !== 'updateMany') return Reflect.get(alvo, prop, receptor);
      return async (...args: Parameters<typeof alvo.updateMany>) => {
        chamadas++;
        // Falha controlada de persistência: o próprio CHECK do Postgres recusa esta escrita,
        // depois de duas gravações reais. Não fabricamos count=0 nem exceção do Prisma.
        if (chamadas === 3) await tx.sql`UPDATE "CanalConfig" SET "farolDBp"=0 WHERE "parceiroId"=${tx.parceiroId} AND "id"=${ifood.id}`;
        return alvo.updateMany(...args);
      };
    } }) }), opcoes) };
    const r = await salvarFaixasDeCmv(durante, { versao: (await obterFaixasDeCmv(a)).versao, faixas: entrada(outros) });
    expect(chamadas).toBe(3); expect(r).toMatchObject({ ok: false });
    const depois = await linhas(a);
    expect(depois).toEqual(antes);
    expect(await a.historicoAlteracao.count()).toBe(contador);
  });

  for (const inicial of [false, true]) it(`${inicial ? 'edições' : 'primeiras criações'} concorrentes convergem para um envio completo e um conflito`, async () => {
    const a = await novo(); if (inicial) await salvar(a);
    const versao = (await obterFaixasDeCmv(a)).versao, historicoAntes = await a.historicoAlteracao.count();
    let pronta!: (pid: number) => void, liberar!: () => void;
    const comTrava = new Promise<number>(resolve => { pronta = resolve; });
    const soltar = new Promise<void>(resolve => { liberar = resolve; });
    const primeira = a.transacao(async tx => {
      const r = await salvarFaixasDeCmv(tx, { versao, faixas: entrada(outros) });
      const [p] = await tx.sql<{ pid: number }>`SELECT pg_backend_pid() AS pid`;
      pronta(p.pid); await soltar; return r;
    }, { timeout: 15_000 });
    const pid = await comTrava;
    const alternativo = { a: '22', b: '32', c: '42', d: '52' };
    const segunda = salvarFaixasDeCmv(a, { versao, faixas: entrada(alternativo) });
    try {
      let bloqueado = false;
      for (let n = 0; n < 100 && !bloqueado; n++) {
        const [r] = await db.$queryRaw<{ bloqueado: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ${pid}=ANY(pg_blocking_pids(pid))) AS bloqueado`;
        bloqueado = r.bloqueado; if (!bloqueado) await esperar(20);
      }
      expect(bloqueado, 'O segundo envio espera a transação real vencedora').toBe(true);
    } finally { liberar(); }
    const r = await Promise.all([primeira, segunda]);
    expect(r.filter(x => x.ok)).toHaveLength(1);
    expect(r.find(x => !x.ok)).toMatchObject({ conflito: true });
    const finais = await linhas(a), vencedor = r[0].ok ? 2100 : 2200;
    expect(finais.map(c => c.farolABp)).toEqual([vencedor, vencedor, vencedor]);
    expect(await a.historicoAlteracao.count()).toBe(historicoAntes + 3);
    expect(await salvar(a, entrada())).toMatchObject({ ok: true });
  });

  for (const escritor of ['taxa', 'meta', 'margem'] as const) it(`concorrência com ${escritor} em canal no-op das faixas não permite aceitar versão global antiga`, async () => {
    const a = await novo(); await salvar(a);
    const faixas = await obterFaixasDeCmv(a), cfg = await obterTaxaDoIfood(a);
    let pronta!: (pid: number) => void, liberar!: () => void;
    const comTrava = new Promise<number>(resolve => { pronta = resolve; }), soltar = new Promise<void>(resolve => { liberar = resolve; });
    const primeira = a.transacao(async tx => {
      const r = escritor === 'taxa' ? await salvarTaxaDoIfood(tx, { versao: cfg.versao, comissao: '17', pagamento: '3' })
        : escritor === 'meta' ? await salvarMetasDeCmv(tx, { versao: cfg.versaoDasMetas, metas: { LOJA: '', DELIVERY_PROPRIO: '', IFOOD: '25' } })
          : await salvarMargensAlvo(tx, { versao: cfg.versaoDasMargens, margens: { LOJA: '', DELIVERY_PROPRIO: '40', IFOOD: '' } });
      const [p] = await tx.sql<{ pid: number }>`SELECT pg_backend_pid() AS pid`; pronta(p.pid); await soltar; return r;
    }, { timeout: 15_000 });
    const pid = await comTrava;
    // Só LOJA muda. O outro canal precisa participar da versão mesmo sem update dos cortes.
    const segunda = salvarFaixasDeCmv(a, { versao: faixas.versao, faixas: { ...entrada(), LOJA: outros } });
    try {
      let bloqueado = false;
      for (let n = 0; n < 100 && !bloqueado; n++) {
        const [r] = await db.$queryRaw<{ bloqueado: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ${pid}=ANY(pg_blocking_pids(pid))) AS bloqueado`;
        bloqueado = r.bloqueado; if (!bloqueado) await esperar(20);
      }
      expect(bloqueado).toBe(true);
    } finally { liberar(); }
    const [r1, r2] = await Promise.all([primeira, segunda]);
    expect(r1).toMatchObject({ ok: true }); expect(r2).toMatchObject({ ok: false, conflito: true });
    expect((await linhas(a)).map(c => c.farolABp)).toEqual([2000, 2000, 2000]);
    expect(await a.historicoAlteracao.count()).toBe(4);
    expect(await salvar(a, { ...entrada(), LOJA: outros })).toMatchObject({ ok: true, mudou: ['LOJA'] });
  });

  it('taxonomia financeira é isolada por parceiro; eventos antigos não são recalculados e leitura sem preço não expõe cortes', async () => {
    const a = await novo(), b = await novo(); await salvar(a); await salvar(b, entrada(outros));
    const passado = await a.historicoAlteracao.findMany({ orderBy: { id: 'asc' } });
    const bAntes = await linhas(b); await salvar(a, entrada(vazios));
    expect(await linhas(b)).toEqual(bAntes);
    expect(await a.historicoAlteracao.findMany({ where: { id: { in: passado.map(h => h.id) } }, orderBy: { id: 'asc' } })).toEqual(passado);
    expect(await listarHistorico(a, { entidade: 'CanalConfig', verPrecos: false, verFichas: true })).toEqual([]);
    const permitido = await listarHistorico(a, { entidade: 'CanalConfig', verPrecos: true, verFichas: true });
    expect(permitido).toHaveLength(6);
    expect(permitido.flatMap(h => h.mudancas).some(m => String(m.antes).includes('20%') || String(m.depois).includes('20%'))).toBe(true);
  });
});
