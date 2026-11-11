import { lerIdDaLojaIfood } from '../core/campos';
import { diaDoPainelValido } from './painel-campos';
import { decimalFinancialEmCentavos, ErroFinancialSimulado, MAX_CARACTERES_DECIMAL_FINANCIAL } from './financial-dominio';
import { lerJsonFinancialV3, NumeroJsonFinancial } from './financial-v3-json';

/** Limite local de leitura em memória. A API define seus próprios tamanhos de página. */
const MAX_EVENTOS_POR_PAGINA_LOCAL = 10_000;
/** Teto de retenção de cada texto projetado, em unidades UTF-16. */
const MAX_TEXTO_LOCAL = 256;

export interface EventoV3 {
  /** Preserva o conflito de escopo sem devolver o identificador do recebedor. */
  readonly recebedorForaDaLoja?: true;
  readonly nome: string | null;
  readonly gatilho: string | null;
  readonly produto: string | null;
  readonly competencia: string | null;
  readonly periodo: { readonly inicio: string | null; readonly fim: string | null } | null;
  readonly impactoNoRepasse: boolean | null;
  readonly valorCentavos: bigint | null;
  readonly cobranca?: { readonly baseCentavos: bigint | null; readonly percentual: string | null };
}

export interface PaginaEventosV3 {
  readonly formato: 'OBJETO' | 'ARRAY_UNITARIO';
  readonly page: number;
  readonly size: number;
  readonly hasNextPage: boolean;
  readonly eventos: readonly EventoV3[];
}

type CodigoErro = 'PEDIDO_INVALIDO' | 'JSON_INVALIDO' | 'PAGINA_INVALIDA' | 'PAGINACAO_DIVERGENTE'
  | 'EVENTO_INVALIDO' | 'VALOR_INVALIDO' | 'SUBCENTAVO' | 'LIMITE_LOCAL';

export class ErroEventosV3 extends Error {
  constructor(readonly codigo: CodigoErro) {
    super('Página de eventos Financial v3 incompatível com a leitura solicitada.');
    this.name = 'ErroEventosV3';
  }
}

function objeto(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor) && !(valor instanceof NumeroJsonFinancial);
}

function textoOpcional(valor: unknown): string | null {
  if (valor == null) return null;
  if (typeof valor !== 'string') throw new ErroEventosV3('EVENTO_INVALIDO');
  if (valor.length > MAX_TEXTO_LOCAL) throw new ErroEventosV3('LIMITE_LOCAL');
  return valor;
}

function lerDataCivil(valor: unknown): string | null {
  const data = textoOpcional(valor);
  if (data !== null && !diaDoPainelValido(data)) throw new ErroEventosV3('EVENTO_INVALIDO');
  return data;
}

function lerPeriodo(valor: unknown): EventoV3['periodo'] {
  if (valor == null) return null;
  if (!objeto(valor)) throw new ErroEventosV3('EVENTO_INVALIDO');
  const inicio = lerDataCivil(valor.beginDate);
  const fim = lerDataCivil(valor.endDate);
  if (inicio !== null && fim !== null && inicio > fim) throw new ErroEventosV3('EVENTO_INVALIDO');
  return { inicio, fim };
}

function lerValor(valor: unknown): bigint | null {
  if (valor == null) return null;
  if (!objeto(valor)) throw new ErroEventosV3('EVENTO_INVALIDO');
  if (valor.value == null) return null;
  try {
    return decimalFinancialEmCentavos(valor.value);
  } catch (erro) {
    if (erro instanceof ErroFinancialSimulado && (erro.codigo === 'SUBCENTAVO' || erro.codigo === 'LIMITE_LOCAL')) {
      throw new ErroEventosV3(erro.codigo);
    }
    throw new ErroEventosV3('VALOR_INVALIDO');
  }
}

function lerCobranca(nome: string | null, billing: unknown): EventoV3['cobranca'] {
  if (!objeto(billing)) return undefined;
  if (nome !== 'ORDER_COMMISSION' && nome !== 'PAYMENT_TRANSACTION_FEE' && billing.feePercentage == null) return undefined;
  let baseCentavos: bigint | null = null;
  try {
    if (billing.baseValue != null) baseCentavos = decimalFinancialEmCentavos(billing.baseValue);
  } catch (erro) {
    // Uma base ilegível impede comparar a taxa. O valor do evento continua disponível para conciliar o repasse.
    if (!(erro instanceof ErroFinancialSimulado)) throw erro;
  }
  const taxa = billing.feePercentage;
  const percentual = typeof taxa === 'string' && taxa.length <= MAX_CARACTERES_DECIMAL_FINANCIAL
    && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(taxa) ? taxa : null;
  return { baseCentavos, percentual };
}

function lerEvento(valor: unknown, merchantId?: string): EventoV3 {
  if (!objeto(valor)) throw new ErroEventosV3('EVENTO_INVALIDO');
  const competencia = textoOpcional(valor.competence);
  if (competencia !== null && !/^(?!0000)\d{4}-(?:0[1-9]|1[0-2])$/.test(competencia)) throw new ErroEventosV3('EVENTO_INVALIDO');
  const impacto = valor.hasTransferImpact;
  if (impacto != null && typeof impacto !== 'boolean') throw new ErroEventosV3('EVENTO_INVALIDO');
  const recebedor = valor.receiver;
  if (merchantId && recebedor != null && !objeto(recebedor)) throw new ErroEventosV3('EVENTO_INVALIDO');
  const idRecebedor = objeto(recebedor) ? recebedor.merchantId : null;
  const nome = textoOpcional(valor.name);
  const cobranca = lerCobranca(nome, valor.billing);
  return {
    ...(cobranca && { cobranca }),
    ...(merchantId && idRecebedor != null && lerIdDaLojaIfood(idRecebedor) !== merchantId ? { recebedorForaDaLoja: true } : {}),
    nome, gatilho: textoOpcional(valor.trigger), produto: textoOpcional(valor.product),
    competencia, periodo: lerPeriodo(valor.period), impactoNoRepasse: impacto ?? null, valorCentavos: lerValor(valor.amount),
  };
}

function inteiroPositivo(valor: unknown): number {
  if (!(valor instanceof NumeroJsonFinancial)) throw new ErroEventosV3('PAGINA_INVALIDA');
  const literal = valor.literal;
  if (literal.length > 128) throw new ErroEventosV3('LIMITE_LOCAL');
  const numero = Number(literal);
  if (!Number.isSafeInteger(numero) || numero < 1) throw new ErroEventosV3('PAGINA_INVALIDA');
  // O token original pode ser uma fração arredondada para um inteiro por Number.
  // Compare dígitos e potência decimal sem elevar à potência de um expoente externo.
  const [mantissa, expoente = '0'] = literal.toLowerCase().split('e');
  const [inteira, fracao = ''] = mantissa.split('.');
  const digitos = (inteira + fracao).replace(/^0+/, '');
  const significativos = digitos.replace(/0+$/, '');
  const potencia = Number(expoente) - fracao.length + digitos.length - significativos.length;
  const esperado = String(numero);
  if (esperado.replace(/0+$/, '') !== significativos || esperado.length - significativos.length !== potencia) {
    throw new ErroEventosV3('PAGINA_INVALIDA');
  }
  return numero;
}

/** Lê uma resposta 200. A conclusão da apuração depende de evidência fora desta página. */
export function lerPaginaEventosV3(textoJson: string, pedido: { page: number; size: number; merchantId?: string }): PaginaEventosV3 {
  if (!pedido || !Number.isSafeInteger(pedido.page) || pedido.page < 1 || !Number.isSafeInteger(pedido.size) || pedido.size < 1) {
    throw new ErroEventosV3('PEDIDO_INVALIDO');
  }
  const loja = lerIdDaLojaIfood(pedido.merchantId);
  if (pedido.merchantId !== undefined && !loja) throw new ErroEventosV3('PEDIDO_INVALIDO');
  let corpo: unknown;
  try { corpo = lerJsonFinancialV3(textoJson); } catch { throw new ErroEventosV3('JSON_INVALIDO'); }
  let pagina = corpo;
  let formato: PaginaEventosV3['formato'] = 'OBJETO';
  if (Array.isArray(corpo)) {
    if (corpo.length !== 1) throw new ErroEventosV3('PAGINA_INVALIDA');
    formato = 'ARRAY_UNITARIO';
    pagina = corpo[0];
  }
  if (!objeto(pagina) || typeof pagina.hasNextPage !== 'boolean' || !Array.isArray(pagina.financialEvents)) {
    throw new ErroEventosV3('PAGINA_INVALIDA');
  }
  const page = inteiroPositivo(pagina.page);
  const size = inteiroPositivo(pagina.size);
  if (page !== pedido.page || size !== pedido.size) throw new ErroEventosV3('PAGINACAO_DIVERGENTE');
  if (pagina.financialEvents.length > MAX_EVENTOS_POR_PAGINA_LOCAL) throw new ErroEventosV3('LIMITE_LOCAL');
  if (pagina.financialEvents.length > size) throw new ErroEventosV3('PAGINA_INVALIDA');
  return { formato, page, size, hasNextPage: pagina.hasNextPage, eventos: pagina.financialEvents.map(e => lerEvento(e, loja ?? undefined)) };
}
