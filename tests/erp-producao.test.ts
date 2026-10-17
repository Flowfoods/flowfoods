/**
 * ERP 3.1 · regras PURAS da produção (sem banco): o código do lote, a faixa de rendimento de ±10%, a leitura de "concluir",
 * o custo do lote em fração exata (baixas reais ÷ produzido), a perda em R$, a validade, o atraso do quadro e as frases.
 */
import { describe, expect, it } from 'vitest';
import {
  codigoDoLote,
  custoDoLote,
  custoPorUnidadeDoLote,
  diasDeAtrasoDoLote,
  foiEstornado,
  fraseDoQueFalta,
  fraseSemPreco,
  formatarRendimento,
  lerChaveDoEnvio,
  lerConclusao,
  lerMotivo,
  perdaDoLote,
  quandoVence,
  rendimentoDoLote,
  sequenciaDoLote,
  situacaoDosInsumos,
  validadeDoLote,
  type ContextoDaConclusao,
} from '@/lib/erp/producao-campos';
import { lerParaDia } from '@/lib/erp/requisicao-campos';
import { centavosDaFracao, formatarFracao } from '@/lib/erp/unidades';
import type { Validades } from '@/lib/erp/validade';

const reais = (f: Parameters<typeof formatarFracao>[0]) => formatarFracao(f).replace(/ /g, ' ');
const VALIDADE: Validades = { principal: 'REFRIGERADO', minutos: { REFRIGERADO: 4320, CONGELADO: 43200 } };
const CTX: ContextoDaConclusao = { planejadoMilesimos: 5000, unidade: 'KG', validades: VALIDADE };
const lerC = (produzido: string, motivo = '', conservacao: unknown = '', escala = 'base', ctx = CTX) => lerConclusao({ produzido, escala, motivo, conservacao }, ctx);

describe('o código do lote', () => {
  it('AAMMDD-NN: a data planejada e a sequência do dia', () => {
    expect(codigoDoLote('2026-10-17', 1)).toBe('261017-01');
    expect(codigoDoLote('2026-01-05', 10)).toBe('260105-10');
    expect(codigoDoLote('2027-12-31', 123)).toBe('271231-123');
    expect(codigoDoLote('2027-12-31', 1234)).toBe('271231-1234');
  });
  it('lê a sequência de volta e recusa o que não é código', () => {
    expect(sequenciaDoLote('261017-07')).toBe(7);
    expect(sequenciaDoLote('261017-1234')).toBe(1234);
    expect(sequenciaDoLote('261017-7')).toBeNull();
    expect(sequenciaDoLote('abc')).toBeNull();
    expect(sequenciaDoLote('261017-12345')).toBeNull();
  });
});

describe('a chave do envio do formulário', () => {
  it('aceita texto curto e sem estranheza; o resto é sem chave', () => {
    expect(lerChaveDoEnvio('envio-abc123XYZ')).toBe('envio-abc123XYZ');
    expect(lerChaveDoEnvio('curta')).toBeNull();
    expect(lerChaveDoEnvio('com espaço aqui')).toBeNull();
    expect(lerChaveDoEnvio("x'; drop table".padEnd(20, 'a'))).toBeNull();
    expect(lerChaveDoEnvio('a'.repeat(65))).toBeNull();
    expect(lerChaveDoEnvio(42)).toBeNull();
    expect(lerChaveDoEnvio(undefined)).toBeNull();
  });
});

describe('o "para quando" é o mesmo da requisição: hoje até 14 dias à frente', () => {
  it('hoje, amanhã, dd/mm/aaaa e aaaa-mm-dd', () => {
    expect(lerParaDia('', '2026-10-17')).toEqual({ dia: '2026-10-17' });
    expect(lerParaDia('hoje', '2026-10-17')).toEqual({ dia: '2026-10-17' });
    expect(lerParaDia('amanha', '2026-10-17')).toEqual({ dia: '2026-10-18' });
    expect(lerParaDia('20/10/2026', '2026-10-17')).toEqual({ dia: '2026-10-20' });
    expect(lerParaDia('2026-10-31', '2026-10-17')).toEqual({ dia: '2026-10-31' });
  });
  it('recusa passado, mais de 14 dias e lixo, com frase', () => {
    expect(lerParaDia('2026-10-16', '2026-10-17')).toEqual({ erro: 'Para quando: de hoje em diante.' });
    expect(lerParaDia('2026-11-01', '2026-10-17')).toEqual({ erro: 'Para quando: até 14 dias à frente.' });
    expect(lerParaDia('32/13/2026', '2026-10-17')).toEqual({ erro: 'Data inválida: use dd/mm/aaaa.' });
    expect(lerParaDia(7, '2026-10-17')).toEqual({ dia: '2026-10-17' });
  });
});

describe('rendimento: ±10% do planejado', () => {
  it('4,6 de 5 kg = 92%, dentro; 4,4 = 88%, fora; os 10% exatos ainda são dentro', () => {
    expect(rendimentoDoLote(5000, 4600)).toEqual({ rendimentoBp: 9200, diferencaMilesimos: 400, foraDaFaixa: false });
    expect(rendimentoDoLote(5000, 4400)).toMatchObject({ rendimentoBp: 8800, foraDaFaixa: true });
    expect(rendimentoDoLote(5000, 4500).foraDaFaixa).toBe(false);
    expect(rendimentoDoLote(5000, 4499).foraDaFaixa).toBe(true);
    expect(rendimentoDoLote(5000, 5500).foraDaFaixa).toBe(false);
    expect(rendimentoDoLote(5000, 5501).foraDaFaixa).toBe(true);
    expect(rendimentoDoLote(5000, 0)).toEqual({ rendimentoBp: 0, diferencaMilesimos: 5000, foraDaFaixa: true });
  });
  it('produzir mais que o planejado é diferença negativa', () => {
    expect(rendimentoDoLote(5000, 5200)).toEqual({ rendimentoBp: 10400, diferencaMilesimos: -200, foraDaFaixa: false });
  });
  it('a faixa é exata, sem float: nenhum número perto do limite erra', () => {
    for (const planejado of [1, 3, 7, 999, 1001, 3333, 10_000_000]) {
      for (let d = -3; d <= 3; d++) {
        const limite = (planejado * 10) / 100; // 10% exato (pode ter fração)
        const produzido = Math.max(0, Math.round(planejado - limite) + d);
        const r = rendimentoDoLote(planejado, produzido);
        const esperadoFora = Math.abs(produzido - planejado) * 10 > planejado;
        expect(r.foraDaFaixa, `${planejado} → ${produzido}`).toBe(esperadoFora);
      }
    }
  });
  it('texto do rendimento: 92%, 91,7%, 0%', () => {
    expect(formatarRendimento(9200)).toBe('92%');
    expect(formatarRendimento(9167)).toBe('91,7%');
    expect(formatarRendimento(0)).toBe('0%');
    expect(formatarRendimento(10400)).toBe('104%');
  });
});

describe('concluir: ler o que o cozinheiro digitou', () => {
  it('4,6 kg dentro da faixa: conclui sem motivo, conservação padrão = a principal (refrigerado, 3 dias)', () => {
    expect(lerC('4,6')).toEqual({ ok: true, conclusao: { produzidoMilesimos: 4600, motivo: null, conservacao: 'REFRIGERADO', validadeMin: 4320 } });
  });
  it('escolhe o congelado entre as aceitas da ficha; o que ela não aceita é recusado', () => {
    expect(lerC('4,6', '', 'CONGELADO')).toMatchObject({ ok: true, conclusao: { conservacao: 'CONGELADO', validadeMin: 43200 } });
    expect(lerC('4,6', '', 'SECO')).toMatchObject({ ok: false, erros: { conservacao: expect.stringMatching(/não aceita “Seco”/) } });
    expect(lerC('4,6', '', 'LIXO')).toMatchObject({ ok: false, erros: { conservacao: expect.any(String) } });
  });
  it('ficha sem validade conclui sem conservação (não trava)', () => {
    expect(lerC('4,6', '', '', 'base', { ...CTX, validades: null })).toEqual({ ok: true, conclusao: { produzidoMilesimos: 4600, motivo: null, conservacao: null, validadeMin: null } });
    expect(lerC('4,6', '', 'CONGELADO', 'base', { ...CTX, validades: null })).toMatchObject({ ok: true, conclusao: { conservacao: null } });
  });
  it('fora de ±10% pede o motivo (com os números na frase); com motivo grava', () => {
    expect(lerC('4,4')).toMatchObject({ ok: false, erros: { motivo: 'Saiu 4,4 kg de 5 kg planejados (88%): diga o motivo da diferença.' } });
    expect(lerC('5,6')).toMatchObject({ ok: false, erros: { motivo: expect.stringMatching(/112%/) } });
    expect(lerC('4,4', 'Evaporou mais')).toMatchObject({ ok: true, conclusao: { produzidoMilesimos: 4400, motivo: 'Evaporou mais' } });
    // Dentro da faixa o motivo é opcional, mas se vier, fica.
    expect(lerC('4,6', 'Ficou um pouco grosso')).toMatchObject({ ok: true, conclusao: { motivo: 'Ficou um pouco grosso' } });
  });
  it('0 = lote perdido: motivo obrigatório e sem conservação', () => {
    expect(lerC('0')).toMatchObject({ ok: false, erros: { motivo: expect.stringMatching(/Lote perdido/) } });
    expect(lerC('0', 'Queimou')).toEqual({ ok: true, conclusao: { produzidoMilesimos: 0, motivo: 'Queimou', conservacao: null, validadeMin: null } });
  });
  it('motivo de 1 ou 2 letras e de 201 letras é recusado', () => {
    expect(lerC('4,4', 'ab')).toMatchObject({ ok: false, erros: { motivo: expect.stringMatching(/3 letras/) } });
    expect(lerC('4,4', 'x'.repeat(201))).toMatchObject({ ok: false, erros: { motivo: expect.stringMatching(/200/) } });
    expect(lerC('4,4', 'x'.repeat(200))).toMatchObject({ ok: true });
  });
  it('acima do dobro do planejado é dedo errado; vazio, lixo e meio grama são recusados', () => {
    expect(lerC('10')).toMatchObject({ ok: false, erros: { motivo: expect.any(String) } }); // o dobro exato passa do tamanho, mas pede o motivo
    expect(lerC('10', 'Dobrei a receita')).toMatchObject({ ok: true, conclusao: { produzidoMilesimos: 10000 } });
    expect(lerC('10,001', 'x x x')).toMatchObject({ ok: false, erros: { produzido: expect.stringMatching(/passa do dobro do planejado \(5 kg\)/) } });
    expect(lerC('')).toMatchObject({ ok: false, erros: { produzido: expect.stringMatching(/Diga quanto saiu/) } });
    expect(lerC('abc')).toMatchObject({ ok: false, erros: { produzido: expect.any(String) } });
    expect(lerC('-1')).toMatchObject({ ok: false, erros: { produzido: expect.any(String) } });
    expect(lerC('0,5', '', '', 'menor')).toMatchObject({ ok: false, erros: { produzido: expect.any(String) } });
  });
  it('em gramas: 4600 g = 4,6 kg', () => {
    expect(lerC('4600', '', '', 'menor')).toMatchObject({ ok: true, conclusao: { produzidoMilesimos: 4600 } });
  });
  it('em litros e em unidades', () => {
    expect(lerC('1900', '', '', 'menor', { planejadoMilesimos: 2000, unidade: 'L', validades: null })).toMatchObject({ ok: true, conclusao: { produzidoMilesimos: 1900 } });
    expect(lerC('18', '', '', 'menor', { planejadoMilesimos: 20_000, unidade: 'UN', validades: null })).toMatchObject({ ok: true, conclusao: { produzidoMilesimos: 18_000 } });
  });
});

describe('o custo do lote: o que SAIU do livro, em fração exata', () => {
  const baixas = [
    { insumoId: 'ch', nome: 'Queijo cheddar', unidade: 'KG' as const, quantidadeMilesimos: -2500, valorCentavos: -10000 },
    { insumoId: 'le', nome: 'Leite', unidade: 'L' as const, quantidadeMilesimos: -2500, valorCentavos: -1250 },
    { insumoId: 'ce', nome: 'Cebola', unidade: 'KG' as const, quantidadeMilesimos: -885, valorCentavos: -531 },
  ];
  it('R$ 117,81 ÷ 4,6 kg = R$ 25,61/kg (a fração é exata; a tela arredonda uma vez)', () => {
    const c = custoDoLote(baixas);
    expect(c).toEqual({ totalCentavos: 11781, semPreco: [], saiuAlgo: true });
    const f = custoPorUnidadeDoLote(c.totalCentavos, 4600)!;
    expect(f).toEqual({ num: 58905n, den: 23n }); // 11.781.000 ÷ 4.600 reduzida: nada arredondado antes da tela
    expect(reais(f)).toBe('R$ 25,61');
    expect(centavosDaFracao(f)).toBe(2561n);
  });
  it('o custo por unidade não depende de um arredondamento prévio: 1 centavo ÷ 3 kg não vira zero', () => {
    const f = custoPorUnidadeDoLote(1, 3000)!;
    expect(f.num * 3n).toBe(f.den); // 1/3 de centavo por kg, exato
    expect(reais(f)).toMatch(/0,003/);
    expect(custoPorUnidadeDoLote(100, 0)).toBeNull();
  });
  it('a devolução e o estorno do livro já vêm somados: só o líquido conta', () => {
    const c = custoDoLote([{ insumoId: 'ch', nome: 'Queijo cheddar', unidade: 'KG', quantidadeMilesimos: -1500, valorCentavos: -6000 }]);
    expect(c.totalCentavos).toBe(6000);
  });
  it('insumo que saiu sem valor deixa o custo incompleto e vai nominalmente para a frase', () => {
    const c = custoDoLote([baixas[0], { ...baixas[1], valorCentavos: 0 }, baixas[2]]);
    expect(c.totalCentavos).toBe(10531);
    expect(c.semPreco).toEqual([{ insumoId: 'le', nome: 'Leite' }]);
    expect(fraseSemPreco(c.semPreco.map((s) => s.nome))).toBe('sem contar Leite');
    expect(fraseSemPreco(['Leite', 'Cebola'])).toBe('sem contar Leite e Cebola');
    expect(fraseSemPreco(['Leite', 'Cebola', 'Sal'])).toBe('sem contar Leite, Cebola e Sal');
  });
  it('insumo que saiu e voltou por inteiro não é "sem preço" nem conta como saída', () => {
    const c = custoDoLote([{ insumoId: 'ch', nome: 'Queijo cheddar', unidade: 'KG', quantidadeMilesimos: 0, valorCentavos: 0 }]);
    expect(c).toEqual({ totalCentavos: 0, semPreco: [], saiuAlgo: false });
    expect(custoDoLote([])).toEqual({ totalCentavos: 0, semPreco: [], saiuAlgo: false });
  });
  it('a diferença de rendimento em R$: 400 g de 5 kg = R$ 9,42; lote perdido = o custo todo; produziu a mais = negativo', () => {
    expect(centavosDaFracao(perdaDoLote(11781, 5000, 4600))).toBe(942n);
    expect(reais(perdaDoLote(11781, 5000, 4600))).toBe('R$ 9,42');
    expect(centavosDaFracao(perdaDoLote(11781, 5000, 0))).toBe(11781n);
    expect(perdaDoLote(11781, 5000, 5200).num).toBeLessThan(0n);
  });
});

describe('o quadro: atraso, estado e frases', () => {
  it('só planejada e em produção atrasam, pelo dia planejado (datas do Rio)', () => {
    expect(diasDeAtrasoDoLote({ status: 'PLANEJADA', dataPlanejada: '2026-10-15' }, '2026-10-17')).toBe(2);
    expect(diasDeAtrasoDoLote({ status: 'EM_EXECUCAO', dataPlanejada: '2026-10-16' }, '2026-10-17')).toBe(1);
    expect(diasDeAtrasoDoLote({ status: 'PLANEJADA', dataPlanejada: '2026-10-17' }, '2026-10-17')).toBe(0);
    expect(diasDeAtrasoDoLote({ status: 'PLANEJADA', dataPlanejada: '2026-10-20' }, '2026-10-17')).toBe(0);
    expect(diasDeAtrasoDoLote({ status: 'CONCLUIDA', dataPlanejada: '2026-10-01' }, '2026-10-17')).toBe(0);
    expect(diasDeAtrasoDoLote({ status: 'CANCELADA', dataPlanejada: '2026-10-01' }, '2026-10-17')).toBe(0);
    expect(diasDeAtrasoDoLote({ status: 'PLANEJADA', dataPlanejada: null }, '2026-10-17')).toBe(0);
  });
  it('estornada é CANCELADA que guarda a conclusão', () => {
    expect(foiEstornado({ status: 'CANCELADA', concluidaEm: new Date() })).toBe(true);
    expect(foiEstornado({ status: 'CANCELADA', concluidaEm: null })).toBe(false);
    expect(foiEstornado({ status: 'CONCLUIDA', concluidaEm: new Date() })).toBe(false);
  });
  it('a situação dos insumos no cartão', () => {
    expect(situacaoDosInsumos('ABERTA', 12)).toBe('Insumos por entregar (#12)');
    expect(situacaoDosInsumos('PARCIAL', 12)).toBe('Insumos em entrega (#12)');
    expect(situacaoDosInsumos('ATENDIDA', 12)).toBe('Insumos entregues (#12)');
    expect(situacaoDosInsumos('CANCELADA', 12)).toBe('Requisição cancelada (#12)');
    expect(situacaoDosInsumos(null, null)).toBe('Insumos por entregar');
  });
  it('por que ainda não conclui: o que falta sair pela requisição', () => {
    expect(fraseDoQueFalta([{ nome: 'Cebola', unidade: 'KG', faltaMilesimos: 885 }, { nome: 'Leite', unidade: 'L', faltaMilesimos: 0 }], 12)).toBe('Faltam sair 885 g de Cebola pela requisição #12: entregue ou encerre o resto.');
    expect(fraseDoQueFalta([{ nome: 'Cebola', unidade: 'KG', faltaMilesimos: 885 }, { nome: 'Leite', unidade: 'L', faltaMilesimos: 2500 }, { nome: 'Sal', unidade: 'KG', faltaMilesimos: 10 }], 3)).toBe(
      'Faltam sair 885 g de Cebola, 2,5 L de Leite e 10 g de Sal pela requisição #3: entregue ou encerre o resto.',
    );
    expect(fraseDoQueFalta([{ nome: 'Cebola', unidade: 'KG', faltaMilesimos: 0 }], 12)).toBeNull();
  });
  it('o motivo de cancelar e estornar: 3 a 200 letras', () => {
    expect(lerMotivo('  Mudou o cardápio  ')).toEqual({ ok: true, motivo: 'Mudou o cardápio' });
    expect(lerMotivo('ab')).toMatchObject({ ok: false });
    expect(lerMotivo('')).toMatchObject({ ok: false });
    expect(lerMotivo(undefined)).toMatchObject({ ok: false });
    expect(lerMotivo('x'.repeat(201))).toMatchObject({ ok: false });
    expect(lerMotivo('x'.repeat(200))).toMatchObject({ ok: true });
  });
});

describe('a validade do lote', () => {
  it('concluído às 10:00 de 17/10 (Rio): refrigerado vence 20/10 às 10:00; congelado, 16/11', () => {
    const concluida = new Date('2026-10-17T13:00:00Z');
    expect(validadeDoLote(concluida, 4320).toISOString()).toBe('2026-10-20T13:00:00.000Z');
    expect(quandoVence(validadeDoLote(concluida, 4320))).toBe('20/10 às 10:00');
    expect(validadeDoLote(concluida, 43200).toISOString()).toBe('2026-11-16T13:00:00.000Z');
    expect(quandoVence(validadeDoLote(concluida, 43200))).toBe('16/11 às 10:00');
    // Pista fria em horas.
    expect(validadeDoLote(concluida, 6 * 60).toISOString()).toBe('2026-10-17T19:00:00.000Z');
  });
});
