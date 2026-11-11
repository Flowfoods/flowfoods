import { decimalFinancialEmCentavos, ErroFinancialSimulado, MAX_CARACTERES_DECIMAL_FINANCIAL } from './financial-dominio';
import { lerJsonFinancialV3, NumeroJsonFinancial } from './financial-v3-json';
import { diaDoPainelValido, UUID_DO_MERCHANT } from './painel-campos';

export interface PedidoLiquidacoesV3 { merchantId: string; inicio: string; fim: string }

export interface TituloLiquidacaoV3 {
  natureza: 'TITULO';
  tipo: string | null;
  produto: string | null;
  estado: string | null;
  pagamentoEm: string | null;
  valorCentavos: bigint | null;
}

export interface GrupoLiquidacaoV3 {
  natureza: 'GRUPO_APURACAO';
  inicioApuracao: string;
  fimApuracao: string;
  itens: TituloLiquidacaoV3[];
}

export interface LiquidacoesV3 extends PedidoLiquidacoesV3 {
  formato: 'OBJETO' | 'ARRAY_UNITARIO';
  saldoCentavos: bigint;
  consolidacao: 'NAO_INFORMADA' | 'LISTA_VAZIA' | 'SOMENTE_CONSULTADO' | 'OUTROS_MERCHANTS';
  quantidadeMerchantsConsolidados: number | null;
  lancamentos: (TituloLiquidacaoV3 | GrupoLiquidacaoV3)[];
}

type CodigoLiquidacoes = 'PEDIDO' | 'ENVELOPE_AMBIGUO' | 'MERCHANT_DIVERGENTE' | 'PERIODO_DIVERGENTE' | 'ESTRUTURA'
  | 'VALOR_MONETARIO' | 'SUBCENTAVO' | 'LIMITE_LOCAL';
export class ErroLiquidacoesV3 extends Error {
  constructor(readonly codigo: CodigoLiquidacoes) {
    super('Resposta ou pedido de liquidações incompatível com o contrato suportado.');
    this.name = 'ErroLiquidacoesV3';
  }
}

// Orçamentos do leitor local, independentes dos limites e da cobertura do provedor.
const MAX_ITENS = 10_000;
const MAX_TEXTO = 256;
const MAX_EXPOENTE = BigInt(MAX_CARACTERES_DECIMAL_FINANCIAL);
const MAX_DIGITOS_CENTAVOS = BigInt(MAX_CARACTERES_DECIMAL_FINANCIAL + 2);
const CAMPOS_TITULO = ['id', 'type', 'product', 'amount', 'status', 'paymentDate', 'transactionId', 'accountDetails'];
const CAMPOS_GRUPO = ['startDateCalculation', 'endDateCalculation', 'closingItems'];

function objeto(valor: unknown): Record<string, unknown> {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor) || valor instanceof NumeroJsonFinancial)
    throw new ErroLiquidacoesV3('ESTRUTURA');
  return valor as Record<string, unknown>;
}

function texto(valor: unknown): string {
  if (typeof valor !== 'string') throw new ErroLiquidacoesV3('ESTRUTURA');
  if (valor.length > MAX_TEXTO) throw new ErroLiquidacoesV3('LIMITE_LOCAL');
  return valor;
}

/** Tokens numéricos já passaram pela gramática do JSON. A escala inclui a conversão de unidade para centavos. */
function centavosComExpoente(literal: string): bigint {
  const [mantissa, expoenteTexto] = literal.split(/[eE]/);
  const expoente = BigInt(expoenteTexto);
  if (expoente < -MAX_EXPOENTE || expoente > MAX_EXPOENTE) throw new ErroLiquidacoesV3('LIMITE_LOCAL');
  const [inteiro, fracao = ''] = mantissa.split('.');
  const coeficiente = BigInt(inteiro + fracao);
  if (coeficiente === 0n) return 0n;
  const escala = expoente - BigInt(fracao.length) + 2n;
  const magnitude = coeficiente < 0n ? -coeficiente : coeficiente;
  const digitosCentavos = BigInt(magnitude.toString().length) + escala;
  if (digitosCentavos > MAX_DIGITOS_CENTAVOS) throw new ErroLiquidacoesV3('LIMITE_LOCAL');
  if (digitosCentavos <= 0n) throw new ErroLiquidacoesV3('SUBCENTAVO');
  if (escala >= 0n) return coeficiente * 10n ** escala;
  const divisor = 10n ** -escala;
  if (coeficiente % divisor !== 0n) throw new ErroLiquidacoesV3('SUBCENTAVO');
  return coeficiente / divisor;
}

function centavos(valor: unknown): bigint {
  if (!(valor instanceof NumeroJsonFinancial)) throw new ErroLiquidacoesV3('VALOR_MONETARIO');
  if (valor.literal.length > MAX_CARACTERES_DECIMAL_FINANCIAL) throw new ErroLiquidacoesV3('LIMITE_LOCAL');
  if (/[eE]/.test(valor.literal)) return centavosComExpoente(valor.literal);
  try {
    return decimalFinancialEmCentavos(valor.literal);
  } catch (e) {
    if (e instanceof ErroFinancialSimulado && (e.codigo === 'SUBCENTAVO' || e.codigo === 'LIMITE_LOCAL'))
      throw new ErroLiquidacoesV3(e.codigo);
    throw new ErroLiquidacoesV3('VALOR_MONETARIO');
  }
}

function titulo(item: Record<string, unknown>): TituloLiquidacaoV3 {
  if (!CAMPOS_TITULO.some(c => Object.hasOwn(item, c)) || CAMPOS_GRUPO.some(c => Object.hasOwn(item, c)))
    throw new ErroLiquidacoesV3('ESTRUTURA');
  if (item.paymentDate != null && !diaDoPainelValido(item.paymentDate)) throw new ErroLiquidacoesV3('ESTRUTURA');
  // Projeção por campos: dados bancários e identificadores de títulos e transações ficam fora do resultado.
  return {
    natureza: 'TITULO',
    tipo: item.type == null ? null : texto(item.type),
    produto: item.product == null ? null : texto(item.product),
    estado: item.status == null ? null : texto(item.status),
    pagamentoEm: item.paymentDate ?? null,
    valorCentavos: item.amount == null ? null : centavos(item.amount),
  };
}

function lancamentos(settlements: unknown): LiquidacoesV3['lancamentos'] {
  if (!Array.isArray(settlements)) throw new ErroLiquidacoesV3('ESTRUTURA');
  let quantidade = settlements.length;
  if (quantidade > MAX_ITENS) throw new ErroLiquidacoesV3('LIMITE_LOCAL');
  return settlements.map(valor => {
    const item = objeto(valor);
    if (!CAMPOS_GRUPO.some(c => Object.hasOwn(item, c))) return titulo(item);
    if (CAMPOS_TITULO.some(c => Object.hasOwn(item, c)) || !Array.isArray(item.closingItems)
      || !diaDoPainelValido(item.startDateCalculation) || !diaDoPainelValido(item.endDateCalculation)
      || item.startDateCalculation > item.endDateCalculation) throw new ErroLiquidacoesV3('ESTRUTURA');
    quantidade += item.closingItems.length;
    if (quantidade > MAX_ITENS) throw new ErroLiquidacoesV3('LIMITE_LOCAL');
    return {
      natureza: 'GRUPO_APURACAO',
      inicioApuracao: item.startDateCalculation, fimApuracao: item.endDateCalculation,
      itens: item.closingItems.map(v => titulo(objeto(v))),
    };
  });
}

function consolidacao(lista: unknown, merchantId: string): Pick<LiquidacoesV3, 'consolidacao' | 'quantidadeMerchantsConsolidados'> {
  if (lista === undefined) return { consolidacao: 'NAO_INFORMADA', quantidadeMerchantsConsolidados: null };
  if (!Array.isArray(lista)) throw new ErroLiquidacoesV3('ESTRUTURA');
  if (lista.length > MAX_ITENS) throw new ErroLiquidacoesV3('LIMITE_LOCAL');
  if (!lista.length) return { consolidacao: 'LISTA_VAZIA', quantidadeMerchantsConsolidados: 0 };
  // O contrato declara strings. UUIDs são comparáveis sem diferença de caixa; demais strings permanecem opacas.
  const distintos = new Set(lista.map(valor => {
    const id = texto(valor);
    if (!id.trim()) throw new ErroLiquidacoesV3('ESTRUTURA');
    return UUID_DO_MERCHANT.test(id.toLowerCase()) ? id.toLowerCase() : id;
  }));
  return {
    consolidacao: distintos.size === 1 && distintos.has(merchantId) ? 'SOMENTE_CONSULTADO' : 'OUTROS_MERCHANTS',
    quantidadeMerchantsConsolidados: distintos.size,
  };
}

/** Lê uma resposta 200 do contrato v3 para o merchant e as datas pedidos. Saldo, títulos e grupos conservam sua natureza. */
export function lerLiquidacoesV3(textoJson: string, pedido: PedidoLiquidacoesV3): LiquidacoesV3 {
  if (!pedido || typeof pedido.merchantId !== 'string' || !UUID_DO_MERCHANT.test(pedido.merchantId.toLowerCase())
    || !diaDoPainelValido(pedido.inicio) || !diaDoPainelValido(pedido.fim) || pedido.inicio > pedido.fim)
    throw new ErroLiquidacoesV3('PEDIDO');
  const resposta = lerJsonFinancialV3(textoJson);
  if (Array.isArray(resposta) && resposta.length !== 1) throw new ErroLiquidacoesV3('ENVELOPE_AMBIGUO');
  const envelope = objeto(Array.isArray(resposta) ? resposta[0] : resposta);
  const merchantId = pedido.merchantId.toLowerCase();
  if (typeof envelope.merchantId !== 'string' || !UUID_DO_MERCHANT.test(envelope.merchantId.toLowerCase())
    || !diaDoPainelValido(envelope.beginDate) || !diaDoPainelValido(envelope.endDate)) throw new ErroLiquidacoesV3('ESTRUTURA');
  if (envelope.merchantId.toLowerCase() !== merchantId) throw new ErroLiquidacoesV3('MERCHANT_DIVERGENTE');
  if (envelope.beginDate !== pedido.inicio || envelope.endDate !== pedido.fim) throw new ErroLiquidacoesV3('PERIODO_DIVERGENTE');
  return {
    merchantId, inicio: envelope.beginDate, fim: envelope.endDate,
    formato: Array.isArray(resposta) ? 'ARRAY_UNITARIO' : 'OBJETO',
    saldoCentavos: centavos(envelope.balance),
    ...consolidacao(envelope.consolidatedMerchants, merchantId),
    lancamentos: lancamentos(envelope.settlements),
  };
}
