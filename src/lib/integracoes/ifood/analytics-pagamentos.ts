/** INT-1.8C: contrato marginal documental. Sem transporte, banco ou inferência de pedidos únicos. */
import { ErroContratoAnalytics } from './analytics';
import { diaSeguinte } from './datas';
import { lerJsonMarginalExato } from './json-marginal-exato';

export const VERSAO_CONTRATO_PAGAMENTOS = 1 as const;
export const MAX_METODOS_PAGAMENTO = 2_000;
export const MAX_BYTES_METODO_PAGAMENTO = 800;
export const MAX_BYTES_PAGAMENTOS = 2 * 1024 * 1024;
export interface IdentidadePagamentos {
  ambiente: 'TEST' | 'PRODUCAO'; merchantId: string; dia: string; fuso: string; perfil: 'pagamentos'; versaoContrato: 1;
}
export interface ParcelaDePagamento { metodo: string; ocorrencias: string }
export interface PagamentosNormalizados { versaoContrato: 1; parcelas: ParcelaDePagamento[] | null }
export interface ReciboPagamentos { identidade: IdentidadePagamentos; paginaSolicitada: number; versaoContrato: 1; corpoOriginal: string }
function exigir(ok: unknown, mensagem: string): asserts ok {
  if (!ok) throw new ErroContratoAnalytics('CONSULTA_INCOMPATIVEL', mensagem);
}
const objeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const bytes = (s: string) => new TextEncoder().encode(s).length;
const unicodeValido = (s: string) => !/\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(s);

export function conferirIdentidadePagamentos(i: IdentidadePagamentos): void {
  exigir(i && ['TEST', 'PRODUCAO'].includes(i.ambiente) && i.perfil === 'pagamentos' && i.versaoContrato === 1
    && typeof i.merchantId === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(i.merchantId)
    && typeof i.dia === 'string' && i.dia >= '0001-01-01' && diaSeguinte(i.dia), 'Identidade da distribuição de pagamentos inválida.');
  exigir(typeof i.fuso === 'string' && i.fuso.length > 0 && i.fuso.length <= 80, 'Fuso marginal inválido.');
  try { new Intl.DateTimeFormat('en-US', { timeZone: i.fuso }).format(); }
  catch { throw new ErroContratoAnalytics('IDENTIDADE', 'Fuso marginal inválido.'); }
}
export function consultaPagamentos(dia: string) {
  const fim = diaSeguinte(dia);
  exigir(dia >= '0001-01-01' && fim, 'Dia inválido para a distribuição de pagamentos.');
  return { page: 1, size: 1, filter: { referenceDate: { gte: dia, lt: fim } }, agg: { terms: { paymentMethod: ['count'] } } };
}

export function normalizarPagamentosAnalytics(esperada: IdentidadePagamentos, recibos: readonly ReciboPagamentos[]): PagamentosNormalizados {
  conferirIdentidadePagamentos(esperada);
  exigir(Array.isArray(recibos) && recibos.length === 1, 'A consulta marginal v1 exige exatamente uma página completa.');
  const r = recibos[0]; conferirIdentidadePagamentos(r.identidade);
  exigir(r.paginaSolicitada === 1 && r.versaoContrato === 1
    && (['ambiente', 'merchantId', 'dia', 'fuso', 'perfil', 'versaoContrato'] as const).every(k => r.identidade[k] === esperada[k]), 'O recibo não corresponde à consulta marginal.');
  exigir(typeof r.corpoOriginal === 'string' && bytes(r.corpoOriginal) <= MAX_BYTES_PAGAMENTOS, 'Corpo marginal fora dos limites.');
  const corpo = lerJsonMarginalExato(r.corpoOriginal);
  exigir(objeto(corpo) && (corpo.error === undefined || corpo.error === null || corpo.error === false), 'A resposta marginal informa erro.');
  exigir(corpo.currentPage === 1 && corpo.size === 1 && corpo.totalItems === 1 && corpo.totalPages === 1
    && Array.isArray(corpo.data) && corpo.data.length === 1 && objeto(corpo.data[0]), 'Envelope marginal incompleto ou incompatível.');
  const item = corpo.data[0];
  exigir(Object.keys(item).length === 1 && Object.hasOwn(item, 'paymentMethod'), 'O item não corresponde à distribuição solicitada.');
  if (item.paymentMethod === null) return { versaoContrato: 1, parcelas: null };
  exigir(objeto(item.paymentMethod) && objeto(item.paymentMethod.value)
    && Object.keys(item.paymentMethod).every(k => k === 'value' || k === 'cardinality'), 'Distribuição de pagamentos fora do contrato.');
  if (Object.hasOwn(item.paymentMethod, 'cardinality')) exigir(item.paymentMethod.cardinality === null
    || (Number.isSafeInteger(item.paymentMethod.cardinality) && Number(item.paymentMethod.cardinality) >= 0), 'Cardinalidade marginal inválida.');
  const entradas = Object.entries(item.paymentMethod.value);
  exigir(entradas.length <= MAX_METODOS_PAGAMENTO, 'Quantidade de métodos fora do limite local.');
  const parcelas = entradas.map(([metodo, valor]) => {
    exigir(bytes(metodo) > 0 && bytes(metodo) <= MAX_BYTES_METODO_PAGAMENTO && unicodeValido(metodo), 'Método de pagamento fora do limite local.');
    exigir(typeof valor === 'number' && Number.isSafeInteger(valor) && valor >= 0, 'Contagem marginal ausente ou inválida.');
    return { metodo, ocorrencias: BigInt(valor).toString() };
  }).sort((a, b) => a.metodo < b.metodo ? -1 : a.metodo > b.metodo ? 1 : 0);
  return { versaoContrato: 1, parcelas };
}
