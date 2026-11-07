/**
 * Posse global do worker Analytics neste banco: advisory lock de SESSÃO, sem transação longa.
 * Exige URL PostgreSQL direta (não um pooler em modo transaction/statement). connection_limit=1 não torna um proxy
 * transacional seguro; pgbouncer=true é recusado, mas proxy oculto depende da configuração verificada no servidor.
 * Este cliente privado só consulta catálogos e a trava. Nenhum modelo de negócio é exposto ao callback.
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

// Namespace estável entre versões/processos: ASCII FFAN, chave 1. Dois int4 => pg_locks.objsubid=2.
const NAMESPACE_ANALYTICS = 0x4646414e;
const CHAVE_ANALYTICS = 1;
type ClienteDaPosse = Pick<PrismaClient, '$queryRaw' | '$disconnect'>;
type Sessao = { pid: number; inicio: string };

export interface PosseAnalytics {
  /** Identidade opaca desta execução; deve acompanhar o CAS dos jobs/publicações. Não é um lease por idade. */
  readonly id: string;
  /** Prova pontual. O caller confere antes de trabalho/efeitos e mantém o CAS de negócio no portão de tenant. */
  confirmar(): Promise<boolean>;
}

export class ErroDePosseAnalytics extends Error {
  constructor() {
    super('Não foi possível manter a posse exclusiva do Analytics. O trabalho desta execução deve parar.');
    this.name = 'ErroDePosseAnalytics';
  }
}

function urlDaPosse(valor: string, id: string): string {
  try {
    const url = new URL(valor);
    if (!['postgresql:', 'postgres:'].includes(url.protocol) || !url.hostname
      || url.searchParams.getAll('pgbouncer').some(v => v !== 'false')) throw new Error();
    url.searchParams.set('connection_limit', '1');
    url.searchParams.set('max_connection_lifetime', '0');
    url.searchParams.set('max_idle_connection_lifetime', '0');
    url.searchParams.set('pool_timeout', '10');
    url.searchParams.set('connect_timeout', '10');
    url.searchParams.set('socket_timeout', '10');
    // Vínculo consultável pelo fence SQL de publicação; não aceita nome herdado da URL.
    url.searchParams.set('application_name', `flowfoods-analytics:${id}`);
    return url.toString();
  } catch {
    // Não propaga TypeError/Prisma com URL, senha ou host em mensagem/cause.
    throw new ErroDePosseAnalytics();
  }
}

function sessaoValida(s: Sessao | undefined): s is Sessao {
  return !!s && Number.isSafeInteger(s.pid) && s.pid > 0 && typeof s.inicio === 'string' && s.inicio.length > 0;
}

/**
 * null: outra sessão possui a trava. Erro: não foi possível provar/manter a posse.
 * Uma perda invalida esta posse definitivamente; confirmar nunca readquire a trava numa conexão nova.
 * O callback precisa aguardar seus trabalhos antes de retornar. Esta prova não substitui fencing/CAS das escritas.
 */
export async function comPosseAnalytics<T>(url: string, executar: (posse: PosseAnalytics) => Promise<T>): Promise<T | null> {
  const id = randomUUID();
  let cliente: ClienteDaPosse;
  try {
    cliente = new PrismaClient({ datasources: { db: { url: urlDaPosse(url, id) } }, log: [], errorFormat: 'minimal' });
  } catch {
    throw new ErroDePosseAnalytics();
  }

  let sessao: Sessao | undefined;
  let perdeu = false;
  let encerrada = false;
  let falhou = false;
  const confirmar = async (): Promise<boolean> => {
    if (perdeu || encerrada || !sessao) return false;
    try {
      const linhas = await cliente.$queryRaw<(Sessao & { detem: boolean })[]>`
        SELECT a.pid, a.backend_start::text AS inicio,
          EXISTS (SELECT 1 FROM pg_locks l WHERE l.pid = a.pid AND l.database = a.datid
            AND l.locktype = 'advisory' AND l.classid = ${NAMESPACE_ANALYTICS}::oid
            AND l.objid = ${CHAVE_ANALYTICS}::oid AND l.objsubid = 2
            AND l.mode = 'ExclusiveLock' AND l.granted) AS detem
        FROM pg_stat_activity a WHERE a.pid = pg_backend_pid()`;
      const atual = linhas.length === 1 ? linhas[0] : undefined;
      if (!sessaoValida(atual) || atual.pid !== sessao.pid || atual.inicio !== sessao.inicio || atual.detem !== true) perdeu = true;
    } catch {
      perdeu = true;
    }
    return !perdeu && !encerrada;
  };

  try {
    let linhas: (Sessao & { obtida: boolean })[];
    try {
      linhas = await cliente.$queryRaw<(Sessao & { obtida: boolean })[]>`
        SELECT a.pid, a.backend_start::text AS inicio,
          pg_try_advisory_lock(${NAMESPACE_ANALYTICS}::int, ${CHAVE_ANALYTICS}::int) AS obtida
        FROM pg_stat_activity a WHERE a.pid = pg_backend_pid()`;
    } catch {
      throw new ErroDePosseAnalytics();
    }
    const inicial = linhas.length === 1 ? linhas[0] : undefined;
    if (!sessaoValida(inicial) || typeof inicial.obtida !== 'boolean') throw new ErroDePosseAnalytics();
    if (!inicial.obtida) return null;
    // Mantém a precisão original do backend_start; Date do JavaScript descartaria microssegundos.
    sessao = { pid: inicial.pid, inicio: inicial.inicio };
    if (!await confirmar()) throw new ErroDePosseAnalytics();
    const resultado = await executar(Object.freeze({ id, confirmar }));
    if (!await confirmar()) throw new ErroDePosseAnalytics();
    return resultado;
  } catch (erro) {
    falhou = true;
    throw erro;
  } finally {
    encerrada = true;
    let liberacaoFalhou = false;
    try {
      if (sessao) {
        // Uma reconexão nunca pode liberar a trava de outra sessão, mesmo que o novo PID seja reutilizado.
        const linhas = await cliente.$queryRaw<{ liberada: boolean }[]>`
          SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_stat_activity a
            WHERE a.pid = pg_backend_pid() AND a.pid = ${sessao.pid}::int
              AND a.backend_start::text = ${sessao.inicio})
          THEN pg_advisory_unlock(${NAMESPACE_ANALYTICS}::int, ${CHAVE_ANALYTICS}::int)
          ELSE false END AS liberada`;
        liberacaoFalhou = linhas.length !== 1 || linhas[0].liberada !== true;
      }
    } catch {
      liberacaoFalhou = true;
    } finally {
      try { await cliente.$disconnect(); } catch { liberacaoFalhou = true; }
    }
    // Preserva o erro do callback; um problema de cleanup nunca converte falha em sucesso ou ecoa erro do banco.
    if (liberacaoFalhou && !falhou) throw new ErroDePosseAnalytics();
  }
}
