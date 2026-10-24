/**
 * N.1 — custo médio ponderado por LOJA no Postgres de verdade (decisão de 23/10/2026): o mesmo cenário que
 * mediu a contaminação (tests/erp-custo-duas-lojas.db.test.ts), agora com o método ligado nas duas lojas.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-custo-medio.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { garantirCategoriasPadrao, listarCategorias } from '@/lib/erp/categorias';
import { concluirAbertura, contarItem, custosDeReferencia, gravarMovimentos, iniciarAbertura, obterContagemDeAbertura } from '@/lib/erp/estoque';
import { concluirContagem, iniciarFechamento } from '@/lib/erp/contagem';
import { estornoDe } from '@/lib/erp/estoque-campos';
import { cmvDasLojas } from '@/lib/erp/cmv';
import { periodoDe } from '@/lib/erp/periodos';
import { resolverAlcance } from '@/lib/erp/permissoes';
import { impactoDoCustoMedio, ligarCustoMedio } from '@/lib/erp/custo-medio';
import { trocasDeCustoNoPeriodo } from '@/lib/erp/dre';
import { BRT, dia } from './erp-cmv-apoio';
import { cadastrarInsumoDeTeste as cadastrarInsumo, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const DONA = () => resolverAlcance({ perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });

describe.skipIf(!URL_TESTE)('N.1 · custo médio ponderado por loja, ligado nas duas lojas (Postgres real)', { timeout: 240_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `m${globalThis.crypto.randomUUID().slice(0, 8)}`;
  const criados: string[] = [];
  let a: ClienteDoParceiro;
  const ids: Record<string, string> = {};

  /** Nota LANÇADA com quantidade e valor livres (o apoio do CMV fixa R$ 1,00/kg) e a entrada no livro da loja. */
  const compra = (lojaId: string, insumoId: string, p: { numero: string; data: string; kg: number; centavos: number; lancadaEm: Date }) =>
    a.transacao(async (tx) => {
      const n = await tx.notaEntrada.create({
        data: { parceiroId: tx.parceiroId, lojaId, numero: p.numero, entradaEm: dia(p.data), totalCentavos: p.centavos, freteCentavos: 0, status: 'LANCADA', lancadaEm: p.lancadaEm },
      });
      await tx.notaEntradaItem.create({
        data: {
          parceiroId: tx.parceiroId,
          notaId: n.id,
          insumoId,
          descricaoNota: 'Frango',
          insumoNomeSnapshot: 'Frango',
          unidadeSnapshot: 'KG',
          embalagensMilesimos: p.kg * 1000,
          conteudoMilesimos: 1000,
          quantidadeMilesimos: p.kg * 1000,
          valorTotalCentavos: p.centavos,
          freteRateadoCentavos: 0,
        },
      });
      await gravarMovimentos(
        tx,
        [{ lojaId, insumoId, tipo: 'ENTRADA_COMPRA', quantidadeMilesimos: p.kg * 1000, valorCentavos: p.centavos, insumoNome: 'Frango', unidade: 'KG', motivo: `Nota ${p.numero}`, chave: `nota:${n.id}`, notaId: n.id }],
        { ocorridoEm: p.lancadaEm },
      );
      return n.id;
    });

  async function abrirLoja(lojaId: string, kg: string, quando: Date) {
    expect((await iniciarAbertura(a, DONA(), lojaId, 'Marina', quando)).ok).toBe(true);
    const ab = (await obterContagemDeAbertura(a, DONA(), lojaId))!;
    for (const item of ab.itens) {
      const solto = item.insumoId === ids.frango ? kg : item.insumoId === ids.sal ? '3' : '0';
      expect((await contarItem(a, DONA(), lojaId, { itemId: item.id, embalagens: '', solto, escala: 'base', versao: item.versao }, 'Marina', { agora: quando })).ok).toBe(true);
    }
    const v = (await a.contagem.findFirst({ where: { lojaId, tipo: 'ABERTURA' }, select: { versao: true } }))!.versao;
    expect((await concluirAbertura(a, DONA(), lojaId, { versao: v, confirmarNaoContados: true }, 'Marina', quando)).ok).toBe(true);
    return (await a.contagem.findFirst({ where: { lojaId, tipo: 'ABERTURA' } }))!;
  }

  async function fecharSetembro(lojaId: string, agora: Date) {
    const ini = await iniciarFechamento(a, DONA(), lojaId, { inicio: '2026-09-01' }, 'Marina', agora);
    if (!ini.ok) throw new Error(JSON.stringify(ini));
    const v = (await a.contagem.findUnique({ where: { id: ini.id }, select: { versao: true } }))!.versao;
    const r = await concluirContagem(a, DONA(), lojaId, ini.id, { versao: v, confirmarNaoContados: true }, 'Marina', agora);
    expect(r.ok).toBe(true);
    return (await a.contagem.findUnique({ where: { id: ini.id } }))!;
  }

  const retratoDo = (contagemId: string) => a.contagemRetratoItem.findFirst({ where: { contagemId, insumoId: ids.frango } });
  const saldoDe = (lojaId: string) => a.saldoEstoque.findFirst({ where: { lojaId, insumoId: ids.frango } });

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    const P = await db.parceiroFlow.create({ data: { nome: 'Custo médio (N.1)', slug: `medio-${sufixo}`, status: 'ATIVO' } });
    criados.push(P.id);
    a = doParceiro(P.id, db);
    await garantirCategoriasPadrao(a);
    const proteina = (await listarCategorias(a)).find((c) => c.chave === 'PROTEINA')!.id;
    for (const nome of ['Loja A', 'Loja B']) {
      const l = await cadastrarLoja(a, { nome }, 'Marina');
      if (!l.ok) throw new Error(JSON.stringify(l));
      ids[nome] = l.id;
      // N.1 ligado nas duas lojas ANTES da abertura (marco de corte em agosto).
      await a.loja.update({ where: { id: l.id }, data: { criadoEm: new Date('2026-01-10T12:00:00Z'), custoMedioDesde: new Date('2026-08-01T00:00:00Z') } });
    }
    const f = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', nome: 'Frango', unidade: 'KG', conteudo: '1', preco: '10,00', conservacao: 'CONGELADO', categoriaId: proteina });
    if (!f.ok) throw new Error(JSON.stringify(f));
    ids.frango = f.id;
    const s = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', nome: 'Sal grosso', unidade: 'KG', conteudo: '1', semPreco: 'on', conservacao: 'SECO', categoriaId: (await listarCategorias(a))[0].id });
    if (!s.ok) throw new Error(JSON.stringify(s));
    ids.sal = s.id;
  });

  afterAll(async () => {
    if (db) {
      await limparParceiros(db, perfil, criados);
      await db.$disconnect();
    }
  });


  const saida = (lojaId: string, kg: number, quando: Date, chave: string) =>
    a.transacao((tx) =>
      gravarMovimentos(
        tx,
        // O valor que vem de fora é o da referência da rede (R$ 20/kg): com o método ligado, o livro usa a média da loja.
        [{ lojaId, insumoId: ids.frango, tipo: 'AJUSTE', quantidadeMilesimos: -kg * 1000, valorCentavos: -kg * 2000, insumoNome: 'Frango', unidade: 'KG', motivo: 'teste', chave }],
        { ocorridoEm: quando },
      ),
    );
  const ultimo = (lojaId: string, insumoId = ids.frango) => a.movimentoEstoque.findFirst({ where: { lojaId, insumoId }, orderBy: { criadoEm: 'desc' } });

  it('as duas lojas abrem com 10 kg a R$ 10/kg; o sal sem custo entra com quantidade e SEM valor (desconhecido não é zero)', async () => {
    const quando = new Date('2026-09-01T13:00:00Z');
    const abA = await abrirLoja(ids['Loja A'], '10', quando);
    const abB = await abrirLoja(ids['Loja B'], '10', quando);
    ids.aberturaB = abB.id;
    expect(abA.valorTotalCentavos).toBe(10_000);
    expect(abB.valorTotalCentavos).toBe(10_000);
    const sal = (await saldoDe(ids['Loja B']).then(() => a.saldoEstoque.findFirst({ where: { lojaId: ids['Loja B'], insumoId: ids.sal } })))!;
    expect(sal).toMatchObject({ quantidadeMilesimos: 3000, valorCentavos: 0, valorIncompleto: true });
    expect((await ultimo(ids['Loja B'], ids.sal))!.valorMetodo).toBe('SEM_CUSTO');
    expect((await a.contagemRetratoItem.findFirst({ where: { contagemId: abB.id, insumoId: ids.sal } }))!.valorCentavos).toBeNull();
  });

  it('A compra 10 kg por R$ 200: A vai a 20 kg / R$ 300 (R$ 15/kg); B continua 10 kg / R$ 100', async () => {
    await compra(ids['Loja A'], ids.frango, { numero: 'A-1', data: '2026-09-15', kg: 10, centavos: 20_000, lancadaEm: BRT('2026-09-15', '10:00') });
    expect(await saldoDe(ids['Loja A'])).toMatchObject({ quantidadeMilesimos: 20_000, valorCentavos: 30_000, valorIncompleto: false });
    expect(await saldoDe(ids['Loja B'])).toMatchObject({ quantidadeMilesimos: 10_000, valorCentavos: 10_000 });
    // A referência de REPOSIÇÃO da rede (para precificar fichas) continua sendo a última compra: R$ 20/kg.
    const pu = (await a.transacao((tx) => custosDeReferencia(tx, [ids.frango]))).get(ids.frango)!.porUnidade!;
    expect(Number(pu.num) / Number(pu.den)).toBe(2000);
  });

  it('A sai 4 kg = R$ 60 (média da loja A); B sai 2 kg = R$ 20 (média da loja B); a referência da rede não entra', async () => {
    const r = await saida(ids['Loja A'], 4, BRT('2026-09-20', '12:00'), 'saida-a');
    expect(r[0]).toMatchObject({ valorCentavos: -6000, valorMetodo: 'MEDIA_LOJA' });
    await saida(ids['Loja B'], 2, BRT('2026-09-20', '12:00'), 'saida-b');
    expect(await ultimo(ids['Loja B'])).toMatchObject({ valorCentavos: -2000, valorMetodo: 'MEDIA_LOJA' });
    expect(await saldoDe(ids['Loja A'])).toMatchObject({ quantidadeMilesimos: 16_000, valorCentavos: 24_000 });
    expect(await saldoDe(ids['Loja B'])).toMatchObject({ quantidadeMilesimos: 8_000, valorCentavos: 8_000 });
  });

  it('duas saídas ao mesmo tempo na mesma loja: uma espera a outra; nada de valor perdido ou duplicado', async () => {
    // A: 16 kg / R$ 240 (R$ 15/kg). Duas saídas de 1 kg em paralelo → R$ 15 cada, saldo 14 kg / R$ 210.
    await Promise.all([saida(ids['Loja A'], 1, BRT('2026-09-21', '09:00'), 'par-1'), saida(ids['Loja A'], 1, BRT('2026-09-21', '09:00'), 'par-2')]);
    const movs = await a.movimentoEstoque.findMany({ where: { chaveIdempotencia: { in: ['par-1', 'par-2'] } } });
    expect(movs.map((m) => m.valorCentavos).sort()).toEqual([-1500, -1500]);
    expect(await saldoDe(ids['Loja A'])).toMatchObject({ quantidadeMilesimos: 14_000, valorCentavos: 21_000 });
    // o livro bate: soma dos movimentos = valor do saldo
    const soma = await a.movimentoEstoque.aggregate({ where: { lojaId: ids['Loja A'], insumoId: ids.frango }, _sum: { valorCentavos: true, quantidadeMilesimos: true } });
    expect(soma._sum).toEqual({ valorCentavos: 21_000, quantidadeMilesimos: 14_000 });
  });

  it('fechamento de setembro: B fotografa o livro dela (8 kg / R$ 80) e o CMV real dela é R$ 20 — não mais −R$ 100', async () => {
    const fechoB = await fecharSetembro(ids['Loja B'], new Date('2026-09-30T20:00:00Z'));
    ids.fechoB = fechoB.id;
    expect(await retratoDo(fechoB.id)).toMatchObject({ quantidadeMilesimos: 8_000, valorCentavos: 8_000 });
    // o sal sem custo aparece sem valor e o fechamento conta 1 item sem preço
    expect((await a.contagemRetratoItem.findFirst({ where: { contagemId: fechoB.id, insumoId: ids.sal } }))!.valorCentavos).toBeNull();
    expect(fechoB.itensSemPreco).toBe(1);
    const fechoA = await fecharSetembro(ids['Loja A'], new Date('2026-09-30T20:00:00Z'));
    expect(await retratoDo(fechoA.id)).toMatchObject({ quantidadeMilesimos: 14_000, valorCentavos: 21_000 });
    const cmv = await a.transacao(async (tx) => {
      const periodo = await periodoDe(tx, '2026-09-01');
      const anterior = await periodoDe(tx, '2026-08-31');
      return cmvDasLojas(tx, [{ id: ids['Loja A'], nome: 'Loja A' }, { id: ids['Loja B'], nome: 'Loja B' }], periodo, periodo.fim, '2026-10-05', anterior);
    });
    const b = cmv.lojas.find((l) => l.lojaId === ids['Loja B'])!;
    const la = cmv.lojas.find((l) => l.lojaId === ids['Loja A'])!;
    expect(b.real).toMatchObject({ inicialCentavos: 10_000, comprasReaisCentavos: 0, finalCentavos: 8_000, centavos: 2_000 });
    // A: R$ 100 + R$ 200 − R$ 210 = R$ 90 (as saídas de 4 kg + 1 + 1 a R$ 15/kg)
    expect(la.real).toMatchObject({ inicialCentavos: 10_000, comprasReaisCentavos: 20_000, finalCentavos: 21_000, centavos: 9_000 });
  });

  it('período fechado não muda: uma compra cara de outubro em A não mexe no retrato de setembro de nenhuma loja', async () => {
    await compra(ids['Loja A'], ids.frango, { numero: 'A-2', data: '2026-10-02', kg: 6, centavos: 18_000, lancadaEm: BRT('2026-10-02', '10:00') });
    expect(await retratoDo(ids.fechoB)).toMatchObject({ valorCentavos: 8_000 });
    expect(await saldoDe(ids['Loja B'])).toMatchObject({ quantidadeMilesimos: 8_000, valorCentavos: 8_000 });
    expect(await saldoDe(ids['Loja A'])).toMatchObject({ quantidadeMilesimos: 20_000, valorCentavos: 39_000 });
  });

  it('estorno de entrada depois de saídas leva o valor original (R$ 180), não a média de hoje', async () => {
    const entrada = (await a.movimentoEstoque.findFirst({ where: { lojaId: ids['Loja A'], tipo: 'ENTRADA_COMPRA', valorCentavos: 18_000 } }))!;
    await saida(ids['Loja A'], 2, BRT('2026-10-03', '09:00'), 'out-1');
    const [est] = await a.transacao((tx) => gravarMovimentos(tx, [estornoDe({ ...entrada, unidadeSnapshot: 'KG' }, 'estorno da nota A-2')], { ocorridoEm: BRT('2026-10-03', '10:00') }));
    expect(est).toMatchObject({ valorCentavos: -18_000, valorMetodo: 'ESTORNO' });
  });

  it('loja sem o marco de corte continua no método antigo (nada muda sozinho)', async () => {
    const outra = await cadastrarLoja(a, { nome: 'Loja C' }, 'Marina');
    if (!outra.ok) throw new Error('loja C');
    const r = await a.transacao((tx) =>
      gravarMovimentos(tx, [{ lojaId: outra.id, insumoId: ids.frango, tipo: 'AJUSTE', quantidadeMilesimos: 1000, valorCentavos: 2000, insumoNome: 'Frango', unidade: 'KG', motivo: 'teste', chave: 'c-1' }]),
    );
    expect(r[0]).toMatchObject({ valorCentavos: 2000, valorMetodo: null });
  });

  it('ligar na loja C: grava o marco e a diferença de base, registra o histórico e é idempotente', async () => {
    const c = (await a.loja.findFirst({ where: { nome: 'Loja C' } }))!;
    const [antes] = await a.transacao((tx) => impactoDoCustoMedio(tx, [c.id]));
    expect(antes.ligadoDesde).toBeNull();
    expect(antes.linhas).toHaveLength(1);
    const linha = antes.linhas[0];
    expect(linha.livroCentavos).toBe(2000);
    expect(linha.diferencaCentavos).toBe(2000 - (linha.referenciaCentavos ?? 0));
    const agora = new Date('2026-10-15T15:00:00Z');
    const r = await ligarCustoMedio(a, c.id, 'FlowFoods', agora);
    expect(r).toEqual({ ok: true, jaFeito: false, ponteCentavos: antes.livroCentavos - antes.referenciaCentavos });
    const deNovo = await ligarCustoMedio(a, c.id, 'FlowFoods', new Date('2026-10-20T15:00:00Z'));
    expect(deNovo).toEqual({ ok: true, jaFeito: true, ponteCentavos: (r as { ponteCentavos: number }).ponteCentavos });
    const loja = (await a.loja.findUnique({ where: { id: c.id } }))!;
    expect(loja.custoMedioDesde).toEqual(agora);
    expect(await a.historicoAlteracao.count({ where: { entidade: 'Loja', entidadeId: c.id } })).toBeGreaterThanOrEqual(1);
    // o livro não foi reescrito: o saldo de C segue com o mesmo valor
    expect((await a.saldoEstoque.findFirst({ where: { lojaId: c.id, insumoId: ids.frango } }))!.valorCentavos).toBe(2000);
    expect((await ligarCustoMedio(a, 'nao-existe', 'FlowFoods')).ok).toBe(false);
    expect((await ligarCustoMedio(a, "x'; drop", 'FlowFoods')).ok).toBe(false);
  });

  it('o DRE do período que atravessa a troca avisa a loja e a diferença; o de antes e o de depois, não', async () => {
    const c = (await a.loja.findFirst({ where: { nome: 'Loja C' } }))!;
    const todas = [ids['Loja A'], ids['Loja B'], c.id];
    const outubro = await a.transacao((tx) => trocasDeCustoNoPeriodo(tx, todas, { inicio: '2026-10-01', fim: '2026-10-31', nome: 'outubro' }));
    expect(outubro).toEqual([{ nome: 'Loja C', desde: '2026-10-15', ponteCentavos: c.custoMedioPonteCentavos }]);
    expect(await a.transacao((tx) => trocasDeCustoNoPeriodo(tx, todas, { inicio: '2026-09-01', fim: '2026-09-30', nome: 'setembro' }))).toEqual([]);
    expect(await a.transacao((tx) => trocasDeCustoNoPeriodo(tx, todas, { inicio: '2026-11-01', fim: '2026-11-30', nome: 'novembro' }))).toEqual([]);
    // A e B ligaram em agosto (1º/08 00:00 UTC = 31/07 21:00 em Brasília): caem em julho, não em agosto
    expect(await a.transacao((tx) => trocasDeCustoNoPeriodo(tx, todas, { inicio: '2026-07-01', fim: '2026-07-31', nome: 'julho' }))).toHaveLength(2);
  });
});
