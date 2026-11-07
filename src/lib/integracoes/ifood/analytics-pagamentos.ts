/** INT-1.8C: contrato marginal documental. Sem transporte, banco ou inferência de pedidos únicos. */
import { ErroContratoAnalytics } from './analytics';
import { diaSeguinte } from './datas';

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

/** JSON.parse não detecta chaves repetidas. Após validar a sintaxe, este percurso conserva cada chave textual. */
function conferirChavesDoJson(raw: string): void {
  let p = 0, nos = 0;
  const espacos = () => { while (/\s/.test(raw[p] ?? '') && p < raw.length) p++; };
  const texto = () => {
    const inicio = p++;
    while (p < raw.length) { if (raw[p] === '\\') p += 2; else if (raw[p++] === '"') break; }
    return JSON.parse(raw.slice(inicio, p)) as string;
  };
  const numeroExato = (literal: string) => {
    // Todos os números do contrato v1 são inteiros. Provar isso ANTES de aceitar o arredondamento de JSON.parse.
    exigir(literal.length <= 128, 'Representação numérica fora do limite local.');
    const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(literal);
    exigir(m, 'Número marginal inválido.');
    const expoente = Number(m[4] ?? 0), escala = (m[3]?.length ?? 0) - expoente;
    exigir(Number.isSafeInteger(expoente) && Math.abs(escala) <= 256, 'Representação numérica fora do limite local.');
    let n = BigInt(m[2] + (m[3] ?? ''));
    if (escala > 0) { const divisor = 10n ** BigInt(escala); exigir(n % divisor === 0n, 'Contagem fracionária no corpo original.'); n /= divisor; }
    else n *= 10n ** BigInt(-escala);
    if (m[1]) n = -n;
    exigir(n >= BigInt(Number.MIN_SAFE_INTEGER) && n <= BigInt(Number.MAX_SAFE_INTEGER)
      && BigInt(Number(literal)) === n, 'Contagem sem representação inteira exata.');
  };
  const valor = (nivel: number): void => {
    exigir(nivel <= 32 && ++nos <= 250_000, 'Resposta marginal excede os limites estruturais.'); espacos();
    if (raw[p] === '{') {
      p++; espacos(); const chaves = new Set<string>();
      if (raw[p] === '}') { p++; return; }
      while (p < raw.length) {
        espacos(); const chave = texto();
        exigir(!chaves.has(chave) && unicodeValido(chave), 'Chave JSON repetida ou inválida.'); chaves.add(chave);
        espacos(); p++; valor(nivel + 1); espacos(); if (raw[p++] === '}') return;
      }
    } else if (raw[p] === '[') {
      p++; espacos(); if (raw[p] === ']') { p++; return; }
      while (p < raw.length) { valor(nivel + 1); espacos(); if (raw[p++] === ']') return; }
    } else if (raw[p] === '"') exigir(unicodeValido(texto()), 'Texto JSON inválido.');
    else {
      const inicio = p; while (p < raw.length && !/[\s,\]}]/.test(raw[p])) p++;
      const literal = raw.slice(inicio, p); if (/^-?\d/.test(literal)) numeroExato(literal);
    }
  };
  valor(0);
}

export function normalizarPagamentosAnalytics(esperada: IdentidadePagamentos, recibos: readonly ReciboPagamentos[]): PagamentosNormalizados {
  conferirIdentidadePagamentos(esperada);
  exigir(Array.isArray(recibos) && recibos.length === 1, 'A consulta marginal v1 exige exatamente uma página completa.');
  const r = recibos[0]; conferirIdentidadePagamentos(r.identidade);
  exigir(r.paginaSolicitada === 1 && r.versaoContrato === 1
    && (['ambiente', 'merchantId', 'dia', 'fuso', 'perfil', 'versaoContrato'] as const).every(k => r.identidade[k] === esperada[k]), 'O recibo não corresponde à consulta marginal.');
  exigir(typeof r.corpoOriginal === 'string' && bytes(r.corpoOriginal) <= MAX_BYTES_PAGAMENTOS, 'Corpo marginal fora dos limites.');
  let corpo: unknown;
  try { corpo = JSON.parse(r.corpoOriginal); } catch { throw new ErroContratoAnalytics('ESQUEMA', 'Corpo marginal não é JSON válido.'); }
  conferirChavesDoJson(r.corpoOriginal);
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
