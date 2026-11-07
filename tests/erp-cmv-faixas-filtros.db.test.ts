import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { listarFichas } from '@/lib/erp/fichas';
import type { FiltroDoCmv } from '@/lib/erp/ficha-campos';
import type { FiltroDaFaixaDoCmv } from '@/lib/erp/cmv-faixas-campos';
import { cadastrarInsumoDeTeste, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const CANAIS = ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'] as const;
const CMV: FiltroDoCmv[] = [{ canal: 'LOJA', status: 'acima' }, { canal: 'IFOOD', status: 'dentro' }];
const FAIXAS: FiltroDaFaixaDoCmv[] = [{ canal: 'IFOOD', faixa: 'confortavel' }, { canal: 'DELIVERY_PROPRIO', faixa: 'critico' }];
const CORTES = { farolABp: 2000, farolBBp: 3000, farolCBp: 4000, farolDBp: 5000 };

describe.skipIf(!URL_TESTE)('3B · dois grupos de filtros e fotografia real', { timeout: 120_000 }, () => {
  let db: PrismaClient, perfil: PerfilDoBanco, a: ClienteDoParceiro, parceiroId: string, secaoId: string, filhoId: string;
  const ids: string[] = [], estados: string[] = [], consultas: string[] = [];
  let precosAntes: unknown;
  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('Banco precisa ser local');
    const banco = new PrismaClient({ datasources: { db: { url: URL_TESTE } }, log: [{ emit: 'event', level: 'query' }] });
    banco.$on('query', e => consultas.push(e.query)); db = banco; perfil = await perfilDoBanco(db);
    parceiroId = (await db.parceiroFlow.create({ data: { nome: 'Filtros sintéticos 3B', slug: `filtro3b-${crypto.randomUUID()}`, status: 'ATIVO' } })).id;
    a = doParceiro(parceiroId, db);
    secaoId = (await a.secaoFicha.create({ data: { parceiroId, nome: 'Seção alvo' } })).id;
    filhoId = (await a.subsecaoFicha.create({ data: { parceiroId, secaoId, nome: 'Filho alvo' } })).id;
    const ins = await cadastrarInsumoDeTeste(a, { nome: 'Custo 420 centavos', tipo: 'INGREDIENTE', unidade: 'KG', conteudo: '1', escala: 'base', preco: '4,20' });
    const sem = await cadastrarInsumoDeTeste(a, { nome: 'Custo ausente', tipo: 'INGREDIENTE', unidade: 'KG', conteudo: '1', escala: 'base', semPreco: 'on' });
    if (!ins.ok || !sem.ok) throw new Error('Fixture de custo recusada');
    const insumoCompleto = ins.id, insumoSemCusto = sem.id;
    await a.canalConfig.createMany({ data: CANAIS.map(canal => ({ parceiroId, canal, metaCmvPadraoBp: 2500, ...CORTES })) });
    await a.transacao(async tx => {
      async function ficha(nome: string, precos: (number | null)[], estado?: number) {
        const f = await tx.fichaTecnica.create({ data: { parceiroId, nome, tipo: 'PRATO', rendimentoMilesimos: 1000, unidadeRendimento: 'UN', secaoId, subsecaoId: estado === undefined && ids.length % 2 === 0 ? filhoId : null } });
        if (estado !== 8) await tx.fichaItem.create({ data: { parceiroId, fichaId: f.id, insumoId: estado === 5 ? insumoSemCusto : insumoCompleto, quantidadeMilesimos: 1000 } });
        const produto = await tx.produtoVenda.create({ data: { parceiroId, fichaId: f.id, nome } });
        await tx.produtoCanal.createMany({ data: CANAIS.map((canal, i) => ({ parceiroId, produtoId: produto.id, canal, precoManualCentavos: precos[i], ativo: estado !== 7 })) });
        return f.id;
      }
      for (let i = 0; i < 80; i++) {
        const precos = i < 48 ? [700, 4200, 1200] : i < 52 ? [700, 700, 1200] : i < 56 ? [700, 700, 2100]
          : i < 64 ? [2100, 700, 1200] : i < 72 ? [700, 2100, 700] : [2100, 2100, 700];
        ids.push(await ficha(`Alvo ${String(i + 1).padStart(2, '0')}`, precos));
      }
      for (let i = 0; i < 9; i++) {
        const preco = [4200, 2100, 1400, 840, 700, 1400, null, 1400, 1400][i];
        estados.push(await ficha(`Estado ${i + 1}`, [preco, preco, preco], i));
      }
      await tx.fichaTecnica.create({ data: { parceiroId, nome: 'Pré-preparo de teste', tipo: 'PRE_PREPARO', rendimentoMilesimos: 1000, unidadeRendimento: 'KG', secaoId } });
    }, { timeout: 60_000 });
    precosAntes = await a.produtoCanal.findMany({ orderBy: { id: 'asc' } });
  }, 120_000);
  afterAll(async () => { if (db) { if (parceiroId) await limparParceiros(db, perfil, [parceiroId]); await db.$disconnect(); } }, 120_000);

  it('OR de cada grupo e AND entre grupos: 64/64/56, com paginação50+6 e correspondência em canais diferentes', async () => {
    const meta = await listarFichas(a, { q: 'Alvo', cmv: CMV }, { verPrecos: true });
    const faixa = await listarFichas(a, { q: 'Alvo', faixasCmv: FAIXAS }, { verPrecos: true });
    const um = await listarFichas(a, { q: 'Alvo', secao: secaoId, cmv: CMV, faixasCmv: FAIXAS }, { verPrecos: true });
    const dois = await listarFichas(a, { q: 'Alvo', secao: secaoId, cmv: CMV, faixasCmv: FAIXAS, pagina: 2 }, { verPrecos: true });
    expect([meta.total, faixa.total, um.total]).toEqual([64, 64, 56]);
    expect([um.linhas.length, dois.linhas.length, um.paginas]).toEqual([50, 6, 2]);
    expect([...um.linhas, ...dois.linhas].map(l => l.id)).toEqual(ids.slice(0, 56));
    expect(um.cmv!.size).toBe(50);
    expect(um.correspondenciasFaixasCmv!.size).toBe(50);
    expect(um.correspondenciasCmv!.get(ids[0])).toEqual([{ canal: 'LOJA', status: 'acima' }]);
    expect(um.correspondenciasFaixasCmv!.get(ids[0])).toEqual([{ canal: 'IFOOD', faixa: 'confortavel' }]);
    expect(um.correspondenciasFaixasCmv!.get(ids[48])).toHaveLength(2);
    expect(dois.correspondenciasCmv!.get(ids[52])).toHaveLength(2);
    expect(new Set([...um.cmv!.keys(), ...dois.cmv!.keys()])).toEqual(new Set(ids.slice(0, 56)));
  });

  it('classificação/nome/tipo/situação refinam antes da conta; nenhuma seleção libera os80 e não vende pré-preparo', async () => {
    expect((await listarFichas(a, { q: 'Alvo' }, { verPrecos: true })).total).toBe(80);
    expect((await listarFichas(a, { q: 'Alvo', secao: secaoId, subsecao: filhoId, cmv: CMV, faixasCmv: FAIXAS }, { verPrecos: true })).total).toBe(28);
    expect((await listarFichas(a, { q: 'Alvo 56', faixasCmv: FAIXAS }, { verPrecos: true })).linhas.map(l => l.id)).toEqual([ids[55]]);
    expect((await listarFichas(a, { tipo: 'PRE_PREPARO', faixasCmv: FAIXAS }, { verPrecos: true })).total).toBe(0);
    expect((await listarFichas(a, { q: 'Alvo', situacao: 'desativadas', faixasCmv: FAIXAS }, { verPrecos: true })).total).toBe(0);
    const alheia = await listarFichas(a, { secao: 'nao-pertence', faixasCmv: FAIXAS }, { verPrecos: true });
    expect(alheia.total).toBe(0); expect(alheia.avisoFiltro).toBeTruthy();
  });

  it('21 pares configurados têm testemunhas exatas; sem dados não incorpora zero como muito favorável', async () => {
    const faixas = ['muitoFavoravel', 'favoravel', 'confortavel', 'atencao', 'critico', 'semDados', 'naoOfertado'] as const;
    for (const canal of CANAIS) for (const [n, faixa] of faixas.entries()) {
      const r = await listarFichas(a, { q: 'Estado', faixasCmv: [{ canal, faixa }] }, { verPrecos: true });
      expect(r.linhas.map(l => l.id), `${canal}/${faixa}`).toEqual(n < 5 ? [estados[n]] : n === 5 ? [estados[5], estados[6], estados[8]] : [estados[7]]);
    }
  });

  it('os três pares sem configuração aparecem após retirada do canal; faltas e não oferta conservam precedência', async () => {
    for (const canal of CANAIS) {
      const cfg = await a.canalConfig.findFirstOrThrow({ where: { canal } });
      try {
        await a.canalConfig.update({ where: { id: cfg.id }, data: { farolABp: null, farolBBp: null, farolCBp: null, farolDBp: null } });
        const r = await listarFichas(a, { q: 'Estado', faixasCmv: [{ canal, faixa: 'faixasNaoConfiguradas' }] }, { verPrecos: true });
        expect(r.linhas.map(l => l.id)).toEqual(estados.slice(0, 5));
        expect((await listarFichas(a, { q: 'Estado', faixasCmv: [{ canal, faixa: 'semDados' }] }, { verPrecos: true })).total).toBe(3);
        expect((await listarFichas(a, { q: 'Estado', faixasCmv: [{ canal, faixa: 'naoOfertado' }] }, { verPrecos: true })).total).toBe(1);
      } finally { await a.canalConfig.update({ where: { id: cfg.id }, data: { ...CORTES, atualizadoEm: cfg.atualizadoEm } }); }
    }
  });

  it('sem preços ignora os três filtros financeiros antes de ler configuração ou determinar total', async () => {
    const normal = await listarFichas(a, { q: 'Alvo', secao: secaoId }); consultas.length = 0;
    const forjado = await listarFichas(a, { q: 'Alvo', secao: secaoId, incompleto: true, cmv: CMV, faixasCmv: FAIXAS });
    expect(forjado.total).toBe(normal.total);
    expect(forjado.linhas.map(l => l.id)).toEqual(normal.linhas.map(l => l.id));
    expect(forjado.filtros).toMatchObject({ cmv: [], faixasCmv: [], incompleto: false });
    expect(forjado.cmv).toBeUndefined(); expect(forjado.correspondenciasCmv).toBeUndefined(); expect(forjado.correspondenciasFaixasCmv).toBeUndefined();
    expect(consultas.join('\n')).not.toMatch(/"CanalConfig"|"ProdutoCanal"|"ProdutoEmbalagem"/);
  });

  it('consultas em lote não crescem por ficha/canal e leituras mantêm todos os preços manuais', async () => {
    const contar = async (q: string) => {
      consultas.length = 0; await listarFichas(a, { q, faixasCmv: FAIXAS }, { verPrecos: true });
      return consultas.filter(sql => !/^(BEGIN|COMMIT|ROLLBACK|SET TRANSACTION)/i.test(sql)).length;
    };
    expect(await contar('Alvo')).toBe(await contar('Alvo 01'));
    expect(await a.produtoCanal.findMany({ orderBy: { id: 'asc' } })).toEqual(precosAntes);
  });

  it('mudança de configuração/preço entre count e página só aparece na leitura seguinte', async () => {
    const cfg = await a.canalConfig.findFirstOrThrow({ where: { canal: 'IFOOD' } });
    const produto = await a.produtoVenda.findFirstOrThrow({ where: { fichaId: ids[0] } });
    const preco = await a.produtoCanal.findFirstOrThrow({ where: { produtoId: produto.id, canal: 'IFOOD' } });
    let mudou = false;
    const durante: ClienteDoParceiro = { ...a, transacao: (fn, opcoes) => a.transacao(tx => fn({ ...tx, fichaTecnica: new Proxy({ ...tx.fichaTecnica }, { get(alvo, prop, receptor) {
      if (prop !== 'count') return Reflect.get(alvo, prop, receptor);
      return async (...args: Parameters<typeof alvo.count>) => {
        const count = await alvo.count(...args);
        if (!mudou) { await a.transacao(async escrita => {
          await escrita.canalConfig.update({ where: { id: cfg.id }, data: { farolABp: 100, farolBBp: 200, farolCBp: 300, farolDBp: 400 } });
          await escrita.produtoCanal.update({ where: { id: preco.id }, data: { precoManualCentavos: 2000 } });
        }); mudou = true; }
        return count;
      };
    } }) }), opcoes) };
    try {
      consultas.length = 0;
      const anterior = await listarFichas(durante, { q: 'Alvo 01', faixasCmv: [{ canal: 'IFOOD', faixa: 'confortavel' }] }, { verPrecos: true });
      expect(mudou).toBe(true); expect(anterior.total).toBe(1);
      expect(anterior.cmv!.get(ids[0])!.find(c => c.canal === 'IFOOD')).toMatchObject({ precoCentavos: 1200, farol: { faixa: 'confortavel', cortes: { aBp: 2000, bBp: 3000, cBp: 4000, dBp: 5000 } } });
      expect(consultas.join('\n')).toMatch(/REPEATABLE READ/);
      const atual = await listarFichas(a, { q: 'Alvo 01' }, { verPrecos: true });
      expect(atual.cmv!.get(ids[0])!.find(c => c.canal === 'IFOOD')).toMatchObject({ precoCentavos: 2000, farol: { faixa: 'critico', cortes: { aBp: 100, bBp: 200, cBp: 300, dBp: 400 } } });
    } finally {
      await a.canalConfig.update({ where: { id: cfg.id }, data: { ...CORTES, atualizadoEm: cfg.atualizadoEm } });
      await a.produtoCanal.update({ where: { id: preco.id }, data: { precoManualCentavos: preco.precoManualCentavos, atualizadoEm: preco.atualizadoEm } });
    }
  });
});
