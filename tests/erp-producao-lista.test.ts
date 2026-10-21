/**
 * ERP 3.2 · a lista do dia — regras PURAS (sem banco): a conta "vai usar / tem / comprar" pela receita bruta (o mesmo
 * arredondamento da requisição do lote), a cascata dos pré-preparos (o que tem, o que a lista produz, o que falta e a receita
 * dele até o fundo), as unidades, o saldo negativo (alarme que entra na conta), a loja sem saldo (frase, nunca 0), a linha que
 * virou lote (só o que falta sair) e a concluída (nada), a embalagem padrão, o círculo forçado, o custo estimado exato, a
 * leitura do formulário, o dia e as frases.
 */
import { describe, expect, it } from 'vitest';
import {
  contaDaLista,
  custoDaCompra,
  DIAS_A_FRENTE_DA_LISTA,
  diaDaLista,
  estadoDaLinha,
  fraseSemSaldo,
  lerLinhasDaLista,
  linhaEditavel,
  motivoDoDia,
  nomeDaLista,
  quantidadeComSinal,
  resumoDaConta,
  rotuloDoDia,
  textoDaProducao,
  textoDasEmbalagens,
  textoDosLotes,
  TETO_DA_LINHA,
  type FichaDaConta,
  type FichaEscolhivel,
  type InsumoDaConta,
  type ProducaoDoDia,
  type SaldoDaLoja,
} from '@/lib/erp/producao-lista-campos';
import { TETO_DA_QUANTIDADE_DA_FICHA } from '@/lib/erp/requisicao';
import { DIAS_A_FRENTE, quantidadesDaFicha } from '@/lib/erp/requisicao-campos';
import { centavosDaFracao, formatarFracao, type Fracao, type Unidade } from '@/lib/erp/unidades';

const reais = (f: Fracao) => formatarFracao(f).replace(/ /g, ' ');
const porKg = (centavos: number): Fracao => ({ num: BigInt(centavos), den: 1n });

// ---------------------------------------------------------------- o cenário (o molho cheddar da 3.1 e uma base de cebola)

const ins = (id: string, nome: string, unidade: Unidade, extra: Partial<InsumoDaConta> = {}): InsumoDaConta => ({ id, nome, unidade, ativo: true, conteudoMilesimos: 1000, fichaQueProduzId: null, ...extra });
const item = (insumoId: string | null, quantidadeMilesimos: number, fator = 1000, subfichaId: string | null = null) => ({ insumoId, subfichaId, quantidadeMilesimos, fatorCorrecaoMilesimos: fator });
const ficha = (id: string, nome: string, rendimentoMilesimos: number, insumoProduzidoId: string, itens: FichaDaConta['itens'], extra: Partial<FichaDaConta> = {}): FichaDaConta => ({ id, nome, ativa: true, rendimentoMilesimos, unidade: 'KG', insumoProduzidoId, itens, ...extra });

const INSUMOS = new Map<string, InsumoDaConta>(
  [
    ins('cheddar', 'Queijo cheddar', 'KG', { conteudoMilesimos: 5000 }),
    ins('leite', 'Leite', 'L'),
    ins('cebola', 'Cebola', 'KG'),
    ins('oleo', 'Óleo', 'L', { conteudoMilesimos: 900 }),
    ins('pao', 'Pão', 'UN', { conteudoMilesimos: 12000 }),
    ins('i-molho', 'Molho cheddar', 'KG', { fichaQueProduzId: 'molho' }),
    ins('i-base', 'Base de cebola', 'KG', { fichaQueProduzId: 'base' }),
    ins('i-especial', 'Molho especial', 'KG', { fichaQueProduzId: 'especial' }),
  ].map((i) => [i.id, i]),
);

// Molho cheddar: rende 2 kg; cheddar 1 kg, leite 1 L, cebola 300 g limpos com fator 1,18 (5 kg pedem 2,5 kg · 2,5 L · 885 g).
const MOLHO = ficha('molho', 'Molho cheddar', 2000, 'i-molho', [item('cheddar', 1000), item('leite', 1000), item('cebola', 300, 1180)]);
// Base de cebola: rende 1 kg; cebola 1 kg limpo (fator 1,18) e óleo 100 ml.
const BASE = ficha('base', 'Base de cebola', 1000, 'i-base', [item('cebola', 1000, 1180), item('oleo', 100)]);
// Molho especial: rende 2 kg; cheddar 1 kg e 500 g da base (pré-preparo dentro do pré-preparo).
const ESPECIAL = ficha('especial', 'Molho especial', 2000, 'i-especial', [item('cheddar', 1000), item(null, 500, 1000, 'base')]);
const FICHAS = new Map([MOLHO, BASE, ESPECIAL].map((f) => [f.id, f]));

const naLista = (fichaId: string, q: number, extra: Partial<ProducaoDoDia> = {}): ProducaoDoDia => {
  const f = FICHAS.get(fichaId)!;
  return { nome: f.nome, fichaId, insumoProduzidoId: f.insumoProduzidoId, quantidadeMilesimos: q, estado: 'NA_LISTA', ...extra };
};
const saldo = (s: Record<string, number>): SaldoDaLoja => ({ apurado: true, saldos: new Map(Object.entries(s)) });
const linhaDe = (c: ReturnType<typeof contaDaLista>, id: string) => c.materiaPrima.find((i) => i.insumoId === id);
const preparoDe = (c: ReturnType<typeof contaDaLista>, id: string) => c.preparos.find((i) => i.insumoId === id);

describe('ERP 3.2 · a conta da lista do dia: vai usar / tem / comprar', () => {
  it('5 kg de molho cheddar: vai usar pela receita BRUTA (2,5 kg · 2,5 L · 885 g, o mesmo que a requisição do lote pede); comprar = vai usar − tem; o que dá vem depois do que falta', () => {
    const c = contaDaLista({ producao: [naLista('molho', 5000)], fichas: FICHAS, cadastro: INSUMOS, saldo: saldo({ cheddar: 20000, leite: 2000, cebola: 10000 }) });
    expect(c.apurado).toBe(true);
    expect(c.materiaPrima.map((i) => [i.nome, i.vaiUsarMilesimos, i.temMilesimos, i.comprarMilesimos, i.unidade])).toEqual([
      ['Leite', 2500, 2000, 500, 'L'],
      ['Cebola', 885, 10000, 0, 'KG'],
      ['Queijo cheddar', 2500, 20000, 0, 'KG'],
    ]);
    // A mesma conta da requisição do lote (1.8/3.1): quando a linha vira lote, o "vai usar" não muda.
    const req = quantidadesDaFicha(MOLHO, MOLHO.itens, 5000);
    expect(Object.fromEntries(req.itens.map((i) => [i.insumoId, i.quantidadeMilesimos]))).toEqual({ cheddar: 2500, leite: 2500, cebola: 885 });
    expect(linhaDe(c, 'leite')!.deOnde).toEqual(['Molho cheddar']);
    expect(c.resumo).toEqual({ faltaComprar: 1, da: 2, negativos: 0, faltaProduzir: 0 });
    expect(resumoDaConta(c.resumo)).toBe('1 insumo falta · 2 dão');
    expect(c.preparos).toEqual([]);
    expect(c.avisos).toEqual([]);
  });

  it('a unidade vai junto e não se converte: leite em L/ml, pão em un; a embalagem padrão só aparece com conteúdo declarado (caixa de 5 kg, fardo de 12 un), nunca para 1 kg/1 L', () => {
    const PAO = ficha('pao-f', 'Pão recheado', 10000, 'i-pao-f', [item('pao', 10000)], { unidade: 'UN' });
    const fichas = new Map([...FICHAS, [PAO.id, PAO]]);
    const insumos = new Map([...INSUMOS, ['i-pao-f', ins('i-pao-f', 'Pão recheado', 'UN', { fichaQueProduzId: 'pao-f' })]]);
    const c = contaDaLista({ producao: [naLista('molho', 5000), { nome: 'Pão recheado', fichaId: 'pao-f', insumoProduzidoId: 'i-pao-f', quantidadeMilesimos: 30000, estado: 'NA_LISTA' }], fichas, cadastro: insumos, saldo: saldo({ cheddar: 100, leite: 0, pao: 5000 }) });
    const cheddar = linhaDe(c, 'cheddar')!;
    expect(cheddar.comprarMilesimos).toBe(2400);
    expect(cheddar.embalagens).toEqual({ quantas: 1, conteudoMilesimos: 5000 });
    expect(textoDasEmbalagens(cheddar.embalagens!, 'KG')).toBe('1 embalagem de 5 kg');
    expect(linhaDe(c, 'leite')!.embalagens).toBeNull();
    const pao = linhaDe(c, 'pao')!;
    expect([pao.vaiUsarMilesimos, pao.temMilesimos, pao.comprarMilesimos, pao.unidade]).toEqual([30000, 5000, 25000, 'UN']);
    expect(textoDasEmbalagens(pao.embalagens!, 'UN')).toBe('3 embalagens de 12 un');
  });

  it('saldo NEGATIVO é alarme, não trava: entra na conta como está (cebola −200 g → comprar 1,085 kg) e marca a linha', () => {
    const c = contaDaLista({ producao: [naLista('molho', 5000)], fichas: FICHAS, cadastro: INSUMOS, saldo: saldo({ cheddar: 20000, leite: 9000, cebola: -200 }) });
    const cebola = linhaDe(c, 'cebola')!;
    expect([cebola.temMilesimos, cebola.comprarMilesimos, cebola.negativo]).toEqual([-200, 1085, true]);
    expect(quantidadeComSinal(cebola.temMilesimos!, 'KG')).toBe('−200 g');
    expect(c.resumo.negativos).toBe(1);
    expect(resumoDaConta(c.resumo)).toBe('1 insumo falta · 2 dão · 1 abaixo de zero no livro');
  });

  it('loja SEM saldo apurado: o "tem" e o "comprar" são nulos (a frase do motivo), nunca 0; sem cascata', () => {
    const motivo = fraseSemSaldo('NAO_ABERTO', 'Vila da Penha');
    const c = contaDaLista({ producao: [naLista('especial', 4000)], fichas: FICHAS, cadastro: INSUMOS, saldo: { apurado: false, motivo } });
    expect(c.apurado).toBe(false);
    expect(c.motivoSemSaldo).toBe(motivo);
    expect(motivo).toMatch(/ainda não foi aberto: não há saldo para cruzar/);
    expect(fraseSemSaldo('EM_CONTAGEM', 'Vila da Penha')).toMatch(/contagem de abertura/);
    for (const i of c.materiaPrima) expect([i.temMilesimos, i.comprarMilesimos, i.embalagens]).toEqual([null, null, null]);
    // A base entra só como "vai usar" (sem saber o que tem, não há o que cascatear).
    expect(preparoDe(c, 'i-base')).toMatchObject({ vaiUsarMilesimos: 1000, temMilesimos: null, faltaProduzirMilesimos: null });
    expect(linhaDe(c, 'cebola')).toBeUndefined();
    expect(c.resumo).toEqual({ faltaComprar: 0, da: 0, negativos: 0, faltaProduzir: 0 });
  });
});

describe('ERP 3.2 · a cascata dos pré-preparos', () => {
  it('molho especial 4 kg usa 1 kg de base; tem 200 g → falta produzir 800 g, que entra pela receita da base (cebola 944 g, óleo 80 ml), dita "o que falta"', () => {
    const c = contaDaLista({ producao: [naLista('especial', 4000)], fichas: FICHAS, cadastro: INSUMOS, saldo: saldo({ cheddar: 1000, 'i-base': 200, cebola: 500 }) });
    expect(preparoDe(c, 'i-base')).toEqual({
      insumoId: 'i-base',
      fichaId: 'base',
      nome: 'Base de cebola',
      unidade: 'KG',
      vaiUsarMilesimos: 1000,
      temMilesimos: 200,
      naListaMilesimos: 0,
      faltaProduzirMilesimos: 800,
      negativo: false,
      semFicha: false,
      deOnde: ['Molho especial'],
    });
    expect(c.materiaPrima.map((i) => [i.nome, i.vaiUsarMilesimos, i.temMilesimos, i.comprarMilesimos])).toEqual([
      ['Cebola', 944, 500, 444],
      ['Óleo', 80, 0, 80],
      ['Queijo cheddar', 2000, 1000, 1000],
    ]);
    expect(linhaDe(c, 'cebola')!.deOnde).toEqual(['Base de cebola (o que falta)']);
    expect(linhaDe(c, 'oleo')!.embalagens).toEqual({ quantas: 1, conteudoMilesimos: 900 });
    expect(c.resumo.faltaProduzir).toBe(1);
  });

  it('a base também na lista (500 g): primeiro o que tem, depois o que a lista produz; a cascata cobre só os 300 g que ainda faltam (a cebola total é a mesma, 944 g)', () => {
    const c = contaDaLista({ producao: [naLista('especial', 4000), naLista('base', 500)], fichas: FICHAS, cadastro: INSUMOS, saldo: saldo({ 'i-base': 200 }) });
    expect(preparoDe(c, 'i-base')).toMatchObject({ vaiUsarMilesimos: 1000, temMilesimos: 200, naListaMilesimos: 500, faltaProduzirMilesimos: 300 });
    expect(linhaDe(c, 'cebola')).toMatchObject({ vaiUsarMilesimos: 590 + 354, deOnde: ['Base de cebola', 'Base de cebola (o que falta)'] });
    expect(linhaDe(c, 'oleo')!.vaiUsarMilesimos).toBe(50 + 30);
    // Com a base inteira na lista (800 g), não falta nada para produzir e não há cascata.
    const d = contaDaLista({ producao: [naLista('especial', 4000), naLista('base', 800)], fichas: FICHAS, cadastro: INSUMOS, saldo: saldo({ 'i-base': 200 }) });
    expect(preparoDe(d, 'i-base')!.faltaProduzirMilesimos).toBe(0);
    expect(linhaDe(d, 'cebola')).toMatchObject({ vaiUsarMilesimos: 944, deOnde: ['Base de cebola'] });
  });

  it('três níveis (A usa B, B usa C): o que falta de B entra pela receita dele, e o que falta de C pela dele, até o fundo, com o fator', () => {
    const C = ficha('c', 'Tempero', 1000, 'i-c', [item('sal', 10)]);
    const B = ficha('b', 'Massa', 1000, 'i-b', [item(null, 200, 1000, 'c'), item('farinha', 800, 1250)]);
    const A = ficha('a', 'Recheio', 1000, 'i-a', [item(null, 500, 1000, 'b'), item('leite', 500)]);
    const fichas = new Map([A, B, C].map((f) => [f.id, f]));
    const insumos = new Map(
      [
        ins('sal', 'Sal', 'KG'),
        ins('farinha', 'Farinha', 'KG'),
        ins('leite', 'Leite', 'L'),
        ins('i-a', 'Recheio', 'KG', { fichaQueProduzId: 'a' }),
        ins('i-b', 'Massa', 'KG', { fichaQueProduzId: 'b' }),
        ins('i-c', 'Tempero', 'KG', { fichaQueProduzId: 'c' }),
      ].map((i) => [i.id, i]),
    );
    const c = contaDaLista({ producao: [{ nome: 'Recheio', fichaId: 'a', insumoProduzidoId: 'i-a', quantidadeMilesimos: 2000, estado: 'NA_LISTA' }], fichas, cadastro: insumos, saldo: saldo({}) });
    expect(c.preparos.map((x) => [x.nome, x.vaiUsarMilesimos, x.faltaProduzirMilesimos])).toEqual([
      ['Massa', 1000, 1000],
      ['Tempero', 200, 200],
    ]);
    // Farinha: 800 g limpos com fator 1,25 por kg de massa = 1 kg bruto; sal: 10 g por kg de tempero × 0,2 kg = 2 g.
    expect(c.materiaPrima.map((i) => [i.nome, i.vaiUsarMilesimos, i.comprarMilesimos])).toEqual([
      ['Farinha', 1000, 1000],
      ['Leite', 1000, 1000],
      ['Sal', 2, 2],
    ]);
  });

  it('círculo forçado no banco (A usa B, B usa A): a conta não entra em laço, avisa e não cascateia', () => {
    const A = ficha('a', 'Alfa', 1000, 'i-a', [item(null, 100, 1000, 'b'), item('leite', 100)]);
    const B = ficha('b', 'Beta', 1000, 'i-b', [item(null, 100, 1000, 'a')]);
    const insumos = new Map([ins('leite', 'Leite', 'L'), ins('i-a', 'Alfa', 'KG', { fichaQueProduzId: 'a' }), ins('i-b', 'Beta', 'KG', { fichaQueProduzId: 'b' })].map((i) => [i.id, i]));
    const c = contaDaLista({ producao: [{ nome: 'Alfa', fichaId: 'a', insumoProduzidoId: 'i-a', quantidadeMilesimos: 1000, estado: 'NA_LISTA' }], fichas: new Map([A, B].map((f) => [f.id, f])), cadastro: insumos, saldo: saldo({}) });
    expect(c.avisos.join(' ')).toMatch(/círculo de pré-preparos/);
    expect(preparoDe(c, 'i-b')).toMatchObject({ vaiUsarMilesimos: 100, faltaProduzirMilesimos: 100 });
    expect(linhaDe(c, 'leite')!.vaiUsarMilesimos).toBe(100);
  });

  it('pré-preparo com a ficha desativada: o que falta dele fica fora da compra, com o aviso; a linha da lista com a ficha desativada fica fora da conta', () => {
    const fichas = new Map(FICHAS);
    fichas.set('base', { ...BASE, ativa: false });
    const c = contaDaLista({ producao: [naLista('especial', 4000)], fichas, cadastro: INSUMOS, saldo: saldo({}) });
    expect(preparoDe(c, 'i-base')).toMatchObject({ faltaProduzirMilesimos: 1000, semFicha: true });
    expect(linhaDe(c, 'cebola')).toBeUndefined();
    expect(c.avisos.join(' ')).toMatch(/Base de cebola está desativada: o que falta dele não entra na conta de compra/);
    const d = contaDaLista({ producao: [naLista('base', 1000)], fichas, cadastro: INSUMOS, saldo: saldo({}) });
    expect(d.materiaPrima).toEqual([]);
    expect(d.avisos.join(' ')).toMatch(/A ficha de Base de cebola está desativada/);
  });

  it('insumo desativado sai da conta (a requisição do lote também o deixa de fora), com o aviso', () => {
    const insumos = new Map(INSUMOS);
    insumos.set('leite', { ...INSUMOS.get('leite')!, ativo: false });
    const c = contaDaLista({ producao: [naLista('molho', 5000)], fichas: FICHAS, cadastro: insumos, saldo: saldo({}) });
    expect(linhaDe(c, 'leite')).toBeUndefined();
    expect(c.avisos).toEqual(['Leite está desativado: fica fora da requisição e da conta (receita de Molho cheddar).']);
  });
});

describe('ERP 3.2 · a linha que virou lote: sem segunda baixa na conta', () => {
  it('lote planejado/em produção conta só o que ainda falta SAIR pela requisição (o que saiu já está no saldo) e o que ele vai produzir; concluído não conta nada', () => {
    const emLote = naLista('molho', 5000, { estado: 'EM_LOTE', aSair: new Map([['cebola', 885], ['leite', 0]]) });
    // Cheddar e leite já saíram (o saldo caiu); falta sair só a cebola.
    const c = contaDaLista({ producao: [emLote], fichas: FICHAS, cadastro: INSUMOS, saldo: saldo({ cheddar: 17500, leite: 0, cebola: 500 }) });
    expect(c.materiaPrima.map((i) => [i.nome, i.vaiUsarMilesimos, i.comprarMilesimos])).toEqual([['Cebola', 885, 385]]);
    const feita = contaDaLista({ producao: [naLista('molho', 5000, { estado: 'FEITA' })], fichas: FICHAS, cadastro: INSUMOS, saldo: saldo({}) });
    expect(feita.materiaPrima).toEqual([]);
    // O lote do dia que ainda não ficou pronto conta como produção da lista para quem usa o molho.
    const usaMolho = ficha('x', 'Burger sauce', 1000, 'i-x', [item(null, 1000, 1000, 'molho')]);
    const fichas = new Map([...FICHAS, ['x', usaMolho]]);
    const insumos = new Map([...INSUMOS, ['i-x', ins('i-x', 'Burger sauce', 'KG', { fichaQueProduzId: 'x' })]]);
    const d = contaDaLista({ producao: [emLote, { nome: 'Burger sauce', fichaId: 'x', insumoProduzidoId: 'i-x', quantidadeMilesimos: 3000, estado: 'NA_LISTA' }], fichas, cadastro: insumos, saldo: saldo({ 'i-molho': 0, cebola: 2000 }) });
    expect(preparoDe(d, 'i-molho')).toMatchObject({ vaiUsarMilesimos: 3000, naListaMilesimos: 5000, faltaProduzirMilesimos: 0 });
  });

  it('o insumo que o lote do dia já tirou e ficou ABAIXO DE ZERO continua na conta (vai usar 0, comprar = o buraco): entregar não faz o "comprar" sumir', () => {
    // Antes de entregar: o lote pede 2,5 L de leite e o livro tem 2 L → comprar 500 ml.
    const antes = contaDaLista({ producao: [naLista('molho', 5000, { estado: 'EM_LOTE', aSair: new Map([['leite', 2500]]) })], fichas: FICHAS, cadastro: INSUMOS, saldo: saldo({ leite: 2000 }) });
    expect(linhaDe(antes, 'leite')).toMatchObject({ vaiUsarMilesimos: 2500, temMilesimos: 2000, comprarMilesimos: 500 });
    // Entregue (confirmado com o livro abaixo de zero): nada mais a sair, o livro em −500 ml → comprar continua 500 ml.
    const depois = contaDaLista({ producao: [naLista('molho', 5000, { estado: 'EM_LOTE', aSair: new Map([['leite', 0]]) })], fichas: FICHAS, cadastro: INSUMOS, saldo: saldo({ leite: -500 }) });
    expect(linhaDe(depois, 'leite')).toMatchObject({ vaiUsarMilesimos: 0, temMilesimos: -500, comprarMilesimos: 500, negativo: true, deOnde: ['Molho cheddar'] });
    // Lote concluído também deixa à vista o negativo do que ele tirou; com o saldo em dia, a linha some.
    const feita = contaDaLista({ producao: [naLista('molho', 5000, { estado: 'FEITA', tocados: ['leite', 'cebola'] })], fichas: FICHAS, cadastro: INSUMOS, saldo: saldo({ leite: -500, cebola: 300 }) });
    expect(feita.materiaPrima.map((i) => [i.nome, i.vaiUsarMilesimos, i.comprarMilesimos])).toEqual([['Leite', 0, 500]]);
    // Sem saldo apurado não há negativo para mostrar.
    const semSaldo = contaDaLista({ producao: [naLista('molho', 5000, { estado: 'FEITA', tocados: ['leite'] })], fichas: FICHAS, cadastro: INSUMOS, saldo: { apurado: false, motivo: 'x' } });
    expect(semSaldo.materiaPrima).toEqual([]);
  });

  it('o estado da linha: sem lote ou com o lote cancelado = na lista (editável); planejado ou em produção = em lote; concluído = feita', () => {
    expect(estadoDaLinha(null)).toBe('NA_LISTA');
    expect(estadoDaLinha({ status: 'CANCELADA' })).toBe('NA_LISTA');
    expect(estadoDaLinha({ status: 'PLANEJADA' })).toBe('EM_LOTE');
    expect(estadoDaLinha({ status: 'EM_EXECUCAO' })).toBe('EM_LOTE');
    expect(estadoDaLinha({ status: 'CONCLUIDA' })).toBe('FEITA');
    expect([linhaEditavel('NA_LISTA'), linhaEditavel('EM_LOTE'), linhaEditavel('FEITA')]).toEqual([true, false, false]);
  });
});

describe('ERP 3.2 · o custo estimado da compra (só para quem vê custos)', () => {
  it('falta × último preço, em fração exata; insumo sem preço deixa o total incompleto (dito), nunca R$ 0,00 para ele', () => {
    const c = contaDaLista({ producao: [naLista('molho', 5000)], fichas: FICHAS, cadastro: INSUMOS, saldo: saldo({ cheddar: 0, leite: 2000, cebola: 0 }) });
    // Cheddar R$ 40,00/kg × 2,5 kg = R$ 100,00; leite R$ 5,00/L × 500 ml = R$ 2,50; cebola sem preço.
    const r = custoDaCompra(c.materiaPrima, new Map<string, Fracao | null>([['cheddar', porKg(4000)], ['leite', porKg(500)], ['cebola', null]]));
    expect(reais(r.total)).toBe('R$ 102,50');
    expect(centavosDaFracao(r.total)).toBe(10250n);
    expect(r.semPreco).toEqual(['Cebola']);
    expect(r.porInsumo.get('cebola')).toBeNull();
    expect(reais(r.porInsumo.get('leite')!)).toBe('R$ 2,50');
    // O que dá (comprar 0) não entra.
    const d = contaDaLista({ producao: [naLista('molho', 5000)], fichas: FICHAS, cadastro: INSUMOS, saldo: saldo({ cheddar: 99000, leite: 99000, cebola: 99000 }) });
    expect(custoDaCompra(d.materiaPrima, new Map()).porInsumo.size).toBe(0);
  });

  it('um centavo exato no fim, sem arredondar no caminho: 333 g a R$ 0,10/kg', () => {
    const r = custoDaCompra([{ insumoId: 'sal', nome: 'Sal', comprarMilesimos: 333 }], new Map([['sal', porKg(10)]]));
    expect(r.total).toEqual({ num: 333n, den: 100n });
    expect(reais(r.total)).toBe('R$ 0,03');
    // Abaixo de 1 centavo, as casas que precisar (nunca "R$ 0,00" com preço).
    const pouco = custoDaCompra([{ insumoId: 'sal', nome: 'Sal', comprarMilesimos: 33 }], new Map([['sal', porKg(10)]]));
    expect(reais(pouco.total)).toBe('R$ 0,0033');
  });
});

describe('ERP 3.2 · ler o formulário da lista', () => {
  const ESCOLHA = new Map<string, FichaEscolhivel>([
    ['molho', { id: 'molho', nome: 'Molho cheddar', unidade: 'KG' }],
    ['base', { id: 'base', nome: 'Base de cebola', unidade: 'KG' }],
    ['caldo', { id: 'caldo', nome: 'Caldo', unidade: 'L' }],
    ['pao', { id: 'pao', nome: 'Pão', unidade: 'UN' }],
  ]);
  const ler = (linhas: [string, string, string][]) => lerLinhasDaLista({ linhaIds: linhas.map((l) => l[0]), fichaIds: linhas.map((l) => l[1]), quantidades: linhas.map((l) => l[2]) }, ESCOLHA);

  it('lê a quantidade na unidade do rendimento ("1,5" kg, "2" L, "30" un), guarda o id da linha que já existia e pula a linha vazia', () => {
    expect(ler([['l1', 'molho', '1,5'], ['', '', ''], ['', 'caldo', '2'], ['', 'pao', '30']])).toEqual({
      ok: true,
      linhas: [
        { id: 'l1', fichaId: 'molho', nome: 'Molho cheddar', unidade: 'KG', quantidadeMilesimos: 1500 },
        { id: null, fichaId: 'caldo', nome: 'Caldo', unidade: 'L', quantidadeMilesimos: 2000 },
        { id: null, fichaId: 'pao', nome: 'Pão', unidade: 'UN', quantidadeMilesimos: 30000 },
      ],
    });
    expect(ler([])).toEqual({ ok: true, linhas: [] });
  });

  it('recusa com a frase na linha (contando as vazias): sem pré-preparo, pré-preparo indisponível, número inválido, zero, ponto no lugar da vírgula, acima de 10 mil e repetido', () => {
    const r = ler([['', '', '2'], ['', 'outro', '1'], ['', 'molho', 'dois'], ['', 'base', '0'], ['', 'caldo', '10000,001'], ['', 'molho', '3'], ['', 'pao', '']]);
    expect(r).toEqual({
      ok: false,
      erros: {
        'linha:0': 'Escolha o pré-preparo.',
        'linha:1': 'Esse pré-preparo não está mais disponível (desativado ou sem ficha ativa): escolha outro.',
        'linha:2': 'Quanto produzir de Molho cheddar: número em kg (ex.: 2 ou 1,5).',
        'linha:3': 'Quanto produzir de Base de cebola: maior que zero.',
        'linha:4': 'Caldo: até 10.000 L numa linha.',
        'linha:6': 'Diga quanto produzir de Pão: número em un (ex.: 2 ou 1,5).',
      },
    });
    // O ponto como vírgula: a frase devolve o número escrito certo. "0,0" também é zero; "1.000" é mil (separador de milhar).
    expect(ler([['', 'molho', '2.5'], ['', 'base', '0,0'], ['', 'caldo', '1.000']])).toEqual({
      ok: false,
      erros: { 'linha:0': 'Quanto produzir de Molho cheddar: use vírgula: 2,5 kg.', 'linha:1': 'Quanto produzir de Base de cebola: maior que zero.' },
    });
    expect(ler([['', 'molho', '2'], ['', 'molho', '3']])).toEqual({ ok: false, erros: { 'linha:1': '“Molho cheddar” já está na lista: some as quantidades numa linha só.' } });
  });

  it('até 60 pré-preparos numa lista; o teto da linha é o mesmo do "quanto vai produzir" da 3.1', () => {
    const muitas = new Map<string, FichaEscolhivel>(Array.from({ length: 61 }, (_, i) => [`f${i}`, { id: `f${i}`, nome: `Ficha ${i}`, unidade: 'KG' as const }]));
    const r = lerLinhasDaLista({ linhaIds: [], fichaIds: [...muitas.keys()], quantidades: [...muitas.keys()].map(() => '1') }, muitas);
    expect(r).toEqual({ ok: false, erros: { geral: 'Até 60 pré-preparos numa lista.' } });
    expect(TETO_DA_LINHA).toBe(TETO_DA_QUANTIDADE_DA_FICHA);
    expect(DIAS_A_FRENTE_DA_LISTA).toBe(DIAS_A_FRENTE);
  });
});

describe('ERP 3.2 · o dia e as frases', () => {
  const hoje = '2026-10-21';
  it('o dia vem da URL (aaaa-mm-dd válida); o resto é hoje', () => {
    expect(diaDaLista('2026-10-22', hoje)).toBe('2026-10-22');
    expect(diaDaLista('2026-02-30', hoje)).toBe(hoje);
    expect(diaDaLista('22/10/2026', hoje)).toBe(hoje);
    expect(diaDaLista(undefined, hoje)).toBe(hoje);
    expect(diaDaLista('1999-01-01', hoje)).toBe(hoje);
  });

  it('edita de hoje a 14 dias; dia que passou é consulta', () => {
    expect(motivoDoDia(hoje, hoje)).toBeNull();
    expect(motivoDoDia('2026-11-04', hoje)).toBeNull();
    expect(motivoDoDia('2026-11-05', hoje)).toBe('A lista se monta de hoje até 14 dias à frente.');
    expect(motivoDoDia('2026-10-20', hoje)).toBe('Dia que já passou: a lista fica para consulta.');
  });

  it('o rótulo do dia diz hoje/amanhã/ontem e o dia da semana', () => {
    expect(rotuloDoDia('2026-10-21', hoje)).toBe('hoje, quarta 21/10');
    expect(rotuloDoDia('2026-10-22', hoje)).toBe('amanhã, quinta 22/10');
    expect(rotuloDoDia('2026-10-20', hoje)).toBe('ontem, terça 20/10');
    expect(rotuloDoDia('2026-10-24', hoje)).toBe('sábado 24/10');
    expect(rotuloDoDia('2025-10-24', hoje)).toBe('sexta 24/10/2025');
  });

  it('os textos do histórico: a produção do dia linha a linha (compara no Histórico) e os lotes gerados', () => {
    expect(nomeDaLista('2026-10-21', 'Vila da Penha')).toBe('Lista do dia 21/10/2026 · Vila da Penha');
    expect(textoDaProducao([{ nome: 'Molho cheddar', unidade: 'KG', quantidadeMilesimos: 5000 }, { nome: 'Base de cebola', unidade: 'KG', quantidadeMilesimos: 300 }])).toBe('Molho cheddar 5 kg · Base de cebola 300 g');
    expect(textoDaProducao([])).toBe('nada');
    expect(textoDosLotes([{ codigo: '261021-01', nome: 'Molho cheddar', unidade: 'KG', quantidadeMilesimos: 5000 }])).toBe('261021-01 Molho cheddar 5 kg');
  });
});
