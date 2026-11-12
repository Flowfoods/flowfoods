import { lerIdDaLojaIfood } from '../core/campos';
import { identidadeFinancialSimuladaValida, MAX_CARACTERES_DECIMAL_FINANCIAL, type IdentidadeFinancialSimulada } from './financial-dominio';
import type { GrupoAntecipacaoV3, TituloAntecipacaoV3 } from './financial-v3-antecipacoes';
import type { consultarAntecipacoesFinancialV3, ConsultaAntecipacoesV3 } from './financial-v3-consultas';
import { janelaDaCompetencia, mesmaIdentidadeMensalV3, mesmaLoja, mesmoIntervalo } from './financial-v3-eventos-mensais';
import { diaDoPainelValido } from './painel-campos';

export interface EntradaCustoAntecipacaoMensalV3 {
  readonly origem: 'SIMULACAO';
  readonly identidade: IdentidadeFinancialSimulada;
  readonly fonte: Awaited<ReturnType<typeof consultarAntecipacoesFinancialV3>> | null;
  readonly evidencia?: {
    readonly identidade?: Partial<Record<keyof IdentidadeFinancialSimulada, string | null>> | null;
    readonly consulta?: ConsultaAntecipacoesV3 | null;
    readonly coberturaCompleta?: boolean | null;
    readonly apuracaoEncerrada?: boolean | null;
    readonly titulosDaIdentidade?: boolean | null;
    /** A taxa de antecipação é o único desconto entre os valores original e antecipado. */
    readonly descontoExclusivoDaAntecipacao?: boolean | null;
  } | null;
  /** Base em centavos do percentual efetivo desta operação, atestada para a própria ocorrência da consulta. */
  readonly basesPorTitulo?: ReadonlyMap<TituloAntecipacaoV3, bigint>;
}

type Estado = 'PENDENTE' | 'COMPATIVEL' | 'DIVERGENTE';
type Motivo = 'IDENTIDADE_CENARIO_INVALIDA' | 'IDENTIDADE_ANTECIPACOES_DIVERGENTE' | 'TITULOS_SEM_ATRIBUICAO'
  | 'ANTECIPACOES_AUSENTES' | 'VINCULO_EVIDENCIA_ANTECIPACOES' | 'LOJA_DIVERGENTE'
  | 'FILTRO_ANTECIPACOES_INCOMPATIVEL' | 'JANELA_ANTECIPACOES_DIVERGENTE'
  | 'COBERTURA_ANTECIPACOES_NAO_COMPROVADA' | 'APURACAO_ANTECIPACOES_NAO_ENCERRADA'
  | 'PERIODO_GRUPO_INDETERMINADO' | 'GRUPO_FORA_DA_COMPETENCIA' | 'LISTA_DE_TITULOS_AUSENTE'
  | 'ESTADO_DO_TITULO_DESCONHECIDO' | 'DATAS_DO_TITULO_AUSENTES_OU_INVALIDAS' | 'ANTECEDENCIA_NAO_COMPROVADA'
  | 'VALOR_ORIGINAL_AUSENTE_OU_NEGATIVO' | 'VALOR_ANTECIPADO_AUSENTE_OU_NEGATIVO' | 'TAXA_AUSENTE_OU_NEGATIVA'
  | 'DESCONTO_EXCLUSIVO_NAO_COMPROVADO' | 'BASE_DO_TITULO_NAO_ATESTADA' | 'BASE_DO_TITULO_NAO_POSITIVA'
  | 'PERCENTUAL_AUSENTE_OU_INVALIDO' | 'PERCENTUAL_FORA_DO_LIMITE_LOCAL' | 'ARREDONDAMENTO_NAO_COMPROVADO';

function fonteAtribuida({ identidade, fonte, evidencia }: EntradaCustoAntecipacaoMensalV3, motivos: Set<Motivo>) {
  if (!identidadeFinancialSimuladaValida(identidade) || !lerIdDaLojaIfood(identidade.merchant)) motivos.add('IDENTIDADE_CENARIO_INVALIDA');
  if (!mesmaIdentidadeMensalV3(identidade, evidencia?.identidade)) motivos.add('IDENTIDADE_ANTECIPACOES_DIVERGENTE');
  if (evidencia?.titulosDaIdentidade !== true) motivos.add('TITULOS_SEM_ATRIBUICAO');
  if (!mesmoIntervalo(fonte?.antecipacoes, evidencia?.consulta) || fonte?.filtro !== evidencia?.consulta?.filtro)
    motivos.add('VINCULO_EVIDENCIA_ANTECIPACOES');
  if (!fonte) {
    motivos.add('ANTECIPACOES_AUSENTES');
    return false;
  }
  if (!Array.isArray(fonte.antecipacoes?.grupos)) throw new Error('Resultado de consulta de antecipações Financial v3 inválido.');
  if (fonte.filtro !== 'APURACAO') motivos.add('FILTRO_ANTECIPACOES_INCOMPATIVEL');
  if (!mesmaLoja(fonte.antecipacoes.merchantId, identidade?.merchant)) motivos.add('LOJA_DIVERGENTE');
  if (!janelaDaCompetencia(fonte.antecipacoes, identidade?.competencia)) motivos.add('JANELA_ANTECIPACOES_DIVERGENTE');
  return motivos.size === 0;
}

function periodoDoGrupo(grupo: GrupoAntecipacaoV3, competencia: string): Motivo | null {
  const { inicioApuracao, fimApuracao } = grupo;
  if (!diaDoPainelValido(inicioApuracao) || !diaDoPainelValido(fimApuracao) || fimApuracao < inicioApuracao)
    return 'PERIODO_GRUPO_INDETERMINADO';
  if (inicioApuracao.slice(0, 7) !== competencia || fimApuracao.slice(0, 7) !== competencia) return 'GRUPO_FORA_DA_COMPETENCIA';
  return null;
}

function impedimentoDoTitulo(titulo: TituloAntecipacaoV3): Motivo | null {
  if (titulo.estado !== 'SUCCEED') return 'ESTADO_DO_TITULO_DESCONHECIDO';
  if (!diaDoPainelValido(titulo.pagamentoOriginalEm) || !diaDoPainelValido(titulo.pagamentoAntecipadoEm))
    return 'DATAS_DO_TITULO_AUSENTES_OU_INVALIDAS';
  if (titulo.pagamentoAntecipadoEm >= titulo.pagamentoOriginalEm) return 'ANTECEDENCIA_NAO_COMPROVADA';
  return null;
}

function valorNaoNegativo(valor: bigint | null): valor is bigint {
  return typeof valor === 'bigint' && valor >= 0n;
}

/** Compara o percentual declarado com 100 × taxa/base por multiplicação cruzada. */
function compararPercentual(literal: string | null, taxa: bigint, base: bigint, motivos: Motivo[]): Estado {
  if (typeof literal === 'string' && literal.length > MAX_CARACTERES_DECIMAL_FINANCIAL) {
    motivos.push('PERCENTUAL_FORA_DO_LIMITE_LOCAL');
    return 'PENDENTE';
  }
  const partes = typeof literal === 'string' && /^(-?(?:0|[1-9]\d*))(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(literal);
  if (!partes) {
    motivos.push('PERCENTUAL_AUSENTE_OU_INVALIDO');
    return 'PENDENTE';
  }
  const [, inteiro, fracao = '', exp = '0'] = partes;
  const expoente = BigInt(exp);
  const limite = BigInt(MAX_CARACTERES_DECIMAL_FINANCIAL);
  if (expoente < -limite || expoente > limite) {
    motivos.push('PERCENTUAL_FORA_DO_LIMITE_LOCAL');
    return 'PENDENTE';
  }
  const coeficiente = BigInt(inteiro + fracao);
  if (coeficiente < 0n) {
    motivos.push('PERCENTUAL_AUSENTE_OU_INVALIDO');
    return 'PENDENTE';
  }
  const escala = expoente - BigInt(fracao.length);
  const numerador = escala > 0n ? coeficiente * 10n ** escala : coeficiente;
  const denominador = escala < 0n ? 10n ** -escala : 1n;
  const custoNumerador = numerador * base;
  const custoDenominador = 100n * denominador;
  if (custoNumerador % custoDenominador !== 0n) {
    motivos.push('ARREDONDAMENTO_NAO_COMPROVADO');
    return 'PENDENTE';
  }
  return custoNumerador === taxa * custoDenominador ? 'COMPATIVEL' : 'DIVERGENTE';
}

function conferirTitulo(entrada: EntradaCustoAntecipacaoMensalV3, grupo: GrupoAntecipacaoV3, titulo: TituloAntecipacaoV3,
  indiceGrupo: number, indiceTitulo: number, impedimentoGrupo: Motivo | null) {
  const { tipo, estado: estadoDeclarado, pagamentoOriginalEm, pagamentoAntecipadoEm, valorOriginalCentavos,
    valorAntecipadoCentavos, taxaCentavos, taxaPercentual } = titulo;
  const diferencaBrutoLiquidoCentavos = valorNaoNegativo(valorOriginalCentavos) && valorNaoNegativo(valorAntecipadoCentavos)
    ? valorOriginalCentavos - valorAntecipadoCentavos : null;
  const baseAtestada = entrada.basesPorTitulo?.get(titulo);
  const baseCentavos = typeof baseAtestada === 'bigint' && baseAtestada > 0n ? baseAtestada : null;
  const monetario = { estado: 'EXCLUIDO' as Estado | 'EXCLUIDO', motivos: [] as Motivo[], diferencaBrutoLiquidoCentavos };
  const percentual = { estado: 'EXCLUIDO' as Estado | 'EXCLUIDO', motivos: [] as Motivo[], baseCentavos };
  const linha = { indiceGrupo, indiceTitulo, inicioApuracao: grupo.inicioApuracao, fimApuracao: grupo.fimApuracao,
    tipo, estadoDeclarado, pagamentoOriginalEm, pagamentoAntecipadoEm, valorOriginalCentavos, valorAntecipadoCentavos,
    taxaCentavos, taxaPercentual, monetario, percentual };
  if (estadoDeclarado === 'FAILED') return { ...linha, tratamento: 'EXCLUIDO_FAILED' as const };
  const impedimento = impedimentoGrupo ?? impedimentoDoTitulo(titulo);
  if (impedimento) {
    monetario.motivos.push(impedimento);
    percentual.motivos.push(impedimento);
    monetario.estado = percentual.estado = 'PENDENTE';
    return { ...linha, tratamento: 'PENDENTE' as const };
  }
  if (!valorNaoNegativo(valorOriginalCentavos)) monetario.motivos.push('VALOR_ORIGINAL_AUSENTE_OU_NEGATIVO');
  if (!valorNaoNegativo(valorAntecipadoCentavos)) monetario.motivos.push('VALOR_ANTECIPADO_AUSENTE_OU_NEGATIVO');
  if (entrada.evidencia?.descontoExclusivoDaAntecipacao !== true) monetario.motivos.push('DESCONTO_EXCLUSIVO_NAO_COMPROVADO');
  if (!valorNaoNegativo(taxaCentavos)) {
    monetario.motivos.push('TAXA_AUSENTE_OU_NEGATIVA');
    percentual.motivos.push('TAXA_AUSENTE_OU_NEGATIVA');
  }
  if (baseCentavos === null) percentual.motivos.push(baseAtestada === undefined ? 'BASE_DO_TITULO_NAO_ATESTADA' : 'BASE_DO_TITULO_NAO_POSITIVA');
  monetario.estado = monetario.motivos.length ? 'PENDENTE' : diferencaBrutoLiquidoCentavos === taxaCentavos ? 'COMPATIVEL' : 'DIVERGENTE';
  percentual.estado = baseCentavos !== null && valorNaoNegativo(taxaCentavos)
    ? compararPercentual(taxaPercentual, taxaCentavos, baseCentavos, percentual.motivos) : 'PENDENTE';
  return { ...linha, tratamento: 'REALIZADO' as const };
}

type TituloConferido = ReturnType<typeof conferirTitulo>;

function somar(total: bigint | null, valor: bigint | null) {
  return total !== null && valor !== null ? total + valor : null;
}

function estadoMensal(motivos: Set<Motivo>, divergente: boolean): Estado {
  return motivos.size ? 'PENDENTE' : divergente ? 'DIVERGENTE' : 'COMPATIVEL';
}

function resumir(titulos: TituloConferido[], motivosDoMes: Set<Motivo>) {
  const motivosMonetarios = new Set(motivosDoMes), motivosPercentuais = new Set(motivosDoMes);
  let integral = motivosDoMes.size === 0, realizado = false, divergenciaMonetaria = false, divergenciaPercentual = false;
  let taxas: bigint | null = 0n, diferencas: bigint | null = 0n, bases: bigint | null = 0n;
  for (const titulo of titulos) {
    if (titulo.tratamento === 'EXCLUIDO_FAILED') continue;
    for (const motivo of titulo.monetario.motivos) motivosMonetarios.add(motivo);
    for (const motivo of titulo.percentual.motivos) motivosPercentuais.add(motivo);
    if (titulo.tratamento === 'PENDENTE') {
      integral = false;
      continue;
    }
    realizado = true;
    divergenciaMonetaria ||= titulo.monetario.estado === 'DIVERGENTE';
    divergenciaPercentual ||= titulo.percentual.estado === 'DIVERGENTE';
    taxas = somar(taxas, valorNaoNegativo(titulo.taxaCentavos) ? titulo.taxaCentavos : null);
    diferencas = somar(diferencas, titulo.monetario.diferencaBrutoLiquidoCentavos);
    bases = somar(bases, titulo.percentual.baseCentavos);
  }
  const monetario = { estado: estadoMensal(motivosMonetarios, divergenciaMonetaria), motivos: [...motivosMonetarios],
    taxaInformadaCentavos: integral ? taxas : null, diferencaBrutoLiquidoCentavos: integral ? diferencas : null };
  // A razão efetiva independe de haver um percentual declarado. O denominador precisa cobrir todos os títulos realizados.
  const percentual = { estado: integral && !realizado ? 'SEM_APLICACAO' as const : estadoMensal(motivosPercentuais, divergenciaPercentual),
    motivos: [...motivosPercentuais], efetivoPonderado: integral && taxas !== null && bases !== null && bases > 0n
      ? { taxaCentavos: taxas, baseCentavos: bases } : null };
  const motivos = new Set([...motivosMonetarios, ...motivosPercentuais]);
  return { estado: estadoMensal(motivos, divergenciaMonetaria || divergenciaPercentual), motivos: [...motivos], monetario, percentual };
}

/** Confere o custo de cada antecipação na competência civil de apuração da loja. */
export function conferirCustoAntecipacaoMensalV3(entrada: EntradaCustoAntecipacaoMensalV3) {
  if (entrada?.origem !== 'SIMULACAO') throw new Error('Origem incompatível com a conferência simulada de antecipações Financial v3.');
  const motivos = new Set<Motivo>();
  const atribuida = fonteAtribuida(entrada, motivos);
  if (entrada.evidencia?.coberturaCompleta !== true) motivos.add('COBERTURA_ANTECIPACOES_NAO_COMPROVADA');
  if (entrada.evidencia?.apuracaoEncerrada !== true) motivos.add('APURACAO_ANTECIPACOES_NAO_ENCERRADA');
  const titulos: TituloConferido[] = [];
  if (atribuida && entrada.fonte) {
    entrada.fonte.antecipacoes.grupos.forEach((grupo, indiceGrupo) => {
      const impedimento = periodoDoGrupo(grupo, entrada.identidade.competencia);
      if (impedimento) motivos.add(impedimento);
      if (grupo.itens === null) motivos.add('LISTA_DE_TITULOS_AUSENTE');
      else grupo.itens.forEach((titulo, indiceTitulo) => titulos.push(conferirTitulo(entrada, grupo, titulo, indiceGrupo, indiceTitulo, impedimento)));
    });
  }
  return { origem: entrada.origem, identidade: entrada.identidade, titulos, ...resumir(titulos, motivos) };
}
