/**
 * ERP 1.6 · Estoque, regras puras: estado da loja pela abertura, leitura do
 * que se contou (embalagens fechadas + solto, kg/g, vazio ≠ zero), valor pelo
 * custo de referência (um arredondamento por item, pendente sem custo), efeito
 * da nota no estoque (decisão 68), entradas e estorno da nota, saldo
 * antes/depois do livro-razão.
 */
import { describe, expect, it } from 'vitest';
import {
  aplicarNosSaldos,
  camposDaContagem,
  chaveDoSaldo,
  efeitoDaNota,
  entradasDaNota,
  estouroDoRazao,
  LIMITE_DO_INTEIRO,
  TETO_DA_CONTAGEM,
  TETO_DO_VALOR_DO_ITEM,
  totalAcimaDoLimite,
  valorAcimaDoTeto,
  estadoDoEstoque,
  estornoDe,
  fraseDoEfeito,
  fraseDoQueFalta,
  lerContagem,
  mesmoEfeito,
  perguntaEmbalagens,
  quantidadeComSinal,
  resumoDaContagem,
  somarValores,
  textoDaContagem,
  valorDaQuantidade,
} from '@/lib/erp/estoque-campos';
import { custoPorUnidade } from '@/lib/erp/unidades';
import { apagarRascunho, destinoDoRascunho, guardarRascunho, lerRascunhos, VALIDADE_DO_RASCUNHO_MS } from '@/components/erp/telas/estoque/rascunho';

const CHEDDAR = { unidade: 'KG' as const, embalagemConteudoMilesimos: 5000 };
const PAO = { unidade: 'UN' as const, embalagemConteudoMilesimos: 12000 };
const ARROZ_1KG = { unidade: 'KG' as const, embalagemConteudoMilesimos: 1000 };

const sp = (t: string) => t.replace(/ /g, ' ');

describe('ERP 1.6 · estado do estoque da loja', () => {
  it('sem abertura (ou descartada) = não aberto; contando = em contagem; concluída = aberto', () => {
    expect(estadoDoEstoque(null)).toBe('NAO_ABERTO');
    expect(estadoDoEstoque({ status: 'CANCELADA' })).toBe('NAO_ABERTO');
    expect(estadoDoEstoque({ status: 'ABERTA' })).toBe('EM_CONTAGEM');
    expect(estadoDoEstoque({ status: 'FECHADA' })).toBe('ABERTO');
  });
});

describe('ERP 1.6 · ler o que se contou', () => {
  it('3 caixas de 5 kg + 2,4 kg solto = 17,4 kg (17400 milésimos)', () => {
    const r = lerContagem({ embalagens: '3', solto: '2,4', escala: 'base' }, CHEDDAR);
    expect(r).toEqual({ ok: true, lida: { contadoMilesimos: 17400, embalagensMilesimos: 3000, soltoMilesimos: 2400, escala: 'base' } });
  });

  it('solto em gramas: 350 g = 350 milésimos de kg; em g só inteiro', () => {
    expect(lerContagem({ embalagens: '', solto: '350', escala: 'menor' }, CHEDDAR)).toMatchObject({ ok: true, lida: { contadoMilesimos: 350, escala: 'menor' } });
    expect(lerContagem({ embalagens: '', solto: '0,5', escala: 'menor' }, CHEDDAR)).toEqual({ ok: false, erros: { solto: 'Em g, só número inteiro (ex.: 350).' } });
  });

  it('meia caixa conta (1,5 × 5 kg = 7,5 kg); pão por pacote de 12 un', () => {
    expect(lerContagem({ embalagens: '1,5', solto: '', escala: 'base' }, CHEDDAR)).toMatchObject({ ok: true, lida: { contadoMilesimos: 7500 } });
    expect(lerContagem({ embalagens: '2', solto: '5', escala: 'base' }, PAO)).toMatchObject({ ok: true, lida: { contadoMilesimos: 29000 } });
  });

  it('vazio é NÃO CONTADO (null); "0" é contagem (zero)', () => {
    expect(lerContagem({ embalagens: '', solto: '', escala: 'base' }, CHEDDAR)).toMatchObject({ ok: true, lida: { contadoMilesimos: null } });
    expect(lerContagem({ embalagens: '', solto: '0', escala: 'base' }, CHEDDAR)).toMatchObject({ ok: true, lida: { contadoMilesimos: 0 } });
    expect(lerContagem({ embalagens: '0', solto: '', escala: 'base' }, CHEDDAR)).toMatchObject({ ok: true, lida: { contadoMilesimos: 0 } });
  });

  it('número inválido, sinal e embalagem onde não se pergunta são recusados com frase', () => {
    expect(lerContagem({ embalagens: '-1', solto: '', escala: 'base' }, CHEDDAR)).toEqual({ ok: false, erros: { embalagens: 'Embalagens: número como 3 ou 1,5.' } });
    expect(lerContagem({ embalagens: '', solto: '2,4567', escala: 'base' }, CHEDDAR)).toEqual({ ok: false, erros: { solto: 'Número como 2,4 (kg), até 3 casas.' } });
    expect(perguntaEmbalagens(ARROZ_1KG)).toBe(false);
    expect(lerContagem({ embalagens: '2', solto: '', escala: 'base' }, ARROZ_1KG)).toMatchObject({ ok: false });
    expect(lerContagem({ embalagens: '', solto: '9999999', escala: 'base' }, CHEDDAR)).toMatchObject({ ok: false });
  });

  it('o que foi digitado volta para os campos como estava (outra sessão, outra pessoa)', () => {
    expect(camposDaContagem({ unidade: 'KG', embalagensMilesimos: 3000, soltoMilesimos: 2400, escalaDigitada: 'base' })).toEqual({ embalagens: '3', solto: '2,4', escala: 'base' });
    expect(camposDaContagem({ unidade: 'KG', embalagensMilesimos: 1500, soltoMilesimos: 350, escalaDigitada: 'menor' })).toEqual({ embalagens: '1,5', solto: '350', escala: 'menor' });
    expect(camposDaContagem({ unidade: 'KG', embalagensMilesimos: null, soltoMilesimos: null, escalaDigitada: null })).toEqual({ embalagens: '', solto: '', escala: 'base' });
  });

  it('o texto da contagem mostra a conta: "3 × Caixa 5 kg + 2,4 kg = 17,4 kg"', () => {
    expect(textoDaContagem({ unidade: 'KG', contadoMilesimos: 17400, embalagensMilesimos: 3000, soltoMilesimos: 2400, embalagemSnapshot: 'Caixa 5 kg' })).toBe('3 × Caixa 5 kg + 2,4 kg = 17,4 kg');
    expect(textoDaContagem({ unidade: 'KG', contadoMilesimos: 0, embalagensMilesimos: null, soltoMilesimos: 0, embalagemSnapshot: null })).toBe('0 g');
    expect(textoDaContagem({ unidade: 'KG', contadoMilesimos: null, embalagensMilesimos: null, soltoMilesimos: null, embalagemSnapshot: null })).toBe('Não contado');
  });

  it('resumo: contados, zerados, não contados e quanto falta', () => {
    const r = resumoDaContagem([{ contadoMilesimos: 17400 }, { contadoMilesimos: 0 }, { contadoMilesimos: null }, { contadoMilesimos: null }]);
    expect(r).toEqual({ total: 4, contados: 2, zerados: 1, naoContados: 2 });
    expect(fraseDoQueFalta(r)).toBe('Faltam 2 de 4');
    expect(fraseDoQueFalta({ total: 3, contados: 3, zerados: 0, naoContados: 0 })).toBe('Todos os 3 contados');
  });
});

describe('ERP 1.6 · valor pelo custo de referência', () => {
  it('17,4 kg a R$ 89,90 + R$ 5,00 por 5 kg = R$ 330,25 (um arredondamento, exato)', () => {
    // (8990 + 500) / 5000 centavos por milésimo × 17400 = 33025,2 → 33025.
    const porKg = custoPorUnidade({ centavos: 9490, milesimos: 5000 });
    expect(valorDaQuantidade(porKg, 17400)).toBe(33025);
  });

  it('meio centavo arredonda para cima; zero vale zero; sem custo é pendente (null), nunca R$ 0,00', () => {
    const porUn = custoPorUnidade({ centavos: 1, milesimos: 2000 }); // R$ 0,005 por un
    expect(valorDaQuantidade(porUn, 1000)).toBe(1);
    expect(valorDaQuantidade(porUn, 0)).toBe(0);
    expect(valorDaQuantidade(null, 5000)).toBeNull();
    expect(valorDaQuantidade(porUn, -1000)).toBe(-1);
  });

  it('o total soma os itens arredondados e conta os pendentes à parte', () => {
    expect(somarValores([33025, null, 0, 120])).toEqual({ centavos: 33145, pendentes: 1 });
  });
});

describe('ERP 1.6 · a nota e o estoque (decisão 68)', () => {
  const abertura = { abertoEm: new Date('2026-10-19T13:00:00Z') }; // 10:00 no Rio
  const nota = (lancadaEm: string, entradaEm: string, status = 'LANCADA') => ({ status, lancadaEm: new Date(lancadaEm), entradaEm });

  it('loja sem estoque aberto: não mexe (a contagem de abertura inclui)', () => {
    expect(efeitoDaNota(nota('2026-10-19T14:00:00Z', '2026-10-19'), null)).toEqual({ movimenta: false, motivo: 'nao-aberto' });
  });

  it('lançada depois da abertura, com data do dia da abertura em diante: entra', () => {
    expect(efeitoDaNota(nota('2026-10-19T14:00:00Z', '2026-10-19'), abertura)).toEqual({ movimenta: true });
    expect(efeitoDaNota(nota('2026-10-21T14:00:00Z', '2026-10-20'), abertura)).toEqual({ movimenta: true });
  });

  it('lançada antes de concluir a abertura: já estava na contagem', () => {
    expect(efeitoDaNota(nota('2026-10-19T12:59:59Z', '2026-10-19'), abertura)).toEqual({ movimenta: false, motivo: 'lancada-antes' });
  });

  it('data anterior à abertura digitada depois: já estava na contagem (não movimenta)', () => {
    const e = efeitoDaNota(nota('2026-10-20T14:00:00Z', '2026-10-18'), abertura);
    expect(e).toEqual({ movimenta: false, motivo: 'data-anterior' });
    expect(fraseDoEfeito(e, 'Vila da Penha', abertura.abertoEm)).toBe(
      'Não mexe no estoque: a data da nota é anterior à abertura do estoque da Vila da Penha (19/10/2026). A mercadoria já estava na loja e entrou na contagem.',
    );
  });

  it('a data da abertura é a do Rio (23h no Rio ainda é o mesmo dia)', () => {
    const tarde = { abertoEm: new Date('2026-10-20T01:30:00Z') }; // 19/10 22:30 no Rio
    expect(efeitoDaNota(nota('2026-10-20T02:00:00Z', '2026-10-19'), tarde)).toEqual({ movimenta: true });
  });

  it('cancelada nunca mexe', () => {
    expect(efeitoDaNota(nota('2026-10-19T14:00:00Z', '2026-10-19', 'CANCELADA'), abertura)).toEqual({ movimenta: false, motivo: 'cancelada' });
  });

  it('entrada por item: valor do item + frete rateado; chave por versão da nota; item sem insumo fica de fora', () => {
    const e = entradasDaNota({ id: 'n1', lojaId: 'vp', rotulo: 'Nota 4521-1', versao: 7 }, [
      { insumoId: 'ched', insumoNome: 'Cheddar', unidade: 'KG', quantidadeMilesimos: 15000, valorCentavos: 22450, freteRateadoCentavos: 407, embalagem: 'Caixa 5 kg' },
      { insumoId: null, insumoNome: '?', unidade: 'UN', quantidadeMilesimos: 1000, valorCentavos: 100, freteRateadoCentavos: 0, embalagem: '' },
    ]);
    expect(e).toEqual([
      {
        lojaId: 'vp',
        insumoId: 'ched',
        tipo: 'ENTRADA_COMPRA',
        quantidadeMilesimos: 15000,
        valorCentavos: 22857,
        insumoNome: 'Cheddar',
        unidade: 'KG',
        motivo: 'Nota 4521-1 · Caixa 5 kg',
        chave: 'compra:n1:7:0',
        notaId: 'n1',
      },
    ]);
  });

  it('estorno é o espelho exato, aponta o original e tem chave própria', () => {
    const e = estornoDe(
      { id: 'm1', lojaId: 'vp', insumoId: 'ched', tipo: 'ENTRADA_COMPRA', quantidadeMilesimos: 15000, valorCentavos: 22857, insumoNomeSnapshot: 'Cheddar', unidadeSnapshot: 'KG', notaId: 'n1', contagemItemId: null },
      'Nota 4521-1 cancelada: devolvida',
    );
    expect(e).toMatchObject({ quantidadeMilesimos: -15000, valorCentavos: -22857, estornoDeId: 'm1', chave: 'estorno:m1', notaId: 'n1', tipo: 'ENTRADA_COMPRA' });
  });

  it('editar sem mudar o efeito (mesmas quantidades e valores, outra ordem) não mexe no razão', () => {
    const a = [
      { lojaId: 'vp', insumoId: 'x', quantidadeMilesimos: 1000, valorCentavos: 10 },
      { lojaId: 'vp', insumoId: 'y', quantidadeMilesimos: 2000, valorCentavos: 20 },
    ];
    expect(mesmoEfeito(a, [a[1], a[0]])).toBe(true);
    expect(mesmoEfeito(a, [a[0]])).toBe(false);
    expect(mesmoEfeito(a, [a[0], { ...a[1], valorCentavos: 21 }])).toBe(false);
  });
});

describe('ERP 1.6 · saldo antes + quantidade = depois (a conta do CHECK do banco)', () => {
  it('na ordem (loja, insumo, chegada), com o saldo de partida de cada par', () => {
    const saldos = new Map([[chaveDoSaldo('vp', 'x'), { quantidadeMilesimos: 5000, valorCentavos: 500 }]]);
    const mov = (insumoId: string, q: number, v: number) => ({ lojaId: 'vp', insumoId, tipo: 'ENTRADA_COMPRA' as const, quantidadeMilesimos: q, valorCentavos: v, insumoNome: insumoId, unidade: 'KG' as const, motivo: null, chave: `${insumoId}${q}` });
    const { linhas, finais } = aplicarNosSaldos(saldos, [mov('y', 1000, 100), mov('x', 2000, 200), mov('x', -500, -50)]);
    expect(linhas.map((l) => [l.insumoId, l.saldoAntesMilesimos, l.saldoDepoisMilesimos])).toEqual([
      ['x', 5000, 7000],
      ['x', 7000, 6500],
      ['y', 0, 1000],
    ]);
    for (const l of linhas) expect(l.saldoAntesMilesimos + l.quantidadeMilesimos).toBe(l.saldoDepoisMilesimos);
    expect(finais.get(chaveDoSaldo('vp', 'x'))).toEqual({ quantidadeMilesimos: 6500, valorCentavos: 650 });
  });

  it('quantidade com sinal: "+15 kg" e "−2,5 kg"', () => {
    expect(sp(quantidadeComSinal(15000, 'KG'))).toBe('+15 kg');
    expect(sp(quantidadeComSinal(-2500, 'KG'))).toBe('−2,5 kg');
  });
});

describe('herança a da 1.6: tetos que cabem no INTEGER, com frase', () => {
  it('a contagem aceita até 100 mil kg/L/un por item; um milésimo a mais é recusado com a frase', () => {
    expect(TETO_DA_CONTAGEM).toBe(100_000_000);
    expect(lerContagem({ embalagens: '', solto: '100000', escala: 'base' }, { unidade: 'KG', embalagemConteudoMilesimos: null })).toMatchObject({ ok: true, lida: { contadoMilesimos: 100_000_000 } });
    expect(lerContagem({ embalagens: '20000', solto: '', escala: 'base' }, CHEDDAR)).toMatchObject({ ok: true, lida: { contadoMilesimos: 100_000_000 } });
    const r = lerContagem({ embalagens: '20000', solto: '0,001', escala: 'base' }, CHEDDAR);
    expect(r).toMatchObject({ ok: false, erros: { solto: expect.stringMatching(/máximo de uma contagem/) } });
    // O antigo teto (1 milhão de kg) caía aqui.
    expect(lerContagem({ embalagens: '', solto: '1000000', escala: 'base' }, { unidade: 'KG', embalagemConteudoMilesimos: null }).ok).toBe(false);
  });

  it('valor de um item: até R$ 1 milhão passa; acima, a frase com o nome', () => {
    expect(valorAcimaDoTeto('Cheddar', TETO_DO_VALOR_DO_ITEM)).toBeNull();
    expect(valorAcimaDoTeto('Cheddar', null)).toBeNull();
    expect(valorAcimaDoTeto('Cheddar', TETO_DO_VALOR_DO_ITEM + 1)).toMatch(/“Cheddar” daria mais de R\$ 1\.000\.000,00/);
    // 100 mil kg (o teto) × R$ 26,75/kg = R$ 2.675.000: a contagem passa, o valor não.
    const valor = valorDaQuantidade(custoPorUnidade({ centavos: 2675, milesimos: 1000 }), TETO_DA_CONTAGEM)!;
    expect(valor).toBe(267_500_000);
    expect(valorAcimaDoTeto('Carne', valor)).not.toBeNull();
    expect(totalAcimaDoLimite(LIMITE_DO_INTEIRO)).toBeNull();
    expect(totalAcimaDoLimite(LIMITE_DO_INTEIRO + 1)).toMatch(/R\$ 21 milhões/);
  });

  it('razão: movimento ou saldo que passaria do INTEGER vira a frase (no limite exato, passa)', () => {
    const base = { lojaId: 'l', insumoId: 'i', tipo: 'ENTRADA_COMPRA' as const, insumoNome: 'Guardanapo', unidade: 'UN' as const, motivo: null, chave: 'k' };
    const saldos = new Map([[chaveDoSaldo('l', 'i'), { quantidadeMilesimos: LIMITE_DO_INTEIRO - 10, valorCentavos: 0 }]]);
    const cabe = aplicarNosSaldos(saldos, [{ ...base, quantidadeMilesimos: 10, valorCentavos: 5 }]);
    expect(estouroDoRazao(cabe.linhas, cabe.finais)).toBeNull();
    const passa = aplicarNosSaldos(saldos, [{ ...base, quantidadeMilesimos: 11, valorCentavos: 5 }]);
    expect(estouroDoRazao(passa.linhas, passa.finais)).toMatch(/“Guardanapo” passaria do limite do sistema/);
    const valor = aplicarNosSaldos(new Map([[chaveDoSaldo('l', 'i'), { quantidadeMilesimos: 0, valorCentavos: LIMITE_DO_INTEIRO }]]), [{ ...base, quantidadeMilesimos: 1, valorCentavos: 1 }]);
    expect(estouroDoRazao(valor.linhas, valor.finais)).not.toBeNull();
  });
});

describe('herança b da 1.6: rascunho local do número que falhou ao salvar', () => {
  const memoria = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  };
  const campos = (solto: string) => ({ embalagens: '', solto, escala: 'base' });

  it('guarda por contagem e item, com a versão; salvar apaga; vencido some', () => {
    const a = memoria();
    guardarRascunho('c1', 'i1', { campos: campos('12'), versao: 3 }, 1000, a);
    guardarRascunho('c1', 'i2', { campos: campos('4'), versao: 0 }, 1000, a);
    guardarRascunho('c2', 'i1', { campos: campos('9'), versao: 1 }, 1000, a);
    expect(lerRascunhos('c1', 2000, a)).toEqual({ i1: { campos: campos('12'), versao: 3, em: 1000 }, i2: { campos: campos('4'), versao: 0, em: 1000 } });
    apagarRascunho('c1', 'i1', a);
    expect(Object.keys(lerRascunhos('c1', 2000, a))).toEqual(['i2']);
    expect(lerRascunhos('c1', 1000 + VALIDADE_DO_RASCUNHO_MS + 1, a)).toEqual({});
    expect(a.m.has('ff-contagem:c1')).toBe(false);
    expect(Object.keys(lerRascunhos('c2', 2000, a))).toEqual(['i1']);
  });

  it('sem localStorage (ou com lixo) a tela segue: nada quebra', () => {
    expect(lerRascunhos('c1', 0, null)).toEqual({});
    expect(() => guardarRascunho('c1', 'i1', { campos: campos('1'), versao: 0 }, 0, null)).not.toThrow();
    const a = memoria();
    a.setItem('ff-contagem:c1', '{"i1":{"campos":{"solto":5},"versao":"x"}');
    expect(lerRascunhos('c1', 0, a)).toEqual({});
    const cheio = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); }, removeItem: () => {} };
    expect(() => guardarRascunho('c1', 'i1', { campos: campos('1'), versao: 0 }, 0, cheio)).not.toThrow();
  });

  it('ao abrir: o servidor já tem o mesmo número = descarta; senão reenvia com a versão do rascunho (o servidor dá conflito se o item andou)', () => {
    const r = { campos: campos('12'), versao: 3, em: 0 };
    expect(destinoDoRascunho(r, { campos: campos('12'), versao: 4 })).toBe('descartar');
    expect(destinoDoRascunho(r, { campos: campos(''), versao: 3 })).toBe('reenviar');
    // Alguém salvou 10 depois (versão 5): reenviar com a versão 3 = conflito no servidor, nunca sobrescreve.
    expect(destinoDoRascunho(r, { campos: campos('10'), versao: 5 })).toBe('reenviar');
  });
});
