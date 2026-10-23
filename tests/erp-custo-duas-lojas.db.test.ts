/**
 * Ponto 1 do registro de aprovações (Notion, 22/10/2026): separar o CUSTO DE REPOSIÇÃO (usado para precificar) da
 * VALORIZAÇÃO DO ESTOQUE e do CMV DO PERÍODO — o teste de DUAS LOJAS pedido antes de qualquer mudança.
 *
 * O que este arquivo faz: MEDE o comportamento de HOJE e o deixa escrito. Não escolhe PEPS, custo médio nem outro
 * método (não foi decidido) e por isso não afirma um "valor certo" para a loja B: afirma o que o sistema faz hoje e
 * as invariantes que valem sob QUALQUER método (o histórico gravado não muda; o livro da loja B não muda).
 *
 * Cenário (números de teste, isolados num parceiro criado e apagado aqui):
 *   - um insumo cadastrado a R$ 10,00/kg; as lojas A e B abrem o estoque com 10 kg cada (R$ 100,00 cada);
 *   - só a loja A compra: 5 kg por R$ 100,00 (R$ 20,00/kg) em 15/09;
 *   - a loja B não compra nada, não consome nada e fecha setembro com os mesmos 10 kg.
 *
 * Achado de hoje (a decisão 65 usa a ÚLTIMA COMPRA DA REDE como custo de referência, e o fechamento de estoque
 * valoriza o retrato por esse custo): a loja B fecha com R$ 200,00 de estoque sem ter comprado nada, e o CMV real de
 * setembro dela fica NEGATIVO (R$ 100,00 + R$ 0,00 − R$ 200,00 = −R$ 100,00). É a contaminação entre lojas que o
 * ponto 1 descreve. Quando Rodolfo decidir o método, as expectativas "HOJE" deste arquivo mudam junto com a correção.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-custo-duas-lojas.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { garantirCategoriasPadrao, listarCategorias } from '@/lib/erp/categorias';
import { concluirAbertura, contarItem, custosDeReferencia, gravarMovimentos, iniciarAbertura, obterContagemDeAbertura } from '@/lib/erp/estoque';
import { concluirContagem, iniciarFechamento } from '@/lib/erp/contagem';
import { cmvDasLojas } from '@/lib/erp/cmv';
import { periodoDe } from '@/lib/erp/periodos';
import { resolverAlcance } from '@/lib/erp/permissoes';
import { BRT, dia } from './erp-cmv-apoio';
import { cadastrarInsumoDeTeste as cadastrarInsumo, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const DONA = () => resolverAlcance({ perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });

describe.skipIf(!URL_TESTE)('Ponto 1 · custo de reposição × valorização do estoque entre duas lojas (Postgres real)', { timeout: 240_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `d${globalThis.crypto.randomUUID().slice(0, 8)}`;
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
      const solto = item.insumoId === ids.frango ? kg : '0';
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
    const P = await db.parceiroFlow.create({ data: { nome: 'Duas lojas (ponto 1)', slug: `duas-${sufixo}`, status: 'ATIVO' } });
    criados.push(P.id);
    a = doParceiro(P.id, db);
    await garantirCategoriasPadrao(a);
    const proteina = (await listarCategorias(a)).find((c) => c.chave === 'PROTEINA')!.id;
    for (const nome of ['Loja A', 'Loja B']) {
      const l = await cadastrarLoja(a, { nome }, 'Marina');
      if (!l.ok) throw new Error(JSON.stringify(l));
      ids[nome] = l.id;
      await a.loja.update({ where: { id: l.id }, data: { criadoEm: new Date('2026-01-10T12:00:00Z') } });
    }
    const f = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', nome: 'Frango', unidade: 'KG', conteudo: '1', preco: '10,00', conservacao: 'CONGELADO', categoriaId: proteina });
    if (!f.ok) throw new Error(JSON.stringify(f));
    ids.frango = f.id;
  });

  afterAll(async () => {
    if (db) {
      await limparParceiros(db, perfil, criados);
      await db.$disconnect();
    }
  });

  it('as duas lojas abrem com 10 kg a R$ 10,00/kg (R$ 100,00 cada) — o preço cadastrado, sem compra na rede', async () => {
    const quando = new Date('2026-09-01T13:00:00Z');
    const abA = await abrirLoja(ids['Loja A'], '10', quando);
    const abB = await abrirLoja(ids['Loja B'], '10', quando);
    ids.aberturaB = abB.id;
    expect(abA.valorTotalCentavos).toBe(10_000);
    expect(abB.valorTotalCentavos).toBe(10_000);
    expect((await retratoDo(abB.id))!.valorCentavos).toBe(10_000);
    expect((await saldoDe(ids['Loja B']))!.valorCentavos).toBe(10_000);
  });

  it('só a loja A compra a R$ 20,00/kg: o custo de REPOSIÇÃO da rede passa a R$ 20,00/kg (decisão 65, é para precificar)', async () => {
    await compra(ids['Loja A'], ids.frango, { numero: 'A-1', data: '2026-09-15', kg: 5, centavos: 10_000, lancadaEm: BRT('2026-09-15', '10:00') });
    const ref = await a.transacao((tx) => custosDeReferencia(tx, [ids.frango]));
    // 2000 centavos por kg (a fração pode vir reduzida).
    const pu = ref.get(ids.frango)!.porUnidade!;
    expect(Number(pu.num) / Number(pu.den)).toBe(2000);
  });

  it('invariantes que valem sob QUALQUER método: o retrato já gravado da loja B e o livro da loja B não mudam com a compra da A', async () => {
    expect((await retratoDo(ids.aberturaB))!.valorCentavos).toBe(10_000);
    const saldoB = (await saldoDe(ids['Loja B']))!;
    expect(saldoB.quantidadeMilesimos).toBe(10_000);
    expect(saldoB.valorCentavos).toBe(10_000);
  });

  it('HOJE (decisão pendente): a loja B fecha setembro com o estoque valorizado pelo preço que só a loja A pagou', async () => {
    const fechoB = await fecharSetembro(ids['Loja B'], new Date('2026-09-30T20:00:00Z'));
    ids.fechoB = fechoB.id;
    const linha = (await retratoDo(fechoB.id))!;
    expect(linha.quantidadeMilesimos).toBe(10_000);
    // 10 kg × R$ 20,00 (a última compra da REDE, feita pela loja A). O livro da própria loja B diz R$ 100,00.
    expect(linha.valorCentavos).toBe(20_000);
    expect(fechoB.valorTotalCentavos).toBe(20_000);
    expect((await saldoDe(ids['Loja B']))!.valorCentavos).toBe(10_000);
  });

  it('HOJE (decisão pendente): o CMV real de setembro da loja B fica negativo (R$ 100,00 + R$ 0,00 − R$ 200,00)', async () => {
    const cmv = await a.transacao(async (tx) => {
      const periodo = await periodoDe(tx, '2026-09-01');
      const anterior = await periodoDe(tx, '2026-08-31');
      return cmvDasLojas(tx, [{ id: ids['Loja B'], nome: 'Loja B' }], periodo, periodo.fim, '2026-10-05', anterior);
    });
    const b = cmv.lojas.find((l) => l.lojaId === ids['Loja B'])!;
    expect(b.compraCentavos).toBeNull(); // a loja B não comprou
    expect(b.real).not.toBeNull();
    expect(b.real).toMatchObject({ inicialCentavos: 10_000, comprasReaisCentavos: 0, finalCentavos: 20_000, centavos: -10_000 });
  });
});
