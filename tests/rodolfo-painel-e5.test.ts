/**
 * E5.1 · decisão 466 — o painel do nível 1 com os padrões do ERP:
 *  - todo status do banco (lead, intenção, lote, mensagem, inscrição) tem nome em português: nenhum código aparece na tela;
 *  - o toque da cadência vira "1ª mensagem (dia 0)"; código desconhecido aparece como veio (nunca some);
 *  - a Config recusa salvar sem nenhum dia marcado (antes virava segunda a sexta, sem aviso) e não grava nada.
 * E5.1 · decisão 467 — os botões da Cadência saem de uma função pura (`telaDaCadencia`), conferida aqui situação por situação:
 *  - depois de cada envio do aquecimento o botão fica, desabilitado, com quando libera (antes sumia e a tela mandava usar
 *    um botão que não existia);
 *  - lote cancelado, vazio ou inexistente: sem botão de envio; aguardando aprovação (com aprovação manual): só "Aprovar";
 *  - nunca mais de um botão principal.
 */
import { describe, expect, it, vi } from 'vitest';

const salvar = vi.hoisted(() => vi.fn(async (c: unknown) => c));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { id: 'rodolfo' } }) }));
vi.mock('@/lib/rodolfo/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));
vi.mock('@/lib/rodolfo/config', () => ({ salvarConfig: salvar }));

import { BatchStatus, Canal, EnrollmentStatus, Intencao, LeadStatus, MessageStatus, TipoTelefone, Toque } from '@prisma/client';
import { DateTime } from 'luxon';
import {
  ROTULO_DA_INSCRICAO,
  ROTULO_DA_INTENCAO,
  ROTULO_DA_MENSAGEM,
  ROTULO_DA_PAUSA,
  ROTULO_DO_CANAL,
  ROTULO_DO_LEAD,
  ROTULO_DO_LOTE,
  ROTULO_DO_TIPO_DE_TELEFONE,
  proximoToque,
  rotulo,
  rotuloDoToque,
  resumoDaImportacao,
  telefoneLegivel,
  textoDaRecusa,
  textoDoEvento,
} from '@/lib/rodolfo/rotulos';
import { acaoSalvarConfig } from '@/app/rodolfo/(painel)/actions';
import { telaDaCadencia, type EntradaDaCadencia } from '@/lib/rodolfo/cadencia-tela';
import { podeEnviar, type EstadoEnvio } from '@/lib/barney/tetos';
import { INTERVALO_MIN_S, TIMEZONE } from '@/lib/barney/regras';

describe('E5.1 · rótulos do painel do nível 1', () => {
  it('todo status do banco tem nome em português, sem código nem caixa alta', () => {
    for (const [enumerado, mapa] of [
      [LeadStatus, ROTULO_DO_LEAD],
      [Intencao, ROTULO_DA_INTENCAO],
      [BatchStatus, ROTULO_DO_LOTE],
      [MessageStatus, ROTULO_DA_MENSAGEM],
      [EnrollmentStatus, ROTULO_DA_INSCRICAO],
      [TipoTelefone, ROTULO_DO_TIPO_DE_TELEFONE],
      [Canal, ROTULO_DO_CANAL],
    ] as const) {
      for (const codigo of Object.values(enumerado)) {
        const nome = mapa[codigo as string];
        expect(nome, String(codigo)).toBeTruthy();
        expect(nome).not.toMatch(/_|^[A-Z]{2,}/);
      }
    }
    expect(rotulo(ROTULO_DO_LEAD, 'OPT_OUT')).toBe('Pediu para sair');
    expect(rotulo(ROTULO_DO_LEAD, 'CODIGO_NOVO')).toBe('CODIGO_NOVO');
    expect(rotulo(ROTULO_DA_INTENCAO, null, 'Sem classificar')).toBe('Sem classificar');
  });

  it('o toque da cadência em palavras, na ordem de TOQUES', () => {
    for (const t of Object.values(Toque)) expect(rotuloDoToque(t)).toMatch(/^\dª mensagem \(dia \d+\)$/);
    expect(rotuloDoToque('D4')).toBe('2ª mensagem (dia 4)');
    expect(rotuloDoToque('D10')).toBe('3ª mensagem (dia 10)');
    expect(rotuloDoToque('D0')).toBe('1ª mensagem (dia 0)');
    expect(rotuloDoToque('D+4')).toBe('2ª mensagem (dia 4)');
    expect(rotuloDoToque('D+10')).toBe('3ª mensagem (dia 10)');
    expect(rotuloDoToque('D+7')).toBe('mensagem do dia 7');
    expect(rotuloDoToque('extra')).toBe('extra');
    expect(rotuloDoToque(null)).toBe('—');
  });

  it('o próximo toque é o que vem depois do último enviado (a Hoje mostrava o último como se fosse o próximo)', () => {
    expect(proximoToque(null)).toBe('D0');
    expect(proximoToque('D0')).toBe('D4');
    expect(proximoToque('D4')).toBe('D10');
    expect(proximoToque('D10')).toBeNull();
    expect(rotuloDoToque(proximoToque('D0'))).toBe('2ª mensagem (dia 4)');
  });

  it('a linha do tempo e as recusas sem código', () => {
    expect(textoDoEvento('D0 enviado.')).toBe('1ª mensagem (dia 0) enviada.');
    expect(textoDoEvento('D4 simulado — nada foi enviado.')).toBe('2ª mensagem (dia 4) simulada, nada foi enviado.');
    expect(textoDoEvento('Opt-out registrado à mão.')).toBe('Pediu para sair (registrado à mão).');
    expect(textoDoEvento('Importado no lote X (novo).')).toBe('Importado no lote X (novo).');
    expect(textoDoEvento('Importado no lote Zona Oeste (ATUALIZADO).')).toBe('Importado no lote Zona Oeste (atualizado).');
    expect(telefoneLegivel('5521990001111')).toBe('(21) 99000-1111');
    expect(telefoneLegivel('552133332222')).toBe('(21) 3333-2222');
    expect(telefoneLegivel('123')).toBe('123');
    expect(telefoneLegivel(null)).toBe('—');
    expect(resumoDaImportacao({ total: 120, novos: 80, atualizados: 10, bloqueadosConflito: 3, bloqueadosOptOut: 1, semTelefone: 20, invalidos: 0 })).toBe(
      '120 linhas lidas: 80 novos, 10 atualizados, 3 em conflito com o Bibi, 1 que já pediu para sair e 20 sem celular (em Visita e Instagram). Conflito com o Bibi e quem pediu para sair entram na lista, mas nunca recebem mensagem.',
    );
    expect(resumoDaImportacao({ total: 1, novos: 1, atualizados: 0, bloqueadosConflito: 0, bloqueadosOptOut: 0, semTelefone: 0, invalidos: 0 })).toBe('1 linha lida: 1 novo e 0 atualizados.');
    expect(rotulo(ROTULO_DA_PAUSA, 'OPT_OUT manual')).toBe('Pediu para sair (registrado à mão)');
    expect(rotulo(ROTULO_DA_PAUSA, 'RESPOSTA')).toBe('Respondeu');
    expect(textoDaRecusa('DISPARO_DESLIGADO: Disparo desligado.')).toBe('Disparo desligado. Ligue em Config.');
    expect(textoDaRecusa('TETO_DIARIO: Teto do dia atingido: 30/30.')).toBe('Teto do dia atingido: 30/30.');
    expect(textoDaRecusa('VALIDADOR: R1_NADA_GRATUITO: promete grátis')).toBe('A mensagem não passou na conferência do texto: promete grátis');
    expect(textoDaRecusa('FALHA após 3 tentativas: timeout')).toBe('Não saiu depois de 3 tentativas: timeout');
    expect(textoDaRecusa('Lote de hoje cancelado.')).toBe('Lote de hoje cancelado.');
    for (const r of ['DEDUP: mensagem já existe para esta chave.', 'INSTANCIA_FORA_DO_AR: WhatsApp desconectado: precisa estar conectado.']) expect(textoDaRecusa(r)).not.toMatch(/[A-Z]{2,}_/);
  });
});

describe('E5.1 · botões da Cadência por situação (decisão 467)', () => {
  const TERCA_14H = DateTime.fromISO('2026-08-25T14:00:00', { zone: TIMEZONE });
  const estado = (over: Partial<EstadoEnvio> = {}): EstadoEnvio => ({
    disparoAtivo: true,
    estadoInstancia: 'open',
    primeiroEnvioEm: TERCA_14H.minus({ days: 2 }),
    totalEnviadoHistorico: 3,
    enviadosHoje: 3,
    entreguesHoje: 3,
    falhasConsecutivas: 0,
    enviadosUltimaHora: 3,
    ultimoEnvioEm: null,
    ...over,
  });
  const tela = (lote: EntradaDaCadencia['lote'], e: EstadoEnvio = estado(), modoAprovacao = true, agora = TERCA_14H) =>
    telaDaCadencia({ lote, manual: podeEnviar(e, agora, { manual: true }), automatico: podeEnviar(e, agora), totalEnviadoHistorico: e.totalEnviadoHistorico, modoAprovacao });
  const primarios = (t: ReturnType<typeof tela>) => [t.principal === 'montar' && t.montar, t.principal === 'aprovar' && t.aprovar, !!t.envio && t.faltamManuais > 0].filter(Boolean).length;

  it('sem lote: montar é o principal, sem envio, sem aprovar, sem cancelar', () => {
    const t = tela(null);
    expect(t).toMatchObject({ principal: 'montar', montar: true, aprovar: false, cancelar: false, envio: null });
  });

  it('"Montar de novo" só com lote aguardando ou cancelado; aprovado ou enviando não se remonta', () => {
    expect(tela({ status: 'PROPOSTO', itens: 5 }).montar).toBe(true);
    expect(tela({ status: 'CANCELADO', itens: 5 }).montar).toBe(true);
    expect(tela({ status: 'APROVADO', itens: 5 }).montar).toBe(false);
    expect(tela({ status: 'EM_ENVIO', itens: 5 }).montar).toBe(false);
    expect(tela({ status: 'APROVADO', itens: 0 })).toMatchObject({ montar: false, principal: null });
  });

  it('lote vazio: montar de novo, sem "Aprovar" nem envio', () => {
    expect(tela({ status: 'PROPOSTO', itens: 0 })).toMatchObject({ principal: 'montar', aprovar: false, envio: null, cancelar: true });
  });

  it('aguardando aprovação (aprovação manual): só "Aprovar" como principal, sem envio', () => {
    expect(tela({ status: 'PROPOSTO', itens: 5 })).toMatchObject({ principal: 'aprovar', aprovar: true, envio: null });
  });

  it('aguardando, com aprovação automática: o lote já envia; aprovar fica como secundário', () => {
    const t = tela({ status: 'PROPOSTO', itens: 5 }, estado(), false);
    expect(t).toMatchObject({ principal: 'enviar', aprovar: true, envio: { habilitado: true, texto: 'Enviar o próximo (4 de 10)' } });
  });

  it('aprovado, aquecendo: "Enviar o próximo (x de 10)" é o principal', () => {
    expect(tela({ status: 'APROVADO', itens: 5 })).toMatchObject({ principal: 'enviar', envio: { habilitado: true, texto: 'Enviar o próximo (4 de 10)' }, parado: null });
  });

  it('logo depois de um envio: o botão fica, desabilitado, e a tela diz quando libera (antes sumia)', () => {
    const e = estado({ ultimoEnvioEm: TERCA_14H.minus({ seconds: 30 }) });
    const t = tela({ status: 'EM_ENVIO', itens: 5 }, e);
    expect(t.envio).toEqual({ habilitado: false, texto: 'Enviar o próximo (4 de 10)', liberaEmSegundos: INTERVALO_MIN_S - 30 });
    expect(t.parado?.titulo).toBe('Aguarde.');
    expect(t.parado?.texto).toMatch(/Libera em (\d+ s|cerca de \d+ min)\.$/);
    expect(t.parado?.texto).not.toMatch(/Enviar agora|Faltam/);
  });

  it('teto da hora: espera que passa sozinha, botão desabilitado', () => {
    const t = tela({ status: 'EM_ENVIO', itens: 5 }, estado({ totalEnviadoHistorico: 500, primeiroEnvioEm: TERCA_14H.minus({ days: 30 }), enviadosUltimaHora: 999 }));
    expect(t.envio?.habilitado).toBe(false);
    expect(t.parado?.texto).toMatch(/Libera em cerca de 10 min\.$/);
  });

  it('disparo desligado e WhatsApp fora: sem botão de envio, com o link para Config', () => {
    expect(tela({ status: 'APROVADO', itens: 5 }, estado({ disparoAtivo: false }))).toMatchObject({ envio: null, parado: { config: 'ligar' } });
    expect(tela({ status: 'APROVADO', itens: 5 }, estado({ estadoInstancia: 'close' }))).toMatchObject({ envio: null, parado: { config: 'conectar' } });
  });

  it('lote cancelado: sem envio, sem cancelar, e diz como voltar', () => {
    const t = tela({ status: 'CANCELADO', itens: 5 });
    expect(t).toMatchObject({ envio: null, cancelar: false, aprovar: false, principal: null });
    expect(t.parado).toMatchObject({ titulo: 'Lote cancelado.' });
  });

  it('número aquecido: "Enviar o próximo agora" secundário; fora da janela diz que o automático parou e o manual segue', () => {
    const aquecido = estado({ totalEnviadoHistorico: 500, primeiroEnvioEm: TERCA_14H.minus({ days: 30 }) });
    expect(tela({ status: 'EM_ENVIO', itens: 5 }, aquecido)).toMatchObject({ principal: null, envio: { habilitado: true, texto: 'Enviar o próximo agora' }, parado: null });
    const sabado = DateTime.fromISO('2026-08-29T14:00:00', { zone: TIMEZONE });
    const t = tela({ status: 'EM_ENVIO', itens: 5 }, aquecido, true, sabado);
    expect(t.envio?.habilitado).toBe(true);
    expect(t.parado?.titulo).toBe('Envio automático parado.');
  });

  it('nunca mais de um botão principal', () => {
    for (const status of ['PROPOSTO', 'APROVADO', 'EM_ENVIO', 'CANCELADO', 'CONCLUIDO'])
      for (const itens of [0, 5])
        for (const modo of [true, false])
          for (const e of [estado(), estado({ disparoAtivo: false }), estado({ ultimoEnvioEm: TERCA_14H.minus({ seconds: 10 }) })]) {
            expect(primarios(tela({ status, itens }, e, modo))).toBeLessThanOrEqual(1);
          }
    expect(primarios(tela(null))).toBe(1);
    // O principal sempre é um botão que está na tela.
    for (const status of ['PROPOSTO', 'APROVADO', 'EM_ENVIO', 'CANCELADO']) for (const itens of [0, 5]) {
      const t = tela({ status, itens });
      if (t.principal === 'montar') expect(t.montar).toBe(true);
      if (t.principal === 'aprovar') expect(t.aprovar).toBe(true);
      if (t.principal === 'enviar') expect(t.envio?.habilitado).toBe(true);
    }
  });
});

describe('E5.1 · Config sem nenhum dia', () => {
  const form = (dias: string[]) => {
    const f = new FormData();
    f.set('maxPorDia', '10');
    f.set('horaInicio', '10');
    f.set('horaFim', '18');
    for (const d of dias) f.append('diaSemana', d);
    return f;
  };

  it('recusa salvar sem dia marcado e não grava nada', async () => {
    salvar.mockClear();
    const r = await acaoSalvarConfig(null as never, form([]));
    expect(r).toEqual({ ok: false, mensagem: 'Escolha ao menos um dia da semana. Para parar os envios, desligue o disparo.' });
    expect(salvar).not.toHaveBeenCalled();
  });

  it('um dia que a tela não oferece (sábado forjado no POST) não conta como marcado', async () => {
    salvar.mockClear();
    const r = await acaoSalvarConfig(null as never, form(['6']));
    expect(r.ok).toBe(false);
    expect(salvar).not.toHaveBeenCalled();
  });

  it('com dias marcados, salva exatamente os dias escolhidos', async () => {
    salvar.mockClear();
    const r = await acaoSalvarConfig(null as never, form(['1', '3', '3', '6']));
    expect(salvar).toHaveBeenCalledTimes(1);
    expect((salvar.mock.calls[0][0] as { janela: { diasSemana: number[] } }).janela.diasSemana).toEqual([1, 3]);
    expect(r.ok).toBe(true);
  });
});
