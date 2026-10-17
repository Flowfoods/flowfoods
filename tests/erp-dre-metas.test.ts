/**
 * ERP 2.2b · metas, comparação e fechamento — a conta e as regras, SEM banco.
 *
 *  - ler a meta digitada ("12,5" = 1250; vazio é sem meta; zero é meta; lixo é recusa com frase);
 *  - realizado × meta: Pessoal R$ 2.600 sobre R$ 10.000 com meta de 25 % = 26,0 %, "+1,0 pp", "pior que a meta",
 *    meta R$ 2.500; o lado bom segue o `sentido`; 4 pontos-base é "na meta"; valor nulo, receita zero e linha
 *    sem lançamento não comparam;
 *  - ano passado: mesmas datas menos um ano (29/02 compara com 28/02), cobertura "N de M dias", variação só com
 *    dado completo, sem lançamento nunca vira R$ 0,00;
 *  - condições para fechar: justificativa, motivo, impressão, e a ponte entre o DRE e as linhas da fotografia.
 */
import { describe, expect, it } from 'vitest';
import { SEM_CMV } from '@/lib/erp/cmv-campos';
import { montarDre } from '@/lib/erp/dre-campos';
import {
  impressaoDasCondicoes,
  impressaoDoTexto,
  dreDaFotografia,
  fraseDaRecusaDeFechar,
  lerJustificativa,
  lerMotivoDaReabertura,
  linhasParaGravar,
  metasDasLinhas,
} from '@/lib/erp/dre-fechamento-campos';
import {
  aceitaMeta,
  compararComMeta,
  compararComOAnoPassado,
  compararLinhas,
  lerMetaDigitada,
  linhasDeMeta,
  mesmaDataNoAnoPassado,
  metaApareceNaLoja,
  metaParaCampo,
  textoDaMeta,
  textoDaVariacao,
} from '@/lib/erp/dre-metas-campos';
import { planoEfetivo } from '@/lib/erp/dre-plano';

const plano = planoEfetivo([]);

/** Um DRE de R$ 10.000,00 de receita (só a loja), com Pessoal e Aluguel lançados. */
function dreDeDezMil(pessoal = 260_000) {
  const idDe = (codigo: string) => plano.find((l) => l.codigo === codigo)!.id;
  // O plano virtual não tem id: dá um id a cada linha para as despesas casarem.
  const comId = plano.map((l, i) => ({ ...l, id: `L${i}` }));
  return montarDre({
    escopo: { tipo: 'rede' },
    plano: comId,
    receitas: [{ lojaId: 'vp', canal: 'LOJA', valorCentavos: 1_000_000 }],
    taxaIfood: null,
    despesas: [
      { linhaId: comId.find((l) => l.codigo === 'salarios')!.id!, lojaId: 'vp', centavos: pessoal },
      { linhaId: comId.find((l) => l.codigo === 'aluguel')!.id!, lojaId: null, centavos: 120_000 },
    ],
    cmv: SEM_CMV,
  });
  void idDe;
}

describe('2.2b · ler a meta digitada (critério 3)', () => {
  it('"12,5" = 1250; "12,55 %" = 1255; "30" = 3000; "100" = 10000', () => {
    expect(lerMetaDigitada('12,5')).toEqual({ ok: true, bp: 1250 });
    expect(lerMetaDigitada('12,55 %')).toEqual({ ok: true, bp: 1255 });
    expect(lerMetaDigitada(' 30 ')).toEqual({ ok: true, bp: 3000 });
    expect(lerMetaDigitada('100')).toEqual({ ok: true, bp: 10000 });
    expect(lerMetaDigitada('100,00')).toEqual({ ok: true, bp: 10000 });
  });
  it('vazio é "sem meta" (nulo) e "0" é uma meta de zero, que não é a mesma coisa', () => {
    expect(lerMetaDigitada('')).toEqual({ ok: true, bp: null });
    expect(lerMetaDigitada('   ')).toEqual({ ok: true, bp: null });
    expect(lerMetaDigitada('0')).toEqual({ ok: true, bp: 0 });
    expect(lerMetaDigitada('0,00')).toEqual({ ok: true, bp: 0 });
  });
  it.each(['100,01', '12,555', '-1', '1e3', 'abc', '12,5,5', '1.000', '--', '+5', '12 %%', '١٢', 'Infinity', 'NaN', '9'.repeat(30)])('%s é recusado com frase', (texto) => {
    const r = lerMetaDigitada(texto);
    expect(r.ok).toBe(false);
    expect((r as { erro: string }).erro.length).toBeGreaterThan(10);
  });
  it('o que não é texto também é recusado', () => {
    expect(lerMetaDigitada(12)).toMatchObject({ ok: false });
    expect(lerMetaDigitada(null)).toMatchObject({ ok: false });
    expect(lerMetaDigitada(undefined)).toMatchObject({ ok: false });
  });
  it('o texto de volta: "25,0 %", "12,55 %" e o campo "12,5"', () => {
    expect(textoDaMeta(2500)).toBe('25,0 %');
    expect(textoDaMeta(1255)).toBe('12,55 %');
    expect(metaParaCampo(1250)).toBe('12,5');
    expect(metaParaCampo(3000)).toBe('30');
    expect(metaParaCampo(0)).toBe('0');
  });
});

describe('2.2b · quem aceita meta (critério 4)', () => {
  it('receita bruta e receita por canal não aceitam; CMV, subtotais e resultados aceitam', () => {
    for (const chave of ['grupo:RECEITA', 'receita-loja', 'receita-delivery', 'receita-ifood']) expect(aceitaMeta(chave), chave).toBe(false);
    for (const chave of ['cmv', 'salarios', 'grupo:PESSOAL', 'receita-liquida', 'margem-contribuicao', 'resultado-do-periodo', 'id:cabc123']) expect(aceitaMeta(chave), chave).toBe(true);
  });
  it('na visão da loja só os dois resultados ficam sem meta', () => {
    expect(metaApareceNaLoja('resultado-operacional')).toBe(false);
    expect(metaApareceNaLoja('resultado-do-periodo')).toBe(false);
    for (const chave of ['salarios', 'grupo:PESSOAL', 'receita-liquida', 'margem-contribuicao', 'cmv']) expect(metaApareceNaLoja(chave), chave).toBe(true);
  });
  it('a lista da tela das metas tem todas as linhas na ordem do DRE, a receita sem campo e o CMV com campo', () => {
    const linhas = linhasDeMeta(plano);
    expect(linhas[0]).toMatchObject({ chave: 'grupo:RECEITA', aceita: false });
    expect(linhas.find((l) => l.chave === 'cmv')).toMatchObject({ aceita: true });
    expect(linhas.find((l) => l.chave === 'grupo:PESSOAL')).toMatchObject({ aceita: true, nivel: 0 });
    expect(linhas.find((l) => l.chave === 'salarios')).toMatchObject({ aceita: true, nivel: 1 });
    expect(linhas.at(-1)!.chave).toBe('resultado-do-periodo');
    expect(new Set(linhas.map((l) => l.chave)).size).toBe(linhas.length);
  });
  it('linha oculta continua na lista (a meta dela se edita), marcada', () => {
    const oculta = plano.map((l) => (l.codigo === 'iptu' ? { ...l, ativa: false } : l));
    expect(linhasDeMeta(oculta).find((l) => l.chave === 'iptu')).toMatchObject({ oculta: true });
  });
});

describe('2.2b · realizado × meta (critério 5)', () => {
  it('Pessoal R$ 2.600,00 sobre R$ 10.000,00, meta 25 % = 26,0 %, "+1,0 pp", "pior que a meta", meta em R$ 2.500,00', () => {
    const r = dreDeDezMil(260_000);
    const pessoal = r.linhas.find((l) => l.chave === 'grupo:PESSOAL')!;
    expect(pessoal.percentualBp).toBe(2600);
    const c = compararComMeta(pessoal, 2500, r.receitaBrutaCentavos);
    expect(c).toMatchObject({ metaBp: 2500, metaCentavos: 250_000, desvioBp: 100, desvioTexto: '+1,0 pp', palavra: 'pior que a meta', semComparacao: null });
  });
  it('a margem com o mesmo desvio é "melhor que a meta" (o lado bom vem do sentido)', () => {
    const r = dreDeDezMil(260_000);
    const margem = r.linhas.find((l) => l.chave === 'margem-contribuicao')!;
    expect(margem.sentido).toBe('MAIOR_MELHOR');
    const c = compararComMeta(margem, margem.percentualBp! - 100, r.receitaBrutaCentavos);
    expect(c).toMatchObject({ desvioBp: 100, palavra: 'melhor que a meta' });
  });
  it('despesa abaixo da meta é "melhor"; margem abaixo da meta é "pior"', () => {
    const r = dreDeDezMil(200_000);
    const pessoal = r.linhas.find((l) => l.chave === 'grupo:PESSOAL')!;
    expect(compararComMeta(pessoal, 2500, r.receitaBrutaCentavos)).toMatchObject({ desvioBp: -500, desvioTexto: '−5,0 pp', palavra: 'melhor que a meta' });
    const operacional = r.linhas.find((l) => l.chave === 'resultado-operacional')!;
    expect(operacional.percentualBp).toBe(6800);
    expect(compararComMeta(operacional, 9000, r.receitaBrutaCentavos).palavra).toBe('pior que a meta');
  });
  it('desvio de 4 pontos-base é "na meta"; 5 já não é', () => {
    const r = dreDeDezMil(260_000);
    const pessoal = r.linhas.find((l) => l.chave === 'grupo:PESSOAL')!;
    expect(compararComMeta(pessoal, 2596, r.receitaBrutaCentavos)).toMatchObject({ desvioBp: 4, desvioTexto: '+0,0 pp', palavra: 'na meta' });
    expect(compararComMeta(pessoal, 2604, r.receitaBrutaCentavos)).toMatchObject({ desvioBp: -4, palavra: 'na meta' });
    expect(compararComMeta(pessoal, 2595, r.receitaBrutaCentavos).palavra).toBe('pior que a meta');
    expect(compararComMeta(pessoal, 2605, r.receitaBrutaCentavos).palavra).toBe('melhor que a meta');
    expect(compararComMeta(pessoal, 2600, r.receitaBrutaCentavos).palavra).toBe('na meta');
  });
  it('CMV (valor nulo), receita zero e despesa sem lançamento não comparam: traço, nunca zero', () => {
    const r = dreDeDezMil();
    const cmv = r.linhas.find((l) => l.chave === 'cmv')!;
    expect(compararComMeta(cmv, 3000, r.receitaBrutaCentavos)).toMatchObject({ desvioBp: null, desvioTexto: null, palavra: null, semComparacao: 'sem valor apurado', metaCentavos: 300_000 });
    const energia = r.linhas.find((l) => l.chave === 'energia')!;
    expect(compararComMeta(energia, 400, r.receitaBrutaCentavos)).toMatchObject({ desvioBp: null, semComparacao: 'sem lançamento', metaCentavos: 40_000 });
    const semReceita = montarDre({ escopo: { tipo: 'rede' }, plano, receitas: [], taxaIfood: null, despesas: [], cmv: SEM_CMV });
    const p = semReceita.linhas.find((l) => l.chave === 'grupo:PESSOAL')!;
    expect(compararComMeta(p, 2500, 0)).toMatchObject({ desvioBp: null, metaCentavos: null, semComparacao: 'sem faturamento' });
  });
  it('um resultado que fechou em zero com receita compara de verdade', () => {
    const r = montarDre({ escopo: { tipo: 'rede' }, plano: plano.map((l, i) => ({ ...l, id: `L${i}` })), receitas: [{ lojaId: 'x', canal: 'LOJA', valorCentavos: 100_000 }], taxaIfood: null, despesas: [], cmv: SEM_CMV });
    const linha = r.linhas.find((l) => l.chave === 'resultado-do-periodo')!;
    expect(linha.valorCentavos).toBe(100_000);
    const zerado = { valorCentavos: 0, percentualBp: 0, tipo: 'resultado', sentido: 'MAIOR_MELHOR' as const };
    expect(compararComMeta(zerado, 500, 100_000)).toMatchObject({ desvioBp: -500, palavra: 'pior que a meta' });
  });
  it('a meta em R$ faz um arredondamento só', () => {
    expect(compararComMeta({ valorCentavos: 100, percentualBp: 100, tipo: 'linha', sentido: 'MENOR_MELHOR' }, 3333, 1_000_01).metaCentavos).toBe(33_330);
  });
  it('compararLinhas: a visão da loja não traz meta nos dois resultados; linha sem meta não entra; receita não entra mesmo com meta forjada', () => {
    const r = dreDeDezMil();
    const metas = new Map([['grupo:PESSOAL', 2500], ['resultado-do-periodo', 1000], ['resultado-operacional', 1000], ['receita-loja', 5000], ['grupo:RECEITA', 100]]);
    const rede = compararLinhas(r.linhas, metas, r.receitaBrutaCentavos, false);
    expect(Object.keys(rede).sort()).toEqual(['grupo:PESSOAL', 'resultado-do-periodo', 'resultado-operacional']);
    const loja = compararLinhas(r.linhas, metas, r.receitaBrutaCentavos, true);
    expect(Object.keys(loja)).toEqual(['grupo:PESSOAL']);
  });
});

describe('2.2b · ano passado (critério 7)', () => {
  it('as mesmas datas menos um ano; 29/02 compara com 28/02', () => {
    expect(mesmaDataNoAnoPassado('2026-10-17')).toBe('2025-10-17');
    expect(mesmaDataNoAnoPassado('2024-02-29')).toBe('2023-02-28');
    expect(mesmaDataNoAnoPassado('2024-03-01')).toBe('2023-03-01');
    expect(mesmaDataNoAnoPassado('2028-02-29')).toBe('2027-02-28');
    expect(mesmaDataNoAnoPassado('2025-02-28')).toBe('2024-02-28');
  });
  const atual = { LOJA: 100_000, DELIVERY_PROPRIO: 50_000, IFOOD: 25_000 };
  const grao = (data: string, canal: 'LOJA' | 'DELIVERY_PROPRIO' | 'IFOOD', valorCentavos: number) => ({ data, canal, valorCentavos });
  const diasDe = (de: string, n: number) => Array.from({ length: n }, (_, i) => `2025-10-${String(Number(de.slice(8)) + i).padStart(2, '0')}`);

  it('cobertura total e período atual sem falta: variação por canal e na receita bruta', () => {
    const graos = diasDe('2025-10-01', 15).flatMap((d) => [grao(d, 'LOJA', 5_000), grao(d, 'DELIVERY_PROPRIO', 2_000)]);
    const a = compararComOAnoPassado({ de: '2026-10-01', ate: '2026-10-15', atual, graosDoAnoPassado: graos, faltasNoPeriodoAtual: 0 });
    expect(a).toMatchObject({ de: '2025-10-01', ate: '2025-10-15', diasComLancamento: 15, diasDoRecorte: 15, semVariacaoPorque: null });
    expect(a.linhas.find((l) => l.chave === 'LOJA')).toMatchObject({ atualCentavos: 100_000, anteriorCentavos: 75_000, variacaoBp: 3333 });
    expect(a.linhas.find((l) => l.chave === 'DELIVERY_PROPRIO')).toMatchObject({ anteriorCentavos: 30_000, variacaoBp: 6667 });
    // iFood sem lançamento no ano passado: "sem lançamento", nunca R$ 0,00 nem variação.
    expect(a.linhas.find((l) => l.chave === 'IFOOD')).toMatchObject({ atualCentavos: 25_000, anteriorCentavos: null, variacaoBp: null });
    expect(a.linhas.find((l) => l.chave === 'bruta')).toMatchObject({ atualCentavos: 175_000, anteriorCentavos: 105_000, variacaoBp: 6667 });
  });
  it('cobertura parcial: sem variação, com a razão "12 de 15 dias" e os dois números', () => {
    const graos = diasDe('2025-10-01', 12).map((d) => grao(d, 'LOJA', 5_000));
    const a = compararComOAnoPassado({ de: '2026-10-01', ate: '2026-10-15', atual, graosDoAnoPassado: graos, faltasNoPeriodoAtual: 0 });
    expect(a.semVariacaoPorque).toContain('12 de 15 dias');
    expect(a.linhas.every((l) => l.variacaoBp === null)).toBe(true);
    expect(a.linhas.find((l) => l.chave === 'LOJA')!.anteriorCentavos).toBe(60_000);
  });
  it('o período de agora com falta de lançamento também não compara', () => {
    const graos = diasDe('2025-10-01', 15).map((d) => grao(d, 'LOJA', 5_000));
    const a = compararComOAnoPassado({ de: '2026-10-01', ate: '2026-10-15', atual, graosDoAnoPassado: graos, faltasNoPeriodoAtual: 2 });
    expect(a.semVariacaoPorque).toContain('faltando');
    expect(a.linhas.every((l) => l.variacaoBp === null)).toBe(true);
    expect(a.linhas.find((l) => l.chave === 'LOJA')!.anteriorCentavos).toBe(75_000);
  });
  it('nenhum lançamento no ano passado: tudo "sem lançamento" (nulo)', () => {
    const a = compararComOAnoPassado({ de: '2026-10-01', ate: '2026-10-15', atual, graosDoAnoPassado: [], faltasNoPeriodoAtual: 0 });
    expect(a.linhas.every((l) => l.anteriorCentavos === null && l.variacaoBp === null)).toBe(true);
    expect(a.semVariacaoPorque).toContain('Sem lançamento');
  });
  it('um dia com 29/02: fevereiro bissexto compara com os 28 dias do ano passado', () => {
    const graos = Array.from({ length: 28 }, (_, i) => ({ data: `2023-02-${String(i + 1).padStart(2, '0')}`, canal: 'LOJA' as const, valorCentavos: 1_000 }));
    const a = compararComOAnoPassado({ de: '2024-02-01', ate: '2024-02-29', atual: { LOJA: 30_000, DELIVERY_PROPRIO: 0, IFOOD: 0 }, graosDoAnoPassado: graos, faltasNoPeriodoAtual: 0 });
    expect(a).toMatchObject({ de: '2023-02-01', ate: '2023-02-28', diasComLancamento: 28, diasDoRecorte: 28, semVariacaoPorque: null });
    expect(a.linhas.find((l) => l.chave === 'LOJA')).toMatchObject({ anteriorCentavos: 28_000, variacaoBp: 714 });
  });
  it('o texto da variação: sinal e uma casa', () => {
    expect(textoDaVariacao(1250)).toBe('+12,5 %');
    expect(textoDaVariacao(-300)).toBe('−3,0 %');
    expect(textoDaVariacao(0)).toBe('+0,0 %');
  });
});

describe('2.2b · justificativa, motivo, impressão e a ponte com a fotografia', () => {
  it('justificativa de 10 a 300 letras, texto limpo', () => {
    expect(lerJustificativa('curta')).toMatchObject({ ok: false });
    expect(lerJustificativa('         ')).toMatchObject({ ok: false });
    expect(lerJustificativa('x'.repeat(301))).toMatchObject({ ok: false });
    expect(lerJustificativa(undefined)).toMatchObject({ ok: false });
    expect(lerJustificativa('  A conta de luz\u0000 chega dia 5.  ')).toEqual({ ok: true, texto: 'A conta de luz chega dia 5.' });
    expect(lerJustificativa('x'.repeat(300))).toMatchObject({ ok: true });
    expect(lerJustificativa('x'.repeat(10))).toMatchObject({ ok: true });
  });
  it('motivo de reabrir de 3 a 200 letras', () => {
    expect(lerMotivoDaReabertura('ab')).toMatchObject({ ok: false });
    expect(lerMotivoDaReabertura('x'.repeat(201))).toMatchObject({ ok: false });
    expect(lerMotivoDaReabertura('nota de agosto')).toEqual({ ok: true, texto: 'nota de agosto' });
  });
  it('a impressão muda quando uma condição muda e é estável quando não muda', () => {
    const d = [{ codigo: 'FALTA_FATURAMENTO' as const, titulo: 't', detalhe: '3 faltando' }];
    const r = [{ id: 'recorrente:a', tipo: 'RECORRENTE' as const, lojaId: null, lojaNome: null, titulo: 't', detalhe: 'd' }];
    const i1 = impressaoDasCondicoes('2026-09-01', '2026-09-30', d, r);
    expect(impressaoDasCondicoes('2026-09-01', '2026-09-30', d, r)).toBe(i1);
    expect(impressaoDasCondicoes('2026-09-01', '2026-09-30', [{ ...d[0], detalhe: '2 faltando' }], r)).not.toBe(i1);
    expect(impressaoDasCondicoes('2026-09-01', '2026-09-30', d, [])).not.toBe(i1);
    expect(impressaoDasCondicoes('2026-10-01', '2026-10-31', d, r)).not.toBe(i1);
    expect(impressaoDoTexto('a')).not.toBe(impressaoDoTexto('b'));
  });
  it('a frase de recusa traz o que falta', () => {
    expect(fraseDaRecusaDeFechar([{ codigo: 'FALTA_FATURAMENTO', titulo: '3 lançamentos de faturamento estão faltando', detalhe: '' }])).toBe('Ainda não dá para fechar: 3 lançamentos de faturamento estão faltando.');
  });
  it('o DRE vira linhas e as linhas voltam a ser o mesmo DRE, sem recalcular (critério 14, a ponte)', () => {
    const r = dreDeDezMil(260_000);
    const metas = new Map([['grupo:PESSOAL', 2500], ['resultado-do-periodo', 1000]]);
    const gravadas = linhasParaGravar(r, null, null, (l) => metas.get(l.chave) ?? null);
    expect(gravadas.map((l) => l.ordem)).toEqual(gravadas.map((_, i) => i));
    const volta = dreDaFotografia(gravadas, { tipo: 'rede' });
    expect(volta.linhas).toEqual(r.linhas);
    expect(volta.receitaBrutaCentavos).toBe(r.receitaBrutaCentavos);
    expect(volta.porCanal).toEqual(r.porCanal);
    expect(volta.semFaturamento).toBe(false);
    expect(Object.fromEntries(metasDasLinhas(gravadas))).toEqual({ 'grupo:PESSOAL': 2500, 'resultado-do-periodo': 1000 });
  });
  it('a taxa do iFood não configurada atravessa a fotografia', () => {
    const r = montarDre({ escopo: { tipo: 'rede' }, plano, receitas: [{ lojaId: 'x', canal: 'IFOOD', valorCentavos: 100_000 }], taxaIfood: null, despesas: [], cmv: SEM_CMV });
    expect(r.faltaConfigurarTaxa).toBe(true);
    const volta = dreDaFotografia(linhasParaGravar(r, null, null, () => null), { tipo: 'rede' });
    expect(volta.faltaConfigurarTaxa).toBe(true);
    expect(volta.linhas).toEqual(r.linhas);
  });
});
