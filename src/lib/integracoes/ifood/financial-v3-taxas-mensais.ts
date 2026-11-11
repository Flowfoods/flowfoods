import { taxaConfiguradaDaLinha } from '../../erp/canal-campos';
import { lerIdDaLojaIfood } from '../core/campos';
import { identidadeFinancialSimuladaValida, MAX_CARACTERES_DECIMAL_FINANCIAL, type IdentidadeFinancialSimulada } from './financial-dominio';
import type { EventoV3 } from './financial-v3-eventos';
import { janelaDaCompetencia, mesmaIdentidadeMensalV3, mesmaLoja, mesmoIntervalo, type EventosConsultados } from './financial-v3-eventos-mensais';
import { diaDoPainelValido, diasDoPainel } from './painel-campos';

const TIPOS = ['ORDER_COMMISSION', 'PAYMENT_TRANSACTION_FEE'] as const;
type Tipo = (typeof TIPOS)[number];
type Estado = 'PENDENTE' | 'COMPATIVEL' | 'DIVERGENTE';
type IdentidadeAtestada = Partial<Record<keyof IdentidadeFinancialSimulada, string | null>>;
type LinhaCanal = NonNullable<Parameters<typeof taxaConfiguradaDaLinha>[0]>;

export interface VigenciaTaxaMensalV3 {
  readonly identidade?: IdentidadeAtestada | null;
  /** Dias civis inclusivos aos quais o retrato da configuração se aplica. */
  readonly inicio?: string | null;
  readonly fim?: string | null;
  readonly linha?: (LinhaCanal & { readonly parceiroId: string; readonly canal: string }) | null;
  /** Por tipo, a fixture vincula a base contratual da loja ao billing.baseValue desta cobrança. */
  readonly basesAtestadas?: readonly Tipo[] | null;
  /** O dia contratual da venda está dentro de period.beginDate/endDate. */
  readonly periodoDaVendaAplicavel?: boolean | null;
}

export interface EntradaTaxasMensaisV3 {
  readonly origem: 'SIMULACAO';
  readonly identidade: IdentidadeFinancialSimulada;
  readonly eventos: EventosConsultados | null;
  readonly evidenciaEventos?: {
    readonly consulta?: EventosConsultados['consulta'] | null;
    readonly identidade?: IdentidadeAtestada | null;
    readonly coberturaCompleta?: boolean | null;
    readonly apuracaoEncerrada?: boolean | null;
  } | null;
  readonly vigencias?: readonly VigenciaTaxaMensalV3[] | null;
  /** A chave é a própria ocorrência da consulta. Em estornos, a data atestada é a da regra da venda original. */
  readonly datasAplicaveis?: ReadonlyMap<EventoV3, string>;
}

type Motivo =
  | 'IDENTIDADE_CENARIO_INVALIDA' | 'VINCULO_EVIDENCIA_EVENTOS' | 'IDENTIDADE_EVENTOS_DIVERGENTE'
  | 'COBERTURA_EVENTOS_NAO_COMPROVADA' | 'APURACAO_EVENTOS_NAO_ENCERRADA' | 'EVENTOS_AUSENTES'
  | 'LOJA_DIVERGENTE' | 'JANELA_EVENTOS_DIVERGENTE' | 'RECEBEDOR_FORA_DA_LOJA'
  | 'COMPETENCIA_EVENTO_INCOMPATIVEL' | 'PRODUTO_INCOMPATIVEL' | 'TAXA_NAO_CLASSIFICADA'
  | 'IDENTIDADE_CONFIGURACAO_DIVERGENTE' | 'VIGENCIA_INVALIDA' | 'CONFIGURACAO_AUSENTE'
  | 'VIGENCIA_AUSENTE' | 'VIGENCIAS_SOBREPOSTAS' | 'BASE_CONTRATUAL_NAO_ATESTADA'
  | 'SEM_OCORRENCIAS_DO_TIPO' | 'PERIODO_EVENTO_INCOMPATIVEL' | 'DATA_APLICAVEL_NAO_COMPROVADA'
  | 'PERIODO_ABRANGE_VIGENCIAS' | 'BASE_COBRANCA_AUSENTE' | 'BASE_NEGATIVA_SEM_REGRA'
  | 'PERCENTUAL_AUSENTE_OU_INVALIDO' | 'VALOR_EVENTO_DESCONHECIDO' | 'GATILHO_NAO_CLASSIFICADO'
  | 'IMPACTO_NAO_COMPROVADO' | 'ARREDONDAMENTO_NAO_COMPROVADO';

function conferirFonte(entrada: EntradaTaxasMensaisV3, motivos: Set<Motivo>) {
  const { identidade, evidenciaEventos: evidencia, eventos } = entrada;
  if (!identidadeFinancialSimuladaValida(identidade) || !lerIdDaLojaIfood(identidade.merchant)) motivos.add('IDENTIDADE_CENARIO_INVALIDA');
  if (!mesmaIdentidadeMensalV3(identidade, evidencia?.identidade)) motivos.add('IDENTIDADE_EVENTOS_DIVERGENTE');
  if (!mesmoIntervalo(evidencia?.consulta, eventos?.consulta) || (evidencia?.consulta && 'filtro' in evidencia.consulta))
    motivos.add('VINCULO_EVIDENCIA_EVENTOS');
  if (evidencia?.coberturaCompleta !== true) motivos.add('COBERTURA_EVENTOS_NAO_COMPROVADA');
  if (evidencia?.apuracaoEncerrada !== true) motivos.add('APURACAO_EVENTOS_NAO_ENCERRADA');
  if (!eventos) {
    motivos.add('EVENTOS_AUSENTES');
    return;
  }
  if (!Array.isArray(eventos.eventos) || !Number.isSafeInteger(eventos.paginasLidas) || eventos.paginasLidas < 1)
    throw new Error('Resultado de consulta de eventos Financial v3 inválido.');
  if (!mesmaLoja(eventos.consulta?.merchantId, identidade?.merchant)) motivos.add('LOJA_DIVERGENTE');
  if (!eventos.consulta || !janelaDaCompetencia(eventos.consulta, identidade?.competencia)) motivos.add('JANELA_EVENTOS_DIVERGENTE');
  for (const evento of eventos.eventos) {
    if (!evento) throw new Error('Ocorrência de evento Financial v3 inválida.');
    if (evento.recebedorForaDaLoja) motivos.add('RECEBEDOR_FORA_DA_LOJA');
    if (!evento.produto || evento.produto !== identidade?.produto) motivos.add('PRODUTO_INCOMPATIVEL');
    if (!evento.competencia || evento.competencia !== identidade?.competencia) motivos.add('COMPETENCIA_EVENTO_INCOMPATIVEL');
    if (!evento.nome || (evento.cobranca && !TIPOS.some(tipo => tipo === evento.nome)))
      motivos.add('TAXA_NAO_CLASSIFICADA');
  }
}

interface Regra {
  inicio: string;
  fim: string;
  bp: number | null;
  periodoDaVendaAplicavel: boolean;
  baseAtestada: boolean;
}

function regrasDoTipo(entrada: EntradaTaxasMensaisV3, tipo: Tipo, motivos: Set<Motivo>) {
  const regras: Regra[] = [];
  for (const vigencia of entrada.vigencias ?? []) {
    if (!mesmaIdentidadeMensalV3(entrada.identidade, vigencia?.identidade)
        || (vigencia.linha && (vigencia.linha.parceiroId !== entrada.identidade.parceiro || vigencia.linha.canal !== 'IFOOD'))) {
      motivos.add('IDENTIDADE_CONFIGURACAO_DIVERGENTE');
      continue;
    }
    if (!diaDoPainelValido(vigencia.inicio) || !diaDoPainelValido(vigencia.fim) || vigencia.inicio > vigencia.fim) {
      motivos.add('VIGENCIA_INVALIDA');
      continue;
    }
    const taxa = taxaConfiguradaDaLinha(vigencia.linha);
    // A origem é CanalConfig do ERP, inclusive sua marca de configuração e as restrições dos pontos-base.
    const configurada = vigencia.linha?.taxaConfigurada === true && taxa
      && [taxa.comissaoBp, taxa.pagamentoBp].every(n => Number.isSafeInteger(n) && n >= 0)
      && taxa.comissaoBp + taxa.pagamentoBp < 10_000;
    regras.push({
      inicio: vigencia.inicio, fim: vigencia.fim, bp: configurada ? (tipo === 'ORDER_COMMISSION' ? taxa.comissaoBp : taxa.pagamentoBp) : null,
      periodoDaVendaAplicavel: vigencia.periodoDaVendaAplicavel === true, baseAtestada: vigencia.basesAtestadas?.includes(tipo) === true,
    });
  }
  return regras;
}

function regraDoPeriodo(regras: Regra[], inicio: string, fim: string, motivos: Set<Motivo>): Regra | null {
  const presentes = regras.filter(r => r.inicio <= fim && r.fim >= inicio);
  if (!presentes.length) { motivos.add('VIGENCIA_AUSENTE'); return null; }
  if (presentes.length > 1) {
    motivos.add(inicio === fim ? 'VIGENCIAS_SOBREPOSTAS' : 'PERIODO_ABRANGE_VIGENCIAS');
    return null;
  }
  const [regra] = presentes;
  if (regra.inicio > inicio || regra.fim < fim) { motivos.add('VIGENCIA_AUSENTE'); return null; }
  if (!regra.baseAtestada) { motivos.add('BASE_CONTRATUAL_NAO_ATESTADA'); return null; }
  if (regra.bp === null) motivos.add('CONFIGURACAO_AUSENTE');
  return regra;
}

function naturezaDoGatilho(gatilho: string | null) {
  switch (gatilho) {
    case 'SALE_CONCLUDED':
      return 'DEBITO' as const;
    case 'SALE_CANCELLED':
    case 'PARTIAL_CANCELLATION_SALE':
    case 'SALE_PARTIAL_CANCELLED':
      return 'ESTORNO' as const;
    default:
      return null;
  }
}

function regraDaOcorrencia(entrada: EntradaTaxasMensaisV3, evento: EventoV3, regras: Regra[], motivos: Set<Motivo>) {
  const inicio = evento.periodo?.inicio;
  const fim = evento.periodo?.fim;
  const natureza = naturezaDoGatilho(evento.gatilho);
  const consulta = entrada.eventos?.consulta;
  if (!diaDoPainelValido(inicio) || !diaDoPainelValido(fim) || inicio > fim
      || !consulta || fim < consulta.inicio || inicio > consulta.fim) {
    motivos.add('PERIODO_EVENTO_INCOMPATIVEL');
    return null;
  }
  const dia = entrada.datasAplicaveis?.get(evento);
  if (dia !== undefined) {
    if (!diaDoPainelValido(dia) || dia > fim || dia > consulta.fim || (natureza !== 'ESTORNO' && (dia < inicio || dia < consulta.inicio))) {
      motivos.add('DATA_APLICAVEL_NAO_COMPROVADA');
      return null;
    }
    return regraDoPeriodo(regras, dia, dia, motivos);
  }
  if (natureza === 'ESTORNO') { motivos.add('DATA_APLICAVEL_NAO_COMPROVADA'); return null; }
  if (inicio < consulta.inicio || fim > consulta.fim) { motivos.add('DATA_APLICAVEL_NAO_COMPROVADA'); return null; }
  const regra = regraDoPeriodo(regras, inicio, fim, motivos);
  if (regra && !regra.periodoDaVendaAplicavel) { motivos.add('DATA_APLICAVEL_NAO_COMPROVADA'); return null; }
  return regra;
}

/** Compara o literal percentual (inclusive fração de bp) ao inteiro de pontos-base sem arredondá-lo. */
function percentualCompativel(literal: string | null, bp: number | null): boolean | null {
  if (typeof literal !== 'string' || literal.length > MAX_CARACTERES_DECIMAL_FINANCIAL || bp === null) return null;
  const partes = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(literal);
  if (!partes) return null;
  const fracao = partes[2] ?? '';
  return BigInt(partes[1] + fracao) * 100n === BigInt(bp) * 10n ** BigInt(fracao.length);
}

function compararOcorrencia(entrada: EntradaTaxasMensaisV3, evento: EventoV3, indice: number, regras: Regra[]) {
  const motivos = new Set<Motivo>();
  const natureza = naturezaDoGatilho(evento.gatilho);
  if (!natureza) motivos.add('GATILHO_NAO_CLASSIFICADO');
  if (evento.impactoNoRepasse !== true) motivos.add('IMPACTO_NAO_COMPROVADO');
  const regra = regraDaOcorrencia(entrada, evento, regras, motivos);
  const configuradaBp = regra?.bp ?? null;
  const percentualCobrado = evento.cobranca?.percentual ?? null;
  const percentualConfere = percentualCompativel(percentualCobrado, configuradaBp);
  if (percentualCobrado === null || (configuradaBp !== null && percentualConfere === null)) motivos.add('PERCENTUAL_AUSENTE_OU_INVALIDO');
  const baseCentavos = evento.cobranca?.baseCentavos ?? null;
  const cobradoCentavos = evento.valorCentavos;
  if (cobradoCentavos === null) motivos.add('VALOR_EVENTO_DESCONHECIDO');
  if (baseCentavos === null) motivos.add('BASE_COBRANCA_AUSENTE');
  else if (baseCentavos < 0n) motivos.add('BASE_NEGATIVA_SEM_REGRA');
  let previstoCentavos = null;
  if (baseCentavos !== null && baseCentavos >= 0n && configuradaBp !== null && natureza) {
    const numerador = baseCentavos * BigInt(configuradaBp) * (natureza === 'DEBITO' ? -1n : 1n);
    if (numerador % 10_000n === 0n) previstoCentavos = numerador / 10_000n;
    else motivos.add('ARREDONDAMENTO_NAO_COMPROVADO');
  }
  if (motivos.size) previstoCentavos = null;
  const diferencaCentavos = previstoCentavos !== null && cobradoCentavos !== null ? cobradoCentavos - previstoCentavos : null;
  const estado: Estado = motivos.size ? 'PENDENTE' : (percentualConfere && diferencaCentavos === 0n ? 'COMPATIVEL' : 'DIVERGENTE');
  return { indice, periodo: evento.periodo, natureza, configuradaBp, percentualCobrado, percentualCompativel: percentualConfere,
    baseCentavos, cobradoCentavos, previstoCentavos, diferencaCentavos, estado, motivos: [...motivos] };
}

function compararTipo(entrada: EntradaTaxasMensaisV3, tipo: Tipo, comuns: Set<Motivo>) {
  const motivos = new Set(comuns);
  const ocorrencias: ReturnType<typeof compararOcorrencia>[] = [];
  let cobrado = 0n, previsto = 0n;
  let divergente = false;
  if (motivos.size === 0 && entrada.eventos) {
    const regras = regrasDoTipo(entrada, tipo, motivos);
    const { inicio, fim } = entrada.eventos.consulta;
    for (const dia of diasDoPainel(inicio, fim) ?? []) regraDoPeriodo(regras, dia, dia, motivos);
    entrada.eventos.eventos.forEach((evento, indice) => {
      if (evento.nome !== tipo) return;
      const resultado = compararOcorrencia(entrada, evento, indice, regras);
      ocorrencias.push(resultado);
      for (const motivo of resultado.motivos) motivos.add(motivo);
      if (resultado.estado === 'DIVERGENTE') divergente = true;
      if (resultado.cobradoCentavos !== null) cobrado += resultado.cobradoCentavos;
      if (resultado.previstoCentavos !== null) previsto += resultado.previstoCentavos;
    });
    if (!ocorrencias.length) motivos.add('SEM_OCORRENCIAS_DO_TIPO');
  }
  const estado: Estado = motivos.size ? 'PENDENTE' : divergente ? 'DIVERGENTE' : 'COMPATIVEL';
  return { estado, motivos: [...motivos], ocorrencias,
    cobradoCentavos: motivos.size ? null : cobrado, previstoCentavos: motivos.size ? null : previsto,
    diferencaCentavos: motivos.size ? null : cobrado - previsto };
}

/** Compara as ocorrências dos dois tipos de taxa; débitos e estornos mantêm o sinal de amount.value. */
export function compararTaxasMensaisV3(entrada: EntradaTaxasMensaisV3) {
  if (entrada?.origem !== 'SIMULACAO') throw new Error('Origem incompatível com a comparação simulada de taxas Financial v3.');
  const motivos = new Set<Motivo>();
  conferirFonte(entrada, motivos);
  const porTipo = {
    ORDER_COMMISSION: compararTipo(entrada, 'ORDER_COMMISSION', motivos),
    PAYMENT_TRANSACTION_FEE: compararTipo(entrada, 'PAYMENT_TRANSACTION_FEE', motivos),
  };
  for (const resultado of Object.values(porTipo)) for (const motivo of resultado.motivos) motivos.add(motivo);
  const estado: Estado = motivos.size ? 'PENDENTE' : Object.values(porTipo).some(r => r.estado === 'DIVERGENTE') ? 'DIVERGENTE' : 'COMPATIVEL';
  return { origem: entrada.origem, identidade: entrada.identidade, estado, motivos: [...motivos], porTipo };
}
