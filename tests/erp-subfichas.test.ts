/**
 * ERP 1.3 · Subfichas / pré-preparos, sem banco: fator de correção (bruto ÷
 * líquido), rendimento, custo em cascata em 3 níveis EXATO (fração, um
 * arredondamento só na tela), "custo incompleto" subindo pela cascata, círculo
 * e profundidade recusados, cascata que não entra em laço, teto de exibição.
 */
import { describe, expect, it } from 'vitest';
import {
  contaDaFicha,
  custoDaFicha,
  formatarFator,
  itensEmTexto,
  lerFator,
  lerFormFicha,
  quantidadeBruta,
  type InsumoDaFicha,
  type PreparoDaFicha,
} from '@/lib/erp/ficha-campos';
import { cascataDeCusto, conferirGrafo, grafoDasArestas, PROFUNDIDADE_MAXIMA, type FichaDaCascata } from '@/lib/erp/ficha-cascata';
import { cabeNaExibicao, centavosDaFracao, formatarFracao, type Fracao } from '@/lib/erp/unidades';

const nbsp = (s: string) => s.replace(/\u00a0/g, ' ');
const igual = (f: Fracao, num: bigint, den: bigint) => expect(f.num * den).toBe(num * f.den);

const ins = (id: string, nome: string, unidade: 'KG' | 'L' | 'UN', conteudo: number, preco: number): InsumoDaFicha => ({
  id,
  nome,
  unidade,
  ativo: true,
  conteudoMilesimos: conteudo,
  precoEmbalagemCentavos: preco,
  taxaEntregaCentavos: 0,
});
const CEBOLA = ins('cebola', 'Cebola', 'KG', 1000, 500); // R$ 5,00/kg
const CHEDDAR = ins('cheddar', 'Cheddar', 'KG', 1000, 4000); // R$ 40,00/kg
const PICLES = ins('picles', 'Picles', 'KG', 1000, 0); // sem preço
const INSUMOS = new Map([CEBOLA, CHEDDAR, PICLES].map((i) => [i.id, i]));

const prep = (id: string, nome: string, unidadeRendimento: 'KG' | 'L' | 'UN', extra: Partial<PreparoDaFicha> = {}): PreparoDaFicha => ({
  id,
  nome,
  tipo: 'PRE_PREPARO',
  ativa: true,
  unidadeRendimento,
  ...extra,
});
const MOLHO = prep('molho', 'Molho cheddar', 'KG');
const CALDO = prep('caldo', 'Caldo', 'L');
const PRATO = prep('burger', 'Burger', 'UN', { tipo: 'PRATO' });
const VELHO = prep('velho', 'Molho antigo', 'KG', { ativa: false });
const PREPAROS = new Map([MOLHO, CALDO, PRATO, VELHO].map((p) => [p.id, p]));

describe('ERP 1.3 · fator de correção: bruto ÷ líquido, 1 a 10', () => {
  it('lê vírgula e ponto; vazio é 1 (sem perda)', () => {
    expect(lerFator('')).toEqual({ ok: true, milesimos: 1000 });
    expect(lerFator(undefined)).toEqual({ ok: true, milesimos: 1000 });
    expect(lerFator('1,18')).toEqual({ ok: true, milesimos: 1180 });
    expect(lerFator('1.18')).toEqual({ ok: true, milesimos: 1180 });
    expect(lerFator('2')).toEqual({ ok: true, milesimos: 2000 });
    expect(lerFator('10')).toEqual({ ok: true, milesimos: 10_000 });
  });

  it('recusa menos de 1, mais de 10, texto e 4 casas', () => {
    expect(lerFator('0,9')).toMatchObject({ ok: false, erro: expect.stringMatching(/começa em 1/) });
    expect(lerFator('10,001')).toMatchObject({ ok: false, erro: expect.stringMatching(/acima de 10/) });
    expect(lerFator('muito')).toMatchObject({ ok: false });
    expect(lerFator('1,1805')).toMatchObject({ ok: false });
  });

  it('peso bruto = líquido × fator (1 kg limpo de cebola a 1,18 = 1,18 kg comprados); formatado sem zeros', () => {
    expect(quantidadeBruta(1000, 1180)).toBe(1180);
    expect(quantidadeBruta(180, 1180)).toBe(212); // 212,4 g
    expect(quantidadeBruta(5, 1100)).toBe(6); // 5,5 g: metade para cima
    expect(formatarFator(1180)).toBe('1,18');
    expect(formatarFator(1000)).toBe('1');
  });

  it('custo do item paga o BRUTO: 100 g limpos de cebola a R$ 5,00/kg com fator 1,18 = R$ 0,59 exatos', () => {
    const c = custoDaFicha([{ nome: 'Cebola', quantidadeMilesimos: 100, fatorCorrecaoMilesimos: 1180, custo: { centavos: 500, milesimos: 1000 } }], 1000);
    igual(c.total, 59n, 1n);
    // Sem fator, o mesmo item custa R$ 0,50: o fator não é arredondado antes.
    const sem = custoDaFicha([{ nome: 'Cebola', quantidadeMilesimos: 100, fatorCorrecaoMilesimos: 1000, custo: { centavos: 500, milesimos: 1000 } }], 1000);
    igual(sem.total, 50n, 1n);
  });

  it('histórico: o fator aparece só quando há perda', () => {
    expect(
      itensEmTexto([
        { nome: 'Cebola', unidade: 'KG', quantidadeMilesimos: 100, fatorCorrecaoMilesimos: 1180 },
        { nome: 'Molho cheddar', unidade: 'KG', quantidadeMilesimos: 40, fatorCorrecaoMilesimos: 1000 },
      ]),
    ).toBe('Cebola 100 g (fator 1,18) · Molho cheddar 40 g');
  });
});

describe('ERP 1.3 · item: insumo OU pré-preparo, na unidade do rendimento dele', () => {
  const entrada = (itens: { insumoId?: string; subfichaId?: string; quantidade: string; unidade: string; fator?: string }[]) => ({
    nome: 'Burger cheddar',
    tipo: 'PRATO',
    rendimento: '1',
    itens,
  });

  it('pré-preparo em g/kg (rende em kg) e caldo em ml; fator por linha', () => {
    const r = lerFormFicha(
      entrada([
        { subfichaId: 'molho', quantidade: '40', unidade: 'g' },
        { subfichaId: 'caldo', quantidade: '0,2', unidade: 'L', fator: '1,1' },
        { insumoId: 'cebola', quantidade: '20', unidade: 'g', fator: '1,18' },
      ]),
      INSUMOS,
      new Set(),
      { preparos: PREPAROS },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados.itens).toEqual([
      { insumoId: null, subfichaId: 'molho', quantidadeMilesimos: 40, fatorCorrecaoMilesimos: 1000 },
      { insumoId: null, subfichaId: 'caldo', quantidadeMilesimos: 200, fatorCorrecaoMilesimos: 1100 },
      { insumoId: 'cebola', subfichaId: null, quantidadeMilesimos: 20, fatorCorrecaoMilesimos: 1180 },
    ]);
  });

  it('recusa prato como subficha, a própria ficha, desativado, de fora (outro parceiro), repetido, unidade errada e fator ruim', () => {
    const r = lerFormFicha(
      entrada([
        { subfichaId: 'burger', quantidade: '1', unidade: 'un' },
        { subfichaId: 'molho', quantidade: '40', unidade: 'ml' },
        { subfichaId: 'velho', quantidade: '40', unidade: 'g' },
        { subfichaId: 'de-outro-parceiro', quantidade: '40', unidade: 'g' },
        { subfichaId: 'molho', quantidade: '40', unidade: 'g' },
        { subfichaId: 'caldo', quantidade: '200', unidade: 'ml', fator: '0,5' },
        { subfichaId: 'eu', quantidade: '1', unidade: 'kg' },
      ]),
      INSUMOS,
      new Set(),
      { preparos: new Map([...PREPAROS, ['eu', prep('eu', 'Eu mesma', 'KG')]]), propriaId: 'eu' },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros['item-0']).toBe('“Burger” é prato: só pré-preparo entra em outra ficha.');
    expect(r.erros['item-1']).toBe('“Molho cheddar” rende em quilo: use g ou kg.');
    expect(r.erros['item-2']).toMatch(/desativado: reative em Fichas técnicas/);
    expect(r.erros['item-3']).toBe('Pré-preparo não encontrado neste cadastro.');
    expect(r.erros['item-4']).toMatch(/já está na ficha \(item 2\)/);
    expect(r.erros['item-5']).toMatch(/começa em 1/);
    expect(r.erros['item-6']).toBe('Uma ficha não entra nela mesma.');
  });

  it('pré-preparo desativado que JÁ estava na ficha continua aceito na edição', () => {
    const r = lerFormFicha(entrada([{ subfichaId: 'velho', quantidade: '40', unidade: 'g' }]), INSUMOS, new Set(['velho']), { preparos: PREPAROS });
    expect(r.ok).toBe(true);
  });
});

// Cascata em 3 níveis, com números escolhidos para dar frações "feias":
//   Base de tomate (rende 1 kg): 1 kg limpo de tomate a R$ 10,00/kg com fator 1,25 = R$ 12,50 → R$ 12,50/kg
//   Molho cheddar (rende 3 kg):  500 g de base (R$ 6,25) + 1 kg de cheddar (R$ 40,00) = R$ 46,25 → 4625/3 c/kg
//   Burger (1 porção):           40 g de molho (185/3 c = R$ 0,6166…) + pão R$ 1,50 = 635/3 c = R$ 2,1166… → R$ 2,12
// Somar os arredondados por linha daria 62 + 150 = 212 também, mas a conta exata é 211,666…: só a tela arredonda.
const TOMATE = { nome: 'Tomate', precoEmbalagemCentavos: 1000, taxaEntregaCentavos: 0, conteudoMilesimos: 1000 };
const QUEIJO = { nome: 'Cheddar', precoEmbalagemCentavos: 4000, taxaEntregaCentavos: 0, conteudoMilesimos: 1000 };
const PAO = { nome: 'Pão', precoEmbalagemCentavos: 150, taxaEntregaCentavos: 0, conteudoMilesimos: 1000 };
const SEM = { nome: 'Picles', precoEmbalagemCentavos: 0, taxaEntregaCentavos: 0, conteudoMilesimos: 1000 };
const item = (q: number, de: FichaDaCascata['itens'][number]['insumo'] | string, fator = 1000) => ({
  quantidadeMilesimos: q,
  fatorCorrecaoMilesimos: fator,
  insumo: typeof de === 'string' ? null : de,
  subfichaId: typeof de === 'string' ? de : null,
});
const fichas = (lista: FichaDaCascata[]) => new Map(lista.map((f) => [f.id, f]));
const BASE: FichaDaCascata = { id: 'base', nome: 'Base de tomate', rendimentoMilesimos: 1000, itens: [item(1000, TOMATE, 1250)] };
const MOLHO_C: FichaDaCascata = { id: 'molho', nome: 'Molho cheddar', rendimentoMilesimos: 3000, itens: [item(500, 'base'), item(1000, QUEIJO)] };
const BURGER: FichaDaCascata = { id: 'burger', nome: 'Burger cheddar', rendimentoMilesimos: 1000, itens: [item(40, 'molho'), item(1000, PAO)] };

describe('ERP 1.3 · custo em cascata: exato em 3 níveis, memória, incompleto que sobe', () => {
  it('3 níveis: base → molho → burger, fração exata até o fim', () => {
    const c = cascataDeCusto(fichas([BASE, MOLHO_C, BURGER]));
    igual(c.custo('base')!.porRendimento, 1250n, 1n);
    igual(c.custo('molho')!.total, 4625n, 1n);
    igual(c.custo('molho')!.porRendimento, 4625n, 3n);
    const b = c.custo('burger')!;
    igual(b.itens[0]!, 185n, 3n);
    igual(b.total, 635n, 3n);
    expect(centavosDaFracao(b.porRendimento)).toBe(212n);
    expect(nbsp(formatarFracao(b.porRendimento))).toBe('R$ 2,12');
    expect(b.faltaPreco).toEqual([]);
  });

  it('memória: cada ficha é calculada uma vez, mesmo usada por várias', () => {
    const outro: FichaDaCascata = { id: 'outro', nome: 'Outro', rendimentoMilesimos: 1000, itens: [item(10, 'molho'), item(10, 'base')] };
    const c = cascataDeCusto(fichas([BASE, MOLHO_C, BURGER, outro]));
    c.custo('burger');
    c.custo('outro');
    expect(c.calculadas()).toBe(4);
  });

  it('mudou o preço do tomate (no fundo): o burger muda junto, na hora', () => {
    const tomateNovo = { ...TOMATE, precoEmbalagemCentavos: 1200 };
    const c = cascataDeCusto(fichas([{ ...BASE, itens: [item(1000, tomateNovo, 1250)] }, MOLHO_C, BURGER]));
    // base 15,00/kg; molho = 7,50 + 40,00 = 47,50 / 3 kg; 40 g = 190/3; burger = 640/3
    igual(c.custo('burger')!.total, 640n, 3n);
  });

  it('insumo sem preço no fundo deixa molho E burger incompletos, dizendo o que falta', () => {
    const baseSem: FichaDaCascata = { ...BASE, itens: [item(1000, TOMATE, 1250), item(50, SEM)] };
    const c = cascataDeCusto(fichas([baseSem, MOLHO_C, BURGER]));
    expect(c.custo('base')!.semPreco).toEqual(['Picles']);
    expect(c.custo('molho')!.preparosIncompletos).toEqual(['Base de tomate']);
    const b = c.custo('burger')!;
    expect(b.faltaPreco).toEqual(['Picles']);
    expect(b.preparosIncompletos).toEqual(['Molho cheddar']);
    // O parcial entra (nunca vira R$ 0,00) e a frase diz de onde vem a falta.
    igual(b.total, 635n, 3n);
    expect(nbsp(contaDaFicha(b, 1000, 'UN', 'PRATO'))).toBe(
      'R$ 2,12 ÷ 1 porção = R$ 2,12 por porção, “Molho cheddar” com custo incompleto (falta preço em “Picles”).',
    );
  });

  it('círculo forçado no banco (fora da regra) não trava a conta: vira incompleto', () => {
    const a: FichaDaCascata = { id: 'a', nome: 'A', rendimentoMilesimos: 1000, itens: [item(100, 'b'), item(1000, PAO)] };
    const b: FichaDaCascata = { id: 'b', nome: 'B', rendimentoMilesimos: 1000, itens: [item(100, 'a')] };
    const c = cascataDeCusto(fichas([a, b]));
    expect(c.custo('a')!.faltaPreco).toEqual(['ciclo em “A”']);
  });

  it('teto da tela: acima de 2^53 centavos mostra "acima do limite", nunca um número errado', () => {
    const enorme = { num: 2n ** 60n, den: 1n };
    expect(cabeNaExibicao(enorme)).toBe(false);
    expect(formatarFracao(enorme)).toBe('acima do limite');
    expect(cabeNaExibicao({ num: BigInt(Number.MAX_SAFE_INTEGER), den: 1n })).toBe(true);
  });
});

describe('ERP 1.3 · grafo: círculo e profundidade recusados', () => {
  const nomes: Record<string, string> = { a: 'Molho A', b: 'Base B', c: 'Tempero C', d: 'D', e: 'E', f: 'F', p: 'Prato' };
  const nome = (id: string) => nomes[id] ?? id;

  it('A usa B; B passar a usar A é recusado, com a frase do círculo', () => {
    const g = grafoDasArestas([{ fichaId: 'a', subfichaId: 'b' }]);
    const r = conferirGrafo(g, 'b', ['a'], nome);
    expect(r).toEqual({
      ok: false,
      subfichaId: 'a',
      erro: 'Assim fica um círculo: “Base B” usa “Molho A”, que usa “Base B”. Um pré-preparo não pode entrar, nem por dentro de outro, na receita que ele mesmo usa.',
    });
  });

  it('círculo de 3 (A → B → C → A) também, e sem círculo passa', () => {
    const g = grafoDasArestas([
      { fichaId: 'a', subfichaId: 'b' },
      { fichaId: 'b', subfichaId: 'c' },
    ]);
    expect(conferirGrafo(g, 'c', ['a'], nome)).toMatchObject({ ok: false, erro: expect.stringContaining('“Tempero C” usa “Molho A”, que usa “Base B”, que usa “Tempero C”') });
    expect(conferirGrafo(g, 'c', ['d'], nome)).toEqual({ ok: true });
    // Trocar as ligações da própria ficha (tirar a antiga) não é círculo.
    expect(conferirGrafo(g, 'a', ['c'], nome)).toEqual({ ok: true });
  });

  it(`profundidade: até ${PROFUNDIDADE_MAXIMA} fichas numa linha; a 6ª é recusada (contando quem usa, acima)`, () => {
    // p → a → b → c → d: 5 fichas
    const g = grafoDasArestas([
      { fichaId: 'p', subfichaId: 'a' },
      { fichaId: 'a', subfichaId: 'b' },
      { fichaId: 'b', subfichaId: 'c' },
    ]);
    expect(conferirGrafo(g, 'c', ['d'], nome)).toEqual({ ok: true });
    const g5 = grafoDasArestas([...[...g].flatMap(([f, s]) => [...s].map((x) => ({ fichaId: f, subfichaId: x }))), { fichaId: 'c', subfichaId: 'd' }]);
    const r = conferirGrafo(g5, 'd', ['e'], nome);
    expect(r).toMatchObject({ ok: false, erro: expect.stringContaining('a linha teria 6') });
    // Ficha nova (ninguém a usa ainda) em cima de uma cadeia de 5 também passa do limite.
    expect(conferirGrafo(g5, '(nova)', ['p'], nome)).toMatchObject({ ok: false });
  });
});
