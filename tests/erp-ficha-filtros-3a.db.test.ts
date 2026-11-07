/** 3A: OR dos pares de CMV, AND operacional e paginação no universo completo. */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { listarFichas } from '@/lib/erp/fichas';
import { cmvDaLista } from '@/lib/erp/canais';
import type { FiltroDoCmv } from '@/lib/erp/ficha-campos';
import { cadastrarInsumoDeTeste, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const PARES: FiltroDoCmv[] = [{ canal: 'LOJA', status: 'acima' }, { canal: 'IFOOD', status: 'acima' }];

describe.skipIf(!URL_TESTE)('3A · filtros e fotografia do CMV (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient, perfil: PerfilDoBanco, a: ClienteDoParceiro;
  let parceiroId: string, secaoId: string, outraSecaoId: string, subsecaoId: string;
  const consultas: string[] = [];
  const fichas: string[] = [];
  let precosAntes: unknown;

  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('ERP_DB_TESTE precisa ser local.');
    const banco = new PrismaClient({ datasources: { db: { url: URL_TESTE } }, log: [{ emit: 'event', level: 'query' }] });
    banco.$on('query', e => consultas.push(e.query));
    db = banco;
    perfil = await perfilDoBanco(db);
    parceiroId = (await db.parceiroFlow.create({ data: { nome: 'Filtros sintéticos 3A', slug: `filtro3a-${crypto.randomUUID()}`, status: 'ATIVO' } })).id;
    a = doParceiro(parceiroId, db);
    secaoId = (await a.secaoFicha.create({ data: { parceiroId, nome: 'Principal sintética' } })).id;
    outraSecaoId = (await a.secaoFicha.create({ data: { parceiroId, nome: 'Outra sintética' } })).id;
    subsecaoId = (await a.subsecaoFicha.create({ data: { parceiroId, secaoId, nome: 'Pares' } })).id;
    const com = await cadastrarInsumoDeTeste(a, { nome: 'Com custo', tipo: 'INGREDIENTE', unidade: 'KG', conteudo: '1', escala: 'base', preco: '20,00' });
    const sem = await cadastrarInsumoDeTeste(a, { nome: 'Sem custo', tipo: 'INGREDIENTE', unidade: 'KG', conteudo: '1', escala: 'base', semPreco: 'on' });
    if (!com.ok || !sem.ok) throw new Error('Falhou fixture de insumo');
    await a.canalConfig.createMany({ data: ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'].map(canal => ({ parceiroId, canal: canal as 'LOJA' | 'DELIVERY_PROPRIO' | 'IFOOD', metaCmvPadraoBp: 2500 })) });
    await a.transacao(async tx => {
      for (let n = 0; n < 72; n++) {
        const f = await tx.fichaTecnica.create({ data: { parceiroId, nome: `Prato sintético ${String(n).padStart(3, '0')}`, tipo: 'PRATO', rendimentoMilesimos: 1000, unidadeRendimento: 'UN', secaoId: n < 69 ? secaoId : outraSecaoId, subsecaoId: n < 69 && n % 2 === 0 ? subsecaoId : null } });
        fichas.push(f.id);
        await tx.fichaItem.create({ data: { parceiroId, fichaId: f.id, insumoId: n === 65 || n === 66 ? sem.id : com.id, quantidadeMilesimos: 300 } });
        const produto = await tx.produtoVenda.create({ data: { parceiroId, fichaId: f.id, nome: f.nome } });
        await tx.produtoCanal.createMany({ data: [
          { parceiroId, produtoId: produto.id, canal: 'LOJA', precoManualCentavos: n < 55 || n >= 69 ? 1000 : 3000 },
          { parceiroId, produtoId: produto.id, canal: 'IFOOD', precoManualCentavos: (n >= 55 && n < 60) || n >= 69 ? 1000 : 3000, ativo: n !== 67 && n !== 68 },
          { parceiroId, produtoId: produto.id, canal: 'DELIVERY_PROPRIO', precoManualCentavos: 3000 },
        ] });
      }
      await tx.fichaTecnica.create({ data: { parceiroId, nome: 'Preparo sintético', tipo: 'PRE_PREPARO', rendimentoMilesimos: 1000, unidadeRendimento: 'KG', secaoId } });
    }, { timeout: 60_000 });
    precosAntes = await a.produtoCanal.findMany({ orderBy: { id: 'asc' } });
  }, 120_000);
  afterAll(async () => {
    if (db) { if (parceiroId) await limparParceiros(db, perfil, [parceiroId]); await db.$disconnect(); }
  }, 120_000);

  it('OR por pares encontra 60 pratos da seção, incluindo os que estão além dos 50 visíveis; células usam o mesmo mapa', async () => {
    consultas.length = 0;
    const um = await listarFichas(a, { secao: secaoId, cmv: PARES }, { verPrecos: true });
    const queryDaPrimeiraPagina = [...consultas];
    const dois = await listarFichas(a, { secao: secaoId, cmv: PARES, pagina: 2 }, { verPrecos: true });
    expect(um).toMatchObject({ total: 60, paginas: 2, pagina: 1 });
    expect(um.linhas).toHaveLength(50);
    expect(dois).toMatchObject({ total: 60, pagina: 2 });
    expect(dois.linhas).toHaveLength(10);
    expect(new Set([...um.linhas, ...dois.linhas].map(l => l.id))).toEqual(new Set(fichas.slice(0, 60)));
    expect(um.cmv).toBeInstanceOf(Map);
    expect(um.cmv!.size).toBe(50);
    expect(um.correspondenciasCmv!.size).toBe(50);
    const canonico = await cmvDaLista(a, um.linhas);
    expect(um.cmv).toEqual(canonico);
    for (const linha of [...um.linhas, ...dois.linhas]) {
      const pagina = um.cmv!.has(linha.id) ? um : dois;
      const esperado = PARES.filter(p => pagina.cmv!.get(linha.id)!.some(c => c.canal === p.canal && c.status === p.status));
      expect(pagina.correspondenciasCmv!.get(linha.id)).toEqual(esperado);
    }
    expect(queryDaPrimeiraPagina.join('\n')).toMatch(/REPEATABLE READ/i);
  });

  it('AND de seção, filho, texto, tipo e situação combina com OR financeiro sem duplicar quem casa em dois canais', async () => {
    const todos = await listarFichas(a, { cmv: PARES }, { verPrecos: true });
    expect(todos.total).toBe(63);
    const segundo = await listarFichas(a, { cmv: PARES, pagina: 2 }, { verPrecos: true });
    expect(new Set([...todos.linhas, ...segundo.linhas].map(l => l.id)).size).toBe(63);
    expect((await listarFichas(a, { secao: secaoId, subsecao: subsecaoId, cmv: PARES, tipo: 'PRATO' }, { verPrecos: true })).total).toBe(30);
    expect((await listarFichas(a, { secao: secaoId, subsecao: 'sem', cmv: PARES }, { verPrecos: true })).total).toBe(30);
    expect((await listarFichas(a, { secao: secaoId, q: 'Prato sintético 059', cmv: PARES }, { verPrecos: true })).linhas.map(l => l.id)).toEqual([fichas[59]]);
    expect((await listarFichas(a, { secao: secaoId, tipo: 'PRE_PREPARO', cmv: PARES }, { verPrecos: true })).total).toBe(0);
    expect((await listarFichas(a, { secao: secaoId, situacao: 'desativadas', cmv: PARES }, { verPrecos: true })).total).toBe(0);
    expect((await listarFichas(a, { secao: outraSecaoId, subsecao: subsecaoId, cmv: PARES }, { verPrecos: true })).total).toBe(0);
  });

  it('sem dados e não ofertado têm conjuntos próprios; nenhuma seleção não aplica restrição', async () => {
    expect((await listarFichas(a, { cmv: [{ canal: 'LOJA', status: 'semDados' }] }, { verPrecos: true })).linhas.map(l => l.id)).toEqual(fichas.slice(65, 67));
    expect((await listarFichas(a, { cmv: [{ canal: 'IFOOD', status: 'naoOfertado' }] }, { verPrecos: true })).linhas.map(l => l.id)).toEqual(fichas.slice(67, 69));
    expect((await listarFichas(a, { cmv: [] }, { verPrecos: true })).total).toBe(73);
  });

  it('sem precos.ver descarta incompleto e CMV antes da query: total, linhas e mapas não revelam estado financeiro', async () => {
    const sem = await listarFichas(a, { secao: secaoId, subsecao: subsecaoId });
    consultas.length = 0;
    const forjada = await listarFichas(a, { secao: secaoId, subsecao: subsecaoId, incompleto: true, cmv: [{ canal: 'LOJA', status: 'semDados' }] });
    expect(forjada.total).toBe(sem.total);
    expect(forjada.linhas.map(l => l.id)).toEqual(sem.linhas.map(l => l.id));
    expect(forjada.filtros).toMatchObject({ secao: secaoId, subsecao: subsecaoId, incompleto: false, cmv: [] });
    expect(forjada.cmv).toBeUndefined();
    expect(forjada.correspondenciasCmv).toBeUndefined();
    expect(consultas.join('\n')).not.toMatch(/"ProdutoCanal"|"CanalConfig"|"ProdutoEmbalagem"/);
  });

  it('filtro desconhecido não amplia o recorte e leituras nunca alteram preços manuais', async () => {
    const indisponivel = await listarFichas(a, { secao: 'nao-existe', cmv: PARES }, { verPrecos: true });
    expect(indisponivel.total).toBe(0);
    expect(indisponivel.avisoFiltro).toBeTruthy();
    expect(await a.produtoCanal.findMany({ orderBy: { id: 'asc' } })).toEqual(precosAntes);
  });

  it('alteração confirmada entre contagem e página não mistura duas fotografias de preço/situação', async () => {
    const ficha = await a.fichaTecnica.findUniqueOrThrow({ where: { id: fichas[0] } });
    const produto = await a.produtoVenda.findFirstOrThrow({ where: { fichaId: ficha.id } });
    const preco = await a.produtoCanal.findFirstOrThrow({ where: { produtoId: produto.id, canal: 'LOJA' } });
    let alterou = false;
    // Pausa somente depois da contagem real: outra conexão confirma a mudança antes da consulta da página.
    const durante: ClienteDoParceiro = { ...a, transacao: (fn, opcoes) => a.transacao(tx => fn({
      ...tx,
      fichaTecnica: new Proxy({ ...tx.fichaTecnica }, { get(alvo, propriedade, receptor) {
        if (propriedade !== 'count') return Reflect.get(alvo, propriedade, receptor);
        return async (...args: Parameters<typeof alvo.count>) => {
          const total = await alvo.count(...args);
          if (!alterou) {
            await a.transacao(async escrita => {
              await escrita.fichaTecnica.update({ where: { id: ficha.id }, data: { ativa: false } });
              await escrita.produtoCanal.update({ where: { id: preco.id }, data: { precoManualCentavos: 9900 } });
            });
            alterou = true;
          }
          return total;
        };
      } }),
    }), opcoes) };
    try {
      const pagina = await listarFichas(durante, { q: ficha.nome, cmv: [{ canal: 'LOJA', status: 'acima' }] }, { verPrecos: true });
      expect(alterou).toBe(true);
      expect(pagina.total).toBe(1);
      expect(pagina.linhas.map(l => [l.id, l.ativa])).toEqual([[ficha.id, true]]);
      expect(pagina.cmv!.get(ficha.id)!.find(c => c.canal === 'LOJA')).toMatchObject({ precoCentavos: 1000, status: 'acima' });
      const novaLeitura = await listarFichas(a, { q: ficha.nome, situacao: 'todas' }, { verPrecos: true });
      expect(novaLeitura.linhas[0].ativa).toBe(false);
      expect(novaLeitura.cmv!.get(ficha.id)!.find(c => c.canal === 'LOJA')).toMatchObject({ precoCentavos: 9900, status: 'dentro' });
    } finally {
      await a.fichaTecnica.update({ where: { id: ficha.id }, data: { ativa: ficha.ativa, atualizadoEm: ficha.atualizadoEm } });
      await a.produtoCanal.update({ where: { id: preco.id }, data: { precoManualCentavos: preco.precoManualCentavos, atualizadoEm: preco.atualizadoEm } });
    }
  });
});
