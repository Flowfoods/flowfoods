/**
 * ERP 1.8 · Requisição — regras puras: ler o pedido (kg/g, setor, para
 * quando), a lista puxada da ficha (bruta, sem cascata), a entrega parcial e o
 * estado, a baixa com valor exato, o saldo negativo, a devolução por estorno e
 * o cruzamento requisição × contagem (consumo apurado, sumiço exato em R$,
 * pequenos repetidos, por setor).
 */
import { describe, expect, it } from 'vitest';
import {
  baixasDaEntrega,
  diasDeAtraso,
  divergenciasDoPeriodo,
  estadoDepoisDaEntrega,
  fraseDoNegativo,
  lerEntrega,
  lerPedido,
  movimentosDaDevolucao,
  negativosDaEntrega,
  porSetor,
  quantidadesDaFicha,
  resumoDasDivergencias,
  tempoDesde,
  textoDoAtraso,
  textoDoCampo,
  textoDoParaDia,
  TITULO_NO_HISTORICO_DA_REQUISICAO,
  trechosDoInsumo,
  type InsumoParaPedir,
  type ItemParaEntregar,
} from '@/lib/erp/requisicao-campos';
import { aplicarNosSaldos } from '@/lib/erp/estoque-campos';
import { custoPorUnidade } from '@/lib/erp/unidades';

const HOJE = '2026-10-16';
const INSUMOS = new Map<string, InsumoParaPedir>([
  ['ched', { id: 'ched', nome: 'Cheddar fatiado', unidade: 'KG', ativo: true }],
  ['bac', { id: 'bac', nome: 'Bacon', unidade: 'KG', ativo: true }],
  ['pao', { id: 'pao', nome: 'Pão brioche', unidade: 'UN', ativo: true }],
  ['velho', { id: 'velho', nome: 'Molho antigo', unidade: 'L', ativo: false }],
]);
// Cheddar R$ 94,90 por 5 kg = R$ 18,98/kg; bacon R$ 42,00/kg; pão R$ 1,50/un.
const CHEDDAR = custoPorUnidade({ centavos: 9490, milesimos: 5000 });
const BACON = custoPorUnidade({ centavos: 4200, milesimos: 1000 });
const PAO = custoPorUnidade({ centavos: 1800, milesimos: 12_000 });

describe('pedir: setor, para quando, itens em kg/g', () => {
  it('lê o pedido do cozinheiro: 2 kg de cheddar e 1.000 g de bacon, para hoje', () => {
    const r = lerPedido(
      {
        setor: 'COZINHA',
        paraDia: 'hoje',
        observacao: '  pro  almoço ',
        linhas: [
          { insumoId: 'ched', quantidade: '2', escala: 'base' },
          { insumoId: 'bac', quantidade: '1000', escala: 'menor' },
          { insumoId: '', quantidade: '', escala: 'base' },
        ],
      },
      INSUMOS,
      HOJE,
    );
    expect(r).toEqual({
      ok: true,
      pedido: {
        setor: 'COZINHA',
        paraDia: HOJE,
        observacao: 'pro almoço',
        itens: [
          { insumoId: 'ched', nome: 'Cheddar fatiado', unidade: 'KG', solicitadoMilesimos: 2000 },
          { insumoId: 'bac', nome: 'Bacon', unidade: 'KG', solicitadoMilesimos: 1000 },
        ],
      },
    });
  });
  it('recusa setor fora da lista, data passada ou longe demais, repetido, desativado, meio grama, zero e lista vazia', () => {
    const r = lerPedido(
      {
        setor: 'COPA',
        paraDia: '2026-10-15',
        observacao: '',
        linhas: [
          { insumoId: 'ched', quantidade: '2', escala: 'base' },
          { insumoId: 'ched', quantidade: '1', escala: 'base' },
          { insumoId: 'velho', quantidade: '1', escala: 'base' },
          { insumoId: 'bac', quantidade: '0,5', escala: 'menor' },
          { insumoId: 'pao', quantidade: '0', escala: 'base' },
        ],
      },
      INSUMOS,
      HOJE,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.erros).sort()).toEqual(['item:1', 'item:2', 'item:3', 'item:4', 'paraDia', 'setor']);
    expect(r.erros['item:1']).toMatch(/já está na lista/);
    expect(lerPedido({ setor: 'SALAO', paraDia: '2026-11-30', observacao: '', linhas: [] }, INSUMOS, HOJE)).toMatchObject({ ok: false, erros: { paraDia: expect.stringMatching(/14 dias/), itens: expect.any(String) } });
    expect(lerPedido({ setor: 'SALAO', paraDia: 'amanha', observacao: '', linhas: [{ insumoId: 'pao', quantidade: '24', escala: 'base' }] }, INSUMOS, HOJE)).toMatchObject({ ok: true, pedido: { paraDia: '2026-10-17' } });
  });
  it('atraso só de pendente, em dias do Rio; textos', () => {
    expect(diasDeAtraso({ status: 'ABERTA', paraDia: '2026-10-14' }, HOJE)).toBe(2);
    expect(diasDeAtraso({ status: 'PARCIAL', paraDia: '2026-10-15' }, HOJE)).toBe(1);
    expect(diasDeAtraso({ status: 'ABERTA', paraDia: HOJE }, HOJE)).toBe(0);
    expect(diasDeAtraso({ status: 'ATENDIDA', paraDia: '2026-10-01' }, HOJE)).toBe(0);
    expect(textoDoAtraso(2)).toBe('2d de atraso');
    expect([textoDoParaDia(HOJE, HOJE), textoDoParaDia('2026-10-17', HOJE), textoDoParaDia('2026-10-20', HOJE)]).toEqual(['para hoje', 'para amanhã', 'para 20/10']);
  });
});

describe('pedir pela ficha técnica: quantidade bruta, sem cascata', () => {
  it('20 burgers de uma ficha que rende 1 porção: 180 g de carne (fator 1,10) e 40 g de molho pronto viram 3,96 kg e 800 g', () => {
    const r = quantidadesDaFicha(
      { rendimentoMilesimos: 1000 },
      [
        { insumoId: 'carne', quantidadeMilesimos: 180, fatorCorrecaoMilesimos: 1100 },
        { insumoId: 'molho', quantidadeMilesimos: 40, fatorCorrecaoMilesimos: 1000 },
        { insumoId: null, quantidadeMilesimos: 10, fatorCorrecaoMilesimos: 1000 },
        { insumoId: 'molho', quantidadeMilesimos: 5, fatorCorrecaoMilesimos: 1000 },
      ],
      20_000,
    );
    expect(r).toEqual({
      itens: [
        { insumoId: 'carne', quantidadeMilesimos: 3960 },
        { insumoId: 'molho', quantidadeMilesimos: 900 },
      ],
      semInsumo: 1,
    });
  });
  it('rendimento em kg e arredondamento único (metade para cima)', () => {
    // Molho rende 2 kg com 333 g de cebola; para 1 kg: 166,5 g → 167 g.
    expect(quantidadesDaFicha({ rendimentoMilesimos: 2000 }, [{ insumoId: 'ceb', quantidadeMilesimos: 333, fatorCorrecaoMilesimos: 1000 }], 1000).itens).toEqual([{ insumoId: 'ceb', quantidadeMilesimos: 167 }]);
    expect(textoDoCampo(3960)).toBe('3,96');
    expect(textoDoCampo(2000)).toBe('2');
  });
});

const ITENS: ItemParaEntregar[] = [
  { id: 'i1', insumoId: 'ched', nome: 'Cheddar fatiado', unidade: 'KG', solicitadoMilesimos: 2000, atendidoMilesimos: 0 },
  { id: 'i2', insumoId: 'bac', nome: 'Bacon', unidade: 'KG', solicitadoMilesimos: 1000, atendidoMilesimos: 0 },
];

describe('atender: entrega parcial, estado, baixa com valor exato, saldo negativo', () => {
  it('entrega 2 kg de cheddar e 600 g de bacon: atendida em parte; o resto do bacon sai depois ou é encerrado', () => {
    const r = lerEntrega(
      [
        { itemId: 'i1', quantidade: '2', escala: 'base' },
        { itemId: 'i2', quantidade: '600', escala: 'menor' },
      ],
      ITENS,
      false,
    );
    expect(r).toEqual({ ok: true, entregas: [{ itemId: 'i1', quantidadeMilesimos: 2000 }, { itemId: 'i2', quantidadeMilesimos: 600 }] });
    if (!r.ok) return;
    expect(estadoDepoisDaEntrega(ITENS, r.entregas, false)).toBe('PARCIAL');
    expect(estadoDepoisDaEntrega(ITENS, r.entregas, true)).toBe('ATENDIDA');
    expect(estadoDepoisDaEntrega(ITENS, [...r.entregas.slice(0, 1), { itemId: 'i2', quantidadeMilesimos: 1000 }], false)).toBe('ATENDIDA');
    expect(estadoDepoisDaEntrega(ITENS, [], false)).toBe('ABERTA');
  });
  it('nada e sem encerrar é erro; mais que o dobro do pedido é dedo errado; a peça de 2,1 kg passa', () => {
    expect(lerEntrega([{ itemId: 'i1', quantidade: '', escala: 'base' }], ITENS, false)).toMatchObject({ ok: false, erros: { geral: expect.any(String) } });
    expect(lerEntrega([], ITENS, true)).toEqual({ ok: true, entregas: [] });
    expect(lerEntrega([{ itemId: 'i1', quantidade: '5', escala: 'base' }], ITENS, false)).toMatchObject({ ok: false, erros: { 'item:i1': expect.stringMatching(/dobro/) } });
    expect(lerEntrega([{ itemId: 'i1', quantidade: '2,1', escala: 'base' }], ITENS, false)).toEqual({ ok: true, entregas: [{ itemId: 'i1', quantidadeMilesimos: 2100 }] });
  });
  it('a baixa: REQUISICAO −, valor pelo custo de referência (2 kg × R$ 18,98 = R$ 37,96; 600 g × R$ 42 = R$ 25,20), chave por item e versão', () => {
    const custos = new Map([
      ['ched', CHEDDAR],
      ['bac', BACON],
    ]);
    const m = baixasDaEntrega({ id: 'r1', lojaId: 'vp', numero: 12, setor: 'COZINHA', versao: 3 }, ITENS, [{ itemId: 'i1', quantidadeMilesimos: 2000 }, { itemId: 'i2', quantidadeMilesimos: 600 }], custos);
    expect(m).toEqual([
      { lojaId: 'vp', insumoId: 'ched', tipo: 'REQUISICAO', quantidadeMilesimos: -2000, valorCentavos: -3796, insumoNome: 'Cheddar fatiado', unidade: 'KG', motivo: 'Requisição #12 · Cozinha', chave: 'requisicao:i1:3', requisicaoItemId: 'i1', semCusto: false },
      { lojaId: 'vp', insumoId: 'bac', tipo: 'REQUISICAO', quantidadeMilesimos: -600, valorCentavos: -2520, insumoNome: 'Bacon', unidade: 'KG', motivo: 'Requisição #12 · Cozinha', chave: 'requisicao:i2:3', requisicaoItemId: 'i2', semCusto: false },
    ]);
    // Sem preço: 0 no livro (a tela diz pendente).
    expect(baixasDaEntrega({ id: 'r1', lojaId: 'vp', numero: 12, setor: 'SALAO', versao: 0 }, ITENS, [{ itemId: 'i2', quantidadeMilesimos: 600 }], new Map())[0].valorCentavos).toBe(0);
    // Saldo antes/depois coerente com o CHECK do banco.
    const { linhas } = aplicarNosSaldos(new Map([['vp|ched', { quantidadeMilesimos: 1500, valorCentavos: 2847 }]]), m.slice(0, 1));
    expect(linhas[0]).toMatchObject({ saldoAntesMilesimos: 1500, saldoDepoisMilesimos: -500 });
  });
  it('saldo insuficiente: a entrega passa (com confirmação) e o negativo vira alarme com a frase', () => {
    const n = negativosDaEntrega(ITENS, [{ itemId: 'i1', quantidadeMilesimos: 2000 }, { itemId: 'i2', quantidadeMilesimos: 600 }], new Map([['ched', 1500], ['bac', 3000]]));
    expect(n).toEqual([{ itemId: 'i1', nome: 'Cheddar fatiado', unidade: 'KG', saldoMilesimos: 1500, ficaMilesimos: -500 }]);
    expect(fraseDoNegativo(n[0])).toBe('Cheddar fatiado: o livro diz 1,5 kg; com esta saída fica −500 g');
  });
});

describe('devolução por estorno: espelho exato + a baixa do que ficou', () => {
  const ativos = [
    { id: 'm1', lojaId: 'vp', insumoId: 'bac', quantidadeMilesimos: -600, valorCentavos: -2520, insumoNomeSnapshot: 'Bacon', unidadeSnapshot: 'KG' as const, requisicaoItemId: 'i2', motivo: 'Requisição #12 · Cozinha' },
    { id: 'm2', lojaId: 'vp', insumoId: 'bac', quantidadeMilesimos: -400, valorCentavos: -1700, insumoNomeSnapshot: 'Bacon', unidadeSnapshot: 'KG' as const, requisicaoItemId: 'i2', motivo: 'Requisição #12 · Cozinha' },
  ];
  it('voltaram 300 g de 1 kg: estorna as duas baixas e baixa 700 g pelo valor proporcional da época (R$ 42,20 × 0,7 = R$ 29,54)', () => {
    const r = movimentosDaDevolucao(ativos, 300, { motivo: 'Devolução · Requisição #12', chave: 'devolucao:i2:5' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.liquidoMilesimos).toBe(700);
    expect(r.movimentos.map((m) => [m.quantidadeMilesimos, m.valorCentavos, m.estornoDeId ?? null, m.chave])).toEqual([
      [600, 2520, 'm1', 'estorno:m1'],
      [400, 1700, 'm2', 'estorno:m2'],
      [-700, -2954, null, 'devolucao:i2:5'],
    ]);
    // Σ do item no livro = −700 g (o requisitado líquido).
    expect([...ativos, ...r.movimentos].reduce((s, m) => s + m.quantidadeMilesimos, 0)).toBe(-700);
  });
  it('devolver tudo = só os estornos; mais do que saiu ou nada saiu = recusa', () => {
    const r = movimentosDaDevolucao(ativos, 1000, { motivo: 'x', chave: 'k' });
    expect(r.ok && r.movimentos.length).toBe(2);
    expect(movimentosDaDevolucao(ativos, 1001, { motivo: 'x', chave: 'k' })).toMatchObject({ ok: false, erro: expect.stringMatching(/1 kg/) });
    expect(movimentosDaDevolucao([], 100, { motivo: 'x', chave: 'k' })).toMatchObject({ ok: false });
  });
});

const D = (dia: number, hora = 12) => new Date(Date.UTC(2026, 9, dia, hora));

describe('cruzamento requisição × contagem: consumo apurado × requisitado = sumiço', () => {
  it('bacon: contou 5 kg, comprou 2 kg, a cozinha requisitou 3 kg, contou 3 kg → consumiu 4 kg, sumiu 1 kg sem requisição (R$ 42,00)', () => {
    const marcos = [
      { instante: D(10), contadoMilesimos: 5000 },
      { instante: D(14), contadoMilesimos: 3000 },
    ];
    const fluxos = [
      { tipo: 'ENTRADA_COMPRA' as const, quantidadeMilesimos: 2000, ocorridoEm: D(11) },
      { tipo: 'REQUISICAO' as const, quantidadeMilesimos: -3000, ocorridoEm: D(12), setor: 'COZINHA' },
      // fora do trecho: antes do início e depois do fim
      { tipo: 'REQUISICAO' as const, quantidadeMilesimos: -9000, ocorridoEm: D(9), setor: 'COZINHA' },
      { tipo: 'REQUISICAO' as const, quantidadeMilesimos: -9000, ocorridoEm: D(15), setor: 'COZINHA' },
    ];
    const [t] = trechosDoInsumo(marcos, fluxos);
    expect(t).toMatchObject({ inicialMilesimos: 5000, entradasMilesimos: 2000, requisitadoMilesimos: 3000, outrasSaidasMilesimos: 0, finalMilesimos: 3000, consumoMilesimos: 4000, sumicoMilesimos: 1000 });
    const [d] = divergenciasDoPeriodo([{ insumoId: 'bac', nome: 'Bacon', unidade: 'KG', marcos, fluxos, porUnidade: BACON }], { de: D(13, 0), ate: D(17, 0) }, 500);
    expect(d).toMatchObject({ trechos: 1, consumoMilesimos: 4000, requisitadoMilesimos: 3000, sumicoMilesimos: 1000, sumicoCentavos: 4200, pequenos: { vezes: 0 } });
    expect(d.requisitadoPorSetor.get('COZINHA')).toBe(3000);
  });
  it('estornos entram com o sinal: compra cancelada sai das entradas, devolução sai do requisitado; perda lançada explica a saída', () => {
    const [t] = trechosDoInsumo(
      [
        { instante: D(1), contadoMilesimos: 10_000 },
        { instante: D(5), contadoMilesimos: 6000 },
      ],
      [
        { tipo: 'ENTRADA_COMPRA', quantidadeMilesimos: 5000, ocorridoEm: D(2) },
        { tipo: 'ENTRADA_COMPRA', quantidadeMilesimos: -5000, ocorridoEm: D(2, 13) },
        { tipo: 'REQUISICAO', quantidadeMilesimos: -3000, ocorridoEm: D(3), setor: 'SALAO' },
        { tipo: 'REQUISICAO', quantidadeMilesimos: 1000, ocorridoEm: D(3, 14), setor: 'SALAO' },
        { tipo: 'PERDA', quantidadeMilesimos: -1500, ocorridoEm: D(4) },
        { tipo: 'CONTAGEM', quantidadeMilesimos: -800, ocorridoEm: D(4, 15) },
      ],
    );
    // consumo 4 kg = requisitado 2 kg + perda 1,5 kg + sumiço 0,5 kg (a contagem de outro trecho não entra).
    expect(t).toMatchObject({ entradasMilesimos: 0, requisitadoMilesimos: 2000, outrasSaidasMilesimos: 1500, consumoMilesimos: 4000, sumicoMilesimos: 500 });
    expect(t.requisitadoPorSetor.get('SALAO')).toBe(2000);
  });
  it('sumiço é o "esperado − contado" da 1.7: o livro no fim do trecho menos o que se contou', () => {
    // Livro no início = 5 kg; +2 compra, −3 requisição → esperado 4 kg; contou 3 kg → CONTAGEM −1 kg; sumiço = 1 kg.
    const esperado = 5000 + 2000 - 3000;
    const [t] = trechosDoInsumo(
      [
        { instante: D(10), contadoMilesimos: 5000 },
        { instante: D(14), contadoMilesimos: 3000 },
      ],
      [
        { tipo: 'ENTRADA_COMPRA', quantidadeMilesimos: 2000, ocorridoEm: D(11) },
        { tipo: 'REQUISICAO', quantidadeMilesimos: -3000, ocorridoEm: D(12) },
      ],
    );
    expect(t.sumicoMilesimos).toBe(esperado - 3000);
  });
  it('pequenos repetidos dentro da tolerância (o que o "fecha sozinha" deixa passar) somam; requisitou demais = sobra', () => {
    // Cheddar: três trechos sumindo 200 g cada (R$ 3,80 < tolerância R$ 5,00).
    const marcos = [0, 1, 2, 3].map((k) => ({ instante: D(10 + k), contadoMilesimos: 4000 - 200 * k }));
    const ds = divergenciasDoPeriodo(
      [
        { insumoId: 'ched', nome: 'Cheddar fatiado', unidade: 'KG', marcos, fluxos: [], porUnidade: CHEDDAR },
        {
          insumoId: 'pao',
          nome: 'Pão brioche',
          unidade: 'UN',
          marcos: [
            { instante: D(10), contadoMilesimos: 50_000 },
            { instante: D(12), contadoMilesimos: 40_000 },
          ],
          fluxos: [{ tipo: 'REQUISICAO', quantidadeMilesimos: -12_000, ocorridoEm: D(11), setor: 'COZINHA' }],
          porUnidade: PAO,
        },
        { insumoId: 'bat', nome: 'Batata', unidade: 'KG', marcos: [{ instante: D(10), contadoMilesimos: 1000 }, { instante: D(12), contadoMilesimos: 0 }], fluxos: [], porUnidade: null },
      ],
      { de: D(1, 0), ate: D(20, 0) },
      500,
    );
    const ched = ds.find((d) => d.insumoId === 'ched')!;
    expect(ched).toMatchObject({ trechos: 3, sumicoMilesimos: 600, sumicoCentavos: 1139, pequenos: { vezes: 3, milesimos: 600, centavos: 1139 } });
    const pao = ds.find((d) => d.insumoId === 'pao')!;
    expect(pao).toMatchObject({ consumoMilesimos: 10_000, requisitadoMilesimos: 12_000, sumicoMilesimos: -2000, sumicoCentavos: -300 });
    // Ranking: maior sumiço em R$ primeiro; sem preço por último.
    expect(ds.map((d) => d.insumoId)).toEqual(['ched', 'pao', 'bat']);
    expect(resumoDasDivergencias(ds)).toEqual({ sumicoCentavos: 1139, comSumico: 2, sobraCentavos: 300, comSobra: 1, semPreco: 1, pequenosRepetidos: 1, pequenosCentavos: 1139 });
    const setores = porSetor(ds, new Map([['pao', PAO]]));
    expect(setores).toEqual([{ setor: 'COZINHA', requisitadoCentavos: 1800, quantosInsumos: 1, sumicoNosSeusCentavos: 0, insumosComSumico: 0 }]);
  });
  it('a janela pega o trecho pelo FIM; insumo sem trecho que feche na janela fica de fora', () => {
    const ds = divergenciasDoPeriodo(
      [{ insumoId: 'bac', nome: 'Bacon', unidade: 'KG', marcos: [{ instante: D(1), contadoMilesimos: 1000 }, { instante: D(3), contadoMilesimos: 500 }], fluxos: [], porUnidade: BACON }],
      { de: D(4, 0), ate: D(10, 0) },
      500,
    );
    expect(ds).toEqual([]);
  });
});

describe('para quando digitado como no Brasil', () => {
  it('dd/mm/aaaa vale; data impossível é erro', () => {
    const base = { setor: 'COZINHA', observacao: '', linhas: [{ insumoId: 'pao', quantidade: '12', escala: 'base' }] };
    expect(lerPedido({ ...base, paraDia: '18/10/2026' }, INSUMOS, HOJE)).toMatchObject({ ok: true, pedido: { paraDia: '2026-10-18' } });
    expect(lerPedido({ ...base, paraDia: '31/02/2026' }, INSUMOS, HOJE)).toMatchObject({ ok: false, erros: { paraDia: expect.stringMatching(/dd\/mm\/aaaa/) } });
  });
});

describe('herança d da 1.8: tempo no processo e o histórico pelo estado', () => {
  const agora = new Date('2026-10-16T15:00:00Z');
  it('"há 3 h" arredonda para baixo; minutos, dias', () => {
    expect(tempoDesde(new Date(agora.getTime() - 30_000), agora)).toBe('agora');
    expect(tempoDesde(new Date(agora.getTime() - 12 * 60_000), agora)).toBe('há 12 min');
    expect(tempoDesde(new Date(agora.getTime() - (3 * 60 + 50) * 60_000), agora)).toBe('há 3 h');
    expect(tempoDesde(new Date(agora.getTime() - 26 * 3_600_000), agora)).toBe('há 1 dia');
    expect(tempoDesde(new Date(agora.getTime() - 50 * 3_600_000), agora)).toBe('há 2 dias');
  });
  it('dentro da requisição: Pedida, Entregue, Voltou para o estoque, Cancelada', () => {
    expect(TITULO_NO_HISTORICO_DA_REQUISICAO).toMatchObject({ PEDIU: 'Pedida', ATENDEU: 'Entregue', DEVOLVEU: 'Voltou para o estoque', CANCELOU: 'Cancelada' });
  });
});
