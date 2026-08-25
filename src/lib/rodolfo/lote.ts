/**
 * Lote do dia — proposta, aprovação e execução.
 *
 * O Barney NUNCA escolhe sozinho quem recebe mensagem quando `modoAprovacao`
 * está ligado (o padrão). Ele propõe; o Rodolfo aprova no celular; só então o
 * worker drena.
 *
 * A elegibilidade é feita em SQL e depois reconferida em memória. Parece
 * redundante e não é: a query pode ficar desatualizada entre a proposta e o
 * envio (alguém responde, alguém pede saída), e a segunda checagem acontece no
 * instante do disparo.
 */

import { DateTime } from 'luxon';
import { prisma } from '@/lib/db';
import { TOQUES, type Toque } from '@/lib/barney/regras';
import { agendarToque } from '@/lib/barney/janela';
import { dedupKeyEnvio } from '@/lib/barney/dedup';
import { renderizar, SEED_TEMPLATES } from '@/lib/barney/render';
import { podeEnviar } from '@/lib/barney/tetos';
import { agoraSP, diaSP, montarEstadoEnvio } from './estado';
import { lerConfig } from './config';
import { criarWhatsAppService } from './outbox';

export const SEQUENCIA_PADRAO = 'cadencia-padrao';

/** Cria a sequência D0/D+4/D+10 e os templates do seed. Idempotente. */
export async function garantirSeed(): Promise<void> {
  const seq = await prisma.sequence.upsert({
    where: { nome: SEQUENCIA_PADRAO },
    create: { nome: SEQUENCIA_PADRAO },
    update: {},
  });

  await Promise.all(
    TOQUES.map((t, i) =>
      prisma.sequenceStep.upsert({
        where: { sequenceId_toque: { sequenceId: seq.id, toque: t.toque } },
        create: { sequenceId: seq.id, toque: t.toque, offsetDias: t.offsetDias, ordem: i },
        update: { offsetDias: t.offsetDias, ordem: i },
      }),
    ),
  );

  await Promise.all(
    SEED_TEMPLATES.map((t) =>
      prisma.template.upsert({
        where: {
          categoria_toque_canal_variante: {
            categoria: null as unknown as string,
            toque: t.toque,
            canal: t.canal,
            variante: 'A',
          },
        },
        create: { toque: t.toque, canal: t.canal, variante: 'A', corpo: t.corpo, ativo: true },
        // Não sobrescreve: se o Rodolfo editou o texto no portal, a edição dele
        // vence o seed. A fonte da verdade continua sendo `mensagens.md`, mas
        // reimportar o seed não pode apagar uma revisão feita à mão.
        update: {},
      }),
    ),
  );
}

export interface ItemProposto {
  leadId: string;
  toque: Toque;
  nome: string;
  bairro: string | null;
  tier: string | null;
  scoreBase: number | null;
}

/**
 * Monta a proposta do dia.
 *
 * Prioridade: tier (T1 primeiro), depois score. Um lead aparece no máximo uma
 * vez por dia — nunca dois toques no mesmo dia para a mesma casa.
 */
export async function proporLote(ref: DateTime = agoraSP()): Promise<ItemProposto[]> {
  await garantirSeed();

  const estado = await montarEstadoEnvio(ref);
  const decisao = podeEnviar(estado, ref, { manual: true });
  const teto = decisao.tetoDiaVigente;
  const fimDoDia = ref.endOf('day');

  // Continuações: quem já está em cadência e tem toque vencendo hoje.
  const continuacoes = await prisma.enrollment.findMany({
    where: {
      status: 'ATIVA',
      proximoEnvioEm: { not: null, lte: fimDoDia.toJSDate() },
      lead: {
        canal: 'WHATSAPP',
        status: { notIn: ['OPT_OUT', 'CONFLITO', 'PERDIDO', 'CLIENTE'] },
        telefoneNormalizado: { not: null },
      },
    },
    include: {
      lead: { select: { id: true, restaurante: true, nome: true, bairro: true, tier: true, scoreBase: true } },
    },
    orderBy: [{ proximoEnvioEm: 'asc' }],
    take: teto,
  });

  const jaNoLote = new Set(continuacoes.map((c) => c.leadId));

  // Novos: nunca abordados. Só entram se sobrar espaço depois das continuações,
  // porque terminar uma cadência vale mais que começar outra.
  const espaco = Math.max(0, teto - continuacoes.length);
  const novos =
    espaco === 0
      ? []
      : await prisma.lead.findMany({
          where: {
            canal: 'WHATSAPP',
            status: 'NOVO',
            telefoneNormalizado: { not: null },
            enrollments: { none: {} },
            // Opt-out é por telefone e sobrevive ao lead: confere na tabela.
            NOT: { id: { in: [...jaNoLote] } },
          },
          orderBy: [{ tier: 'asc' }, { scoreBase: 'desc' }],
          take: espaco * 2, // folga para descartar os que caírem no opt-out
          select: { id: true, restaurante: true, nome: true, bairro: true, tier: true, scoreBase: true, telefoneNormalizado: true },
        });

  const optOuts = new Set(
    (
      await prisma.optOut.findMany({
        where: { telefoneNormalizado: { in: novos.map((n) => n.telefoneNormalizado!) } },
        select: { telefoneNormalizado: true },
      })
    ).map((o) => o.telefoneNormalizado),
  );

  const itens: ItemProposto[] = [
    ...continuacoes.map((c) => ({
      leadId: c.leadId,
      toque: (c.toqueAtual === 'D0' ? 'D4' : c.toqueAtual === 'D4' ? 'D10' : 'D0') as Toque,
      nome: c.lead.restaurante ?? c.lead.nome,
      bairro: c.lead.bairro,
      tier: c.lead.tier,
      scoreBase: c.lead.scoreBase,
    })),
    ...novos
      .filter((n) => !optOuts.has(n.telefoneNormalizado!))
      .slice(0, espaco)
      .map((n) => ({
        leadId: n.id,
        toque: 'D0' as Toque,
        nome: n.restaurante ?? n.nome,
        bairro: n.bairro,
        tier: n.tier,
        scoreBase: n.scoreBase,
      })),
  ];

  return itens.slice(0, teto);
}

/** Grava a proposta como o lote de hoje. Repropor substitui os itens. */
export async function salvarProposta(ref: DateTime = agoraSP()) {
  const itens = await proporLote(ref);
  const data = diaSP(ref);

  const lote = await prisma.batch.upsert({
    where: { data },
    create: { data, status: 'PROPOSTO' },
    update: { status: 'PROPOSTO' },
  });

  // Só reescreve enquanto ainda não foi aprovado: repropor por cima de um lote
  // em envio embaralharia a fila no meio do caminho.
  if (lote.status === 'PROPOSTO') {
    await prisma.batchItem.deleteMany({ where: { batchId: lote.id } });
    await prisma.batchItem.createMany({
      data: itens.map((i, ordem) => ({
        batchId: lote.id,
        leadId: i.leadId,
        toque: i.toque,
        ordem,
      })),
      skipDuplicates: true,
    });
  }

  return { lote, itens };
}

export async function aprovarLote(ref: DateTime = agoraSP()) {
  const data = diaSP(ref);
  const lote = await prisma.batch.findUnique({ where: { data } });
  if (!lote) throw new Error('Não há lote proposto para hoje.');
  if (lote.status !== 'PROPOSTO') return lote;

  const aprovado = await prisma.batch.update({
    where: { id: lote.id },
    data: { status: 'APROVADO', aprovadoEm: new Date() },
  });

  await prisma.auditLog.create({
    data: { evento: 'lote_aprovado', dados: { loteId: lote.id, data: data.toISOString() } },
  });

  return aprovado;
}

export async function cancelarLote(ref: DateTime = agoraSP()) {
  const data = diaSP(ref);
  await prisma.batch.updateMany({
    where: { data, status: { in: ['PROPOSTO', 'APROVADO', 'EM_ENVIO'] } },
    data: { status: 'CANCELADO' },
  });
  await prisma.auditLog.create({ data: { evento: 'lote_cancelado', dados: {} } });
}

export interface ResultadoDisparo {
  enviou: boolean;
  motivo?: string;
  leadId?: string;
  toque?: Toque;
  simulado?: boolean;
}

/**
 * Dispara UM item do lote aprovado — a unidade de trabalho do worker.
 *
 * Um por chamada, de propósito: entre um envio e outro precisa passar o
 * intervalo aleatório, e um laço que manda tudo de uma vez é exatamente o
 * padrão de bot que o WhatsApp detecta.
 */
export async function dispararProximo(
  opts: { manual?: boolean; leadId?: string; dryRun?: boolean } = {},
  ref: DateTime = agoraSP(),
): Promise<ResultadoDisparo> {
  const config = await lerConfig();
  const data = diaSP(ref);

  const lote = await prisma.batch.findUnique({
    where: { data },
    include: {
      itens: {
        orderBy: { ordem: 'asc' },
        include: {
          lead: true,
        },
      },
    },
  });

  if (!lote) return { enviou: false, motivo: 'Nenhum lote montado hoje.' };

  if (config.modoAprovacao && lote.status !== 'APROVADO' && lote.status !== 'EM_ENVIO' && !opts.manual) {
    return { enviou: false, motivo: `Lote em "${lote.status}". Aprove antes de disparar.` };
  }

  const candidatos = opts.leadId
    ? lote.itens.filter((i) => i.leadId === opts.leadId)
    : lote.itens;

  for (const item of candidatos) {
    const lead = item.lead;
    if (!lead.telefoneNormalizado) continue;

    // Reconferência no instante do disparo: o mundo pode ter mudado desde a
    // proposta.
    if (lead.status === 'OPT_OUT' || lead.status === 'CONFLITO' || lead.status === 'RESPONDEU') {
      continue;
    }
    const saiu = await prisma.optOut.findUnique({
      where: { telefoneNormalizado: lead.telefoneNormalizado },
    });
    if (saiu) continue;

    const dedupKey = dedupKeyEnvio(lead.id, item.toque, ref);
    const jaSaiu = await prisma.message.findUnique({ where: { dedupKey } });
    if (jaSaiu) continue;

    const template = await prisma.template.findFirst({
      where: { toque: item.toque, canal: 'WHATSAPP', ativo: true },
      orderBy: { criadoEm: 'asc' },
    });
    if (!template) return { enviou: false, motivo: `Sem template ativo para ${item.toque}.` };

    const corpo = renderizar(
      template.corpo,
      {
        nome: lead.restaurante ?? lead.nome,
        bairro: lead.bairro ?? '',
        categoria: lead.categoria ?? '',
        nota: lead.nota ?? 0,
        avaliacoes: lead.avaliacoes ?? 0,
        donoNome: lead.donoNome,
      },
      ref,
    );

    const service = criarWhatsAppService({ dryRun: opts.dryRun });
    const r = await service.sendText({
      to: lead.telefoneNormalizado,
      text: corpo,
      dedupKey,
      kind: 'CADENCIA',
      leadId: lead.id,
      toque: item.toque,
      canal: 'WHATSAPP',
      manual: opts.manual,
    });

    if (!r.ok) return { enviou: false, motivo: r.motivo, leadId: lead.id, toque: item.toque };

    await registrarEnvioNoLead(lead.id, item.toque, ref, r.simulado === true);

    if (lote.status === 'APROVADO') {
      await prisma.batch.update({ where: { id: lote.id }, data: { status: 'EM_ENVIO' } });
    }

    return { enviou: true, leadId: lead.id, toque: item.toque, simulado: r.simulado };
  }

  return { enviou: false, motivo: 'Nada elegível no lote de hoje.' };
}

/** Avança o enrollment e escreve a timeline depois de um envio aceito. */
async function registrarEnvioNoLead(
  leadId: string,
  toque: Toque,
  ref: DateTime,
  simulado: boolean,
): Promise<void> {
  const config = await lerConfig();
  const seq = await prisma.sequence.findUnique({ where: { nome: SEQUENCIA_PADRAO } });
  if (!seq) return;

  const proximoToque = toque === 'D0' ? 'D4' : toque === 'D4' ? 'D10' : null;
  const offset = proximoToque === 'D4' ? 4 : proximoToque === 'D10' ? 10 : null;

  // O próximo toque é agendado a partir de HOJE com o offset restante, já
  // deslizado para a janela útil.
  const proximoEnvioEm =
    offset === null ? null : agendarToque(ref, toque === 'D0' ? 4 : 6, config.janela).toJSDate();

  await prisma.enrollment.upsert({
    where: { leadId_sequenceId: { leadId, sequenceId: seq.id } },
    create: {
      leadId,
      sequenceId: seq.id,
      status: proximoToque ? 'ATIVA' : 'CONCLUIDA',
      toqueAtual: toque,
      proximoEnvioEm,
    },
    update: {
      status: proximoToque ? 'ATIVA' : 'CONCLUIDA',
      toqueAtual: toque,
      proximoEnvioEm,
    },
  });

  await prisma.$transaction([
    prisma.lead.update({ where: { id: leadId }, data: { status: 'EM_CADENCIA' } }),
    prisma.leadEvent.create({
      data: {
        leadId,
        tipo: 'envio',
        descricao: `${toque} ${simulado ? 'simulado (dry-run)' : 'enviado'}.`,
        dados: { toque, simulado },
      },
    }),
  ]);
}
