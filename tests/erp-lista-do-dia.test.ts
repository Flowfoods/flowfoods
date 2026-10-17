/**
 * ERP 3.2 · Lista do dia, regras puras (sem banco): o dia da tela, o rascunho da URL, juntar as linhas, e a conta de
 * vai usar · tem · comprar com os números da análise (Casa Alfa: Molho cheddar 5 kg + Cebola caramelizada 2 kg + Molho especial 2 kg).
 */
import { describe, expect, it } from 'vitest';
import {
  avisoDoLoteJaExistente,
  compraEmEmbalagens,
  contaDaLista,
  fraseDoCoberto,
  juntarLinhas,
  lerDiaDaLista,
  lerRascunho,
  LINHAS_POR_ENVIO,
  linhaNaUrl,
  rotuloDoDia,
  textoDaCompra,
  textoDaQuantidade,
  valorDaCompra,
  type FichaParaLinha,
  type InsumoDaConta,
  type UsoPrevisto,
} from '@/lib/erp/lista-do-dia-campos';
import { formatarFracao, type Fracao } from '@/lib/erp/unidades';

const HOJE = '2026-10-18';

describe('3.2 · o dia da tela', () => {
  it('de um ano atrás a 14 dias à frente; o resto volta para hoje; passado é só leitura', () => {
    expect(lerDiaDaLista(undefined, HOJE)).toEqual({ dia: HOJE, passado: false });
    expect(lerDiaDaLista('2026-10-18', HOJE)).toEqual({ dia: HOJE, passado: false });
    expect(lerDiaDaLista('2026-10-19', HOJE)).toEqual({ dia: '2026-10-19', passado: false });
    expect(lerDiaDaLista('2026-11-01', HOJE)).toEqual({ dia: '2026-11-01', passado: false });
    expect(lerDiaDaLista('2026-11-02', HOJE)).toEqual({ dia: HOJE, passado: false });
    expect(lerDiaDaLista('2026-10-17', HOJE)).toEqual({ dia: '2026-10-17', passado: true });
    expect(lerDiaDaLista('2025-10-18', HOJE)).toEqual({ dia: '2025-10-18', passado: true });
    expect(lerDiaDaLista('2025-10-17', HOJE)).toEqual({ dia: HOJE, passado: false });
  });

  it('lixo, data impossível e formato errado voltam para hoje', () => {
    for (const lixo of ['lixo', '', '2026-02-30', '2026-13-01', '18/10/2026', '2026-10-1', "2026-10-18'; DROP", null, 42, ['2026-10-19'], '2026-10-19x']) {
      expect(lerDiaDaLista(lixo, HOJE), String(lixo)).toEqual({ dia: HOJE, passado: false });
    }
  });

  it('o rótulo diz hoje, amanhã e ontem', () => {
    expect(rotuloDoDia('2026-10-18', HOJE)).toBe('hoje · domingo, 18/10');
    expect(rotuloDoDia('2026-10-19', HOJE)).toBe('amanhã · segunda-feira, 19/10');
    expect(rotuloDoDia('2026-10-17', HOJE)).toBe('ontem · sábado, 17/10');
    expect(rotuloDoDia('2026-10-25', HOJE)).toBe('domingo, 25/10');
  });
});

describe('3.2 · o rascunho que vem da URL é dado de fora', () => {
  it('lê ficha~quanto; descarta o que não tem a forma; passar de 30 avisa', () => {
    expect(lerRascunho('abc123~5')).toEqual({ linhas: [{ fichaId: 'abc123', quantidade: '5' }], excedeu: false });
    expect(lerRascunho(['abc~1,5', 'def~2'])).toMatchObject({ linhas: [{ fichaId: 'abc', quantidade: '1,5' }, { fichaId: 'def', quantidade: '2' }] });
    expect(lerRascunho(undefined)).toEqual({ linhas: [], excedeu: false });
    // Id estranho, quantidade enorme e linha sem ficha: descartados. Ficha sem til vira linha sem quantidade (a prévia a marca).
    expect(lerRascunho(["a'b~1", '../x~1', 'abc~' + '9'.repeat(30), '~5']).linhas).toEqual([]);
    expect(lerRascunho(['semtil']).linhas).toEqual([{ fichaId: 'semtil', quantidade: '' }]);
    const muitas = Array.from({ length: 35 }, (_, n) => `f${n}~1`);
    const r = lerRascunho(muitas);
    expect(r.linhas).toHaveLength(LINHAS_POR_ENVIO);
    expect(r.excedeu).toBe(true);
    expect(lerRascunho(Array.from({ length: 30 }, (_, n) => `f${n}~1`)).excedeu).toBe(false);
  });

  it('a linha volta para a URL e a quantidade para o campo', () => {
    expect(linhaNaUrl({ fichaId: 'abc', quantidade: '0,5' })).toBe('abc~0,5');
    expect(textoDaQuantidade(500)).toBe('0,5');
    expect(textoDaQuantidade(5000)).toBe('5');
    expect(textoDaQuantidade(1250)).toBe('1,25');
    expect(textoDaQuantidade(89)).toBe('0,089');
  });
});

const FICHAS = new Map<string, FichaParaLinha>([
  ['molho', { nome: 'Molho cheddar', unidade: 'KG', naoProduz: null }],
  ['cebola', { nome: 'Cebola caramelizada', unidade: 'KG', naoProduz: null }],
  ['especial', { nome: 'Molho especial', unidade: 'KG', naoProduz: null }],
  ['burger', { nome: 'Burger', unidade: 'UN', naoProduz: 'Só se produz pré-preparo: escolha um dos pré-preparos.' }],
]);

describe('3.2 · juntar as linhas do rascunho', () => {
  it('a mesma ficha duas vezes soma, na ordem da primeira aparição', () => {
    const r = juntarLinhas(
      [
        { fichaId: 'molho', quantidade: '2' },
        { fichaId: 'cebola', quantidade: '2' },
        { fichaId: 'molho', quantidade: '3,5' },
      ],
      FICHAS,
    );
    expect(r.erros).toEqual({});
    expect(r.linhas.map((l) => [l.fichaId, l.quantidadeMilesimos, l.juntou, l.posicao])).toEqual([
      ['molho', 5500, 2, 0],
      ['cebola', 2000, 1, 1],
    ]);
  });

  it('quantidade zero, negativa, "1e9", vazia, com letra e acima de 10 mil são recusadas na linha; ficha estranha também', () => {
    for (const q of ['0', '-1', '1e9', '', 'abc', '10000,001', '99999999999', '1,2345']) {
      const r = juntarLinhas([{ fichaId: 'molho', quantidade: q }], FICHAS);
      expect(r.erros['linha:0'], q).toMatch(/Molho cheddar/);
      expect(r.linhas, q).toEqual([]);
    }
    expect(juntarLinhas([{ fichaId: 'molho', quantidade: '10000' }], FICHAS).erros).toEqual({});
    expect(juntarLinhas([{ fichaId: 'burger', quantidade: '2' }], FICHAS).erros['linha:0']).toMatch(/Só se produz pré-preparo/);
    expect(juntarLinhas([{ fichaId: 'naoexiste', quantidade: '2' }], FICHAS).erros['linha:0']).toBe('Escolha o pré-preparo.');
    expect(juntarLinhas([{ fichaId: "x'; --", quantidade: '2' }], FICHAS).erros['linha:0']).toBe('Escolha o pré-preparo.');
  });

  it('a soma que passa de 10 mil recusa a segunda linha; uma linha ruim não esconde as boas (a prévia mostra), mas há erro', () => {
    const r = juntarLinhas(
      [
        { fichaId: 'molho', quantidade: '6000' },
        { fichaId: 'molho', quantidade: '5000' },
        { fichaId: 'cebola', quantidade: '2' },
      ],
      FICHAS,
    );
    expect(r.erros['linha:1']).toMatch(/soma mais de 10\.000 kg/);
    expect(r.linhas.map((l) => l.fichaId)).toEqual(['molho', 'cebola']);
    expect(r.linhas[0].quantidadeMilesimos).toBe(6_000_000);
  });

  it('vazio e mais de 30 linhas: erro geral, nada vale', () => {
    expect(juntarLinhas([], FICHAS)).toEqual({ linhas: [], erros: { geral: 'Ponha pelo menos um pré-preparo na lista.' } });
    const trinta = Array.from({ length: 30 }, () => ({ fichaId: 'molho', quantidade: '1' }));
    expect(juntarLinhas(trinta, FICHAS).erros).toEqual({});
    const r = juntarLinhas([...trinta, { fichaId: 'molho', quantidade: '1' }], FICHAS);
    expect(r.erros.geral).toMatch(/Até 30 linhas/);
    expect(r.linhas).toEqual([]);
  });
});

describe('3.2 · comprar em embalagens, arredondando para cima', () => {
  it('a embalagem de 1 kg/1 L/1 un mostra só a quantidade; as outras mostram a conta', () => {
    expect(textoDaCompra(4, 1000, 'KG')).toBe('4 kg');
    expect(textoDaCompra(3, 1000, 'L')).toBe('3 L');
    expect(textoDaCompra(12, 1000, 'UN')).toBe('12 un');
    expect(textoDaCompra(1, 5000, 'KG')).toBe('1 × 5 kg');
    expect(textoDaCompra(2, 5000, 'KG')).toBe('2 × 5 kg (10 kg)');
    expect(textoDaCompra(2, 3000, 'KG')).toBe('2 × 3 kg (6 kg)');
    expect(textoDaCompra(3, 500, 'KG')).toBe('3 × 500 g (1,5 kg)');
  });

  it('os números da análise: cebola 3,225 kg em saco de 3 kg = 2 sacos; açúcar 200 g em 1 kg = 1 kg; cheddar 4,5 e 5,5 kg em 5 kg', () => {
    expect(compraEmEmbalagens(3225, 3000, 'KG')).toMatchObject({ embalagens: 2, totalMilesimos: 6000, texto: '2 × 3 kg (6 kg)' });
    expect(compraEmEmbalagens(200, 1000, 'KG')).toMatchObject({ embalagens: 1, texto: '1 kg' });
    expect(compraEmEmbalagens(4500, 5000, 'KG')?.texto).toBe('1 × 5 kg');
    expect(compraEmEmbalagens(5500, 5000, 'KG')?.texto).toBe('2 × 5 kg (10 kg)');
    expect(compraEmEmbalagens(2429, 3000, 'KG')?.texto).toBe('1 × 3 kg');
    // Exatamente a embalagem não sobra uma a mais.
    expect(compraEmEmbalagens(6000, 3000, 'KG')?.embalagens).toBe(2);
    expect(compraEmEmbalagens(6001, 3000, 'KG')?.embalagens).toBe(3);
  });

  it('sem falta ou sem embalagem válida não há compra', () => {
    expect(compraEmEmbalagens(0, 3000, 'KG')).toBeNull();
    expect(compraEmEmbalagens(-5, 3000, 'KG')).toBeNull();
    expect(compraEmEmbalagens(100, 0, 'KG')).toBeNull();
    expect(compraEmEmbalagens(100, Number.NaN, 'KG')).toBeNull();
  });
});

// Casa Alfa: os insumos da análise (milésimos da unidade base).
const INS = (id: string, nome: string, unidade: 'KG' | 'L' | 'UN', conteudo: number, tipo: InsumoDaConta['tipo'] = 'INGREDIENTE'): [string, InsumoDaConta] => [id, { id, nome, unidade, tipo, ativo: true, conteudoMilesimos: conteudo }];
const INSUMOS = new Map<string, InsumoDaConta>([
  INS('cheddar', 'Queijo cheddar', 'KG', 5000),
  INS('leite', 'Leite', 'L', 1000),
  INS('cebola', 'Cebola', 'KG', 3000),
  INS('acucar', 'Açúcar', 'KG', 1000),
  INS('maionese', 'Maionese', 'KG', 3000),
  INS('molho', 'Molho cheddar', 'KG', 1000, 'PRE_PREPARO'),
]);
const SALDOS = new Map<string, number>([
  ['cheddar', 3000],
  ['leite', 4000],
  ['cebola', 1200],
  ['maionese', 3000],
  ['molho', 300],
]);
const U = (insumoId: string, quantidadeMilesimos: number, de: string, grupo: UsoPrevisto['grupo'] = 'LISTA'): UsoPrevisto => ({ insumoId, quantidadeMilesimos, grupo, de });
// O rascunho do critério 1: Molho cheddar 5 kg, Cebola caramelizada 2 kg, Molho especial 2 kg.
const RASCUNHO: UsoPrevisto[] = [
  U('cheddar', 2500, 'Molho cheddar'),
  U('leite', 2500, 'Molho cheddar'),
  U('cebola', 885, 'Molho cheddar'),
  U('cebola', 3540, 'Cebola caramelizada'),
  U('acucar', 200, 'Cebola caramelizada'),
  U('molho', 800, 'Molho especial'),
  U('maionese', 1200, 'Molho especial'),
];
const conta = (usos: UsoPrevisto[], producoes: { insumoId: string; quantidadeMilesimos: number }[], saldos = SALDOS) => contaDaLista({ cadastro: INSUMOS, usos, saldos, producoes });
const de = (c: ReturnType<typeof conta>, id: string) => c.find((x) => x.insumoId === id)!;

describe('3.2 · vai usar · tem · comprar (critérios 1 a 3 da análise)', () => {
  const c = conta(RASCUNHO, [{ insumoId: 'molho', quantidadeMilesimos: 5000 }]);

  it('1 · vai usar consolidado por insumo, somando as fichas', () => {
    expect(c.map((x) => [x.nome, x.vaiUsarMilesimos])).toEqual([
      ['Açúcar', 200],
      ['Cebola', 4425],
      ['Leite', 2500],
      ['Maionese', 1200],
      ['Molho cheddar', 800],
      ['Queijo cheddar', 2500],
    ]);
    expect(de(c, 'cebola').origens.map((o) => [o.de, o.quantidadeMilesimos])).toEqual([
      ['Cebola caramelizada', 3540],
      ['Molho cheddar', 885],
    ]);
  });

  it('2 · comprar: cebola 2 sacos, açúcar 1 kg; cheddar, leite e maionese não aparecem', () => {
    expect(de(c, 'cebola').comprar).toMatchObject({ faltaMilesimos: 3225, texto: '2 × 3 kg (6 kg)' });
    expect(de(c, 'acucar').comprar).toMatchObject({ faltaMilesimos: 200, texto: '1 kg' });
    for (const id of ['cheddar', 'leite', 'maionese']) expect(de(c, id).comprar, id).toBeNull();
    expect(c.filter((x) => x.comprar).map((x) => x.nome)).toEqual(['Açúcar', 'Cebola']);
    // Açúcar sem linha de saldo = 0.
    expect(de(c, 'acucar')).toMatchObject({ temMilesimos: 0, noLivroMilesimos: 0 });
  });

  it('3 · o Molho cheddar (pré-preparo) vai para "Falta produzir", nunca para comprar; coberto pelo lote da lista', () => {
    const m = de(c, 'molho');
    expect(m.comprar).toBeNull();
    expect(m.produzir).toMatchObject({ situacao: 'COBERTO', faltaMilesimos: 0, produzMilesimos: 5000, paraFichas: ['Molho especial'] });
    expect(fraseDoCoberto(m.produzir!.paraFichas)).toBe('Produza antes de Molho especial.');
  });

  it('3 · sem o lote de Molho cheddar no rascunho: falta 0,5 kg; ao pôr, entram cheddar 250 g, leite 250 ml e cebola 89 g, e a cebola vai a 3,629 kg e compra 1 saco', () => {
    const sem = conta(
      [U('molho', 800, 'Molho especial'), U('maionese', 1200, 'Molho especial'), U('cebola', 3540, 'Cebola caramelizada'), U('acucar', 200, 'Cebola caramelizada')],
      [],
    );
    expect(de(sem, 'molho').produzir).toMatchObject({ situacao: 'FALTA', faltaMilesimos: 500, produzMilesimos: 0 });
    expect(de(sem, 'cebola').comprar?.texto).toBe('1 × 3 kg');
    // O botão põe "Molho cheddar 0,5 kg": entram os insumos DELE.
    const com = conta(
      [U('molho', 800, 'Molho especial'), U('maionese', 1200, 'Molho especial'), U('cebola', 3540, 'Cebola caramelizada'), U('acucar', 200, 'Cebola caramelizada'), U('cheddar', 250, 'Molho cheddar'), U('leite', 250, 'Molho cheddar'), U('cebola', 89, 'Molho cheddar')],
      [{ insumoId: 'molho', quantidadeMilesimos: 500 }],
    );
    expect(de(com, 'cebola')).toMatchObject({ vaiUsarMilesimos: 3629 });
    expect(de(com, 'cebola').comprar).toMatchObject({ faltaMilesimos: 2429, texto: '1 × 3 kg' });
    expect(de(com, 'cheddar').vaiUsarMilesimos).toBe(250);
    expect(de(com, 'leite').vaiUsarMilesimos).toBe(250);
    expect(de(com, 'molho').produzir).toMatchObject({ situacao: 'COBERTO', faltaMilesimos: 0 });
  });

  it('6 · o pedido do salão entra em "outros pedidos": 5 kg de cheddar somam 7,5 e pedem 1 × 5 kg; com 6 kg, 2 × 5 kg', () => {
    const salao = conta([...RASCUNHO, U('cheddar', 5000, 'Salão #12', 'OUTROS')], [{ insumoId: 'molho', quantidadeMilesimos: 5000 }]);
    expect(de(salao, 'cheddar')).toMatchObject({ vaiUsarMilesimos: 7500, daListaMilesimos: 2500, deOutrosMilesimos: 5000 });
    expect(de(salao, 'cheddar').comprar).toMatchObject({ faltaMilesimos: 4500, texto: '1 × 5 kg' });
    expect(de(salao, 'cheddar').origens.map((o) => [o.grupo, o.de])).toEqual([
      ['LISTA', 'Molho cheddar'],
      ['OUTROS', 'Salão #12'],
    ]);
    const seis = conta([...RASCUNHO, U('cheddar', 6000, 'Salão #12', 'OUTROS')], []);
    expect(de(seis, 'cheddar').comprar).toMatchObject({ faltaMilesimos: 5500, texto: '2 × 5 kg (10 kg)' });
  });

  it('7 · entrega parcial: o saldo caiu e a falta caiu, então comprar continua o mesmo (sem contar duas vezes)', () => {
    // Estoquista entregou 885 g de cebola do lote: tem 1,2 − 0,885 = 0,315; a falta do lote de molho zerou (some dos usos).
    const parcial = contaDaLista({
      cadastro: INSUMOS,
      usos: RASCUNHO.filter((u) => !(u.insumoId === 'cebola' && u.de === 'Molho cheddar')),
      saldos: new Map(SALDOS).set('cebola', 315),
      producoes: [],
    });
    expect(de(parcial, 'cebola')).toMatchObject({ vaiUsarMilesimos: 3540, temMilesimos: 315 });
    expect(de(parcial, 'cebola').comprar).toMatchObject({ faltaMilesimos: 3225, texto: '2 × 3 kg (6 kg)' });
  });

  it('saldo negativo no livro conta 0 e fica visível para o alarme', () => {
    const neg = conta([U('cheddar', 2500, 'Molho cheddar')], [], new Map([['cheddar', -1500]]));
    expect(de(neg, 'cheddar')).toMatchObject({ temMilesimos: 0, noLivroMilesimos: -1500 });
    expect(de(neg, 'cheddar').comprar).toMatchObject({ faltaMilesimos: 2500, texto: '1 × 5 kg' });
  });

  it('o que já está no estoque cobre: "tem" pelo menos o "vai usar" não compra nem pede produção', () => {
    const ok = conta([U('cheddar', 3000, 'X'), U('molho', 300, 'Y')], []);
    expect(de(ok, 'cheddar').comprar).toBeNull();
    expect(de(ok, 'molho').produzir).toMatchObject({ situacao: 'TEM', faltaMilesimos: 0 });
  });

  it('pré-preparo que falta e a lista produz menos que o necessário: falta só a diferença', () => {
    const p = conta([U('molho', 3000, 'Molho especial')], [{ insumoId: 'molho', quantidadeMilesimos: 1000 }]);
    expect(de(p, 'molho').produzir).toMatchObject({ situacao: 'FALTA', faltaMilesimos: 1700, produzMilesimos: 1000 });
  });

  it('uso zero ou negativo e insumo desconhecido não entram', () => {
    expect(conta([U('cheddar', 0, 'X'), U('cheddar', -5, 'Y'), U('fantasma', 100, 'Z')], [])).toEqual([]);
  });
});

describe('3.2 · o dinheiro da compra (critério 4)', () => {
  // Cebola: saco de 3 kg a R$ 15,00 = 500 centavos por kg; açúcar: 1 kg a R$ 5,00.
  const CUSTOS = new Map<string, Fracao | null>([
    ['cebola', { num: 500n, den: 1n }],
    ['acucar', { num: 500n, den: 1n }],
    ['sem', null],
  ]);

  it('cebola R$ 30,00 + açúcar R$ 5,00 = R$ 35,00', () => {
    const v = valorDaCompra(
      [
        { insumoId: 'cebola', nome: 'Cebola', totalMilesimos: 6000 },
        { insumoId: 'acucar', nome: 'Açúcar', totalMilesimos: 1000 },
      ],
      CUSTOS,
    );
    expect(v.totalCentavos).toBe(3500);
    expect(v.semPreco).toEqual([]);
    expect(v.porInsumo.get('cebola')).toBe(3000);
  });

  it('insumo sem preço fica de fora do total e é dito: nunca R$ 0,00', () => {
    const v = valorDaCompra(
      [
        { insumoId: 'acucar', nome: 'Açúcar', totalMilesimos: 1000 },
        { insumoId: 'sem', nome: 'Sal', totalMilesimos: 1000 },
        { insumoId: 'desconhecido', nome: 'Pimenta', totalMilesimos: 1000 },
      ],
      CUSTOS,
    );
    expect(v.totalCentavos).toBe(500);
    expect(v.semPreco).toEqual(['Sal', 'Pimenta']);
    expect(v.porInsumo.has('sem')).toBe(false);
  });

  it('um arredondamento por item (metade para cima), somados em centavos inteiros', () => {
    // 0,35 centavo por un (7/20): 3 un = 1,05 → 1; 5 un = 1,75 → 2; 3,5 centavos por un: 3 un = 10,5 → 11 (metade para cima).
    const um = (num: bigint, den: bigint, total: number) => valorDaCompra([{ insumoId: 'a', nome: 'A', totalMilesimos: total }], new Map<string, Fracao | null>([['a', { num, den }]])).totalCentavos;
    expect(um(7n, 2n, 3000)).toBe(11);
    expect(um(7n, 20n, 3000)).toBe(1);
    expect(um(7n, 20n, 5000)).toBe(2);
    // Dois itens de 1,4 centavo: cada um arredonda sozinho (1 + 1 = 2), não a soma exata (2,8 → 3).
    const dois = valorDaCompra(
      [
        { insumoId: 'a', nome: 'A', totalMilesimos: 4000 },
        { insumoId: 'b', nome: 'B', totalMilesimos: 4000 },
      ],
      new Map<string, Fracao | null>([
        ['a', { num: 7n, den: 20n }],
        ['b', { num: 7n, den: 20n }],
      ]),
    );
    expect(dois.totalCentavos).toBe(2);
    expect(formatarFracao({ num: 3500n, den: 1n })).toMatch(/35,00/);
  });
});

describe('3.2 · frases', () => {
  it('lote que já existe no dia avisa e diz que o novo é um lote novo', () => {
    expect(avisoDoLoteJaExistente([])).toBeNull();
    expect(avisoDoLoteJaExistente([{ codigoLote: '261018-03', quantidade: '5 kg' }])).toBe('Já tem o lote 261018-03 de 5 kg neste dia: confirmar cria um lote novo.');
    expect(avisoDoLoteJaExistente([{ codigoLote: '261018-01', quantidade: '2 kg' }, { codigoLote: '261018-03', quantidade: '5 kg' }])).toBe('Já tem os lotes 261018-01 de 2 kg e 261018-03 de 5 kg neste dia: confirmar cria um lote novo.');
  });

  it('o coberto diz antes de quem produzir', () => {
    expect(fraseDoCoberto([])).toBe('A lista do dia já produz o que falta.');
    expect(fraseDoCoberto(['A', 'B'])).toBe('Produza antes de A e B.');
    expect(fraseDoCoberto(['A', 'B', 'C'])).toBe('Produza antes de A, B e C.');
  });
});
