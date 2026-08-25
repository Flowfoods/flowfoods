/**
 * Portas do pipeline de entrada, sobre Prisma.
 *
 * A ORDEM dos passos é do domínio (`@/lib/barney/inbound`) e é testada lá. Aqui
 * só se implementa cada porta — de propósito: se a ordem morasse na rota HTTP,
 * o teste de ordem não valeria nada para o código que roda em produção.
 */

import { prisma } from '@/lib/db';
import type { Classificacao, MensagemRecebida, PortasInbound } from '@/lib/barney/inbound';
import { dedupKeyWebhook } from '@/lib/barney/dedup';
import { normalizarTelefone } from '@/lib/barney/telefone';

/**
 * O número de destino é o mesmo que está pareado na instância de prospecção?
 *
 * Lê o `numeroProprio` que o worker sincroniza. Devolve `false` quando não
 * sabe — na dúvida, notifica: perder um aviso é pior que mandar um redundante.
 */
async function ehOProprioNumero(destino: string): Promise<boolean> {
  const instancia = await prisma.instanceState.findUnique({
    where: { nome: process.env.EVOLUTION_INSTANCE ?? 'flowfoods-prospeccao' },
    select: { numeroProprio: true },
  });
  if (!instancia?.numeroProprio) return false;
  return normalizarTelefone(instancia.numeroProprio).e164 === destino;
}

export const portasInbound: PortasInbound = {
  async jaProcessado(chave) {
    const achou = await prisma.message.findFirst({
      where: { dedupKey: chave },
      select: { id: true },
    });
    return achou !== null;
  },

  async salvarMensagem(m) {
    const criada = await prisma.message.create({
      data: {
        direction: 'IN',
        kind: 'RESPOSTA',
        status: 'ENTREGUE',
        dedupKey: dedupKeyWebhook(m.evolutionMessageId, 'MESSAGES_UPSERT'),
        evolutionMessageId: m.evolutionMessageId,
        to: m.telefoneNormalizado,
        corpoRenderizado: m.texto,
        leadId: m.leadId,
        enrollmentId: m.enrollmentId,
        tentativas: 0,
      },
    });

    if (m.leadId) {
      await prisma.$transaction([
        prisma.lead.update({ where: { id: m.leadId }, data: { status: 'RESPONDEU' } }),
        prisma.leadEvent.create({
          data: {
            leadId: m.leadId,
            tipo: 'resposta',
            descricao: m.texto.slice(0, 400),
            dados: { evolutionMessageId: m.evolutionMessageId },
          },
        }),
      ]);
    }

    return { id: criada.id };
  },

  async pausarEnrollment(enrollmentId, motivo) {
    // Idempotente por desenho: o pipeline chama duas vezes num opt-out (uma por
    // RESPOSTA, outra por OPT_OUT) e isso tem que ser inofensivo.
    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: {
        status: motivo === 'OPT_OUT' ? 'OPT_OUT' : 'PAUSADA_RESPOSTA',
        pausadoEm: new Date(),
        motivoPausa: motivo,
        // Zera o agendamento: enquanto houver `proximoEnvioEm`, o worker
        // continuaria enxergando este enrollment como trabalho a fazer.
        proximoEnvioEm: null,
      },
    });
  },

  async registrarOptOut(telefoneNormalizado, termo) {
    await prisma.$transaction([
      prisma.optOut.upsert({
        where: { telefoneNormalizado },
        create: { telefoneNormalizado, termo, origem: 'RESPOSTA' },
        update: { termo },
      }),
      // O status do lead também vira OPT_OUT, mas quem garante a permanência é a
      // tabela `OptOut`: ela é chaveada por telefone e sobrevive a apagar o lead
      // e reimportar a planilha.
      prisma.lead.updateMany({
        where: { telefoneNormalizado },
        data: { status: 'OPT_OUT' },
      }),
    ]);
  },

  async salvarClassificacao(messageId: string, c: Classificacao) {
    await prisma.inboundClassification.upsert({
      where: { messageId },
      create: {
        messageId,
        intencao: c.intencao,
        confianca: c.confianca,
        rascunhoSugerido: c.rascunhoSugerido,
        custoIA: c.custoIA,
      },
      update: {
        intencao: c.intencao,
        confianca: c.confianca,
        rascunhoSugerido: c.rascunhoSugerido,
        custoIA: c.custoIA,
      },
    });
  },

  async notificar(texto) {
    const url = process.env.EVOLUTION_API_URL;
    const key = process.env.EVOLUTION_API_KEY;
    const destino = normalizarTelefone(process.env.RODOLFO_WHATSAPP).e164;
    // Instância de notificação separada, quando o Rodolfo quiser desacoplar o
    // número que avisa do número que prospecta.
    const notifyInstance = process.env.EVOLUTION_NOTIFY_INSTANCE;
    const instancia = notifyInstance ?? process.env.EVOLUTION_INSTANCE;

    if (!url || !key || !destino || !instancia) return;

    // Prospectar do próprio telefone: notificar seria mandar mensagem para si
    // mesmo. A resposta do lead já chegou no aparelho — o aviso não informa
    // nada e ainda gasta atividade do número. Só vale a pena checar quando NÃO
    // há instância de notificação separada.
    if (!notifyInstance && (await ehOProprioNumero(destino))) return;

    try {
      await fetch(`${url.replace(/\/+$/, '')}/message/sendText/${instancia}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key },
        body: JSON.stringify({ number: destino, text: texto }),
      });
    } catch {
      // Notificação que falha não pode derrubar o processamento da resposta: a
      // resposta já está salva e o enrollment já está pausado, que é o que
      // importa.
    }
  },

  async auditar(evento, dados) {
    await prisma.auditLog.create({ data: { evento, dados: dados as object } });
  },
};

/** Casa o telefone que respondeu com o lead e o enrollment ativo dele. */
export async function acharLeadPorTelefone(
  telefoneNormalizado: string,
): Promise<Pick<MensagemRecebida, 'leadId' | 'enrollmentId'>> {
  const lead = await prisma.lead.findUnique({
    where: { telefoneNormalizado },
    select: {
      id: true,
      enrollments: {
        where: { status: 'ATIVA' },
        select: { id: true },
        take: 1,
      },
    },
  });

  return { leadId: lead?.id, enrollmentId: lead?.enrollments[0]?.id };
}
