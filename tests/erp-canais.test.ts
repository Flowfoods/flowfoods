/**
 * ERP 1.9 · custo por canal em camadas (puro): loja = insumos; delivery =
 * + embalagens; iFood = + embalagens + taxa. Valores exatos (fração), embalagem
 * inteira (~100 % de rendimento), taxa em pontos-base sobre o preço,
 * incompleto propagado, leitura das embalagens e da taxa, retrato.
 *
 *   npx vitest run tests/erp-canais.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  camadasDoCanal,
  contaDaTaxa,
  impressaoDasEmbalagens,
  lerEmbalagens,
  lerTaxaDoCanal,
  porQueIncompleto,
  retratoDasEmbalagens,
  taxaACadaDezReais,
  taxaSobrePreco,
  totalEmTexto,
  type EmbalagemDoCadastro,
  type EmbalagemParaCusto,
} from '@/lib/erp/canal-campos';
import { custoDaFicha, type ItemParaCusto } from '@/lib/erp/ficha-campos';
import { centavosDaFracao, compararFracoes, custoDaEmbalagem, formatarPontosBase, lerPontosBase, pontosBaseParaCampo, type Fracao } from '@/lib/erp/unidades';

/** O Intl separa "R$" do número com espaço fino (NBSP). */
const sp = (t: string) => t.replace(/\s/g, ' ');
const igual = (a: Fracao, num: bigint, den: bigint) => expect(compararFracoes(a, { num, den })).toBe(0);

// Burger cheddar: 1 pão (R$ 18,00 a dúzia = 150 c) + 180 g de blend (R$ 94,90 por 5 kg = 341,64 c) = 491,64 c por porção.
const itensDoBurger: ItemParaCusto[] = [
  { nome: 'Pão brioche', quantidadeMilesimos: 1000, fatorCorrecaoMilesimos: 1000, custo: custoDaEmbalagem(1800, 0, 12_000) },
  { nome: 'Blend 180 g', quantidadeMilesimos: 180, fatorCorrecaoMilesimos: 1000, custo: custoDaEmbalagem(9490, 0, 5000) },
];
const burger = custoDaFicha(itensDoBurger, 1000);

const insumo = (preco: number, conteudo: number, frete = 0) => ({
  precoEmbalagemCentavos: preco,
  taxaEntregaCentavos: frete,
  conteudoMilesimos: conteudo,
  ultimaCompra: null,
});
// Caixa kraft R$ 89,00 o cento (89 c/un); guardanapo R$ 4,00 o milheiro (0,4 c/un); sacola R$ 25,00 o cento.
const caixa: EmbalagemParaCusto = { insumoId: 'cx', nome: 'Caixa kraft', unidade: 'UN', quantidadeMilesimos: 1000, insumo: insumo(8900, 100_000) };
const guardanapo: EmbalagemParaCusto = { insumoId: 'gu', nome: 'Guardanapo', unidade: 'UN', quantidadeMilesimos: 2000, insumo: insumo(400, 1_000_000) };
const sacola: EmbalagemParaCusto = { insumoId: 'sa', nome: 'Sacola', unidade: 'UN', quantidadeMilesimos: 1000, insumo: insumo(2500, 100_000) };
const IFOOD = { comissaoBp: 2300, pagamentoBp: 320 };

describe('camadas por canal, exatas', () => {
  it('loja = só os insumos (a porção da ficha), sem embalagem nem taxa', () => {
    const c = camadasDoCanal({ canal: 'LOJA', custoDaFicha: burger, embalagens: [caixa], taxa: null });
    igual(c.daFicha, 49_164n, 100n);
    expect(c.embalagens).toEqual([]);
    expect(c.taxa).toEqual({ tipo: 'nenhuma' });
    igual(c.total!, 49_164n, 100n);
    expect(c.incompleto).toBe(false);
    expect(sp(totalEmTexto(c))).toBe('R$ 4,92');
  });

  it('delivery = insumos + caixa (89 c) + 2 guardanapos (0,8 c), exato: 581,44 c', () => {
    const c = camadasDoCanal({ canal: 'DELIVERY_PROPRIO', custoDaFicha: burger, embalagens: [caixa, guardanapo], taxa: null });
    igual(c.embalagens[0].valor!, 89n, 1n);
    igual(c.embalagens[1].valor!, 4n, 5n);
    igual(c.embalagensTotal, 449n, 5n);
    igual(c.total!, 58_144n, 100n);
    expect(sp(totalEmTexto(c))).toBe('R$ 5,81');
  });

  it('embalagem entra inteira (~100 %): o mesmo item com fator na ficha custaria mais; aqui não existe fator', () => {
    const umaCaixa = camadasDoCanal({ canal: 'DELIVERY_PROPRIO', custoDaFicha: burger, embalagens: [caixa], taxa: null });
    // 1 caixa = exatamente 1/100 do cento, nada a mais.
    igual(umaCaixa.embalagensTotal, 89n, 1n);
  });

  it('iFood = insumos + embalagens + taxa em pontos-base sobre o PREÇO: sem preço, a camada fica pendente (26,2% do preço)', () => {
    const c = camadasDoCanal({ canal: 'IFOOD', custoDaFicha: burger, embalagens: [caixa, sacola, guardanapo], taxa: IFOOD });
    igual(c.semTaxa, 60_644n, 100n);
    expect(c.taxa).toMatchObject({ tipo: 'sobrePreco', totalBp: 2620, valor: null });
    expect(c.total).toBeNull();
    expect(c.incompleto).toBe(false);
    expect(sp(totalEmTexto(c))).toBe('R$ 6,06 + 26,2% do preço');
    expect(contaDaTaxa(IFOOD)).toBe('23% de comissão + 3,2% de pagamento online = 26,2% do preço');
    expect(sp(taxaACadaDezReais(2620))).toBe('R$ 2,62');
  });

  it('com preço (porta da 1.10), a taxa vira valor exato: 26,2% de R$ 32,90 = 861,98 c', () => {
    igual(taxaSobrePreco(3290, 2620), 8_619_800n, 10_000n);
    const c = camadasDoCanal({ canal: 'IFOOD', custoDaFicha: burger, embalagens: [caixa], taxa: IFOOD, precoCentavos: 3290 });
    // 491,64 + 89 + 861,98 = 1442,62 c
    igual(c.total!, 144_262n, 100n);
    expect(centavosDaFracao(c.total!)).toBe(1443n);
    expect(() => taxaSobrePreco(-1, 2620)).toThrow(RangeError);
  });

  it('incompleto propagado: ficha sem preço deixa os três; embalagem sem preço só o canal dela; taxa não configurada só o iFood', () => {
    const fichaIncompleta = custoDaFicha([...itensDoBurger, { nome: 'Picles', quantidadeMilesimos: 20, fatorCorrecaoMilesimos: 1000, custo: null }], 1000);
    for (const canal of ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'] as const) {
      const c = camadasDoCanal({ canal, custoDaFicha: fichaIncompleta, embalagens: [], taxa: canal === 'IFOOD' ? IFOOD : null });
      expect(c.incompleto).toBe(true);
      expect(porQueIncompleto(c)).toBe('falta preço em “Picles”');
    }
    const semPreco: EmbalagemParaCusto = { ...sacola, insumo: insumo(0, 100_000) };
    const d = camadasDoCanal({ canal: 'DELIVERY_PROPRIO', custoDaFicha: burger, embalagens: [caixa], taxa: null });
    const i = camadasDoCanal({ canal: 'IFOOD', custoDaFicha: burger, embalagens: [caixa, semPreco], taxa: IFOOD });
    expect(d.incompleto).toBe(false);
    expect(i.incompleto).toBe(true);
    // O parcial entra (a caixa), nunca R$ 0,00 no lugar.
    igual(i.embalagensTotal, 89n, 1n);
    expect(i.embalagens[1].valor).toBeNull();
    expect(porQueIncompleto(i)).toBe('falta preço em “Sacola”');
    const sem = camadasDoCanal({ canal: 'IFOOD', custoDaFicha: burger, embalagens: [caixa], taxa: 'naoConfigurada' });
    expect(sem).toMatchObject({ incompleto: true, total: null, taxa: { tipo: 'naoConfigurada' } });
    expect(porQueIncompleto(sem)).toBe('taxa do iFood não configurada');
  });

  it('o custo da embalagem é o de referência: com nota (último preço, 1.5), vale a nota', () => {
    const comNota: EmbalagemParaCusto = { ...caixa, insumo: { ...caixa.insumo, ultimaCompra: { centavos: 99, milesimos: 1000 } } };
    const c = camadasDoCanal({ canal: 'DELIVERY_PROPRIO', custoDaFicha: burger, embalagens: [comNota], taxa: null });
    igual(c.embalagensTotal, 99n, 1n);
  });
});

describe('taxa do iFood: pontos-base', () => {
  it('lê "23" e "3,2" (e "12,5%"), mostra "26,2%"', () => {
    expect(lerPontosBase('23')).toBe(2300);
    expect(lerPontosBase('3,2')).toBe(320);
    expect(lerPontosBase('12,5%')).toBe(1250);
    expect(lerPontosBase('12,345')).toBeNull();
    expect(lerPontosBase('-1')).toBeNull();
    expect(formatarPontosBase(2620)).toBe('26,2%');
    expect(pontosBaseParaCampo(320)).toBe('3,2');
    expect(pontosBaseParaCampo(2300)).toBe('23');
  });

  it('formulário: comissão obrigatória, pagamento vazio = 0, cada uma até 100, as duas abaixo de 100', () => {
    expect(lerTaxaDoCanal({ comissao: '23', pagamento: '3,2' })).toEqual({ ok: true, dados: { comissaoBp: 2300, pagamentoBp: 320 } });
    expect(lerTaxaDoCanal({ comissao: '12', pagamento: '' })).toEqual({ ok: true, dados: { comissaoBp: 1200, pagamentoBp: 0 } });
    expect(lerTaxaDoCanal({ comissao: '', pagamento: '3,2' })).toMatchObject({ ok: false, erros: { comissao: expect.any(String) } });
    expect(lerTaxaDoCanal({ comissao: 'vinte', pagamento: '' })).toMatchObject({ ok: false, erros: { comissao: expect.stringMatching(/inválida/) } });
    expect(lerTaxaDoCanal({ comissao: '101', pagamento: '' })).toMatchObject({ ok: false, erros: { comissao: expect.stringMatching(/0 a 100/) } });
    expect(lerTaxaDoCanal({ comissao: '90', pagamento: '10' })).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/100%/) } });
  });
});

describe('embalagens por canal: leitura do formulário', () => {
  const cad = new Map<string, EmbalagemDoCadastro>([
    ['cx', { id: 'cx', nome: 'Caixa kraft', unidade: 'UN', tipo: 'EMBALAGEM', ativo: true }],
    ['gu', { id: 'gu', nome: 'Guardanapo', unidade: 'UN', tipo: 'EMBALAGEM', ativo: true }],
    ['fi', { id: 'fi', nome: 'Filme PVC', unidade: 'KG', tipo: 'EMBALAGEM', ativo: true }],
    ['ve', { id: 've', nome: 'Caixa velha', unidade: 'UN', tipo: 'EMBALAGEM', ativo: false }],
    ['ch', { id: 'ch', nome: 'Cheddar', unidade: 'KG', tipo: 'INGREDIENTE', ativo: true }],
  ]);
  const l = (canal: string, insumoId: string, quantidade: string, unidade = 'un') => ({ canal, insumoId, quantidade, unidade });

  it('delivery e iFood com listas diferentes; g na embalagem em kg; o canal LOJA forjado não entra', () => {
    const r = lerEmbalagens(
      [l('DELIVERY_PROPRIO', 'cx', '1'), l('DELIVERY_PROPRIO', 'gu', '2'), l('IFOOD', 'cx', '1'), l('IFOOD', 'fi', '5', 'g'), l('LOJA', 'cx', '1')],
      cad,
    );
    expect(r).toEqual({
      ok: true,
      dados: [
        { canal: 'DELIVERY_PROPRIO', insumoId: 'cx', quantidadeMilesimos: 1000 },
        { canal: 'DELIVERY_PROPRIO', insumoId: 'gu', quantidadeMilesimos: 2000 },
        { canal: 'IFOOD', insumoId: 'cx', quantidadeMilesimos: 1000 },
        { canal: 'IFOOD', insumoId: 'fi', quantidadeMilesimos: 5 },
      ],
    });
  });

  it('recusa: não é embalagem, desativada (a não ser que já estivesse), repetida, unidade de outra família, zero, acima de 1.000, de outro parceiro', () => {
    const r = lerEmbalagens(
      [
        l('IFOOD', 'ch', '1', 'kg'),
        l('IFOOD', 've', '1'),
        l('IFOOD', 'cx', '1'),
        l('IFOOD', 'cx', '2'),
        l('IFOOD', 'gu', '2', 'g'),
        l('DELIVERY_PROPRIO', 'gu', '0'),
        l('DELIVERY_PROPRIO', 'cx', '1001'),
        l('DELIVERY_PROPRIO', 'deB', '1'),
      ],
      cad,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros['emb-IFOOD-0']).toMatch(/não é embalagem/);
    expect(r.erros['emb-IFOOD-1']).toMatch(/desativada/);
    expect(r.erros['emb-IFOOD-3']).toMatch(/já está neste canal \(linha 3\)/);
    expect(r.erros['emb-IFOOD-4']).toMatch(/use un/);
    expect(r.erros['emb-DELIVERY_PROPRIO-0']).toMatch(/maior que zero/);
    expect(r.erros['emb-DELIVERY_PROPRIO-1']).toMatch(/1\.000/);
    expect(r.erros['emb-DELIVERY_PROPRIO-2']).toMatch(/não encontrada/);
    expect(lerEmbalagens([l('IFOOD', 've', '1')], cad, new Set(['IFOOD:ve']))).toMatchObject({ ok: true });
    expect(lerEmbalagens([l('IFOOD', 've', '1')], cad, new Set(['DELIVERY_PROPRIO:ve']))).toMatchObject({ ok: false });
    expect(
      lerEmbalagens(
        Array.from({ length: 21 }, () => l('IFOOD', 'cx', '1')),
        cad,
      ),
    ).toMatchObject({ ok: false, erros: { 'emb-IFOOD': expect.stringMatching(/20/) } });
  });

  it('retrato para o histórico e impressão para a concorrência', () => {
    const nomes = new Map([
      ['cx', { nome: 'Caixa kraft', unidade: 'UN' as const }],
      ['gu', { nome: 'Guardanapo', unidade: 'UN' as const }],
    ]);
    const lista = [
      { canal: 'DELIVERY_PROPRIO' as const, insumoId: 'cx', quantidadeMilesimos: 1000 },
      { canal: 'DELIVERY_PROPRIO' as const, insumoId: 'gu', quantidadeMilesimos: 2000 },
    ];
    expect(retratoDasEmbalagens(lista, nomes)).toEqual({ embalagensDelivery: 'Caixa kraft 1 un · Guardanapo 2 un', embalagensIfood: 'Nenhuma' });
    expect(impressaoDasEmbalagens(lista)).toBe('DELIVERY_PROPRIO:cx:1000|DELIVERY_PROPRIO:gu:2000');
    expect(impressaoDasEmbalagens([])).toBe('');
  });
});

describe('retrato: a mesma lista em outra ordem não é mudança', () => {
  it('ordena pelo nome dentro do canal', () => {
    const nomes = new Map([
      ['sa', { nome: 'Sacola', unidade: 'UN' as const }],
      ['cx', { nome: 'Caixa kraft', unidade: 'UN' as const }],
    ]);
    const r = retratoDasEmbalagens(
      [
        { canal: 'IFOOD', insumoId: 'sa', quantidadeMilesimos: 1000 },
        { canal: 'IFOOD', insumoId: 'cx', quantidadeMilesimos: 1000 },
      ],
      nomes,
    );
    expect(r.embalagensIfood).toBe('Caixa kraft 1 un · Sacola 1 un');
  });
});

describe('histórico das embalagens: só o que mudou (1.10, herança b da 1.9)', () => {
  it('de "Nenhuma" entra a lista; para "Nenhuma" sai a lista; quantidade mudada vira uma linha', async () => {
    const { descreverMudancas } = await import('@/lib/erp/historico');
    expect(descreverMudancas({ nome: 'Burger', embalagensIfood: 'Nenhuma' }, { nome: 'Burger', embalagensIfood: 'Caixa kraft 1 un · Sacola 1 un' })).toEqual([
      { campo: 'embalagens do iFood · entrou', antes: null, depois: 'Caixa kraft 1 un · Sacola 1 un' },
    ]);
    expect(descreverMudancas({ embalagensDelivery: 'Caixa kraft 1 un' }, { embalagensDelivery: 'Nenhuma' })).toEqual([
      { campo: 'embalagens do delivery · saiu', antes: null, depois: 'Caixa kraft 1 un' },
    ]);
    expect(descreverMudancas({ embalagensDelivery: 'Caixa kraft 1 un · Guardanapo 2 un' }, { embalagensDelivery: 'Caixa kraft 1 un · Guardanapo 3 un' })).toEqual([
      { campo: 'embalagens do delivery · Guardanapo', antes: '2 un', depois: '3 un' },
    ]);
  });
});
