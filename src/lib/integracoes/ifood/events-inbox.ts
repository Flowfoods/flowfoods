import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import { conferirRecepcaoEventsIfood, mesmoEventoIfood } from './events-recepcao';

const idInterno = z.string().min(1).max(128).refine(valor => valor.trim() === valor);
const alvoSchema = z.strictObject({
  lojaId: idInterno,
  conexaoId: idInterno,
  appId: idInterno,
  merchantId: z.guid().transform(valor => valor.toLowerCase()),
  ambiente: z.enum(['TEST', 'PRODUCAO']),
});
type Alvo = z.infer<typeof alvoSchema>;
type Identidade = Pick<Alvo, 'appId' | 'merchantId' | 'ambiente'>;
type ChamadaAck = Identidade & {
  metodo: 'POST';
  caminho: '/events/v1.0/events/acknowledgment';
  corpo: { id: string }[];
};
type SituacaoAck = 'sem-lote-disponivel' | 'aceito' | 'pendente' | 'inconclusivo';
type Recebimento = { status: number; dados?: unknown };

// O guia do iFood também cita um limite maior na referência da rota. Usamos o menor valor publicado.
const LIMITE_LOTE_ACK = 2000;

export class ErroEventsInbox extends Error {
  constructor(public readonly codigo: 'ALVO' | 'CONFLITO', mensagem: string) {
    super(mensagem);
    this.name = 'ErroEventsInbox';
  }
}

function lerAlvo(entrada: unknown): Alvo {
  const alvo = alvoSchema.safeParse(entrada);
  if (!alvo.success) throw new ErroEventsInbox('ALVO', 'Informe o escopo do app e da loja para Events.');
  return alvo.data;
}

async function conferirConexao(tx: ClienteDoParceiro, alvo: Alvo): Promise<void> {
  const conexao = await tx.integracaoConexao.findFirst({
    where: {
      parceiroId: tx.parceiroId, id: alvo.conexaoId, lojaId: alvo.lojaId, ambiente: alvo.ambiente,
      idExterno: alvo.merchantId, provedor: 'IFOOD', estado: 'ATIVA', loja: { ativa: true },
    },
    select: { id: true },
  });
  if (!conexao) throw new ErroEventsInbox('ALVO', 'Conexão Events indisponível para o escopo informado.');
}

/** Registra uma recepção e a intenção de ACK do app receptor na mesma transação. */
export async function gravarLoteEventsIfood(cliente: ClienteDoParceiro, entrada: unknown, resposta: Recebimento) {
  if (cliente.emTransacao) throw new ErroEventsInbox('ALVO', 'A gravação de Events precisa controlar a transação do lote.');
  const alvo = lerAlvo(entrada);
  const lote = conferirRecepcaoEventsIfood({ merchantId: alvo.merchantId, ambiente: alvo.ambiente }, resposta);
  const { lojaId, conexaoId, ambiente, merchantId } = alvo;

  return cliente.transacao(async tx => {
    await conferirConexao(tx, alvo);
    if (!lote.eventos.length) return { novos: 0, reentregues: 0 };

    // Ordem consistente de inserção para lotes concorrentes. A projeção do contrato mantém a ordem recebida.
    const eventos = [...lote.eventos].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const novos = await tx.integracaoEventoIfood.createMany({
      data: eventos.map(evento => ({
        parceiroId: tx.parceiroId, lojaId, conexaoId, ambiente, merchantId, eventoId: evento.id, pedidoId: evento.orderId,
        codigo: evento.code, codigoCompleto: evento.fullCode, criadoNoIfoodEm: evento.createdAt,
        categoria: evento.category, canal: evento.salesChannel,
      })),
      skipDuplicates: true,
    });
    const gravados = await tx.integracaoEventoIfood.findMany({
      where: {
        parceiroId: tx.parceiroId, ambiente: alvo.ambiente, merchantId: alvo.merchantId,
        eventoId: { in: eventos.map(evento => evento.id) },
      },
    });
    const porId = new Map(gravados.map(evento => [evento.eventoId, evento]));
    const entregas = eventos.map(evento => {
      const gravado = porId.get(evento.id);
      if (!gravado || gravado.lojaId !== lojaId || !mesmoEventoIfood({
        id: gravado.eventoId, merchantId: gravado.merchantId, orderId: gravado.pedidoId,
        code: gravado.codigo, fullCode: gravado.codigoCompleto, createdAt: gravado.criadoNoIfoodEm,
        category: gravado.categoria, salesChannel: gravado.canal,
      }, evento)) {
        throw new ErroEventsInbox('CONFLITO', 'A reentrega diverge do evento já gravado.');
      }
      return { parceiroId: tx.parceiroId, eventoInternoId: gravado.id, appId: alvo.appId };
    });
    await tx.integracaoEventoIfoodAck.createMany({ data: entregas, skipDuplicates: true });
    // Cada recepção reabre o ACK e avança a geração. Uma devolução em voo conserva a posse da tentativa anterior.
    const acks = await tx.integracaoEventoIfoodAck.updateMany({
      where: {
        parceiroId: tx.parceiroId, appId: alvo.appId,
        eventoInternoId: { in: entregas.map(entrega => entrega.eventoInternoId) },
      },
      data: { ackAceitoEm: null, geracao: { increment: 1 } },
    });
    if (acks.count !== entregas.length) throw new ErroEventsInbox('CONFLITO', 'O lote ficou sem registro completo para ACK.');
    return { novos: novos.count, reentregues: eventos.length - novos.count };
  });
}

/** A rede só recebe IDs já gravados. O executor futuro deve autenticar o app receptor e limitar o timeout à posse. */
export async function enviarAckPendenteIfood(
  cliente: ClienteDoParceiro, entrada: unknown, enviar: (chamada: ChamadaAck) => Promise<{ status: number | null }>,
): Promise<{ situacao: SituacaoAck; quantidade: number }> {
  if (cliente.emTransacao) throw new ErroEventsInbox('ALVO', 'O envio de ACK deve iniciar fora de uma transação aberta.');
  const alvo = lerAlvo(entrada);
  const posse = randomUUID();
  const selecionados = await cliente.transacao(async tx => {
    await conferirConexao(tx, alvo);
    return tx.sql<{ id: string; eventoId: string; geracao: number }>`
      WITH pendencias AS (
        SELECT ack.id, evento."eventoId"
          FROM "IntegracaoEventoIfoodAck" AS ack
          JOIN "IntegracaoEventoIfood" AS evento
            ON evento."parceiroId" = ack."parceiroId" AND evento.id = ack."eventoInternoId"
         WHERE ack."parceiroId" = ${tx.parceiroId} AND ack."appId" = ${alvo.appId}
           AND evento."lojaId" = ${alvo.lojaId}
           AND evento.ambiente = ${alvo.ambiente}::"AmbienteDeIntegracao" AND evento."merchantId" = ${alvo.merchantId}
           AND ack."ackAceitoEm" IS NULL AND (ack."posseAte" IS NULL OR ack."posseAte" <= clock_timestamp())
         ORDER BY ack."recebidoEm", ack.id
         LIMIT ${LIMITE_LOTE_ACK}
         FOR UPDATE OF ack SKIP LOCKED
      )
      UPDATE "IntegracaoEventoIfoodAck" AS ack
         SET posse = ${posse}, "posseAte" = clock_timestamp() + interval '2 minutes'
        FROM pendencias
       WHERE ack."parceiroId" = ${tx.parceiroId} AND ack.id = pendencias.id
       RETURNING ack.id, pendencias."eventoId", ack.geracao
    `;
  });

  const quantidade = selecionados.length;
  if (quantidade === 0) return { situacao: 'sem-lote-disponivel', quantidade };

  let status: number | null;
  try {
    const resposta = await enviar({
      appId: alvo.appId, merchantId: alvo.merchantId, ambiente: alvo.ambiente,
      metodo: 'POST', caminho: '/events/v1.0/events/acknowledgment',
      corpo: selecionados.map(evento => ({ id: evento.eventoId })),
    });
    status = resposta.status;
  } catch {
    return { situacao: 'inconclusivo', quantidade };
  }
  if (status !== 202) return { situacao: status === null || status >= 500 ? 'inconclusivo' : 'pendente', quantidade };

  const confirmados = await cliente.transacao(async tx => {
    const destaPosse = { parceiroId: tx.parceiroId, appId: alvo.appId, posse, ackAceitoEm: null } as const;
    const aceitos = await tx.integracaoEventoIfoodAck.updateMany({
      where: { ...destaPosse, OR: selecionados.map(({ id, geracao }) => ({ id, geracao })) },
      data: { ackAceitoEm: new Date(), posse: null, posseAte: null },
    });
    // Reentregas em voo continuam pendentes. Uma posse mais nova pertence a outro executor.
    if (aceitos.count !== quantidade) {
      await tx.integracaoEventoIfoodAck.updateMany({
        where: { ...destaPosse, id: { in: selecionados.map(evento => evento.id) } },
        data: { posse: null, posseAte: null },
      });
    }
    return aceitos;
  });
  return { situacao: confirmados.count === quantidade ? 'aceito' : 'inconclusivo', quantidade };
}
