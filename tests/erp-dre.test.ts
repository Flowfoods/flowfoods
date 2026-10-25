/**
 * ERP 2.2a · DRE ao vivo, SEM banco: a apropriação ao centavo, o período com regra
 * versionada (mensal, quinzenal, semanal, dia de início, troca de regra), a leitura
 * do formulário de despesa, o plano de contas e a conta do DRE (taxa do iFood estimada,
 * CMV que chega na 2.3, percentuais e "sem faturamento").
 */
import { describe, expect, it } from 'vitest';
import {
  acumulado,
  apropriar,
  chaveDoEnvio,
  competenciaDoMes,
  diaNoMes,
  diasNoRecorte,
  ehMesInteiro,
  fatiar,
  frasePagamento,
  janelaDaCompetencia,
  lerCompetencia,
  lerDespesa,
  lerRecorteDaComposicao,
  lerValorDaDespesa,
  mesesDoIntervalo,
  rotuloDaCompetencia,
  situacaoDoPagamento,
  tipoDaCompetencia,
  type TextosDaDespesa,
} from '@/lib/erp/despesa-campos';
import { SEM_CMV } from '@/lib/erp/cmv-campos';
import { montarDre, percentualDaReceita, taxaDoIfoodDaLoja, textoDoPercentual, textoDosPontos, type EntradaDoDre } from '@/lib/erp/dre-campos';
import { CODIGO, PLANO_PADRAO, chaveDaLinha, linhasLancaveisDoGrupo, lerNomeDaLinha, planoEfetivo, type LinhaDoBanco } from '@/lib/erp/dre-plano';
import { diasEntre, somarDias } from '@/lib/erp/contagem-campos';
import {
  fraseDaRegra,
  lerPeriodoPedido,
  lerRegraDigitada,
  periodoDaData,
  periodoNaData,
  periodosRecentes,
  vigenciaDaMudanca,
  type Periodo,
  type Regra,
} from '@/lib/erp/periodo-campos';
import { ENTIDADES_DE_DRE } from '@/lib/erp/historico';
import { PERFIS_BASE, resolverAlcance, recusa } from '@/lib/erp/permissoes';
import { rotuloDaVolta, voltaDoRelatorio } from '@/lib/erp/volta';

// --------------------------------------------------------------- apropriação ao centavo

describe('2.2a · apropriação dia a dia, ao centavo', () => {
  const OUT = competenciaDoMes('2026-10');

  it('mês inteiro num período mensal: o valor todo', () => {
    expect(apropriar(310000, OUT, { de: '2026-10-01', ate: '2026-10-31' })).toBe(310000);
  });

  it('parcial em 16/10: aluguel de R$ 3.100,00 apropria R$ 1.500,00 (15 dias até ontem)', () => {
    expect(apropriar(310000, OUT, { de: '2026-10-01', ate: '2026-10-15' })).toBe(150000);
    expect(apropriar(310000, OUT, { de: '2026-10-01', ate: '2026-10-01' })).toBe(10000);
    expect(apropriar(310000, OUT, { de: '2026-10-01', ate: '2026-09-30' })).toBe(0);
  });

  it('período semanal: as fatias somam R$ 3.100,00 EXATOS, conferidas fatia a fatia', () => {
    // Semanas de segunda a domingo cortando outubro: 01/10 (qui) é a ponta da semana de 28/09.
    const semanas = [
      { de: '2026-09-28', ate: '2026-10-04' },
      { de: '2026-10-05', ate: '2026-10-11' },
      { de: '2026-10-12', ate: '2026-10-18' },
      { de: '2026-10-19', ate: '2026-10-25' },
      { de: '2026-10-26', ate: '2026-11-01' },
    ];
    const fatias = fatiar(310000, OUT, semanas);
    // 310000 × dias ÷ 31, cada um EXATO (10000 por dia): 4 · 7 · 7 · 7 · 6 dias.
    expect(fatias).toEqual([40000, 70000, 70000, 70000, 60000]);
    expect(fatias.reduce((a, b) => a + b, 0)).toBe(310000);
  });

  it('valor que não divide: a soma continua exata e cada fatia erra menos de 1 centavo', () => {
    // R$ 100,01 em 31 dias.
    const V = 10001;
    const cortes = [
      { de: '2026-10-01', ate: '2026-10-07' },
      { de: '2026-10-08', ate: '2026-10-14' },
      { de: '2026-10-15', ate: '2026-10-21' },
      { de: '2026-10-22', ate: '2026-10-28' },
      { de: '2026-10-29', ate: '2026-10-31' },
    ];
    const fatias = fatiar(V, OUT, cortes);
    expect(fatias.reduce((a, b) => a + b, 0)).toBe(V);
    cortes.forEach((c, i) => {
      const dias = diasEntre(c.de, c.ate) + 1;
      expect(Math.abs(fatias[i] - (V * dias) / 31)).toBeLessThan(1);
    });
  });

  it('a fatia de um período NÃO muda quando os outros períodos são cortados de outro jeito', () => {
    const V = 123457;
    const a = apropriar(V, OUT, { de: '2026-10-08', ate: '2026-10-14' });
    const juntoComOutrosCortes = fatiar(V, OUT, [{ de: '2026-10-01', ate: '2026-10-03' }, { de: '2026-10-04', ate: '2026-10-07' }, { de: '2026-10-08', ate: '2026-10-14' }, { de: '2026-10-15', ate: '2026-10-31' }]);
    expect(juntoComOutrosCortes[2]).toBe(a);
    expect(juntoComOutrosCortes.reduce((x, y) => x + y, 0)).toBe(V);
  });

  it('propriedade: qualquer partição soma o valor e nenhum recorte fica fora da conta exata em 1 centavo', () => {
    let semente = 12345;
    const sorteio = (n: number) => {
      semente = (semente * 1103515245 + 12345) & 0x7fffffff;
      return semente % n;
    };
    for (let i = 0; i < 300; i++) {
      const D = 1 + sorteio(366);
      const V = 1 + sorteio(1_000_000_000);
      const inicio = '2026-03-01';
      const comp = { inicio, fim: somarDias(inicio, D - 1) };
      const cortes: { de: string; ate: string }[] = [];
      let d = somarDias(inicio, -sorteio(10));
      const limite = somarDias(comp.fim, sorteio(10));
      while (d <= limite) {
        const ate = somarDias(d, sorteio(40));
        cortes.push({ de: d, ate });
        d = somarDias(ate, 1);
      }
      const fatias = fatiar(V, comp, cortes);
      expect(fatias.reduce((a, b) => a + b, 0)).toBe(V);
      cortes.forEach((c, k) => {
        const de = c.de > comp.inicio ? c.de : comp.inicio;
        const ate = c.ate < comp.fim ? c.ate : comp.fim;
        const dias = ate < de ? 0 : diasEntre(de, ate) + 1;
        expect(Math.abs(fatias[k] - (V * dias) / D)).toBeLessThanOrEqual(1);
      });
    }
  });

  it('acumulado: metade para cima, exato, e nunca passa do valor', () => {
    expect(acumulado(5, 1, 2)).toBe(3); // 2,5 → 3
    expect(acumulado(5, 2, 2)).toBe(5);
    expect(acumulado(1_000_000_000, 366, 366)).toBe(1_000_000_000);
    expect(acumulado(10, 0, 7)).toBe(0);
  });

  it('despesa de um dia só e intervalo: cai inteira ou proporcional', () => {
    expect(apropriar(8000, { inicio: '2026-10-10', fim: '2026-10-10' }, { de: '2026-10-01', ate: '2026-10-31' })).toBe(8000);
    expect(apropriar(8000, { inicio: '2026-10-10', fim: '2026-10-10' }, { de: '2026-10-11', ate: '2026-10-31' })).toBe(0);
    // IPTU anual (365 dias) em um mês de 31 dias.
    const anual = { inicio: '2026-01-01', fim: '2026-12-31' };
    expect(apropriar(365000, anual, { de: '2026-10-01', ate: '2026-10-31' })).toBe(31000);
  });
});

// --------------------------------------------------------------- competência e leitura

describe('2.2a · competência, valor e formulário', () => {
  const HOJE = '2026-10-16';
  const base: TextosDaDespesa = { envio: 'abcdefghijklmnop1234', lojaId: '', linha: 'aluguel', descricao: 'Aluguel da loja', valor: '3.100,00', tipo: 'mes', dia: '', mes: '2026-10', de: '', ate: '', recorrente: false, vencimento: '' };

  it('valor: 0, -5, 1e3, acima do teto e vazio são recusados com frase; 1.234,56 = 123456', () => {
    for (const t of ['0', '0,00', '-5', '1e3', '', '   ', '10.000.000,01', 'abc', '=1+1', '12,345']) {
      const r = lerValorDaDespesa(t);
      expect(r.ok, t).toBe(false);
      if (!r.ok) expect(r.erro.length).toBeGreaterThan(10);
    }
    expect(lerValorDaDespesa('1.234,56')).toEqual({ ok: true, centavos: 123456 });
    expect(lerValorDaDespesa('R$ 3.100,00')).toEqual({ ok: true, centavos: 310000 });
    expect(lerValorDaDespesa('10.000.000,00')).toEqual({ ok: true, centavos: 1_000_000_000 });
    expect(lerValorDaDespesa('0,01')).toEqual({ ok: true, centavos: 1 });
  });

  it('competência: início a mais de 12 meses à frente, intervalo de 367 dias e antes de 2020 são recusados', () => {
    expect(lerCompetencia({ tipo: 'dia', dia: '17/10/2027', mes: '', de: '', ate: '' }, HOJE).ok).toBe(false);
    expect(lerCompetencia({ tipo: 'dia', dia: '16/10/2027', mes: '', de: '', ate: '' }, HOJE).ok).toBe(true);
    expect(lerCompetencia({ tipo: 'intervalo', dia: '', mes: '', de: '01/01/2026', ate: '02/01/2027' }, HOJE).ok).toBe(false); // 367 dias
    expect(lerCompetencia({ tipo: 'intervalo', dia: '', mes: '', de: '01/01/2026', ate: '01/01/2027' }, HOJE).ok).toBe(true); // 366 dias
    expect(lerCompetencia({ tipo: 'dia', dia: '31/12/2019', mes: '', de: '', ate: '' }, HOJE).ok).toBe(false);
    expect(lerCompetencia({ tipo: 'dia', dia: '01/01/2020', mes: '', de: '', ate: '' }, '2026-10-16').ok).toBe(false); // mais de 3 anos atrás
    expect(lerCompetencia({ tipo: 'intervalo', dia: '', mes: '', de: '10/10/2026', ate: '09/10/2026' }, HOJE).ok).toBe(false);
    expect(lerCompetencia({ tipo: 'qualquer', dia: '', mes: '', de: '', ate: '' }, HOJE).ok).toBe(false);
    expect(lerCompetencia({ tipo: 'mes', dia: '', mes: '2026-13', de: '', ate: '' }, HOJE).ok).toBe(false);
  });

  it('mês inteiro, tipo e rótulo da competência', () => {
    const out = competenciaDoMes('2026-02');
    expect(out).toEqual({ inicio: '2026-02-01', fim: '2026-02-28' });
    expect(ehMesInteiro(out)).toBe(true);
    expect(ehMesInteiro({ inicio: '2026-02-02', fim: '2026-02-28' })).toBe(false);
    expect(tipoDaCompetencia(out)).toBe('mes');
    expect(tipoDaCompetencia({ inicio: '2026-02-10', fim: '2026-02-10' })).toBe('dia');
    expect(tipoDaCompetencia({ inicio: '2026-02-10', fim: '2026-03-10' })).toBe('intervalo');
    expect(rotuloDaCompetencia(out)).toBe('fevereiro de 2026');
    expect(rotuloDaCompetencia({ inicio: '2026-02-10', fim: '2026-02-10' })).toBe('10/02/2026');
    expect(mesesDoIntervalo('2026-10-20', '2026-12-02')).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(diaNoMes('2026-02', 31)).toBe('2026-02-28');
  });

  it('lê o formulário inteiro e devolve a despesa; o envio vira a chave de idempotência', () => {
    const r = lerDespesa(base, HOJE);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.despesa).toMatchObject({ lojaId: null, linha: 'aluguel', valorCentavos: 310000, competencia: { inicio: '2026-10-01', fim: '2026-10-31' }, recorrente: false, vencimento: null });
      expect(chaveDoEnvio(r.despesa.envio)).toBe('manual:abcdefghijklmnop1234');
      expect(chaveDoEnvio('x'.repeat(20), 'o1')).toBe(`manual:${'x'.repeat(20)}:o1`);
    }
  });

  it('formulário: erros por campo; envio inválido; repetir todo mês só no mês inteiro; texto sem controle nem bidi', () => {
    const ruim = lerDespesa({ ...base, valor: '0', descricao: '   ', tipo: 'dia', dia: '99/99/2026', vencimento: 'ontem' }, HOJE);
    expect(ruim.ok).toBe(false);
    if (!ruim.ok) expect(Object.keys(ruim.erros).sort()).toEqual(['competencia', 'descricao', 'valor', 'vencimento']);
    const semEnvio = lerDespesa({ ...base, envio: 'curto' }, HOJE);
    expect(semEnvio.ok).toBe(false);
    expect(lerDespesa({ ...base, envio: 'curto' }, HOJE, { exigeEnvio: false }).ok).toBe(true);
    const repete = lerDespesa({ ...base, tipo: 'dia', dia: '10/10/2026', recorrente: true }, HOJE);
    expect(repete.ok).toBe(false);
    if (!repete.ok) expect(repete.erros.recorrente).toMatch(/mês inteiro/);
    const suja = lerDespesa({ ...base, descricao: 'Alu‮gu\u0000el\n da  loja' }, HOJE);
    expect(suja.ok && suja.despesa.descricao).toBe('Aluguel da loja');
    expect(lerDespesa({ ...base, descricao: 'x'.repeat(121) }, HOJE).ok).toBe(false);
  });

  it('contas a pagar: vencida, vence em até 7 dias, a vencer, paga', () => {
    const h = '2026-10-16';
    expect(situacaoDoPagamento({ vencimento: '2026-10-15', pagaEm: null }, h)).toBe('vencida');
    expect(situacaoDoPagamento({ vencimento: '2026-10-16', pagaEm: null }, h)).toBe('vence-logo');
    expect(situacaoDoPagamento({ vencimento: '2026-10-23', pagaEm: null }, h)).toBe('vence-logo');
    expect(situacaoDoPagamento({ vencimento: '2026-10-24', pagaEm: null }, h)).toBe('a-vencer');
    expect(situacaoDoPagamento({ vencimento: '2026-10-01', pagaEm: '2026-10-02' }, h)).toBe('paga');
    expect(situacaoDoPagamento({ vencimento: null, pagaEm: null }, h)).toBe('sem-vencimento');
    expect(frasePagamento({ vencimento: '2026-10-13', pagaEm: null }, h)).toBe('venceu há 3 dias');
    expect(frasePagamento({ vencimento: '2026-10-17', pagaEm: null }, h)).toBe('vence amanhã');
  });
});

// --------------------------------------------------------------- período e regra

describe('2.2a · período com regra versionada', () => {
  const mensal1: Regra = { vigenteDesde: '2020-01-01', tipo: 'MENSAL', diaInicio: 1 };

  it('mensal, dia de início e quinzenal', () => {
    expect(periodoDaData({ tipo: 'MENSAL', diaInicio: 1 }, '2026-10-16')).toEqual({ inicio: '2026-10-01', fim: '2026-10-31', nome: 'Outubro de 2026' });
    expect(periodoDaData({ tipo: 'MENSAL', diaInicio: 15 }, '2026-10-14')).toMatchObject({ inicio: '2026-09-15', fim: '2026-10-14' });
    expect(periodoDaData({ tipo: 'MENSAL', diaInicio: 15 }, '2027-01-03')).toMatchObject({ inicio: '2026-12-15', fim: '2027-01-14' });
    expect(periodoDaData({ tipo: 'QUINZENAL', diaInicio: 1 }, '2026-10-15')).toMatchObject({ inicio: '2026-10-01', fim: '2026-10-15' });
    expect(periodoDaData({ tipo: 'QUINZENAL', diaInicio: 1 }, '2026-10-16')).toMatchObject({ inicio: '2026-10-16', fim: '2026-10-31' });
    expect(periodoDaData({ tipo: 'QUINZENAL', diaInicio: 10 }, '2026-10-24')).toMatchObject({ inicio: '2026-10-10', fim: '2026-10-24' });
    expect(periodoDaData({ tipo: 'QUINZENAL', diaInicio: 10 }, '2026-10-25')).toMatchObject({ inicio: '2026-10-25', fim: '2026-11-09' });
  });

  it('semanal começa no dia da semana escolhido (1 = segunda … 7 = domingo)', () => {
    expect(periodoDaData({ tipo: 'SEMANAL', diaInicio: 1 }, '2026-10-16')).toMatchObject({ inicio: '2026-10-12', fim: '2026-10-18' });
    expect(periodoDaData({ tipo: 'SEMANAL', diaInicio: 6 }, '2026-10-16')).toMatchObject({ inicio: '2026-10-10', fim: '2026-10-16' });
    expect(periodoDaData({ tipo: 'SEMANAL', diaInicio: 7 }, '2026-10-18')).toMatchObject({ inicio: '2026-10-18', fim: '2026-10-24' });
  });

  it('sem nenhuma regra gravada vale o mês civil', () => {
    expect(periodoNaData([], [], '2026-10-16')).toMatchObject({ inicio: '2026-10-01', fim: '2026-10-31' });
  });

  it('troca de regra mensal dia 1 → dia 15 em 10/10: outubro inteiro, 01/11 a 14/11, 15/11 a 14/12', () => {
    const v = vigenciaDaMudanca([mensal1], [], '2026-10-10');
    expect(v.periodoAtual).toMatchObject({ inicio: '2026-10-01', fim: '2026-10-31' });
    expect(v.vigenteDesde).toBe('2026-11-01');
    const regras: Regra[] = [mensal1, { vigenteDesde: v.vigenteDesde, tipo: 'MENSAL', diaInicio: 15 }];
    expect(periodoNaData(regras, [], '2026-10-10')).toMatchObject({ inicio: '2026-10-01', fim: '2026-10-31', nome: 'Outubro de 2026' });
    expect(periodoNaData(regras, [], '2026-10-31')).toMatchObject({ inicio: '2026-10-01', fim: '2026-10-31' });
    expect(periodoNaData(regras, [], '2026-11-01')).toMatchObject({ inicio: '2026-11-01', fim: '2026-11-14', nome: '01/11 a 14/11' });
    expect(periodoNaData(regras, [], '2026-11-14')).toMatchObject({ inicio: '2026-11-01', fim: '2026-11-14' });
    expect(periodoNaData(regras, [], '2026-11-15')).toMatchObject({ inicio: '2026-11-15', fim: '2026-12-14' });
    expect(periodoNaData(regras, [], '2026-12-15')).toMatchObject({ inicio: '2026-12-15', fim: '2027-01-14' });
    // Os períodos seguem um ao outro, sem buraco nem sobreposição.
    const lista = periodosRecentes(regras, [], '2026-12-20', 5);
    for (let i = 0; i < lista.length - 1; i++) expect(somarDias(lista[i + 1].fim, 1)).toBe(lista[i].inicio);
  });

  it('parceiro novo que muda a regra (sem a linha-base de 2020): o padrão vale até a vigência da primeira regra gravada', () => {
    const so: Regra[] = [{ vigenteDesde: '2026-11-01', tipo: 'MENSAL', diaInicio: 15 }];
    expect(periodoNaData(so, [], '2026-10-10')).toMatchObject({ inicio: '2026-10-01', fim: '2026-10-31', nome: 'Outubro de 2026' });
    expect(periodoNaData(so, [], '2020-03-10')).toMatchObject({ inicio: '2020-03-01', fim: '2020-03-31' });
    expect(periodoNaData(so, [], '2026-11-01')).toMatchObject({ inicio: '2026-11-01', fim: '2026-11-14' });
    expect(vigenciaDaMudanca(so, [], '2026-10-10')).toMatchObject({ vigenteDesde: '2026-11-01', efetiva: { tipo: 'MENSAL', diaInicio: 1 }, pendente: so[0] });
  });

  it('semanal → mensal: o fim da semana atual é o corte', () => {
    const semanal: Regra = { vigenteDesde: '2020-01-01', tipo: 'SEMANAL', diaInicio: 1 };
    const v = vigenciaDaMudanca([semanal], [], '2026-10-14'); // quarta
    expect(v.periodoAtual).toMatchObject({ inicio: '2026-10-12', fim: '2026-10-18' });
    expect(v.vigenteDesde).toBe('2026-10-19');
    const regras: Regra[] = [semanal, { vigenteDesde: '2026-10-19', tipo: 'MENSAL', diaInicio: 1 }];
    expect(periodoNaData(regras, [], '2026-10-18')).toMatchObject({ inicio: '2026-10-12', fim: '2026-10-18' });
    expect(periodoNaData(regras, [], '2026-10-19')).toMatchObject({ inicio: '2026-10-19', fim: '2026-10-31' });
  });

  it('regra futura pendente não conta para achar o período de hoje (ela será substituída)', () => {
    const pendente: Regra = { vigenteDesde: '2026-11-01', tipo: 'MENSAL', diaInicio: 15 };
    const v = vigenciaDaMudanca([mensal1, pendente], [], '2026-10-20');
    expect(v.pendente).toEqual(pendente);
    expect(v.efetiva).toEqual(mensal1);
    expect(v.vigenteDesde).toBe('2026-11-01');
  });

  it('período registrado vence e os naturais ao redor são cortados para não o atravessar', () => {
    const registrado: Periodo = { inicio: '2026-10-10', fim: '2026-10-16', nome: 'Semana de 10/10 a 16/10' };
    expect(periodoNaData([mensal1], [registrado], '2026-10-12')).toEqual(registrado);
    expect(periodoNaData([mensal1], [registrado], '2026-10-05')).toMatchObject({ inicio: '2026-10-01', fim: '2026-10-09' });
    expect(periodoNaData([mensal1], [registrado], '2026-10-20')).toMatchObject({ inicio: '2026-10-17', fim: '2026-10-31' });
  });

  it('formulário da regra: tipo e dia dentro da faixa do tipo', () => {
    expect(lerRegraDigitada('MENSAL', '15')).toEqual({ ok: true, tipo: 'MENSAL', diaInicio: 15 });
    expect(lerRegraDigitada('SEMANAL', '7')).toEqual({ ok: true, tipo: 'SEMANAL', diaInicio: 7 });
    expect(lerRegraDigitada('SEMANAL', '8').ok).toBe(false);
    expect(lerRegraDigitada('MENSAL', '29').ok).toBe(false);
    expect(lerRegraDigitada('MENSAL', '0').ok).toBe(false);
    expect(lerRegraDigitada('PERSONALIZADO', '1').ok).toBe(false);
    expect(lerRegraDigitada('', '1').ok).toBe(false);
    expect(fraseDaRegra({ tipo: 'MENSAL', diaInicio: 15 })).toBe('Mensal · do dia 15 ao dia 14 do mês seguinte');
    expect(fraseDaRegra({ tipo: 'SEMANAL', diaInicio: 1 })).toBe('Semanal · de segunda-feira a domingo');
  });
});

// --------------------------------------------------------------- plano de contas

describe('2.2a · plano de contas', () => {
  const doBanco = (extra: Partial<LinhaDoBanco> & { codigo: string | null; nome: string }, i: number): LinhaDoBanco => ({
    id: `l${i}`,
    grupo: 'OCUPACAO',
    calculada: false,
    sentido: 'MENOR_MELHOR',
    ordem: 10,
    ativa: true,
    atualizadoEm: new Date('2026-10-01T10:00:00Z'),
    ...extra,
  });

  it('sem nada no banco o plano é o padrão do código, todo virtual (sem id)', () => {
    const p = planoEfetivo([]);
    expect(p.length).toBe(PLANO_PADRAO.length);
    expect(p.every((l) => l.id === null && l.versao === '')).toBe(true);
    expect(p.find((l) => l.codigo === 'aluguel')).toMatchObject({ nome: 'Aluguel', grupo: 'OCUPACAO', calculada: false, ativa: true });
  });

  it('a linha renomeada continua a mesma (pelo código) e a calculada não muda de nome', () => {
    const p = planoEfetivo([doBanco({ codigo: 'aluguel', nome: 'Aluguel loja' }, 1), doBanco({ codigo: 'receita-liquida', nome: 'Hackeada', calculada: true, grupo: 'RESULTADO' }, 2)]);
    expect(p.find((l) => l.codigo === 'aluguel')).toMatchObject({ id: 'l1', nome: 'Aluguel loja' });
    expect(p.find((l) => l.codigo === CODIGO.receitaLiquida)).toMatchObject({ nome: 'Receita líquida', calculada: true });
  });

  it('linha da casa vem depois das do padrão do mesmo grupo; oculta fica fora do formulário', () => {
    const p = planoEfetivo([doBanco({ codigo: null, nome: 'Seguro do ponto', ordem: 50 }, 3), doBanco({ codigo: 'iptu', nome: 'IPTU', ativa: false }, 4)]);
    const grupo = linhasLancaveisDoGrupo(p, 'OCUPACAO').map((l) => l.nome);
    expect(grupo).toEqual(['Aluguel', 'Condomínio', 'IPTU', 'Seguro do ponto']);
    expect(chaveDaLinha(p.find((l) => l.nome === 'Seguro do ponto')!)).toBe('id:l3');
    expect(chaveDaLinha(p.find((l) => l.codigo === 'aluguel')!)).toBe('aluguel');
  });

  it('códigos e nomes do padrão são únicos; calculada tem código', () => {
    const codigos = PLANO_PADRAO.map((l) => l.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    const nomes = PLANO_PADRAO.map((l) => l.nome.toLowerCase());
    expect(new Set(nomes).size).toBe(nomes.length);
    expect(PLANO_PADRAO.filter((l) => l.calculada).every((l) => !!l.codigo)).toBe(true);
  });

  it('nome da linha: 1 a 60, sem controle nem bidi', () => {
    expect(lerNomeDaLinha('  Aluguel   loja ')).toEqual({ ok: true, nome: 'Aluguel loja' });
    expect(lerNomeDaLinha('')).toMatchObject({ ok: false });
    expect(lerNomeDaLinha('x'.repeat(61))).toMatchObject({ ok: false });
    expect(lerNomeDaLinha('A‮b')).toEqual({ ok: true, nome: 'Ab' });
  });
});

// --------------------------------------------------------------- a conta do DRE

describe('2.2a · o DRE realizado', () => {
  const plano = planoEfetivo(
    PLANO_PADRAO.filter((p) => !p.calculada).map((p, i) => ({
      id: `id-${p.codigo}`,
      codigo: p.codigo,
      nome: p.nome,
      grupo: p.grupo,
      calculada: false,
      sentido: p.sentido,
      ordem: (i + 1) * 10,
      ativa: true,
      atualizadoEm: new Date('2026-10-01T10:00:00Z'),
    })),
  );
  const idDe = (codigo: string) => `id-${codigo}`;
  const entrada = (parcial: Partial<EntradaDoDre>): EntradaDoDre => ({ escopo: { tipo: 'rede' }, plano, receitas: [], taxaIfood: null, despesas: [], cmv: SEM_CMV, ...parcial });
  const valor = (r: ReturnType<typeof montarDre>, codigo: string) => r.linhas.find((l) => l.codigo === codigo)!;

  it('taxas do iFood: 23 % + 3,2 % sobre R$ 10.000,00 = R$ 2.620,00; a receita líquida é a diferença', () => {
    const r = montarDre(entrada({ receitas: [{ lojaId: 'a', canal: 'IFOOD', valorCentavos: 1_000_000 }], taxaIfood: { comissaoBp: 2300, pagamentoBp: 320 } }));
    expect(valor(r, CODIGO.taxasIfood)).toMatchObject({ valorCentavos: 262000, nota: 'estimada pela taxa configurada' });
    expect(valor(r, CODIGO.receitaLiquida)).toMatchObject({ valorCentavos: 738000, semContar: [] });
    expect(valor(r, 'grupo:DEDUCAO').valorCentavos).toBe(262000);
    expect(r.faltaConfigurarTaxa).toBe(false);
    expect(taxaDoIfoodDaLoja(1_000_000, { comissaoBp: 2300, pagamentoBp: 320 })).toBe(262000);
  });

  it('sem configuração da taxa: "falta configurar a taxa" (nunca R$ 0,00) e a receita líquida sai com o selo', () => {
    const r = montarDre(entrada({ receitas: [{ lojaId: 'a', canal: 'IFOOD', valorCentavos: 1_000_000 }], taxaIfood: null }));
    expect(valor(r, CODIGO.taxasIfood)).toMatchObject({ valorCentavos: null, nota: 'falta configurar a taxa' });
    expect(valor(r, CODIGO.receitaLiquida)).toMatchObject({ valorCentavos: 1_000_000, semContar: ['a taxa do iFood'] });
    expect(valor(r, CODIGO.margem).semContar).toEqual(['a taxa do iFood', 'o CMV']);
    expect(r.faltaConfigurarTaxa).toBe(true);
  });

  it('sem receita no iFood a taxa não precisa de configuração', () => {
    const r = montarDre(entrada({ receitas: [{ lojaId: 'a', canal: 'LOJA', valorCentavos: 500_000 }], taxaIfood: null }));
    expect(r.faltaConfigurarTaxa).toBe(false);
    expect(valor(r, CODIGO.taxasIfood).valorCentavos).toBe(0);
    expect(valor(r, CODIGO.receitaLiquida).semContar).toEqual([]);
  });

  it('CMV sem nota e sem estoque: nulo com a frase (nunca R$ 0,00); margem e resultados "sem contar o CMV"', () => {
    const r = montarDre(entrada({ receitas: [{ lojaId: 'a', canal: 'LOJA', valorCentavos: 1_000_000 }] }));
    expect(valor(r, CODIGO.cmv)).toMatchObject({ valorCentavos: null, nota: 'sem nota de compra no período' });
    for (const c of [CODIGO.margem, CODIGO.operacional, CODIGO.resultado]) expect(valor(r, c).semContar).toEqual(['o CMV']);
    expect(valor(r, CODIGO.receitaLiquida).semContar).toEqual([]);
  });

  it('despesas por grupo, subtotais e resultados; % sempre sobre a receita bruta', () => {
    const despesas = [
      { linhaId: idDe('entregas'), lojaId: 'a', centavos: 100_000 },
      { linhaId: idDe('salarios'), lojaId: 'a', centavos: 260_000 },
      { linhaId: idDe('aluguel'), lojaId: null, centavos: 150_000 },
      { linhaId: idDe('tarifas'), lojaId: null, centavos: 10_000 },
      { linhaId: idDe('impostos'), lojaId: 'a', centavos: 60_000 },
    ];
    const r = montarDre(entrada({ receitas: [{ lojaId: 'a', canal: 'LOJA', valorCentavos: 1_000_000 }], despesas }));
    expect(r.receitaBrutaCentavos).toBe(1_000_000);
    expect(valor(r, 'grupo:PESSOAL')).toMatchObject({ valorCentavos: 260_000, percentualBp: 2600 });
    expect(textoDoPercentual(2600)).toBe('26,0\u00a0%');
    expect(valor(r, 'grupo:DEDUCAO').valorCentavos).toBe(60_000);
    expect(valor(r, CODIGO.receitaLiquida).valorCentavos).toBe(940_000);
    expect(valor(r, CODIGO.margem).valorCentavos).toBe(840_000); // 940 − variáveis 100
    expect(valor(r, CODIGO.operacional).valorCentavos).toBe(430_000); // 840 − pessoal 260 − ocupação 150
    expect(valor(r, CODIGO.resultado).valorCentavos).toBe(420_000); // − financeiras 10
    expect(valor(r, CODIGO.resultado).percentualBp).toBe(4200);
  });

  it('a loja traz só o que é dela: nunca a despesa da rede; a rede é a soma das lojas + a da rede', () => {
    const receitas = [
      { lojaId: 'a', canal: 'LOJA' as const, valorCentavos: 600_000 },
      { lojaId: 'b', canal: 'LOJA' as const, valorCentavos: 400_000 },
    ];
    const despesas = [
      { linhaId: idDe('salarios'), lojaId: 'a', centavos: 100_000 },
      { linhaId: idDe('salarios'), lojaId: 'b', centavos: 50_000 },
      { linhaId: idDe('aluguel'), lojaId: null, centavos: 90_000 },
    ];
    const rede = montarDre(entrada({ receitas, despesas }));
    const a = montarDre(entrada({ receitas, despesas, escopo: { tipo: 'loja', lojaId: 'a', nome: 'A' } }));
    const b = montarDre(entrada({ receitas, despesas, escopo: { tipo: 'loja', lojaId: 'b', nome: 'B' } }));
    expect(valor(a, 'grupo:OCUPACAO').valorCentavos).toBe(0);
    expect(valor(a, CODIGO.resultado).valorCentavos).toBe(500_000);
    expect(valor(b, CODIGO.resultado).valorCentavos).toBe(350_000);
    expect(valor(rede, 'grupo:OCUPACAO').valorCentavos).toBe(90_000);
    expect(valor(rede, CODIGO.resultado).valorCentavos).toBe(valor(a, CODIGO.resultado).valorCentavos! + valor(b, CODIGO.resultado).valorCentavos! - 90_000);
  });

  it('a taxa do iFood da rede é a soma das lojas (um arredondamento por loja)', () => {
    const receitas = [
      { lojaId: 'a', canal: 'IFOOD' as const, valorCentavos: 1_001 },
      { lojaId: 'b', canal: 'IFOOD' as const, valorCentavos: 1_001 },
    ];
    const taxaIfood = { comissaoBp: 1250, pagamentoBp: 0 }; // 125,125 → 125 por loja
    const rede = montarDre(entrada({ receitas, taxaIfood }));
    const a = montarDre(entrada({ receitas, taxaIfood, escopo: { tipo: 'loja', lojaId: 'a', nome: 'A' } }));
    expect(valor(a, CODIGO.taxasIfood).valorCentavos).toBe(125);
    expect(valor(rede, CODIGO.taxasIfood).valorCentavos).toBe(250);
  });

  it('receita zero é "sem faturamento": nenhum percentual, nenhuma divisão por zero', () => {
    const r = montarDre(entrada({ despesas: [{ linhaId: idDe('aluguel'), lojaId: null, centavos: 150_000 }] }));
    expect(r.semFaturamento).toBe(true);
    expect(r.linhas.every((l) => l.percentualBp === null)).toBe(true);
    expect(valor(r, 'grupo:OCUPACAO').valorCentavos).toBe(150_000);
    expect(percentualDaReceita(100, 0)).toBeNull();
    expect(valor(r, 'grupo:RECEITA').nota).toBe('sem faturamento');
  });

  it('linha oculta com valor continua na tela marcada; oculta sem valor sai', () => {
    const ocultas = plano.map((l) => (l.codigo === 'aluguel' || l.codigo === 'iptu' ? { ...l, ativa: false } : l));
    const r = montarDre(entrada({ plano: ocultas, receitas: [{ lojaId: 'a', canal: 'LOJA', valorCentavos: 100_000 }], despesas: [{ linhaId: idDe('aluguel'), lojaId: null, centavos: 10_000 }] }));
    expect(valor(r, 'aluguel')).toMatchObject({ oculta: true, nota: 'oculta', valorCentavos: 10_000 });
    expect(r.linhas.find((l) => l.codigo === 'iptu')).toBeUndefined();
  });

  it('negativo: arredondamento simétrico e texto dos pontos', () => {
    expect(percentualDaReceita(-1, 3)).toBe(-3333);
    expect(percentualDaReceita(1, 3)).toBe(3333);
    expect(textoDosPontos(100)).toBe('+1,0\u00a0pp');
    expect(textoDosPontos(-50)).toBe('−0,5\u00a0pp');
  });

  it('cada linha calculada do plano aparece uma vez no DRE e na ordem do plano', () => {
    const r = montarDre(entrada({}));
    const codigos = r.linhas.map((l) => l.codigo);
    // As duas linhas de detalhe do CMV (2.3) não são do plano: sem código.
    expect(new Set(codigos.filter(Boolean)).size).toBe(codigos.filter(Boolean).length);
    expect(codigos.slice(0, 5)).toEqual(['grupo:RECEITA', 'receita-loja', 'receita-delivery', 'receita-ifood', 'grupo:DEDUCAO']);
    expect(codigos.indexOf(CODIGO.cmv)).toBeGreaterThan(codigos.indexOf(CODIGO.receitaLiquida));
    expect(codigos.indexOf(CODIGO.margem)).toBeGreaterThan(codigos.indexOf(CODIGO.cmv));
    expect(codigos[codigos.length - 1]).toBe(CODIGO.resultado);
    for (const p of PLANO_PADRAO) expect(codigos, p.codigo).toContain(p.codigo);
  });
});

// --------------------------------------------------------------- permissões e histórico

describe('2.2a · permissões e vazamento', () => {
  const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR', lojaIds: string[] | 'rede') =>
    resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });

  it('metas.editar exige a rede inteira: quem tem só lojas não define plano, metas nem período', () => {
    const dono = alcanceDe('DONO', 'rede');
    const donoDeLoja = alcanceDe('DONO', ['l1']);
    expect(recusa(dono, 'metas.editar')).toBeNull();
    expect(recusa(donoDeLoja, 'metas.editar')).toMatch(/Seu acesso não inclui/);
    expect(donoDeLoja.permissoes.has('metas.editar')).toBe(false);
  });

  it('o gerente e o operador não definem plano nem período; o operador não vê o DRE nem lança despesa', () => {
    expect(PERFIS_BASE.GERENTE.permissoes).not.toContain('metas.editar');
    expect(PERFIS_BASE.GERENTE.permissoes).toContain('dre.ver');
    expect(PERFIS_BASE.GERENTE.permissoes).toContain('despesas.lancar');
    const operador = alcanceDe('OPERADOR', ['l1']);
    expect(recusa(operador, 'dre.ver')).not.toBeNull();
    expect(recusa(operador, 'despesas.lancar')).not.toBeNull();
  });

  it('o histórico trata despesa, linha do plano e regra do período como DRE', () => {
    expect(ENTIDADES_DE_DRE).toEqual(expect.arrayContaining(['Despesa', 'DreLinha', 'RegraDoPeriodo', 'PeriodoApuracao']));
  });

  it('a janela de 12 meses à frente a partir de 29/02 termina em 28/02 do ano seguinte (e não em janeiro)', () => {
    expect(janelaDaCompetencia('2028-02-29').ate).toBe('2029-02-28');
    expect(janelaDaCompetencia('2026-10-17').ate).toBe('2027-10-17');
    expect(janelaDaCompetencia('2027-03-31').ate).toBe('2028-03-31');
    expect(lerCompetencia({ tipo: 'mes', dia: '', mes: '2029-02', de: '', ate: '' }, '2028-02-29')).toMatchObject({ ok: true });
    expect(lerCompetencia({ tipo: 'dia', dia: '01/03/2029', mes: '', de: '', ate: '' }, '2028-02-29')).toMatchObject({ ok: false });
  });

  it('?periodo= inexistente, futuro ou antigo mostra o período de hoje COM frase; a data boa passa', () => {
    const hoje = '2026-10-17';
    expect(lerPeriodoPedido(undefined, hoje)).toEqual({ data: hoje, aviso: null });
    expect(lerPeriodoPedido('2026-09-05', hoje)).toEqual({ data: '2026-09-05', aviso: null });
    for (const ruim of ['2026-02-31', '2026-13-01', '2026-00-10', 'ontem', '2026-9-5', '']) {
      const r = lerPeriodoPedido(ruim, hoje);
      if (ruim === '') expect(r).toEqual({ data: hoje, aviso: null });
      else expect(r).toEqual({ data: hoje, aviso: expect.stringMatching(/não existe/) });
    }
    expect(lerPeriodoPedido('2026-10-18', hoje)).toEqual({ data: hoje, aviso: expect.stringMatching(/só existe até hoje/) });
    expect(lerPeriodoPedido('2019-12-31', hoje)).toEqual({ data: hoje, aviso: expect.stringMatching(/começa em 01\/01\/2020/) });
  });
});

describe('Jornada 4 · o número do DRE abre o que o forma (decisão 464)', () => {
  it('o endereço da composição: linha, de e até válidos; o resto é a lista normal', () => {
    expect(lerRecorteDaComposicao({ linha: 'clinha123', de: '2026-09-01', ate: '2026-09-30' })).toEqual({ linhaId: 'clinha123', de: '2026-09-01', ate: '2026-09-30' });
    expect(lerRecorteDaComposicao({ linha: 'clinha123', de: '2026-10-19', ate: '2026-10-19' })).toEqual({ linhaId: 'clinha123', de: '2026-10-19', ate: '2026-10-19' });
    for (const torto of [
      { linha: '', de: '2026-09-01', ate: '2026-09-30' },
      { linha: 'x y', de: '2026-09-01', ate: '2026-09-30' },
      { linha: "x'; drop", de: '2026-09-01', ate: '2026-09-30' },
      { linha: 'a'.repeat(65), de: '2026-09-01', ate: '2026-09-30' },
      { linha: 'clinha', de: '2026-09-31', ate: '2026-10-01' },
      { linha: 'clinha', de: '01/09/2026', ate: '30/09/2026' },
      { linha: 'clinha', de: '2026-09-30', ate: '2026-09-01' },
      { linha: 'clinha', de: '2019-12-31', ate: '2020-01-31' },
      { linha: 'clinha', de: '2025-01-01', ate: '2026-02-05' },
      { linha: 'clinha', de: '2026-09-01' },
      {},
    ]) expect(lerRecorteDaComposicao(torto), JSON.stringify(torto)).toBeNull();
    // 400 dias é o maior recorte; 401, não.
    expect(lerRecorteDaComposicao({ linha: 'c', de: '2025-01-01', ate: somarDias('2025-01-01', 399) })).not.toBeNull();
    expect(lerRecorteDaComposicao({ linha: 'c', de: '2025-01-01', ate: somarDias('2025-01-01', 400) })).toBeNull();
  });

  it('dias da competência dentro do recorte', () => {
    const outubro = { inicio: '2026-10-01', fim: '2026-10-31' };
    expect(diasNoRecorte(outubro, { de: '2026-10-19', ate: '2026-10-24' })).toBe(6);
    expect(diasNoRecorte(outubro, { de: '2026-09-28', ate: '2026-10-04' })).toBe(4);
    expect(diasNoRecorte(outubro, { de: '2026-11-01', ate: '2026-11-07' })).toBe(0);
    expect(diasNoRecorte({ inicio: '2026-10-05', fim: '2026-10-05' }, { de: '2026-10-01', ate: '2026-10-18' })).toBe(1);
    expect(diasNoRecorte({ inicio: '2026-01-01', fim: '2026-12-31' }, { de: '2026-09-01', ate: '2026-09-30' })).toBe(30);
    // A soma das partes de um recorte bate com o apropriado (o que o DRE conta) ao centavo.
    expect(apropriar(930_000, outubro, { de: '2026-10-19', ate: '2026-10-24' })).toBe(180_000);
  });

  it('o voltar: da composição, do DRE e do CMV por categoria, com o nome certo; de fora da área, nada', () => {
    expect(rotuloDaVolta('/erp/dre/despesas?linha=abc&de=2026-09-01&ate=2026-09-30')).toBe('o que forma o número do DRE');
    expect(rotuloDaVolta('/erp/dre/despesas?de=2026-09-01&linha=abc&ate=2026-09-30')).toBe('o que forma o número do DRE');
    expect(rotuloDaVolta('/erp/dre?periodo=2026-09-01&rede=1')).toBe('o DRE');
    expect(rotuloDaVolta('/rodolfo/erp/casa/dre?periodo=2026-09-01')).toBe('o DRE');
    expect(rotuloDaVolta('/erp/dre/cmv-categorias?periodo=2026-09-01&rede=1')).toBe('o CMV por categoria');
    expect(rotuloDaVolta('/erp/dre/despesas?mes=2026-09')).toBe('a tela anterior');
    expect(voltaDoRelatorio('/erp/dre?periodo=2026-09-01&rede=1', '/erp')).toEqual({ href: '/erp/dre?periodo=2026-09-01&rede=1', rotulo: 'o DRE' });
    for (const fora of ['https://x.example/erp/dre', '//x.example/erp/dre', '/rodolfo/erp/x/dre', '/erp/../rodolfo/erp/x', '/erp/dre\\x']) expect(voltaDoRelatorio(fora, '/erp'), fora).toBeNull();
  });
});
