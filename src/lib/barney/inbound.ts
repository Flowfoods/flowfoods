/**
 * Processamento de resposta recebida (MESSAGES_UPSERT).
 *
 * A ORDEM DOS PASSOS É A REGRA, não um detalhe de implementação:
 *
 *   1. idempotência   — webhook repetido não cria registro repetido
 *   2. salvar         — a resposta existe no banco antes de qualquer decisão
 *   3. PAUSAR         — enrollment pausado ANTES de qualquer outro processamento
 *   4. opt-out        — palavra-chave, ANTES de qualquer IA
 *   5. classificar    — IA (opcional)
 *   6. rascunho       — IA (opcional)
 *   7. notificar      — Rodolfo
 *
 * Por que 3 vem antes de tudo: se a classificação por IA falhar, estourar
 * orçamento ou demorar, o pior resultado aceitável é "respondeu e ninguém
 * classificou". O inaceitável é o D+4 sair para quem já respondeu — isso
 * queima o lead e queima o número. Então a pausa não pode depender de nada
 * que possa falhar.
 *
 * Por que 4 vem antes da IA: honrar a saída é obrigação legal e não pode
 * depender de a Anthropic estar no ar.
 *
 * `passos` no retorno existe para o teste provar a ordem — não é log decorativo.
 */

import type { DateTime } from 'luxon';
import { detectarOptOut } from './optout';
import { dedupKeyWebhook } from './dedup';

export type Intencao = 'INTERESSADO' | 'PERGUNTA' | 'DEPOIS' | 'RECUSA' | 'OPT_OUT' | 'OUTRO';

export interface MensagemRecebida {
  evolutionMessageId: string;
  de: string;
  telefoneNormalizado: string;
  texto: string;
  recebidaEm: DateTime;
  leadId?: string;
  enrollmentId?: string;
}

export interface Classificacao {
  intencao: Intencao;
  confianca: number;
  rascunhoSugerido?: string;
  custoIA?: number;
}

export interface PortasInbound {
  /** `true` se este evolutionMessageId já foi processado. */
  jaProcessado(chave: string): Promise<boolean>;
  salvarMensagem(m: MensagemRecebida): Promise<{ id: string }>;
  /** Pausa o enrollment. Idempotente. */
  pausarEnrollment(enrollmentId: string, motivo: 'RESPOSTA' | 'OPT_OUT'): Promise<void>;
  registrarOptOut(telefoneNormalizado: string, termo: string): Promise<void>;
  /** Ausente quando não há ANTHROPIC_API_KEY ou o orçamento do dia acabou. */
  classificar?: (m: MensagemRecebida) => Promise<Classificacao>;
  salvarClassificacao(messageId: string, c: Classificacao): Promise<void>;
  notificar?: (texto: string) => Promise<void>;
  auditar?: (evento: string, dados: Record<string, unknown>) => Promise<void>;
}

export type Passo =
  | 'IDEMPOTENCIA'
  | 'SALVAR'
  | 'PAUSAR_ENROLLMENT'
  | 'OPT_OUT'
  | 'CLASSIFICAR'
  | 'NOTIFICAR';

export interface ResultadoInbound {
  duplicada: boolean;
  messageId?: string;
  optOut: boolean;
  classificacao?: Classificacao;
  /** Ordem real de execução — o teste de ordem lê daqui. */
  passos: Passo[];
}

export async function processarResposta(
  m: MensagemRecebida,
  portas: PortasInbound,
): Promise<ResultadoInbound> {
  const passos: Passo[] = [];

  // 1. Idempotência.
  passos.push('IDEMPOTENCIA');
  const chave = dedupKeyWebhook(m.evolutionMessageId, 'MESSAGES_UPSERT');
  if (await portas.jaProcessado(chave)) {
    return { duplicada: true, optOut: false, passos };
  }

  // 2. Salvar.
  passos.push('SALVAR');
  const { id: messageId } = await portas.salvarMensagem(m);

  // 3. PAUSAR o enrollment. Antes de tudo que possa falhar.
  if (m.enrollmentId) {
    passos.push('PAUSAR_ENROLLMENT');
    await portas.pausarEnrollment(m.enrollmentId, 'RESPOSTA');
    await portas.auditar?.('enrollment_pausado_por_resposta', {
      enrollmentId: m.enrollmentId,
      messageId,
    });
  }

  // 4. Opt-out por palavra-chave. Sem IA no caminho.
  passos.push('OPT_OUT');
  const saida = detectarOptOut(m.texto);
  if (saida.optOut) {
    await portas.registrarOptOut(m.telefoneNormalizado, saida.termo ?? '');
    if (m.enrollmentId) await portas.pausarEnrollment(m.enrollmentId, 'OPT_OUT');
    await portas.auditar?.('opt_out_registrado', {
      telefone: m.telefoneNormalizado,
      termo: saida.termo,
      regra: saida.regra,
    });

    const classificacao: Classificacao = { intencao: 'OPT_OUT', confianca: 1 };
    await portas.salvarClassificacao(messageId, classificacao);

    passos.push('NOTIFICAR');
    await portas.notificar?.(`🚫 ${m.telefoneNormalizado} pediu saída ("${saida.termo}"). Removido da lista.`);

    return { duplicada: false, messageId, optOut: true, classificacao, passos };
  }

  // 5. Classificação por IA — opcional por design.
  let classificacao: Classificacao | undefined;
  if (portas.classificar) {
    passos.push('CLASSIFICAR');
    try {
      classificacao = await portas.classificar(m);
      await portas.salvarClassificacao(messageId, classificacao);
    } catch (e) {
      // IA fora do ar não pode derrubar o processamento: o enrollment já está
      // pausado e a resposta já está salva. O Inbox mostra sem classificação.
      await portas.auditar?.('classificacao_falhou', {
        messageId,
        erro: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // 6. Notificar.
  passos.push('NOTIFICAR');
  const trecho = m.texto.slice(0, 80).replace(/\s+/g, ' ').trim();
  await portas.notificar?.(
    `🍽️ ${m.telefoneNormalizado} respondeu: "${trecho}" → ${classificacao?.intencao ?? 'SEM CLASSIFICACAO'}`,
  );

  return { duplicada: false, messageId, optOut: false, classificacao, passos };
}
