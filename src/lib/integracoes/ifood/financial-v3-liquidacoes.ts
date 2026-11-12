import { centavosNumeroFinancialV3, lerEnvelopePeriodoFinancialV3, objetoPeriodoFinancialV3, type CodigoEnvelopePeriodoV3 } from './financial-v3-envelope-periodo';
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

export class ErroLiquidacoesV3 extends Error {
  constructor(readonly codigo: CodigoEnvelopePeriodoV3) {
    super('Resposta ou pedido de liquidações incompatível com o contrato suportado.');
    this.name = 'ErroLiquidacoesV3';
  }
}

// Orçamentos do leitor local, independentes dos limites e da cobertura do provedor.
const MAX_ITENS = 10_000;
const MAX_TEXTO = 256;
const CAMPOS_TITULO = ['id', 'type', 'product', 'amount', 'status', 'paymentDate', 'transactionId', 'accountDetails'];
const CAMPOS_GRUPO = ['startDateCalculation', 'endDateCalculation', 'closingItems'];

function texto(valor: unknown): string {
  if (typeof valor !== 'string') throw new ErroLiquidacoesV3('ESTRUTURA');
  if (valor.length > MAX_TEXTO) throw new ErroLiquidacoesV3('LIMITE_LOCAL');
  return valor;
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
    valorCentavos: item.amount == null ? null : centavosNumeroFinancialV3(item.amount, ErroLiquidacoesV3),
  };
}

function lancamentos(settlements: unknown): LiquidacoesV3['lancamentos'] {
  if (!Array.isArray(settlements)) throw new ErroLiquidacoesV3('ESTRUTURA');
  let quantidade = settlements.length;
  if (quantidade > MAX_ITENS) throw new ErroLiquidacoesV3('LIMITE_LOCAL');
  return settlements.map(valor => {
    const item = objetoPeriodoFinancialV3(valor, ErroLiquidacoesV3);
    if (!CAMPOS_GRUPO.some(c => Object.hasOwn(item, c))) return titulo(item);
    if (CAMPOS_TITULO.some(c => Object.hasOwn(item, c)) || !Array.isArray(item.closingItems)
      || !diaDoPainelValido(item.startDateCalculation) || !diaDoPainelValido(item.endDateCalculation)
      || item.startDateCalculation > item.endDateCalculation) throw new ErroLiquidacoesV3('ESTRUTURA');
    quantidade += item.closingItems.length;
    if (quantidade > MAX_ITENS) throw new ErroLiquidacoesV3('LIMITE_LOCAL');
    return {
      natureza: 'GRUPO_APURACAO',
      inicioApuracao: item.startDateCalculation, fimApuracao: item.endDateCalculation,
      itens: item.closingItems.map(v => titulo(objetoPeriodoFinancialV3(v, ErroLiquidacoesV3))),
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
  const { corpo, ...resumo } = lerEnvelopePeriodoFinancialV3(textoJson, pedido, ErroLiquidacoesV3);
  return {
    ...resumo,
    ...consolidacao(corpo.consolidatedMerchants, resumo.merchantId),
    lancamentos: lancamentos(corpo.settlements),
  };
}
