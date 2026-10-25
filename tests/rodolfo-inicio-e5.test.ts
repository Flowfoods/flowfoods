/**
 * E5.1 · decisão 469 — o Início do painel do nível 1 ("O que precisa de você"):
 *  - a ordem é a de resolver: WhatsApp, disparo, base vazia, lote aguardando, respostas, pedidos, formulário não aberto;
 *  - só entra o que existe (dia tranquilo: nenhuma pendência), sem código nem plural com "(s)";
 *  - os números do dia: enviados de teto, respostas em 24 horas, pedidos aguardando.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/lib/erp/pedidos', () => ({ contarPedidosAbertos: async () => ({ abertos: 0, atrasados: 0 }) }));

import { indicadoresDoNivel1, pendenciasDoNivel1, type RetratoDoDia } from '@/lib/rodolfo/painel-do-dia';

const tranquilo: RetratoDoDia = {
  estadoInstancia: 'open',
  disparoAtivo: true,
  modoAprovacao: true,
  pausaAutomatica: null,
  totalLeads: 40,
  lote: { status: 'EM_ENVIO', itens: 10 },
  semClassificar: 0,
  pedidos: { abertos: 0, atrasados: 0 },
  portaisSemAbrir: [],
  enviadosHoje: 4,
  tetoDoDia: 10,
  respostas24h: 2,
  totalEnviadoHistorico: 40,
};

describe('E5.1 · Início do nível 1', () => {
  it('dia tranquilo: nenhuma pendência', () => {
    expect(pendenciasDoNivel1(tranquilo)).toEqual([]);
  });

  it('tudo pendente: na ordem de resolver, com a ação de cada uma', () => {
    const p = pendenciasDoNivel1({
      ...tranquilo,
      pausaAutomatica: '3 falhas consecutivas. Pausa geral até revisão.',
      estadoInstancia: 'close',
      disparoAtivo: false,
      totalLeads: 0,
      lote: { status: 'PROPOSTO', itens: 3 },
      semClassificar: 1,
      pedidos: { abertos: 2, atrasados: 1 },
      portaisSemAbrir: [{ id: 'portal_valentins', nome: "Grupo Valentin's" }],
      totalEnviadoHistorico: 0,
    });
    expect(p.map((x) => x.chave)).toEqual(['pausa', 'whatsapp', 'disparo', 'leads', 'lote', 'respostas', 'pedidos', 'portal-portal_valentins']);
    expect(p.map((x) => x.href)).toEqual(['/rodolfo/metricas', '/rodolfo/config', '/rodolfo/config', '/rodolfo/leads/importar', '/rodolfo/barney', '/rodolfo/inbox?intencao=SEM', '/rodolfo/onboarding', '/rodolfo/portal/portal_valentins']);
    expect(p[0].texto).toBe('3 falhas consecutivas. Pausa geral até revisão. Veja a saúde do número antes de retomar.');
    expect(p[2].texto).toBe('Nada sai, nem à mão. Ligue em Regras de envio quando for começar; os 10 primeiros envios são um a um, em Cadência.');
    expect(p[5].titulo).toBe('1 resposta sem classificar');
    expect(p[6].titulo).toBe('2 pedidos aguardando (1 com atraso)');
    expect(p[7].titulo).toBe("Grupo Valentin's ainda não começou o formulário");
    for (const x of p) expect(`${x.titulo} ${x.texto} ${x.acao}`).not.toMatch(/\(s\)|[A-Z]{2,}_|OPT_OUT|worker|Evolution/);
  });

  it('lote vazio aguardando não vira pendência; número aquecido não fala dos 10 primeiros', () => {
    const p = pendenciasDoNivel1({ ...tranquilo, disparoAtivo: false, lote: { status: 'PROPOSTO', itens: 0 } });
    expect(p.map((x) => x.chave)).toEqual(['disparo']);
    expect(p[0].texto).toBe('Nada sai, nem à mão. Ligue em Regras de envio quando for começar.');
  });

  it('aprovação automática: lote proposto não é pendência; tudo pronto e sem lote: "Montar o lote de hoje"', () => {
    expect(pendenciasDoNivel1({ ...tranquilo, modoAprovacao: false, lote: { status: 'PROPOSTO', itens: 3 } })).toEqual([]);
    const p = pendenciasDoNivel1({ ...tranquilo, lote: null });
    expect(p.map((x) => [x.chave, x.acao])).toEqual([['montar', 'Montar o lote de hoje']]);
    // Sem disparo, sem WhatsApp ou em pausa, montar não é o próximo passo.
    expect(pendenciasDoNivel1({ ...tranquilo, lote: null, disparoAtivo: false }).map((x) => x.chave)).toEqual(['disparo']);
  });

  it('WhatsApp desconectado: respostas em "—", não zero', () => {
    const i = indicadoresDoNivel1({ ...tranquilo, estadoInstancia: 'close', respostas24h: 0 });
    expect(i[1]).toMatchObject({ valor: { tipo: 'numero', numero: null }, contexto: 'WhatsApp desconectado' });
    expect(indicadoresDoNivel1({ ...tranquilo, respostas24h: 0 })[1].contexto).toBe('nenhuma resposta');
  });

  it('os números do dia', () => {
    const i = indicadoresDoNivel1({ ...tranquilo, semClassificar: 1, pedidos: { abertos: 3, atrasados: 0 } });
    expect(i.map((x) => [x.rotulo, x.valor])).toEqual([
      // Envio parcial é andamento do dia, não alerta (decisão 473).
      ['Enviados hoje', { tipo: 'fracao', de: 4, total: 10, parcialEhNormal: true }],
      ['Respostas em 24 horas', { tipo: 'numero', numero: 2 }],
      ['Pedidos aguardando', { tipo: 'numero', numero: 3 }],
    ]);
    expect(i[1].contexto).toBe('1 sem classificar');
    expect(i[2].contexto).toBe('nenhum com atraso');
  });
});
