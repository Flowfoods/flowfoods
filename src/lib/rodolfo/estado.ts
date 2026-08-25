/**
 * Monta o `EstadoEnvio` que o motor de tetos consome.
 *
 * Tudo que o `podeEnviar` precisa saber sobre "como está o número agora" é lido
 * aqui, num lugar só. Se um contador for lido errado, a trava correspondente
 * deixa de valer sem dar erro — por isso cada consulta abaixo diz de onde tira o
 * número e em que fuso.
 */

import { DateTime } from 'luxon';
import { prisma } from '@/lib/db';
import { TIMEZONE } from '@/lib/barney/regras';
import type { EstadoEnvio } from '@/lib/barney/tetos';
import { lerConfig } from './config';

export const INSTANCIA = process.env.EVOLUTION_INSTANCE ?? 'flowfoods-prospeccao';

export function agoraSP(): DateTime {
  return DateTime.now().setZone(TIMEZONE);
}

/**
 * Meia-noite de hoje em São Paulo, como `Date` UTC — é assim que a coluna
 * `@db.Date` do `DailyCounter` é chaveada. Contar o dia em UTC faria o teto de
 * 30 reabrir às 21h de Brasília.
 */
export function diaSP(ref: DateTime = agoraSP()): Date {
  return new Date(`${ref.setZone(TIMEZONE).toFormat('yyyy-LL-dd')}T00:00:00.000Z`);
}

/**
 * Falhas consecutivas: quantas FALHA existem antes do último envio bem-sucedido.
 * Uma entrega no meio zera a contagem — o stop-loss procura uma sequência, não
 * um total do dia.
 */
async function contarFalhasConsecutivas(): Promise<number> {
  const ultimas = await prisma.message.findMany({
    where: { direction: 'OUT', status: { in: ['ENVIADA', 'ENTREGUE', 'LIDA', 'FALHA'] } },
    orderBy: { criadoEm: 'desc' },
    take: 20,
    select: { status: true },
  });

  let n = 0;
  for (const m of ultimas) {
    if (m.status !== 'FALHA') break;
    n += 1;
  }
  return n;
}

export async function montarEstadoEnvio(ref: DateTime = agoraSP()): Promise<EstadoEnvio> {
  const [config, instancia, contador, ultimaHora, historico, falhasConsecutivas] =
    await Promise.all([
      lerConfig(),
      prisma.instanceState.findUnique({ where: { nome: INSTANCIA } }),
      prisma.dailyCounter.findUnique({
        where: { data_instancia: { data: diaSP(ref), instancia: INSTANCIA } },
      }),
      prisma.message.count({
        where: {
          direction: 'OUT',
          enviadaEm: { gte: ref.minus({ hours: 1 }).toJSDate() },
        },
      }),
      prisma.message.count({
        where: { direction: 'OUT', status: { in: ['ENVIADA', 'ENTREGUE', 'LIDA'] } },
      }),
      contarFalhasConsecutivas(),
    ]);

  return {
    disparoAtivo: config.disparoAtivo,
    // Instância que nunca reportou estado é tratada como fora do ar. O default
    // seguro é "não envia": supor `open` mandaria mensagem para o vazio e
    // contaria como falha.
    estadoInstancia: instancia?.estado ?? 'close',
    primeiroEnvioEm: instancia?.primeiroEnvioEm
      ? DateTime.fromJSDate(instancia.primeiroEnvioEm).setZone(TIMEZONE)
      : null,
    totalEnviadoHistorico: historico,
    enviadosHoje: contador?.enviados ?? 0,
    entreguesHoje: contador?.entregues ?? 0,
    falhasConsecutivas,
    enviadosUltimaHora: ultimaHora,
    ultimoEnvioEm: contador?.ultimoEnvioEm
      ? DateTime.fromJSDate(contador.ultimoEnvioEm).setZone(TIMEZONE)
      : null,
    janela: config.janela,
    maxPorDiaConfig: config.maxPorDia,
    maxPorHoraConfig: config.maxPorHora,
  };
}

/** Registra um envio nos contadores. Chamado logo após a Evolution aceitar. */
export async function registrarEnvio(ref: DateTime = agoraSP()): Promise<void> {
  const data = diaSP(ref);
  const quando = ref.toJSDate();

  await prisma.$transaction([
    prisma.dailyCounter.upsert({
      where: { data_instancia: { data, instancia: INSTANCIA } },
      create: { data, instancia: INSTANCIA, enviados: 1, ultimoEnvioEm: quando },
      update: { enviados: { increment: 1 }, ultimoEnvioEm: quando },
    }),
    // A rampa começa no PRIMEIRO envio. `updateMany` com filtro null grava só
    // uma vez e é idempotente sob concorrência — dois envios simultâneos não
    // reiniciam a contagem.
    prisma.instanceState.updateMany({
      where: { nome: INSTANCIA, primeiroEnvioEm: null },
      data: { primeiroEnvioEm: quando },
    }),
  ]);
}

export async function registrarEntrega(ref: DateTime = agoraSP()): Promise<void> {
  const data = diaSP(ref);
  await prisma.dailyCounter.upsert({
    where: { data_instancia: { data, instancia: INSTANCIA } },
    create: { data, instancia: INSTANCIA, entregues: 1 },
    update: { entregues: { increment: 1 } },
  });
}

export async function registrarFalha(ref: DateTime = agoraSP()): Promise<void> {
  const data = diaSP(ref);
  await prisma.dailyCounter.upsert({
    where: { data_instancia: { data, instancia: INSTANCIA } },
    create: { data, instancia: INSTANCIA, falhas: 1 },
    update: { falhas: { increment: 1 } },
  });
}
