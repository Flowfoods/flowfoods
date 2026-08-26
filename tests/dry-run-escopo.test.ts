import { describe, expect, it, vi } from 'vitest';
import { DateTime } from 'luxon';
import { WhatsAppService } from '@/lib/whatsapp/service';
import type { MensagemOutbox, RepositorioOutbox } from '@/lib/whatsapp/service';
import type { EstadoEnvio } from '@/lib/barney/tetos';
import { dedupKeyEnvio, dedupKeyEnvioDryRun, PREFIXO_DRY_RUN } from '@/lib/barney/dedup';
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
  let seq = 0;
  const repo: RepositorioOutbox = {
    async acharPorDedup(k) {
      return [...linhas.values()].find((m) => m.dedupKey === k) ?? null;
    },
    async salvar(m) {
      const comId = { ...m, id: `msg-${++seq}` };
      linhas.set(comId.id, comId);
      return comId;
    },
    async atualizar(id, patch) {
      const novo = { ...linhas.get(id)!, ...patch };
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
  const enviarTexto = vi.fn(async () => ({ messageId: `evo-${linhas.size}` }));
  const svc = new WhatsAppService(
    {
      outbox: repo,
      transporte: { enviarTexto },
      estado: async () => estadoOk(over),
      agora: () => AGORA,
      novoId: () => 'ignorado',
    },
    { dryRun },
  );
  return { svc, enviarTexto, linhas };
}

const corpoValido = () => renderizar(SEED_TEMPLATES[0].corpo, LEAD, AGORA);

describe('chave de dry-run (regressão: simular inutilizava o dia)', () => {
  it('a chave simulada é diferente da real', () => {
    const real = dedupKeyEnvio('lead-1', 'D0', AGORA);
    const dry = dedupKeyEnvioDryRun('lead-1', 'D0', AGORA);
    expect(dry).not.toBe(real);
    expect(dry.startsWith(PREFIXO_DRY_RUN)).toBe(true);
    expect(dry).toBe(`${PREFIXO_DRY_RUN}${real}`);
  });

  it('simular e DEPOIS enviar de verdade funciona — o dedup não barra', async () => {
    const { svc: simulador, enviarTexto: redeSim } = montar({}, true);
    const simulado = await simulador.sendText({
      to: '5521999998888',
      text: corpoValido(),
      dedupKey: dedupKeyEnvioDryRun('lead-1', 'D0', AGORA),
      kind: 'CADENCIA',
      leadId: 'lead-1',
      toque: 'D0',
    });

    expect(simulado.ok).toBe(true);
    expect(simulado.simulado).toBe(true);
    expect(redeSim).not.toHaveBeenCalled();

    // Envio real, no mesmo dia, para o mesmo lead e toque.
    const { svc: real, enviarTexto: rede } = montar();
    const enviado = await real.sendText({
      to: '5521999998888',
      text: corpoValido(),
      dedupKey: dedupKeyEnvio('lead-1', 'D0', AGORA),
      kind: 'CADENCIA',
      leadId: 'lead-1',
      toque: 'D0',
    });

    expect(enviado.ok, `bloqueado por: ${enviado.motivo}`).toBe(true);
    expect(rede).toHaveBeenCalledTimes(1);
  });
});

describe('escopo da falha (regressão: um item ruim travava o lote)', () => {
  it('corpo reprovado no validador é falha de ITEM', async () => {
    const { svc, enviarTexto } = montar();
    const r = await svc.sendText({
      to: '5521999998888',
      text: 'Oi, faço um diagnóstico gratuito pra vocês.',
      dedupKey: dedupKeyEnvio('lead-ruim', 'D0', AGORA),
      kind: 'CADENCIA',
      leadId: 'lead-ruim',
      toque: 'D0',
    });

    expect(r.ok).toBe(false);
    expect(r.escopo).toBe('ITEM');
    expect(enviarTexto).not.toHaveBeenCalled();
  });

  it('mensagem já existente é falha de ITEM', async () => {
    const { svc } = montar();
    const p = {
      to: '5521999998888',
      text: corpoValido(),
      dedupKey: dedupKeyEnvio('lead-1', 'D0', AGORA),
      kind: 'CADENCIA',
      leadId: 'lead-1',
      toque: 'D0' as const,
    };
    await svc.sendText(p);
    const segundo = await svc.sendText(p);

    expect(segundo.ok).toBe(false);
    expect(segundo.escopo).toBe('ITEM');
  });

  it.each([
    ['disparo desligado', { disparoAtivo: false }],
    ['teto do dia', { enviadosHoje: 30, entreguesHoje: 30 }],
    ['teto da hora', { enviadosUltimaHora: 8 }],
    ['stop-loss por falhas', { falhasConsecutivas: 3 }],
    ['instância fora do ar', { estadoInstancia: 'close' }],
  ])('%s é falha GLOBAL — a fila deve parar', async (_rotulo, over) => {
    const { svc } = montar(over as Partial<EstadoEnvio>);
    const r = await svc.sendText({
      to: '5521999998888',
      text: corpoValido(),
      dedupKey: dedupKeyEnvio('lead-1', 'D0', AGORA),
      kind: 'CADENCIA',
      leadId: 'lead-1',
      toque: 'D0',
    });

    expect(r.ok).toBe(false);
    expect(r.escopo).toBe('GLOBAL');
  });

  it('Evolution fora do ar depois das 3 tentativas é falha GLOBAL', async () => {
    const { repo } = outboxEmMemoria();
    const enviarTexto = vi.fn(async () => {
      throw new Error('connection refused');
    });
    const svc = new WhatsAppService({
      outbox: repo,
      transporte: { enviarTexto },
      estado: async () => estadoOk(),
      agora: () => AGORA,
      novoId: () => 'ignorado',
    });

    const r = await svc.sendText({
      to: '5521999998888',
      text: corpoValido(),
      dedupKey: dedupKeyEnvio('lead-1', 'D0', AGORA),
      kind: 'CADENCIA',
      leadId: 'lead-1',
      toque: 'D0',
    });

    expect(r.ok).toBe(false);
    expect(r.escopo).toBe('GLOBAL');
    expect(enviarTexto).toHaveBeenCalledTimes(3);
  });

  it('toda recusa carrega escopo — nenhuma fica sem classificação', async () => {
    const { svc } = montar({ disparoAtivo: false });
    const r = await svc.sendText({
      to: '5521999998888',
      text: corpoValido(),
      dedupKey: dedupKeyEnvio('lead-1', 'D0', AGORA),
      kind: 'CADENCIA',
      leadId: 'lead-1',
      toque: 'D0',
    });
    expect(r.escopo).toBeDefined();
  });
});
