/** Posse e ciclo de vida com driver simulado. O SQL/PID real tem validação separada no cluster descartável. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fabrica = vi.hoisted(() => ({ criar: vi.fn<(opcoes: unknown) => unknown>() }));
vi.mock('@prisma/client', () => ({ PrismaClient: vi.fn(function (opcoes: unknown) { return fabrica.criar(opcoes); }) }));
import { comPosseAnalytics, ErroDePosseAnalytics, type PosseAnalytics } from '@/lib/integracoes/core/posse-analytics';

const URL_FICTICIA = 'postgresql://pessoa:senha-ficticia@localhost:55499/fixture?schema=public&sslmode=require&connection_limit=8';
type ClienteFalso = {
  pid: number; inicio: string; detem: boolean; fechado: boolean; opcoes: unknown;
  consultas: { texto: string; valores: unknown[] }[];
  erroConsulta?: Error; erroLiberar?: Error; erroDisconnect?: Error;
  respostaInicial?: unknown;
  desconectar: ReturnType<typeof vi.fn>;
};
let clientes: ClienteFalso[], dono: ClienteFalso | null;

beforeEach(() => {
  clientes = []; dono = null; fabrica.criar.mockReset();
  fabrica.criar.mockImplementation(opcoes => {
    const c: ClienteFalso = { pid: clientes.length + 100, inicio: '2026-11-07 12:00:00.123456+00', detem: false, fechado: false, opcoes, consultas: [], desconectar: vi.fn() };
    clientes.push(c);
    c.desconectar.mockImplementation(async () => {
      c.fechado = true;
      if (dono === c) dono = null;
      if (c.erroDisconnect) throw c.erroDisconnect;
    });
    return {
      $disconnect: c.desconectar,
      $queryRaw: async (partes: TemplateStringsArray, ...valores: unknown[]) => {
        const texto = partes.join('?');
        c.consultas.push({ texto, valores });
        if (texto.includes('pg_advisory_unlock')) {
          if (c.erroLiberar) throw c.erroLiberar;
          const mesmaSessao = valores[0] === c.pid && valores[1] === c.inicio;
          const liberada = mesmaSessao && dono === c && c.detem;
          if (liberada) { dono = null; c.detem = false; }
          return [{ liberada }];
        }
        if (c.erroConsulta) throw c.erroConsulta;
        if (texto.includes('pg_try_advisory_lock')) {
          if (c.respostaInicial !== undefined) return c.respostaInicial;
          const obtida = dono === null;
          if (obtida) { dono = c; c.detem = true; }
          return [{ pid: c.pid, inicio: c.inicio, obtida }];
        }
        return [{ pid: c.pid, inicio: c.inicio, detem: dono === c && c.detem }];
      },
    };
  });
});

describe('posse global Analytics: pool privado e nenhuma operação de negócio', () => {
  it('força uma conexão sem rotação, preserva parâmetros de destino e só entrega id/confirmar', async () => {
    const original = `${URL_FICTICIA}&connection_limit=9&max_connection_lifetime=60&max_idle_connection_lifetime=30&application_name=nome-antigo`;
    let id = '';
    const r = await comPosseAnalytics(original, async posse => {
      expect(Object.keys(posse).sort()).toEqual(['confirmar', 'id']);
      expect(Object.isFrozen(posse)).toBe(true);
      expect(posse.id).toMatch(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
      id = posse.id;
      expect(await posse.confirmar()).toBe(true);
      expect(dono).toBe(clientes[0]);
      return 'feito';
    });
    expect(r).toBe('feito');
    const opcoes = clientes[0].opcoes as { datasources: { db: { url: string } }; log: unknown[] };
    const url = new URL(opcoes.datasources.db.url);
    expect(url.searchParams.getAll('connection_limit')).toEqual(['1']);
    expect(url.searchParams.get('max_connection_lifetime')).toBe('0');
    expect(url.searchParams.get('max_idle_connection_lifetime')).toBe('0');
    expect(url.searchParams.get('socket_timeout')).toBe('10');
    expect(url.searchParams.getAll('application_name')).toEqual([`flowfoods-analytics:${id}`]);
    expect(url.searchParams.get('sslmode')).toBe('require');
    expect(url.searchParams.get('schema')).toBe('public');
    expect(url.password).toBe('senha-ficticia'); expect(opcoes.log).toEqual([]);
    expect(clientes[0].desconectar).toHaveBeenCalledOnce(); expect(dono).toBeNull();
    expect(clientes[0].consultas.filter(q => q.texto.includes('pg_try_advisory_lock'))).toHaveLength(1);
    expect(clientes[0].consultas.every(q => !/\b(?:INSERT|UPDATE|DELETE|BEGIN|COMMIT)\b/.test(q.texto))).toBe(true);
  });

  it.each(['valor-invalido-com-senha', 'https://segredo-ficticio@localhost/fixture', 'prisma://localhost/fixture', `${URL_FICTICIA}&pgbouncer=true`, `${URL_FICTICIA}&pgbouncer=false&pgbouncer=true`])('recusa URL incompatível sem expor seu conteúdo nem construir cliente: %s', async url => {
    const executar = vi.fn();
    const erro = await comPosseAnalytics(url, executar).catch(e => e as Error);
    expect(erro).toBeInstanceOf(ErroDePosseAnalytics);
    expect(String(erro)).not.toContain(url); expect(erro).not.toHaveProperty('cause');
    expect(fabrica.criar).not.toHaveBeenCalled(); expect(executar).not.toHaveBeenCalled();
  });

  it('dois donos simultâneos: o segundo recebe null e não interfere; após liberar um novo dono pode entrar', async () => {
    let liberar!: () => void, entrou!: () => void;
    const barreira = new Promise<void>(r => { liberar = r; });
    const inicio = new Promise<void>(r => { entrou = r; });
    let idPrimeiro = '';
    const primeiro = comPosseAnalytics(URL_FICTICIA, async posse => { idPrimeiro = posse.id; entrou(); await barreira; expect(await posse.confirmar()).toBe(true); return 1; });
    await inicio;
    const segundo = vi.fn(async () => 2);
    expect(await comPosseAnalytics(URL_FICTICIA, segundo)).toBeNull(); expect(segundo).not.toHaveBeenCalled();
    expect(clientes[1].desconectar).toHaveBeenCalledOnce(); expect(dono).toBe(clientes[0]);
    expect(clientes[1].consultas.some(q => q.texto.includes('pg_advisory_unlock'))).toBe(false);
    liberar(); expect(await primeiro).toBe(1);
    expect(await comPosseAnalytics(URL_FICTICIA, async posse => { expect(posse.id).not.toBe(idPrimeiro); return 3; })).toBe(3);
    expect(clientes.every(c => c.fechado)).toBe(true);
  });
});

describe('perda de posse falha fechado sem recuperar por idade ou readquirir', () => {
  it.each(['pid', 'inicio', 'trava', 'erro'] as const)('perda por %s invalida definitivamente; não devolve sucesso se callback ignorar a recusa', async tipo => {
    let guardada!: PosseAnalytics;
    await expect(comPosseAnalytics(URL_FICTICIA, async posse => {
      guardada = posse;
      const c = clientes[0];
      if (tipo === 'pid') c.pid++;
      if (tipo === 'inicio') c.inicio = '2026-11-07 12:00:00.123457+00'; // mesmo milissegundo, sessão diferente
      if (tipo === 'trava') c.detem = false;
      if (tipo === 'erro') c.erroConsulta = new Error(`banco indisponível: ${URL_FICTICIA}`);
      expect(await posse.confirmar()).toBe(false);
      const n = c.consultas.length;
      c.erroConsulta = undefined;
      expect(await posse.confirmar()).toBe(false); expect(c.consultas).toHaveLength(n);
      return 'não pode confirmar';
    })).rejects.toBeInstanceOf(ErroDePosseAnalytics);
    expect(await guardada.confirmar()).toBe(false);
    expect(clientes[0].desconectar).toHaveBeenCalledOnce();
    expect(clientes[0].consultas.filter(q => q.texto.includes('pg_try_advisory_lock'))).toHaveLength(1);
    const liberar = clientes[0].consultas.find(q => q.texto.includes('pg_advisory_unlock'))!;
    expect(liberar.valores.slice(0, 2)).toEqual([100, '2026-11-07 12:00:00.123456+00']);
  });

  it('confere novamente depois do callback, mesmo que ele não tenha pedido confirmação', async () => {
    await expect(comPosseAnalytics(URL_FICTICIA, async () => { clientes[0].detem = false; return 'não'; })).rejects.toBeInstanceOf(ErroDePosseAnalytics);
    expect(clientes[0].desconectar).toHaveBeenCalledOnce();
  });

  it('confirmar depois do encerramento não consulta nem reabre sessão', async () => {
    let posse!: PosseAnalytics;
    await comPosseAnalytics(URL_FICTICIA, async p => { posse = p; return true; });
    const consultas = clientes[0].consultas.length;
    expect(await posse.confirmar()).toBe(false); expect(clientes[0].consultas).toHaveLength(consultas);
    expect(fabrica.criar).toHaveBeenCalledOnce();
  });
});

describe('limpeza e erros da sessão dedicada', () => {
  it('erro de aquisição é sanitizado e sempre desconecta', async () => {
    const criar = fabrica.criar.getMockImplementation()!;
    fabrica.criar.mockImplementation(opcoes => { const c = criar(opcoes); clientes[0].erroConsulta = new Error(URL_FICTICIA); return c; });
    const executar = vi.fn();
    const erro = await comPosseAnalytics(URL_FICTICIA, executar).catch(e => e as Error);
    expect(erro).toBeInstanceOf(ErroDePosseAnalytics); expect(String(erro)).not.toContain('senha-ficticia');
    expect(executar).not.toHaveBeenCalled(); expect(clientes[0].desconectar).toHaveBeenCalledOnce();
  });

  it.each([{ inicial: [] }, { inicial: [{ pid: 0, inicio: '', obtida: true }] }, { inicial: [{ pid: 100, inicio: null, obtida: true }] }])('resposta incompleta da sessão recusa trabalho e desconecta', async ({ inicial }) => {
    const criar = fabrica.criar.getMockImplementation()!;
    fabrica.criar.mockImplementation(opcoes => { const c = criar(opcoes); clientes[0].respostaInicial = inicial; return c; });
    const executar = vi.fn();
    await expect(comPosseAnalytics(URL_FICTICIA, executar)).rejects.toBeInstanceOf(ErroDePosseAnalytics);
    expect(executar).not.toHaveBeenCalled(); expect(clientes[0].desconectar).toHaveBeenCalledOnce();
  });

  it('lock anunciado na aquisição precisa existir na confirmação antes de executar trabalho', async () => {
    const criar = fabrica.criar.getMockImplementation()!;
    fabrica.criar.mockImplementation(opcoes => { const c = criar(opcoes); clientes[0].respostaInicial = [{ pid: 100, inicio: clientes[0].inicio, obtida: true }]; return c; });
    const executar = vi.fn();
    await expect(comPosseAnalytics(URL_FICTICIA, executar)).rejects.toBeInstanceOf(ErroDePosseAnalytics);
    expect(executar).not.toHaveBeenCalled(); expect(clientes[0].desconectar).toHaveBeenCalledOnce();
  });

  it('erro de negócio é preservado mesmo se unlock falhar, mas disconnect é tentado', async () => {
    const falha = new Error('recusa do trabalho');
    await expect(comPosseAnalytics(URL_FICTICIA, async () => { clientes[0].erroLiberar = new Error(URL_FICTICIA); throw falha; })).rejects.toBe(falha);
    expect(clientes[0].desconectar).toHaveBeenCalledOnce();
  });

  it.each(['unlock', 'disconnect'] as const)('falha no %s após trabalho não retorna sucesso nem erro interno do banco', async etapa => {
    const erro = await comPosseAnalytics(URL_FICTICIA, async () => {
      if (etapa === 'unlock') clientes[0].erroLiberar = new Error(URL_FICTICIA);
      else clientes[0].erroDisconnect = new Error(URL_FICTICIA);
      return true;
    }).catch(e => e as Error);
    expect(erro).toBeInstanceOf(ErroDePosseAnalytics); expect(String(erro)).not.toContain('senha-ficticia');
    expect(clientes[0].desconectar).toHaveBeenCalledOnce();
  });
});
