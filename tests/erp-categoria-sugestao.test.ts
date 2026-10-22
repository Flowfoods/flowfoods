/**
 * I.1a · a sugestão de categoria pelo nome (pura, sem banco): nomes reais de insumo de hamburgueria e restaurante carioca
 * (a lista do Valentin's e da ficha-modelo), o que é ambíguo ou desconhecido (vai para "Outros / a classificar" COM motivo)
 * e as regras: conservação não conta, a natureza vence "congelados e industrializados", o começo do nome manda.
 */
import { describe, expect, it } from 'vitest';
import { CATEGORIAS_PADRAO, chaveDoNome, lerNomeDaCategoria, ACENTUADAS, SEM_ACENTO } from '@/lib/erp/categoria-campos';
import { nomeDaChave, palavrasDoNome, sugerirCategoria } from '@/lib/erp/categoria-sugestao';

const chaveDe = (nome: string, tipo?: string) => sugerirCategoria(nome, tipo).chave;

describe('o catálogo das dez padrão', () => {
  it('tem os nomes exatos do plano, em ordem, com uma só do sistema', () => {
    expect(CATEGORIAS_PADRAO.map((c) => c.nome)).toEqual([
      'Proteína',
      'Hortifruti',
      'Mercearias e secos',
      'Laticínios, frios e embutidos',
      'Congelados e industrializados',
      'Panificação',
      'Bebidas',
      'Descartáveis e embalagens',
      'Limpeza e higienização',
      'Outros / a classificar',
    ]);
    expect(new Set(CATEGORIAS_PADRAO.map((c) => c.chave)).size).toBe(10);
    expect(CATEGORIAS_PADRAO.map((c) => c.ordem)).toEqual([...CATEGORIAS_PADRAO.map((c) => c.ordem)].sort((a, b) => a - b));
  });
});

describe('o nome sem caixa nem acento', () => {
  it('"Farinha de Trigo", "farinha  de trigo" e "FARINHA DE TRIGO" são o mesmo; "Pão" e "pao" também', () => {
    expect(chaveDoNome('Farinha de Trigo')).toBe(chaveDoNome('  farinha   de trigo '));
    expect(chaveDoNome('FARINHA DE TRIGO')).toBe('farinha de trigo');
    expect(chaveDoNome('Pão Brioche')).toBe(chaveDoNome('pao brioche'));
    expect(chaveDoNome('Açaí')).toBe('acai');
    expect(chaveDoNome('Cebola')).not.toBe(chaveDoNome('Cebola roxa'));
  });
  it('as duas listas do translate() do banco têm o mesmo tamanho e dizem o mesmo que o código', () => {
    expect([...ACENTUADAS].length).toBe([...SEM_ACENTO].length);
    for (const [i, c] of [...ACENTUADAS].entries()) expect(chaveDoNome(c)).toBe(SEM_ACENTO[i].toLowerCase());
  });
  it('o nome da categoria: 2 a 60 letras, espaços colapsados', () => {
    expect(lerNomeDaCategoria('  Frios   e  queijos ')).toEqual({ ok: true, nome: 'Frios e queijos' });
    expect(lerNomeDaCategoria('a')).toMatchObject({ ok: false, erros: { nome: expect.stringMatching(/2 letras/) } });
    expect(lerNomeDaCategoria('x'.repeat(61))).toMatchObject({ ok: false });
    expect(lerNomeDaCategoria(undefined)).toMatchObject({ ok: false, erros: { nome: expect.any(String) } });
  });
});

describe('os exemplos do plano', () => {
  it('farinha é Mercearias e secos; coxa de frango é Proteína, mesmo congelada ou resfriada; pão é Panificação; molho é Mercearias e secos', () => {
    expect(chaveDe('Farinha de trigo')).toBe('MERCEARIA');
    expect(chaveDe('Coxa de frango')).toBe('PROTEINA');
    expect(chaveDe('Coxa de frango congelada')).toBe('PROTEINA');
    expect(chaveDe('Coxa de frango resfriada')).toBe('PROTEINA');
    expect(chaveDe('Pão brioche')).toBe('PANIFICACAO');
    expect(chaveDe('Molho barbecue')).toBe('MERCEARIA');
    expect(nomeDaChave(sugerirCategoria('Farinha de trigo').chave)).toBe('Mercearias e secos');
  });
  it('a sugestão diz de qual palavra veio', () => {
    expect(sugerirCategoria('Farinha de trigo')).toMatchObject({ origem: 'termo', motivo: null, termos: ['farinha'] });
  });
});

describe('nomes reais (hamburgueria e restaurante carioca)', () => {
  const casos: [string, string][] = [
    ['Blend bovino 180 g', 'PROTEINA'],
    ['Pão brioche', 'PANIFICACAO'],
    ['Queijo cheddar fatiado', 'LATICINIOS'],
    ['Bacon em cubos', 'LATICINIOS'],
    ['Cebola roxa', 'HORTIFRUTI'],
    ['Molho especial da casa', 'MERCEARIA'],
    ['Óleo de soja', 'MERCEARIA'],
    ['Picles de pepino', 'MERCEARIA'],
    ['Batata palha', 'MERCEARIA'],
    ['Polpa de açaí', 'CONGELADOS'],
    ['Leite integral', 'LATICINIOS'],
    ['Granola', 'MERCEARIA'],
    ['Salmão', 'PROTEINA'],
    ['Maionese', 'MERCEARIA'],
    ['Mostarda', 'MERCEARIA'],
    ['Cebola', 'HORTIFRUTI'],
    ['Tomate italiano', 'HORTIFRUTI'],
    ['Alface americana', 'HORTIFRUTI'],
    ['Batata inglesa', 'HORTIFRUTI'],
    ['Batata frita congelada', 'CONGELADOS'],
    ['Peito de frango em cubos', 'PROTEINA'],
    ['Filé de frango empanado congelado', 'PROTEINA'],
    ['Nuggets de frango', 'CONGELADOS'],
    ['Linguiça calabresa', 'LATICINIOS'],
    ['Presunto fatiado', 'LATICINIOS'],
    ['Ovos', 'LATICINIOS'],
    ['Mussarela', 'LATICINIOS'],
    ['Requeijão cremoso', 'LATICINIOS'],
    ['Manteiga sem sal', 'LATICINIOS'],
    ['Creme de leite', 'LATICINIOS'],
    ['Pão de queijo congelado', 'PANIFICACAO'],
    ['Pães de hambúrguer', 'PANIFICACAO'],
    ['Massa de pizza', 'PANIFICACAO'],
    ['Molho de tomate', 'MERCEARIA'],
    ['Extrato de tomate', 'MERCEARIA'],
    ['Arroz parboilizado', 'MERCEARIA'],
    ['Feijão preto', 'MERCEARIA'],
    ['Açúcar refinado', 'MERCEARIA'],
    ['Sal refinado', 'MERCEARIA'],
    ['Azeite extra virgem', 'MERCEARIA'],
    ['Pimenta do reino', 'MERCEARIA'],
    ['Coca-Cola lata 350 ml', 'BEBIDAS'],
    ['Água mineral sem gás', 'BEBIDAS'],
    ['Suco de laranja', 'BEBIDAS'],
    ['Cerveja long neck', 'BEBIDAS'],
    ['Guardanapo de papel', 'DESCARTAVEIS'],
    ['Copo descartável 300 ml', 'DESCARTAVEIS'],
    ['Canudo de papel', 'DESCARTAVEIS'],
    ['Sacola kraft', 'DESCARTAVEIS'],
    ['Detergente neutro', 'LIMPEZA'],
    ['Desinfetante', 'LIMPEZA'],
    ['Água sanitária', 'LIMPEZA'],
    ['Esponja dupla face', 'LIMPEZA'],
    ['Sorvete de creme', 'CONGELADOS'],
    ['Pizza congelada', 'CONGELADOS'],
  ];
  it.each(casos)('%s → %s', (nome, chave) => {
    expect(chaveDe(nome)).toBe(chave);
  });
  it('são mais de 40 nomes', () => {
    expect(casos.length).toBeGreaterThanOrEqual(40);
  });
});

describe('o que manda na dúvida', () => {
  it('conservação não decide: congelado, resfriado, refrigerado e IQF são ignorados', () => {
    expect(chaveDe('Camarão congelado')).toBe('PROTEINA');
    expect(chaveDe('Brócolis congelado')).toBe('HORTIFRUTI');
    expect(chaveDe('Queijo muçarela resfriado')).toBe('LATICINIOS');
    expect(chaveDe('Morango IQF')).toBe('HORTIFRUTI');
    // Só a palavra de conservação não diz nada: vai para a fila, com o motivo.
    expect(sugerirCategoria('Produto congelado')).toMatchObject({ chave: 'OUTROS', origem: 'nenhuma' });
  });
  it('a natureza vence "congelados e industrializados"; ele só aparece quando nada mais cabe', () => {
    expect(chaveDe('Hambúrguer de frango congelado')).toBe('PROTEINA');
    expect(chaveDe('Pão de queijo')).toBe('PANIFICACAO');
    expect(chaveDe('Empanado')).toBe('CONGELADOS');
    expect(chaveDe('Coxinha')).toBe('CONGELADOS');
  });
  it('o começo do nome manda: "molho de tomate" é molho; "queijo com bacon" é queijo', () => {
    expect(chaveDe('Molho de tomate')).toBe('MERCEARIA');
    expect(chaveDe('Queijo com bacon')).toBe('LATICINIOS');
    expect(chaveDe('Farinha de rosca')).toBe('MERCEARIA');
    expect(chaveDe('Água de coco')).toBe('BEBIDAS');
  });
  it('plural e acento dão no mesmo', () => {
    expect(chaveDe('TOMATES')).toBe('HORTIFRUTI');
    expect(chaveDe('limões')).toBe('HORTIFRUTI');
    expect(chaveDe('pao frances')).toBe('PANIFICACAO');
  });
  it('o tipo "Embalagem" já é Descartáveis e embalagens', () => {
    expect(sugerirCategoria('Caixa kraft hambúrguer', 'EMBALAGEM')).toMatchObject({ chave: 'DESCARTAVEIS', origem: 'tipo' });
    expect(chaveDe('Qualquer coisa', 'EMBALAGEM')).toBe('DESCARTAVEIS');
    expect(chaveDe('Farinha de trigo', 'INGREDIENTE')).toBe('MERCEARIA');
  });
  it('ambíguo → Outros / a classificar, com o motivo dizendo os grupos', () => {
    const s = sugerirCategoria('Combo hambúrguer e pão');
    expect(s).toMatchObject({ chave: 'OUTROS', origem: 'ambigua' });
    expect(s.motivo).toMatch(/Ambíguo/);
    expect(s.motivo).toContain('Proteína');
    expect(s.motivo).toContain('Panificação');
  });
  it('desconhecido → Outros / a classificar, com o motivo', () => {
    for (const nome of ['Xpto 3000', 'Insumo qualquer', '', '   ', '123']) {
      const s = sugerirCategoria(nome);
      expect(s, nome).toMatchObject({ chave: 'OUTROS', origem: 'nenhuma' });
      expect(s.motivo).toMatch(/Sem palavra conhecida/);
    }
  });
  it('é determinística: o mesmo nome dá sempre a mesma resposta', () => {
    for (const nome of ['Coxa de frango congelada', 'Combo hambúrguer e pão', 'Xpto']) {
      expect(sugerirCategoria(nome)).toEqual(sugerirCategoria(nome));
    }
  });
  it('as palavras do nome saem sem acento, no singular, só letras e números', () => {
    expect(palavrasDoNome('Pães, Limões & Flores 2x!')).toEqual(['pao', 'limao', 'flor', '2x']);
  });
});
