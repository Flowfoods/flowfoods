import { describe, expect, it, vi } from 'vitest';
import { DateTime } from 'luxon';
import { WhatsAppService } from '@/lib/whatsapp/service';
import type {
  MensagemOutbox,
  RepositorioOutbox,
  TransporteEvolution,
} from '@/lib/whatsapp/service';
import type { EstadoEnvio } from '@/lib/barney/tetos';
import { processarResposta } from '@/lib/barney/inbound';
import type { MensagemRecebida, PortasInbound } from '@/lib/barney/inbound';
import { dedupKeyEnvio } from '@/lib/barney/dedup';
import { SEED_TEMPLATES, renderizar } from '@/lib/barney/render';
import { TIMEZONE } from '@/lib/barney/regras';

const AGORA = DateTime.fromISO('2026-08-25T14:00:00', { zone: TIMEZONE });

const LEAD = {
  nome: 'Katsuo Culinaria Asiatica',
  bairro: 'Campo Grande',
  categoria: 'Japones',
  nota: 4.8,
  avaliacoes: 2936,
};

function outboxEmMemoria() {
  const linhas = new Map<string, MensagemOutbox>();
  const repo: RepositorioOutbox = {
    async acharPorDedup(k) {
      return [...linhas.values()].find((m) => m.dedupKey === k) ?? null;
    },
    async salvar(m) {
      linhas.set(m.id, m);
      return m;
    },
    async atualizar(id, patch) {
      const atual = linhas.get(id)!;
      const novo = { ...atual, ...patch };
      linhas.set(id, novo);
      return novo;
    },
  };
  return { repo, linhas };
}

function estadoOk(over: Partial<EstadoEnvio> = {}): EstadoEnvio {
  return {
    disparoAtivo: true,
    estadoInstancia: 'open',
    primeiroEnvioEm: AGORA.minus({ days: 30 }),
    totalEnviadoHistorico: 500,
    enviadosHoje: 0,
    entreguesHoje: 0,
    falhasConsecutivas: 0,
    enviadosUltimaHora: 0,
    ultimoEnvioEm: null,
    ...over,
  };
}

function montar(over: Partial<EstadoEnvio> = {}, dryRun = false) {
  const { repo, linhas } = outboxEmMemoria();
  const enviarTexto = vi.fn(async () => ({ messageId: 'evo-1' }));
  const transporte: TransporteEvolution = { enviarTexto };
  let seq = 0;
  const svc = new WhatsAppService(
    {
      outbox: repo,
      transporte,
      estado: async () => estadoOk(over),
      agora: () => AGORA,
      novoId: () => `msg-${++seq}`,
    },
    { dryRun },
  );
  return { svc, enviarTexto, linhas };
}

const corpoValido = () => renderizar(SEED_TEMPLATES[0].corpo, LEAD, AGORA);

const pedido = (over = {}) => ({
  to: '5521999998888',
  text: corpoValido(),
  dedupKey: dedupKeyEnvio('lead-1', 'D0', AGORA),
  kind: 'CADENCIA',
  leadId: 'lead-1',
  toque: 'D0' as const,
  ...over,
});

describe('WhatsAppService — dry-run', () => {
  it('percorre tudo e faz ZERO chamadas à Evolution', async () => {
    const { svc, enviarTexto, linhas } = montar({}, true);
    const r = await svc.sendText(pedido());

    expect(r.ok).toBe(true);
    expect(r.simulado).toBe(true);
    expect(enviarTexto).not.toHaveBeenCalled();
    expect(enviarTexto.mock.calls.length).toBe(0);
    // Mesmo simulando, a mensagem existe no outbox para o Rodolfo conferir.
    expect(linhas.size).toBe(1);
    expect([...linhas.values()][0].status).toBe('AGENDADA');
  });

  it('um lote inteiro de 30 em dry-run não toca na rede', async () => {
    const { svc, enviarTexto } = montar({}, true);
    for (let i = 0; i < 30; i += 1) {
      await svc.sendText(pedido({ dedupKey: dedupKeyEnvio(`lead-${i}`, 'D0', AGORA) }));
    }
    expect(enviarTexto).not.toHaveBeenCalled();
  });
});

describe('WhatsAppService — travas antes da rede', () => {
  it('disparoAtivo=false não chega a chamar a Evolution', async () => {
    const { svc, enviarTexto } = montar({ disparoAtivo: false });
    const r = await svc.sendText(pedido());
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('DISPARO_DESLIGADO');
    expect(enviarTexto).not.toHaveBeenCalled();
  });

  it('template inválido não entra na fila nem vai para a rede', async () => {
    const { svc, enviarTexto } = montar();
    const r = await svc.sendText(pedido({ text: 'Oi, faço um diagnóstico gratuito pra vocês.' }));
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('VALIDADOR');
    expect(r.motivo).toContain('R1_NADA_GRATUITO');
    expect(enviarTexto).not.toHaveBeenCalled();
  });

  it('teto do dia estourado bloqueia antes da rede', async () => {
    const { svc, enviarTexto } = montar({ enviadosHoje: 30, entreguesHoje: 30 });
    const r = await svc.sendText(pedido());
    expect(r.motivo).toContain('TETO_DIARIO');
    expect(enviarTexto).not.toHaveBeenCalled();
  });

  it('dedup: a mesma chave não envia duas vezes', async () => {
    const { svc, enviarTexto } = montar();
    const p = pedido();
    const primeiro = await svc.sendText(p);
    const segundo = await svc.sendText(p);

    expect(primeiro.ok).toBe(true);
    expect(segundo.ok).toBe(false);
    expect(segundo.motivo).toContain('DEDUP');
    expect(enviarTexto).toHaveBeenCalledTimes(1);
  });
});

describe('WhatsAppService — envio e retry', () => {
  it('envio bem-sucedido grava o id da Evolution', async () => {
    const { svc, enviarTexto } = montar();
    const r = await svc.sendText(pedido());
    expect(r.ok).toBe(true);
    expect(r.mensagem?.status).toBe('ENVIADA');
    expect(r.mensagem?.evolutionMessageId).toBe('evo-1');
    expect(enviarTexto).toHaveBeenCalledTimes(1);
  });

  it('tenta 3 vezes e desiste marcando FALHA', async () => {
    const { repo } = outboxEmMemoria();
    const enviarTexto = vi.fn(async () => {
      throw new Error('connection refused');
    });
    let seq = 0;
    const svc = new WhatsAppService({
      outbox: repo,
      transporte: { enviarTexto },
      estado: async () => estadoOk(),
      agora: () => AGORA,
      novoId: () => `msg-${++seq}`,
    });

    const r = await svc.sendText(pedido());
    expect(r.ok).toBe(false);
    expect(r.mensagem?.status).toBe('FALHA');
    expect(r.mensagem?.tentativas).toBe(3);
    expect(enviarTexto).toHaveBeenCalledTimes(3);
  });

  it('sucesso na 2ª tentativa não vira falha', async () => {
    const { repo } = outboxEmMemoria();
    let n = 0;
    const enviarTexto = vi.fn(async () => {
      n += 1;
      if (n === 1) throw new Error('timeout');
      return { messageId: 'evo-2' };
    });
    let seq = 0;
    const svc = new WhatsAppService({
      outbox: repo,
      transporte: { enviarTexto },
      estado: async () => estadoOk(),
      agora: () => AGORA,
      novoId: () => `msg-${++seq}`,
    });
    const r = await svc.sendText(pedido());
    expect(r.ok).toBe(true);
    expect(r.mensagem?.tentativas).toBe(2);
  });
});

// ------------------------------------------------------------------- inbound

function portasInbound(over: Partial<PortasInbound> = {}) {
  const chamadas: string[] = [];
  const processados = new Set<string>();
  const pausas: Array<{ id: string; motivo: string }> = [];
  const optOuts: string[] = [];

  const portas: PortasInbound = {
    async jaProcessado(k) {
      return processados.has(k);
    },
    async salvarMensagem(m) {
      chamadas.push('salvar');
      processados.add(`wh:MESSAGES_UPSERT:${m.evolutionMessageId}`);
      return { id: 'in-1' };
    },
    async pausarEnrollment(id, motivo) {
      chamadas.push('pausar');
      pausas.push({ id, motivo });
    },
    async registrarOptOut(tel) {
      chamadas.push('optout');
      optOuts.push(tel);
    },
    async salvarClassificacao() {
      chamadas.push('salvarClassificacao');
    },
    async notificar() {
      chamadas.push('notificar');
    },
    ...over,
  };
  return { portas, chamadas, pausas, optOuts, processados };
}

const recebida = (over: Partial<MensagemRecebida> = {}): MensagemRecebida => ({
  evolutionMessageId: 'evo-in-1',
  de: '5521999998888',
  telefoneNormalizado: '5521999998888',
  texto: 'opa, tenho interesse sim',
  recebidaEm: AGORA,
  leadId: 'lead-1',
  enrollmentId: 'enr-1',
  ...over,
});

describe('inbound — ordem dos passos', () => {
  it('PAUSA o enrollment ANTES de classificar', async () => {
    const classificar = vi.fn(async () => ({ intencao: 'INTERESSADO' as const, confianca: 0.9 }));
    const { portas, chamadas } = portasInbound({ classificar });

    const r = await processarResposta(recebida(), portas);

    const iPausa = r.passos.indexOf('PAUSAR_ENROLLMENT');
    const iClass = r.passos.indexOf('CLASSIFICAR');
    expect(iPausa).toBeGreaterThanOrEqual(0);
    expect(iClass).toBeGreaterThan(iPausa);
    // E na ordem real de chamadas, não só no rótulo.
    expect(chamadas.indexOf('pausar')).toBeLessThan(chamadas.indexOf('salvarClassificacao'));
  });

  it('PAUSA o enrollment mesmo quando a IA explode', async () => {
    const classificar = vi.fn(async () => {
      throw new Error('anthropic 500');
    });
    const { portas, pausas } = portasInbound({ classificar });

    const r = await processarResposta(recebida(), portas);

    expect(pausas).toEqual([{ id: 'enr-1', motivo: 'RESPOSTA' }]);
    expect(r.classificacao).toBeUndefined();
    expect(r.duplicada).toBe(false);
  });

  it('opt-out é detectado ANTES de qualquer IA — a IA nem é chamada', async () => {
    const classificar = vi.fn();
    const { portas, optOuts } = portasInbound({ classificar });

    const r = await processarResposta(recebida({ texto: 'não tenho interesse' }), portas);

    expect(r.optOut).toBe(true);
    expect(r.classificacao?.intencao).toBe('OPT_OUT');
    expect(classificar).not.toHaveBeenCalled();
    expect(optOuts).toEqual(['5521999998888']);
    expect(r.passos).not.toContain('CLASSIFICAR');
  });

  it('opt-out pausa o enrollment duas vezes: por resposta e por saída', async () => {
    const { portas, pausas } = portasInbound();
    await processarResposta(recebida({ texto: 'sair' }), portas);
    expect(pausas).toEqual([
      { id: 'enr-1', motivo: 'RESPOSTA' },
      { id: 'enr-1', motivo: 'OPT_OUT' },
    ]);
  });

  it('funciona sem IA nenhuma configurada', async () => {
    const { portas } = portasInbound({ classificar: undefined });
    const r = await processarResposta(recebida(), portas);
    expect(r.duplicada).toBe(false);
    expect(r.classificacao).toBeUndefined();
    expect(r.passos).toContain('PAUSAR_ENROLLMENT');
  });
});

describe('inbound — idempotência do webhook', () => {
  it('o mesmo evolutionMessageId não é processado duas vezes', async () => {
    const { portas, chamadas, pausas } = portasInbound();

    const primeiro = await processarResposta(recebida(), portas);
    const segundo = await processarResposta(recebida(), portas);

    expect(primeiro.duplicada).toBe(false);
    expect(segundo.duplicada).toBe(true);
    expect(chamadas.filter((c) => c === 'salvar').length).toBe(1);
    expect(pausas.length).toBe(1);
  });

  it('ids diferentes são processados normalmente', async () => {
    const { portas, chamadas } = portasInbound();
    await processarResposta(recebida({ evolutionMessageId: 'a' }), portas);
    await processarResposta(recebida({ evolutionMessageId: 'b' }), portas);
    expect(chamadas.filter((c) => c === 'salvar').length).toBe(2);
  });
});

describe('dedupKey', () => {
  it('é estável para o mesmo lead/toque/dia e muda de dia', () => {
    const a = dedupKeyEnvio('lead-1', 'D0', AGORA);
    const b = dedupKeyEnvio('lead-1', 'D0', AGORA.plus({ hours: 3 }));
    const c = dedupKeyEnvio('lead-1', 'D0', AGORA.plus({ days: 1 }));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toBe('lead-1:D0:2026-08-25');
  });

  it('usa o dia de São Paulo, não o de UTC', () => {
    // 25/08 22h em SP ainda é 25/08 ali, mas já é 26/08 em UTC.
    const noite = DateTime.fromISO('2026-08-25T22:00:00', { zone: TIMEZONE });
    expect(noite.toUTC().day).toBe(26);
    expect(dedupKeyEnvio('lead-1', 'D0', noite)).toBe('lead-1:D0:2026-08-25');
  });
});
