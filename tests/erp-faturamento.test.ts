/**
 * ERP 2.1 · faturamento, a parte pura (sem banco): ler o que foi digitado,
 * datas, chaves, planilha (inclusive malícia), leitura única do grão,
 * calendário e faltas, ticket médio, histórico.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  canaisEmFalta,
  chaveDeIntegracao,
  chaveHumana,
  comecaComoFormula,
  diasDoMes,
  fraseDoNumero,
  lerCanalDoDia,
  lerDataDoLancamento,
  lerGrao,
  lerMes,
  mesVizinho,
  retratoDoLancamento,
  rotuloDoMes,
  ticketMedio,
  totalizar,
} from '@/lib/erp/faturamento-campos';
import { CABECALHO_DO_MODELO, decodificarPlanilha, ecoDaCelula, interpretarLinha, lerCanalDaPlanilha, lerPlanilhaDeFaturamento, normalizarNome, type LojaParaPlanilha } from '@/lib/erp/faturamento-planilha';
import { descreverMudancas, alvoDaLinha } from '@/lib/erp/historico';

const HOJE = '2026-10-17';
const t = (valor: string, pedidos: string, clientes = '', naoVendeu = false) => lerCanalDoDia({ valor, pedidos, clientes, naoVendeu });

describe('2.1 · ler o canal do dia', () => {
  it('formatos brasileiros viram centavos inteiros; clientes em branco = pedidos', () => {
    expect(t('4.350,00', '62', '140')).toEqual({ estado: 'ok', numeros: { valorCentavos: 435000, pedidos: 62, clientes: 140 } });
    expect(t('R$ 1.200,5', '30')).toEqual({ estado: 'ok', numeros: { valorCentavos: 120050, pedidos: 30, clientes: 30 } });
    expect(t('0,01', '1')).toMatchObject({ estado: 'ok', numeros: { valorCentavos: 1 } });
    expect(t('1000000,00', '100000', '100000')).toMatchObject({ estado: 'ok', numeros: { valorCentavos: 100_000_000, pedidos: 100000 } });
  });

  it('em branco não mexe (vazio ≠ zero); "Não vendeu" grava zero', () => {
    expect(t('', '')).toEqual({ estado: 'vazio' });
    expect(t('  ', ' ', ' ')).toEqual({ estado: 'vazio' });
    expect(t('', '', '', true)).toEqual({ estado: 'ok', numeros: { valorCentavos: 0, pedidos: 0, clientes: 0 } });
    expect(t('0', '0', '', true)).toMatchObject({ estado: 'ok' });
    expect(t('0,00', '0')).toEqual({ estado: 'ok', numeros: { valorCentavos: 0, pedidos: 0, clientes: 0 } });
  });

  it('"Não vendeu" com número é erro, não zero silencioso', () => {
    const r = t('100,00', '3', '', true);
    expect(r.estado).toBe('erro');
  });

  it('valores extremos e formatos errados viram frase no campo, nunca exceção', () => {
    const erro = (r: ReturnType<typeof t>) => (r.estado === 'erro' ? r.erros : null);
    expect(erro(t('-5,00', '2'))?.valor).toContain('negativo');
    expect(erro(t('100,00', '-2'))?.pedidos).toContain('negativo');
    expect(erro(t('100,00', '2,5'))?.pedidos).toContain('inteiro');
    expect(erro(t('100,00', '1..2'))?.pedidos).toContain('inteiro');
    expect(erro(t('1..2', '2'))?.valor).toContain('inválido');
    expect(erro(t('29.90', '2'))?.valor).toContain('inválido');
    expect(erro(t('1.000.000,01', '2'))?.valor).toContain('teto');
    expect(erro(t('99999999999999999999', '2'))?.valor).toBeTruthy();
    expect(erro(t('100,00', '100001'))?.pedidos).toContain('acima');
    expect(erro(t('100,00', '2', '100001'))?.clientes).toContain('acima');
    expect(erro(t('abc', 'xyz'))).toMatchObject({ valor: expect.any(String), pedidos: expect.any(String) });
    expect(erro(t('100,00', ''))?.pedidos).toContain('Informe');
    expect(erro(t('', '5'))?.valor).toContain('Informe');
  });

  it('valor com 0 pedido e pedido sem valor são recusados (o ticket dividiria por zero)', () => {
    expect(t('100,00', '0')).toMatchObject({ estado: 'erro', erros: { pedidos: expect.stringContaining('pelo menos 1') } });
    expect(t('0', '3')).toMatchObject({ estado: 'erro', erros: { valor: expect.stringContaining('sem faturamento') } });
    expect(t('0', '0', '4')).toMatchObject({ estado: 'erro', erros: { clientes: expect.any(String) } });
  });

  it('fórmula digitada nunca é número', () => {
    for (const f of ['=1+1', '+1.200,00', '@SOMA(A1)', '\t5', '-cmd']) {
      expect(comecaComoFormula(f), f).toBe(true);
      expect(t(f, '2').estado, f).toBe('erro');
    }
    expect(comecaComoFormula('4.350,00')).toBe(false);
  });

  it('ticket médio é Σ valor ÷ Σ pedidos, 0 pedido é "—" e nunca média de médias', () => {
    expect(ticketMedio(435000, 62)).toBe(7016);
    expect(ticketMedio(0, 0)).toBeNull();
    const dois = totalizar([
      { valorCentavos: 10000, pedidos: 1, clientes: 1 },
      { valorCentavos: 30000, pedidos: 9, clientes: 9 },
    ]);
    expect(dois.ticketMedioCentavos).toBe(4000); // 400,00 ÷ 10 pedidos; a média de médias daria 66,67
    expect(totalizar([]).ticketMedioCentavos).toBeNull();
    expect(fraseDoNumero({ valorCentavos: 321000, pedidos: 41, clientes: 41 }).replace(/\u00a0/g, ' ')).toBe('R$ 3.210,00 · 41 pedidos');
    expect(fraseDoNumero({ valorCentavos: 100, pedidos: 1, clientes: 1 })).toContain('1 pedido');
  });
});

describe('2.1 · data do lançamento', () => {
  it('aceita dd/mm/aaaa e ISO até hoje; recusa futura, impossível e antiga', () => {
    expect(lerDataDoLancamento('14/10/2026', HOJE)).toEqual({ ok: true, data: '2026-10-14' });
    expect(lerDataDoLancamento('2026-10-17', HOJE)).toEqual({ ok: true, data: '2026-10-17' });
    expect(lerDataDoLancamento('18/10/2026', HOJE)).toMatchObject({ ok: false });
    expect(lerDataDoLancamento('31/02/2026', HOJE)).toMatchObject({ ok: false });
    expect(lerDataDoLancamento('17/10/26', HOJE)).toMatchObject({ ok: false });
    expect(lerDataDoLancamento('', HOJE)).toMatchObject({ ok: false });
    // Ano passado vale (a dor do Valentin's é a queda contra o ano passado); 3 anos é o teto.
    expect(lerDataDoLancamento('17/10/2025', HOJE)).toMatchObject({ ok: true });
    expect(lerDataDoLancamento('18/10/2023', HOJE)).toMatchObject({ ok: true }); // 1.095 dias
    expect(lerDataDoLancamento('17/10/2023', HOJE)).toMatchObject({ ok: false }); // 1.096
    expect(lerDataDoLancamento('01/01/2019', HOJE)).toMatchObject({ ok: false });
  });
});

describe('2.1 · chaves', () => {
  it('a chave humana é determinística e sem marca', () => {
    expect(chaveHumana('loja1', 'IFOOD', '2026-10-14')).toBe('manual:loja1:-:IFOOD:2026-10-14');
  });
  it('a chave da integração vive em outro espaço: fonte:tipo:id', () => {
    expect(chaveDeIntegracao('ifood', 'pedido', 'a1b2-c3')).toBe('ifood:pedido:a1b2-c3');
    expect(chaveDeIntegracao('ifood', 'dia', '2026-10-14')).toBe('ifood:dia:2026-10-14');
    expect(chaveDeIntegracao('manual', 'pedido', '1')).toBeNull();
    expect(chaveDeIntegracao('iFood', 'pedido', '1')).toBeNull();
    expect(chaveDeIntegracao('ifood', 'semana', '1')).toBeNull();
    expect(chaveDeIntegracao('ifood', 'pedido', 'com espaço')).toBeNull();
    expect(chaveDeIntegracao('ifood', 'pedido', '')).toBeNull();
    expect(chaveDeIntegracao('ifood', 'pedido', 'x'.repeat(190))).toBeNull();
  });
});

describe('2.1 · leitura única do grão: a integração vence a digitação', () => {
  const humana = { origem: 'MANUAL' as const, valorCentavos: 100000, pedidos: 20, clientes: 20 };
  it('só humana: vale a humana; sem nada: null', () => {
    expect(lerGrao([humana])).toMatchObject({ fonte: 'HUMANO', valorCentavos: 100000, conferencia: null });
    expect(lerGrao([])).toBeNull();
  });
  it('com integração, vale a SOMA dela e a humana vira conferência (nunca soma as duas)', () => {
    const r = lerGrao([
      humana,
      { origem: 'INTEGRACAO', valorCentavos: 60000, pedidos: 12, clientes: 12 },
      { origem: 'INTEGRACAO', valorCentavos: 45000, pedidos: 9, clientes: 9 },
    ])!;
    expect(r).toMatchObject({ fonte: 'INTEGRACAO', valorCentavos: 105000, pedidos: 21, clientes: 21 });
    expect(r.conferencia).toEqual({ valorCentavos: 100000, pedidos: 20, clientes: 20, diferencaCentavos: 5000 });
  });
  it('planilha (IMPORTACAO) é humana', () => {
    expect(lerGrao([{ ...humana, origem: 'IMPORTACAO' }])?.fonte).toBe('HUMANO');
  });
});

describe('2.1 · mês, calendário e faltas', () => {
  it('lerMes aceita só aaaa-mm entre 2020 e o mês de hoje', () => {
    expect(lerMes('2026-09', HOJE)).toBe('2026-09');
    expect(lerMes('2026-11', HOJE)).toBe('2026-10');
    expect(lerMes('2019-12', HOJE)).toBe('2026-10');
    expect(lerMes('2026-13', HOJE)).toBe('2026-10');
    expect(lerMes('lixo', HOJE)).toBe('2026-10');
    expect(lerMes(undefined, HOJE)).toBe('2026-10');
    expect(mesVizinho('2026-01', -1)).toBe('2025-12');
    expect(mesVizinho('2026-12', 1)).toBe('2027-01');
    expect(diasDoMes('2026-02')).toHaveLength(28);
    expect(diasDoMes('2024-02')).toHaveLength(29);
    expect(diasDoMes('2026-10')[30]).toBe('2026-10-31');
    expect(rotuloDoMes('2026-10')).toBe('outubro de 2026');
  });

  const TODOS = ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'] as const;
  it('falta = canal ativo sem lançamento, do 1º lançamento da loja até ontem', () => {
    const lancados = new Set(['LOJA'] as const);
    expect(canaisEmFalta('2026-10-14', HOJE, '2026-10-10', TODOS, lancados)).toEqual(['DELIVERY_PROPRIO', 'IFOOD']);
    expect(canaisEmFalta('2026-10-16', HOJE, '2026-10-10', TODOS, lancados)).toEqual(['DELIVERY_PROPRIO', 'IFOOD']);
    // hoje está em aberto; antes do 1º lançamento a casa nem usava o módulo; sem lançamento nenhum não acusa nada.
    expect(canaisEmFalta('2026-10-17', HOJE, '2026-10-10', TODOS, lancados)).toEqual([]);
    expect(canaisEmFalta('2026-10-09', HOJE, '2026-10-10', TODOS, lancados)).toEqual([]);
    expect(canaisEmFalta('2026-10-14', HOJE, null, TODOS, lancados)).toEqual([]);
  });
  it('zero lançado não é falta; loja só delivery não acusa a LOJA', () => {
    expect(canaisEmFalta('2026-10-14', HOJE, '2026-10-10', TODOS, new Set(TODOS))).toEqual([]);
    expect(canaisEmFalta('2026-10-14', HOJE, '2026-10-10', ['DELIVERY_PROPRIO', 'IFOOD'], new Set(['IFOOD'] as const))).toEqual(['DELIVERY_PROPRIO']);
  });
});

describe('2.1 · planilha', () => {
  const lojas: LojaParaPlanilha[] = [
    { id: 'l1', nome: 'Vila da Penha', ativa: true, canais: ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'] },
    { id: 'l2', nome: 'Delivery Penha', ativa: true, canais: ['DELIVERY_PROPRIO', 'IFOOD'] },
    { id: 'l3', nome: 'Antiga', ativa: false, canais: ['LOJA'] },
  ];
  const linha = (o: Partial<Record<'data' | 'loja' | 'canal' | 'faturamento' | 'pedidos' | 'clientes', string>> = {}) => ({
    linha: 2,
    data: '14/10/2026',
    loja: 'Vila da Penha',
    canal: 'ifood',
    faturamento: '3.210,00',
    pedidos: '41',
    clientes: '',
    ...o,
  });

  it('o modelo é lido: cabeçalho com ou sem acento, ; ou ,, BOM, aspas', () => {
    const csv = `${CABECALHO_DO_MODELO}\n14/10/2026;Vila da Penha;ifood;3.210,00;41;\n\n15/10/2026;Vila da Penha;loja;"4.350,00";62;140\n`;
    const r = lerPlanilhaDeFaturamento(csv);
    expect(r.erros).toEqual([]);
    expect(r.linhas).toHaveLength(2);
    expect(r.linhasLidas).toBe(2);
    const virgula = lerPlanilhaDeFaturamento('Data,Loja,Canal,"Faturamento (R$)",Pedidos\n14/10/2026,Vila,ifood,"3.210,00",41');
    expect(virgula.linhas[0]).toMatchObject({ faturamento: '3.210,00', pedidos: '41' });
    expect(lerPlanilhaDeFaturamento('﻿data;loja;canal;faturamento;pedidos\n1;2;3;4;5').linhas).toHaveLength(1);
  });

  it('o modelo para baixar (public/modelos/faturamento.csv) é lido sem erro e tem o cabeçalho do código', () => {
    const texto = decodificarPlanilha(new Uint8Array(readFileSync('public/modelos/faturamento.csv')));
    expect(texto.split(/\r?\n/)[0]).toBe(CABECALHO_DO_MODELO);
    const r = lerPlanilhaDeFaturamento(texto);
    expect(r.erros).toEqual([]);
    expect(r.linhas).toHaveLength(4);
    const loja: LojaParaPlanilha = { id: 'l1', nome: 'Minha Loja', ativa: true, canais: ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'] };
    for (const l of r.linhas) expect(interpretarLinha(l, [loja], '2026-10-17'), `linha ${l.linha}`).toMatchObject({ ok: true });
  });

  it('cabeçalho sem coluna obrigatória, vazio, linhas demais e colunas demais param o arquivo', () => {
    expect(lerPlanilhaDeFaturamento('').erros[0].mensagem).toContain('vazia');
    expect(lerPlanilhaDeFaturamento('data;loja;canal\n1;2;3').erros[0].mensagem).toContain('Faltam as colunas faturamento, pedidos');
    const muitas = `${CABECALHO_DO_MODELO}\n${'14/10/2026;Vila da Penha;loja;1,00;1;1\n'.repeat(5001)}`;
    expect(lerPlanilhaDeFaturamento(muitas).erros[0].mensagem).toContain('5000');
    const colunas = Array.from({ length: 21 }, (_, i) => `c${i}`).join(';');
    expect(lerPlanilhaDeFaturamento(`${colunas}\n1`).erros[0].mensagem).toContain('20 colunas');
  });

  it('linha com coluna a mais (vírgula decimal sem aspas) e campo gigante são erros da linha; as outras entram', () => {
    const csv = `${CABECALHO_DO_MODELO}\n14/10/2026;Vila da Penha;loja;4350,00;62;;extra\n14/10/2026;${'x'.repeat(201)};loja;1,00;1;1\n14/10/2026;Vila da Penha;loja;1,00;1;1`;
    const r = lerPlanilhaDeFaturamento(csv);
    expect(r.erros.map((e) => e.linha)).toEqual([2, 3]);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhasLidas).toBe(3);
  });

  it('a linha boa: loja sem caixa nem acento, canal por apelido, números em centavos', () => {
    expect(normalizarNome('  VILA  da PENHÁ ')).toBe('vila da penha');
    expect(lerCanalDaPlanilha('iFood')).toBe('IFOOD');
    expect(lerCanalDaPlanilha('Delivery próprio')).toBe('DELIVERY_PROPRIO');
    expect(lerCanalDaPlanilha('Salão')).toBe('LOJA');
    expect(lerCanalDaPlanilha('rappi')).toBeNull();
    expect(interpretarLinha(linha({ loja: 'vila da PENHÁ' }), lojas, HOJE)).toEqual({
      ok: true,
      lojaId: 'l1',
      lojaNome: 'Vila da Penha',
      canal: 'IFOOD',
      data: '2026-10-14',
      valorCentavos: 321000,
      pedidos: 41,
      clientes: 41,
    });
  });

  it('erros por linha: loja fora do acesso, canal desligado, desativada, data, negativo, fórmula', () => {
    const erro = (o: Parameters<typeof linha>[0]) => {
      const r = interpretarLinha(linha(o), lojas, HOJE);
      return r.ok ? null : r.erro;
    };
    expect(erro({ loja: 'Outra' })).toBe('Loja “Outra” não encontrada no seu acesso.');
    expect(erro({ loja: 'Delivery Penha', canal: 'loja' })).toContain('não vende por Loja');
    expect(erro({ loja: 'Antiga', canal: 'loja' })).toContain('desativada');
    expect(erro({ data: '18/10/2026' })).toContain('ainda não chegou');
    expect(erro({ data: '' })).toBe('Data em branco.');
    expect(erro({ canal: 'rappi' })).toContain('não existe');
    expect(erro({ faturamento: '-10,00' })).toContain('negativo');
    expect(erro({ faturamento: '1,2,3' })).toContain('inválido');
    expect(erro({ pedidos: '2,5' })).toContain('inteiro');
    expect(erro({ faturamento: '', pedidos: '' })).toContain('em branco');
    expect(erro({ faturamento: '0', pedidos: '0' })).toBeNull();
  });

  it('planilha maliciosa: fórmula nunca casa loja/canal nem vira número; o eco é curto e limpo', () => {
    const erro = (o: Parameters<typeof linha>[0]) => {
      const r = interpretarLinha(linha(o), lojas, HOJE);
      return r.ok ? null : r.erro;
    };
    expect(erro({ faturamento: '=1+1' })).toContain('fórmula não entra');
    expect(erro({ faturamento: '@SUM(1)' })).toContain('fórmula não entra');
    expect(erro({ faturamento: '+cmd|calc' })).toContain('fórmula não entra');
    expect(erro({ loja: '=HYPERLINK("http://x")' })).toContain('fórmula não entra');
    expect(erro({ canal: '-2+3' })).toContain('fórmula não entra');
    expect(erro({ pedidos: '\t5' })).toContain('fórmula não entra');
    expect(erro({ loja: '  =Penha' })).toContain('fórmula não entra');
    const eco = ecoDaCelula(`Vila‮${'a'.repeat(100)}\u0000\n`);
    expect(eco.length).toBeLessThanOrEqual(41);
    expect(eco).not.toMatch(/[‮\u0000\n]/);
    const longa = erro({ loja: `Loja ${'x'.repeat(150)}` })!;
    expect(longa.length).toBeLessThan(120);
  });
});

describe('2.1 · histórico', () => {
  const depois = retratoDoLancamento({ lojaId: 'l1', lojaNome: 'Vila da Penha', canal: 'IFOOD', data: '2026-10-14', origem: 'MANUAL', valorCentavos: 312000, pedidos: 40, clientes: 40 });
  const antes = retratoDoLancamento({ lojaId: 'l1', lojaNome: 'Vila da Penha', canal: 'IFOOD', data: '2026-10-14', origem: 'MANUAL', valorCentavos: 321000, pedidos: 41, clientes: 41 });
  it('antes e depois legíveis, só com o que mudou; o alvo diz de quem é', () => {
    expect(alvoDaLinha(antes, depois)).toBe('Vila da Penha · iFood · 14/10/2026');
    const m = descreverMudancas({ ...antes, alvo: undefined } as never, depois as never);
    const f = m.find((x) => x.campo === 'faturamento')!;
    expect(f.antes?.replace(/\u00a0/g, ' ')).toBe('R$ 3.210,00');
    expect(f.depois.replace(/\u00a0/g, ' ')).toBe('R$ 3.120,00');
    expect(m.find((x) => x.campo === 'pedidos')).toMatchObject({ antes: '41', depois: '40' });
    expect(m.find((x) => x.campo === 'origem')).toBeUndefined();
  });
  it('criação mostra os números e a origem, sem repetir o alvo', () => {
    const m = descreverMudancas(null, depois as never);
    expect(m.map((x) => x.campo)).toEqual(['faturamento', 'pedidos', 'clientes', 'origem']);
  });
});
