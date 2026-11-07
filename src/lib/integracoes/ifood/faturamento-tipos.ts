/** Contratos da INT-1.7B. Nenhum payload HTTP ou número do formulário autoriza aplicação. */
export const VERSAO_MAPA_FATURAMENTO_ANALYTICS = 1;
export const FONTE_FATURAMENTO_ANALYTICS = 'ifood-analytics';

export const MOTIVOS_PENDENCIA_FINANCEIRA = [
  'PERIODO_FECHADO', 'COBERTURA_INCOMPLETA', 'ACESSO', 'VINCULO_AMBIGUO',
  'MARCA_DIVERGENTE', 'OUTRA_INTEGRACAO', 'DESTINO_DIVERGENTE', 'IDENTIDADE',
  'SNAPSHOT_NAO_PUBLICADO', 'SNAPSHOT_INCOMPLETO', 'RECORTE_NAO_MAPEADO',
  'VALOR_AUSENTE', 'NUMEROS_INVALIDOS', 'LIMITE_FATURAMENTO',
] as const;
export type MotivoPendenciaFinanceira = (typeof MOTIVOS_PENDENCIA_FINANCEIRA)[number];
export type MotivoMapaFaturamento = Extract<MotivoPendenciaFinanceira,
  'IDENTIDADE' | 'SNAPSHOT_NAO_PUBLICADO' | 'SNAPSHOT_INCOMPLETO' |
  'RECORTE_NAO_MAPEADO' | 'VALOR_AUSENTE' | 'NUMEROS_INVALIDOS' | 'LIMITE_FATURAMENTO'>;

export interface LinhaFinanceiraAnalytics {
  chaveGrupo: string;
  orderStatus: string | null;
  salesChannel: string | null;
  deliveredBy: string | null;
  category: string | null;
  pedidos: bigint;
  gmvWithoutDelivery: bigint | null;
}

/** Projeção explícita do snapshot e da identidade persistida de sua execução/conexão. */
export interface SnapshotFinanceiro {
  id: string;
  hash: string;
  origem: string;
  parceiroId: string;
  lojaId: string;
  merchantId: string;
  provedor: string;
  ambiente: string;
  perfil: string;
  dia: string;
  fuso: string;
  situacao: string;
  vazioOficial: boolean;
  numeroGrupos: number;
  pedidos: bigint;
  linhas: readonly LinhaFinanceiraAnalytics[];
}

export type MapaFaturamentoAnalytics =
  | { estado: 'apto'; valorCentavos: number; pedidos: number; clientes: null; versaoMapa: number }
  | { estado: 'pendente'; motivo: MotivoMapaFaturamento };

export interface GraoAnalyticsParaFaturamento { lojaId: string; dia: string }
export type ResultadoAplicacaoAnalytics =
  | { estado: 'aplicado' | 'igual'; reciboId: string; fontes: number }
  | { estado: 'pendente'; reciboId: string; motivo: MotivoPendenciaFinanceira };

export class ErroAplicacaoAnalytics extends Error {
  constructor(readonly codigo: 'POSSE' | 'ACESSO' | 'ENTRADA' | 'INTEGRIDADE') {
    super('A aplicação financeira não pôde ser confirmada.');
    this.name = 'ErroAplicacaoAnalytics';
  }
}

export function ehMotivoPendenciaFinanceira(valor: unknown): valor is MotivoPendenciaFinanceira {
  return typeof valor === 'string' && (MOTIVOS_PENDENCIA_FINANCEIRA as readonly string[]).includes(valor);
}
