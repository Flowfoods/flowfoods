import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarFicha, obterFicha, obterFichaComCanais } from '@/lib/erp/fichas';
import { lerImpressaoFinanceira, obterFichaParaImpressao } from '@/lib/erp/ficha-impressao';
import { obterFaixasDeCmv, salvarFaixasDeCmv, salvarPrecos } from '@/lib/erp/canais';
import { compararFracoes } from '@/lib/erp/unidades';
import { cadastrarInsumoDeTeste, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const antigos = { aBp: 2000, bBp: 2500, cBp: 3500, dBp: 4000 };
const novos = { aBp: 1000, bBp: 2000, cBp: 3000, dBp: 4500 };
describe.skipIf(!URL_TESTE)('3B · fotografia financeira de detalhe e impressão', { timeout: 120_000 }, () => {
  let db: PrismaClient, perfil: PerfilDoBanco, a: ClienteDoParceiro;
  let parceiroId: string, fichaId: string, insumoId: string;
  const consultas: string[] = [];
  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('Banco local obrigatório');
    const cliente = new PrismaClient({ datasources: { db: { url: URL_TESTE } }, log: [{ emit: 'event', level: 'query' }] });
    cliente.$on('query', e => consultas.push(e.query)); db = cliente; perfil = await perfilDoBanco(db);
    parceiroId = (await db.parceiroFlow.create({ data: { nome: 'Snapshot sintético 3B', slug: `snapshot3b-${crypto.randomUUID()}`, status: 'ATIVO' } })).id;
    a = doParceiro(parceiroId, db);
    const insumo = await cadastrarInsumoDeTeste(a, { escala: 'base', tipo: 'INGREDIENTE', nome: 'Ingrediente', unidade: 'UN', conteudo: '1', preco: '3' });
    if (!insumo.ok) throw new Error(JSON.stringify(insumo)); insumoId = insumo.id;
    const f = await cadastrarFicha(a, { nome: 'Prato', tipo: 'PRATO', rendimento: '1', itens: [{ insumoId, quantidade: '1', unidade: 'un' }] }, { tipo: 'manter' });
    if (!f.ok) throw new Error(JSON.stringify(f)); fichaId = f.id;
    const cfg = await obterFaixasDeCmv(a);
    expect(await salvarFaixasDeCmv(a, { versao: cfg.versao, faixas: { LOJA: { a: '20', b: '25', c: '35', d: '40' }, DELIVERY_PROPRIO: { a: '20', b: '25', c: '35', d: '40' }, IFOOD: { a: '20', b: '25', c: '35', d: '40' } } })).toMatchObject({ ok: true });
    const primeira = await obterFichaComCanais(a, fichaId, { verPrecos: true });
    expect(await salvarPrecos(a, fichaId, { impressao: primeira!.canais!.impressaoDosPrecos, custos: primeira!.canais!.impressaoDosCustos, precos: { LOJA: '10', DELIVERY_PROPRIO: '10', IFOOD: '10' } })).toMatchObject({ ok: true });
  });
  afterAll(async () => { if (db) { await limparParceiros(db, perfil, [parceiroId]); await db.$disconnect(); } }, 120_000);

  for (const modo of ['detalhe', 'impressão'] as const) it(`${modo}: custo, preço, CMV e cortes vêm do mesmo snapshot durante alteração por outra conexão`, async () => {
    const insumo = await a.insumo.findUniqueOrThrow({ where: { id: insumoId } });
    const configuracoes = await a.canalConfig.findMany(), precos = await a.produtoCanal.findMany();
    const versao = (await obterFicha(a, fichaId))!.versao;
    const versaoOperacional = (await obterFichaParaImpressao(a, fichaId))!.versaoOperacional;
    let mudou = false;
    const durante: ClienteDoParceiro = { ...a, transacao: (fn, opcoes) => a.transacao(tx => {
      const interno: ClienteDoParceiro = { ...tx, transacao: f => f(interno), canalConfig: new Proxy({ ...tx.canalConfig }, { get(alvo, prop, receptor) {
      if (prop !== 'findMany') return Reflect.get(alvo, prop, receptor);
      return async (...args: Parameters<typeof alvo.findMany>) => {
        if (!mudou) {
          mudou = true;
          // Aqui a ficha e seu custo já foram lidos. Escrita de verdade em outra conexão,
          // sem trocar o resultado de nenhum delegate ou de qualquer cálculo.
          await a.transacao(async escrita => {
            await escrita.insumo.update({ where: { id: insumoId }, data: { precoEmbalagemCentavos: 600 } });
            await escrita.produtoCanal.updateMany({ data: { precoManualCentavos: 1200 } });
            await escrita.canalConfig.updateMany({ data: { farolABp: 1000, farolBBp: 2000, farolCBp: 3000, farolDBp: 4500 } });
          });
        }
        return alvo.findMany(...args);
      };
    } }) }; return fn(interno);
    }, opcoes) };
    async function ler(cliente: ClienteDoParceiro) {
      if (modo === 'detalhe') return (await obterFichaComCanais(cliente, fichaId, { verPrecos: true }))!.canais!.cmv;
      const r = await lerImpressaoFinanceira(cliente, fichaId, versaoOperacional);
      if (!r.ok) throw new Error(r.erro); return r.canais!;
    }
    try {
      consultas.length = 0;
      const primeira = await ler(durante);
      expect(mudou).toBe(true); expect(consultas.join('\n')).toContain('REPEATABLE READ');
      for (const canal of primeira) {
        expect(compararFracoes(canal.fisico.valor, { num: 300n, den: 1n })).toBe(0);
        expect(compararFracoes(canal.cmvBp!, { num: 3000n, den: 1n })).toBe(0);
        expect(canal).toMatchObject({ precoCentavos: 1000, metaBp: null, farol: { faixa: 'confortavel', cortes: antigos } });
      }
      for (const canal of await ler(a)) {
        expect(compararFracoes(canal.fisico.valor, { num: 600n, den: 1n })).toBe(0);
        expect(compararFracoes(canal.cmvBp!, { num: 5000n, den: 1n })).toBe(0);
        expect(canal).toMatchObject({ precoCentavos: 1200, farol: { faixa: 'critico', cortes: novos } });
      }
      expect((await obterFicha(a, fichaId))!.versao).toBe(versao);
    } finally {
      await a.transacao(async tx => {
        await tx.insumo.update({ where: { id: insumoId }, data: { precoEmbalagemCentavos: insumo.precoEmbalagemCentavos, atualizadoEm: insumo.atualizadoEm } });
        for (const p of precos) await tx.produtoCanal.update({ where: { id: p.id }, data: { precoManualCentavos: p.precoManualCentavos, atualizadoEm: p.atualizadoEm } });
        for (const c of configuracoes) await tx.canalConfig.update({ where: { id: c.id }, data: { farolABp: c.farolABp, farolBBp: c.farolBBp, farolCBp: c.farolCBp, farolDBp: c.farolDBp, atualizadoEm: c.atualizadoEm } });
      });
    }
  });

  it('mudar apenas cortes não altera preço, receita ou snapshot antigo nem fabrica custoMudou ou evento ao reenviar preços', async () => {
    const antes = await obterFichaComCanais(a, fichaId, { verPrecos: true });
    const precos = await a.produtoCanal.findMany({ orderBy: { id: 'asc' } }), itens = await a.fichaItem.findMany({ orderBy: { id: 'asc' } });
    const historico = await a.historicoAlteracao.findMany({ where: { entidade: 'FichaTecnica' }, orderBy: { id: 'asc' } });
    expect(historico.length).toBeGreaterThan(1);
    const faixas = Object.fromEntries(['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'].map(c => [c, { a: '10', b: '20', c: '30', d: '45' }]));
    expect(await salvarFaixasDeCmv(a, { versao: (await obterFaixasDeCmv(a)).versao, faixas })).toMatchObject({ ok: true });
    expect(await salvarPrecos(a, fichaId, { impressao: antes!.canais!.impressaoDosPrecos, custos: antes!.canais!.impressaoDosCustos, precos: { LOJA: '10', DELIVERY_PROPRIO: '10', IFOOD: '10' } })).toMatchObject({ ok: true, mudou: [], custoMudou: false });
    expect(await a.produtoCanal.findMany({ orderBy: { id: 'asc' } })).toEqual(precos);
    expect(await a.fichaItem.findMany({ orderBy: { id: 'asc' } })).toEqual(itens);
    expect(await a.historicoAlteracao.findMany({ where: { entidade: 'FichaTecnica' }, orderBy: { id: 'asc' } })).toEqual(historico);
  });
});
