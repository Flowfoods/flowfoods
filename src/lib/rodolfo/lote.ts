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
import { dedupKeyEnvio, dedupKeyEnvioDryRun } from '@/lib/barney/dedup';
import { renderizar, SEED_TEMPLATES } from '@/lib/barney/render';
import { podeEnviar } from '@/lib/barney/tetos';
import { agoraSP, diaSP, montarEstadoEnvio } from './estado';
import { lerConfig } from './config';
import { criarWhatsAppService } from './outbox';

export const SEQUENCIA_PADRAO = 'cadencia-padrao';

/**
 * Qual toque vem depois, e em quantos dias a partir de HOJE.
 *
 * Tabela unica, em vez de ternarios espalhados. O ternario anterior tinha um
 * `else` que devolvia 'D0': um enrollment que chegasse aqui com toqueAtual
 * 'D10' reenviaria a ABERTURA para quem ja completou a cadencia.
 * `undefined` = a cadencia acabou. Tres toques e para.
 */
const PROXIMO_TOQUE: Partial<Record<Toque, { toque: Toque; emDias: number }>> = {
  D0: { toque: 'D4', emDias: 4 },
  D4: { toque: 'D10', emDias: 6 },
};

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
    // `toqueAtual` nulo = enrollment recem-criado e ainda sem envio: comeca no D0.
    // Quem ja esta no D10 nao tem proximo e e descartado aqui — sem isso, um
    // enrollment que ficasse ATIVA por engano voltaria para a abertura.
    ...continuacoes
      .map((c) => ({ c, proximo: c.toqueAtual ? PROXIMO_TOQUE[c.toqueAtual] : { toque: 'D0' as Toque, emDias: 0 } }))
      .filter((x): x is { c: (typeof continuacoes)[number]; proximo: { toque: Toque; emDias: number } } =>
        x.proximo !== undefined,
      )
      .map(({ c, proximo }) => ({
        leadId: c.leadId,
        toque: proximo.toque,
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

    // Chave separada em dry-run: a simulação não pode ocupar o `dedupKey` do
    // envio real, senão conferir o lote inutilizaria o dia.
    const dedupKey = opts.dryRun
      ? dedupKeyEnvioDryRun(lead.id, item.toque, ref)
      : dedupKeyEnvio(lead.id, item.toque, ref);

    // Um envio REAL já feito hoje também bloqueia a simulação: não faz sentido
    // simular o que já saiu.
    const jaSaiu = await prisma.message.findFirst({
      where: {
        dedupKey: { in: [dedupKey, dedupKeyEnvio(lead.id, item.toque, ref)] },
      },
      select: { id: true },
    });
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

    if (!r.ok) {
      // Falha DESTE item (corpo reprovado no validador, por exemplo): pula para
      // o próximo. Um lead com dado ruim não pode travar o lote do dia inteiro.
      if (r.escopo === 'ITEM') continue;
      // Falha do número ou do dia (teto, janela, stop-loss, Evolution fora):
      // tentar o próximo só somaria falha.
      return { enviou: false, motivo: r.motivo, leadId: lead.id, toque: item.toque };
    }

    if (r.simulado) {
      // Dry-run NÃO avança a cadência. Avançar aqui marcaria o lead como
      // EM_CADENCIA no D0 e agendaria o D4 sem que nada tivesse saído — e o D0
      // de verdade nunca mais seria proposto. Simular não pode mexer no estado
      // real; só registra na timeline, para o Rodolfo ver que conferiu.
      await prisma.leadEvent.create({
        data: {
          leadId: lead.id,
          tipo: 'dry_run',
          descricao: `${item.toque} simulado — nada foi enviado.`,
          dados: { toque: item.toque },
        },
      });
    } else {
      await registrarEnvioNoLead(lead.id, item.toque, ref);

      if (lote.status === 'APROVADO') {
        await prisma.batch.update({ where: { id: lote.id }, data: { status: 'EM_ENVIO' } });
      }
    }

    return { enviou: true, leadId: lead.id, toque: item.toque, simulado: r.simulado };
  }

  return { enviou: false, motivo: 'Nada elegível no lote de hoje.' };
}

/**
 * Avança o enrollment e escreve a timeline depois de um envio REAL.
 *
 * Nunca é chamada em dry-run: simular não pode mexer no estado da cadência.
 */
async function registrarEnvioNoLead(leadId: string, toque: Toque, ref: DateTime): Promise<void> {
  const config = await lerConfig();
  const seq = await prisma.sequence.findUnique({ where: { nome: SEQUENCIA_PADRAO } });
  if (!seq) return;

  const proximo = PROXIMO_TOQUE[toque];

  // Agendado a partir de HOJE com o intervalo que FALTA (D0→D4 são 4 dias,
  // D4→D10 são 6), já deslizado para a janela útil. Contar do D0 original daria
  // datas no passado sempre que um toque atrasasse.
  const proximoEnvioEm = proximo
    ? agendarToque(ref, proximo.emDias, config.janela).toJSDate()
    : null;

  await prisma.enrollment.upsert({
    where: { leadId_sequenceId: { leadId, sequenceId: seq.id } },
    create: {
      leadId,
      sequenceId: seq.id,
      status: proximo ? 'ATIVA' : 'CONCLUIDA',
      toqueAtual: toque,
      proximoEnvioEm,
    },
    update: {
      status: proximo ? 'ATIVA' : 'CONCLUIDA',
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
        descricao: `${toque} enviado.`,
        dados: { toque },
      },
    }),
  ]);
}
