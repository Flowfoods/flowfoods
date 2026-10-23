/**
 * ERP L.3 · comparação de fornecedores e de períodos — a parte PURA (`compras-comparacao-campos.ts`).
 * Os números esperados saem de conta feita à mão (no comentário de cada caso), NÃO do código testado.
 */
import { describe, expect, it } from 'vitest';
import {
  atalhosDeComparacao,
  avisosDaComparacao,
  avisosDeDatas,
  centavosDe,
  compararItem,
  compararPeriodos,
  dividirArredondado,
  diasDoPeriodo,
  efeitoPrecoExato,
  formatarPercentual,
  formatarVariacao,
  lerFiltrosDePeriodos,
  percentualEmDecimos,
  periodoAnterior,
  queryParaCompararComOAnterior,
  percentualParaPlanilha,
  queryDosPeriodos,
  ranquearFornecedores,
  variacaoParaPlanilha,
  type Celula,
  type FornecedorDoInsumo,
} from '@/lib/erp/compras-comparacao-campos';
import { formatarReaisDaFracao } from '@/lib/erp/unidades';
import { fracaoParaPlanilha } from '@/lib/erp/compras-comparacao-planilha';
import { rotuloDaVolta } from '@/lib/erp/volta';
import { lerFiltrosDoRelatorio } from '@/lib/erp/compras-relatorio-campos';

const HOJE = '2026-10-22';
const sp = (t: string) => t.replace(/ /g, ' ');

/** Uma célula: quantidade em KG (ou outra unidade) e dinheiro em reais; os milésimos e os centavos saem daqui. */
function cel(insumoId: string, fornecedorId: string, qtd: number, valor: number, frete = 0, unidade: 'KG' | 'L' | 'UN' = 'KG', notas = 1): Celula {
  return {
    insumoId,
    insumo: insumoId.toUpperCase(),
    unidade,
    fornecedorId,
    fornecedor: `Forn ${fornecedorId}`,
    notas,
    linhas: notas,
    quantidadeMilesimos: Math.round(qtd * 1000),
    valorCentavos: Math.round(valor * 100),
    freteCentavos: Math.round(frete * 100),
  };
}

describe('L.3 · a conta que separa volume de preço', () => {
  it('mais volume e preço menor (sinais opostos): 10 kg a R$ 10,00 -> 15 kg a R$ 9,50', () => {
    // Δ = 142,50 − 100,00 = +42,50.  Preço: (9,50 − 10,00) × (10 + 15)/2 = −0,50 × 12,5 = −6,25.  Volume: (15 − 10) × (10 + 9,50)/2 = 5 × 9,75 = +48,75.
    const i = compararItem([cel('queijo', 'x', 10, 100)], [cel('queijo', 'x', 15, 142.5)], 'item');
    expect(i.situacao).toBe('ambos');
    expect(i.variacaoCentavos).toBe(4250);
    expect(i.precoCentavos).toBe(-625);
    expect(i.volumeCentavos).toBe(4875);
    // Um fornecedor só nos dois lados: todo o efeito preço é "do mesmo fornecedor"; troca zero.
    expect(i.mesmoFornecedorCentavos).toBe(-625);
    expect(i.trocaCentavos).toBe(0);
    // Custo médio: 9,50 contra 10,00 = −5,0%.
    expect(i.variacaoDoCustoDecimos).toBe(-50);
  });

  it('o preço do item cai e o custo entregue sobe (o frete): as duas medidas contam histórias diferentes', () => {
    const a = [cel('queijo', 'x', 10, 100)];
    const b = [cel('queijo', 'x', 15, 142.5, 15)];
    // Pelo item: igual ao caso acima.
    const item = compararItem(a, b, 'item');
    expect([item.volumeCentavos, item.precoCentavos]).toEqual([4875, -625]);
    // Entregue: B custou 142,50 + 15,00 = 157,50 por 15 kg = R$ 10,50/kg contra R$ 10,00/kg.
    // Δ = 157,50 − 100,00 = 57,50.  Preço: (10,50 − 10,00) × 12,5 = +6,25.  Volume: 5 × (10,00 + 10,50)/2 = 51,25.
    const ent = compararItem(a, b, 'entregue');
    expect(ent.variacaoCentavos).toBe(5750);
    expect(ent.precoCentavos).toBe(625);
    expect(ent.volumeCentavos).toBe(5125);
    expect(ent.variacaoDoCustoDecimos).toBe(50);
    expect(ent.b?.gastoCentavos).toBe(15750);
    expect(item.b?.gastoCentavos).toBe(14250);
  });

  it('trocar de fornecedor sem mudar o preço de ninguém: tudo é troca, nada é preço do mesmo fornecedor', () => {
    // 10 kg a R$ 10 de F1 em A; 10 kg a R$ 12 de F2 em B. Δ = +20,00; volume 0; preço +20,00; mesmo fornecedor 0 (ninguém nos dois lados); troca +20,00.
    const i = compararItem([cel('p', 'f1', 10, 100)], [cel('p', 'f2', 10, 120)], 'item');
    expect([i.volumeCentavos, i.precoCentavos, i.mesmoFornecedorCentavos, i.trocaCentavos]).toEqual([0, 2000, 0, 2000]);
    // Os fornecedores vêm do que mais gastou (nos dois lados) ao que menos: F2 (R$ 120) antes de F1 (R$ 100); nenhum está nos dois lados.
    expect(i.fornecedores.map((f) => [f.fornecedorId, f.efeitoPrecoCentavos])).toEqual([['f2', null], ['f1', null]]);
  });

  it('mistura de fornecedores: o preço de um sobe, mas a fatia migra para o mais barato', () => {
    // A: F1 6 kg a R$ 10,00 (60,00) + F2 4 kg a R$ 12,00 (48,00) = 10 kg, R$ 108,00 (R$ 10,80/kg).
    // B: F1 8 kg a R$ 10,50 (84,00) + F2 2 kg a R$ 13,00 (26,00) = 10 kg, R$ 110,00 (R$ 11,00/kg).
    // Δ = +2,00; mesma quantidade: volume 0; preço do item +2,00.
    // Mesmo fornecedor: F1 (10,50 − 10,00) × (6 + 8)/2 = +3,50; F2 (13,00 − 12,00) × (4 + 2)/2 = +3,00; soma +6,50. Troca (o que sobra) = 2,00 − 6,50 = −4,50.
    const i = compararItem([cel('p', 'f1', 6, 60), cel('p', 'f2', 4, 48)], [cel('p', 'f1', 8, 84), cel('p', 'f2', 2, 26)], 'item');
    expect([i.variacaoCentavos, i.volumeCentavos, i.precoCentavos, i.mesmoFornecedorCentavos, i.trocaCentavos]).toEqual([200, 0, 200, 650, -450]);
    expect(i.fornecedores.find((f) => f.fornecedorId === 'f1')?.efeitoPrecoCentavos).toBe(350);
    expect(i.fornecedores.find((f) => f.fornecedorId === 'f2')?.efeitoPrecoCentavos).toBe(300);
    expect(i.b?.notas).toBe(2);
  });

  it('item só num dos lados: não há preço nem volume, só "entrou" ou "saiu"', () => {
    const novo = compararItem([], [cel('bacon', 'f', 5, 100)], 'item');
    expect(novo).toMatchObject({ situacao: 'so-b', variacaoCentavos: 10000, entrouCentavos: 10000, saiuCentavos: 0, volumeCentavos: null, precoCentavos: null, variacaoDoCustoDecimos: null });
    const parou = compararItem([cel('farinha', 'f', 20, 60)], [], 'item');
    expect(parou).toMatchObject({ situacao: 'so-a', variacaoCentavos: -6000, entrouCentavos: 0, saiuCentavos: -6000, volumeCentavos: null, precoCentavos: null });
  });

  it('arredonda uma vez só e fecha: 3 kg a R$ 10,00 -> 7 kg a R$ 25,00', () => {
    // Preço: (25/7 − 10/3) × (3 + 7)/2 = (3,571428… − 3,333333…) × 5 = 1,190476… = 119 centavos. Δ = 15,00 -> volume = 1500 − 119 = 1381.
    const i = compararItem([cel('x', 'f', 3, 10)], [cel('x', 'f', 7, 25)], 'item');
    expect([i.variacaoCentavos, i.precoCentavos, i.volumeCentavos]).toEqual([1500, 119, 1381]);
  });

  it('o efeito exato é uma fração e o arredondamento é para longe do zero', () => {
    const f = efeitoPrecoExato(1000, 3000, 2500, 7000);
    expect(f.num / f.den).toBe(119n); // truncado
    expect(centavosDe({ num: 5n, den: 2n })).toBe(3);
    expect(centavosDe({ num: -5n, den: 2n })).toBe(-3);
    expect(centavosDe({ num: 7n, den: 3n })).toBe(2);
    expect(dividirArredondado(-7n, 3n)).toBe(-2n);
    expect(() => efeitoPrecoExato(100, 0, 100, 1000)).toThrow();
  });

  it('o resumo: volume + preço + entrou + saiu = variação (a conta da cena inteira)', () => {
    // Queijo 10 kg R$ 100 -> 15 kg R$ 142,50 (Δ +42,50: volume +48,75, preço −6,25)
    // Presunto (mistura acima, Δ +2,00: preço +2,00 = mesmo fornecedor +6,50, troca −4,50)
    // Ovo 100 un: F1 R$ 50 -> F2 R$ 60 (Δ +10,00: preço +10,00 = troca +10,00)
    // Bacon só em B R$ 100,00 (entrou)  e  Farinha só em A R$ 60,00 (saiu).
    const A = [cel('queijo', 'x', 10, 100), cel('presunto', 'f1', 6, 60), cel('presunto', 'f2', 4, 48), cel('ovo', 'f1', 100, 50, 0, 'UN'), cel('farinha', 'f', 20, 60)];
    const B = [cel('queijo', 'x', 15, 142.5), cel('presunto', 'f1', 8, 84), cel('presunto', 'f2', 2, 26), cel('ovo', 'f2', 100, 60, 0, 'UN'), cel('bacon', 'f', 5, 100)];
    const { itens, resumo } = compararPeriodos(A, B, 'item');
    expect(itens).toHaveLength(5);
    expect(resumo).toMatchObject({
      gastoACentavos: 31800, // 100 + 108 + 50 + 60
      gastoBCentavos: 41250, // 142,50 + 110 + 60 + 100
      variacaoCentavos: 9450,
      volumeCentavos: 4875,
      precoCentavos: 575, // −6,25 + 2,00 + 10,00
      mesmoFornecedorCentavos: 25, // −6,25 + 6,50 + 0
      trocaCentavos: 550, // 0 − 4,50 + 10,00
      entrouCentavos: 10000,
      saiuCentavos: -6000,
      nosDois: 3,
      soEmB: 1,
      soEmA: 1,
      fecha: true,
    });
    expect(resumo.variacaoDecimos).toBe(297); // 9450 ÷ 31800 = 29,7%
    expect(resumo.volumeCentavos + resumo.precoCentavos + resumo.entrouCentavos + resumo.saiuCentavos).toBe(resumo.variacaoCentavos);
    expect(resumo.mesmoFornecedorCentavos + resumo.trocaCentavos).toBe(resumo.precoCentavos);
    // Do que mais mexeu no gasto ao que menos: Bacon (+100,00), Farinha (−60,00), Queijo (+42,50), Ovo (+10,00), Presunto (+2,00).
    expect(itens.map((i) => i.insumo)).toEqual(['BACON', 'FARINHA', 'QUEIJO', 'OVO', 'PRESUNTO']);
  });

  it('A sem compra: o percentual é "sem base", nunca infinito', () => {
    const { resumo } = compararPeriodos([], [cel('queijo', 'x', 10, 100)], 'item');
    expect(resumo).toMatchObject({ gastoACentavos: 0, gastoBCentavos: 10000, variacaoCentavos: 10000, entrouCentavos: 10000, variacaoDecimos: null, fecha: true });
    expect(formatarPercentual(resumo.variacaoDecimos)).toBe('sem base');
    const vazio = compararPeriodos([], [], 'item');
    expect(vazio.itens).toEqual([]);
    expect(vazio.resumo).toMatchObject({ variacaoCentavos: 0, variacaoDecimos: null, fecha: true });
  });

  it('a mesma insumo em outra unidade não se compara (kg em A, litro em B): um sai, outro entra', () => {
    const { itens, resumo } = compararPeriodos([cel('x', 'f', 10, 100, 0, 'KG')], [cel('x', 'f', 10, 100, 0, 'L')], 'item');
    expect(itens.map((i) => [i.unidade, i.situacao])).toEqual(expect.arrayContaining([['KG', 'so-a'], ['L', 'so-b']]));
    expect(resumo).toMatchObject({ precoCentavos: 0, volumeCentavos: 0, entrouCentavos: 10000, saiuCentavos: -10000, variacaoCentavos: 0, fecha: true });
  });

  it('propriedade: em 300 cenários sorteados a soma dos efeitos fecha ao centavo e o sinal troca ao inverter A e B', () => {
    let semente = 12345;
    const rnd = (n: number) => {
      semente = (semente * 1103515245 + 12345) & 0x7fffffff;
      return semente % n;
    };
    for (let rodada = 0; rodada < 300; rodada++) {
      const A: Celula[] = [];
      const B: Celula[] = [];
      for (let i = 0; i < 1 + rnd(5); i++) {
        for (const f of ['f1', 'f2', 'f3']) {
          const un = (['KG', 'L', 'UN'] as const)[rnd(3)];
          if (rnd(3)) A.push({ ...cel(`i${i}`, f, 1, 1, 0, un), quantidadeMilesimos: 1 + rnd(50_000), valorCentavos: 1 + rnd(200_000), freteCentavos: rnd(5000) });
          if (rnd(3)) B.push({ ...cel(`i${i}`, f, 1, 1, 0, un), quantidadeMilesimos: 1 + rnd(50_000), valorCentavos: 1 + rnd(200_000), freteCentavos: rnd(5000) });
        }
      }
      for (const medida of ['entregue', 'item'] as const) {
        const c = compararPeriodos(A, B, medida);
        expect(c.resumo.fecha).toBe(true);
        for (const i of c.itens) {
          if (i.situacao === 'ambos') {
            expect(i.volumeCentavos! + i.precoCentavos!).toBe(i.variacaoCentavos);
            expect(i.mesmoFornecedorCentavos! + i.trocaCentavos!).toBe(i.precoCentavos);
          }
        }
        // Inverter os lados troca o sinal de tudo.
        const inv = compararPeriodos(B, A, medida);
        expect(inv.resumo.variacaoCentavos).toBe(0 - c.resumo.variacaoCentavos);
        expect(inv.resumo.precoCentavos).toBe(0 - c.resumo.precoCentavos);
        expect(inv.resumo.volumeCentavos).toBe(0 - c.resumo.volumeCentavos);
        expect(inv.resumo.trocaCentavos).toBe(0 - c.resumo.trocaCentavos);
        expect(inv.resumo.entrouCentavos).toBe(0 - c.resumo.saiuCentavos);
      }
    }
  });
});

describe('L.3 · percentuais e frases', () => {
  it('décimos de ponto, metade para longe do zero; denominador zero é sem base', () => {
    expect(percentualEmDecimos(9450, 31800)).toBe(297);
    expect(percentualEmDecimos(-5, 100)).toBe(-50);
    expect(percentualEmDecimos(1, 8)).toBe(125); // 12,5%
    expect(percentualEmDecimos(1, 3)).toBe(333);
    expect(percentualEmDecimos(5, 0)).toBeNull();
    expect(percentualEmDecimos(5, -3)).toBeNull();
    expect(percentualEmDecimos(0, 100)).toBe(0);
  });
  it('mostra o sinal e a palavra, não a cor', () => {
    expect(formatarPercentual(123)).toBe('+12,3%');
    expect(formatarPercentual(-45)).toBe('−4,5%');
    expect(formatarPercentual(0)).toBe('0,0%');
    expect(formatarPercentual(5)).toBe('+0,5%');
    expect(formatarPercentual(null)).toBe('sem base');
    expect(sp(formatarVariacao(4250))).toBe('+R$ 42,50');
    expect(sp(formatarVariacao(-625))).toBe('−R$ 6,25');
    expect(sp(formatarVariacao(0))).toBe('R$ 0,00');
    expect(percentualParaPlanilha(-45)).toBe('-4,5');
    expect(percentualParaPlanilha(1234)).toBe('123,4');
    expect(percentualParaPlanilha(null)).toBe('');
    expect(variacaoParaPlanilha(-625)).toBe('-6,25');
    expect(variacaoParaPlanilha(5)).toBe('0,05');
    expect(variacaoParaPlanilha(4250)).toBe('42,50');
  });
});

describe('L.3 · fornecedores: preço do item x custo entregue', () => {
  const forn = (id: string, valor: number, frete: number, qtd: number, extra: Partial<FornecedorDoInsumo> = {}): FornecedorDoInsumo => ({
    fornecedorId: id,
    fornecedor: `Forn ${id}`,
    unidade: 'KG',
    notas: 1,
    linhas: 1,
    linhasSemBase: 0,
    comparavel: { linhas: 1, quantidadeMilesimos: Math.round(qtd * 1000), valorCentavos: Math.round(valor * 100), freteCentavos: Math.round(frete * 100) },
    embalagens: [],
    ultima: null,
    ...extra,
  });

  it('o frete inverte a ordem: X é o mais barato no item, Y no custo entregue', () => {
    // X: 10 kg, R$ 100,00 + frete R$ 20,00 -> item R$ 10,00/kg, entregue R$ 12,00/kg.
    // Y: 10 kg, R$ 105,00 sem frete -> item R$ 10,50/kg, entregue R$ 10,50/kg.
    const { tabelas } = ranquearFornecedores([forn('x', 100, 20, 10), forn('y', 105, 0, 10)]);
    expect(tabelas).toHaveLength(1);
    const [y, x] = tabelas[0].fornecedores; // ordem: custo entregue crescente
    expect([y.fornecedorId, x.fornecedorId]).toEqual(['y', 'x']);
    expect([x.maisBaratoNoItem, x.maisBaratoEntregue]).toEqual([true, false]);
    expect([y.maisBaratoNoItem, y.maisBaratoEntregue]).toEqual([false, true]);
    // Diferenças: Y no item, +R$ 0,50/kg (+5,0%); X no entregue, +R$ 1,50/kg (1,5 ÷ 10,5 = +14,3%).
    expect(sp(formatarReaisDaFracao(y.difItem!.porUnidade.num, y.difItem!.porUnidade.den))).toBe('R$ 0,50');
    expect(y.difItem!.decimos).toBe(50);
    expect(sp(formatarReaisDaFracao(x.difEntregue!.porUnidade.num, x.difEntregue!.porUnidade.den))).toBe('R$ 1,50');
    expect(x.difEntregue!.decimos).toBe(143);
    expect(x.difItem).toBeNull();
    expect(y.difEntregue).toBeNull();
    // O frete pesa 20,0% sobre o preço do item no X e 0,0% no Y.
    expect([x.fretePesaDecimos, y.fretePesaDecimos]).toEqual([200, 0]);
    expect(tabelas[0].comBase).toBe(2);
  });

  it('embalagens diferentes do mesmo insumo caem na mesma unidade base: Peça 2 kg x quilo solto', () => {
    // Laticínios: 5 peças de 2 kg = 10 kg por R$ 400,00 + R$ 20,00 (R$ 40,00/kg; R$ 42,00 entregue). Zé: 3 kg a R$ 150,00 (R$ 50,00/kg).
    const { tabelas } = ranquearFornecedores([
      forn('lat', 400, 20, 10, { embalagens: ['Peça 2 kg'] }),
      forn('ze', 150, 0, 3, { embalagens: ['Padrão 1 kg'] }),
    ]);
    const [lat, ze] = tabelas[0].fornecedores;
    expect(lat.fornecedorId).toBe('lat');
    // Em centavos por milésimo, reduzido: 40000 ÷ 10000 = 4 ÷ 1 (R$ 40,00/kg); 42000 ÷ 10000 = 21 ÷ 5 (R$ 42,00/kg); 15000 ÷ 3000 = 5 ÷ 1 (R$ 50,00/kg).
    expect([lat.precoDoItem, lat.custoEntregue]).toEqual([{ centavos: 4, milesimos: 1 }, { centavos: 21, milesimos: 5 }]);
    expect(ze.precoDoItem).toEqual({ centavos: 5, milesimos: 1 });
    expect([lat.maisBaratoNoItem, lat.maisBaratoEntregue, ze.maisBaratoNoItem]).toEqual([true, true, false]);
    expect(ze.difItem!.decimos).toBe(250); // 10 ÷ 40 = +25,0%
  });

  it('um fornecedor só, empate e sem base: não há mais barato inventado', () => {
    const um = ranquearFornecedores([forn('x', 100, 0, 10)]);
    expect(um.tabelas[0].comBase).toBe(1);
    expect(um.tabelas[0].fornecedores[0]).toMatchObject({ maisBaratoNoItem: false, maisBaratoEntregue: false, difItem: null });
    // Empate: os dois são "mais barato", ninguém tem diferença.
    const empate = ranquearFornecedores([forn('a', 100, 0, 10), forn('b', 50, 0, 5)]);
    expect(empate.tabelas[0].fornecedores.map((f) => [f.maisBaratoNoItem, f.maisBaratoEntregue, f.difItem])).toEqual([[true, true, null], [true, true, null]]);
    // Fornecedor sem linha comparável (valor zero): fica no fim, sem custo, fora da disputa.
    const sem = ranquearFornecedores([forn('x', 100, 0, 10), forn('z', 0, 0, 5, { linhasSemBase: 1, comparavel: { linhas: 0, quantidadeMilesimos: 0, valorCentavos: 0, freteCentavos: 0 } })]);
    expect(sem.tabelas[0].fornecedores.map((f) => f.fornecedorId)).toEqual(['x', 'z']);
    expect(sem.tabelas[0].fornecedores[1]).toMatchObject({ precoDoItem: null, custoEntregue: null, maisBaratoNoItem: false });
    expect(sem.tabelas[0].comBase).toBe(1);
    // Linha sem unidade fica à parte.
    const sUn = ranquearFornecedores([forn('x', 100, 0, 10), forn('q', 10, 0, 1, { unidade: null })]);
    expect(sUn.semUnidade.map((f) => f.fornecedorId)).toEqual(['q']);
  });

  it('uma tabela por unidade: kg e litro nunca se misturam', () => {
    const { tabelas } = ranquearFornecedores([forn('x', 100, 0, 10), forn('y', 30, 0, 10, { unidade: 'L' })]);
    expect(tabelas.map((t) => t.unidade)).toEqual(['KG', 'L']);
    expect(tabelas.map((t) => t.comBase)).toEqual([1, 1]);
  });
});

describe('L.3 · os filtros e os avisos de cobertura', () => {
  it('padrão: os últimos 30 dias contra os 30 anteriores, mesmo tamanho', () => {
    const f = lerFiltrosDePeriodos({}, HOJE);
    expect([f.rel.de, f.rel.ate, f.deB, f.ateB]).toEqual(['2026-08-24', '2026-09-22', '2026-09-23', '2026-10-22']);
    expect(diasDoPeriodo(f.rel.de, f.rel.ate)).toBe(30);
    expect(diasDoPeriodo(f.deB, f.ateB)).toBe(30);
    expect(f).toMatchObject({ medida: 'entregue', periodoInvalido: null, pagina: 1, porPagina: 50 });
    expect(f.rel).toMatchObject({ base: 'entrada', situacao: 'lancadas', lojaIds: [], volta: '' });
    expect(avisosDeDatas({ de: f.rel.de, ate: f.rel.ate, deB: f.deB, ateB: f.ateB }, HOJE)).toEqual([]);
  });

  it('lê as quatro datas, a medida e os filtros; ida e volta pela URL', () => {
    const f = lerFiltrosDePeriodos({ de: '01/09/2026', ate: '30/09/2026', de2: '2026-10-01', ate2: '2026-10-31', medida: 'item', base: 'lancamento', loja: ['l1', 'l2'], fornecedor: 'f1', insumo: 'i1', categoria: 'c1', por: '25', pagina: '3', volta: '/erp/compras/relatorios/comparar-periodos?x=1' }, HOJE);
    expect([f.rel.de, f.rel.ate, f.deB, f.ateB, f.medida, f.rel.base]).toEqual(['2026-09-01', '2026-09-30', '2026-10-01', '2026-10-31', 'item', 'lancamento']);
    expect(f.rel).toMatchObject({ lojaIds: ['l1', 'l2'], fornecedorId: 'f1', insumoId: 'i1', categoriaId: 'c1', volta: '/erp/compras/relatorios/comparar-periodos?x=1' });
    expect([f.porPagina, f.pagina]).toEqual([25, 3]);
    const de_novo = lerFiltrosDePeriodos(Object.fromEntries(new URLSearchParams(queryDosPeriodos(f))) as Record<string, string>, HOJE);
    expect(de_novo.rel).toMatchObject({ de: f.rel.de, ate: f.rel.ate, base: 'lancamento', fornecedorId: 'f1', insumoId: 'i1', categoriaId: 'c1', volta: f.rel.volta });
    expect([de_novo.deB, de_novo.ateB, de_novo.medida, de_novo.pagina, de_novo.porPagina]).toEqual(['2026-10-01', '2026-10-31', 'item', 3, 25]);
    // A medida padrão e a página 1 não poluem o endereço.
    expect(queryDosPeriodos({ ...f, medida: 'entregue', pagina: 1, porPagina: 50 })).not.toMatch(/medida|pagina|por=/);
    expect(queryDosPeriodos(f, {}, { semPagina: true })).not.toMatch(/pagina/);
  });

  it('período torto vira frase, qualquer que seja o lado', () => {
    expect(lerFiltrosDePeriodos({ de: '2026-09-30', ate: '2026-09-01' }, HOJE).periodoInvalido).toMatch(/período A.*final vem antes/);
    expect(lerFiltrosDePeriodos({ de2: '2026-10-31', ate2: '2026-10-01' }, HOJE).periodoInvalido).toMatch(/período B.*final vem antes/);
    expect(lerFiltrosDePeriodos({ de: '1999-01-01', ate: '1999-01-31' }, HOJE).periodoInvalido).toMatch(/entre 2000 e 2100.*A/);
    expect(lerFiltrosDePeriodos({ de2: 'lixo', medida: '<script>' }, HOJE)).toMatchObject({ medida: 'entregue', periodoInvalido: null });
    // volta de fora que não é caminho nem entra
    expect(lerFiltrosDePeriodos({ volta: 'https://outro.site/x' }, HOJE).rel.volta).toBe('');
    expect(lerFiltrosDePeriodos({ volta: `/${'a'.repeat(2500)}` }, HOJE).rel.volta).toBe('');
  });

  it('avisa tamanhos diferentes, períodos que se sobrepõem e período que passa de hoje', () => {
    const chaves = (f: { de: string; ate: string; deB: string; ateB: string }) => avisosDeDatas(f, HOJE).map((a) => a.chave);
    expect(chaves({ de: '2026-09-01', ate: '2026-09-30', deB: '2026-10-01', ateB: '2026-10-31' })).toEqual(['tamanhos', 'andamento']);
    const t = avisosDeDatas({ de: '2026-09-01', ate: '2026-09-30', deB: '2026-10-01', ateB: '2026-10-15' }, HOJE);
    expect(t.map((a) => a.chave)).toEqual(['tamanhos']);
    expect(t[0].texto).toMatch(/A tem 30 dias e o B tem 15 dias/);
    expect(chaves({ de: '2026-10-01', ate: '2026-10-10', deB: '2026-10-05', ateB: '2026-10-14' })).toEqual(['sobrepoe']);
    expect(chaves({ de: '2026-10-01', ate: '2026-10-10', deB: '2026-10-10', ateB: '2026-10-19' })).toEqual(['sobrepoe']);
    expect(chaves({ de: '2026-10-01', ate: '2026-10-10', deB: '2026-10-11', ateB: '2026-10-20' })).toEqual([]);
  });

  it('os atalhos escolhem os dois períodos de uma vez, sem passar do fim do mês curto', () => {
    const a = atalhosDeComparacao(HOJE);
    expect(a.map((x) => x.chave)).toEqual(['30dias', '7dias', 'mes-ate-hoje', 'mes-passado']);
    expect(a[1]).toMatchObject({ de: '2026-10-09', ate: '2026-10-15', deB: '2026-10-16', ateB: '2026-10-22' });
    expect(a[2]).toMatchObject({ de: '2026-09-01', ate: '2026-09-22', deB: '2026-10-01', ateB: '2026-10-22' });
    expect(a[3]).toMatchObject({ de: '2026-08-01', ate: '2026-08-31', deB: '2026-09-01', ateB: '2026-09-30' });
    // 31 de março contra fevereiro (28 dias em 2026).
    expect(atalhosDeComparacao('2026-03-31')[2]).toMatchObject({ de: '2026-02-01', ate: '2026-02-28', deB: '2026-03-01', ateB: '2026-03-31' });
    for (const x of a) {
      expect(diasDoPeriodo(x.de, x.ate)).toBeGreaterThan(0);
      expect(diasDoPeriodo(x.deB, x.ateB)).toBeGreaterThan(0);
    }
    // Os três primeiros têm o mesmo tamanho dos dois lados.
    for (const x of a.slice(0, 2)) expect(diasDoPeriodo(x.de, x.ate)).toBe(diasDoPeriodo(x.deB, x.ateB));
  });
});

describe('L.3 · o período anterior, a planilha e a volta', () => {
  it('o período anterior tem o mesmo tamanho e termina na véspera', () => {
    expect(periodoAnterior('2026-10-01', '2026-10-22')).toEqual({ de: '2026-09-09', ate: '2026-09-30' });
    expect(periodoAnterior('2026-10-10', '2026-10-10')).toEqual({ de: '2026-10-09', ate: '2026-10-09' });
    expect(periodoAnterior('2026-03-01', '2026-03-31')).toEqual({ de: '2026-01-29', ate: '2026-02-28' });
    expect(diasDoPeriodo('2026-01-29', '2026-02-28')).toBe(31);
  });
  it('"Comparar com o período anterior" parte do recorte da L.2: B é o período dele e os filtros seguem', () => {
    const f = lerFiltrosDoRelatorio({ de: '2026-10-01', ate: '2026-10-22', loja: ['l1'], fornecedor: 'f1', insumo: 'i1', base: 'lancamento', volta: '/erp/x' }, HOJE);
    const volta = lerFiltrosDePeriodos(Object.fromEntries(new URLSearchParams(queryParaCompararComOAnterior(f))) as Record<string, string>, HOJE);
    expect([volta.rel.de, volta.rel.ate, volta.deB, volta.ateB]).toEqual(['2026-09-09', '2026-09-30', '2026-10-01', '2026-10-22']);
    expect(volta.rel).toMatchObject({ lojaIds: ['l1'], fornecedorId: 'f1', insumoId: 'i1', base: 'lancamento', volta: '' });
  });
  it('preço por unidade da planilha: 4 casas, metade para cima, a partir de centavos por unidade', () => {
    expect(fracaoParaPlanilha({ num: 150n, den: 1n })).toBe('1,5000');
    expect(fracaoParaPlanilha({ num: 1n, den: 3n })).toBe('0,0033');
    expect(fracaoParaPlanilha({ num: 100n * 1000n, den: 7n * 1000n })).toBe('0,1429');
  });
  it('o rótulo da volta diz "a comparação de compras" antes de "o relatório de compras"', () => {
    expect(rotuloDaVolta('/erp/compras/relatorios/comparar-periodos?de=1')).toBe('a comparação de compras');
    expect(rotuloDaVolta('/rodolfo/erp/x/compras/relatorios/comparar-fornecedores?a=1')).toBe('a comparação de compras');
    expect(rotuloDaVolta('/erp/compras/relatorios/periodo?de=1')).toBe('o relatório de compras');
  });
});

describe('L.3 (1ª volta da UX) · um lado sem compra, avisos e gramática', () => {
  it('B vazio: nada de "−100,0%": variação sem base, só "saiu"; o mesmo com A vazio', () => {
    const b0 = compararPeriodos([cel('queijo', 'x', 10, 133)], [], 'entregue');
    expect(b0.resumo).toMatchObject({ semCompraA: false, semCompraB: true, variacaoDecimos: null, saiuCentavos: -13300, entrouCentavos: 0, volumeCentavos: 0, precoCentavos: 0, nosDois: 0, soEmA: 1, entrouDomina: false });
    expect(formatarPercentual(b0.resumo.variacaoDecimos)).toBe('sem base');
    const a0 = compararPeriodos([], [cel('queijo', 'x', 10, 133)], 'entregue');
    expect(a0.resumo).toMatchObject({ semCompraA: true, semCompraB: false, variacaoDecimos: null, entrouCentavos: 13300, nosDois: 0, entrouDomina: false });
    // Os dois vazios: os dois lados sem compra.
    expect(compararPeriodos([], [], 'item').resumo).toMatchObject({ semCompraA: true, semCompraB: true, variacaoDecimos: null });
    // Os dois com compra: percentual normal.
    const dois = compararPeriodos([cel('q', 'x', 10, 100)], [cel('q', 'x', 10, 110)], 'item');
    expect(dois.resumo).toMatchObject({ semCompraA: false, semCompraB: false, variacaoDecimos: 100 });
  });

  it('"entrou" domina quando é mais da metade de uma variação positiva', () => {
    // A: queijo R$ 100,00. B: queijo R$ 100,00 + bacon novo R$ 300,00 -> variação +300,00, entrou 300,00 (100%).
    const r = compararPeriodos([cel('queijo', 'x', 10, 100)], [cel('queijo', 'x', 10, 100), cel('bacon', 'x', 5, 300)], 'item').resumo;
    expect([r.variacaoCentavos, r.entrouCentavos, r.entrouDomina]).toEqual([30000, 30000, true]);
    // Preço sobe 10% e o insumo novo é pequeno: não domina.
    const p = compararPeriodos([cel('queijo', 'x', 10, 100)], [cel('queijo', 'x', 10, 140), cel('sal', 'x', 1, 5)], 'item').resumo;
    expect(p.entrouDomina).toBe(false);
    // Variação negativa nunca "domina".
    expect(compararPeriodos([cel('queijo', 'x', 10, 500)], [cel('queijo', 'x', 10, 100), cel('sal', 'x', 1, 5)], 'item').resumo.entrouDomina).toBe(false);
  });

  it('gramática: "Os períodos A e B terminam depois de hoje" e "O período B termina"', () => {
    const d = (f: { de: string; ate: string; deB: string; ateB: string }) => avisosDeDatas(f, HOJE).find((a) => a.chave === 'andamento')?.texto;
    expect(d({ de: '2026-10-01', ate: '2026-10-31', deB: '2026-11-01', ateB: '2026-11-30' })).toMatch(/^Os períodos A e B terminam depois de hoje/);
    expect(d({ de: '2026-09-01', ate: '2026-09-30', deB: '2026-10-01', ateB: '2026-10-31' })).toMatch(/^O período B termina depois de hoje/);
    expect(d({ de: '2026-10-20', ate: '2026-10-31', deB: '2026-09-01', ateB: '2026-09-12' })).toMatch(/^O período A termina depois de hoje/);
  });

  it('os avisos da comparação (a tela e o CSV dizem a mesma frase): cobertura com o link do lado, lado sem compra, emissão, aguardando', () => {
    const lado = (de: string, ate: string, celulas: number, sem: number, extra: Record<string, unknown> = {}) => ({
      de, ate, celulas: Array.from({ length: celulas }), semBase: { linhas: sem, valorCentavos: sem * 1500, freteCentavos: 0, porMotivo: sem ? ({ unidade: sem } as const) : {} },
      dinheiroTotalCentavos: 33300, dinheiroComparavelCentavos: 31800, semEmissao: null as number | null, ...extra,
    });
    const av = avisosDaComparacao({ de: '2026-09-01', ate: '2026-09-30', deB: '2026-10-01', ateB: '2026-10-31' }, lado('2026-09-01', '2026-09-30', 4, 1), lado('2026-10-01', '2026-10-31', 0, 0, { semEmissao: 2 }), 3, HOJE);
    const por = Object.fromEntries(av.map((x) => [x.chave, x]));
    expect(por['base-A'].semBaseDoLado).toBe('A');
    expect(sp(por['base-A'].texto)).toMatch(/Cobertura incompleta no período A: 1 linha \(R\$ 15,00\)/);
    expect(por['base-A'].texto).toMatch(/cobre 95,4% do dinheiro/);
    expect(por['sem-b'].texto).toMatch(/Não há variação a calcular \(sem base\).*“saiu”/);
    expect(por['emissao-B'].texto).toMatch(/2 notas lançadas no período B não têm data de emissão/);
    expect(por['aguardando'].texto).toMatch(/3 notas fiscais recebidas \(XML\) aguardam conferência e não contam/);
    expect(por['tamanhos']).toBeDefined();
    expect(por['sem-a']).toBeUndefined();
  });
});
