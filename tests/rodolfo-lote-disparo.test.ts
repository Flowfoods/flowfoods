/**
 * E5.1 · decisão 467 — o disparo do lote no servidor (`dispararProximo`), antes de qualquer envio:
 *  - lote cancelado não envia nada: nem o botão da Cadência, nem o Lead 360, nem a simulação, nem o worker com aprovação
 *    automática (antes, o envio manual e o worker passavam por cima do cancelamento);
 *  - com aprovação manual, o "Enviar o próximo" (sem lead escolhido) espera a aprovação do lote, como o worker;
 *    a simulação e o envio de um lead escolhido no Lead 360 seguem valendo antes da aprovação.
 *  - os modelos de texto padrão (categoria nula) são criados só quando faltam: o `upsert` com nulo na chave quebrava o
 *    "Montar lote" em todo banco sem modelos, e a edição feita à mão nunca é sobrescrita.
 * O banco é simulado: o lote vem sem itens, então o que passa da trava termina em "Nada elegível" e nada é enviado.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const banco = vi.hoisted(() => ({
  lote: null as null | { id: string; status: string; itens: unknown[] },
  modoAprovacao: true,
  modelos: [] as Array<{ id: string; categoria: string | null; toque: string; canal: string; variante: string; corpo: string }>,
  upsertsDeModelo: 0,
  reaberturas: [] as string[][],
  travas: 0,
}));
const enviar = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => {
  const prisma: Record<string, unknown> = {
    optOut: {
      findUnique: async () => {
        throw new Error('não devia conferir o opt-out de lead fora do WhatsApp');
      },
    },
    batch: {
      findUnique: async () => banco.lote,
      upsert: async () => banco.lote,
      // O UPDATE condicional do "Montar de novo": só reabre o que aguarda ou foi cancelado.
      updateMany: async ({ where }: { where: { status: { in: string[] } } }) => {
        banco.reaberturas.push(where.status.in);
        return { count: banco.lote && where.status.in.includes(banco.lote.status) ? 1 : 0 };
      },
    },
    sequence: { upsert: async () => ({ id: 'seq' }) },
    sequenceStep: { upsert: async () => ({}) },
    template: {
      upsert: async () => {
        banco.upsertsDeModelo++;
        throw new Error('Argument `categoria` must not be null.');
      },
      findFirst: async ({ where }: { where: { categoria: null; toque: string; canal: string; variante: string } }) =>
        banco.modelos.find((m) => m.categoria === where.categoria && m.toque === where.toque && m.canal === where.canal && m.variante === where.variante) ?? null,
      create: async ({ data }: { data: { toque: string; canal: string; variante: string; corpo: string } }) => {
        const m = { id: `t${banco.modelos.length}`, categoria: null, ...data };
        banco.modelos.push(m);
        return m;
      },
    },
    // A trava dos modelos padrão (decisão 473): a transação do teste roda direto sobre o mesmo banco simulado.
    $queryRaw: async () => {
      banco.travas++;
      return [{ trava: '' }];
    },
  };
  prisma.$transaction = async (fn: (tx: unknown) => unknown) => fn(prisma);
  return { prisma };
});
vi.mock('@/lib/rodolfo/config', () => ({ lerConfig: async () => ({ modoAprovacao: banco.modoAprovacao, janela: { diasSemana: [1, 2, 3, 4, 5], horaInicio: 10, horaFim: 18 } }) }));
vi.mock('@/lib/rodolfo/outbox', () => ({ criarWhatsAppService: () => ({ sendText: enviar }) }));

import { dispararProximo, FIM_DO_LOTE, garantirSeed, salvarProposta } from '@/lib/rodolfo/lote';
import { SEED_TEMPLATES } from '@/lib/barney/render';

const CANCELADO = 'Lote de hoje cancelado. Nada mais sai hoje; para voltar a enviar, monte o lote de novo.';
const AGUARDANDO = 'Lote de hoje aguardando aprovação. Aprove o lote antes de enviar.';

describe('E5.1 · disparo do lote: cancelado e aguardando aprovação', () => {
  beforeEach(() => {
    enviar.mockClear();
    banco.modoAprovacao = true;
  });

  it('sem lote: recusa, sem envio', async () => {
    banco.lote = null;
    expect(await dispararProximo({ manual: true })).toEqual({ enviou: false, motivo: 'Nenhum lote montado hoje.' });
  });

  it('lote cancelado: nada sai por caminho nenhum, com aprovação manual ou automática', async () => {
    banco.lote = { id: 'l1', status: 'CANCELADO', itens: [] };
    for (const modo of [true, false]) {
      banco.modoAprovacao = modo;
      for (const opts of [{}, { manual: true }, { manual: true, leadId: 'x' }, { manual: true, dryRun: true }]) {
        expect(await dispararProximo(opts), JSON.stringify({ modo, opts })).toEqual({ enviou: false, motivo: CANCELADO });
      }
    }
    expect(enviar).not.toHaveBeenCalled();
  });

  it('aguardando aprovação, com aprovação manual: o worker e o "Enviar o próximo" esperam; simulação e Lead 360 seguem', async () => {
    banco.lote = { id: 'l1', status: 'PROPOSTO', itens: [] };
    expect(await dispararProximo({})).toEqual({ enviou: false, motivo: AGUARDANDO });
    expect(await dispararProximo({ manual: true })).toEqual({ enviou: false, motivo: AGUARDANDO });
    expect(await dispararProximo({ manual: true, dryRun: true })).toEqual({ enviou: false, motivo: FIM_DO_LOTE });
    expect(await dispararProximo({ manual: true, leadId: 'x' })).toEqual({ enviou: false, motivo: FIM_DO_LOTE });
  });

  it('aguardando, com aprovação automática: passa da trava (o lote proposto já envia)', async () => {
    banco.modoAprovacao = false;
    banco.lote = { id: 'l1', status: 'PROPOSTO', itens: [] };
    expect(await dispararProximo({})).toEqual({ enviou: false, motivo: FIM_DO_LOTE });
    expect(await dispararProximo({ manual: true })).toEqual({ enviou: false, motivo: FIM_DO_LOTE });
  });

  it('aprovado ou enviando: passa da trava', async () => {
    for (const status of ['APROVADO', 'EM_ENVIO']) {
      banco.lote = { id: 'l1', status, itens: [] };
      expect(await dispararProximo({ manual: true })).toEqual({ enviou: false, motivo: FIM_DO_LOTE });
      expect(await dispararProximo({})).toEqual({ enviou: false, motivo: FIM_DO_LOTE });
    }
  });
});

describe('E5.1 · modelos de texto padrão', () => {
  it('cria os que faltam, uma vez só, sem upsert com nulo; o editado à mão fica', async () => {
    banco.modelos = [{ id: 'editado', categoria: null, toque: 'D0', canal: 'WHATSAPP', variante: 'A', corpo: 'texto revisado à mão' }];
    banco.upsertsDeModelo = 0;
    banco.travas = 0;
    await garantirSeed();
    await garantirSeed();
    expect(banco.travas).toBe(2);
    expect(banco.upsertsDeModelo).toBe(0);
    expect(banco.modelos).toHaveLength(SEED_TEMPLATES.length);
    expect(banco.modelos.find((m) => m.toque === 'D0' && m.canal === 'WHATSAPP')?.corpo).toBe('texto revisado à mão');
  });
});

describe('E5.1 · "Montar de novo" não mexe em lote aprovado nem em envio', () => {
  it('aprovado ou enviando: o lote fica como está, sem itens novos', async () => {
    for (const status of ['APROVADO', 'EM_ENVIO']) {
      banco.lote = { id: 'l1', status, itens: [] };
      banco.reaberturas = [];
      const r = await salvarProposta();
      expect(r).toMatchObject({ mantido: true, itens: [] });
      expect(r.lote.status).toBe(status);
      expect(banco.reaberturas).toEqual([['PROPOSTO', 'CANCELADO']]);
    }
  });
});

describe('E5.1 · lead movido para Visita depois de montado o lote', () => {
  it('não recebe o WhatsApp do lote de hoje (pelo worker nem pelo Lead 360)', async () => {
    banco.modoAprovacao = true;
    const lead = { id: 'v1', status: 'NOVO', canal: 'VISITA', telefoneNormalizado: '5521990000004' };
    banco.lote = { id: 'l1', status: 'APROVADO', itens: [{ leadId: 'v1', toque: 'D0', lead }] };
    expect(await dispararProximo({})).toEqual({ enviou: false, motivo: FIM_DO_LOTE });
    expect(await dispararProximo({ manual: true, leadId: 'v1' })).toEqual({ enviou: false, motivo: FIM_DO_LOTE });
    expect(enviar).not.toHaveBeenCalled();
  });
});
