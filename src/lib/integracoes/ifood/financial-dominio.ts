/** INT-2.2/2.3: contrato LOCAL de simulação. Não é um adaptador de resposta da API. */
import { z } from 'zod';

export const VERSAO_FINANCIAL_SIMULADO = 1 as const;
/** Tetos defensivos locais, sem significado financeiro ou de limite da API. */
export const MAX_EVENTOS_FINANCIAL_SIMULADO = 10_000;
export const MAX_CARACTERES_DECIMAL_FINANCIAL = 80;

export class ErroFinancialSimulado extends Error {
  constructor(readonly codigo: 'CONTRATO_EVENTOS' | 'CONTRATO_LIQUIDACAO' | 'VALOR_INVALIDO' | 'SUBCENTAVO' | 'LIMITE_LOCAL') {
    super('Entrada incompatível com o contrato local de simulação Financial.');
    this.name = 'ErroFinancialSimulado';
  }
}

/** BRL textual, sem Number, arredondamento, locale, expoente ou coerção de ausência para zero. */
export function decimalFinancialEmCentavos(valor: unknown): bigint {
  if (typeof valor !== 'string') throw new ErroFinancialSimulado('VALOR_INVALIDO');
  if (valor.length > MAX_CARACTERES_DECIMAL_FINANCIAL) throw new ErroFinancialSimulado('LIMITE_LOCAL');
  const m = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?$/.exec(valor);
  if (!m) throw new ErroFinancialSimulado('VALOR_INVALIDO');
  const fracao = m[3] ?? '';
  if (/[1-9]/.test(fracao.slice(2))) throw new ErroFinancialSimulado('SUBCENTAVO');
  const centavos = BigInt(m[2]) * 100n + BigInt(fracao.slice(0, 2).padEnd(2, '0'));
  return m[1] ? -centavos : centavos;
}

const identificador = z.string().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/);
const identidadeSchema = z.strictObject({
  parceiro: identificador, loja: identificador, merchant: identificador, produto: identificador,
  competencia: z.string().regex(/^(?!0000)\d{4}-(?:0[1-9]|1[0-2])$/), moeda: z.literal('BRL'),
});
const coberturaSchema = z.strictObject({
  estado: z.enum(['COMPLETA', 'INCOMPLETA', 'AUSENTE']),
  apuracao: z.enum(['ENCERRADA', 'PENDENTE']),
});
const comum = {
  origem: z.literal('SIMULACAO'), versao: z.literal(VERSAO_FINANCIAL_SIMULADO),
  identidade: identidadeSchema, cobertura: coberturaSchema,
};
const eventoSchema = z.strictObject({
  nome: identificador, gatilho: identificador,
  impactoNoRepasse: z.boolean().nullable(),
  valorReais: z.string().max(MAX_CARACTERES_DECIMAL_FINANCIAL).nullable(),
});
const eventosSchema = z.strictObject({
  ...comum, natureza: z.literal('EVENTOS_FINANCEIROS'),
  eventos: z.array(eventoSchema).max(MAX_EVENTOS_FINANCIAL_SIMULADO),
}).refine(e => e.cobertura.estado !== 'AUSENTE' || e.eventos.length === 0);
const liquidacaoSchema = z.strictObject({
  ...comum, natureza: z.literal('LIQUIDACAO'),
  valorReais: z.string().max(MAX_CARACTERES_DECIMAL_FINANCIAL).nullable(),
}).refine(e => e.cobertura.estado !== 'AUSENTE' || e.valorReais === null);

export type IdentidadeFinancialSimulada = Readonly<z.infer<typeof identidadeSchema>>;
export function identidadeFinancialSimuladaValida(valor: unknown): valor is IdentidadeFinancialSimulada {
  return identidadeSchema.safeParse(valor).success;
}

export type CoberturaFinancialSimulada = Readonly<z.infer<typeof coberturaSchema>>;
export type EntradaEventosFinancialSimulados = z.infer<typeof eventosSchema>;
export type EntradaLiquidacaoFinancialSimulada = z.infer<typeof liquidacaoSchema>;
export interface EventoFinancialSimulado {
  readonly nome: string;
  readonly gatilho: string;
  readonly impactoNoRepasse: boolean | null;
  readonly valorCentavos: bigint | null;
}
interface FonteFinancialSimulada {
  readonly origem: 'SIMULACAO';
  readonly versao: 1;
  readonly identidade: IdentidadeFinancialSimulada;
  readonly cobertura: CoberturaFinancialSimulada;
}
export interface EventosFinancialSimulados extends FonteFinancialSimulada {
  readonly natureza: 'EVENTOS_FINANCEIROS';
  readonly eventos: readonly EventoFinancialSimulado[];
}
export interface LiquidacaoFinancialSimulada extends FonteFinancialSimulada {
  readonly natureza: 'LIQUIDACAO';
  readonly valorCentavos: bigint | null;
}

export function normalizarEventosFinancialSimulados(entrada: unknown): EventosFinancialSimulados {
  const resultado = eventosSchema.safeParse(entrada);
  if (!resultado.success) throw new ErroFinancialSimulado('CONTRATO_EVENTOS');
  const { eventos, ...fonte } = resultado.data;
  return { ...fonte, eventos: eventos.map(({ valorReais, ...evento }) => ({
    ...evento, valorCentavos: valorReais === null ? null : decimalFinancialEmCentavos(valorReais),
  })) };
}

/** Venda, recebível, repasse previsto e crédito bancário não são entradas intercambiáveis. */
export function normalizarLiquidacaoFinancialSimulada(entrada: unknown): LiquidacaoFinancialSimulada {
  const resultado = liquidacaoSchema.safeParse(entrada);
  if (!resultado.success) throw new ErroFinancialSimulado('CONTRATO_LIQUIDACAO');
  const { valorReais, ...fonte } = resultado.data;
  return { ...fonte, valorCentavos: valorReais === null ? null : decimalFinancialEmCentavos(valorReais) };
}
