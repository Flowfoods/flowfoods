/**
 * ERP 1.1 · Insumos — a parte pura: conversão g/kg/ml/L em milésimos, custo
 * com frete e UM arredondamento, "Sem preço", leitura do formulário, diferença
 * para o histórico, comparação de embalagens e a frase do histórico.
 */
import { describe, expect, it } from 'vitest';
import {
  compararCustos,
  contaDoCusto,
  custoDaEmbalagem,
  custoDaQuantidade,
  dinheiroParaCampo,
  dividirArredondado,
  formatarCusto,
  lerQuantidadeNa,
  quantidadeParaCampo,
} from '@/lib/erp/unidades';
import {
  compararEmbalagens,
  diferenca,
  lerFormInsumo,
  lerFormVariante,
  retratoDaVariante,
  retratoDoInsumo,
  versaoDaVariante,
  type DadosInsumo,
} from '@/lib/erp/insumo-campos';
import { alvoDaLinha, descreverMudancas, rotuloEntidade } from '@/lib/erp/historico';
import { fraseDoFeito } from '@/components/erp/telas/insumos/estado';

/** O Intl põe espaço sem quebra depois do "R$"; o teste compara com espaço comum. */
const n = <T,>(x: T): T => JSON.parse(JSON.stringify(x).replace(/\u00a0/g, ' '));

describe('ERP 1.1 · embalagem digitada em kg/g, L/ml ou un vira milésimos', () => {
  it('kg e L na unidade base: até 3 casas', () => {
    expect(lerQuantidadeNa('5', 'KG', 'base')).toBe(5000);
    expect(lerQuantidadeNa('2,27', 'KG', 'base')).toBe(2270);
    expect(lerQuantidadeNa('1,5', 'L', 'base')).toBe(1500);
    expect(lerQuantidadeNa('0,750', 'L', 'base')).toBe(750);
    expect(lerQuantidadeNa('1,2345', 'KG', 'base')).toBeNull();
  });

  it('g e ml: inteiro, 1 g = 1 milésimo de kg; meio grama não existe', () => {
    expect(lerQuantidadeNa('750', 'KG', 'menor')).toBe(750);
    expect(lerQuantidadeNa('1.500', 'KG', 'menor')).toBe(1500);
    expect(lerQuantidadeNa('900', 'L', 'menor')).toBe(900);
    expect(lerQuantidadeNa('0,5', 'KG', 'menor')).toBeNull();
    expect(lerQuantidadeNa('-3', 'L', 'menor')).toBeNull();
  });

  it('un: "menor" é a própria unidade', () => {
    expect(lerQuantidadeNa('12', 'UN', 'menor')).toBe(12_000);
    expect(lerQuantidadeNa('12', 'UN', 'base')).toBe(12_000);
  });

  it('volta para o campo na escala natural', () => {
    expect(quantidadeParaCampo(750, 'KG')).toEqual({ texto: '750', escala: 'menor' });
    expect(quantidadeParaCampo(2270, 'KG')).toEqual({ texto: '2,27', escala: 'base' });
    expect(quantidadeParaCampo(12_000, 'UN')).toEqual({ texto: '12', escala: 'base' });
    expect(quantidadeParaCampo(500, 'UN')).toEqual({ texto: '0,5', escala: 'base' });
    expect(dinheiroParaCampo(8990)).toBe('89,90');
    expect(dinheiroParaCampo(5)).toBe('0,05');
  });
});

describe('ERP 1.1 · custo por unidade = (preço + frete) ÷ conteúdo, exato (fração inteira)', () => {
  it('a conta do contrato', () => {
    // R$ 89,90 + R$ 5,00 frete ÷ 5 kg = R$ 18,98/kg
    const c = custoDaEmbalagem(8990, 500, 5000)!;
    expect(custoDaQuantidade(c, 1000)).toBe(1898);
    expect(n(contaDoCusto({ precoEmbalagemCentavos: 8990, taxaEntregaCentavos: 500, conteudoMilesimos: 5000, unidade: 'KG' }))).toBe(
      'R$ 89,90 + R$ 5,00 frete ÷ 5 kg = R$ 18,98/kg',
    );
    expect(n(contaDoCusto({ precoEmbalagemCentavos: 1800, taxaEntregaCentavos: 0, conteudoMilesimos: 12_000, unidade: 'UN' }))).toBe(
      'R$ 18,00 ÷ 12 un = R$ 1,50/un',
    );
  });

  it('o custo é a fração exata, reduzida, em inteiros: nada se perde antes de usar', () => {
    // R$ 4,00 por 1000 un: 400 centavos por 1.000.000 milésimos = 1 centavo a cada 2.500 milésimos.
    expect(custoDaEmbalagem(400, 0, 1_000_000)).toEqual({ centavos: 1, milesimos: 2500 });
    expect(custoDaEmbalagem(8990, 500, 5000)).toEqual({ centavos: 949, milesimos: 500 });
  });

  it('frete soma ANTES de dividir e o arredondamento é um só, no fim (pronto para a ficha técnica)', () => {
    // R$ 10,00 + R$ 0,01 em 3 kg = 333,67 → 334. Separado: 333 + 0 = 333.
    expect(custoDaQuantidade(custoDaEmbalagem(1000, 1, 3000)!, 1000)).toBe(334);
    expect(dividirArredondado(1000 * 1000, 3000) + dividirArredondado(1 * 1000, 3000)).toBe(333);
    // Ficha: 180 g de um insumo a R$ 94,90 por 5 kg = 341,64 → 342 centavos (sem passar pelo custo/kg arredondado).
    expect(custoDaQuantidade(custoDaEmbalagem(8990, 500, 5000)!, 180)).toBe(342);
    // 30 guardanapos a R$ 4,00 o milheiro = 12 centavos exatos (o custo/un arredondado daria 0).
    expect(custoDaQuantidade(custoDaEmbalagem(400, 0, 1_000_000)!, 30_000)).toBe(12);
    // Números grandes não estouram (conta em BigInt por dentro).
    expect(custoDaQuantidade(custoDaEmbalagem(1_999_999_999, 0, 1)!, 2_000_000_000)).toBe(1_999_999_999 * 2_000_000_000);
  });

  it('meio centavo arredonda para cima', () => {
    expect(custoDaQuantidade(custoDaEmbalagem(1, 0, 2000)!, 1000)).toBe(1);
    expect(custoDaQuantidade(custoDaEmbalagem(3, 0, 2000)!, 1000)).toBe(2);
  });

  it('abaixo de 1 centavo por unidade: mais casas, nunca R$ 0,00 (e o milheiro para un)', () => {
    const guardanapo = custoDaEmbalagem(400, 0, 1_000_000);
    expect(n(formatarCusto(guardanapo, 'UN'))).toBe('R$ 0,004/un');
    expect(n(formatarCusto(custoDaEmbalagem(1500, 0, 5_000_000), 'UN'))).toBe('R$ 0,003/un');
    // R$ 3,50 o milheiro: duas casas significativas.
    expect(n(formatarCusto(custoDaEmbalagem(350, 0, 1_000_000), 'UN'))).toBe('R$ 0,0035/un');
    expect(n(contaDoCusto({ precoEmbalagemCentavos: 400, taxaEntregaCentavos: 0, conteudoMilesimos: 1_000_000, unidade: 'UN' }))).toBe(
      'R$ 4,00 ÷ 1.000 un = R$ 0,004/un (R$ 4,00 o milheiro)',
    );
    // Acima de 1 centavo, duas casas como sempre.
    expect(n(formatarCusto(custoDaEmbalagem(1800, 0, 12_000), 'UN'))).toBe('R$ 1,50/un');
    for (const [p, c] of [[1, 1_000_000], [1, 2_000_000_000], [400, 999_999]] as const) {
      expect(n(formatarCusto(custoDaEmbalagem(p, 0, c), 'UN')), `${p}/${c}`).not.toMatch(/R\$ 0,00\//);
    }
  });

  it('comparar é por multiplicação cruzada, exata', () => {
    const a = custoDaEmbalagem(400, 0, 1_000_000)!; // 0,004/un
    const b = custoDaEmbalagem(1500, 0, 5_000_000)!; // 0,003/un
    expect(compararCustos(a, b)).toBe(1);
    expect(compararCustos(b, a)).toBe(-1);
    expect(compararCustos(a, custoDaEmbalagem(800, 0, 2_000_000)!)).toBe(0);
  });

  it('preço 0 é "Sem preço": custo incompleto, nunca R$ 0,00 (mesmo com frete)', () => {
    expect(custoDaEmbalagem(0, 500, 1000)).toBeNull();
    expect(formatarCusto(null, 'KG')).toBe('Sem preço');
    expect(n(formatarCusto(custoDaEmbalagem(8990, 500, 5000), 'KG'))).toBe('R$ 18,98/kg');
    const conta = contaDoCusto({ precoEmbalagemCentavos: 0, taxaEntregaCentavos: 500, conteudoMilesimos: 1000, unidade: 'KG' });
    expect(conta).toMatch(/^Sem preço/);
    expect(conta).not.toMatch(/0,00/);
  });
});

describe('ERP 1.1 · formulário do insumo (o servidor converte)', () => {
  const base = { nome: 'Cebola', tipo: 'INGREDIENTE', unidade: 'KG', conservacao: 'SECO', conteudo: '5', escala: 'base', preco: '89,90', frete: '5,00' };

  it('válido: tudo em inteiro', () => {
    const r = lerFormInsumo(base);
    expect(r).toEqual({
      ok: true,
      dados: {
        nome: 'Cebola',
        tipo: 'INGREDIENTE',
        unidade: 'KG',
        conservacao: 'SECO',
        conteudoMilesimos: 5000,
        precoEmbalagemCentavos: 8990,
        taxaEntregaCentavos: 500,
      },
    });
  });

  it('embalagem em g; frete vazio = sem frete; espaços do nome somem', () => {
    const r = lerFormInsumo({ ...base, nome: '  Queijo   ralado ', conteudo: '750', escala: 'menor', frete: '' });
    expect(r.ok && r.dados).toMatchObject({ nome: 'Queijo ralado', conteudoMilesimos: 750, taxaEntregaCentavos: 0 });
  });

  it('pré-preparo é recusado no formulário (nasce da ficha, 1.3)', () => {
    const r = lerFormInsumo({ ...base, tipo: 'PRE_PREPARO' });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erros.tipo).toMatch(/ficha técnica/);
    // Um pré-preparo que já existe continua pré-preparo (não vira ingrediente).
    expect(lerFormInsumo({ ...base, tipo: 'PRE_PREPARO' }, 'PRE_PREPARO').ok).toBe(true);
    expect(lerFormInsumo(base, 'PRE_PREPARO').ok).toBe(false);
  });

  it('frete negativo, preço inválido e conteúdo zero são recusados com a frase no campo', () => {
    const r = lerFormInsumo({ ...base, frete: '-5', preco: '8,999', conteudo: '0' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros.frete).toMatch(/Frete inválido/);
    expect(r.erros.preco).toMatch(/Preço inválido/);
    expect(r.erros.conteudo).toMatch(/mais que zero/);
  });

  it('preço vazio ou zero sem marcar pede "Ainda não sei o preço"; marcado, grava 0', () => {
    for (const preco of ['', '0', '0,00']) {
      const r = lerFormInsumo({ ...base, preco });
      expect(!r.ok && r.erros.preco, preco).toMatch(/Ainda não sei o preço/);
    }
    const r = lerFormInsumo({ ...base, preco: '', semPreco: 'on' });
    expect(r.ok && r.dados.precoEmbalagemCentavos).toBe(0);
  });

  it('nome curto, unidade e tipo fora da lista', () => {
    const r = lerFormInsumo({ ...base, nome: 'a', unidade: 'CX', tipo: 'X' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.erros).sort()).toEqual(['nome', 'tipo', 'unidade']);
  });

  it('embalagem (variante): código de barras opcional, de 8 a 14 números', () => {
    const ok = lerFormVariante({ nome: 'Caixa 10 kg', conteudo: '10', preco: '170,00', codigoBarras: '7891000 100103' }, 'KG');
    expect(ok.ok && ok.dados).toEqual({
      nome: 'Caixa 10 kg',
      codigoBarras: '7891000100103',
      conteudoMilesimos: 10_000,
      precoEmbalagemCentavos: 17_000,
      taxaEntregaCentavos: 0,
    });
    const r = lerFormVariante({ nome: 'Fardo', conteudo: '6', preco: '30', codigoBarras: '12ab' }, 'L');
    expect(!r.ok && r.erros.codigoBarras).toMatch(/8 a 14/);
  });
});

describe('ERP 1.1 · histórico: só o que mudou, legível', () => {
  const cebola: DadosInsumo = {
    nome: 'Cebola',
    tipo: 'INGREDIENTE',
    unidade: 'KG',
    conservacao: 'SECO',
    conteudoMilesimos: 5000,
    precoEmbalagemCentavos: 8990,
    taxaEntregaCentavos: 0,
  };

  it('diferenca: só os campos mudados, com nome e unidade de contexto', () => {
    const d = diferenca(retratoDoInsumo(cebola), retratoDoInsumo({ ...cebola, taxaEntregaCentavos: 500 }));
    expect(d?.campos).toEqual(['taxaEntregaCentavos', 'custoPorUnidade']);
    // O histórico guarda o custo EXATO (fração reduzida), nunca um centavo arredondado.
    expect(d?.depois).toEqual({ nome: 'Cebola', unidade: 'KG', taxaEntregaCentavos: 500, custoPorUnidade: { centavos: 949, milesimos: 500 } });
    expect(diferenca(retratoDoInsumo(cebola), retratoDoInsumo(cebola))).toBeNull();
  });

  it('a frase do histórico usa o mesmo custo da tela, e "Sem preço" no lugar de R$ 0,00', () => {
    const d = diferenca(retratoDoInsumo(cebola), retratoDoInsumo({ ...cebola, taxaEntregaCentavos: 500, conservacao: 'REFRIGERADO' }))!;
    expect(n(descreverMudancas(d.antes, d.depois))).toEqual([
      { campo: 'conservação', antes: 'Seco', depois: 'Refrigerado' },
      { campo: 'frete', antes: 'Sem frete', depois: 'R$ 5,00' },
      { campo: 'custo por unidade', antes: 'R$ 17,98/kg', depois: 'R$ 18,98/kg' },
    ]);
    const semPreco = diferenca(retratoDoInsumo(cebola), retratoDoInsumo({ ...cebola, precoEmbalagemCentavos: 0 }))!;
    expect(n(descreverMudancas(semPreco.antes, semPreco.depois))).toEqual([
      { campo: 'preço', antes: 'R$ 89,90', depois: 'Sem preço' },
      { campo: 'custo por unidade', antes: 'R$ 17,98/kg', depois: 'Sem preço' },
    ]);
  });

  it('criação mostra embalagem com unidade, tipo e custo; desativar mostra a situação', () => {
    const m = descreverMudancas(null, retratoDoInsumo({ ...cebola, conteudoMilesimos: 750 }));
    expect(n(m.map((x) => [x.campo, x.depois]))).toEqual([
      ['nome', 'Cebola'],
      ['tipo', 'Ingrediente'],
      ['conservação', 'Seco'],
      ['embalagem', '750 g'],
      ['preço', 'R$ 89,90'],
      ['frete', 'Sem frete'],
      ['custo por unidade', 'R$ 119,87/kg'],
    ]);
    expect(n(descreverMudancas({ nome: 'Cebola', ativo: true }, { nome: 'Cebola', ativo: false }))).toEqual([
      { campo: 'situação', antes: 'Ativo', depois: 'Desativado' },
    ]);
  });

  it('guardanapo (1000 un por R$ 4,00): o histórico mostra R$ 0,004/un, não R$ 0,00', () => {
    const r = retratoDoInsumo({ ...cebola, nome: 'Guardanapo de papel', tipo: 'EMBALAGEM', unidade: 'UN', conteudoMilesimos: 1_000_000, precoEmbalagemCentavos: 400 });
    expect(r.custoPorUnidade).toEqual({ centavos: 1, milesimos: 2500 });
    const custo = n(descreverMudancas(null, r)).find((m) => m.campo === 'custo por unidade');
    expect(custo?.depois).toBe('R$ 0,004/un');
    // Linha antiga (antes desta correção) com o custo em centavos inteiros continua legível.
    expect(n(descreverMudancas(null, { unidade: 'KG', custoPorUnidadeCentavos: 1898 })).find((m) => m.campo === 'custo por unidade')?.depois).toBe('R$ 18,98/kg');
  });

  it('embalagem (variante): rótulo simples e o alvo diz de quem é', () => {
    const r = retratoDaVariante(
      { nome: 'Caixa 10 kg', codigoBarras: null, conteudoMilesimos: 10_000, precoEmbalagemCentavos: 17_000, taxaEntregaCentavos: 0 },
      { nome: 'Cebola', unidade: 'KG' },
    );
    expect(rotuloEntidade('InsumoVariante')).toBe('Embalagem');
    expect(alvoDaLinha(null, r)).toBe('Cebola · Caixa 10 kg');
    expect(n(descreverMudancas(null, r).map((x) => x.campo))).not.toContain('insumo');
    // Renomear o insumo não é mudança da embalagem.
    expect(diferenca(r, { ...r, insumo: 'Cebola roxa' })).toBeNull();
  });

  it('versão da embalagem muda quando qualquer valor muda', () => {
    const v = { nome: 'Caixa', conteudoMilesimos: 1000, precoEmbalagemCentavos: 100, taxaEntregaCentavos: 0, codigoBarras: null, ativo: true };
    expect(versaoDaVariante(v)).toBe(versaoDaVariante({ ...v }));
    expect(versaoDaVariante(v)).not.toBe(versaoDaVariante({ ...v, precoEmbalagemCentavos: 101 }));
    expect(versaoDaVariante(v)).not.toBe(versaoDaVariante({ ...v, ativo: false }));
  });
});

describe('ERP 1.1 · qual embalagem sai mais barata (em texto)', () => {
  const c = (p: number, q: number) => custoDaEmbalagem(p, 0, q);

  it('compara por unidade e diz a diferença', () => {
    expect(
      n(compararEmbalagens(
        [
          { nome: 'Saco 5 kg', custo: custoDaEmbalagem(8990, 500, 5000) },
          { nome: 'Caixa 10 kg', custo: c(17_500, 10_000) },
        ],
        'KG',
      )),
    ).toBe('“Caixa 10 kg” sai mais barata: R$ 17,50/kg, R$ 1,48 a menos por kg que “Saco 5 kg” (R$ 18,98/kg).');
  });

  it('abaixo de 1 centavo: guardanapo 1000 un por R$ 4,00 contra 5000 un por R$ 15,00 NÃO empata', () => {
    expect(
      n(compararEmbalagens(
        [
          { nome: 'Pacote 1000 un', custo: c(400, 1_000_000) },
          { nome: 'Fardo 5000 un', custo: c(1500, 5_000_000) },
        ],
        'UN',
      )),
    ).toBe('“Fardo 5000 un” sai mais barata: R$ 0,003/un, R$ 0,001 a menos por un que “Pacote 1000 un” (R$ 0,004/un).');
  });

  it('sem preço não entra; uma só não compara; empate exato diz empate', () => {
    expect(compararEmbalagens([{ nome: 'A', custo: c(100, 1000) }], 'KG')).toBeNull();
    expect(compararEmbalagens([{ nome: 'A', custo: c(100, 1000) }, { nome: 'B', custo: null }], 'KG')).toBe(
      'Falta preço para comparar as embalagens.',
    );
    expect(n(compararEmbalagens([{ nome: 'A', custo: c(100, 1000) }, { nome: 'B', custo: c(300, 3000) }], 'UN'))).toBe(
      'As embalagens saem pelo mesmo custo: R$ 1,00/un.',
    );
  });
});


describe('ERP 1.1 · ?feito= da URL só escolhe uma frase conhecida', () => {
  it('__proto__, constructor e desconhecido não viram frase (antes davam 500)', () => {
    expect(fraseDoFeito('criado')).toBe('Insumo cadastrado.');
    for (const f of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'xyz', '', undefined]) {
      expect(fraseDoFeito(f), String(f)).toBeUndefined();
    }
  });
});
