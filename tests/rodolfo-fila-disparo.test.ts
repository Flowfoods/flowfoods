/**
 * Decisão 473 — a fila da Cadência e o disparo concordam: sobre os mesmos dados, quem `situacoesDoLote` diz "Na fila" é
 * exatamente quem `dispararProximo` manda; com ninguém na fila, o disparo termina em "Nada elegível".
 * O serviço de envio é simulado com o contrato dele: confere o texto com o validador de verdade e recusa o item sem gravar.
 */
import { describe, expect, it, vi } from 'vitest';
import { DateTime } from 'luxon';

const banco = vi.hoisted(() => ({
  lote: null as null | { id: string; status: string; itens: { id: string; leadId: string; toque: string; ordem: number; lead: Record<string, unknown> }[] },
  optOuts: [] as string[],
  mensagens: [] as { dedupKey: string; status: string }[],
}));
const tentativas = vi.hoisted(() => [] as { leadId: string; recusado: boolean }[]);

vi.mock('@/lib/db', async () => {
  const { SEED_TEMPLATES } = await import('@/lib/barney/render');
  const modelos = SEED_TEMPLATES.filter((t) => t.canal === 'WHATSAPP').map((t, i) => ({ id: `t${i}`, toque: t.toque, corpo: t.corpo, canal: 'WHATSAPP', ativo: true }));
  return {
    prisma: {
      batch: { findUnique: async () => banco.lote, update: async () => ({}) },
      optOut: {
        findUnique: async ({ where }: { where: { telefoneNormalizado: string } }) => (banco.optOuts.includes(where.telefoneNormalizado) ? { id: 'o' } : null),
        findMany: async ({ where }: { where: { telefoneNormalizado: { in: string[] } } }) => banco.optOuts.filter((t) => where.telefoneNormalizado.in.includes(t)).map((t) => ({ telefoneNormalizado: t })),
      },
      message: {
        findFirst: async ({ where }: { where: { dedupKey: { in: string[] } } }) => banco.mensagens.find((m) => where.dedupKey.in.includes(m.dedupKey)) ?? null,
        findMany: async ({ where }: { where: { dedupKey: { in: string[] } } }) => banco.mensagens.filter((m) => where.dedupKey.in.includes(m.dedupKey)),
      },
      template: {
        findFirst: async ({ where }: { where: { toque: string } }) => modelos.find((m) => m.toque === where.toque) ?? null,
        findMany: async ({ where }: { where: { toque: { in: string[] } } }) => modelos.filter((m) => where.toque.in.includes(m.toque)),
      },
      setting: { findUnique: async () => null },
      sequence: { findUnique: async () => null },
    },
  };
});
vi.mock('@/lib/rodolfo/outbox', async () => {
  const { validarTemplate } = await import('@/lib/barney/template-validator');
  return {
    criarWhatsAppService: () => ({
      sendText: async (p: { text: string; toque: 'D0'; leadId: string }) => {
        const recusado = !validarTemplate(p.text, { toque: p.toque, canal: 'WHATSAPP', renderizado: true }).valido;
        tentativas.push({ leadId: p.leadId, recusado });
        return recusado ? { ok: false, motivo: 'VALIDADOR: texto recusado', escopo: 'ITEM' } : { ok: true, simulado: false };
      },
    }),
  };
});

import { dispararProximo, FIM_DO_LOTE, situacoesDoLote } from '@/lib/rodolfo/lote';
import { dedupKeyEnvio } from '@/lib/barney/dedup';
import { TIMEZONE } from '@/lib/barney/regras';

const ref = DateTime.fromISO('2026-10-26T11:00:00', { zone: TIMEZONE });
const lead = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  nome: `Restaurante ${id}`,
  restaurante: `Restaurante ${id}`,
  bairro: 'Penha',
  categoria: 'Hamburgueria',
  nota: 4.6,
  avaliacoes: 320,
  donoNome: null,
  status: 'NOVO',
  canal: 'WHATSAPP',
  telefoneNormalizado: `55219900010${id.slice(-2)}`,
  ...extra,
});

describe('Decisão 473 · fila e disparo sobre os mesmos dados', () => {
  it('quem está "Na fila" é quem o disparo manda; os outros ele pula', async () => {
    const leads = [
      lead('a01', { telefoneNormalizado: null }), // sem celular
      lead('b02'), // pediu para sair (pelo telefone)
      lead('c03'), // já recebeu hoje
      lead('d04', { restaurante: 'Burger 🍔🍔 Point 🔥🔥' }), // texto recusado
      lead('e05', { status: 'RESPONDEU' }),
      lead('f06'), // na fila
    ];
    banco.lote = { id: 'l1', status: 'EM_ENVIO', itens: leads.map((l, i) => ({ id: `i${i}`, leadId: l.id, toque: 'D0', ordem: i, lead: l })) };
    banco.optOuts = [leads[1].telefoneNormalizado as string];
    banco.mensagens = [{ dedupKey: dedupKeyEnvio('c03', 'D0', ref), status: 'ENTREGUE' }];

    const s = await situacoesDoLote(banco.lote.itens as never, ref);
    const naFila = banco.lote.itens.filter((i) => s.get(i.id) === 'NA_FILA').map((i) => i.leadId);
    expect([...s.values()]).toEqual(['SEM_CELULAR', 'PEDIU_PARA_SAIR', 'ENVIADO', 'TEXTO_RECUSADO', 'RESPONDEU', 'NA_FILA']);

    tentativas.length = 0;
    const r = await dispararProximo({ manual: true }, ref);
    expect(r).toMatchObject({ enviou: true, leadId: 'f06' });
    expect(tentativas.filter((t) => !t.recusado).map((t) => t.leadId)).toEqual(naFila);
    // O de texto recusado o disparo tentou e o serviço recusou, sem gravar: por isso a fila não o conta.
    expect(tentativas.filter((t) => t.recusado).map((t) => t.leadId)).toEqual(['d04']);
  });

  it('ninguém na fila: o disparo termina em "Nada elegível", sem mandar nada', async () => {
    banco.mensagens.push({ dedupKey: dedupKeyEnvio('f06', 'D0', ref), status: 'PENDENTE' });
    const s = await situacoesDoLote(banco.lote!.itens as never, ref);
    expect([...s.values()].filter((x) => x === 'NA_FILA')).toEqual([]);
    expect(s.get('i5')).toBe('SEM_CONFIRMACAO');
    tentativas.length = 0;
    expect(await dispararProximo({ manual: true }, ref)).toEqual({ enviou: false, motivo: FIM_DO_LOTE });
    expect(tentativas.filter((t) => !t.recusado)).toEqual([]);
  });
});
