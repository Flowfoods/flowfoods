/**
 * ERP L.3 · comparação de fornecedores e de períodos no Postgres de verdade (`compras-comparacao.ts` + planilha).
 *
 * Os números esperados saem de conta feita à mão (NÃO do código testado). Dois cenários, em meses diferentes para não se misturarem.
 *
 * AGOSTO · fornecedores da Muçarela (kg), embalagens diferentes:
 *   ZE1  Zé  · Penha · 05/08 · nº 1 · 10 kg a granel R$ 100,00 + frete R$ 20,00          -> item R$ 10,00/kg, entregue R$ 12,00/kg
 *   LA1  Lat · Penha · 07/08 · nº 2 · 5 x Peça 2 kg = 10 kg R$ 105,00, sem frete          -> item R$ 10,50/kg, entregue R$ 10,50/kg
 *   ZE2  Zé  · Penha · 20/08 · nº 3 · 2 kg R$ 30,00 que viram valor 0 no banco (bonificação): sem base, fora do preço
 *   CAN  Lat · Penha · 21/08 · nº 4 · 1 peça R$ 500,00 CANCELADA: fora de tudo
 *
 * SETEMBRO (A) x OUTUBRO (B) · períodos:
 *   Queijo prato (kg)  A: Zé 10 kg R$ 100,00                      B: Zé 15 kg R$ 142,50 + frete R$ 15,00
 *   Presunto (kg)      A: Lat 6 kg R$ 60,00 + Zé 4 kg R$ 48,00     B: Lat 8 kg R$ 84,00 + Zé 2 kg R$ 26,00
 *   Ovo (un)           A: Lat 100 un R$ 50,00                      B: Zé 100 un R$ 60,00 (troca de fornecedor)
 *   Farinha (kg)       A: Zé 20 kg R$ 60,00 (só em A: saiu)
 *   Bacon (kg)         B: Zé 5 kg R$ 100,00 (só em B: entrou)
 *   Cebola (kg)        A: Zé 5 kg R$ 15,00 SEM unidade (sem base)  B: Zé 5 kg R$ 20,00 (só em B pela base)
 *   Alho (kg)          B: Centro 2 kg R$ 20,00 (outra loja)
 *   Cancelada em A: Lat 3 kg de queijo R$ 99,00.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-compras-comparacao.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarFornecedor, cancelarNota, lancarNota } from '@/lib/erp/compras';
import { resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import { comparacaoDeFornecedores, comparacaoDePeriodos } from '@/lib/erp/compras-comparacao';
import { lerFiltrosDeFornecedores, lerFiltrosDePeriodos } from '@/lib/erp/compras-comparacao-campos';
import { relatorioDaTela } from '@/lib/erp/compras-relatorio';
import { lerFiltrosDoRelatorio } from '@/lib/erp/compras-relatorio-campos';
import { planilhaDaComparacaoDeFornecedores, planilhaDaComparacaoDePeriodos, responderPlanilhaDaComparacao } from '@/lib/erp/compras-comparacao-planilha';
import { cadastrarInsumoDeTeste as cadastrarInsumo, cru, limparParceiros, perfilDoBanco, SEM_NOTA_FISCAL, type PerfilDoBanco } from './erp-db-apoio';
import { montarCenario } from './erp-documento-fiscal-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const HOJE = '2026-10-22';
const sp = (t: string) => t.replace(/ /g, ' ');

describe.skipIf(!URL_TESTE)('ERP L.3 · comparação de fornecedores e períodos (Postgres real)', { timeout: 240_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `c${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string };
  let B: { id: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const ids: Record<string, string> = {};
  const notas: Record<string, string> = {};

  const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR', lojaIds: string[] | 'rede'): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const DONA = () => alcanceDe('DONO', 'rede');
  const periodos = (params: Record<string, string | string[]> = {}) =>
    lerFiltrosDePeriodos({ de: '2026-09-01', ate: '2026-09-30', de2: '2026-10-01', ate2: '2026-10-31', ...params }, HOJE);
  const fornecedores = (params: Record<string, string | string[]> = {}) => lerFiltrosDeFornecedores({ de: '2026-08-01', ate: '2026-08-31', insumo: ids.mucarela, ...params }, HOJE);

  async function lanca(chave: string, lojaId: string, fornecedorId: string, numero: string, data: string, total: string, itens: [string, string, string, string][], frete = '') {
    const r = await lancarNota(a, DONA(), { lojaId, fornecedorId, numero, serie: '', data, frete, total, itens: itens.map(([insumoId, embalagem, quantidade, valor]) => ({ insumoId, embalagem, quantidade, valor })) }, 'Marina');
    if (!r.ok) throw new Error(`${chave}: ${JSON.stringify(r)}`);
    notas[chave] = r.id;
  }
  const sql = (texto: string, ...v: unknown[]) => cru(db, perfil, A.id, texto, ...v);

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    const c = await montarCenario(db, 'cmp', sufixo);
    A = c.A;
    B = c.B;
    a = c.a;
    b = c.b;
    Object.assign(ids, c.ids);
    for (const [chave, nome, unidade] of [['queijo', 'Queijo prato', 'KG'], ['presunto', 'Presunto', 'KG'], ['ovo', 'Ovo', 'UN'], ['farinha', 'Farinha', 'KG'], ['cebola', 'Cebola', 'KG'], ['alho', 'Alho', 'KG']] as const) {
      const r = await cadastrarInsumo(a, { nome, tipo: 'INGREDIENTE', unidade, escala: 'base', conteudo: '1', preco: '10,00' });
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
    }
    const lat = await cadastrarFornecedor(a, { nome: 'Laticínios Rio', razaoSocial: 'Laticínios Rio Ltda', documento: '11.222.333/0001-81', email: 'v@lat.com.br', whatsapp: '(21) 99999-0000' }, 'Marina');
    const ze = await cadastrarFornecedor(a, { nome: 'Frios do Zé', ...SEM_NOTA_FISCAL }, 'Marina');
    if (!lat.ok || !ze.ok) throw new Error('fornecedores');
    ids.lat = lat.id;
    ids.ze = ze.id;
    const { vp, centro, lat: L, ze: Z, mucarela, queijo, presunto, ovo, farinha, bacon, cebola, alho } = ids;
    const peca = `v:${ids.peca}`;
    // Agosto
    await lanca('ZE1', vp, Z, '1', '2026-08-05', '120,00', [[mucarela, 'padrao', '10', '100,00']], '20,00');
    await lanca('LA1', vp, L, '2', '2026-08-07', '105,00', [[mucarela, peca, '5', '105,00']]);
    await lanca('ZE2', vp, Z, '3', '2026-08-20', '30,00', [[mucarela, 'padrao', '2', '30,00']]);
    await lanca('CAN', vp, L, '4', '2026-08-21', '500,00', [[mucarela, peca, '1', '500,00']]);
    const cancelou = await cancelarNota(a, DONA(), notas.CAN, 'Preço errado', 'Marina');
    if (!cancelou.ok) throw new Error(JSON.stringify(cancelou));
    await sql(`UPDATE "NotaEntradaItem" SET "valorTotalCentavos" = 0 WHERE "notaId" = $1`, notas.ZE2);
    // Setembro (A)
    await lanca('S1', vp, Z, '11', '2026-09-05', '100,00', [[queijo, 'granel', '10', '100,00']]);
    await lanca('S2', vp, L, '12', '2026-09-08', '60,00', [[presunto, 'granel', '6', '60,00']]);
    await lanca('S3', vp, Z, '13', '2026-09-09', '48,00', [[presunto, 'granel', '4', '48,00']]);
    await lanca('S4', vp, L, '14', '2026-09-10', '50,00', [[ovo, 'granel', '100', '50,00']]);
    await lanca('S5', vp, Z, '15', '2026-09-11', '75,00', [[farinha, 'granel', '20', '60,00'], [cebola, 'granel', '5', '15,00']]);
    await lanca('S7', vp, L, '16', '2026-09-15', '99,00', [[queijo, 'granel', '3', '99,00']]);
    const c7 = await cancelarNota(a, DONA(), notas.S7, 'Lançada errada', 'Marina');
    if (!c7.ok) throw new Error(JSON.stringify(c7));
    await sql(`UPDATE "NotaEntradaItem" SET "unidadeSnapshot" = NULL WHERE "notaId" = $1 AND "insumoId" = $2`, notas.S5, cebola);
    // Outubro (B)
    await lanca('O1', vp, Z, '21', '2026-10-05', '157,50', [[queijo, 'granel', '15', '142,50']], '15,00');
    await lanca('O2', vp, L, '22', '2026-10-06', '84,00', [[presunto, 'granel', '8', '84,00']]);
    await lanca('O3', vp, Z, '23', '2026-10-07', '26,00', [[presunto, 'granel', '2', '26,00']]);
    await lanca('O4', vp, Z, '24', '2026-10-08', '60,00', [[ovo, 'granel', '100', '60,00']]);
    await lanca('O5', vp, Z, '25', '2026-10-09', '120,00', [[bacon, 'granel', '5', '100,00'], [cebola, 'granel', '5', '20,00']]);
    await lanca('O6', centro, Z, '26', '2026-10-10', '20,00', [[alho, 'granel', '2', '20,00']]);
    // O parceiro B com compras próprias (nada dele pode aparecer em A).
    const lb = await b.loja.findFirst();
    const forB = await cadastrarFornecedor(b, { nome: 'Fornecedor B', ...SEM_NOTA_FISCAL }, 'Bia');
    const insB = await cadastrarInsumo(b, { nome: 'Queijo prato', tipo: 'INGREDIENTE', unidade: 'KG', escala: 'base', conteudo: '1', preco: '10,00' });
    if (!lb || !forB.ok || !insB.ok) throw new Error('B');
    for (const [n, d] of [['1', '2026-09-03'], ['2', '2026-10-03']] as const) {
      const rb = await lancarNota(b, alcanceDe('DONO', 'rede'), { lojaId: lb.id, fornecedorId: forB.id, numero: n, serie: '', data: d, frete: '', total: '999,00', itens: [{ insumoId: insB.id, embalagem: 'padrao', quantidade: '3', valor: '999,00' }] }, 'Bia');
      if (!rb.ok) throw new Error('nota B');
    }
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
  });

  const item = (r: Awaited<ReturnType<typeof comparacaoDePeriodos>>, nome: string) => r.comparacao!.itens.find((i) => i.insumo === nome)!;

  // ------------------------------------------------------------ fornecedores

  describe('fornecedores de um insumo', () => {
    it('o frete inverte a ordem: o Zé é o mais barato no item, o Laticínios no custo entregue; embalagens diferentes na mesma unidade', async () => {
      const r = await comparacaoDeFornecedores(a, DONA(), fornecedores());
      expect(r.motivoVazio).toBeNull();
      expect(r.insumo).toMatchObject({ nome: 'Muçarela', unidade: 'KG' });
      expect(r.tabelas).toHaveLength(1);
      const [lat, ze] = r.tabelas[0].fornecedores;
      // Ordem: custo entregue crescente.
      expect([lat.fornecedor, ze.fornecedor]).toEqual(['Laticínios Rio', 'Frios do Zé']);
      // Laticínios: 5 x Peça 2 kg = 10 kg, R$ 105,00, sem frete. Zé: 10 kg a granel, R$ 100,00 + frete R$ 20,00 (a bonificação de 2 kg fica de fora).
      expect(lat.comparavel).toEqual({ linhas: 1, quantidadeMilesimos: 10000, valorCentavos: 10500, freteCentavos: 0 });
      expect(ze.comparavel).toEqual({ linhas: 1, quantidadeMilesimos: 10000, valorCentavos: 10000, freteCentavos: 2000 });
      expect([lat.precoDoItem, lat.custoEntregue]).toEqual([{ centavos: 21, milesimos: 20 }, { centavos: 21, milesimos: 20 }]); // 10,50/kg (1.050 centavos ÷ 1.000 milésimos)
      expect([ze.precoDoItem, ze.custoEntregue]).toEqual([{ centavos: 1, milesimos: 1 }, { centavos: 6, milesimos: 5 }]); // 10,00/kg e 12,00/kg
      expect([ze.maisBaratoNoItem, ze.maisBaratoEntregue, lat.maisBaratoNoItem, lat.maisBaratoEntregue]).toEqual([true, false, false, true]);
      expect(lat.difItem!.decimos).toBe(50); // 0,50 ÷ 10,00 = +5,0%
      expect(ze.difEntregue!.decimos).toBe(143); // 1,50 ÷ 10,50 = +14,3%
      expect(ze.fretePesaDecimos).toBe(200);
      expect(lat.embalagens.join('|')).toMatch(/Peça/);
      expect(ze.embalagens).toHaveLength(1);
      // A linha sem base é contada e fica fora do preço; a nota cancelada não existe para o relatório.
      expect(ze.linhasSemBase).toBe(1);
      expect(ze.notas).toBe(2);
      expect(lat.linhasSemBase).toBe(0);
      expect(lat.notas).toBe(1);
      // A última compra ignora a linha sem base: a do Zé é a de 05/08, e não a de 20/08.
      expect(ze.ultima).toMatchObject({ data: '2026-08-05', rotuloDaNota: '1', quantidadeMilesimos: 10000, valorCentavos: 10000, freteCentavos: 2000 });
      expect(lat.ultima).toMatchObject({ data: '2026-08-07', rotuloDaNota: '2' });
      expect(r.canceladas).toMatchObject({ notas: 1, valorCentavos: 50000 });
      expect(r.totais).toMatchObject({ notas: 3, valorCentavos: 20500, freteCentavos: 2000 }); // 100,00 + 105,00 + 0 (a bonificação)
      expect(r.totais!.semBase).toEqual({ valor: 1 });
    });

    it('sem insumo escolhido não há o que comparar; insumo sem compra no período volta vazio e sem tabela', async () => {
      const sem = await comparacaoDeFornecedores(a, DONA(), fornecedores({ insumo: '' }));
      expect(sem.insumo).toBeNull();
      expect(sem.tabelas).toEqual([]);
      const vazio = await comparacaoDeFornecedores(a, DONA(), fornecedores({ de: '2026-01-01', ate: '2026-01-31' }));
      expect(vazio.insumo?.nome).toBe('Muçarela');
      expect(vazio.tabelas).toEqual([]);
    });

    it('a data usada vale para a comparação: pelo lançamento no relógio do Rio', async () => {
      // O Zé lançou a nota nº 1 às 23:30 do Rio de 31/07 (02:30 UTC de 01/08): pela entrada ela é de agosto, pelo lançamento é de julho.
      await sql(`UPDATE "NotaEntrada" SET "lancadaEm" = '2026-08-01 02:30:00' WHERE id = $1`, notas.ZE1);
      await sql(`UPDATE "NotaEntrada" SET "lancadaEm" = "entradaEm"::timestamp + interval '15 hours' WHERE id <> $1 AND "parceiroId" = $2`, notas.ZE1, A.id);
      const pelaEntrada = await comparacaoDeFornecedores(a, DONA(), fornecedores());
      expect(pelaEntrada.tabelas[0].fornecedores.map((f) => f.fornecedor).sort()).toEqual(['Frios do Zé', 'Laticínios Rio']);
      const julho = await comparacaoDeFornecedores(a, DONA(), fornecedores({ base: 'lancamento', de: '2026-07-01', ate: '2026-07-31' }));
      expect(julho.tabelas[0].fornecedores.map((f) => f.fornecedor)).toEqual(['Frios do Zé']);
      const agosto = await comparacaoDeFornecedores(a, DONA(), fornecedores({ base: 'lancamento' }));
      expect(agosto.tabelas[0].fornecedores.map((f) => f.fornecedor).sort()).toEqual(['Frios do Zé', 'Laticínios Rio']);
      // Sem emissão (notas digitadas): a base "emissão" não acha nenhuma e diz quantas ficaram de fora.
      const emissao = await comparacaoDeFornecedores(a, DONA(), fornecedores({ base: 'emissao' }));
      expect(emissao.tabelas).toEqual([]);
      expect(emissao.semEmissao).toBe(3);
    });

    it('a planilha é a tela: mesmos fornecedores, mesmos preços, mesmas diferenças', async () => {
      const r = await planilhaDaComparacaoDeFornecedores(a, DONA(), fornecedores(), { agora: new Date('2026-10-22T15:00:00Z') });
      expect(r.ok).toBe(true);
      const csv = (r as { corpo: string }).corpo;
      expect(csv.startsWith('﻿')).toBe(true);
      const linhas = csv.split('\r\n');
      const lat = linhas.find((l) => l.startsWith('Laticínios Rio;'))!.split(';');
      const ze = linhas.find((l) => l.startsWith('Frios do Zé;'))!.split(';');
      // Fornecedor;Unidade;Compras;Quantidade;Embalagens;Preço do item;Custo entregue;Frete;Frete %;Mais barato item;dif item R$;dif item %;Mais barato entregue;dif ent R$;dif ent %;...
      expect(lat.slice(1, 4)).toEqual(['kg', '1', '10']);
      expect(lat[5]).toBe('10,5000');
      expect(lat[6]).toBe('10,5000');
      expect(lat[9]).toBe('');
      expect(lat[10]).toBe('0,5000');
      expect(lat[11]).toBe('5,0');
      expect(lat[12]).toBe('Sim');
      expect(ze[5]).toBe('10,0000');
      expect(ze[6]).toBe('12,0000');
      expect(ze[7]).toBe('20,00');
      expect(ze[8]).toBe('20,0');
      expect(ze[9]).toBe('Sim');
      expect(ze[13]).toBe('1,5000');
      expect(ze[14]).toBe('14,3');
      expect(ze[15]).toBe('05/08/2026');
      expect(ze[17]).toBe('1');
      expect(csv).toContain('Marca de referência do insumo');
      expect(csv).toContain('Comparação de fornecedores');
      expect(csv).toContain('Canceladas no mesmo recorte (FORA dos totais);1 nota(s), R$ 500,00');
    });
  });

  // ----------------------------------------------------------------- períodos

  describe('períodos A x B', () => {
    it('pelo custo entregue: volume, preço, troca de fornecedor, entrou e saiu fecham a variação', async () => {
      const r = await comparacaoDePeriodos(a, DONA(), periodos());
      expect(r.motivoVazio).toBeNull();
      const s = r.comparacao!.resumo;
      // A: Queijo 100,00 + Presunto 108,00 + Ovo 50,00 + Farinha 60,00 = 318,00.   (Cebola sem unidade e a nota cancelada ficam fora.)
      // B: Queijo 142,50 + 15,00 de frete = 157,50 + Presunto 110,00 + Ovo 60,00 + Bacon 100,00 + Cebola 20,00 + Alho 20,00 = 467,50.
      expect(s.gastoACentavos).toBe(31800);
      expect(s.gastoBCentavos).toBe(46750);
      expect(s.variacaoCentavos).toBe(14950);
      // Volume: queijo +51,25 (5 kg x o custo médio dos dois lados, (10,00 + 10,50) ÷ 2); presunto, ovo: 0.
      expect(s.volumeCentavos).toBe(5125);
      // Preço: queijo +6,25 (entregue 10,50 contra 10,00) + presunto +2,00 + ovo +10,00 = +18,25. Mesmo fornecedor: +6,25 + 6,50 + 0; troca: 0 − 4,50 + 10,00.
      expect(s.precoCentavos).toBe(1825);
      expect(s.mesmoFornecedorCentavos).toBe(1275);
      expect(s.trocaCentavos).toBe(550);
      // Entrou: Bacon 100,00 + Cebola 20,00 + Alho 20,00. Saiu: Farinha −60,00.
      expect(s.entrouCentavos).toBe(14000);
      expect(s.saiuCentavos).toBe(-6000);
      expect(s.fecha).toBe(true);
      expect(s.volumeCentavos + s.precoCentavos + s.entrouCentavos + s.saiuCentavos).toBe(s.variacaoCentavos);
      expect(s.variacaoDecimos).toBe(470); // 149,50 ÷ 318,00 = +47,0%
      expect([s.nosDois, s.soEmB, s.soEmA]).toEqual([3, 3, 1]);
      // Do que mais mexeu no gasto ao que menos: Bacon +100,00, Farinha −60,00, Queijo +57,50, Alho e Cebola +20,00 (empate: pelo nome), Ovo +10,00, Presunto +2,00.
      expect(r.comparacao!.itens.map((i) => i.insumo)).toEqual(['Bacon', 'Farinha', 'Queijo prato', 'Alho', 'Cebola', 'Ovo', 'Presunto']);
      const q = item(r, 'Queijo prato');
      expect([q.variacaoCentavos, q.volumeCentavos, q.precoCentavos, q.trocaCentavos]).toEqual([5750, 5125, 625, 0]);
      expect(q.variacaoDoCustoDecimos).toBe(50);
      const p = item(r, 'Presunto');
      expect([p.variacaoCentavos, p.volumeCentavos, p.precoCentavos, p.mesmoFornecedorCentavos, p.trocaCentavos]).toEqual([200, 0, 200, 650, -450]);
      const o = item(r, 'Ovo');
      expect([o.unidade, o.precoCentavos, o.trocaCentavos, o.mesmoFornecedorCentavos]).toEqual(['UN', 1000, 1000, 0]);
      expect(item(r, 'Farinha')).toMatchObject({ situacao: 'so-a', saiuCentavos: -6000 });
      expect(item(r, 'Bacon')).toMatchObject({ situacao: 'so-b', entrouCentavos: 10000 });
    });

    it('pelo preço do item: o frete sai da conta e o sinal do efeito preço do queijo vira', async () => {
      const r = await comparacaoDePeriodos(a, DONA(), periodos({ medida: 'item' }));
      const s = r.comparacao!.resumo;
      expect(s.gastoACentavos).toBe(31800);
      expect(s.gastoBCentavos).toBe(45250); // 142,50 + 110,00 + 60,00 + 100,00 + 20,00 + 20,00
      const q = item(r, 'Queijo prato');
      expect([q.variacaoCentavos, q.volumeCentavos, q.precoCentavos]).toEqual([4250, 4875, -625]); // preço do item CAIU; o entregue subiu
      expect(s.volumeCentavos).toBe(4875);
      expect(s.precoCentavos).toBe(575);
      expect(s.fecha).toBe(true);
    });

    it('o que ficou sem base é contado, valorizado e dito por insumo; a cobertura aparece', async () => {
      const r = await comparacaoDePeriodos(a, DONA(), periodos());
      // A: a cebola sem unidade (1 linha, R$ 15,00). B: nada.
      expect(r.a!.semBase).toMatchObject({ linhas: 1, valorCentavos: 1500, freteCentavos: 0, porMotivo: { unidade: 1 } });
      expect(r.a!.semBase.porInsumo[ids.cebola]).toEqual({ linhas: 1, valorCentavos: 1500, freteCentavos: 0 });
      expect(r.b!.semBase.linhas).toBe(0);
      // Dinheiro de A: comparável 318,00 + sem base 15,00 = 333,00.
      expect([r.a!.dinheiroComparavelCentavos, r.a!.dinheiroTotalCentavos]).toEqual([31800, 33300]);
      expect([r.b!.dinheiroComparavelCentavos, r.b!.dinheiroTotalCentavos]).toEqual([46750, 46750]);
      // A cebola só tem lado B comparável: entrou, mesmo havendo compra dela em A (sem base).
      expect(item(r, 'Cebola')).toMatchObject({ situacao: 'so-b', entrouCentavos: 2000 });
    });

    it('notas e linhas de cada lado; cancelada fora dos dois; documento aguardando não é compra', async () => {
      const r = await comparacaoDePeriodos(a, DONA(), periodos());
      // A: S1, S2, S3, S4, S5 (a S7 foi cancelada). B: O1, O2, O3, O4, O5, O6.
      expect([r.a!.notas, r.a!.linhas, r.b!.notas, r.b!.linhas]).toEqual([5, 6, 6, 7]);
      expect(r.a!.canceladas).toMatchObject({ notas: 1, valorCentavos: 9900 });
      expect(r.b!.canceladas.notas).toBe(0);
      expect(r.aguardando).toBe(0);
      expect(r.a!.celulas.every((c) => c.insumo !== 'Queijo prato' || c.valorCentavos === 10000)).toBe(true);
    });

    it('A sem compra: tudo que B comprou entrou, a variação em % é "sem base" e nada vira preço nem volume', async () => {
      const r = await comparacaoDePeriodos(a, DONA(), periodos({ de: '2026-07-01', ate: '2026-07-31', de2: '2026-08-01', ate2: '2026-08-31', insumo: ids.mucarela }));
      const s = r.comparacao!.resumo;
      // Agosto: Zé 10 kg a R$ 100,00 + frete 20,00 e Lat 10 kg a R$ 105,00 = R$ 225,00 de custo entregue em UM insumo (os 2 kg bonificados não contam).
      expect(s).toMatchObject({ gastoACentavos: 0, gastoBCentavos: 22500, variacaoCentavos: 22500, variacaoDecimos: null, volumeCentavos: 0, precoCentavos: 0, entrouCentavos: 22500, saiuCentavos: 0, fecha: true });
      expect(r.a!.notas).toBe(0);
      expect(r.umInsumo).toBe(true);
      expect(r.insumo?.nome).toBe('Muçarela');
    });

    it('um insumo só: os fornecedores aparecem lado a lado, com o efeito preço de quem está nos dois lados', async () => {
      const r = await comparacaoDePeriodos(a, DONA(), periodos({ insumo: ids.presunto }));
      expect(r.umInsumo).toBe(true);
      const p = r.comparacao!.itens[0];
      const lat = p.fornecedores.find((f) => f.fornecedor === 'Laticínios Rio')!;
      const ze = p.fornecedores.find((f) => f.fornecedor === 'Frios do Zé')!;
      // Lat: 6 kg a R$ 10,00 -> 8 kg a R$ 10,50: (10,50 − 10,00) x 7 = +3,50.  Zé: 4 kg a R$ 12,00 -> 2 kg a R$ 13,00: (13 − 12) x 3 = +3,00.
      expect([lat.efeitoPrecoCentavos, ze.efeitoPrecoCentavos]).toEqual([350, 300]);
      expect(lat.a?.quantidadeMilesimos).toBe(6000);
      expect(ze.b?.gastoCentavos).toBe(2600);
    });

    it('os mesmos critérios nos dois lados: o filtro de fornecedor vale para A e para B', async () => {
      const r = await comparacaoDePeriodos(a, DONA(), periodos({ fornecedor: ids.ze, medida: 'item' }));
      const s = r.comparacao!.resumo;
      // Só o Zé. A: queijo 100,00 + presunto 48,00 + farinha 60,00 = 208,00.  B: queijo 142,50 + presunto 26,00 + ovo 60,00 + bacon 100,00 + cebola 20,00 + alho 20,00 = 368,50.
      expect([s.gastoACentavos, s.gastoBCentavos, s.variacaoCentavos]).toEqual([20800, 36850, 16050]);
      // Presunto do Zé: 4 kg R$ 48,00 -> 2 kg R$ 26,00: preço (13 − 12) x 3 = +3,00; volume −2 x 12,50 = −25,00.
      const p = item(r, 'Presunto');
      expect([p.precoCentavos, p.volumeCentavos, p.trocaCentavos]).toEqual([300, -2500, 0]);
      expect(s.fecha).toBe(true);
      // O ovo do A era do Laticínios: com o filtro do Zé, só existe em B (entrou).
      expect(item(r, 'Ovo')).toMatchObject({ situacao: 'so-b', entrouCentavos: 6000 });
    });

    it('loja: sem marcar vale todas (o alho do Centro entra em B); com a Penha, não entra; gerente da Penha vê só a dela', async () => {
      const todas = await comparacaoDePeriodos(a, DONA(), periodos());
      expect(todas.comparacao!.itens.map((i) => i.insumo)).toContain('Alho');
      const penha = await comparacaoDePeriodos(a, DONA(), periodos({ loja: ids.vp }));
      expect(penha.comparacao!.itens.map((i) => i.insumo)).not.toContain('Alho');
      expect(penha.comparacao!.resumo.gastoBCentavos).toBe(44750);
      const gerente = await comparacaoDePeriodos(a, alcanceDe('GERENTE', [ids.vp]), periodos());
      expect(gerente.comparacao!.resumo).toEqual(penha.comparacao!.resumo);
      expect(gerente.lojasUsadas.map((l) => l.id)).toEqual([ids.vp]);
      // Loja de fora do acesso nunca amplia: o relatório sai vazio.
      const fora = await comparacaoDePeriodos(a, alcanceDe('GERENTE', [ids.vp]), periodos({ loja: ids.centro }));
      expect(fora.motivoVazio).toBe('sem-loja');
      expect(fora.comparacao).toBeNull();
      const centro = await comparacaoDePeriodos(a, alcanceDe('GERENTE', [ids.centro]), periodos());
      expect(centro.comparacao!.itens.map((i) => i.insumo)).toEqual(['Alho']);
    });

    it('operador não tem compras.ver: nada de dinheiro; período torto: vazio com a frase', async () => {
      const op = await comparacaoDePeriodos(a, alcanceDe('OPERADOR', [ids.vp]), periodos());
      expect(op.motivoVazio).toBe('sem-permissao');
      expect(op.comparacao).toBeNull();
      expect(op.a).toBeNull();
      const torto = await comparacaoDePeriodos(a, DONA(), periodos({ de2: '2026-10-31', ate2: '2026-10-01' }));
      expect(torto.motivoVazio).toBe('periodo');
      expect(torto.comparacao).toBeNull();
    });

    it('outro parceiro: A não vê B e B não vê A', async () => {
      const doB = await comparacaoDePeriodos(b, alcanceDe('DONO', 'rede'), periodos());
      expect(doB.comparacao!.itens.map((i) => i.insumo)).toEqual(['Queijo prato']);
      expect(doB.comparacao!.resumo).toMatchObject({ gastoACentavos: 99900, gastoBCentavos: 99900, variacaoCentavos: 0, fecha: true });
      const doA = await comparacaoDePeriodos(a, DONA(), periodos());
      expect(doA.comparacao!.itens.some((i) => i.insumo === 'Queijo prato' && i.a?.gastoCentavos === 99900)).toBe(false);
      expect(doA.opcoes.fornecedores.map((f) => f.nome)).not.toContain('Fornecedor B');
    });

    it('teto de combinações: recusa em frase, sem comparar nada', async () => {
      const r = await comparacaoDePeriodos(a, DONA(), periodos(), { teto: 3 });
      expect(r.passouDoTeto).toBe(true);
      expect(r.comparacao).toBeNull();
      expect(r.itensDaPagina).toEqual([]);
    });

    it('paginação em memória: 3 por página, a pedida além da última cai na última', async () => {
      const r = await comparacaoDePeriodos(a, DONA(), periodos({ por: '10', pagina: '99' }));
      expect([r.totalDeItens, r.pagina, r.paginas]).toEqual([7, 1, 1]);
      expect(r.itensDaPagina).toHaveLength(7);
    });

    it('a data usada vale para os dois lados: pelo lançamento no Rio, a nota das 23:30 de 30/09 é de setembro (A)', async () => {
      // A nota do queijo de outubro (O1) foi lançada às 23:30 do Rio de 30/09 (02:30 UTC de 01/10).
      await sql(`UPDATE "NotaEntrada" SET "lancadaEm" = "entradaEm"::timestamp + interval '15 hours' WHERE "parceiroId" = $1`, A.id);
      await sql(`UPDATE "NotaEntrada" SET "lancadaEm" = '2026-10-01 02:30:00' WHERE id = $1`, notas.O1);
      const r = await comparacaoDePeriodos(a, DONA(), periodos({ base: 'lancamento', insumo: ids.queijo }));
      const q = r.comparacao!.itens[0];
      // A (setembro): os 10 kg do Zé + os 15 kg lançados às 23:30 de 30/09; B (outubro) sem queijo.
      expect(q).toMatchObject({ situacao: 'so-a' });
      expect(q.a).toMatchObject({ quantidadeMilesimos: 25000, gastoCentavos: 10000 + 15750 });
      const pelaEntrada = await comparacaoDePeriodos(a, DONA(), periodos({ insumo: ids.queijo }));
      expect(pelaEntrada.comparacao!.itens[0]).toMatchObject({ situacao: 'ambos' });
    });
  });

  // ------------------------------------------------------------------ planilha

  describe('planilha dos períodos', () => {
    it('é a tela: mesmas linhas, mesmos efeitos e os mesmos totais', async () => {
      const f = periodos();
      const tela = await comparacaoDePeriodos(a, DONA(), f);
      const r = await planilhaDaComparacaoDePeriodos(a, DONA(), f, { agora: new Date('2026-10-22T15:00:00Z') });
      expect(r.ok).toBe(true);
      const csv = (r as { corpo: string }).corpo;
      expect(csv.startsWith('﻿')).toBe(true);
      const linhas = csv.split('\r\n');
      const achar = (rotulo: string) => linhas.find((l) => l.startsWith(`${rotulo};`))!.split(';');
      const s = tela.comparacao!.resumo;
      expect(achar('Gasto no período A (R$)')[1]).toBe('318,00');
      expect(achar('Gasto no período B (R$)')[1]).toBe('467,50');
      expect(achar('Variação B menos A (R$)')[1]).toBe('149,50');
      expect(achar('Variação sobre A (%)')[1]).toBe('47,0');
      expect(achar('Efeito volume (R$)')[1]).toBe('51,25');
      expect(achar('Efeito preço (R$)')[1]).toBe('18,25');
      expect(achar('  do mesmo fornecedor (R$)')[1]).toBe('12,75');
      expect(achar('  troca de fornecedor (R$)')[1]).toBe('5,50');
      expect(achar('Conferência: volume + preço + entrou + saiu = variação')[1]).toBe('fecha');
      expect(csv).toContain('Medida do gasto');
      expect(csv).toContain('Período A (base);');
      // Uma linha por insumo, na mesma ordem da tela, com os mesmos números.
      const dados = linhas.filter((l) => /^(Bacon|Queijo prato|Farinha|Ovo|Alho|Cebola|Presunto);/.test(l)).map((l) => l.split(';'));
      expect(dados.map((d) => d[0])).toEqual(tela.comparacao!.itens.map((i) => i.insumo));
      const queijo = dados.find((d) => d[0] === 'Queijo prato')!;
      // Insumo;Unidade;Situação;Qtd A;Qtd B;Notas A;Notas B;Custo A;Custo B;Var custo %;Gasto A;Gasto B;Variação;Volume;Preço;Mesmo;Troca;Entrou;Saiu
      expect(queijo.slice(1)).toEqual(['kg', 'Nos dois períodos', '10', '15', '1', '1', '10,0000', '10,5000', '5,0', '100,00', '157,50', '57,50', '51,25', '6,25', '6,25', '0,00', '', '']);
      const bacon = dados.find((d) => d[0] === 'Bacon')!;
      expect(bacon.slice(2, 6)).toEqual(['Só no período B (entrou)', '', '5', '']);
      expect(bacon[18]).toBe('');
      expect(bacon[17]).toBe('100,00');
      // A soma da coluna "Variação" é a variação do rodapé.
      const soma = dados.reduce((t, d) => t + Math.round(Number(d[12].replace(',', '.')) * 100), 0);
      expect(soma).toBe(s.variacaoCentavos);
    });

    it('com um insumo só, a planilha traz os fornecedores lado a lado', async () => {
      const r = await planilhaDaComparacaoDePeriodos(a, DONA(), periodos({ insumo: ids.presunto }));
      const csv = (r as { corpo: string }).corpo;
      expect(csv).toContain('Efeito preço do fornecedor (R$)');
      const lat = csv.split('\r\n').find((l) => l.startsWith('Presunto (kg);Laticínios Rio;'))!.split(';');
      expect(lat.slice(2)).toEqual(['6', '8', '10,0000', '10,5000', '60,00', '84,00', '3,50']);
    });

    it('texto que abre como fórmula ganha apóstrofo (nome de fornecedor e de insumo)', async () => {
      const mau = await cadastrarFornecedor(a, { nome: '=HYPERLINK("http://x";"a")', ...SEM_NOTA_FISCAL }, 'Marina');
      const ins = await cadastrarInsumo(a, { nome: '+cmd|calc', tipo: 'INGREDIENTE', unidade: 'KG', escala: 'base', conteudo: '1', preco: '10,00' });
      if (!mau.ok || !ins.ok) throw new Error('mau');
      await lanca('MAU', ids.vp, mau.id, '99', '2026-10-12', '10,00', [[ins.id, 'granel', '1', '10,00']]);
      const r = await planilhaDaComparacaoDePeriodos(a, DONA(), periodos({ insumo: ins.id }));
      const csv = (r as { corpo: string }).corpo;
      for (const l of csv.split('\r\n')) for (const celula of l.split(';')) expect(/^[=+\-@\t\r]/.test(celula), `${l}`).toBe(false);
      expect(csv).toContain("'+cmd|calc");
      expect(csv).toContain(`"'=HYPERLINK(""http://x"";""a"")"`);
      await sql(`DELETE FROM "NotaEntradaItem" WHERE "notaId" = $1`, notas.MAU);
    });

    it('a rota: 401 sem sessão, 403 operador, 400 período torto, 413 acima do teto, 200 com cabeçalhos de arquivo', async () => {
      const url = (q: string) => new Request(`http://x/erp/compras/relatorios/comparar/exportar?${q}`);
      const base = 'tela=periodos&de=2026-09-01&ate=2026-09-30&de2=2026-10-01&ate2=2026-10-31';
      expect((await responderPlanilhaDaComparacao(null, null, url(base))).status).toBe(401);
      const op = await responderPlanilhaDaComparacao(a, alcanceDe('OPERADOR', [ids.vp]), url(base));
      expect(op.status).toBe(403);
      expect(await op.text()).not.toMatch(/R\$ \d|\d,\d\d/);
      const torto = await responderPlanilhaDaComparacao(a, DONA(), url('tela=periodos&de=2026-09-30&ate=2026-09-01'));
      expect(torto.status).toBe(400);
      expect(await torto.text()).toMatch(/período A/);
      const ok = await responderPlanilhaDaComparacao(a, DONA(), url(base));
      expect(ok.status).toBe(200);
      expect(ok.headers.get('content-type')).toBe('text/csv; charset=utf-8');
      expect(ok.headers.get('content-disposition')).toMatch(/attachment; filename="comparacao-periodos-2026-09-01_a_2026-09-30-contra-2026-10-01_a_2026-10-31.csv"/);
      expect(ok.headers.get('cache-control')).toBe('no-store');
      expect(ok.headers.get('x-content-type-options')).toBe('nosniff');
      const fornecedoresSem = await responderPlanilhaDaComparacao(a, DONA(), url('tela=fornecedores&de=2026-08-01&ate=2026-08-31'));
      expect(fornecedoresSem.status).toBe(400);
      expect(await fornecedoresSem.text()).toMatch(/Escolha o insumo/);
      const forn = await responderPlanilhaDaComparacao(a, DONA(), url(`tela=fornecedores&de=2026-08-01&ate=2026-08-31&insumo=${ids.mucarela}`));
      expect(forn.status).toBe(200);
      // Gerente de outra loja: não vê as compras da Penha na planilha.
      const g = await responderPlanilhaDaComparacao(a, alcanceDe('GERENTE', [ids.centro]), url(`tela=fornecedores&de=2026-08-01&ate=2026-08-31&insumo=${ids.mucarela}`));
      const texto = await g.text();
      expect(texto).not.toContain('Laticínios Rio;');
      expect(texto).not.toContain('Frios do Zé;');
    });
  });

  // --------------------------------------------------- 1ª volta da UX e do Guardião

  describe('um lado sem compra, fornecedor sem cadastro, busca de um insumo só', () => {
    it('B vazio e A vazio: variação e % sem base, "saiu" e "entrou" mantidos, efeitos zerados e ditos', async () => {
      // Dezembro não tem compra: A = setembro (com compra), B = dezembro.
      const b0 = await comparacaoDePeriodos(a, DONA(), periodos({ de2: '2026-12-01', ate2: '2026-12-31', insumo: ids.queijo }));
      expect(b0.comparacao!.resumo).toMatchObject({ semCompraB: true, semCompraA: false, variacaoDecimos: null, saiuCentavos: -10000, volumeCentavos: 0, precoCentavos: 0, nosDois: 0, fecha: true });
      expect(b0.b!.celulas).toHaveLength(0);
      const a0 = await comparacaoDePeriodos(a, DONA(), periodos({ de: '2026-12-01', ate: '2026-12-31', insumo: ids.queijo }));
      expect(a0.comparacao!.resumo).toMatchObject({ semCompraA: true, variacaoDecimos: null, entrouCentavos: 15750 });
      // A planilha diz "sem base" no lugar de "-100,0%" e traz os avisos da tela.
      const csv = ((await planilhaDaComparacaoDePeriodos(a, DONA(), periodos({ de2: '2026-12-01', ate2: '2026-12-31', insumo: ids.queijo }), { agora: new Date('2026-10-22T15:00:00Z') })) as { corpo: string }).corpo;
      const linhas = csv.split('\r\n');
      expect(linhas.find((l) => l.startsWith('Variação B menos A (R$);'))).toMatch(/sem base \(um dos períodos não tem compra comparável\)/);
      expect(linhas.find((l) => l.startsWith('Variação sobre A (%);'))).toBe('Variação sobre A (%);sem base');
      expect(linhas.find((l) => l.startsWith('Efeito volume (R$);'))).toBe('Efeito volume (R$);');
      expect(linhas.find((l) => l.startsWith('Gasto no período B (R$);'))).toBe('Gasto no período B (R$);sem compra comparável');
      expect(csv).toContain('Aviso;');
      expect(linhas.filter((l) => l.startsWith('Aviso;')).some((l) => /No período B .* não houve compra comparável/.test(l))).toBe(true);
    });

    it('o CSV traz os mesmos avisos da tela (cobertura incompleta, tamanhos, em andamento)', async () => {
      const tela = await comparacaoDePeriodos(a, DONA(), periodos());
      const csv = ((await planilhaDaComparacaoDePeriodos(a, DONA(), periodos(), { agora: new Date('2026-10-22T15:00:00Z') })) as { corpo: string }).corpo;
      const avisos = csv.split('\r\n').filter((l) => l.startsWith('Aviso;'));
      expect(avisos.some((l) => /Cobertura incompleta no período A: 1 linha/.test(sp(l)))).toBe(true);
      expect(avisos.some((l) => /O período A tem 30 dias e o B tem 31 dias/.test(l))).toBe(true);
      expect(avisos.some((l) => /O período B termina depois de hoje/.test(l))).toBe(true);
      expect(tela.a!.semBase.linhas).toBe(1);
    });

    it('nota sem fornecedor cadastrado: agrupa pelo nome que a nota guardou, não tudo num "-"', async () => {
      const hort = await cadastrarInsumo(a, { nome: 'Hortelã', tipo: 'INGREDIENTE', unidade: 'KG', escala: 'base', conteudo: '1', preco: '10,00' });
      if (!hort.ok) throw new Error('hortelã');
      await lanca('H1', ids.vp, ids.ze, '9001', '2026-10-12', '20,00', [[hort.id, 'granel', '2', '20,00']]);
      await lanca('H2', ids.vp, ids.ze, '9002', '2026-10-13', '30,00', [[hort.id, 'granel', '3', '30,00']]);
      await sql(`UPDATE "NotaEntrada" SET "fornecedorId" = NULL, "fornecedorNomeSnapshot" = 'Feira do João' WHERE id = $1`, notas.H1);
      await sql(`UPDATE "NotaEntrada" SET "fornecedorId" = NULL, "fornecedorNomeSnapshot" = 'Barraca da Maria' WHERE id = $1`, notas.H2);
      const r = await comparacaoDePeriodos(a, DONA(), periodos({ insumo: hort.id }));
      const forn = r.comparacao!.itens[0].fornecedores.map((x) => x.fornecedor).sort();
      expect(forn).toEqual(['Barraca da Maria (sem cadastro)', 'Feira do João (sem cadastro)']);
      expect(r.comparacao!.itens[0].fornecedores.map((x) => x.fornecedorId).sort()).toEqual(['n:Barraca da Maria', 'n:Feira do João']);
      // (herança L.3 → L.4) Comparar fornecedores faz o mesmo: um fornecedor por nome guardado na nota, dito "sem cadastro".
      const cf = await comparacaoDeFornecedores(a, DONA(), fornecedores({ de: '2026-10-01', ate: '2026-10-31', insumo: hort.id }));
      expect(cf.tabelas).toHaveLength(1);
      expect(cf.tabelas[0].fornecedores.map((x) => x.fornecedor).sort()).toEqual(['Barraca da Maria (sem cadastro)', 'Feira do João (sem cadastro)']);
      expect(cf.tabelas[0].fornecedores.map((x) => x.fornecedorId).sort()).toEqual(['n:Barraca da Maria', 'n:Feira do João']);
      // Cada um abre só as próprias linhas em "Compras do período" (a chave "n:<nome>" vale como grupo).
      const aberto = await relatorioDaTela(a, DONA(), lerFiltrosDoRelatorio({ de: '2026-10-01', ate: '2026-10-31', insumo: hort.id, agrupar: 'fornecedor', grupo: 'n:Feira do João', ver: 'linhas' }, HOJE), 'periodo');
      expect(aberto.linhas!.linhas.map((l) => l.rotuloDaNota)).toHaveLength(1);
      expect(aberto.abertas).toMatchObject({ linhas: 1, valorCentavos: 2000 });
      await sql(`DELETE FROM "NotaEntradaItem" WHERE "notaId" = ANY($1)`, [notas.H1, notas.H2]);
    });

    it('procurou pelo nome e só um insumo com compra tem esse nome: a leitura já sai dele, uma vez só', async () => {
      const p = await comparacaoDePeriodos(a, DONA(), periodos({ q: 'QUEIJO' }));
      expect(p.insumoDaBusca).toBe(ids.queijo);
      expect(p.umInsumo).toBe(true);
      expect(p.comparacao!.itens.map((i) => i.insumo)).toEqual(['Queijo prato']);
      const f = await comparacaoDeFornecedores(a, DONA(), fornecedores({ insumo: '', q: 'mucarela' }));
      expect(f.insumoDaBusca).toBe(ids.mucarela);
      expect(f.insumo?.nome).toBe('Muçarela');
      expect(f.tabelas).toHaveLength(1);
      // Insumo escolhido no formulário: a busca não manda.
      expect((await comparacaoDeFornecedores(a, DONA(), fornecedores())).insumoDaBusca).toBeNull();
      // Mais de um insumo com o nome: continua a escolher na lista.
      const varios = await comparacaoDePeriodos(a, DONA(), periodos({ q: 'e' }));
      expect(varios.insumoDaBusca).toBeNull();
    });

    it('insumo só com linha sem base: sem tabela de preço, nenhum fornecedor comparável', async () => {
      const so = await cadastrarInsumo(a, { nome: 'Cravo', tipo: 'INGREDIENTE', unidade: 'KG', escala: 'base', conteudo: '1', preco: '10,00' });
      if (!so.ok) throw new Error('cravo');
      await lanca('CV', ids.vp, ids.ze, '9101', '2026-08-12', '5,00', [[so.id, 'granel', '1', '5,00']]);
      await sql(`UPDATE "NotaEntradaItem" SET "valorTotalCentavos" = 0 WHERE "notaId" = $1`, notas.CV);
      const r = await comparacaoDeFornecedores(a, DONA(), fornecedores({ insumo: so.id }));
      expect(r.tabelas).toHaveLength(1);
      expect(r.tabelas[0].comBase).toBe(0);
      expect(r.tabelas[0].fornecedores[0]).toMatchObject({ precoDoItem: null, custoEntregue: null, linhasSemBase: 1 });
      await sql(`DELETE FROM "NotaEntradaItem" WHERE "notaId" = $1`, notas.CV);
    });
  });
});
