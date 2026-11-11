import { lerIdDaLojaIfood } from '../core/campos';
import { compararCentavosLiquidacaoSimulada, POLITICA_FINANCIAL_SIMULADA } from './financial-conciliacao';
import { identidadeFinancialSimuladaValida, type IdentidadeFinancialSimulada } from './financial-dominio';
import type { consultarLiquidacoesFinancialV3, ConsultaLiquidacoesV3 } from './financial-v3-consultas';
import {
  janelaDaCompetencia, mesmaIdentidadeMensalV3, mesmaLoja, mesmoIntervalo, somarEventosMensaisV3, type EventosConsultados, type MotivoEventosMensaisV3,
} from './financial-v3-eventos-mensais';
import type { TituloLiquidacaoV3 } from './financial-v3-liquidacoes';
import { diaDoPainelValido } from './painel-campos';

type LiquidacoesConsultadas = Awaited<ReturnType<typeof consultarLiquidacoesFinancialV3>>;

/** Declarações externas das fixtures, identificadas pelo parceiro, loja, merchant, competência, produto e moeda. */
interface Evidencia<Consulta> {
  readonly consulta?: Consulta | null;
  readonly identidade?: Partial<Record<keyof IdentidadeFinancialSimulada, string | null>> | null;
  readonly coberturaCompleta?: boolean | null;
  readonly apuracaoEncerrada?: boolean | null;
}

export interface EntradaLiquidacaoMensalV3 {
  readonly origem: 'SIMULACAO';
  readonly identidade: IdentidadeFinancialSimulada;
  readonly eventos: EventosConsultados | null;
  readonly liquidacoes: LiquidacoesConsultadas | null;
  readonly evidenciaEventos?: Evidencia<EventosConsultados['consulta']> | null;
  readonly evidenciaLiquidacao?: (Evidencia<ConsultaLiquidacoesV3> & {
    /** O saldo integral do envelope corresponde à identidade e ao mês civil de apuração declarados. */
    readonly saldoIntegralDaIdentidade?: boolean | null;
  }) | null;
}

type Motivo = MotivoEventosMensaisV3 | 'IDENTIDADE_CENARIO_INVALIDA'
  | 'IDENTIDADE_EVENTOS_DIVERGENTE' | 'IDENTIDADE_LIQUIDACAO_DIVERGENTE'
  | 'VINCULO_EVIDENCIA_EVENTOS' | 'VINCULO_EVIDENCIA_LIQUIDACAO'
  | 'COBERTURA_EVENTOS_NAO_COMPROVADA' | 'COBERTURA_LIQUIDACAO_NAO_COMPROVADA'
  | 'APURACAO_EVENTOS_NAO_ENCERRADA' | 'APURACAO_LIQUIDACAO_NAO_ENCERRADA'
  | 'LIQUIDACAO_AUSENTE' | 'FILTRO_LIQUIDACAO_INCOMPATIVEL' | 'JANELA_LIQUIDACAO_DIVERGENTE'
  | 'CONSOLIDACAO_COM_OUTRAS_LOJAS' | 'CONSOLIDACAO_NAO_COMPROVADA'
  | 'SALDO_SEM_ATRIBUICAO_INTEGRAL' | 'SALDO_LIQUIDACAO_AUSENTE' | 'GRUPO_FORA_DA_COMPETENCIA';

type Resultado = { origem: 'SIMULACAO'; politica: typeof POLITICA_FINANCIAL_SIMULADA } & (
  | { estado: 'PENDENTE'; motivos: Motivo[]; eventosComImpactoCentavos: null; saldoLiquidacaoCentavos: null; diferencaCentavos: null }
  | { estado: 'COMPATIVEL' | 'DIVERGENTE'; motivos: []; eventosComImpactoCentavos: bigint; saldoLiquidacaoCentavos: bigint; diferencaCentavos: bigint }
);

function conferirEvidencias(entrada: EntradaLiquidacaoMensalV3, motivos: Set<Motivo>) {
  const { evidenciaEventos: eventos, evidenciaLiquidacao: liquidacao } = entrada;
  if (!mesmoIntervalo(entrada.eventos?.consulta, eventos?.consulta) || (eventos?.consulta && 'filtro' in eventos.consulta))
    motivos.add('VINCULO_EVIDENCIA_EVENTOS');
  if (!mesmoIntervalo(entrada.liquidacoes?.liquidacoes, liquidacao?.consulta)
      || liquidacao?.consulta?.filtro !== entrada.liquidacoes?.filtro)
    motivos.add('VINCULO_EVIDENCIA_LIQUIDACAO');
  if (!mesmaIdentidadeMensalV3(entrada.identidade, eventos?.identidade)) motivos.add('IDENTIDADE_EVENTOS_DIVERGENTE');
  if (!mesmaIdentidadeMensalV3(entrada.identidade, liquidacao?.identidade)) motivos.add('IDENTIDADE_LIQUIDACAO_DIVERGENTE');
  if (eventos?.coberturaCompleta !== true) motivos.add('COBERTURA_EVENTOS_NAO_COMPROVADA');
  if (liquidacao?.coberturaCompleta !== true) motivos.add('COBERTURA_LIQUIDACAO_NAO_COMPROVADA');
  if (eventos?.apuracaoEncerrada !== true) motivos.add('APURACAO_EVENTOS_NAO_ENCERRADA');
  if (liquidacao?.apuracaoEncerrada !== true) motivos.add('APURACAO_LIQUIDACAO_NAO_ENCERRADA');
  if (liquidacao?.saldoIntegralDaIdentidade !== true) motivos.add('SALDO_SEM_ATRIBUICAO_INTEGRAL');
}

function conferirTitulo(titulo: TituloLiquidacaoV3, produto: string | undefined, motivos: Set<Motivo>) {
  if (titulo?.natureza !== 'TITULO' || (titulo.valorCentavos !== null && typeof titulo.valorCentavos !== 'bigint'))
    throw new Error('Título de liquidação Financial v3 inválido.');
  if (!titulo.produto || titulo.produto !== produto) motivos.add('PRODUTO_INCOMPATIVEL');
}

function conferirLiquidacao(entrada: EntradaLiquidacaoMensalV3, motivos: Set<Motivo>): bigint | null {
  const fonte = entrada.liquidacoes;
  if (fonte == null) {
    motivos.add('LIQUIDACAO_AUSENTE');
    return null;
  }
  const { liquidacoes: envelope, filtro } = fonte;
  if (!envelope || !lerIdDaLojaIfood(envelope.merchantId) || !Array.isArray(envelope.lancamentos)
      || !diaDoPainelValido(envelope.inicio) || !diaDoPainelValido(envelope.fim) || envelope.fim < envelope.inicio)
    throw new Error('Resultado de consulta de liquidações Financial v3 inválido.');
  if (filtro !== 'APURACAO') motivos.add('FILTRO_LIQUIDACAO_INCOMPATIVEL');
  if (!mesmaLoja(envelope.merchantId, entrada.identidade?.merchant)) motivos.add('LOJA_DIVERGENTE');
  if (!janelaDaCompetencia(envelope, entrada.identidade?.competencia)) motivos.add('JANELA_LIQUIDACAO_DIVERGENTE');
  if (envelope.consolidacao === 'OUTROS_MERCHANTS') motivos.add('CONSOLIDACAO_COM_OUTRAS_LOJAS');
  else if (envelope.consolidacao !== 'SOMENTE_CONSULTADO' || envelope.quantidadeMerchantsConsolidados !== 1)
    motivos.add('CONSOLIDACAO_NAO_COMPROVADA');

  for (const lancamento of envelope.lancamentos) {
    if (lancamento.natureza === 'TITULO') {
      conferirTitulo(lancamento, entrada.identidade?.produto, motivos);
      continue;
    }
    if (lancamento.natureza !== 'GRUPO_APURACAO' || !Array.isArray(lancamento.itens)
        || !diaDoPainelValido(lancamento.inicioApuracao) || !diaDoPainelValido(lancamento.fimApuracao)
        || lancamento.fimApuracao < lancamento.inicioApuracao) throw new Error('Grupo de apuração Financial v3 inválido.');
    // O recurso não atribui frações de uma semana à competência. Uma data de pagamento tampouco identifica esse mês.
    if (lancamento.inicioApuracao.slice(0, 7) !== entrada.identidade?.competencia
        || lancamento.fimApuracao.slice(0, 7) !== entrada.identidade?.competencia) motivos.add('GRUPO_FORA_DA_COMPETENCIA');
    for (const titulo of lancamento.itens) conferirTitulo(titulo, entrada.identidade?.produto, motivos);
  }
  if (envelope.saldoCentavos == null) {
    motivos.add('SALDO_LIQUIDACAO_AUSENTE');
    return null;
  }
  if (typeof envelope.saldoCentavos !== 'bigint') throw new Error('Saldo de liquidação Financial v3 inválido.');
  return envelope.saldoCentavos;
}

/** Compara os eventos com impacto ao saldo de apuração integral do envelope. Títulos não compõem uma segunda soma. */
export function conciliarLiquidacaoMensalV3(entrada: EntradaLiquidacaoMensalV3): Resultado {
  if (entrada?.origem !== 'SIMULACAO') throw new Error('Origem incompatível com a conciliação mensal simulada Financial v3.');
  const motivos = new Set<Motivo>();
  const identidade = entrada.identidade;
  const valida = identidadeFinancialSimuladaValida(identidade) && !!lerIdDaLojaIfood(identidade.merchant);
  if (!valida) motivos.add('IDENTIDADE_CENARIO_INVALIDA');
  conferirEvidencias(entrada, motivos);
  const escopo = valida ? { merchantId: identidade.merchant, competencia: identidade.competencia } : undefined;
  const eventosComImpactoCentavos = somarEventosMensaisV3(entrada.eventos, escopo, identidade?.produto, motivos);
  const saldoLiquidacaoCentavos = conferirLiquidacao(entrada, motivos);
  const base = { origem: entrada.origem, politica: POLITICA_FINANCIAL_SIMULADA };
  if (motivos.size || saldoLiquidacaoCentavos === null) {
    return { ...base, estado: 'PENDENTE', motivos: [...motivos], eventosComImpactoCentavos: null, saldoLiquidacaoCentavos: null, diferencaCentavos: null };
  }
  return {
    ...base, ...compararCentavosLiquidacaoSimulada(eventosComImpactoCentavos, saldoLiquidacaoCentavos),
    motivos: [], eventosComImpactoCentavos, saldoLiquidacaoCentavos,
  };
}
