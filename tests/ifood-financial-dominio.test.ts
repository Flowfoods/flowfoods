import { describe, expect, it } from 'vitest';
import {
  decimalFinancialEmCentavos, ErroFinancialSimulado, MAX_EVENTOS_FINANCIAL_SIMULADO,
  normalizarEventosFinancialSimulados, normalizarLiquidacaoFinancialSimulada,
  type EntradaEventosFinancialSimulados, type EntradaLiquidacaoFinancialSimulada,
} from '@/lib/integracoes/ifood/financial-dominio';
import { conciliarFinancialSimulado } from '@/lib/integracoes/ifood/financial-conciliacao';

const identidade = () => ({ parceiro: 'parceiro-simulado', loja: 'loja-simulada', merchant: 'merchant-simulado',
  produto: 'IFOOD', competencia: '2026-10', moeda: 'BRL' as const });
const cobertura = () => ({ estado: 'COMPLETA' as const, apuracao: 'ENCERRADA' as const });
function eventos(valores: (string | null)[] = ['100.00']): EntradaEventosFinancialSimulados {
  return { origem: 'SIMULACAO', versao: 1, natureza: 'EVENTOS_FINANCEIROS', identidade: identidade(), cobertura: cobertura(),
    eventos: valores.map(valorReais => ({ nome: 'EVENTO_SINTETICO', gatilho: 'CENARIO_SINTETICO', impactoNoRepasse: true, valorReais })) };
}
function liquidacao(valorReais: string | null = '100.00'): EntradaLiquidacaoFinancialSimulada {
  return { origem: 'SIMULACAO', versao: 1, natureza: 'LIQUIDACAO', identidade: identidade(), cobertura: cobertura(), valorReais };
}

describe('Financial simulado · dinheiro exato', () => {
  it.each([
    ['0', 0n], ['-0.00', 0n], ['1', 100n], ['1.2', 120n], ['1.2300', 123n],
    ['-0.01', -1n], ['-1234.56', -123456n], ['9007199254740993123456789.91', 900719925474099312345678991n],
  ] as const)('normaliza %s sem Number ou arredondamento', (entrada, esperado) => {
    expect(decimalFinancialEmCentavos(entrada)).toBe(esperado);
  });
  it.each([null, undefined, 0, 1.25, true, '', ' 1.00', '1.00 ', '01.00', '+1', '1,50', '1e2', 'NaN', 'Infinity', '.50', '1.'])('recusa coerção ou formato não contratado: %s', valor => {
    expect(() => decimalFinancialEmCentavos(valor)).toThrow(ErroFinancialSimulado);
  });
  it.each(['0.001', '1.005', '-1.009', '99.0001'])('recusa subcentavos sem inventar política: %s', valor => {
    try { decimalFinancialEmCentavos(valor); expect.unreachable(); }
    catch (erro) { expect(erro).toMatchObject({ codigo: 'SUBCENTAVO' }); }
  });
  it('limita tamanho textual antes de BigInt sem impor teto comercial', () => {
    expect(() => decimalFinancialEmCentavos('9'.repeat(81))).toThrow(ErroFinancialSimulado);
    expect(decimalFinancialEmCentavos('9'.repeat(80))).toBe(BigInt('9'.repeat(80)) * 100n);
  });
});

describe('Financial simulado · fronteira e identidade', () => {
  it('preserva valor ausente, impacto desconhecido e enum futuro sem classificar por nome', () => {
    const entrada = eventos([null]);
    entrada.eventos[0].nome = 'EVENTO_FUTURO';
    entrada.eventos[0].impactoNoRepasse = null;
    expect(normalizarEventosFinancialSimulados(entrada).eventos[0]).toEqual({
      nome: 'EVENTO_FUTURO', gatilho: 'CENARIO_SINTETICO', impactoNoRepasse: null, valorCentavos: null,
    });
    expect(normalizarLiquidacaoFinancialSimulada(liquidacao(null)).valorCentavos).toBeNull();
  });
  it.each(['PRODUCAO', 'TEST', '', null])('recusa origem %s mesmo com valores válidos', origem => {
    expect(() => conciliarFinancialSimulado({ ...eventos(), origem }, liquidacao())).toThrow(ErroFinancialSimulado);
    expect(() => conciliarFinancialSimulado(eventos(), { ...liquidacao(), origem })).toThrow(ErroFinancialSimulado);
  });
  it.each(['VENDA', 'RECEBIVEL', 'REPASSE_PREVISTO', 'CREDITO_BANCARIO'])('não usa %s como liquidação', natureza => {
    expect(() => normalizarLiquidacaoFinancialSimulada({ ...liquidacao(), natureza })).toThrow(ErroFinancialSimulado);
  });
  it('não aceita envelope HTTP, versão desconhecida, moeda diferente ou competência inválida', () => {
    expect(() => normalizarEventosFinancialSimulados({ page: 1, size: 100, hasNextPage: false, financialEvents: [] })).toThrow(ErroFinancialSimulado);
    expect(() => normalizarEventosFinancialSimulados({ ...eventos(), versao: 2 })).toThrow(ErroFinancialSimulado);
    for (const mudanca of [{ moeda: 'USD' }, { competencia: '2026-13' }, { competencia: '2026-1' }, { competencia: '0000-01' }, { loja: '' }]) {
      expect(() => normalizarEventosFinancialSimulados({ ...eventos(), identidade: { ...identidade(), ...mudanca } })).toThrow(ErroFinancialSimulado);
    }
  });
  it.each(['parceiro', 'loja', 'merchant', 'produto', 'competencia'] as const)('mantém %s divergente pendente, sem comparar os totais', campo => {
    const destino = liquidacao();
    destino.identidade[campo] = campo === 'competencia' ? '2026-11' : 'outro-simulado';
    const r = conciliarFinancialSimulado(eventos(), destino);
    expect(r).toMatchObject({ estado: 'PENDENTE', motivos: ['IDENTIDADE_DIVERGENTE'], diferencaCentavos: null });
    expect(r.identidadeLiquidacao[campo]).toBe(destino.identidade[campo]);
  });
  it('recusa dados sob cobertura AUSENTE e mantém erros sem conteúdo da entrada', () => {
    const fonte = eventos(); fonte.cobertura.estado = 'AUSENTE';
    expect(() => normalizarEventosFinancialSimulados(fonte)).toThrow(ErroFinancialSimulado);
    const destino = liquidacao(); destino.cobertura.estado = 'AUSENTE';
    expect(() => normalizarLiquidacaoFinancialSimulada(destino)).toThrow(ErroFinancialSimulado);
    let erroRecebido: unknown;
    try { normalizarEventosFinancialSimulados({ ...eventos(), segredo: 'SENTINELA_NAO_EXIBIR' }); }
    catch (erro) { erroRecebido = erro; }
    expect(erroRecebido).toBeInstanceOf(ErroFinancialSimulado);
    expect(String(erroRecebido)).not.toContain('SENTINELA_NAO_EXIBIR');
  });
  it('impõe limite local de ocorrências sem transformar excesso em cobertura parcial', () => {
    const fonte = eventos();
    fonte.eventos = Array.from({ length: MAX_EVENTOS_FINANCIAL_SIMULADO + 1 }, () => ({ ...fonte.eventos[0] }));
    expect(() => normalizarEventosFinancialSimulados(fonte)).toThrow(ErroFinancialSimulado);
  });
});

describe('Financial simulado · conciliação', () => {
  it('soma créditos/débitos com impacto e exclui ocorrências informativas sem gerar segunda receita', () => {
    const fonte = eventos(['100.00', '-12.00', '-3.00', '-5.00', null]);
    fonte.eventos[3].impactoNoRepasse = false;
    fonte.eventos[4].impactoNoRepasse = false;
    const r = conciliarFinancialSimulado(fonte, liquidacao('85.00'));
    expect(r).toMatchObject({ origem: 'SIMULACAO', estado: 'COMPATIVEL', motivos: [], eventosComImpactoCentavos: 8500n,
      liquidacaoCentavos: 8500n, diferencaCentavos: 0n, ocorrencias: { recebidas: 5, comImpacto: 3, semImpacto: 2, impactoDesconhecido: 0 } });
    expect(normalizarEventosFinancialSimulados(fonte).eventos[4].valorCentavos).toBeNull();
  });
  it('não deduplica ocorrências distintas por nome/gatilho/valor iguais', () => {
    expect(conciliarFinancialSimulado(eventos(['50.00', '50.00']), liquidacao())).toMatchObject({
      estado: 'COMPATIVEL', eventosComImpactoCentavos: 10000n, ocorrencias: { comImpacto: 2 },
    });
  });
  it.each([
    ['10001.00', '10000.00', 'COMPATIVEL', 100n],
    ['10001.01', '10000.00', 'DIVERGENTE', 101n],
    ['9999.00', '10000.00', 'COMPATIVEL', -100n],
    ['-10001.00', '-10000.00', 'COMPATIVEL', -100n],
    ['-10001.01', '-10000.00', 'DIVERGENTE', -101n],
    ['1.01', '1.00', 'DIVERGENTE', 1n],
    ['0.00', '0.00', 'COMPATIVEL', 0n],
    ['0.01', '0.00', 'DIVERGENTE', 1n],
  ] as const)('compara %s com %s usando 0,01%% exato, sem mínimo de centavo', (valor, esperado, estado, diferencaCentavos) => {
    expect(conciliarFinancialSimulado(eventos([valor]), liquidacao(esperado))).toMatchObject({ estado, diferencaCentavos });
  });
  it('calcula soma e diferença acima de Number.MAX_SAFE_INTEGER sem perder um centavo', () => {
    const r = conciliarFinancialSimulado(eventos(['9007199254740993.00', '-0.01']), liquidacao('9007199254740993.00'));
    expect(r.eventosComImpactoCentavos).toBe(900719925474099299n);
    expect(r.diferencaCentavos).toBe(-1n);
  });
  it.each(['INCOMPLETA', 'AUSENTE'] as const)('cobertura %s não vira zero nem conciliação aprovada', estado => {
    const fonte = eventos(estado === 'AUSENTE' ? [] : ['100.00']); fonte.cobertura.estado = estado;
    const r = conciliarFinancialSimulado(fonte, liquidacao());
    expect(r).toMatchObject({ estado: 'PENDENTE', eventosComImpactoCentavos: null, diferencaCentavos: null });
    expect(r.motivos).toContain('COBERTURA_EVENTOS_INCOMPLETA');
    const destino = liquidacao(estado === 'AUSENTE' ? null : '100.00'); destino.cobertura.estado = estado;
    expect(conciliarFinancialSimulado(eventos(), destino)).toMatchObject({ estado: 'PENDENTE', liquidacaoCentavos: null, diferencaCentavos: null });
  });
  it('vazio explícito completo pode ser zero; não prova completude de fonte ausente', () => {
    expect(conciliarFinancialSimulado(eventos([]), liquidacao('0'))).toMatchObject({ estado: 'COMPATIVEL', eventosComImpactoCentavos: 0n });
  });
  it('apuração pendente mantém ambos os totais inelegíveis mesmo quando observados coincidem', () => {
    const fonte = eventos(); fonte.cobertura.apuracao = 'PENDENTE';
    const destino = liquidacao(); destino.cobertura.apuracao = 'PENDENTE';
    expect(conciliarFinancialSimulado(fonte, destino)).toMatchObject({ estado: 'PENDENTE', eventosComImpactoCentavos: null,
      liquidacaoCentavos: null, diferencaCentavos: null, motivos: ['APURACAO_EVENTOS_PENDENTE', 'APURACAO_LIQUIDACAO_PENDENTE'] });
  });
  it('valor de evento, impacto ou liquidação desconhecidos nunca viram zero', () => {
    expect(conciliarFinancialSimulado(eventos([null]), liquidacao('0'))).toMatchObject({
      estado: 'PENDENTE', motivos: ['VALOR_EVENTO_AUSENTE'], eventosComImpactoCentavos: null, diferencaCentavos: null,
    });
    const fonte = eventos(['0']); fonte.eventos[0].impactoNoRepasse = null;
    expect(conciliarFinancialSimulado(fonte, liquidacao('0'))).toMatchObject({ estado: 'PENDENTE', motivos: ['IMPACTO_DESCONHECIDO'] });
    expect(conciliarFinancialSimulado(eventos(['0']), liquidacao(null))).toMatchObject({
      estado: 'PENDENTE', motivos: ['VALOR_LIQUIDACAO_AUSENTE'], liquidacaoCentavos: null, diferencaCentavos: null,
    });
  });
  it('repete deterministicamente sem mutar cenário congelado e declara base ainda não confirmada', () => {
    const fonte = eventos(); const destino = liquidacao();
    for (const item of fonte.eventos) Object.freeze(item);
    Object.freeze(fonte.eventos); Object.freeze(fonte.identidade); Object.freeze(fonte.cobertura); Object.freeze(fonte);
    Object.freeze(destino.identidade); Object.freeze(destino.cobertura); Object.freeze(destino);
    const antes = structuredClone({ fonte, destino });
    const r = conciliarFinancialSimulado(fonte, destino);
    expect(conciliarFinancialSimulado(fonte, destino)).toEqual(r);
    expect({ fonte, destino }).toEqual(antes);
    expect(r.politica).toEqual({ toleranciaPercentual: '0.01', base: 'ABS_LIQUIDACAO', baseConfirmadaParaDadosReais: false, minimoEmCentavos: '0' });
    expect(Object.isFrozen(r.politica)).toBe(true);
    expect(() => normalizarEventosFinancialSimulados({ ...fonte, aplicarNoPeriodoFechado: true })).toThrow(ErroFinancialSimulado);
  });
});
