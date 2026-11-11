import { MAX_CARACTERES_DECIMAL_FINANCIAL } from './financial-dominio';
import { centavosNumeroFinancialV3, lerEnvelopePeriodoFinancialV3, objetoPeriodoFinancialV3, type CodigoEnvelopePeriodoV3, type PedidoPeriodoFinancialV3 } from './financial-v3-envelope-periodo';
import { NumeroJsonFinancial } from './financial-v3-json';
import { diaDoPainelValido } from './painel-campos';

export interface TituloAntecipacaoV3 {
  tipo: string | null;
  estado: string | null;
  pagamentoOriginalEm: string | null;
  pagamentoAntecipadoEm: string | null;
  valorOriginalCentavos: bigint | null;
  valorAntecipadoCentavos: bigint | null;
  taxaCentavos: bigint | null;
  /** Literal numérico do percentual informado pelo provedor, independente do valor monetário da taxa. */
  taxaPercentual: string | null;
}

export interface GrupoAntecipacaoV3 {
  inicioApuracao: string | null;
  fimApuracao: string | null;
  itens: TituloAntecipacaoV3[] | null;
}

export interface AntecipacoesV3 extends PedidoPeriodoFinancialV3 {
  formato: 'OBJETO' | 'ARRAY_UNITARIO';
  saldoCentavos: bigint;
  cobertura: 'NAO_COMPROVADA';
  grupos: GrupoAntecipacaoV3[];
}

export class ErroAntecipacoesV3 extends Error {
  constructor(readonly codigo: CodigoEnvelopePeriodoV3 | 'PERCENTUAL_INVALIDO') {
    super('Resposta ou pedido de antecipações incompatível com o contrato suportado.');
    this.name = 'ErroAntecipacoesV3';
  }
}

// Limites locais de leitura em memória, independentes da cobertura e da paginação do provedor.
const MAX_ITENS = 10_000;
const MAX_TEXTO = 256;
const CAMPOS_TITULO = ['type', 'status', 'originalPaymentDate', 'anticipatedPaymentDate',
  'originalPaymentAmount', 'anticipatedPaymentAmount', 'feeAmount', 'feePercentage'];
const CAMPOS_GRUPO = ['startDateCalculation', 'endDateCalculation', 'closingItems'];

function textoOpcional(valor: unknown): string | null {
  if (valor == null) return null;
  if (typeof valor !== 'string') throw new ErroAntecipacoesV3('ESTRUTURA');
  if (valor.length > MAX_TEXTO) throw new ErroAntecipacoesV3('LIMITE_LOCAL');
  return valor;
}

function dataOpcional(valor: unknown): string | null {
  if (valor == null) return null;
  if (!diaDoPainelValido(valor)) throw new ErroAntecipacoesV3('ESTRUTURA');
  return valor;
}

function percentualOpcional(valor: unknown): string | null {
  if (valor == null) return null;
  if (!(valor instanceof NumeroJsonFinancial)) throw new ErroAntecipacoesV3('PERCENTUAL_INVALIDO');
  if (valor.literal.length > MAX_CARACTERES_DECIMAL_FINANCIAL) throw new ErroAntecipacoesV3('LIMITE_LOCAL');
  return valor.literal;
}

function dinheiroOpcional(valor: unknown): bigint | null {
  return valor == null ? null : centavosNumeroFinancialV3(valor, ErroAntecipacoesV3);
}

function titulo(valor: unknown): TituloAntecipacaoV3 {
  const item = objetoPeriodoFinancialV3(valor, ErroAntecipacoesV3);
  if (CAMPOS_GRUPO.some(c => Object.hasOwn(item, c))) throw new ErroAntecipacoesV3('ESTRUTURA');
  return {
    tipo: textoOpcional(item.type), estado: textoOpcional(item.status),
    pagamentoOriginalEm: dataOpcional(item.originalPaymentDate), pagamentoAntecipadoEm: dataOpcional(item.anticipatedPaymentDate),
    valorOriginalCentavos: dinheiroOpcional(item.originalPaymentAmount),
    valorAntecipadoCentavos: dinheiroOpcional(item.anticipatedPaymentAmount),
    taxaCentavos: dinheiroOpcional(item.feeAmount), taxaPercentual: percentualOpcional(item.feePercentage),
  };
}

/** Leitura da resposta 200 da operação Anticipations para um merchant e período. Preserva cada ocorrência em seu grupo. */
export function lerAntecipacoesV3(textoJson: string, pedido: PedidoPeriodoFinancialV3): AntecipacoesV3 {
  const { corpo, ...resumo } = lerEnvelopePeriodoFinancialV3(textoJson, pedido, ErroAntecipacoesV3);
  if (!Array.isArray(corpo.settlements)) throw new ErroAntecipacoesV3('ESTRUTURA');
  let quantidade = corpo.settlements.length;
  if (quantidade > MAX_ITENS) throw new ErroAntecipacoesV3('LIMITE_LOCAL');
  const grupos = corpo.settlements.map(valor => {
    const grupo = objetoPeriodoFinancialV3(valor, ErroAntecipacoesV3);
    if (CAMPOS_TITULO.some(c => Object.hasOwn(grupo, c))) throw new ErroAntecipacoesV3('ESTRUTURA');
    const inicioApuracao = dataOpcional(grupo.startDateCalculation);
    const fimApuracao = dataOpcional(grupo.endDateCalculation);
    if (inicioApuracao !== null && fimApuracao !== null && inicioApuracao > fimApuracao) throw new ErroAntecipacoesV3('ESTRUTURA');
    const lista = grupo.closingItems;
    if (lista == null) return { inicioApuracao, fimApuracao, itens: null };
    if (!Array.isArray(lista)) throw new ErroAntecipacoesV3('ESTRUTURA');
    quantidade += lista.length;
    if (quantidade > MAX_ITENS) throw new ErroAntecipacoesV3('LIMITE_LOCAL');
    return { inicioApuracao, fimApuracao, itens: lista.map(titulo) };
  });
  return { ...resumo, cobertura: 'NAO_COMPROVADA', grupos };
}
