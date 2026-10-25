/**
 * E5.1 · decisão 473 — ajustes conhecidos do painel do nível 1 (seção 14, item C):
 *  - a fila da Cadência usa a régua do disparo: quem o `dispararProximo` pularia sai da fila com o motivo; com ninguém na
 *    fila, "Enviar o próximo" some e a tela diz que a fila de hoje terminou (antes: botão habilitado e "Nada elegível");
 *  - no teto da hora, "Libera em" é a hora real em que a vaga abre (antes: 10 minutos fixos);
 *  - em Regras de envio, campo vazio mantém o valor gravado (antes: voltava ao padrão).
 */
import { describe, expect, it, vi } from 'vitest';
import { DateTime } from 'luxon';

const banco = vi.hoisted(() => ({
  optOuts: [] as string[],
  mensagens: [] as { dedupKey: string; status: string }[],
  consultas: 0,
  setting: null as null | { valor: unknown },
  gravado: null as unknown,
  modelos: [] as { toque: string; corpo: string }[],
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    optOut: {
      findMany: async ({ where }: { where: { telefoneNormalizado: { in: string[] } } }) => {
        banco.consultas++;
        return banco.optOuts.filter((t) => where.telefoneNormalizado.in.includes(t)).map((t) => ({ telefoneNormalizado: t }));
      },
    },
    message: {
      findMany: async ({ where }: { where: { dedupKey: { in: string[] } } }) => {
        banco.consultas++;
        return banco.mensagens.filter((m) => where.dedupKey.in.includes(m.dedupKey));
      },
    },
    template: {
      findMany: async ({ where }: { where: { toque: { in: string[] } } }) => {
        banco.consultas++;
        return banco.modelos.filter((m) => where.toque.in.includes(m.toque));
      },
    },
    setting: {
      findUnique: async () => banco.setting,
      upsert: async ({ update }: { update: { valor: unknown } }) => {
        banco.gravado = update.valor;
        return {};
      },
    },
  },
}));

import { foraDaFilaPeloLead, situacaoNoLote } from '@/lib/rodolfo/fila';
import { situacoesDoLote } from '@/lib/rodolfo/lote';
import { telaDaCadencia, type EntradaDaCadencia } from '@/lib/rodolfo/cadencia-tela';
import { podeEnviar, segundosAteVagaNaHora, type EstadoEnvio } from '@/lib/barney/tetos';
import { dedupKeyEnvio } from '@/lib/barney/dedup';
import { salvarConfig, CONFIG_PADRAO } from '@/lib/rodolfo/config';
import { TIMEZONE } from '@/lib/barney/regras';
import { SEED_TEMPLATES } from '@/lib/barney/render';

const ref = DateTime.fromISO('2026-10-26T11:00:00', { zone: TIMEZONE });
const lead = (id: string, extra: Partial<{ telefoneNormalizado: string | null; status: string; canal: string; restaurante: string }> = {}) => ({
  id,
  telefoneNormalizado: `55219900000${id.slice(-2).padStart(2, '0')}`,
  status: 'NOVO',
  canal: 'WHATSAPP',
  nome: `Restaurante ${id}`,
  restaurante: `Restaurante ${id}`,
  bairro: 'Penha',
  categoria: 'Hamburgueria',
  nota: 4.6,
  avaliacoes: 320,
  donoNome: null,
  ...extra,
});
// Os modelos padrão do WhatsApp, como o "Montar lote" cria.
const MODELOS = SEED_TEMPLATES.filter((t) => t.canal === 'WHATSAPP').map((t) => ({ toque: t.toque, corpo: t.corpo }));

describe('E5.1 · a fila do lote com a régua do disparo', () => {
  it('a ordem do disparo: sem celular, pediu para sair, conflito, respondeu, fora do WhatsApp', () => {
    expect(foraDaFilaPeloLead({ telefoneNormalizado: null, status: 'OPT_OUT', canal: 'VISITA' })).toBe('SEM_CELULAR');
    expect(foraDaFilaPeloLead({ telefoneNormalizado: '55', status: 'OPT_OUT', canal: 'VISITA' })).toBe('PEDIU_PARA_SAIR');
    expect(foraDaFilaPeloLead({ telefoneNormalizado: '55', status: 'CONFLITO', canal: 'WHATSAPP' })).toBe('CONFLITO');
    expect(foraDaFilaPeloLead({ telefoneNormalizado: '55', status: 'RESPONDEU', canal: 'WHATSAPP' })).toBe('RESPONDEU');
    expect(foraDaFilaPeloLead({ telefoneNormalizado: '55', status: 'EM_CADENCIA', canal: 'VISITA' })).toBe('FORA_DO_WHATSAPP');
    expect(foraDaFilaPeloLead({ telefoneNormalizado: '55', status: 'EM_CADENCIA', canal: 'WHATSAPP' })).toBeNull();
  });

  it('com o banco: telefone na lista de quem saiu, mensagem de hoje enviada ou com falha', () => {
    const l = { telefoneNormalizado: '55', status: 'NOVO', canal: 'WHATSAPP' };
    expect(situacaoNoLote(l, { pediuParaSair: true, mensagemDeHoje: null })).toBe('PEDIU_PARA_SAIR');
    expect(situacaoNoLote(l, { pediuParaSair: false, mensagemDeHoje: { status: 'ENTREGUE' } })).toBe('ENVIADO');
    expect(situacaoNoLote(l, { pediuParaSair: false, mensagemDeHoje: { status: 'LIDA' } })).toBe('ENVIADO');
    // Gravada e sem resposta da Evolution não é "enviada".
    expect(situacaoNoLote(l, { pediuParaSair: false, mensagemDeHoje: { status: 'PENDENTE' } })).toBe('SEM_CONFIRMACAO');
    expect(situacaoNoLote(l, { pediuParaSair: false, mensagemDeHoje: { status: 'FALHA' } })).toBe('FALHOU');
    expect(situacaoNoLote(l, { pediuParaSair: false, mensagemDeHoje: null })).toBe('NA_FILA');
    expect(situacaoNoLote(l, { pediuParaSair: false, mensagemDeHoje: null, textoRecusado: true })).toBe('TEXTO_RECUSADO');
    // A mensagem de hoje vence o texto recusado (o texto pode ter mudado depois do envio).
    expect(situacaoNoLote(l, { pediuParaSair: false, mensagemDeHoje: { status: 'ENTREGUE' }, textoRecusado: true })).toBe('ENVIADO');
  });

  it('o lote inteiro em três consultas, com a chave do envio real de hoje', async () => {
    banco.modelos = MODELOS;
    const itens = [
      { id: 'i1', toque: 'D0' as const, lead: lead('l01') },
      { id: 'i2', toque: 'D0' as const, lead: lead('l02') },
      { id: 'i3', toque: 'D4' as const, lead: lead('l03') },
      { id: 'i4', toque: 'D0' as const, lead: lead('l04', { canal: 'VISITA' }) },
      { id: 'i5', toque: 'D0' as const, lead: lead('l05') },
    ];
    banco.optOuts = [itens[1].lead.telefoneNormalizado!];
    banco.mensagens = [
      { dedupKey: dedupKeyEnvio('l03', 'D4', ref), status: 'ENTREGUE' },
      // Mensagem de ontem (outra chave) não conta como "enviada hoje".
      { dedupKey: dedupKeyEnvio('l05', 'D0', ref.minus({ days: 1 })), status: 'ENTREGUE' },
    ];
    banco.consultas = 0;
    const s = await situacoesDoLote(itens, ref);
    expect([...s.entries()]).toEqual([
      ['i1', 'NA_FILA'],
      ['i2', 'PEDIU_PARA_SAIR'],
      ['i3', 'ENVIADO'],
      ['i4', 'FORA_DO_WHATSAPP'],
      ['i5', 'NA_FILA'],
    ]);
    expect(banco.consultas).toBe(3);
  });

  it('texto que o validador recusa (emoji demais, link encurtado) não está na fila', async () => {
    banco.modelos = MODELOS;
    banco.optOuts = [];
    banco.mensagens = [];
    const itens = [
      { id: 'i1', toque: 'D0' as const, lead: lead('l11', { restaurante: 'Burger 🍔🍔 Point 🔥🔥' }) },
      { id: 'i2', toque: 'D0' as const, lead: lead('l12', { restaurante: 'Lanches bit.ly/promo' }) },
      { id: 'i3', toque: 'D0' as const, lead: lead('l13') },
    ];
    expect([...(await situacoesDoLote(itens, ref)).values()]).toEqual(['TEXTO_RECUSADO', 'TEXTO_RECUSADO', 'NA_FILA']);
    // Sem modelo ativo do toque, o item fica na fila: o disparo para e diz "Nenhum modelo de texto ativo…".
    banco.modelos = [];
    expect([...(await situacoesDoLote(itens, ref)).values()]).toEqual(['NA_FILA', 'NA_FILA', 'NA_FILA']);
  });

  it('sem telefone, telefone repetido e lote vazio', async () => {
    banco.modelos = MODELOS;
    const tel = '5521990009999';
    banco.optOuts = [tel];
    banco.mensagens = [];
    const itens = [
      { id: 'i1', toque: 'D0' as const, lead: lead('l21', { telefoneNormalizado: null }) },
      { id: 'i2', toque: 'D0' as const, lead: lead('l22', { telefoneNormalizado: tel }) },
      { id: 'i3', toque: 'D0' as const, lead: lead('l23', { telefoneNormalizado: tel }) },
    ];
    expect([...(await situacoesDoLote(itens, ref)).values()]).toEqual(['SEM_CELULAR', 'PEDIU_PARA_SAIR', 'PEDIU_PARA_SAIR']);
    banco.consultas = 0;
    expect((await situacoesDoLote([], ref)).size).toBe(0);
    expect(banco.consultas).toBe(0);
  });

  it('ninguém na fila: sem "Enviar o próximo", com o aviso de fila terminada; cancelado continua dizendo cancelado', () => {
    const base: EntradaDaCadencia = {
      lote: { status: 'APROVADO', itens: 5 },
      manual: { permitido: true, tetoDiaVigente: 10 },
      automatico: { permitido: true, tetoDiaVigente: 10 },
      totalEnviadoHistorico: 20,
      modoAprovacao: true,
    };
    expect(telaDaCadencia({ ...base, naFila: 2 }).envio).toMatchObject({ habilitado: true });
    // Sem a contagem (ausente), vale o tamanho do lote, como antes.
    expect(telaDaCadencia(base).envio).toMatchObject({ habilitado: true });
    const fim = telaDaCadencia({ ...base, naFila: 0 });
    expect(fim.envio).toBeNull();
    expect(fim.filaTerminada).toBe(true);
    expect(telaDaCadencia({ ...base, naFila: 1 }).filaTerminada).toBe(false);
    expect(fim.parado).toMatchObject({ titulo: 'Fila de hoje terminada.' });
    // Até com o envio parado (disparo desligado), a fila vazia é o que vale dizer.
    const desligado = { permitido: false, motivo: 'DISPARO_DESLIGADO', explicacao: 'Disparo desligado.', tetoDiaVigente: 10 } as const;
    expect(telaDaCadencia({ ...base, naFila: 0, manual: desligado }).parado?.titulo).toBe('Fila de hoje terminada.');
    expect(telaDaCadencia({ ...base, lote: { status: 'CANCELADO', itens: 5 }, naFila: 0 }).parado?.titulo).toBe('Lote cancelado.');
    // Aguardando aprovação e ninguém na fila: aprovar continua possível, mas não é o botão principal.
    const aguardando = telaDaCadencia({ ...base, lote: { status: 'PROPOSTO', itens: 5 }, naFila: 0 });
    expect(aguardando.aprovar).toBe(true);
    expect(aguardando.principal).toBeNull();
  });
});

describe('E5.1 · teto da hora: quando a vaga abre de verdade', () => {
  const estado = (horas: string[]): EstadoEnvio => ({
    disparoAtivo: true,
    estadoInstancia: 'open',
    primeiroEnvioEm: ref.minus({ days: 30 }),
    totalEnviadoHistorico: 200,
    enviadosHoje: horas.length,
    entreguesHoje: horas.length,
    falhasConsecutivas: 0,
    enviadosUltimaHora: horas.length,
    enviosDaUltimaHoraEm: horas.map((h) => DateTime.fromISO(`2026-10-26T${h}`, { zone: TIMEZONE })),
    ultimoEnvioEm: DateTime.fromISO(`2026-10-26T${horas[horas.length - 1]}`, { zone: TIMEZONE }),
    maxPorHoraConfig: 3,
  });

  it('com 3 de 3 na hora, a vaga abre quando o mais antigo completa 60 minutos', () => {
    const d = podeEnviar(estado(['10:15:00', '10:30:00', '10:50:00']), ref);
    expect(d).toMatchObject({ permitido: false, motivo: 'TETO_HORARIO', tentarEmSegundos: 15 * 60 });
  });

  it('com mais envios que o teto (teto baixado depois), conta o que estoura o teto', () => {
    // 4 na hora, teto 3: a vaga abre quando o 2º mais antigo (10:20) completa a hora.
    expect(segundosAteVagaNaHora({ enviadosUltimaHora: 4, enviosDaUltimaHoraEm: ['10:10:00', '10:20:00', '10:30:00', '10:40:00'].map((h) => DateTime.fromISO(`2026-10-26T${h}`, { zone: TIMEZONE })) }, 3, ref)).toBe(20 * 60);
  });

  it('sem as horas dos envios, a estimativa de 10 minutos de antes', () => {
    expect(segundosAteVagaNaHora({ enviadosUltimaHora: 3 }, 3, ref)).toBe(600);
  });
});

describe('E5.1 · Regras de envio: campo vazio mantém o gravado', () => {
  it('maxPorDia e a hora de abrir vazios ficam como estavam; o resto muda', async () => {
    banco.setting = { valor: { ...CONFIG_PADRAO, maxPorDia: 12, janela: { diasSemana: [1, 2, 3], horaInicio: 11, horaFim: 16 }, intervaloMaxS: 1500 } };
    const nova = await salvarConfig({ maxPorDia: undefined, maxPorHora: 5, intervaloMaxS: undefined, janela: { diasSemana: [2], horaInicio: undefined, horaFim: 17 } as never });
    expect(nova).toMatchObject({ maxPorDia: 12, maxPorHora: 5, intervaloMaxS: 1500, janela: { diasSemana: [2], horaInicio: 11, horaFim: 17 } });
    expect(banco.gravado).toEqual(nova);
  });
});
