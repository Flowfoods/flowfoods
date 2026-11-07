/** Controle global do coletor; não contém dados nem credenciais do parceiro. */
import { prisma } from '@/lib/db';
import type { PosseAnalytics } from './posse-analytics';
import { ErroPipelineAnalytics } from '../ifood/pipeline-tipos';

const ID = 'IFOOD_ANALYTICS';
export async function registrarDonoAnalytics(posse: PosseAnalytics): Promise<void> {
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "IntegracaoControle" WHERE id = ${ID} FOR UPDATE`;
    if (!await posse.confirmar()) throw new ErroPipelineAnalytics('POSSE', 'A execução perdeu a posse.');
    const real = await tx.$queryRaw<{ ok: boolean }[]>`SELECT erp_integracao_posse_viva(${posse.id}) AS ok`;
    if (!real[0]?.ok) throw new ErroPipelineAnalytics('POSSE', 'A execução não possui a sessão de coleta.');
    await tx.integracaoControle.update({ where: { id: ID }, data: { donoAtual: posse.id } });
    if (!await posse.confirmar()) throw new ErroPipelineAnalytics('POSSE', 'A execução perdeu a posse.');
  });
}

export async function pausarAnalytics(pausada: boolean, autor: string): Promise<void> {
  if (typeof pausada !== 'boolean' || !autor.trim() || autor.length > 120) {
    throw new ErroPipelineAnalytics('ENTRADA', 'Informe o responsável e o estado da coleta.');
  }
  await prisma.$transaction(async tx => {
    await tx.integracaoControle.update({ where: { id: ID }, data: { pausada } });
    await tx.auditLog.create({ data: { evento: 'integracao.analytics-pausa', dados: { pausada, autor } } });
  });
}

export async function controleAnalytics() {
  return prisma.integracaoControle.findUniqueOrThrow({ where: { id: ID } });
}

/** A quota pertence ao coletor: suspender uma loja depois do HTTP não pode perder o prazo do provedor. */
export async function registrarEsperaAnalytics(posse: PosseAnalytics, prazo: Date | null, pausar: boolean): Promise<void> {
  if ((!prazo && !pausar) || (prazo && !Number.isFinite(prazo.getTime()))) throw new ErroPipelineAnalytics('ENTRADA', 'Prazo inválido.');
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "IntegracaoControle" WHERE id = ${ID} FOR UPDATE`;
    const c = await tx.integracaoControle.findUniqueOrThrow({ where: { id: ID } });
    const vivo = await tx.$queryRaw<{ ok: boolean }[]>`SELECT erp_integracao_posse_viva(${posse.id}) AS ok`;
    if (c.donoAtual !== posse.id || !vivo[0]?.ok || !await posse.confirmar()) throw new ErroPipelineAnalytics('POSSE', 'A execução perdeu a posse.');
    const bloqueadaAte = prazo && (!c.bloqueadaAte || prazo > c.bloqueadaAte) ? prazo : c.bloqueadaAte;
    const pausada = c.pausada || pausar;
    if (bloqueadaAte?.getTime() === c.bloqueadaAte?.getTime() && pausada === c.pausada) return;
    await tx.integracaoControle.update({ where: { id: ID }, data: { bloqueadaAte, pausada } });
    await tx.auditLog.create({ data: { evento: 'integracao.analytics-retomada', dados: { pausada, retomadaMinimaEm: bloqueadaAte?.toISOString() ?? null, origem: '429' } } });
  });
}

/** Reserva persistente: não há rajada quando o processo reinicia. O chamador aguarda e revalida o acesso depois. */
export async function reservarChamadaAnalytics(posse: PosseAnalytics): Promise<number> {
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ pausada: boolean; donoAtual: string | null; cooldown: boolean; espera: number }[]>`
      SELECT "pausada", "donoAtual", COALESCE("bloqueadaAte" > clock_timestamp(), false) AS cooldown, GREATEST(0, EXTRACT(EPOCH FROM
        ("proximaChamadaEm" - clock_timestamp())) * 1000)::float8 AS espera
      FROM "IntegracaoControle" WHERE id = ${ID} FOR UPDATE`;
    if (rows.length !== 1 || rows[0].pausada || rows[0].cooldown || rows[0].donoAtual !== posse.id || !await posse.confirmar()) {
      throw new ErroPipelineAnalytics('ACESSO', 'A coleta está suspensa.');
    }
    await tx.$executeRaw`UPDATE "IntegracaoControle" SET
      "proximaChamadaEm" = GREATEST(COALESCE("proximaChamadaEm", clock_timestamp()), clock_timestamp()) + interval '150 milliseconds',
      "atualizadoEm" = clock_timestamp() WHERE id = ${ID}`;
    return Math.ceil(rows[0].espera);
  });
}
