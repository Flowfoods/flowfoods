/**
 * WhatsAppService — a ÚNICA porta de saída para a Evolution.
 *
 * Contrato compartilhado pelos 3 caminhos. A assinatura de `sendText` não muda;
 * o Caminho 3 acrescenta fila, tetos e dry-run por dentro.
 *
 * Regra de ouro: nenhum código do portal chama a Evolution direto. Se existir um
 * segundo caminho de saída, os tetos deixam de valer e o número queima — e o
 * número é o ativo mais caro da operação, porque leva 2–3 semanas para aquecer
 * outro.
 *
 * As dependências entram por injeção (`Portas`) para o teste rodar sem banco,
 * sem Redis e sem rede — e para o dry-run poder provar que fez ZERO chamadas.
 */

import type { DateTime } from 'luxon';
import { podeEnviar, sortearIntervaloSegundos, type Decisao, type EstadoEnvio } from '../barney/tetos';
import { validarTemplate, type CanalTemplate } from '../barney/template-validator';
import type { Toque } from '../barney/regras';

export type StatusMensagem =
  | 'PENDENTE'
  | 'AGENDADA'
  | 'ENVIADA'
  | 'ENTREGUE'
  | 'LIDA'
  | 'FALHA'
  | 'RECUSADA';

export interface MensagemOutbox {
  id: string;
  direction: 'OUT' | 'IN';
  kind: string;
  status: StatusMensagem;
  dedupKey: string;
  to: string;
  corpoRenderizado: string;
  leadId?: string;
  enrollmentId?: string;
  toque?: Toque;
  evolutionMessageId?: string;
  erro?: string;
  tentativas: number;
  agendadaPara?: DateTime;
  enviadaEm?: DateTime;
}

export interface PedidoEnvio {
  to: string;
  text: string;
  dedupKey: string;
  kind: string;
  leadId?: string;
  enrollmentId?: string;
  toque?: Toque;
  canal?: CanalTemplate;
  /** Envio disparado à mão no "Enviar agora". */
  manual?: boolean;
}

/**
 * De quem é a culpa quando não enviou.
 *
 * `ITEM`   — o problema é DESTA mensagem (corpo reprovado, já enviada hoje). A
 *            fila deve pular para a próxima.
 * `GLOBAL` — o problema é do número ou do dia (teto, janela, stop-loss,
 *            Evolution fora do ar). Insistir com o próximo item só piora.
 *
 * Sem essa distinção um único lead com dado ruim — `avaliacoes: 0` reprova no
 * validador — travaria o lote inteiro do dia.
 */
export type EscopoFalha = 'ITEM' | 'GLOBAL';

export interface ResultadoEnvio {
  ok: boolean;
  mensagem?: MensagemOutbox;
  /** Motivo legível quando `ok` é false. */
  motivo?: string;
  /** Presente quando `ok` é false: diz se a fila continua ou para. */
  escopo?: EscopoFalha;
  decisao?: Decisao;
  /** `true` quando nada foi para a rede porque o serviço está em dry-run. */
  simulado?: boolean;
}

/** Porta de persistência do outbox. */
export interface RepositorioOutbox {
  /** Devolve a mensagem existente com esse dedupKey, se houver. */
  acharPorDedup(dedupKey: string): Promise<MensagemOutbox | null>;
  salvar(m: MensagemOutbox): Promise<MensagemOutbox>;
  atualizar(id: string, patch: Partial<MensagemOutbox>): Promise<MensagemOutbox>;
}

/** Porta de transporte — a Evolution de verdade, ou um mock no teste. */
export interface TransporteEvolution {
  enviarTexto(params: { to: string; text: string }): Promise<{ messageId: string }>;
}

export interface Portas {
  outbox: RepositorioOutbox;
  transporte: TransporteEvolution;
  estado: () => Promise<EstadoEnvio>;
  agora: () => DateTime;
  novoId: () => string;
  /** Registra na timeline do lead. */
  auditar?: (evento: string, dados: Record<string, unknown>) => Promise<void>;
}

export interface OpcoesServico {
  /**
   * Dry-run: percorre TODA a lógica (dedup, tetos, validação, outbox) e não
   * toca no transporte. É assim que o Rodolfo confere um lote de 30 antes de
   * ligar a chave.
   */
  dryRun?: boolean;
  /** Tentativas totais por mensagem antes de desistir. */
  maxTentativas?: number;
}

export class WhatsAppService {
  constructor(
    private readonly portas: Portas,
    private readonly opcoes: OpcoesServico = {},
  ) {}

  get dryRun(): boolean {
    return this.opcoes.dryRun === true;
  }

  async sendText(pedido: PedidoEnvio): Promise<ResultadoEnvio> {
    const agora = this.portas.agora();

    // 1. Dedup. Vem primeiro: mensagem já enviada não é reavaliada por teto nem
    //    revalidada — só devolvida como está.
    const existente = await this.portas.outbox.acharPorDedup(pedido.dedupKey);
    if (existente) {
      return {
        ok: false,
        mensagem: existente,
        motivo: 'DEDUP: mensagem já existe para esta chave.',
        escopo: 'ITEM',
      };
    }

    // 2. Validação do corpo JÁ RENDERIZADO. Template que falha não entra na fila.
    if (pedido.toque) {
      const v = validarTemplate(pedido.text, {
        toque: pedido.toque,
        canal: pedido.canal ?? 'WHATSAPP',
        renderizado: true,
      });
      if (!v.valido) {
        const detalhe = v.violacoes.map((x) => `${x.regra}: ${x.detalhe}`).join(' | ');
        await this.portas.auditar?.('mensagem_recusada_validador', {
          dedupKey: pedido.dedupKey,
          violacoes: v.violacoes,
        });
        return { ok: false, motivo: `VALIDADOR: ${detalhe}`, escopo: 'ITEM' };
      }
    }

    // 3. Tetos e stop-loss.
    const estado = await this.portas.estado();
    const decisao = podeEnviar(estado, agora, { manual: pedido.manual });
    if (!decisao.permitido) {
      return {
        ok: false,
        motivo: `${decisao.motivo}: ${decisao.explicacao}`,
        escopo: 'GLOBAL',
        decisao,
      };
    }

    // 4. Grava no outbox ANTES de mandar. Se o processo morrer entre o insert e
    //    a rede, sobra um PENDENTE visível — melhor que um envio fantasma.
    const registro = await this.portas.outbox.salvar({
      id: this.portas.novoId(),
      direction: 'OUT',
      kind: pedido.kind,
      status: 'PENDENTE',
      dedupKey: pedido.dedupKey,
      to: pedido.to,
      corpoRenderizado: pedido.text,
      leadId: pedido.leadId,
      enrollmentId: pedido.enrollmentId,
      toque: pedido.toque,
      tentativas: 0,
    });

    if (this.dryRun) {
      const simulada = await this.portas.outbox.atualizar(registro.id, {
        status: 'AGENDADA',
        agendadaPara: agora,
      });
      return { ok: true, mensagem: simulada, simulado: true, decisao };
    }

    return this.entregar(registro, decisao);
  }

  /** Retry com backoff exponencial. 3 tentativas por padrão. */
  private async entregar(registro: MensagemOutbox, decisao: Decisao): Promise<ResultadoEnvio> {
    const max = this.opcoes.maxTentativas ?? 3;
    let ultimoErro = '';

    for (let tentativa = 1; tentativa <= max; tentativa += 1) {
      try {
        const { messageId } = await this.portas.transporte.enviarTexto({
          to: registro.to,
          text: registro.corpoRenderizado,
        });
        const enviada = await this.portas.outbox.atualizar(registro.id, {
          status: 'ENVIADA',
          evolutionMessageId: messageId,
          enviadaEm: this.portas.agora(),
          tentativas: tentativa,
        });
        return { ok: true, mensagem: enviada, decisao };
      } catch (e) {
        ultimoErro = e instanceof Error ? e.message : String(e);
        await this.portas.outbox.atualizar(registro.id, { tentativas: tentativa, erro: ultimoErro });
      }
    }

    const falha = await this.portas.outbox.atualizar(registro.id, {
      status: 'FALHA',
      erro: ultimoErro,
    });
    return {
      ok: false,
      mensagem: falha,
      motivo: `FALHA após ${max} tentativas: ${ultimoErro}`,
      escopo: 'GLOBAL',
    };
  }

  /** Intervalo até o próximo envio da fila, respeitando o piso rígido. */
  proximoIntervaloSegundos(aleatorio?: () => number): number {
    return sortearIntervaloSegundos(aleatorio);
  }
}
