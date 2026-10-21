/**
 * ERP 2.5 · orçamento de compra ao vivo — a conta pura (sem banco).
 *
 * Outubro de 2026, hoje 21/10 (quarta). Sábado vende R$ 3.000,00, os outros dias R$ 1.000,00. Outubro tem 5 sábados:
 * o mês inteiro dá R$ 41.000,00. Até ontem (1 a 20) a loja vendeu R$ 26.000,00 (3 sábados); faltam 11 dias com 2 sábados
 * (R$ 15.000,00). A projeção linear daria R$ 40.300,00: a conta por dia da semana acerta o mês.
 */
import { describe, expect, it } from 'vitest';
import {
  aproximado,
  AVISO_SEM_NOTA,
  degrauDoTeto,
  fraseAcimaDoLimite,
  fraseDoLimite,
  fraseDeQuemPassou,
  MINIMO_DE_DIAS_COMPLETOS,
  MOTIVO_SEM_META,
  fraseDoSaldo,
  impactoDaNota,
  inicioDaLeitura,
  orcamentoDaLoja,
  orcamentoDoEscopo,
  preverReceita,
  ritmoDasCompras,
  tetoArredondado,
  tetoDe,
  type GraoDoOrcamento,
  type LojaDoOrcamento,
} from '@/lib/erp/orcamento-campos';
import { MOTIVO_FALTA_FATURAMENTO } from '@/lib/erp/farol-dre-campos';
import { somarDias } from '@/lib/erp/contagem-campos';
import type { CanalVenda } from '@/lib/erp/canal-campos';

const HOJE = '2026-10-21';
const OUTUBRO = { inicio: '2026-10-01', fim: '2026-10-31', nome: 'outubro de 2026' };
const R = (reais: number) => Math.round(reais * 100);
const sabado = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay() === 6;

/** Grãos de `de` a `ate`: por dia, o valor de cada canal (o sábado vale 3×). */
function graos(de: string, ate: string, porCanal: Partial<Record<CanalVenda, number>>, pular: { data: string; canal: CanalVenda }[] = []): GraoDoOrcamento[] {
  const out: GraoDoOrcamento[] = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) {
    for (const [canal, v] of Object.entries(porCanal) as [CanalVenda, number][]) {
      if (pular.some((p) => p.data === d && p.canal === canal)) continue;
      out.push({ data: d, canal, valorCentavos: R(sabado(d) ? v * 3 : v) });
    }
  }
  return out;
}

const loja = (p: Partial<LojaDoOrcamento> = {}): LojaDoOrcamento => ({
  lojaId: 'vp',
  nome: 'Vila da Penha',
  canais: ['LOJA'],
  primeiroLancamento: '2025-01-01',
  graos: graos('2026-09-01', '2026-10-20', { LOJA: 1000 }),
  compradoCentavos: R(10_000),
  compradoAteOntemCentavos: R(8_000),
  ...p,
});

describe('a receita prevista (por dia da semana, nas últimas 4 semanas)', () => {
  it('lê do começo do período ou da janela de 28 dias, o que vier antes', () => {
    expect(inicioDaLeitura(OUTUBRO, HOJE)).toBe('2026-09-23');
    expect(inicioDaLeitura({ inicio: '2026-09-15' }, HOJE)).toBe('2026-09-15');
  });

  it('o mês com 5 sábados: realizado R$ 26.000,00 + projetado R$ 15.000,00 = R$ 41.000,00 (a linear daria R$ 40.300,00)', () => {
    const r = preverReceita(loja(), OUTUBRO, HOJE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.previsao).toEqual({ realizadoCentavos: R(26_000), projetadoCentavos: R(15_000), previstaCentavos: R(41_000), diasCompletos: 20, diasSemLancamento: 0, diasRestantes: 11, diasNaJanela: 28, diasAntesDeAbrir: 0, frasesDoZero: [] });
  });

  it('dia sem um canal não vale zero: entra pela média do mesmo dia da semana', () => {
    const r = preverReceita(
      loja({ canais: ['LOJA', 'IFOOD'], graos: graos('2026-09-01', '2026-10-20', { LOJA: 700, IFOOD: 300 }, [{ data: '2026-10-05', canal: 'IFOOD' }]) }),
      OUTUBRO,
      HOJE,
    );
    if (!r.ok) throw new Error(r.motivo);
    // A segunda 05/10 tem só o salão (R$ 700,00): fica fora do realizado e entra pela média das segundas (R$ 1.000,00).
    expect(r.previsao.diasSemLancamento).toBe(1);
    expect(r.previsao.realizadoCentavos).toBe(R(25_000));
    expect(r.previsao.previstaCentavos).toBe(R(41_000));
  });

  it('"Não vendeu" (zero lançado) é dia completo e entra como zero', () => {
    const g = graos('2026-09-01', '2026-10-20', { LOJA: 1000 }).map((x) => (new Date(`${x.data}T00:00:00Z`).getUTCDay() === 1 ? { ...x, valorCentavos: 0 } : x));
    const r = preverReceita(loja({ graos: g }), OUTUBRO, HOJE);
    if (!r.ok) throw new Error(r.motivo);
    // Segundas de outubro: 5, 12, 19, 26 → 3 até ontem (zero) e 1 a projetar (zero): R$ 41.000,00 − 4 × R$ 1.000,00.
    expect(r.previsao.diasSemLancamento).toBe(0);
    expect(r.previsao.previstaCentavos).toBe(R(37_000));
  });

  it('dia da semana sem amostra nas 4 semanas conta como ZERO, com a frase (decisão 214: o lado prudente)', () => {
    // Nenhum sábado lançado: os 3 sábados até ontem são "sem lançamento" e, com os 2 que faltam, contam zero (não a média geral).
    const g = graos('2026-09-01', '2026-10-20', { LOJA: 1000 }).filter((x) => !sabado(x.data));
    const r = preverReceita(loja({ graos: g }), OUTUBRO, HOJE);
    if (!r.ok) throw new Error(r.motivo);
    expect(r.previsao.diasNaJanela).toBe(24);
    expect(r.previsao.diasSemLancamento).toBe(3);
    expect(r.previsao.realizadoCentavos).toBe(R(17_000));
    // 9 dias de semana a projetar (R$ 1.000,00 cada) e os 5 sábados como zero.
    expect(r.previsao.previstaCentavos).toBe(R(26_000));
    expect(r.previsao.frasesDoZero).toEqual(['sábado sem dia completo nas últimas 4 semanas: conta só o que já foi lançado']);
  });

  it('dia incompleto num dia da semana sem nenhuma amostra completa vale o que foi lançado (piso), não zero (revisão do Guardião)', () => {
    // Todo sábado só o salão é lançado (o iFood nunca): nenhum sábado completo nas 4 semanas. Os 3 sábados até ontem têm R$ 2.100,00 lançados.
    const g = graos('2026-09-01', '2026-10-20', { LOJA: 700, IFOOD: 300 }).filter((x) => !(sabado(x.data) && x.canal === 'IFOOD'));
    const r = preverReceita(loja({ canais: ['LOJA', 'IFOOD'], graos: g }), OUTUBRO, HOJE);
    if (!r.ok) throw new Error(r.motivo);
    expect(r.previsao.diasSemLancamento).toBe(3);
    expect(r.previsao.realizadoCentavos).toBe(R(17_000));
    // 9 dias de semana a projetar (R$ 9.000,00) + o piso dos 3 sábados lançados em parte (R$ 6.300,00); os 2 sábados que faltam, zero.
    expect(r.previsao.projetadoCentavos).toBe(R(15_300));
    expect(r.previsao.frasesDoZero).toEqual(['sábado sem dia completo nas últimas 4 semanas: conta só o que já foi lançado']);
  });

  it('loja que abriu no meio do período (05/10): os dias antes do 1º lançamento não existem (decisão 214)', () => {
    const r = preverReceita(loja({ primeiroLancamento: '2026-10-05', graos: graos('2026-10-05', '2026-10-20', { LOJA: 1000 }) }), OUTUBRO, HOJE);
    if (!r.ok) throw new Error(r.motivo);
    // 01 a 04/10 ficam fora: nem realizado, nem projetado, nem "sem lançamento". Vendeu R$ 20.000,00 (05 a 20, 2 sábados) + R$ 15.000,00 (21 a 31).
    expect(r.previsao).toMatchObject({ diasAntesDeAbrir: 4, diasSemLancamento: 0, diasCompletos: 16, realizadoCentavos: R(20_000), projetadoCentavos: R(15_000), previstaCentavos: R(35_000) });
  });

  it(`sem ${MINIMO_DE_DIAS_COMPLETOS} dias completos nas últimas 4 semanas: sem número, com o motivo`, () => {
    const nova = preverReceita(loja({ primeiroLancamento: '2026-10-10', graos: graos('2026-10-10', '2026-10-20', { LOJA: 1000 }) }), OUTUBRO, HOJE);
    expect(nova).toEqual({ ok: false, diasNaJanela: 11, motivo: 'poucos dias com faturamento completo nas últimas 4 semanas: 11 de 14 necessários' });
    const nunca = preverReceita(loja({ primeiroLancamento: null, graos: [] }), OUTUBRO, HOJE);
    expect(nunca).toEqual({ ok: false, diasNaJanela: 0, motivo: 'sem faturamento lançado nas últimas 4 semanas' });
  });

  it('o primeiro dia do período (nada apurado) já tem número pela janela', () => {
    const r = preverReceita(loja({ graos: graos('2026-09-01', '2026-09-30', { LOJA: 1000 }) }), OUTUBRO, '2026-10-01');
    if (!r.ok) throw new Error(r.motivo);
    expect(r.previsao.realizadoCentavos).toBe(0);
    expect(r.previsao.diasRestantes).toBe(31);
    expect(r.previsao.previstaCentavos).toBe(R(41_000));
  });

  it('período semanal e quinzenal: a mesma conta, só que com menos dias', () => {
    const semana = preverReceita(loja(), { inicio: '2026-10-19', fim: '2026-10-25' }, HOJE);
    if (!semana.ok) throw new Error(semana.motivo);
    // 19 e 20 realizados (R$ 2.000,00); 21 a 25 com o sábado 24: R$ 7.000,00.
    expect(semana.previsao.previstaCentavos).toBe(R(9_000));
    const quinzena = preverReceita(loja(), { inicio: '2026-10-16', fim: '2026-10-31' }, HOJE);
    if (!quinzena.ok) throw new Error(quinzena.motivo);
    expect(quinzena.previsao.previstaCentavos).toBe(R(16 * 1000 + 3 * 2000));
  });
});

describe('o orçamento: meta × receita prevista − já comprado', () => {
  it('meta 30 %: teto R$ 12.300,00, comprado R$ 10.000,00, cabe R$ 2.300,00', () => {
    const o = orcamentoDaLoja(loja(), OUTUBRO, HOJE, 3000);
    expect(o.conta).toEqual({ previstaCentavos: R(41_000), metaBp: 3000, tetoCentavos: R(12_300), compradoCentavos: R(10_000), saldoCentavos: R(2_300) });
    expect(o.motivo).toBeNull();
  });

  it('passou: saldo negativo, nunca bloqueio (só a conta)', () => {
    const o = orcamentoDaLoja(loja({ compradoCentavos: R(13_000) }), OUTUBRO, HOJE, 3000);
    expect(o.conta?.saldoCentavos).toBe(-R(700));
  });

  it('sem meta do CMV: sem número', () => {
    const o = orcamentoDaLoja(loja(), OUTUBRO, HOJE, null);
    expect(o.conta).toBeNull();
    expect(o.motivo).toBe(MOTIVO_SEM_META);
    expect(o.ritmo).toBeNull();
  });

  it('teto com um arredondamento só (metade para cima)', () => {
    expect(tetoDe(333, 3000)).toBe(100); // 99,9 → 100
    expect(tetoDe(R(41_000), 2850)).toBe(R(11_685));
  });
});

describe('o ritmo das compras (o farol da 2.4, escala de custo)', () => {
  it('CMV pelas compras até ontem contra a meta: R$ 8.000,00 sobre R$ 26.000,00 = 30,8 % contra 30 % → amarelo (um pouco pior)', () => {
    const o = orcamentoDaLoja(loja(), OUTUBRO, HOJE, 3000);
    expect(o.cmvAteOntemBp).toBe(3077);
    expect(o.ritmo).toMatchObject({ tipo: 'cor', cor: 'AMARELO', desvioTexto: '+0,8\u00a0pp' });
  });

  it('as 5 faixas saem de faixaDoDesvio (menos é melhor)', () => {
    const cor = (comprado: number) => {
      const r = ritmoDasCompras({ metaBp: 3000, receitaAteOntemCentavos: R(10_000), compradoAteOntemCentavos: R(comprado), lojasSemNota: [] }).farol;
      return r?.tipo === 'cor' ? r.cor : r?.tipo;
    };
    expect(cor(2_600)).toBe('AZUL'); // 26 % = −4 pp
    expect(cor(3_050)).toBe('VERDE'); // +0,5
    expect(cor(3_150)).toBe('AMARELO'); // +1,5
    expect(cor(3_300)).toBe('LARANJA'); // +3,0
    expect(cor(3_400)).toBe('VERMELHO'); // +4,0
  });

  it('falta faturamento num dia do período: sem cor (orçamento sobre receita incompleta mente igual)', () => {
    const o = orcamentoDaLoja(loja({ canais: ['LOJA', 'IFOOD'], graos: graos('2026-09-01', '2026-10-20', { LOJA: 700, IFOOD: 300 }, [{ data: '2026-10-05', canal: 'IFOOD' }]) }), OUTUBRO, HOJE, 3000);
    expect(o.conta).not.toBeNull(); // o número existe (o dia entrou pela média)…
    expect(o.ritmo).toEqual({ tipo: 'sem', motivo: MOTIVO_FALTA_FATURAMENTO, desvioTexto: null }); // …mas a cor não
  });

  it('loja que vendeu sem nota até ontem: sem cor (CMV zero não é "bem melhor")', () => {
    const o = orcamentoDaLoja(loja({ compradoAteOntemCentavos: 0 }), OUTUBRO, HOJE, 3000);
    expect(o.ritmo).toMatchObject({ tipo: 'sem', motivo: 'sem nota de compra de Vila da Penha até ontem', desvioTexto: '−30,0\u00a0pp' });
  });
});

describe('cobertura por loja: a rede só tem número quando cada loja tem', () => {
  const penha = orcamentoDaLoja(loja(), OUTUBRO, HOJE, 3000);
  const delivery = orcamentoDaLoja(loja({ lojaId: 'dl', nome: 'Delivery', compradoCentavos: R(2_000), compradoAteOntemCentavos: R(2_000) }), OUTUBRO, HOJE, 3000);
  const nova = orcamentoDaLoja(loja({ lojaId: 'ct', nome: 'Centro', primeiroLancamento: '2026-10-15', graos: graos('2026-10-15', '2026-10-20', { LOJA: 1000 }) }), OUTUBRO, HOJE, 3000);

  it('as duas com número: a rede soma (teto R$ 24.600,00 − R$ 12.000,00)', () => {
    const r = orcamentoDoEscopo([penha, delivery], 3000);
    expect(r.conta).toEqual({ previstaCentavos: R(82_000), metaBp: 3000, tetoCentavos: R(24_600), compradoCentavos: R(12_000), saldoCentavos: R(12_600) });
  });

  it('uma sem número: a rede fica sem número, com o nome dela (somar esconderia o buraco)', () => {
    const r = orcamentoDoEscopo([penha, delivery, nova], 3000);
    expect(r.conta).toBeNull();
    expect(r.motivo).toBe('sem o orçamento de Centro');
  });

  it('o ritmo da rede fica sem cor se UMA loja tem dia sem lançamento, mesmo com a outra completa', () => {
    const furada = orcamentoDaLoja(loja({ lojaId: 'dl', nome: 'Delivery', canais: ['LOJA', 'IFOOD'], graos: graos('2026-09-01', '2026-10-20', { LOJA: 700, IFOOD: 300 }, [{ data: '2026-10-05', canal: 'IFOOD' }]) }), OUTUBRO, HOJE, 3000);
    const r = orcamentoDoEscopo([penha, furada], 3000);
    expect(r.conta).not.toBeNull();
    expect(r.diasSemLancamento).toBe(1);
    expect(r.ritmo).toMatchObject({ tipo: 'sem', motivo: MOTIVO_FALTA_FATURAMENTO });
  });

  it('o ritmo da rede fica sem cor quando uma loja que vendeu não tem nota', () => {
    const semNota = orcamentoDaLoja(loja({ lojaId: 'dl', nome: 'Delivery', compradoCentavos: 0, compradoAteOntemCentavos: 0 }), OUTUBRO, HOJE, 3000);
    const r = orcamentoDoEscopo([penha, semNota], 3000);
    expect(r.ritmo).toMatchObject({ tipo: 'sem', motivo: 'sem nota de compra de Delivery até ontem' });
  });
});

describe('a loja que vendeu sem nota no período (decisão 215)', () => {
  it('nunca "já comprado R$ 0,00" calado: a loja vem marcada e o aviso existe', () => {
    const o = orcamentoDaLoja(loja({ compradoCentavos: 0, compradoAteOntemCentavos: 0 }), OUTUBRO, HOJE, 3000);
    expect(o.semNota).toBe(true);
    expect(o.conta?.saldoCentavos).toBe(R(12_300)); // o teto inteiro…
    expect(AVISO_SEM_NOTA).toContain('não tem nota de compra'); // …com o aviso
    expect(orcamentoDaLoja(loja(), OUTUBRO, HOJE, 3000).semNota).toBe(false);
    // nota só de hoje: não é "sem nota" (o já comprado não é zero)
    expect(orcamentoDaLoja(loja({ compradoCentavos: R(100), compradoAteOntemCentavos: 0 }), OUTUBRO, HOJE, 3000).semNota).toBe(false);
  });
});

describe('quem não vê a receita: o TETO arredondado para baixo, por faixa (decisão 213)', () => {
  it('os degraus do Maestro: R$ 500 abaixo de R$ 10.000, R$ 1.000 até R$ 50.000, R$ 5.000 daí para cima', () => {
    expect(degrauDoTeto(R(9_999.99))).toBe(R(500));
    expect(degrauDoTeto(R(10_000))).toBe(R(1_000));
    expect(degrauDoTeto(R(49_999.99))).toBe(R(1_000));
    expect(degrauDoTeto(R(50_000))).toBe(R(5_000));
    expect(tetoArredondado(R(9_999.99))).toBe(R(9_500));
    expect(tetoArredondado(R(12_300))).toBe(R(12_000));
    expect(tetoArredondado(R(54_999.99))).toBe(R(50_000));
    expect(tetoArredondado(R(499.99))).toBe(0);
    expect(tetoArredondado(-5)).toBe(0);
  });

  it('nunca maior que o real e nunca diminui quando o teto sobe (também na virada das faixas)', () => {
    let antes = 0;
    for (let t = 0; t <= R(120_000); t += 37_123) {
      const a = tetoArredondado(t);
      expect(a).toBeLessThanOrEqual(t);
      expect(a).toBeGreaterThanOrEqual(antes);
      antes = a;
    }
  });

  it('a frase', () => {
    expect(fraseDoSaldo(R(2_300)).replace(/\u00a0/g, ' ')).toBe('cabe R$ 2.300,00');
    expect(fraseDoSaldo(-R(700)).replace(/\u00a0/g, ' ')).toBe('passou R$ 700,00');
    expect(fraseDeQuemPassou('Delivery', R(1_716)).replace(/\u00a0/g, ' ')).toBe('Delivery já passou R$ 1.716,00: a sobra de outra loja não cobre');
  });

  it('limite seguro: o que a tela mostra a quem não vê o DRE vai em degraus de R$ 100 para menos folga, sem "orçamento" nem "passou"', () => {
    const t = (x: string) => x.replace(/\u00a0/g, ' ');
    expect(aproximado(R(13_765.44))).toBe(R(13_700));
    expect(aproximado(-R(300))).toBe(-R(300));
    expect(aproximado(-R(250.01))).toBe(-R(300));
    expect(t(fraseDoLimite(R(13_765.44)))).toBe('cabe R$ 13.700,00 no limite seguro');
    expect(t(fraseDoLimite(R(50)))).toBe('cabe menos de R$ 100,00 no limite seguro');
    expect(t(fraseDoLimite(-R(250.01)))).toBe('acima do limite seguro em R$ 300,00');
    expect(t(fraseAcimaDoLimite('Vila da Penha', -R(300)))).toBe('Vila da Penha está acima do limite seguro em R$ 300,00');
    for (const f of [fraseDoLimite(-1), fraseDoLimite(1), fraseAcimaDoLimite('X', -1)]) expect(f).not.toMatch(/orçamento|passou|teto/);
  });

  it('o ataque do Guardião não acha nada: compras e prévias de edição só deslocam um número que já não tem o centavo do teto', () => {
    // Teto real R$ 12.345,67 (segredo). O comprador conhece as compras e escolhe as notas; o que ele vê é teto arredondado − compras.
    const conta = { tetoCentavos: R(12_345.67) };
    const vistos = new Set<number>();
    for (const comprado of [0, R(98.76), R(1_234.5), R(4_321.09), R(9_999.99)]) {
      for (const nota of [1, R(10), R(2_345.67), R(12_000)]) {
        const i = impactoDaNota(conta, comprado, nota, false);
        expect(i.arredondado).toBe(true);
        vistos.add(i.antesCentavos + comprado); // o que ele consegue tirar: sempre o mesmo teto arredondado
        vistos.add(i.depoisCentavos + comprado + nota);
      }
    }
    expect([...vistos]).toEqual([R(12_000)]);
  });

  it('quem vê a receita recebe a conta exata; na edição, o comprado já vem sem a versão gravada da nota', () => {
    expect(impactoDaNota({ tetoCentavos: R(12_300) }, R(10_000), R(3_000), true)).toEqual({ antesCentavos: R(2_300), depoisCentavos: -R(700), passa: true, arredondado: false });
    expect(impactoDaNota({ tetoCentavos: R(12_300) }, R(10_000), R(3_000), false)).toEqual({ antesCentavos: R(2_000), depoisCentavos: -R(1_000), passa: true, arredondado: true });
  });

  it('a rede: o teto é a soma dos tetos das lojas', () => {
    const a = orcamentoDaLoja(loja(), OUTUBRO, HOJE, 3000);
    const b = orcamentoDaLoja(loja({ lojaId: 'dl', nome: 'Delivery' }), OUTUBRO, HOJE, 3000);
    expect(orcamentoDoEscopo([a, b], 3000).conta?.tetoCentavos).toBe(a.conta!.tetoCentavos + b.conta!.tetoCentavos);
  });
});
