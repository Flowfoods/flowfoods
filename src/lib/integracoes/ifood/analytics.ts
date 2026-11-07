/**
 * INT-1.5: contrato puro de Analytics. Não chama API, autoriza loja, agenda ou publica dados.
 * Estrutura válida, cobertura completa e compatibilidade diária são verificações distintas.
 * A massa TEST oficial tem outro grão e não é um snapshot diário pronto para faturamento.
 */
import { z } from 'zod';
import { diaSeguinte } from './datas';

export const DIMENSOES_DIARIAS = ['orderStatus', 'salesChannel', 'deliveredBy', 'category'] as const;
export const METRICAS_DIARIAS = ['gmv', 'gmvWithoutDelivery', 'netDeliveryFee', 'paymentTotalValue', 'benefitByTypePartnerTotalValue', 'refundedTotalValue'] as const;
type MetricaDiaria = (typeof METRICAS_DIARIAS)[number];
type DimensaoDiaria = (typeof DIMENSOES_DIARIAS)[number];
export type CodigoContratoAnalytics = 'DATA' | 'PARAMETROS' | 'ESQUEMA' | 'PAGINACAO' | 'PAGINA_REPETIDA' | 'GRUPO_REPETIDO' | 'IDENTIDADE' | 'INCOMPLETO' | 'CONSULTA_INCOMPATIVEL' | 'UNIDADE_MONETARIA' | 'PRECISAO_MONETARIA' | 'LIMITE_NUMERICO';
export class ErroContratoAnalytics extends Error {
  constructor(public readonly codigo: CodigoContratoAnalytics, mensagem: string) {
    super(mensagem);
    this.name = 'ErroContratoAnalytics';
  }
}
function exigir(ok: unknown, codigo: CodigoContratoAnalytics, mensagem: string): asserts ok {
  if (!ok) throw new ErroContratoAnalytics(codigo, mensagem);
}
function intervalo(dia: string) {
  const fim = diaSeguinte(dia);
  exigir(fim, 'DATA', 'Dia inválido para a consulta do Analytics.');
  return { referenceDate: { gte: dia, lt: fim } };
}
function paginaETamanho(page: number, size: number) {
  exigir(Number.isSafeInteger(page) && page >= 1 && page <= 1_000 && Number.isSafeInteger(size) && size >= 1 && size <= 10_000,
    'PARAMETROS', 'Página e tamanho fora dos limites da consulta do Analytics.');
  return { page, size };
}
export function consultaMinima(dia: string, page = 1, size = 100) {
  return { filter: intervalo(dia), agg: { metrics: { gmv: ['sum'] }, terms: { orderStatus: ['count'] } }, ...paginaETamanho(page, size) };
}
export function consultaDoDia(dia: string, page = 1, size = 500) {
  return {
    filter: intervalo(dia),
    agg: { groupBy: { fields: [...DIMENSOES_DIARIAS] }, metrics: Object.fromEntries(METRICAS_DIARIAS.map((m) => [m, ['sum']])) },
    ...paginaETamanho(page, size),
  };
}
/** Consulta marginal; seus termos não reconstroem cruzamentos nem pedidos individuais. */
export function consultaDistribuicoes(dia: string, page = 1, size = 500) {
  return { filter: intervalo(dia), agg: { terms: { paymentMethod: ['count'], orderCreationHour: ['count'], customerFirstOrderInMerchant: ['count'] } }, ...paginaETamanho(page, size) };
}

const inteiro = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const numeroOuNulo = z.number().finite().nullable();
const metricaSchema = z.looseObject({ sum: numeroOuNulo.optional(), avg: numeroOuNulo.optional(), min: numeroOuNulo.optional(), max: numeroOuNulo.optional() });
const dimensoesSchema = z.record(z.string(), z.union([z.string().min(1).max(200), z.number().finite(), z.boolean(), z.null()]))
  .refine((v) => Object.keys(v).length > 0 && Object.keys(v).length <= 32 && !Object.keys(v).some((k) => ['__proto__', 'constructor', 'prototype'].includes(k)));
const bucketSchema = z.looseObject({
  groupByKey: z.object({ value: dimensoesSchema, count: inteiro }),
  gmv: metricaSchema.nullable().optional(),
  gmvWithoutDelivery: metricaSchema.nullable().optional(),
  netDeliveryFee: metricaSchema.nullable().optional(),
  paymentTotalValue: metricaSchema.nullable().optional(),
  benefitByTypePartnerTotalValue: metricaSchema.nullable().optional(),
  refundedTotalValue: metricaSchema.nullable().optional(),
});
/** Schema de respostas AGRUPADAS. Distribuições sem groupBy têm contrato separado, ainda não comprovado. */
export const paginaAnalyticsSchema = z.looseObject({
  data: z.array(bucketSchema).max(10_000), currentPage: inteiro.min(1).max(1_000), size: inteiro.max(10_000),
  totalItems: inteiro, totalPages: inteiro.max(1_000),
});
export type PaginaAnalytics = z.infer<typeof paginaAnalyticsSchema>;
export type BucketAnalytics = PaginaAnalytics['data'][number];

export function lerPaginaAnalytics(resposta: unknown, paginaSolicitada: number): PaginaAnalytics {
  exigir(Number.isSafeInteger(paginaSolicitada) && paginaSolicitada >= 1 && paginaSolicitada <= 1_000, 'PARAMETROS', 'Página solicitada inválida.');
  const lida = paginaAnalyticsSchema.safeParse(resposta);
  exigir(lida.success, 'ESQUEMA', 'Resposta agrupada do Analytics fora do contrato.');
  const p = lida.data;
  exigir(p.error === undefined || p.error === null || p.error === false, 'ESQUEMA', 'O corpo do Analytics informa erro.');
  exigir(p.currentPage === paginaSolicitada, 'PAGINACAO', 'O Analytics devolveu outra página.');
  if (p.totalItems === 0 || p.totalPages === 0 || p.size === 0 || p.data.length === 0) {
    exigir(p.currentPage === 1 && p.totalItems === 0 && p.totalPages === 0 && p.data.length === 0,
      'PAGINACAO', 'Vazio inconsistente: ausência de resposta não equivale a zero.');
  } else {
    exigir(p.currentPage <= p.totalPages && p.data.length <= p.size && p.data.length <= p.totalItems,
      'PAGINACAO', 'Quantidade ou índice incompatível com a página do Analytics.');
  }
  return p;
}

export interface IdentidadeAnalytics {
  ambiente: 'TEST' | 'PRODUCAO';
  merchantId: string;
  dia: string;
  perfil: 'diario' | 'homologacao';
}
/** O chamador vincula este recibo à requisição efetivamente enviada, nunca a parâmetros recebidos do parceiro. */
export interface PaginaRecebidaAnalytics {
  identidade: IdentidadeAnalytics;
  paginaSolicitada: number;
  resposta: unknown;
}
export interface ConjuntoAnalytics {
  estado: 'incompleto' | 'completo' | 'vazio-oficial';
  identidade: IdentidadeAnalytics;
  paginasLidas: number;
  paginasEsperadas: number | null;
  itensLidos: number;
  totalItens: number | null;
  paginas: PaginaAnalytics[];
}
function identidadeValida(i: IdentidadeAnalytics) {
  exigir(i && ['TEST', 'PRODUCAO'].includes(i.ambiente) && ['diario', 'homologacao'].includes(i.perfil)
    && typeof i.merchantId === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(i.merchantId)
    && diaSeguinte(i.dia), 'IDENTIDADE', 'Identidade da consulta do Analytics inválida.');
  return JSON.stringify([i.ambiente, i.merchantId, i.dia, i.perfil]);
}
function chaveDoGrupo(b: BucketAnalytics): string {
  return JSON.stringify(Object.keys(b.groupByKey.value).sort().map((k) => [k, b.groupByKey.value[k]]));
}

/** Valida um prefixo sequencial. Um conjunto parcial pode ser diagnosticado, nunca normalizado como dia completo. */
export function conferirPaginasAnalytics(esperada: IdentidadeAnalytics, recebidas: readonly PaginaRecebidaAnalytics[]): ConjuntoAnalytics {
  const chave = identidadeValida(esperada);
  exigir(Array.isArray(recebidas) && recebidas.length <= 1_000, 'PAGINACAO', 'Quantidade de páginas fora do limite local.');
  const paginas: PaginaAnalytics[] = [];
  const indices = new Set<number>();
  const grupos = new Set<string>();
  let itensLidos = 0;
  for (const r of recebidas) {
    exigir(r && identidadeValida(r.identidade) === chave, 'IDENTIDADE', 'Não misture ambiente, loja, data ou consulta entre páginas.');
    exigir(!indices.has(r.paginaSolicitada), 'PAGINA_REPETIDA', 'Página repetida: a cobertura não avançou.');
    exigir(r.paginaSolicitada === paginas.length + 1, 'PAGINACAO', 'As páginas precisam formar uma sequência desde a primeira.');
    const p = lerPaginaAnalytics(r.resposta, r.paginaSolicitada);
    const primeira = paginas[0] ?? p;
    exigir(p.totalItems === primeira.totalItems && p.totalPages === primeira.totalPages, 'PAGINACAO', 'Os totais mudaram durante a leitura.');
    if (p.totalPages > 0) {
      exigir(Math.ceil(primeira.totalItems / primeira.size) === primeira.totalPages, 'PAGINACAO', 'Os totais declarados não fecham a paginação.');
      const esperados = p.currentPage < p.totalPages ? primeira.size : p.totalItems - primeira.size * (p.totalPages - 1);
      exigir(p.data.length === esperados && p.size <= primeira.size && (p.currentPage === p.totalPages || p.size === primeira.size),
        'PAGINACAO', 'Página truncada ou tamanho alterado durante a leitura.');
    }
    for (const b of p.data) {
      const grupo = chaveDoGrupo(b);
      exigir(!grupos.has(grupo), 'GRUPO_REPETIDO', 'Grupo repetido: a mesma parcela não pode ser contada duas vezes.');
      grupos.add(grupo);
    }
    indices.add(r.paginaSolicitada);
    paginas.push(p);
    itensLidos += p.data.length;
  }
  const primeira = paginas[0];
  const completo = primeira && paginas.length === primeira.totalPages && itensLidos === primeira.totalItems;
  return {
    estado: primeira?.totalItems === 0 ? 'vazio-oficial' : completo ? 'completo' : 'incompleto',
    identidade: { ...esperada }, paginasLidas: paginas.length, paginasEsperadas: primeira?.totalPages ?? null,
    itensLidos, totalItens: primeira?.totalItems ?? null, paginas,
  };
}

export function conferirConsultaDiaria(p: PaginaAnalytics): { compativel: boolean; problemas: string[] } {
  const problemas = new Set<string>();
  for (const b of p.data) {
    const dims = b.groupByKey.value;
    if (Object.keys(dims).length !== DIMENSOES_DIARIAS.length || !DIMENSOES_DIARIAS.every((k) => Object.hasOwn(dims, k))) problemas.add('Dimensões diferentes das quatro solicitadas para o dia.');
    if (!DIMENSOES_DIARIAS.every((k) => dims[k] === null || typeof dims[k] === 'string')) problemas.add('Tipo de dimensão diária incompatível.');
    for (const k of METRICAS_DIARIAS) {
      if (!Object.hasOwn(b, k) || (b[k] !== null && (!b[k] || !Object.hasOwn(b[k], 'sum')))) problemas.add(`Soma solicitada ausente: ${k}.`);
    }
  }
  return { compativel: problemas.size === 0, problemas: [...problemas] };
}

/** Sem default: moeda/escala são declaradas pelo contrato da fonte, nunca adivinhadas pelo tamanho do número. */
export interface UnidadeMonetariaAnalytics { moeda: 'BRL'; unidade: 'REAL' | 'CENTAVO' }
function unidadeValida(u: UnidadeMonetariaAnalytics) {
  exigir(u && u.moeda === 'BRL' && ['REAL', 'CENTAVO'].includes(u.unidade), 'UNIDADE_MONETARIA', 'Declare a moeda e a unidade do valor de origem.');
}
export function valorAnalyticsEmCentavos(valor: unknown, unidade: UnidadeMonetariaAnalytics): number | null {
  unidadeValida(unidade);
  if (valor === null) return null;
  exigir(typeof valor === 'number' && Number.isFinite(valor), 'PRECISAO_MONETARIA', 'Valor monetário ausente ou inválido.');
  if (unidade.unidade === 'CENTAVO') {
    exigir(Number.isSafeInteger(valor), 'PRECISAO_MONETARIA', 'Centavos precisam ser um inteiro seguro.');
    return valor === 0 ? 0 : valor;
  }
  // JSON.parse já usa Number: não conseguimos recuperar centavos que se perderam na leitura.
  // Abaixo de 2^45, o espaçamento entre números é menor que meio centavo. Acima, recusar.
  exigir(Math.abs(valor) < 2 ** 45, 'LIMITE_NUMERICO', 'Valor em reais exige precisão decimal maior que a disponível no transporte.');
  // Converter a representação decimal com BigInt. Nunca Math.round(valor * 100).
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(valor))!;
  const casas = (m[3]?.length ?? 0) - Number(m[4] ?? 0);
  let inteiroDecimal = BigInt(m[2] + (m[3] ?? ''));
  if (casas > 2) {
    const divisor = 10n ** BigInt(casas - 2);
    exigir(inteiroDecimal % divisor === 0n, 'PRECISAO_MONETARIA', 'Subcentavos exigem regra explícita; nenhum arredondamento foi aplicado.');
    inteiroDecimal /= divisor;
  } else inteiroDecimal *= 10n ** BigInt(2 - casas);
  if (m[1]) inteiroDecimal = -inteiroDecimal;
  exigir(inteiroDecimal <= BigInt(Number.MAX_SAFE_INTEGER) && inteiroDecimal >= BigInt(Number.MIN_SAFE_INTEGER), 'LIMITE_NUMERICO', 'Valor monetário fora da faixa segura.');
  return Number(inteiroDecimal);
}
export function somarCentavosAnalytics(valores: readonly (number | null)[]): number | null {
  let total = 0n;
  let falta = false;
  for (const v of valores) {
    if (v === null) { falta = true; continue; }
    exigir(Number.isSafeInteger(v), 'LIMITE_NUMERICO', 'A soma exige centavos inteiros seguros.');
    total += BigInt(v);
  }
  exigir(total <= BigInt(Number.MAX_SAFE_INTEGER) && total >= BigInt(Number.MIN_SAFE_INTEGER), 'LIMITE_NUMERICO', 'Soma fora da faixa segura.');
  return falta ? null : Number(total);
}

export interface LinhaDiariaAnalytics {
  dimensoes: Record<DimensaoDiaria, string | null>;
  pedidos: number;
  centavos: Record<MetricaDiaria, number | null>;
}
/** Revalida recibos; não aceita um objeto ConjuntoAnalytics forjado pelo chamador. Não publica nem converte TEST em produção. */
export function normalizarDiaAnalytics(esperada: IdentidadeAnalytics, recebidas: readonly PaginaRecebidaAnalytics[], unidade: UnidadeMonetariaAnalytics) {
  unidadeValida(unidade);
  exigir(esperada && esperada.perfil === 'diario', 'CONSULTA_INCOMPATIVEL', 'A massa de homologação não é a consulta diária.');
  const conjunto = conferirPaginasAnalytics(esperada, recebidas);
  exigir(conjunto.estado !== 'incompleto', 'INCOMPLETO', 'Faltam páginas: nenhum snapshot diário foi produzido.');
  const linhas: LinhaDiariaAnalytics[] = [];
  let pedidos = 0n;
  for (const p of conjunto.paginas) {
    exigir(conferirConsultaDiaria(p).compativel, 'CONSULTA_INCOMPATIVEL', 'A resposta não corresponde às dimensões e métricas diárias solicitadas.');
    for (const b of p.data) {
      const dimensoes = Object.fromEntries(DIMENSOES_DIARIAS.map((k) => [k, b.groupByKey.value[k]])) as LinhaDiariaAnalytics['dimensoes'];
      const centavos = Object.fromEntries(METRICAS_DIARIAS.map((k) => [k, valorAnalyticsEmCentavos(b[k] === null ? null : b[k]!.sum, unidade)])) as LinhaDiariaAnalytics['centavos'];
      linhas.push({ dimensoes, pedidos: b.groupByKey.count, centavos });
      pedidos += BigInt(b.groupByKey.count);
    }
  }
  exigir(pedidos <= BigInt(Number.MAX_SAFE_INTEGER), 'LIMITE_NUMERICO', 'Contagem de pedidos fora da faixa segura.');
  return { identidade: conjunto.identidade, estado: conjunto.estado, linhas, pedidos: Number(pedidos) };
}
