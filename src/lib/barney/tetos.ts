/**
 * Motor de tetos do Barney — a trava que decide se PODE enviar agora.
 *
 * Toda saída de mensagem passa por `podeEnviar`. Não existe caminho alternativo:
 * o `WhatsAppService` chama isto antes de tocar na Evolution, e o worker chama
 * isto antes de tirar da fila. Se um dia aparecer um segundo caminho de envio,
 * ele está errado.
 *
 * Cada recusa devolve um `motivo` distinto porque a tela `/rodolfo/barney`
 * mostra literalmente por que a fila parou — "não enviou" sem causa é o tipo de
 * silêncio que faz o Rodolfo desligar a trava.
 */

import type { DateTime } from 'luxon';
import {
  ENVIOS_MANUAIS_INICIAIS,
  INTERVALO_MIN_S,
  INTERVALO_PADRAO_MAX_S,
  INTERVALO_PADRAO_MIN_S,
  MAX_POR_DIA,
  MAX_POR_HORA,
  RAMPA_POR_SEMANA,
  RAMPA_TETO_FINAL,
  STOP_LOSS,
} from './regras';
import { dentroDaJanela, janelaPadrao, type Janela } from './janela';

export type MotivoRecusa =
  | 'DISPARO_DESLIGADO'
  | 'INSTANCIA_FORA_DO_AR'
  | 'STOP_LOSS_FALHAS'
  | 'STOP_LOSS_ENTREGA'
  | 'FORA_DA_JANELA'
  | 'TETO_DIARIO'
  | 'TETO_HORARIO'
  | 'INTERVALO_MINIMO'
  | 'EXIGE_ENVIO_MANUAL';

export interface EstadoEnvio {
  /** `Setting.disparoAtivo`. Default false — nada sai até o Rodolfo ligar. */
  disparoAtivo: boolean;
  /** `InstanceState.estado` vindo do CONNECTION_UPDATE da Evolution. */
  estadoInstancia: string;
  /** Início da rampa: primeiro envio do número, manual. `null` = nunca enviou. */
  primeiroEnvioEm: DateTime | null;
  /** Total histórico de envios do número — governa os 10 manuais iniciais. */
  totalEnviadoHistorico: number;
  /** `DailyCounter` do dia corrente, em America/Sao_Paulo. */
  enviadosHoje: number;
  entreguesHoje: number;
  falhasConsecutivas: number;
  /** Envios nos últimos 60 minutos corridos. */
  enviadosUltimaHora: number;
  ultimoEnvioEm: DateTime | null;
  janela?: Janela;
  /**
   * Tetos vindos de `/rodolfo/config`. Só APERTAM: o valor efetivo é o MENOR
   * entre este, a rampa e a constante rígida. Ausente = usa o rígido.
   */
  maxPorDiaConfig?: number;
  maxPorHoraConfig?: number;
}

export interface OpcoesEnvio {
  /**
   * Envio disparado à mão pelo Rodolfo em "Enviar agora". Pula a exigência de
   * envio manual (obviamente) e a janela — ele é humano, escolhe a hora dele.
   * NÃO pula teto, intervalo nem stop-loss: esses existem contra o WhatsApp,
   * não contra o operador.
   */
  manual?: boolean;
}

export interface Decisao {
  permitido: boolean;
  motivo?: MotivoRecusa;
  /** Texto pronto para a tela e para o audit log. */
  explicacao?: string;
  /** Teto de hoje já considerando a rampa. */
  tetoDiaVigente: number;
  /** Quando faz sentido tentar de novo — alimenta o reagendamento da fila. */
  tentarEmSegundos?: number;
}

/**
 * Teto do dia pela rampa do número.
 *
 * Semana 1 = 10/dia, semana 2 = 20/dia, depois 30. A contagem começa no
 * primeiro envio, não na criação da instância — número criado e esquecido por um
 * mês não está aquecido, está parado.
 */
export function tetoDiarioVigente(
  primeiroEnvioEm: DateTime | null,
  ref: DateTime,
  tetoConfig?: number,
): number {
  const comConfig = (n: number) => Math.min(n, tetoConfig ?? MAX_POR_DIA, MAX_POR_DIA);

  if (!primeiroEnvioEm) return comConfig(RAMPA_POR_SEMANA[0]);

  const dias = Math.floor(ref.diff(primeiroEnvioEm, 'days').days);
  // Data futura só acontece com relógio errado ou dado corrompido. Na dúvida,
  // trata como número novo: o erro barato é enviar de menos.
  if (dias < 0) return comConfig(RAMPA_POR_SEMANA[0]);

  const semana = Math.floor(dias / 7);
  const teto = RAMPA_POR_SEMANA[semana] ?? RAMPA_TETO_FINAL;
  // Cinto e suspensório: a rampa jamais ultrapassa o teto absoluto.
  return comConfig(teto);
}

export function podeEnviar(estado: EstadoEnvio, agora: DateTime, opts: OpcoesEnvio = {}): Decisao {
  const janela = estado.janela ?? janelaPadrao();
  const tetoDiaVigente = tetoDiarioVigente(estado.primeiroEnvioEm, agora, estado.maxPorDiaConfig);
  const tetoHora = Math.min(estado.maxPorHoraConfig ?? MAX_POR_HORA, MAX_POR_HORA);

  const negar = (
    motivo: MotivoRecusa,
    explicacao: string,
    tentarEmSegundos?: number,
  ): Decisao => ({ permitido: false, motivo, explicacao, tetoDiaVigente, tentarEmSegundos });

  // 1. Chave geral. Default false: o portal nasce mudo de propósito.
  if (!estado.disparoAtivo) {
    return negar('DISPARO_DESLIGADO', 'Disparo desligado em /rodolfo/config.');
  }

  // 2–4. Stop-loss. Vem antes da janela porque estes exigem ação humana, não espera.
  if (estado.estadoInstancia !== STOP_LOSS.estadoInstanciaExigido) {
    return negar(
      'INSTANCIA_FORA_DO_AR',
      `Instância em "${estado.estadoInstancia}" (esperado "open"). Reconectar antes de retomar.`,
    );
  }

  if (estado.falhasConsecutivas >= STOP_LOSS.falhasConsecutivas) {
    return negar(
      'STOP_LOSS_FALHAS',
      `${estado.falhasConsecutivas} falhas consecutivas. Pausa geral até revisão.`,
    );
  }

  if (estado.enviadosHoje >= STOP_LOSS.amostraMinimaEntrega) {
    const taxa = estado.entreguesHoje / estado.enviadosHoje;
    if (taxa < STOP_LOSS.taxaEntregaMinima) {
      return negar(
        'STOP_LOSS_ENTREGA',
        `Entrega do dia em ${(taxa * 100).toFixed(0)}% (piso ${STOP_LOSS.taxaEntregaMinima * 100}%). ` +
          `Sinal de bloqueio silencioso — pausa geral.`,
      );
    }
  }

  // 5. Os primeiros envios do número são um a um, na mão.
  if (!opts.manual && estado.totalEnviadoHistorico < ENVIOS_MANUAIS_INICIAIS) {
    const faltam = ENVIOS_MANUAIS_INICIAIS - estado.totalEnviadoHistorico;
    return negar(
      'EXIGE_ENVIO_MANUAL',
      `Faltam ${faltam} envios manuais para o número aquecer. Use "Enviar agora", um a um.`,
    );
  }

  // 6. Janela. Envio manual escolhe a própria hora.
  if (!opts.manual && !dentroDaJanela(agora, janela)) {
    return negar(
      'FORA_DA_JANELA',
      `Fora da janela (seg–sex ${janela.horaInicio}h–${janela.horaFim}h, America/Sao_Paulo).`,
    );
  }

  // 7. Teto do dia.
  if (estado.enviadosHoje >= tetoDiaVigente) {
    return negar(
      'TETO_DIARIO',
      `Teto do dia atingido: ${estado.enviadosHoje}/${tetoDiaVigente}.`,
    );
  }

  // 8. Teto da hora.
  if (estado.enviadosUltimaHora >= tetoHora) {
    return negar(
      'TETO_HORARIO',
      `Teto da hora atingido: ${estado.enviadosUltimaHora}/${tetoHora}.`,
      60 * 10,
    );
  }

  // 9. Intervalo mínimo entre dois envios.
  if (estado.ultimoEnvioEm) {
    const decorrido = agora.diff(estado.ultimoEnvioEm, 'seconds').seconds;
    if (decorrido < INTERVALO_MIN_S) {
      const falta = Math.ceil(INTERVALO_MIN_S - decorrido);
      return negar(
        'INTERVALO_MINIMO',
        `Último envio há ${Math.floor(decorrido)}s; o piso é ${INTERVALO_MIN_S}s.`,
        falta,
      );
    }
  }

  return { permitido: true, tetoDiaVigente };
}

/**
 * Sorteia o intervalo até o próximo envio.
 *
 * `aleatorio` é injetável para o teste ser determinístico. O resultado nunca cai
 * abaixo do piso rígido, mesmo que alguém estrague a faixa configurada.
 */
export function sortearIntervaloSegundos(
  aleatorio: () => number = Math.random,
  min: number = INTERVALO_PADRAO_MIN_S,
  max: number = INTERVALO_PADRAO_MAX_S,
): number {
  const piso = Math.max(INTERVALO_MIN_S, Math.min(min, max));
  const teto = Math.max(piso, Math.max(min, max));
  return Math.round(piso + aleatorio() * (teto - piso));
}
