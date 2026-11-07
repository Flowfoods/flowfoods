/** INT-1.8D: termos marginais independentes. Não inferem pessoas únicas, fuso dos buckets ou cruzamentos. */
import { ErroContratoAnalytics } from './analytics';
import { diaSeguinte } from './datas';
import { lerJsonMarginalExato } from './json-marginal-exato';

export const VERSAO_CONTRATO_COMPLEMENTARES = 1 as const;
export const MAX_TERMOS_COMPLEMENTARES = 2_000;
export const MAX_BYTES_TERMO_COMPLEMENTAR = 800;
export interface IdentidadeComplementares {
  ambiente: 'TEST' | 'PRODUCAO'; merchantId: string; dia: string; fuso: string; perfil: 'complementares'; versaoContrato: 1;
}
export interface TermoComplementar { termo: string; ocorrencias: string }
export interface ComplementaresNormalizadas {
  versaoContrato: 1; horarios: TermoComplementar[] | null; primeirosPedidos: TermoComplementar[] | null;
}
export interface ReciboComplementares { identidade: IdentidadeComplementares; paginaSolicitada: number; versaoContrato: 1; corpoOriginal: string }
function exigir(ok: unknown, mensagem: string): asserts ok {
  if (!ok) throw new ErroContratoAnalytics('CONSULTA_INCOMPATIVEL', mensagem);
}
const objeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const bytes = (s: string) => new TextEncoder().encode(s).length;
const unicodeValido = (s: string) => !/\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(s);

export function conferirIdentidadeComplementares(i: IdentidadeComplementares): void {
  exigir(i && ['TEST', 'PRODUCAO'].includes(i.ambiente) && i.perfil === 'complementares' && i.versaoContrato === 1
    && typeof i.merchantId === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(i.merchantId)
    && typeof i.dia === 'string' && i.dia >= '0001-01-01' && diaSeguinte(i.dia), 'Identidade das distribuições inválida.');
  exigir(typeof i.fuso === 'string' && i.fuso.length > 0 && i.fuso.length <= 80, 'Fuso marginal inválido.');
  try { new Intl.DateTimeFormat('en-US', { timeZone: i.fuso }).format(); }
  catch { throw new ErroContratoAnalytics('IDENTIDADE', 'Fuso marginal inválido.'); }
}
export function consultaComplementares(dia: string) {
  const fim = diaSeguinte(dia);
  exigir(dia >= '0001-01-01' && fim, 'Dia inválido para as distribuições.');
  return { page: 1, size: 1, filter: { referenceDate: { gte: dia, lt: fim } },
    agg: { terms: { orderCreationHour: ['count'], customerFirstOrderInMerchant: ['count'] } } };
}
function termos(agregado: unknown): TermoComplementar[] | null {
  if (agregado === null) return null;
  exigir(objeto(agregado) && objeto(agregado.value) && Object.keys(agregado).every(k => k === 'value' || k === 'cardinality'), 'Distribuição fora do contrato.');
  if (Object.hasOwn(agregado, 'cardinality')) exigir(agregado.cardinality === null
    || (Number.isSafeInteger(agregado.cardinality) && Number(agregado.cardinality) >= 0), 'Cardinalidade marginal inválida.');
  const entradas = Object.entries(agregado.value);
  exigir(entradas.length <= MAX_TERMOS_COMPLEMENTARES, 'Quantidade de termos fora do limite local.');
  return entradas.map(([termo, valor]) => {
    exigir(bytes(termo) > 0 && bytes(termo) <= MAX_BYTES_TERMO_COMPLEMENTAR && unicodeValido(termo), 'Termo fora do limite local.');
    exigir(typeof valor === 'number' && Number.isSafeInteger(valor) && valor >= 0, 'Contagem marginal ausente ou inválida.');
    return { termo, ocorrencias: BigInt(valor).toString() };
  }).sort((a, b) => a.termo < b.termo ? -1 : a.termo > b.termo ? 1 : 0);
}
export function normalizarComplementaresAnalytics(esperada: IdentidadeComplementares, recibos: readonly ReciboComplementares[]): ComplementaresNormalizadas {
  conferirIdentidadeComplementares(esperada);
  exigir(Array.isArray(recibos) && recibos.length === 1, 'A consulta complementar v1 exige exatamente uma página completa.');
  const r = recibos[0]; conferirIdentidadeComplementares(r.identidade);
  exigir(r.paginaSolicitada === 1 && r.versaoContrato === 1
    && (['ambiente', 'merchantId', 'dia', 'fuso', 'perfil', 'versaoContrato'] as const).every(k => r.identidade[k] === esperada[k]), 'O recibo não corresponde à consulta complementar.');
  const corpo = lerJsonMarginalExato(r.corpoOriginal);
  exigir(objeto(corpo) && (corpo.error === undefined || corpo.error === null || corpo.error === false), 'A resposta marginal informa erro.');
  exigir(corpo.currentPage === 1 && corpo.size === 1 && corpo.totalItems === 1 && corpo.totalPages === 1
    && Array.isArray(corpo.data) && corpo.data.length === 1 && objeto(corpo.data[0]), 'Envelope marginal incompleto ou incompatível.');
  const item = corpo.data[0];
  exigir(Object.keys(item).length === 2 && Object.hasOwn(item, 'orderCreationHour') && Object.hasOwn(item, 'customerFirstOrderInMerchant'), 'O item não corresponde às duas distribuições solicitadas.');
  return { versaoContrato: 1, horarios: termos(item.orderCreationHour), primeirosPedidos: termos(item.customerFirstOrderInMerchant) };
}
