import { decimalFinancialEmCentavos, ErroFinancialSimulado, MAX_CARACTERES_DECIMAL_FINANCIAL } from './financial-dominio';
import { centavosNumeroFinancialV3, objetoPeriodoFinancialV3, type CodigoEnvelopePeriodoV3, type PedidoPeriodoFinancialV3 } from './financial-v3-envelope-periodo';
import { lerJsonFinancialV3, NumeroJsonFinancial } from './financial-v3-json';
import { diaDoPainelValido, UUID_DO_MERCHANT } from './painel-campos';
import { instanteIsoComFusoValido } from './datas';

type PedidoPaginaVendas = PedidoPeriodoFinancialV3 & { readonly page: number };

export interface VendaV3 {
  id: string;
  numeroCurto: string | null;
  criadaEm: string | null;
  tipo: string | null;
  categoria: string | null;
  canal: string | null;
  estado: string | null;
  valorBruto: { itensCentavos: bigint | null; entregaCentavos: bigint | null; servicoCentavos: bigint | null } | null;
  faturamento: {
    saldoVendaCentavos: bigint | null;
    lancamentos: { nome: string | null; valorCentavos: bigint | null }[] | null;
  } | null;
  metodosPagamento: {
    metodo: string | null;
    tipo: string | null;
    moeda: string | null;
    responsabilidade: string | null;
    valorCentavos: bigint | null;
  }[] | null;
}

export interface PaginaVendasV3 {
  formato: 'OBJETO' | 'ARRAY_UNITARIO';
  page: number;
  size: number;
  total: number;
  pageCount: number;
  inicio: string;
  fim: string;
  vendas: VendaV3[];
}

// Limite cumulativo local para vendas, lançamentos e métodos de pagamento projetados por página.
const MAX_ITENS_LOCAIS = 10_000;
const MAX_TEXTO = 256;

export class ErroVendasV3 extends Error {
  constructor(readonly codigo: CodigoEnvelopePeriodoV3 | 'PAGINACAO' | 'JSON_INVALIDO') {
    super('Página de vendas Financial v3 incompatível com a leitura solicitada.');
    this.name = 'ErroVendasV3';
  }
}

function objeto(valor: unknown) {
  return objetoPeriodoFinancialV3(valor, ErroVendasV3);
}

function texto(valor: unknown): string | null {
  if (valor == null) return null;
  if (typeof valor !== 'string') throw new ErroVendasV3('ESTRUTURA');
  if (valor.length > MAX_TEXTO) throw new ErroVendasV3('LIMITE_LOCAL');
  return valor;
}

/** O schema exibe shortId textual. O guia também admite o número do pedido como inteiro JSON. */
function numeroCurto(valor: unknown): string | null {
  if (!(valor instanceof NumeroJsonFinancial)) return texto(valor);
  if (valor.literal.length > MAX_TEXTO) throw new ErroVendasV3('LIMITE_LOCAL');
  const [mantissa, expoente = '0'] = valor.literal.toLowerCase().split('e');
  const [inteiro, fracao = ''] = mantissa.split('.');
  const digitos = (inteiro + fracao).replace(/^-?0*/, '');
  if (!digitos) return '0';
  if (mantissa.startsWith('-')) throw new ErroVendasV3('ESTRUTURA');
  const significativos = digitos.replace(/0+$/, '');
  const zerosFinais = BigInt(expoente) - BigInt(fracao.length) + BigInt(digitos.length - significativos.length);
  if (zerosFinais < 0n) throw new ErroVendasV3('ESTRUTURA');
  if (BigInt(significativos.length) + zerosFinais > BigInt(MAX_TEXTO)) throw new ErroVendasV3('LIMITE_LOCAL');
  return significativos + '0'.repeat(Number(zerosFinais));
}

function criacao(valor: unknown): string | null {
  const instante = texto(valor);
  if (instante === null) return null;
  if (!instanteIsoComFusoValido(instante)) throw new ErroVendasV3('ESTRUTURA');
  return instante;
}

/** O schema usa decimais textuais e o exemplo também contém tokens numéricos. */
function centavos(valor: unknown): bigint | null {
  if (valor == null) return null;
  if (typeof valor !== 'string') return centavosNumeroFinancialV3(valor, ErroVendasV3);
  try {
    return decimalFinancialEmCentavos(valor);
  } catch (e) {
    if (e instanceof ErroFinancialSimulado && (e.codigo === 'SUBCENTAVO' || e.codigo === 'LIMITE_LOCAL')) {
      throw new ErroVendasV3(e.codigo);
    }
    throw new ErroVendasV3('VALOR_MONETARIO');
  }
}

function listaOpcional(valor: unknown): unknown[] | null {
  if (valor == null) return null;
  if (!Array.isArray(valor)) throw new ErroVendasV3('ESTRUTURA');
  if (valor.length > MAX_ITENS_LOCAIS) throw new ErroVendasV3('LIMITE_LOCAL');
  return valor;
}

function lerVenda(valor: unknown, merchantId: string): VendaV3 {
  const venda = objeto(valor);
  const id = texto(venda.id);
  if (!id?.trim()) throw new ErroVendasV3('ESTRUTURA');
  const loja = objeto(venda.merchant).id;
  if (typeof loja !== 'string' || !UUID_DO_MERCHANT.test(loja.toLowerCase())) throw new ErroVendasV3('ESTRUTURA');
  if (loja.toLowerCase() !== merchantId) throw new ErroVendasV3('MERCHANT_DIVERGENTE');
  const bruto = venda.saleGrossValue == null ? null : objeto(venda.saleGrossValue);
  const resumo = venda.billingSummary == null ? null : objeto(venda.billingSummary);
  const pagamentos = venda.payments == null ? null : objeto(venda.payments);
  return {
    id, numeroCurto: numeroCurto(venda.shortId), criadaEm: criacao(venda.createdAt), tipo: texto(venda.type),
    categoria: texto(venda.category), canal: texto(venda.salesChannel), estado: texto(venda.currentStatus),
    valorBruto: bruto && {
      itensCentavos: centavos(bruto.bag), entregaCentavos: centavos(bruto.deliveryFee), servicoCentavos: centavos(bruto.serviceFee),
    },
    faturamento: resumo && {
      saldoVendaCentavos: centavos(resumo.saleBalance),
      lancamentos: listaOpcional(resumo.billingEntries)?.map(valor => {
        const entrada = objeto(valor);
        return { nome: texto(entrada.name), valorCentavos: centavos(entrada.value) };
      }) ?? null,
    },
    metodosPagamento: listaOpcional(pagamentos?.methods)?.map(valor => {
      const meio = objeto(valor);
      return {
        metodo: texto(meio.method), tipo: texto(meio.type), moeda: texto(meio.currency),
        responsabilidade: texto(meio.liability), valorCentavos: centavos(meio.value),
      };
    }) ?? null,
  };
}

/** Confere a escala no literal antes de converter um contador JSON em inteiro seguro. */
function contador(valor: unknown, minimo: number): number {
  if (!(valor instanceof NumeroJsonFinancial)) throw new ErroVendasV3('ESTRUTURA');
  if (valor.literal.length > MAX_CARACTERES_DECIMAL_FINANCIAL) throw new ErroVendasV3('LIMITE_LOCAL');
  const [mantissa, expoente = '0'] = valor.literal.toLowerCase().split('e');
  const [inteiro, fracao = ''] = mantissa.split('.');
  const coeficiente = (inteiro + fracao).replace(/^-?0*/, '');
  if (!coeficiente && minimo === 0) return 0;
  const zerosFinais = coeficiente.length - coeficiente.replace(/0+$/, '').length;
  const n = Number(valor.literal);
  if (!Number.isSafeInteger(n) || n < minimo || Number(expoente) - fracao.length + zerosFinais < 0) {
    throw new ErroVendasV3('PAGINACAO');
  }
  return n;
}

/** Lê o envelope 200 para a página e o intervalo informados pelo chamador. */
export function lerPaginaVendasV3(textoJson: string, pedido: PedidoPaginaVendas): PaginaVendasV3 {
  if (!pedido || typeof pedido.merchantId !== 'string' || !UUID_DO_MERCHANT.test(pedido.merchantId.toLowerCase())
    || !diaDoPainelValido(pedido.inicio) || !diaDoPainelValido(pedido.fim) || pedido.fim < pedido.inicio
    || !Number.isSafeInteger(pedido.page) || pedido.page < 1) {
    throw new ErroVendasV3('PEDIDO');
  }
  let resposta: unknown;
  try { resposta = lerJsonFinancialV3(textoJson); } catch { throw new ErroVendasV3('JSON_INVALIDO'); }
  if (Array.isArray(resposta) && resposta.length !== 1) throw new ErroVendasV3('ENVELOPE_AMBIGUO');
  const corpo = objetoPeriodoFinancialV3(Array.isArray(resposta) ? resposta[0] : resposta, ErroVendasV3);
  if (!diaDoPainelValido(corpo.beginSalesDate) || !diaDoPainelValido(corpo.endSalesDate) || !Array.isArray(corpo.sales)) {
    throw new ErroVendasV3('ESTRUTURA');
  }
  if (corpo.beginSalesDate !== pedido.inicio || corpo.endSalesDate !== pedido.fim) throw new ErroVendasV3('PERIODO_DIVERGENTE');
  const page = contador(corpo.page, 1);
  const size = contador(corpo.size, 0);
  const total = contador(corpo.total, 0);
  const pageCount = contador(corpo.pageCount, 0);
  if (page !== pedido.page || corpo.sales.length > size || corpo.sales.length > total
    || (pageCount === 0 ? page !== 1 || total !== 0 : page > pageCount)) {
    throw new ErroVendasV3('PAGINACAO');
  }
  let quantidade = corpo.sales.length;
  if (quantidade > MAX_ITENS_LOCAIS) throw new ErroVendasV3('LIMITE_LOCAL');
  const formato = Array.isArray(resposta) ? 'ARRAY_UNITARIO' : 'OBJETO';
  const merchantId = pedido.merchantId.toLowerCase();
  const vendas = corpo.sales.map(valor => {
    const venda = lerVenda(valor, merchantId);
    quantidade += (venda.faturamento?.lancamentos?.length ?? 0) + (venda.metodosPagamento?.length ?? 0);
    if (quantidade > MAX_ITENS_LOCAIS) throw new ErroVendasV3('LIMITE_LOCAL');
    return venda;
  });
  return { formato, page, size, total, pageCount, inicio: corpo.beginSalesDate, fim: corpo.endSalesDate, vendas };
}
