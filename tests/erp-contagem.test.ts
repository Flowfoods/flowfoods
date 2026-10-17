/**
 * ERP 1.7 · Contagem do dia a dia, regras puras: período de apuração
 * (mensal, quinzenal, semanal), janela do fechamento, curva ABC e frequência,
 * o que contar hoje, prazo e estado, divergência (contado × esperado; nota no
 * meio), fecha sozinha, ajuste = contado − esperado com valor exato,
 * cobertura × piso e o que falta, regras da loja.
 */
import { describe, expect, it } from 'vitest';
import {
  ajustesDaContagem,
  camposDasRegras,
  coberturaDe,
  coberturaDoPeriodo,
  curvaAbc,
  divergenciaDoItem,
  estadoDaContagem,
  fechaSozinha,
  fraseAbaixoDoPiso,
  janelaDoFechamento,
  lerRegras,
  prazoDoCiclo,
  REGRAS_PADRAO,
  situacaoDoItem,
  somaDasDivergencias,
  sugerido,
} from '@/lib/erp/contagem-campos';
import { periodoAnteriorA, periodoDaData } from '@/lib/erp/periodo-campos';
import { custoPorUnidade } from '@/lib/erp/unidades';

const sp = (s: string) => s.replace(/ /g, ' ');
// Cheddar: (R$ 89,90 + R$ 5,00) ÷ 5 kg = R$ 18,98/kg.
const CHEDDAR = custoPorUnidade({ centavos: 9490, milesimos: 5000 });

describe('período de apuração (configuração do parceiro)', () => {
  it('mensal no dia 1: o mês civil, com nome', () => {
    expect(periodoDaData({ tipo: 'MENSAL', diaInicio: 1 }, '2026-10-16')).toEqual({ inicio: '2026-10-01', fim: '2026-10-31', nome: 'Outubro de 2026' });
    expect(periodoDaData({ tipo: 'MENSAL', diaInicio: 1 }, '2026-02-28')).toMatchObject({ inicio: '2026-02-01', fim: '2026-02-28' });
    expect(periodoDaData({ tipo: 'MENSAL', diaInicio: 1 }, '2026-12-31')).toMatchObject({ inicio: '2026-12-01', fim: '2026-12-31' });
  });

  it('mensal começando no dia 15: de 15 a 14 do mês seguinte (virada de ano inclusive)', () => {
    expect(periodoDaData({ tipo: 'MENSAL', diaInicio: 15 }, '2026-10-16')).toEqual({ inicio: '2026-10-15', fim: '2026-11-14', nome: '15/10 a 14/11' });
    expect(periodoDaData({ tipo: 'MENSAL', diaInicio: 15 }, '2026-10-14')).toMatchObject({ inicio: '2026-09-15', fim: '2026-10-14' });
    expect(periodoDaData({ tipo: 'MENSAL', diaInicio: 15 }, '2027-01-03')).toMatchObject({ inicio: '2026-12-15', fim: '2027-01-14' });
  });

  it('quinzenal: 1–15 e 16–fim do mês', () => {
    expect(periodoDaData({ tipo: 'QUINZENAL', diaInicio: 1 }, '2026-10-15')).toMatchObject({ inicio: '2026-10-01', fim: '2026-10-15' });
    expect(periodoDaData({ tipo: 'QUINZENAL', diaInicio: 1 }, '2026-10-16')).toMatchObject({ inicio: '2026-10-16', fim: '2026-10-31' });
    expect(periodoDaData({ tipo: 'QUINZENAL', diaInicio: 1 }, '2026-02-20')).toMatchObject({ inicio: '2026-02-16', fim: '2026-02-28' });
  });

  it('semanal: dia 6 = sábado a sexta; 1 = segunda; acima de 7 vale segunda', () => {
    // 16/10/2026 é sexta.
    expect(periodoDaData({ tipo: 'SEMANAL', diaInicio: 6 }, '2026-10-16')).toEqual({ inicio: '2026-10-10', fim: '2026-10-16', nome: 'Semana de 10/10 a 16/10' });
    expect(periodoDaData({ tipo: 'SEMANAL', diaInicio: 6 }, '2026-10-17')).toMatchObject({ inicio: '2026-10-17', fim: '2026-10-23' });
    expect(periodoDaData({ tipo: 'SEMANAL', diaInicio: 1 }, '2026-10-16')).toMatchObject({ inicio: '2026-10-12', fim: '2026-10-18' });
    expect(periodoDaData({ tipo: 'SEMANAL', diaInicio: 20 }, '2026-10-16')).toMatchObject({ inicio: '2026-10-12' });
  });

  it('anterior e janela do fechamento: abre 2 dias antes do fim e segue aberta depois', () => {
    const out = periodoDaData({ tipo: 'MENSAL', diaInicio: 1 }, '2026-10-16');
    expect(periodoAnteriorA([{ vigenteDesde: '2020-01-01', tipo: 'MENSAL', diaInicio: 1 }], [], out)).toMatchObject({ inicio: '2026-09-01', fim: '2026-09-30' });
    expect(janelaDoFechamento(out, '2026-10-28')).toEqual({ pode: false, abreEm: '2026-10-29' });
    expect(janelaDoFechamento(out, '2026-10-29').pode).toBe(true);
    expect(janelaDoFechamento(out, '2026-11-03').pode).toBe(true);
  });
});

describe('curva ABC, frequência e o que contar hoje', () => {
  it('A até 80 % do valor (o que cruza fica em A), B até 95 %, C o resto; sem preço e zero = C', () => {
    const c = curvaAbc([
      { insumoId: 'carne', valorCentavos: 70_00 },
      { insumoId: 'cheddar', valorCentavos: 15_00 },
      { insumoId: 'pao', valorCentavos: 10_00 },
      { insumoId: 'ketchup', valorCentavos: 5_00 },
      { insumoId: 'batata', valorCentavos: null },
      { insumoId: 'guardanapo', valorCentavos: 0 },
    ]);
    expect(Object.fromEntries(c)).toEqual({ carne: 'A', cheddar: 'A', pao: 'B', ketchup: 'C', batata: 'C', guardanapo: 'C' });
    expect(Object.fromEntries(curvaAbc([{ insumoId: 'x', valorCentavos: null }]))).toEqual({ x: 'C' });
  });

  it('vence pela última contagem + a frequência da classe; nunca contado entra primeiro', () => {
    const r = REGRAS_PADRAO;
    expect(situacaoDoItem(null, 'A', r, '2026-10-16')).toEqual({ situacao: 'nunca', venceEm: null });
    expect(situacaoDoItem('2026-10-09', 'A', r, '2026-10-16')).toEqual({ situacao: 'vence-hoje', venceEm: '2026-10-16' });
    expect(situacaoDoItem('2026-10-08', 'A', r, '2026-10-16')).toMatchObject({ situacao: 'vencido' });
    expect(situacaoDoItem('2026-10-08', 'B', r, '2026-10-16')).toEqual({ situacao: 'em-dia', venceEm: '2026-10-23' });
  });

  it('sugerido: o lugar e "quais"; quem está em outra contagem aberta, nunca', () => {
    const base = { conservacao: 'REFRIGERADO' as const, classe: 'B' as const, situacao: 'vencido' as const, emOutraContagem: false };
    expect(sugerido(base, { conservacao: 'REFRIGERADO', quais: 'vencidos' })).toBe(true);
    expect(sugerido(base, { conservacao: 'CONGELADO', quais: 'vencidos' })).toBe(false);
    expect(sugerido({ ...base, situacao: 'em-dia' }, { conservacao: 'REFRIGERADO', quais: 'vencidos' })).toBe(false);
    expect(sugerido({ ...base, situacao: 'em-dia' }, { conservacao: 'REFRIGERADO', quais: 'todos' })).toBe(true);
    expect(sugerido(base, { conservacao: '', quais: 'A' })).toBe(false);
    expect(sugerido({ ...base, emOutraContagem: true }, { conservacao: '', quais: 'todos' })).toBe(false);
  });
});

describe('prazo e estado da contagem', () => {
  it('prazo = fim do dia seguinte no Rio (23:59:59,999 de UTC−3)', () => {
    expect(prazoDoCiclo('2026-10-16').toISOString()).toBe('2026-10-18T02:59:59.999Z');
  });

  it('aberta e no prazo: em contagem ou pronta; passou do prazo: fechou sem aplicar (antes de alguém gravar)', () => {
    const prazo = new Date('2026-10-18T02:59:59.999Z');
    const aberta = { status: 'ABERTA' as const, desfecho: null, fechaAutomaticoEm: prazo };
    expect(estadoDaContagem(aberta, 3, new Date('2026-10-17T20:00:00Z'))).toBe('EM_CONTAGEM');
    expect(estadoDaContagem(aberta, 0, new Date('2026-10-17T20:00:00Z'))).toBe('PRONTA');
    expect(estadoDaContagem(aberta, 0, new Date('2026-10-18T03:00:00Z'))).toBe('VENCIDA');
    expect(estadoDaContagem({ status: 'FECHADA', desfecho: 'APLICADA_SOZINHA', fechaAutomaticoEm: prazo }, 0, new Date())).toBe('APLICADA_SOZINHA');
    expect(estadoDaContagem({ status: 'CANCELADA', desfecho: null, fechaAutomaticoEm: prazo }, 0, new Date())).toBe('DESCARTADA');
  });
});

describe('divergência, fecha sozinha e o ajuste (contado − esperado)', () => {
  it('a diferença é contra o esperado do momento da contagem e se soma ao saldo de AGORA (a nota que entrou depois fica)', () => {
    // Livro dizia 10 kg quando contou 8 kg; depois entrou nota de 5 kg (livro agora 15 kg).
    const d = divergenciaDoItem({ contadoMilesimos: 8000, esperadoMilesimos: 10_000, atualMilesimos: 15_000 }, CHEDDAR, 500);
    expect(d).toEqual({ contado: true, diferencaMilesimos: -2000, valorCentavos: -3796, mudouDepoisMilesimos: 5000, ficaEmMilesimos: 13_000, dentroDaTolerancia: false });
  });

  it('valor exato: um arredondamento por item (333 g × R$ 18,98/kg = R$ 6,32)', () => {
    expect(divergenciaDoItem({ contadoMilesimos: 10_333, esperadoMilesimos: 10_000, atualMilesimos: 10_000 }, CHEDDAR, 0).valorCentavos).toBe(632);
  });

  it('tolerância: dentro até o valor (inclusive); sem preço só se bater exato; não contado não diverge', () => {
    const t = (contado: number, custo = CHEDDAR) => divergenciaDoItem({ contadoMilesimos: contado, esperadoMilesimos: 10_000, atualMilesimos: 10_000 }, custo, 500).dentroDaTolerancia;
    expect(t(10_000)).toBe(true);
    expect(t(10_263)).toBe(true); // 263 g = R$ 4,99
    expect(t(10_264)).toBe(false); // R$ 5,01
    expect(t(9_737)).toBe(true);
    expect(t(10_001, null as never)).toBe(false);
    expect(t(10_000, null as never)).toBe(true);
    expect(divergenciaDoItem({ contadoMilesimos: null, esperadoMilesimos: 10_000, atualMilesimos: 10_000 }, CHEDDAR, 500)).toMatchObject({ contado: false, diferencaMilesimos: 0, ficaEmMilesimos: 10_000 });
  });

  it('fecha sozinha só com todos contados, todos dentro e nada mexido depois de contar', () => {
    const ok = divergenciaDoItem({ contadoMilesimos: 10_100, esperadoMilesimos: 10_000, atualMilesimos: 10_000 }, CHEDDAR, 500);
    const fora = divergenciaDoItem({ contadoMilesimos: 12_000, esperadoMilesimos: 10_000, atualMilesimos: 10_000 }, CHEDDAR, 500);
    const semContar = divergenciaDoItem({ contadoMilesimos: null, esperadoMilesimos: 0, atualMilesimos: 0 }, CHEDDAR, 500);
    const notaNoMeio = divergenciaDoItem({ contadoMilesimos: 10_000, esperadoMilesimos: 10_000, atualMilesimos: 15_000 }, CHEDDAR, 500);
    expect(fechaSozinha([ok, ok])).toBe(true);
    expect(fechaSozinha([ok, fora])).toBe(false);
    expect(fechaSozinha([ok, semContar])).toBe(false);
    expect(fechaSozinha([ok, notaNoMeio])).toBe(false);
    expect(fechaSozinha([])).toBe(false);
    expect(somaDasDivergencias([ok, fora, semContar])).toEqual({ sobraCentavos: 190 + 3796, faltaCentavos: 0, comDiferenca: 2, semPreco: 0, foraDaTolerancia: 1 });
  });

  it('ajuste: CONTAGEM ± por item com diferença, valor pelo custo (sem preço = 0), chave única por item; igual ou não contado não gera', () => {
    const m = ajustesDaContagem(
      'loja',
      [
        { id: 'i1', insumoId: 'cheddar', nome: 'Cheddar', unidade: 'KG', contadoMilesimos: 8000, esperadoMilesimos: 10_000 },
        { id: 'i2', insumoId: 'batata', nome: 'Batata', unidade: 'KG', contadoMilesimos: 3000, esperadoMilesimos: 1000 },
        { id: 'i3', insumoId: 'pao', nome: 'Pão', unidade: 'UN', contadoMilesimos: 12_000, esperadoMilesimos: 12_000 },
        { id: 'i4', insumoId: 'carne', nome: 'Carne', unidade: 'KG', contadoMilesimos: null, esperadoMilesimos: 5000 },
      ],
      new Map([['cheddar', CHEDDAR], ['batata', null]]),
      'Contagem · Refrigerado',
    );
    expect(m).toEqual([
      { lojaId: 'loja', insumoId: 'cheddar', tipo: 'CONTAGEM', quantidadeMilesimos: -2000, valorCentavos: -3796, insumoNome: 'Cheddar', unidade: 'KG', motivo: 'Contagem · Refrigerado', chave: 'contagem:i1', contagemItemId: 'i1' },
      { lojaId: 'loja', insumoId: 'batata', tipo: 'CONTAGEM', quantidadeMilesimos: 2000, valorCentavos: 0, insumoNome: 'Batata', unidade: 'KG', motivo: 'Contagem · Refrigerado', chave: 'contagem:i2', contagemItemId: 'i2' },
    ]);
  });
});

describe('cobertura do período contra o piso', () => {
  const itens = [
    { insumoId: 'carne', valorCentavos: 600_00, contadoNoPeriodo: false },
    { insumoId: 'cheddar', valorCentavos: 200_00, contadoNoPeriodo: true },
    { insumoId: 'pao', valorCentavos: 100_00, contadoNoPeriodo: true },
    { insumoId: 'ketchup', valorCentavos: 100_00, contadoNoPeriodo: false },
    { insumoId: 'batata', valorCentavos: null, contadoNoPeriodo: false },
  ];

  it('mede valor e itens; abaixo de um dos dois não atinge; o que falta = maior valor primeiro', () => {
    const c = coberturaDoPeriodo(itens, { pisoValorBp: 8000, pisoItensBp: 5000 });
    expect(c.itens).toEqual({ contados: 2, total: 5, bp: 4000 });
    expect(c.valor).toEqual({ contadoCentavos: 300_00, totalCentavos: 1000_00, bp: 3000 });
    expect(c).toMatchObject({ semPreco: 1, atingeValor: false, atingeItens: false, atinge: false, paraOPiso: ['carne'] });
    expect(sp(fraseAbaixoDoPiso(c, { pisoValorBp: 8000, pisoItensBp: 5000 }))).toMatch(/30 % do valor \(piso 80 %\) e 40 % dos insumos \(piso 50 %\)\. Conte mais 1 insumo/);
  });

  it('exatamente no piso atinge; piso de itens alto pede também os baratos', () => {
    const com = itens.map((i) => (i.insumoId === 'carne' ? { ...i, contadoNoPeriodo: true } : i));
    expect(coberturaDoPeriodo(com, { pisoValorBp: 9000, pisoItensBp: 6000 })).toMatchObject({ atinge: true, paraOPiso: [] });
    const c = coberturaDoPeriodo(com, { pisoValorBp: 9000, pisoItensBp: 10_000 });
    expect(c).toMatchObject({ atingeValor: true, atingeItens: false, paraOPiso: ['ketchup', 'batata'] });
  });

  it('loja sem nada para cobrir atinge (não trava o fechamento por divisão por zero)', () => {
    expect(coberturaDoPeriodo([], { pisoValorBp: 8000, pisoItensBp: 5000 })).toMatchObject({ atinge: true, itens: { bp: 10_000 }, valor: { bp: 10_000 } });
  });
});

describe('regras da loja (piso, frequência, tolerância)', () => {
  it('lê o formulário nas faixas do banco; ida e volta igual', () => {
    expect(lerRegras(camposDasRegras(REGRAS_PADRAO))).toEqual({ ok: true, regras: REGRAS_PADRAO });
    expect(lerRegras({ pisoValor: '90 %', pisoItens: '0', freqA: '3', freqB: '3', freqC: '60', tolerancia: 'R$ 0,00' })).toEqual({
      ok: true,
      regras: { pisoValorBp: 9000, pisoItensBp: 0, freqADias: 3, freqBDias: 3, freqCDias: 60, toleranciaCentavos: 0 },
    });
  });

  it('recusa com frase: piso por valor abaixo de 50 %, frequência fora de ordem, tolerância acima de R$ 1.000', () => {
    const r = lerRegras({ pisoValor: '40', pisoItens: '101', freqA: '10', freqB: '5', freqC: '91', tolerancia: '1000,01' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.erros).sort()).toEqual(['freqB', 'freqC', 'pisoItens', 'pisoValor', 'tolerancia']);
    expect(r.erros.freqB).toMatch(/maior ou igual ao da A/);
  });
});

describe('textos do período', () => {
  it('"Cobertura da semana…", "de outubro…", "da 1ª quinzena…", "de 15/10 a 14/11"', () => {
    expect(coberturaDe('Semana de 10/10 a 16/10')).toBe('Cobertura da semana de 10/10 a 16/10');
    expect(coberturaDe('Outubro de 2026')).toBe('Cobertura de outubro de 2026');
    expect(coberturaDe('1ª quinzena · 01/10 a 15/10')).toBe('Cobertura da 1ª quinzena · 01/10 a 15/10');
    expect(coberturaDe('15/10 a 14/11')).toBe('Cobertura de 15/10 a 14/11');
  });
});

describe('herança da 1.7: "sem preço" curto na diferença', () => {
  it('sem preço não vira "valor pendente (sem preço) · confira"', async () => {
    const { textoDoValorDaDiferenca } = await import('@/lib/erp/contagem-campos');
    expect(textoDoValorDaDiferenca(null)).toBe('sem preço');
    expect(textoDoValorDaDiferenca(-1898)).toMatch(/18,98 a menos/);
  });
});
