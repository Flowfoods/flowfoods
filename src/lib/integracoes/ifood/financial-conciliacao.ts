/** Comparação pura de cenários sintéticos; não aplica valores nem conclui conciliação real. */
import {
  normalizarEventosFinancialSimulados, normalizarLiquidacaoFinancialSimulada,
  type IdentidadeFinancialSimulada,
} from './financial-dominio';

/** Percentual do plano FlowFoods. Base é hipótese técnica da simulação, ainda sem aceite para dados reais. */
export const POLITICA_FINANCIAL_SIMULADA = Object.freeze({
  toleranciaPercentual: '0.01', base: 'ABS_LIQUIDACAO',
  baseConfirmadaParaDadosReais: false, minimoEmCentavos: '0',
} as const);

export type PendenciaFinancialSimulada =
  | 'IDENTIDADE_DIVERGENTE' | 'COBERTURA_EVENTOS_INCOMPLETA' | 'COBERTURA_LIQUIDACAO_INCOMPLETA'
  | 'APURACAO_EVENTOS_PENDENTE' | 'APURACAO_LIQUIDACAO_PENDENTE'
  | 'IMPACTO_DESCONHECIDO' | 'VALOR_EVENTO_AUSENTE' | 'VALOR_LIQUIDACAO_AUSENTE';
export interface ConciliacaoFinancialSimulada {
  readonly origem: 'SIMULACAO';
  readonly versao: 1;
  readonly estado: 'COMPATIVEL' | 'DIVERGENTE' | 'PENDENTE';
  readonly identidadeEventos: IdentidadeFinancialSimulada;
  readonly identidadeLiquidacao: IdentidadeFinancialSimulada;
  readonly politica: typeof POLITICA_FINANCIAL_SIMULADA;
  readonly motivos: readonly PendenciaFinancialSimulada[];
  /** Total elegível, nunca soma parcial apresentada como cobertura completa. */
  readonly eventosComImpactoCentavos: bigint | null;
  readonly liquidacaoCentavos: bigint | null;
  /** Eventos menos liquidação. Só existe quando identidades e coberturas permitem comparar. */
  readonly diferencaCentavos: bigint | null;
  readonly ocorrencias: { readonly recebidas: number; readonly comImpacto: number; readonly semImpacto: number; readonly impactoDesconhecido: number };
}

const abs = (n: bigint) => n < 0n ? -n : n;

export function compararCentavosLiquidacaoSimulada(eventosComImpactoCentavos: bigint, liquidacaoCentavos: bigint) {
  const diferencaCentavos = eventosComImpactoCentavos - liquidacaoCentavos;
  // 0,01% = 1/10000: comparação inteira, sem arredondar limite nem inventar piso de R$ 0,01.
  const compativel = abs(diferencaCentavos) * 10_000n <= abs(liquidacaoCentavos);
  return { estado: compativel ? 'COMPATIVEL' as const : 'DIVERGENTE' as const, diferencaCentavos };
}

const mesmaIdentidade = (a: IdentidadeFinancialSimulada, b: IdentidadeFinancialSimulada) =>
  a.parceiro === b.parceiro && a.loja === b.loja && a.merchant === b.merchant
  && a.produto === b.produto && a.competencia === b.competencia && a.moeda === b.moeda;

export function conciliarFinancialSimulado(eventosEntrada: unknown, liquidacaoEntrada: unknown): ConciliacaoFinancialSimulada {
  const fonte = normalizarEventosFinancialSimulados(eventosEntrada);
  const liquidacao = normalizarLiquidacaoFinancialSimulada(liquidacaoEntrada);
  const motivos = new Set<PendenciaFinancialSimulada>();
  if (!mesmaIdentidade(fonte.identidade, liquidacao.identidade)) motivos.add('IDENTIDADE_DIVERGENTE');
  if (fonte.cobertura.estado !== 'COMPLETA') motivos.add('COBERTURA_EVENTOS_INCOMPLETA');
  if (liquidacao.cobertura.estado !== 'COMPLETA') motivos.add('COBERTURA_LIQUIDACAO_INCOMPLETA');
  if (fonte.cobertura.apuracao !== 'ENCERRADA') motivos.add('APURACAO_EVENTOS_PENDENTE');
  if (liquidacao.cobertura.apuracao !== 'ENCERRADA') motivos.add('APURACAO_LIQUIDACAO_PENDENTE');
  if (liquidacao.valorCentavos === null) motivos.add('VALOR_LIQUIDACAO_AUSENTE');

  let soma = 0n, comImpacto = 0, semImpacto = 0, impactoDesconhecido = 0;
  for (const evento of fonte.eventos) {
    if (evento.impactoNoRepasse === null) {
      impactoDesconhecido++;
      motivos.add('IMPACTO_DESCONHECIDO');
    } else if (!evento.impactoNoRepasse) semImpacto++;
    else {
      comImpacto++;
      if (evento.valorCentavos === null) motivos.add('VALOR_EVENTO_AUSENTE');
      else soma += evento.valorCentavos;
    }
  }
  // Nome/gatilho não são identidade única: ocorrências iguais continuam separadas.
  const eventosComImpactoCentavos = fonte.cobertura.estado === 'COMPLETA' && fonte.cobertura.apuracao === 'ENCERRADA'
    && !motivos.has('IMPACTO_DESCONHECIDO') && !motivos.has('VALOR_EVENTO_AUSENTE') ? soma : null;
  const liquidacaoCentavos = liquidacao.cobertura.estado === 'COMPLETA' && liquidacao.cobertura.apuracao === 'ENCERRADA'
    ? liquidacao.valorCentavos : null;
  const base = {
    origem: 'SIMULACAO' as const, versao: 1 as const, politica: POLITICA_FINANCIAL_SIMULADA,
    identidadeEventos: fonte.identidade, identidadeLiquidacao: liquidacao.identidade,
    motivos: [...motivos], eventosComImpactoCentavos, liquidacaoCentavos,
    ocorrencias: { recebidas: fonte.eventos.length, comImpacto, semImpacto, impactoDesconhecido },
  };
  if (motivos.size || eventosComImpactoCentavos === null || liquidacaoCentavos === null) {
    return { ...base, estado: 'PENDENTE', diferencaCentavos: null };
  }
  return { ...base, ...compararCentavosLiquidacaoSimulada(eventosComImpactoCentavos, liquidacaoCentavos) };
}
