import { decimalFinancialEmCentavos, ErroFinancialSimulado, MAX_CARACTERES_DECIMAL_FINANCIAL } from './financial-dominio';
import { lerJsonFinancialV3, NumeroJsonFinancial } from './financial-v3-json';
import { diaDoPainelValido, UUID_DO_MERCHANT } from './painel-campos';

export interface PedidoPeriodoFinancialV3 { readonly merchantId: string; readonly inicio: string; readonly fim: string }

export type CodigoEnvelopePeriodoV3 = 'PEDIDO' | 'ENVELOPE_AMBIGUO' | 'MERCHANT_DIVERGENTE' | 'PERIODO_DIVERGENTE'
  | 'ESTRUTURA' | 'VALOR_MONETARIO' | 'SUBCENTAVO' | 'LIMITE_LOCAL';
type FalhaPeriodoV3 = new (codigo: CodigoEnvelopePeriodoV3) => Error;

interface EnvelopePeriodoV3 extends PedidoPeriodoFinancialV3 {
  formato: 'OBJETO' | 'ARRAY_UNITARIO';
  saldoCentavos: bigint;
  corpo: Record<string, unknown>;
}

const MAX_EXPOENTE = BigInt(MAX_CARACTERES_DECIMAL_FINANCIAL);
const MAX_DIGITOS_CENTAVOS = BigInt(MAX_CARACTERES_DECIMAL_FINANCIAL + 2);

export function objetoPeriodoFinancialV3(valor: unknown, Erro: FalhaPeriodoV3): Record<string, unknown> {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor) || valor instanceof NumeroJsonFinancial)
    throw new Erro('ESTRUTURA');
  return valor as Record<string, unknown>;
}

/** Tokens numéricos já passaram pela gramática do JSON. A escala inclui a conversão de unidade para centavos. */
function centavosComExpoente(literal: string, Erro: FalhaPeriodoV3): bigint {
  const [mantissa, expoenteTexto] = literal.split(/[eE]/);
  const expoente = BigInt(expoenteTexto);
  if (expoente < -MAX_EXPOENTE || expoente > MAX_EXPOENTE) throw new Erro('LIMITE_LOCAL');
  const [inteiro, fracao = ''] = mantissa.split('.');
  const coeficiente = BigInt(inteiro + fracao);
  if (coeficiente === 0n) return 0n;
  const escala = expoente - BigInt(fracao.length) + 2n;
  const magnitude = coeficiente < 0n ? -coeficiente : coeficiente;
  const digitosCentavos = BigInt(magnitude.toString().length) + escala;
  if (digitosCentavos > MAX_DIGITOS_CENTAVOS) throw new Erro('LIMITE_LOCAL');
  if (digitosCentavos <= 0n) throw new Erro('SUBCENTAVO');
  if (escala >= 0n) return coeficiente * 10n ** escala;
  const divisor = 10n ** -escala;
  if (coeficiente % divisor !== 0n) throw new Erro('SUBCENTAVO');
  return coeficiente / divisor;
}

export function centavosNumeroFinancialV3(valor: unknown, Erro: FalhaPeriodoV3): bigint {
  if (!(valor instanceof NumeroJsonFinancial)) throw new Erro('VALOR_MONETARIO');
  if (valor.literal.length > MAX_CARACTERES_DECIMAL_FINANCIAL) throw new Erro('LIMITE_LOCAL');
  if (/[eE]/.test(valor.literal)) return centavosComExpoente(valor.literal, Erro);
  try {
    return decimalFinancialEmCentavos(valor.literal);
  } catch (e) {
    if (e instanceof ErroFinancialSimulado && (e.codigo === 'SUBCENTAVO' || e.codigo === 'LIMITE_LOCAL'))
      throw new Erro(e.codigo);
    throw new Erro('VALOR_MONETARIO');
  }
}

/** O schema do recurso usa objeto e seu exemplo usa lista unitária. Ambos devem identificar a mesma consulta. */
export function lerEnvelopePeriodoFinancialV3(textoJson: string, pedido: PedidoPeriodoFinancialV3, Erro: FalhaPeriodoV3): EnvelopePeriodoV3 {
  if (!pedido || typeof pedido.merchantId !== 'string' || !UUID_DO_MERCHANT.test(pedido.merchantId.toLowerCase())
    || !diaDoPainelValido(pedido.inicio) || !diaDoPainelValido(pedido.fim) || pedido.inicio > pedido.fim) throw new Erro('PEDIDO');
  const resposta = lerJsonFinancialV3(textoJson);
  if (Array.isArray(resposta) && resposta.length !== 1) throw new Erro('ENVELOPE_AMBIGUO');
  const corpo = objetoPeriodoFinancialV3(Array.isArray(resposta) ? resposta[0] : resposta, Erro);
  const merchantId = pedido.merchantId.toLowerCase();
  if (typeof corpo.merchantId !== 'string' || !UUID_DO_MERCHANT.test(corpo.merchantId.toLowerCase())
    || !diaDoPainelValido(corpo.beginDate) || !diaDoPainelValido(corpo.endDate)) throw new Erro('ESTRUTURA');
  if (corpo.merchantId.toLowerCase() !== merchantId) throw new Erro('MERCHANT_DIVERGENTE');
  if (corpo.beginDate !== pedido.inicio || corpo.endDate !== pedido.fim) throw new Erro('PERIODO_DIVERGENTE');
  return {
    merchantId, inicio: corpo.beginDate, fim: corpo.endDate, formato: Array.isArray(resposta) ? 'ARRAY_UNITARIO' : 'OBJETO',
    saldoCentavos: centavosNumeroFinancialV3(corpo.balance, Erro), corpo,
  };
}
