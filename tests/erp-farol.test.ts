/**
 * ERP 2.4 · o farol por canal em 5 faixas — a conta e as regras, SEM banco.
 *
 * Critérios 1 a 9 e 15 da análise: as bordas das duas escalas, as faixas congeladas (retrato), CMV, pessoal, resultado
 * (rede × loja), a receita por canal contra o ano passado (iFood, Loja, Delivery), ano passado incompleto ou zero,
 * "sem contar o CMV" × CMV pelas compras, faturamento faltando, taxa do iFood só no total, a despesa recorrente que
 * falta (o falso azul), o ano passado que a fotografia guarda e o contraste das 5 cores nos dois temas.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CmvDaLoja } from '@/lib/erp/cmv-campos';
import { SEM_CMV } from '@/lib/erp/cmv-campos';
import { montarDre, type EntradaDoDre } from '@/lib/erp/dre-campos';
import {
  anoPassadoParaGravar,
  compararComMeta,
  compararComOAnoPassado,
  compararComOAnoPassadoSomado,
  compararCrescimento,
  compararLinhas,
  lerAnoPassadoGuardado,
  lerMetaDigitada,
  textoDaMetaDeCrescimento,
} from '@/lib/erp/dre-metas-campos';
import { planoEfetivo } from '@/lib/erp/dre-plano';
import { CORES_DO_FAROL, FAIXAS_DO_FAROL, faixaDoDesvio, posicaoDaCor, VERSAO_DAS_FAIXAS } from '@/lib/erp/farol-campos';
import { canaisDoPeriodo, farolDoDre, pedidosPorCanal, type EntradaDoFarol } from '@/lib/erp/farol-dre-campos';

// ------------------------------------------------------------------ as faixas

describe('2.4 · faixaDoDesvio (critério 1): as bordas das duas escalas', () => {
  const custo = (s: number) => faixaDoDesvio('MENOR_MELHOR', -s, 'custo').cor;
  it.each([
    [300, 'AZUL'],
    [299, 'VERDE'],
    [-50, 'VERDE'],
    [-51, 'AMARELO'],
    [-150, 'AMARELO'],
    [-151, 'LARANJA'],
    [-300, 'LARANJA'],
    [-301, 'VERMELHO'],
  ])('custo: s = %i é %s', (s, cor) => expect(custo(s)).toBe(cor));
  const receita = (s: number) => faixaDoDesvio('MAIOR_MELHOR', s, 'receita').cor;
  it.each([
    [500, 'AZUL'],
    [499, 'VERDE'],
    [-100, 'VERDE'],
    [-101, 'AMARELO'],
    [-300, 'AMARELO'],
    [-301, 'LARANJA'],
    [-600, 'LARANJA'],
    [-601, 'VERMELHO'],
  ])('receita: s = %i é %s', (s, cor) => expect(receita(s)).toBe(cor));

  it('o sentido vira o sinal: em MENOR_MELHOR, desvio negativo é o lado bom; em MAIOR_MELHOR, o positivo', () => {
    expect(faixaDoDesvio('MENOR_MELHOR', -350, 'custo').cor).toBe('AZUL');
    expect(faixaDoDesvio('MAIOR_MELHOR', 350, 'custo').cor).toBe('AZUL');
    expect(faixaDoDesvio('MENOR_MELHOR', 350, 'custo').cor).toBe('VERMELHO');
    expect(faixaDoDesvio('MAIOR_MELHOR', -350, 'custo').cor).toBe('VERMELHO');
    expect(faixaDoDesvio('MENOR_MELHOR', 0, 'custo').cor).toBe('VERDE');
  });
  it('a posição da régua é a ordem azul → vermelho, e o azul de uma linha de custo pede "confira se está tudo lançado"', () => {
    expect(CORES_DO_FAROL.map(posicaoDaCor)).toEqual([1, 2, 3, 4, 5]);
    expect(faixaDoDesvio('MENOR_MELHOR', -400, 'custo')).toMatchObject({ cor: 'AZUL', posicao: 1, confira: 'confira se está tudo lançado' });
    expect(faixaDoDesvio('MAIOR_MELHOR', 400, 'custo').confira).toBeNull(); // margem melhor não é lançamento esquecido
    expect(faixaDoDesvio('MAIOR_MELHOR', 600, 'receita').confira).toBeNull();
  });
});

describe('2.4 · FAIXAS_DO_FAROL v1 (critério 15): o retrato congelado', () => {
  it('os limites e as palavras da versão 1 não mudam sem virar a versão 2', () => {
    expect(VERSAO_DAS_FAIXAS).toBe(1);
    expect(JSON.parse(JSON.stringify(FAIXAS_DO_FAROL))).toEqual({
      versao: 1,
      escalas: {
        custo: { AZUL: 300, VERDE: -50, AMARELO: -150, LARANJA: -300 },
        receita: { AZUL: 500, VERDE: -100, AMARELO: -300, LARANJA: -600 },
      },
      palavras: { AZUL: 'bem melhor que a meta', VERDE: 'na meta', AMARELO: 'um pouco pior', LARANJA: 'pior que a meta', VERMELHO: 'muito pior que a meta' },
    });
  });
  it('é congelado de verdade: escrever nele falha', () => {
    expect(Object.isFrozen(FAIXAS_DO_FAROL)).toBe(true);
    expect(Object.isFrozen(FAIXAS_DO_FAROL.escalas)).toBe(true);
    expect(Object.isFrozen(FAIXAS_DO_FAROL.escalas.custo)).toBe(true);
    expect(Object.isFrozen(FAIXAS_DO_FAROL.palavras)).toBe(true);
    expect(() => {
      (FAIXAS_DO_FAROL.escalas.custo as { AZUL: number }).AZUL = 1;
    }).toThrow();
  });
});

// ------------------------------------------------------------------ o DRE de teste

const plano = planoEfetivo([]).map((l, i) => ({ ...l, id: `L${i}` }));
const idDe = (codigo: string) => plano.find((l) => l.codigo === codigo)!.id!;

const loja = (id: string, nome: string, compraCentavos: number | null): CmvDaLoja => ({ lojaId: id, lojaNome: nome, compraCentavos, real: null, motivoSemReal: 'estoque não aberto' });

function dreDe(e: Partial<EntradaDoDre>, escopo: EntradaDoDre['escopo'] = { tipo: 'rede' }) {
  return montarDre({ escopo, plano, receitas: [{ lojaId: 'vp', canal: 'LOJA', valorCentavos: 1_000_000 }], taxaIfood: null, despesas: [], cmv: SEM_CMV, ...e });
}

/** O farol de um DRE com as metas dadas (percentuais; as de receita usam o ano passado dado). */
function farolDe(
  r: ReturnType<typeof dreDe>,
  metas: Record<string, number>,
  extra: Partial<Omit<EntradaDoFarol, 'linhas' | 'metas'>> & { anoPassado?: ReturnType<typeof compararComOAnoPassado> | null; daLoja?: boolean } = {},
) {
  const { anoPassado = null, daLoja = false, ...resto } = extra;
  const comparadas = compararLinhas(r.linhas, new Map(Object.entries(metas)), r.receitaBrutaCentavos, daLoja, anoPassado);
  return farolDoDre({ linhas: r.linhas, metas: comparadas, faltasDeFaturamento: 0, recorrentes: [], receitaNaoApurada: false, ...resto });
}

const R = (reais: number) => reais * 100;
const cmvDeCompra = (centavos: number) => ({ lojas: [loja('vp', 'Vila da Penha', centavos)], parcial: false });

describe('2.4 · custo, margem e resultado (critérios 2, 3 e 4)', () => {
  it('critério 2: CMV com meta 30,00 % e realizado 31,20 % = "+1,2 pp", AMARELO "um pouco pior"', () => {
    const r = dreDe({ cmv: cmvDeCompra(R(3_120)) });
    const cmv = r.linhas.find((l) => l.chave === 'cmv')!;
    expect(cmv.percentualBp).toBe(3120);
    const c = compararComMeta(cmv, 3000, r.receitaBrutaCentavos);
    expect(c.desvioTexto).toBe('+1,2 pp');
    expect(c.faixa).toMatchObject({ cor: 'AMARELO', palavra: 'um pouco pior' });
    // O CMV pelas compras TEM cor (o selo da fonte fica ao lado dele na tela).
    expect(farolDe(r, { cmv: 3000 }).porLinha.cmv).toMatchObject({ tipo: 'cor', cor: 'AMARELO', palavra: 'um pouco pior', desvioTexto: '+1,2 pp' });
  });

  it('critério 3: Pessoal com meta 25,50 % e realizado 22,00 % é AZUL "bem melhor que a meta" + "confira se está tudo lançado"', () => {
    const r = dreDe({ despesas: [{ linhaId: idDe('salarios'), lojaId: 'vp', centavos: R(2_200) }], cmv: cmvDeCompra(R(100)) });
    const f = farolDe(r, { 'grupo:PESSOAL': 2550 }).porLinha['grupo:PESSOAL'];
    expect(f).toMatchObject({ tipo: 'cor', cor: 'AZUL', palavra: 'bem melhor que a meta', confira: 'confira se está tudo lançado', desvioTexto: '−3,5 pp', posicao: 1 });
    expect(f.tipo === 'cor' && f.rotulo).toBe('Farol: bem melhor que a meta, confira se está tudo lançado, −3,5 pp, faixa 1 de 5');
  });

  it('critério 4: Resultado com meta 10,00 % e realizado 6,90 % é VERMELHO na rede; na visão da loja não há farol', () => {
    // Receita R$ 10.000,00; CMV R$ 100,00; despesas fixas que deixam o resultado em 6,90 % (R$ 690,00).
    const despesas = [{ linhaId: idDe('salarios'), lojaId: 'vp', centavos: R(9_210) }];
    const r = dreDe({ despesas, cmv: cmvDeCompra(R(100)) });
    const fim = r.linhas.find((l) => l.chave === 'resultado-do-periodo')!;
    expect(fim.percentualBp).toBe(690);
    const f = farolDe(r, { 'resultado-do-periodo': 1000 }).porLinha['resultado-do-periodo'];
    expect(f).toMatchObject({ tipo: 'cor', cor: 'VERMELHO', palavra: 'muito pior que a meta', desvioTexto: '−3,1 pp' });
    const rl = dreDe({ despesas, cmv: cmvDeCompra(R(100)) }, { tipo: 'loja', lojaId: 'vp', nome: 'Vila da Penha' });
    expect(farolDe(rl, { 'resultado-do-periodo': 1000, 'resultado-operacional': 1000 }, { daLoja: true }).porLinha).toEqual({});
  });
});

describe('2.4 · receita por canal contra o ano passado (critérios 5 e 6)', () => {
  const grao = (canal: 'LOJA' | 'DELIVERY_PROPRIO' | 'IFOOD', valorReais: number, dia = 1) => ({ data: `2025-10-${String(dia).padStart(2, '0')}`, canal, valorCentavos: R(valorReais) });
  const ano = (graos: ReturnType<typeof grao>[], atual: Record<'LOJA' | 'DELIVERY_PROPRIO' | 'IFOOD', number>, ate = '2026-10-01', faltas = 0) =>
    compararComOAnoPassado({ de: '2026-10-01', ate, atual, graosDoAnoPassado: graos, faltasNoPeriodoAtual: faltas });

  it('critério 5: iFood −18,0 % com meta +5 % é VERMELHO; Loja +4,0 % com meta 5 % é VERDE; Delivery −5,0 % com meta 0 é LARANJA', () => {
    const a = ano([grao('IFOOD', 50_000), grao('LOJA', 80_000), grao('DELIVERY_PROPRIO', 20_000)], { IFOOD: R(41_000), LOJA: R(83_200), DELIVERY_PROPRIO: R(19_000) });
    expect(a.linhas.find((l) => l.chave === 'IFOOD')).toMatchObject({ anteriorCentavos: R(50_000), variacaoBp: -1800 });
    const ifood = compararCrescimento('IFOOD', 500, a);
    expect(ifood).toMatchObject({ tipo: 'crescimento', desvioBp: -2300, desvioTexto: '−23,0 pp', variacaoBp: -1800, metaCentavos: R(52_500) });
    expect(ifood.faixa).toMatchObject({ cor: 'VERMELHO', palavra: 'muito pior que a meta' });
    const lojaC = compararCrescimento('LOJA', 500, a);
    expect(lojaC).toMatchObject({ variacaoBp: 400, desvioBp: -100 });
    expect(lojaC.faixa?.cor).toBe('VERDE'); // -100 é a borda do verde
    const delivery = compararCrescimento('DELIVERY_PROPRIO', 0, a);
    expect(delivery).toMatchObject({ variacaoBp: -500, desvioBp: -500, metaCentavos: R(20_000) });
    expect(delivery.faixa?.cor).toBe('LARANJA');
  });

  it('a receita bruta também tem o farol de crescimento, e a meta em reais é o ano passado × (1 + meta)', () => {
    const a = ano([grao('LOJA', 100_000)], { LOJA: R(112_000), DELIVERY_PROPRIO: 0, IFOOD: 0 });
    const c = compararCrescimento('bruta', 1000, a);
    expect(c).toMatchObject({ variacaoBp: 1200, desvioBp: 200, metaCentavos: R(110_000) });
    expect(c.faixa?.cor).toBe('VERDE');
  });

  it('critério 6: ano passado com "12 de 15 dias" ou sem lançamento (R$ 0,00) não compara, e diz por quê', () => {
    const doze = Array.from({ length: 12 }, (_, i) => grao('LOJA', 1_000, i + 1));
    const parcial = ano(doze, { LOJA: R(15_000), DELIVERY_PROPRIO: 0, IFOOD: 0 }, '2026-10-15');
    expect(parcial.motivoCurto).toBe('ano passado: 12 de 15 dias');
    expect(compararCrescimento('LOJA', 500, parcial)).toMatchObject({ desvioBp: null, faixa: null, semComparacao: 'ano passado: 12 de 15 dias' });
    const zero = ano([], { LOJA: R(15_000), DELIVERY_PROPRIO: 0, IFOOD: 0 });
    expect(compararCrescimento('LOJA', 500, zero)).toMatchObject({ desvioBp: null, faixa: null, semComparacao: 'sem lançamento no ano passado' });
    // Um canal que não vendia no ano passado não tem crescimento (não existe divisão por zero).
    const soLoja = ano([grao('LOJA', 1_000)], { LOJA: R(1_000), DELIVERY_PROPRIO: R(500), IFOOD: 0 });
    expect(compararCrescimento('DELIVERY_PROPRIO', 0, soLoja)).toMatchObject({ faixa: null, semComparacao: 'o canal não vendia no ano passado' });
    expect(compararCrescimento('LOJA', 0, null)).toMatchObject({ faixa: null, semComparacao: 'nenhum dia apurado' });
  });

  it('faltando lançamento neste período, a variação sai sem cor com o motivo curto', () => {
    const a = ano([grao('LOJA', 1_000)], { LOJA: R(900), DELIVERY_PROPRIO: 0, IFOOD: 0 }, '2026-10-01', 1);
    expect(compararCrescimento('LOJA', 0, a)).toMatchObject({ faixa: null, semComparacao: 'faltam lançamentos de faturamento neste período' });
  });
});

describe('2.4 · quando o dado não fecha, não há cor (critérios 7, 8 e 9; decisão 175)', () => {
  const despesaPessoal = [{ linhaId: idDe('salarios'), lojaId: 'vp', centavos: R(2_000) }];

  it('critério 7: margem com CMV nulo ("sem contar o CMV") fica sem cor; com CMV pelas compras tem cor', () => {
    const semCmv = dreDe({ despesas: despesaPessoal });
    const f1 = farolDe(semCmv, { 'margem-contribuicao': 9000, cmv: 2000 });
    expect(f1.porLinha['margem-contribuicao']).toMatchObject({ tipo: 'sem', motivo: 'sem contar o CMV' });
    expect(f1.porLinha['margem-contribuicao'].desvioTexto).not.toBeNull(); // o desvio segue em texto
    expect(f1.porLinha.cmv).toMatchObject({ tipo: 'sem', motivo: 'sem valor apurado' });
    const comCmv = dreDe({ despesas: despesaPessoal, cmv: cmvDeCompra(R(2_500)) });
    const f2 = farolDe(comCmv, { 'margem-contribuicao': 7500, cmv: 2000 });
    expect(f2.porLinha['margem-contribuicao']).toMatchObject({ tipo: 'cor' });
    expect(f2.porLinha.cmv).toMatchObject({ tipo: 'cor', cor: 'VERMELHO' });
  });

  it('só algumas lojas sem CMV: a frase diz quais ("sem contar o CMV de Centro") e tira a cor', () => {
    const r = dreDe({ receitas: [{ lojaId: 'vp', canal: 'LOJA', valorCentavos: R(10_000) }, { lojaId: 'ct', canal: 'LOJA', valorCentavos: R(5_000) }], cmv: { lojas: [loja('vp', 'Vila da Penha', R(2_000)), loja('ct', 'Centro', null)], parcial: false } });
    const f = farolDe(r, { 'resultado-do-periodo': 1000 });
    expect(f.porLinha['resultado-do-periodo']).toMatchObject({ tipo: 'sem', motivo: 'sem contar o CMV de Centro' });
  });

  it('critério 8: um dia de faturamento faltando tira a cor de TODAS as linhas do escopo; o desvio continua', () => {
    const r = dreDe({ despesas: despesaPessoal, cmv: cmvDeCompra(R(2_500)) });
    const f = farolDe(r, { 'grupo:PESSOAL': 1000, cmv: 2000, 'resultado-do-periodo': 1000 }, { faltasDeFaturamento: 1 });
    expect(f.motivoGeral).toBe('faltam lançamentos de faturamento');
    for (const l of Object.values(f.porLinha)) expect(l).toMatchObject({ tipo: 'sem', motivo: 'faltam lançamentos de faturamento' });
    expect(f.porLinha.cmv.desvioTexto).toBe('+5,0 pp');
    expect(f.contagem.every((c) => c.linhas.length === 0)).toBe(true);
    expect(f.semCor).toHaveLength(3);
  });

  it('critério 9: as Taxas do iFood têm farol no total (varia com o mix) e o painel por canal não repete o farol de custo', () => {
    const r = dreDe({ receitas: [{ lojaId: 'vp', canal: 'IFOOD', valorCentavos: R(10_000) }], taxaIfood: { comissaoBp: 2300, pagamentoBp: 320 }, cmv: cmvDeCompra(R(100)) });
    const f = farolDe(r, { 'taxas-ifood': 2000 });
    expect(f.porLinha['taxas-ifood']).toMatchObject({ tipo: 'cor', cor: 'VERMELHO' }); // 26,2 % contra 20 %: 6,2 pp pior → s = −620
    const canais = canaisDoPeriodo({ porCanal: r.porCanal, receitaBrutaCentavos: r.receitaBrutaCentavos, pedidos: pedidosPorCanal([]), anoPassado: null, metas: {}, farol: f, vendidos: [] });
    expect(canais).toHaveLength(1);
    expect(canais[0]).toMatchObject({ canal: 'IFOOD', farol: null });
  });

  it('o falso azul: despesa que repete e não foi lançada tira a cor da linha, do grupo e dos resultados abaixo (não de quem não depende dela)', () => {
    // Pessoal sem o salário lançado ficaria "bem melhor que a meta" por esquecimento (só os encargos entraram).
    const r = dreDe({ despesas: [{ linhaId: idDe('aluguel'), lojaId: 'vp', centavos: R(1_000) }, { linhaId: idDe('encargos'), lojaId: 'vp', centavos: R(500) }], cmv: cmvDeCompra(R(2_000)) });
    const metas = { 'grupo:PESSOAL': 2500, salarios: 2500, 'grupo:OCUPACAO': 1000, cmv: 2500, 'margem-contribuicao': 7000, 'resultado-operacional': 5000, 'resultado-do-periodo': 5000 };
    const recorrentes = [{ grupo: 'PESSOAL' as const, linhaId: idDe('salarios') }];
    const f = farolDe(r, metas, { recorrentes });
    expect(f.porLinha['grupo:PESSOAL']).toMatchObject({ tipo: 'sem', motivo: 'falta lançar despesa que repete todo mês' });
    expect(f.porLinha['resultado-operacional']).toMatchObject({ tipo: 'sem' });
    expect(f.porLinha['resultado-do-periodo']).toMatchObject({ tipo: 'sem' });
    // CMV, ocupação e a margem não dependem do salário.
    expect(f.porLinha.cmv.tipo).toBe('cor');
    expect(f.porLinha['grupo:OCUPACAO'].tipo).toBe('cor');
    expect(f.porLinha['margem-contribuicao'].tipo).toBe('cor');
    // Sem saber qual linha é (fotografia antiga), vale para toda despesa e todo resultado.
    const desconhecida = farolDe(r, metas, { recorrentes: [{ grupo: null, linhaId: null }] });
    expect(desconhecida.porLinha['grupo:OCUPACAO'].tipo).toBe('sem');
    expect(desconhecida.porLinha['margem-contribuicao'].tipo).toBe('sem');
    expect(desconhecida.porLinha.cmv.tipo).toBe('cor');
  });

  it('período fechado antes do farol: a receita diz "não apurado neste fechamento" e o custo segue com cor', () => {
    const r = dreDe({ despesas: despesaPessoal, cmv: cmvDeCompra(R(2_500)) });
    const f = farolDe(r, { cmv: 2000 }, { receitaNaoApurada: true });
    expect(f.porLinha['grupo:RECEITA']).toMatchObject({ tipo: 'sem', motivo: 'não apurado neste fechamento (fechado antes do farol)' });
    expect(f.porLinha['receita-loja']).toMatchObject({ tipo: 'sem', motivo: 'não apurado neste fechamento (fechado antes do farol)' });
    expect(f.porLinha.cmv.tipo).toBe('cor');
  });

  it('a contagem por faixa e as linhas laranja e vermelha (a âncora do painel)', () => {
    const r = dreDe({ despesas: despesaPessoal, cmv: cmvDeCompra(R(4_000)) });
    const f = farolDe(r, { cmv: 2000, 'grupo:PESSOAL': 2000, 'resultado-do-periodo': 5000 });
    const por = Object.fromEntries(f.contagem.map((c) => [c.cor, c.linhas.map((l) => l.chave)]));
    expect(por.VERMELHO).toContain('cmv'); // 40 % contra 20 %
    expect(por.VERDE).toContain('grupo:PESSOAL');
    expect(f.contagem.map((c) => c.cor)).toEqual(['AZUL', 'VERDE', 'AMARELO', 'LARANJA', 'VERMELHO']);
  });
});

describe('2.4 · meta de crescimento: o que se aceita (ataque 5)', () => {
  it.each(['0', '5', '12,5', '100'])('%s vale', (t) => expect(lerMetaDigitada(t, 'crescimento').ok).toBe(true));
  it.each(['100,01', '-5', '1e2', 'abc', '5,555'])('%s é recusado com frase de crescimento', (t) => {
    const r = lerMetaDigitada(t, 'crescimento');
    expect(r.ok).toBe(false);
    expect((r as { erro: string }).erro).toMatch(/rescimento/);
  });
  it('o texto da meta de crescimento leva o sinal', () => {
    expect(textoDaMetaDeCrescimento(500)).toBe('+5,0 %');
    expect(textoDaMetaDeCrescimento(0)).toBe('0,0 %');
  });
});

describe('2.4 · o ano passado que a fotografia guarda (decisão 178)', () => {
  const graos = [
    { lojaId: 'vp', data: '2025-10-01', canal: 'LOJA' as const, valorCentavos: 10_000 },
    { lojaId: 'vp', data: '2025-10-02', canal: 'LOJA' as const, valorCentavos: 20_000 },
    { lojaId: 'vp', data: '2025-10-02', canal: 'IFOOD' as const, valorCentavos: 5_000 },
    { lojaId: 'ct', data: '2025-10-02', canal: 'LOJA' as const, valorCentavos: 7_000 },
    { lojaId: 'ct', data: '2025-10-03', canal: 'LOJA' as const, valorCentavos: 1_000 },
  ];
  const g = anoPassadoParaGravar('2025-10-01', '2025-10-03', graos);

  it('guarda por loja os dias (índice a partir do começo) e o total de cada canal; ida e volta pelo JSON', () => {
    expect(g.lojas.vp).toEqual({ dias: [0, 1], canais: { LOJA: 30_000, IFOOD: 5_000 } });
    expect(g.lojas.ct).toEqual({ dias: [1, 2], canais: { LOJA: 8_000 } });
    const volta = JSON.parse(JSON.stringify(g));
    expect(lerAnoPassadoGuardado(volta, 'todas')).toEqual({ dias: 3, porCanal: { LOJA: 38_000, DELIVERY_PROPRIO: null, IFOOD: 5_000 } });
  });
  it('lê SÓ as lojas pedidas (o gerente de uma loja nunca soma a outra) e os dias não se repetem', () => {
    expect(lerAnoPassadoGuardado(g, ['ct'])).toEqual({ dias: 2, porCanal: { LOJA: 8_000, DELIVERY_PROPRIO: null, IFOOD: null } });
    expect(lerAnoPassadoGuardado(g, ['vp', 'ct'])?.dias).toBe(3);
    expect(lerAnoPassadoGuardado(g, [])).toEqual({ dias: 0, porCanal: { LOJA: null, DELIVERY_PROPRIO: null, IFOOD: null } });
  });
  it('a variação do guardado é a mesma da leitura ao vivo', () => {
    const atual = { LOJA: 45_000, DELIVERY_PROPRIO: 0, IFOOD: 4_000 };
    const vivo = compararComOAnoPassado({ de: '2026-10-01', ate: '2026-10-03', atual, graosDoAnoPassado: graos.map((x) => ({ data: x.data, canal: x.canal, valorCentavos: x.valorCentavos })), faltasNoPeriodoAtual: 0 });
    const guardado = compararComOAnoPassadoSomado({ de: '2026-10-01', ate: '2026-10-03', atual, anterior: lerAnoPassadoGuardado(JSON.parse(JSON.stringify(g)), 'todas')!, faltasNoPeriodoAtual: 0 });
    expect(guardado).toEqual(vivo);
  });
  it('JSON que não é o guardado vira nulo, nunca erro', () => {
    for (const lixo of [null, 3, 'x', {}, { versao: 2, lojas: {} }, { versao: 1, lojas: null }]) expect(lerAnoPassadoGuardado(lixo, 'todas')).toBeNull();
  });
});

describe('2.4 · o painel por canal', () => {
  const r = dreDe({ receitas: [{ lojaId: 'vp', canal: 'LOJA', valorCentavos: R(8_000), pedidos: 200 }, { lojaId: 'vp', canal: 'IFOOD', valorCentavos: R(2_000), pedidos: 0 }] });
  const a = compararComOAnoPassado({
    de: '2026-10-01',
    ate: '2026-10-01',
    atual: r.porCanal,
    graosDoAnoPassado: [{ data: '2025-10-01', canal: 'LOJA', valorCentavos: R(7_000) }],
    faltasNoPeriodoAtual: 0,
  });
  const metas = compararLinhas(r.linhas, new Map([['receita-loja', 1000]]), r.receitaBrutaCentavos, false, a);
  const farol = farolDoDre({ linhas: r.linhas, metas, faltasDeFaturamento: 0, recorrentes: [], receitaNaoApurada: false });
  const canais = canaisDoPeriodo({ porCanal: r.porCanal, receitaBrutaCentavos: r.receitaBrutaCentavos, pedidos: pedidosPorCanal(r.linhas.length ? [{ canal: 'LOJA', pedidos: 200 }, { canal: 'IFOOD', pedidos: 0 }] : []), anoPassado: a, metas, farol, vendidos: [] });

  it('um bloco por canal que vende (Delivery sem venda e sem configuração não aparece), com ticket e participação', () => {
    expect(canais.map((c) => c.canal)).toEqual(['LOJA', 'IFOOD']);
    expect(canais[0]).toMatchObject({ receitaCentavos: R(8_000), participacaoBp: 8000, pedidos: 200, ticketCentavos: R(40), anteriorCentavos: R(7_000), variacaoBp: 1429, metaBp: 1000, metaCentavos: R(7_700) });
    // iFood: pedidos zero é "não informado", nunca ticket de zero nem divisão por zero.
    expect(canais[1]).toMatchObject({ pedidos: null, ticketCentavos: null, anteriorCentavos: null, farol: null });
  });
  it('o farol do canal é o de crescimento (2,9 pontos acima da meta é verde)', () => {
    expect(canais[0].farol).toMatchObject({ tipo: 'cor', cor: 'VERDE', desvioTexto: '+4,3 pp' });
  });
  it('um canal configurado para vender aparece mesmo sem venda', () => {
    const com = canaisDoPeriodo({ porCanal: r.porCanal, receitaBrutaCentavos: r.receitaBrutaCentavos, pedidos: pedidosPorCanal([]), anoPassado: a, metas, farol, vendidos: ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'] });
    expect(com.map((c) => c.canal)).toEqual(['LOJA', 'DELIVERY_PROPRIO', 'IFOOD']);
    expect(com[1]).toMatchObject({ receitaCentavos: 0, participacaoBp: 0 });
  });
});

// ------------------------------------------------------------------ cores (critério 10)

describe('2.4 · o contraste das 5 cores nos dois temas (critério 10)', () => {
  const css = readFileSync(join(process.cwd(), 'src/components/erp/tokens.css'), 'utf8');
  const bloco = (abre: RegExp) => {
    const i = css.search(abre);
    expect(i, String(abre)).toBeGreaterThanOrEqual(0);
    return css.slice(i, css.indexOf('}', i));
  };
  const canal = (b: string, nome: string): [number, number, number] => {
    const m = new RegExp(`--ff-${nome}:\\s*(\\d+) (\\d+) (\\d+)`).exec(b);
    expect(m, nome).not.toBeNull();
    return [Number(m![1]), Number(m![2]), Number(m![3])];
  };
  const lum = ([r, g, b]: [number, number, number]) => {
    const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contraste = (a: [number, number, number], b: [number, number, number]) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const temas = [
    ['claro', /\.ff-app,\s*\n\.ff-app\[data-tema='claro'\]/],
    ['escuro', /\.ff-app\[data-tema='escuro'\]/],
    ['sistema escuro', /@media \(prefers-color-scheme: dark\) \{\s*\n\s*\.ff-app\[data-tema='sistema'\]/],
  ] as const;
  for (const [nome, abre] of temas) {
    it(`${nome}: a palavra colorida tem ao menos 4,5:1 sobre o painel, o fundo e a linha de resultado (o glifo, ao menos 3:1)`, () => {
      const b = bloco(abre);
      for (const fundo of ['painel', 'fundo', 'forte']) {
        for (const cor of ['azul', 'verde', 'amarelo', 'laranja', 'vermelho']) {
          const c = contraste(canal(b, `farol-${cor}`), canal(b, fundo));
          expect(c, `${nome} ${cor} sobre ${fundo}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
  }
});
