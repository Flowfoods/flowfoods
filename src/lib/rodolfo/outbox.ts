/**
 * `RepositorioOutbox` sobre Prisma + a fábrica do `WhatsAppService`.
 *
 * O dedup real acontece na constraint UNIQUE de `Message.dedupKey`. O
 * `acharPorDedup` aqui é só o caminho rápido: quem garante que dois workers
 * simultâneos não mandam a mesma mensagem duas vezes é o banco.
 */

import { DateTime } from 'luxon';
import { prisma } from '@/lib/db';
import { TIMEZONE } from '@/lib/barney/regras';
import {
  WhatsAppService,
  type MensagemOutbox,
  type RepositorioOutbox,
  type TransporteEvolution,
} from '@/lib/whatsapp/service';
import { TransporteEvolutionHttp } from '@/lib/whatsapp/evolution';
import { agoraSP, montarEstadoEnvio, registrarEnvio } from './estado';

type LinhaMessage = Awaited<ReturnType<typeof prisma.message.findFirst>>;

function paraDominio(m: NonNullable<LinhaMessage>): MensagemOutbox {
  const dt = (d: Date | null) => (d ? DateTime.fromJSDate(d).setZone(TIMEZONE) : undefined);
  return {
    id: m.id,
    direction: m.direction,
    kind: m.kind,
    status: m.status,
    dedupKey: m.dedupKey,
    to: m.to ?? '',
    corpoRenderizado: m.corpoRenderizado ?? '',
    leadId: m.leadId ?? undefined,
    enrollmentId: m.enrollmentId ?? undefined,
    toque: m.toque ?? undefined,
    evolutionMessageId: m.evolutionMessageId ?? undefined,
    erro: m.erro ?? undefined,
    tentativas: m.tentativas,
    agendadaPara: dt(m.agendadaPara),
    enviadaEm: dt(m.enviadaEm),
  };
}

export const repositorioOutbox: RepositorioOutbox = {
  async acharPorDedup(dedupKey) {
    const m = await prisma.message.findUnique({ where: { dedupKey } });
    return m ? paraDominio(m) : null;
  },

  async salvar(m) {
    const criada = await prisma.message.create({
      data: {
        direction: m.direction,
        kind: m.kind,
        status: m.status,
        dedupKey: m.dedupKey,
        to: m.to,
        corpoRenderizado: m.corpoRenderizado,
        leadId: m.leadId,
        enrollmentId: m.enrollmentId,
        toque: m.toque,
        tentativas: m.tentativas,
      },
    });
    return paraDominio(criada);
  },

  async atualizar(id, patch) {
    const atualizada = await prisma.message.update({
      where: { id },
      data: {
        status: patch.status,
        evolutionMessageId: patch.evolutionMessageId,
        erro: patch.erro,
        tentativas: patch.tentativas,
        agendadaPara: patch.agendadaPara?.toJSDate(),
        enviadaEm: patch.enviadaEm?.toJSDate(),
      },
    });

    // Contadores do dia só avançam quando a mensagem realmente saiu.
    if (patch.status === 'ENVIADA') await registrarEnvio(patch.enviadaEm ?? agoraSP());

    return paraDominio(atualizada);
  },
};

/**
 * Constrói o serviço já cabeado.
 *
 * `dryRun` liga sozinho quando a Evolution não está configurada — assim um
 * ambiente sem credencial simula em vez de estourar exceção a cada tentativa, e
 * o Rodolfo consegue conferir o lote antes de existir instância.
 */
export function criarWhatsAppService(opts: { dryRun?: boolean } = {}): WhatsAppService {
  const transporte = new TransporteEvolutionHttp();
  const dryRun = opts.dryRun ?? !transporte.configurado;

  return new WhatsAppService(
    {
      outbox: repositorioOutbox,
      transporte: transporte as TransporteEvolution,
      estado: () => montarEstadoEnvio(),
      agora: agoraSP,
      // O id real vem do `@default(cuid())` do Prisma: `salvar` devolve a linha
      // criada e o serviço usa o id DELA. Este valor nunca é persistido.
      novoId: () => '(gerado pelo banco)',
      auditar: async (evento, dados) => {
        await prisma.auditLog.create({ data: { evento, dados: dados as object } });
      },
    },
    { dryRun },
  );
}
