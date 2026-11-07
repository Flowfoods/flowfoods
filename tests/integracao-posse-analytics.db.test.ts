/** PostgreSQL descartável e execução serial: só catálogos/lock; nenhuma tabela de negócio ou chamada externa. */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { comPosseAnalytics, ErroDePosseAnalytics, type PosseAnalytics } from '@/lib/integracoes/core/posse-analytics';

const URL_TESTE = process.env.ERP_DB_TESTE;
const NAMESPACE = 0x4646414e;
const CHAVE = 1;

describe.skipIf(!URL_TESTE)('posse global Analytics · sessões PostgreSQL reais', { timeout: 30_000 }, () => {
  let db: PrismaClient;
  const comNome = (nome: string) => {
    const url = new URL(URL_TESTE!);
    url.searchParams.set('application_name', nome);
    return url.toString();
  };
  const nomeUnico = () => `ff-posse-teste-${randomUUID()}`;
  const donoAtual = async (nome: string) => db.$queryRaw<{ pid: number; inicio: string; estado: string; transacao: Date | null }[]>`
    SELECT a.pid, a.backend_start::text AS inicio, a.state AS estado, a.xact_start AS transacao
    FROM pg_stat_activity a JOIN pg_locks l ON l.pid = a.pid AND l.database = a.datid
    WHERE a.datname = current_database() AND a.application_name = ${nome}
      AND l.locktype = 'advisory' AND l.classid = ${NAMESPACE}::oid AND l.objid = ${CHAVE}::oid
      AND l.objsubid = 2 AND l.mode = 'ExclusiveLock' AND l.granted`;

  beforeAll(() => {
    const url = new URL(URL_TESTE!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('A posse só pode ser testada no PostgreSQL local descartável.');
    db = new PrismaClient({ datasources: { db: { url: comNome(nomeUnico()) } }, log: [] });
  });
  afterAll(async () => { await db?.$disconnect(); });

  it('mantém uma sessão sem transação longa; concorrente não entra e próximo dono só entra após liberação', async () => {
    let nome = '';
    let anterior = '';
    expect(await comPosseAnalytics(comNome(nome), async posse => {
      anterior = posse.id;
      nome = `flowfoods-analytics:${posse.id}`;
      expect(await posse.confirmar()).toBe(true);
      const linhas = await donoAtual(nome);
      expect(linhas).toHaveLength(1);
      expect(linhas[0].estado).toBe('idle'); expect(linhas[0].transacao).toBeNull();
      const concorrente = vi.fn(async () => 'não entra');
      expect(await comPosseAnalytics(comNome(nomeUnico()), concorrente)).toBeNull();
      expect(concorrente).not.toHaveBeenCalled(); expect(await posse.confirmar()).toBe(true);
      expect(await donoAtual(nome)).toEqual(linhas);
      return 'primeiro';
    })).toBe('primeiro');
    expect(await donoAtual(nome)).toEqual([]);
    expect(await comPosseAnalytics(comNome(nomeUnico()), async posse => {
      expect(posse.id).not.toBe(anterior); expect(await posse.confirmar()).toBe(true); return 'novo';
    })).toBe('novo');
  });

  it('erro do callback libera a sessão e não impede um novo dono', async () => {
    let nome = '';
    const recusa = new Error('falha controlada do trabalho');
    await expect(comPosseAnalytics(URL_TESTE!, async posse => { nome = `flowfoods-analytics:${posse.id}`; throw recusa; })).rejects.toBe(recusa);
    expect(await donoAtual(nome)).toEqual([]);
    expect(await comPosseAnalytics(comNome(nomeUnico()), async posse => posse.confirmar())).toBe(true);
  });

  it('encerrar somente a sessão própria invalida a posse antiga e permite novo dono sem recuperar por idade', async () => {
    let nome = '';
    let anterior!: PosseAnalytics;
    await expect(comPosseAnalytics(comNome(nome), async posse => {
      anterior = posse;
      nome = `flowfoods-analytics:${posse.id}`;
      const [sessao] = await donoAtual(nome);
      expect(sessao).toBeDefined();
      // Identidade exclusiva completa: não termina backend por idade, nome genérico ou porta.
      const encerradas = await db.$queryRaw<{ encerrada: boolean }[]>`
        SELECT pg_terminate_backend(a.pid, 5000) AS encerrada FROM pg_stat_activity a
        WHERE a.pid = ${sessao.pid}::int AND a.backend_start::text = ${sessao.inicio}
          AND a.application_name = ${nome} AND a.datname = current_database() AND a.pid <> pg_backend_pid()`;
      expect(encerradas).toEqual([{ encerrada: true }]);
      expect(await posse.confirmar()).toBe(false);
      expect(await posse.confirmar()).toBe(false);
      expect(await comPosseAnalytics(comNome(nomeUnico()), async nova => {
        expect(nova.id).not.toBe(posse.id); expect(await nova.confirmar()).toBe(true);
        expect(await posse.confirmar()).toBe(false); return 'substituta';
      })).toBe('substituta');
      return 'a antiga não pode confirmar sucesso';
    })).rejects.toBeInstanceOf(ErroDePosseAnalytics);
    expect(await anterior.confirmar()).toBe(false);
    expect(await donoAtual(nome)).toEqual([]);
  });
});
