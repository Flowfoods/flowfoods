import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { desligarConexao, ligarConexao } from '@/lib/integracoes/core/conexoes';
import { enviarAckPendenteIfood, gravarLoteEventsIfood } from '@/lib/integracoes/ifood/events-inbox';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const AUTOR = 'QA sintético de Events';
const CRIACAO_NO_IFOOD = '2026-11-28T10:00:00.123456789-03:00';
type EnviarAck = Parameters<typeof enviarAckPendenteIfood>[2];

function evento(merchantId: string) {
  return {
    id: `evt_${randomUUID()}`, orderId: randomUUID(), merchantId,
    code: 'PLC', fullCode: 'PLACED', createdAt: CRIACAO_NO_IFOOD,
    category: 'FOOD', salesChannel: 'IFOOD',
  };
}

function lote(...eventos: ReturnType<typeof evento>[]) {
  return { status: 200, dados: eventos };
}

describe.skipIf(!URL_TESTE)('iFood Events · inbox e ACK em PostgreSQL real', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let outraConexao: PrismaClient;
  let perfil: PerfilDoBanco;
  const parceiros: string[] = [];
  const apps: string[] = [];

  beforeAll(async () => {
    const url = new URL(URL_TESTE!);
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    outraConexao = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    perfil = await perfilDoBanco(db);
  });

  afterAll(async () => {
    if (!db) return;
    try {
      if (parceiros.length > 0) {
        // Filhos do inbox primeiro. A limpeza desativa os gatilhos somente nesta transação de teste.
        await db.$transaction(async tx => {
          const tabelas = [
            ['IntegracaoEventoIfoodAck', 'IfoodEventoAck_imutavel'],
            ['IntegracaoEventoIfood', 'IfoodEvento_imutavel'],
          ];
          for (const [tabela, gatilho] of tabelas) {
            if (!perfil.superusuario && perfil.rls) await tx.$executeRawUnsafe(`ALTER TABLE "${tabela}" NO FORCE ROW LEVEL SECURITY`);
            await tx.$executeRawUnsafe(`ALTER TABLE "${tabela}" DISABLE TRIGGER "${gatilho}"`);
            await tx.$executeRawUnsafe(`DELETE FROM "${tabela}" WHERE "parceiroId" = ANY($1::text[])`, parceiros);
            await tx.$executeRawUnsafe(`ALTER TABLE "${tabela}" ENABLE TRIGGER "${gatilho}"`);
            if (!perfil.superusuario && perfil.rls) await tx.$executeRawUnsafe(`ALTER TABLE "${tabela}" FORCE ROW LEVEL SECURITY`);
          }
        });
        await limparParceiros(db, perfil, parceiros);
      }
      if (apps.length > 0) {
        await db.$transaction(async tx => {
          await tx.$executeRawUnsafe('ALTER TABLE "IntegracaoApp" DISABLE TRIGGER "IntegracaoApp_nao_apaga"');
          await tx.$executeRawUnsafe('DELETE FROM "IntegracaoApp" WHERE id = ANY($1::text[])', apps);
          await tx.$executeRawUnsafe('ALTER TABLE "IntegracaoApp" ENABLE TRIGGER "IntegracaoApp_nao_apaga"');
        });
      }
    } finally {
      await Promise.all([db.$disconnect(), outraConexao.$disconnect()]);
    }
  }, 120_000);

  async function criarParceiro() {
    const sufixo = randomUUID();
    const { id } = await db.parceiroFlow.create({ data: {
      nome: `Parceiro sintético Events ${sufixo}`, slug: `events-${sufixo}`, status: 'ATIVO', homologacaoDeIntegracao: true,
    } });
    parceiros.push(id);
    return doParceiro(id, db);
  }

  async function criarLoja(cliente: ClienteDoParceiro) {
    const sufixo = randomUUID();
    return cliente.loja.create({ data: { parceiroId: cliente.parceiroId, nome: `Loja sintética Events ${sufixo}`, slug: `events-${sufixo}` } });
  }

  async function criarApp() {
    const app = await db.integracaoApp.create({ data: {
      provedor: 'IFOOD', ambiente: 'TEST', nome: AUTOR, categoria: 'TEST', clientId: randomUUID(),
      nomeDoSegredo: 'IFOOD_TEST_CLIENT_SECRET', modulos: ['MERCHANT'], criadoPorNome: AUTOR,
    } });
    apps.push(app.id);
    return app.id;
  }

  async function massa() {
    const cliente = await criarParceiro();
    const loja = await criarLoja(cliente);
    const merchantId = randomUUID();
    const conexao = await ligarConexao(cliente, {
      provedor: 'IFOOD', ambiente: 'TEST', lojaId: loja.id, idExterno: merchantId, nomeExterno: 'Loja externa sintética',
    }, { nome: AUTOR });
    if (!conexao.ok) throw new Error('A conexão sintética de Events não foi criada.');
    const appId = await criarApp();
    return {
      cliente, concorrente: doParceiro(cliente.parceiroId, outraConexao),
      alvo: { lojaId: loja.id, conexaoId: conexao.id, appId, merchantId, ambiente: 'TEST' as const },
    };
  }

  async function caixa(cliente: ClienteDoParceiro) {
    return cliente.transacao(async tx => ({
      eventos: await tx.integracaoEventoIfood.findMany({ orderBy: { id: 'asc' } }),
      acks: await tx.integracaoEventoIfoodAck.findMany({ orderBy: { id: 'asc' } }),
    }));
  }

  it('duas conexões concorrentes gravam um evento e uma pendência por app', async () => {
    const { cliente, concorrente, alvo } = await massa();
    const recebido = evento(alvo.merchantId);
    const resposta = lote(recebido);
    const resultados = await Promise.all([
      gravarLoteEventsIfood(cliente, alvo, resposta),
      gravarLoteEventsIfood(concorrente, alvo, resposta),
    ]);
    expect(resultados).toEqual(expect.arrayContaining([{ novos: 1, reentregues: 0 }, { novos: 0, reentregues: 1 }]));
    const { eventos, acks } = await caixa(cliente);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({
      parceiroId: cliente.parceiroId, lojaId: alvo.lojaId, conexaoId: alvo.conexaoId,
      merchantId: alvo.merchantId, ambiente: alvo.ambiente, eventoId: recebido.id,
      pedidoId: recebido.orderId, criadoNoIfoodEm: recebido.createdAt,
    });
    expect(acks).toHaveLength(1);
    expect(acks[0]).toMatchObject({ eventoInternoId: eventos[0].id, appId: alvo.appId, ackAceitoEm: null });
  });

  it('HTTP 204 preserva o evento e a pendência existentes', async () => {
    const { cliente, alvo } = await massa();
    await gravarLoteEventsIfood(cliente, alvo, lote(evento(alvo.merchantId)));
    const antes = await caixa(cliente);
    expect(antes.eventos).toHaveLength(1);
    expect(antes.acks).toHaveLength(1);
    await expect(gravarLoteEventsIfood(cliente, alvo, { status: 204 })).resolves.toEqual({ novos: 0, reentregues: 0 });
    expect(await caixa(cliente)).toEqual(antes);
  });

  it('dois apps TEST compartilham o evento canônico e confirmam seus ACKs separadamente', async () => {
    const { cliente, concorrente, alvo } = await massa();
    const outroAlvo = { ...alvo, appId: await criarApp() };
    const recebido = evento(alvo.merchantId);
    const resposta = lote(recebido);
    await expect(gravarLoteEventsIfood(cliente, alvo, resposta)).resolves.toEqual({ novos: 1, reentregues: 0 });
    await expect(gravarLoteEventsIfood(concorrente, outroAlvo, resposta)).resolves.toEqual({ novos: 0, reentregues: 1 });
    const { eventos, acks } = await caixa(cliente);
    expect(eventos).toHaveLength(1);
    expect(acks).toHaveLength(2);
    expect(acks.map(ack => [ack.eventoInternoId, ack.appId])).toEqual(expect.arrayContaining([
      [eventos[0].id, alvo.appId], [eventos[0].id, outroAlvo.appId],
    ]));

    const enviar = vi.fn<EnviarAck>(async () => ({ status: 202 }));
    await expect(enviarAckPendenteIfood(cliente, alvo, enviar)).resolves.toEqual({ situacao: 'aceito', quantidade: 1 });
    expect(enviar).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ appId: alvo.appId, corpo: [{ id: recebido.id }] }));
    const depois = (await caixa(concorrente)).acks;
    expect(depois.find(ack => ack.appId === alvo.appId)?.ackAceitoEm).toBeInstanceOf(Date);
    expect(depois.find(ack => ack.appId === outroAlvo.appId)?.ackAceitoEm).toBeNull();
    await expect(enviarAckPendenteIfood(concorrente, outroAlvo, enviar)).resolves.toEqual({ situacao: 'aceito', quantidade: 1 });
    expect(enviar).toHaveBeenLastCalledWith(expect.objectContaining({ appId: outroAlvo.appId, corpo: [{ id: recebido.id }] }));
  });

  it('conflito com um evento já persistido reverte também o item novo do lote', async () => {
    const { cliente, concorrente, alvo } = await massa();
    const recebido = evento(alvo.merchantId);
    const novo = evento(alvo.merchantId);
    await gravarLoteEventsIfood(cliente, alvo, lote(recebido));
    const antes = await caixa(cliente);
    await expect(gravarLoteEventsIfood(cliente, alvo, lote(novo, { ...recebido, orderId: randomUUID() })))
      .rejects.toMatchObject({ name: 'ErroEventsInbox', codigo: 'CONFLITO' });
    expect(await caixa(concorrente)).toEqual(antes);
    await expect(gravarLoteEventsIfood(concorrente, alvo, lote(novo))).resolves.toEqual({ novos: 1, reentregues: 0 });
  });

  it('recusa outra loja, outro parceiro e um app inexistente sem persistir eventos ou enviar ACK', async () => {
    const { cliente, alvo } = await massa();
    const outraLoja = await criarLoja(cliente);
    const outroParceiro = await criarParceiro();
    const alvoDeOutraLoja = { ...alvo, lojaId: outraLoja.id };
    const alvoSemApp = { ...alvo, appId: randomUUID() };
    const resposta = lote(evento(alvo.merchantId));

    await expect(gravarLoteEventsIfood(cliente, alvoDeOutraLoja, resposta)).rejects.toMatchObject({ codigo: 'ALVO' });
    await expect(gravarLoteEventsIfood(outroParceiro, alvo, resposta)).rejects.toMatchObject({ codigo: 'ALVO' });
    await expect(gravarLoteEventsIfood(cliente, alvoSemApp, resposta)).rejects.toThrow();
    expect(await caixa(cliente)).toEqual({ eventos: [], acks: [] });
    expect(await caixa(outroParceiro)).toEqual({ eventos: [], acks: [] });

    await expect(gravarLoteEventsIfood(cliente, alvo, resposta)).resolves.toEqual({ novos: 1, reentregues: 0 });
    const enviar = vi.fn<EnviarAck>(async () => ({ status: 202 }));
    await expect(enviarAckPendenteIfood(cliente, alvoDeOutraLoja, enviar)).rejects.toMatchObject({ codigo: 'ALVO' });
    await expect(enviarAckPendenteIfood(outroParceiro, alvo, enviar)).rejects.toMatchObject({ codigo: 'ALVO' });
    await expect(enviarAckPendenteIfood(cliente, alvoSemApp, enviar)).resolves.toEqual({ situacao: 'sem-lote-disponivel', quantidade: 0 });
    expect(enviar).not.toHaveBeenCalled();
    expect((await caixa(cliente)).acks[0]).toMatchObject({ appId: alvo.appId, ackAceitoEm: null, posse: null });
  });

  it('o callback lê o evento e a reserva já commitados em outra transação; 202 evita novo envio sem reentrega', async () => {
    const { cliente, concorrente, alvo } = await massa();
    const recebido = evento(alvo.merchantId);
    await gravarLoteEventsIfood(cliente, alvo, lote(recebido));
    let observacao: Awaited<ReturnType<typeof caixa>> | undefined;
    const enviar = vi.fn<EnviarAck>(async () => {
      observacao = await caixa(concorrente);
      return { status: 202 };
    });

    await expect(enviarAckPendenteIfood(cliente, alvo, enviar)).resolves.toEqual({ situacao: 'aceito', quantidade: 1 });
    expect(enviar).toHaveBeenCalledExactlyOnceWith({
      appId: alvo.appId, ambiente: alvo.ambiente, merchantId: alvo.merchantId,
      metodo: 'POST', caminho: '/events/v1.0/events/acknowledgment', corpo: [{ id: recebido.id }],
    });
    expect(observacao?.eventos).toEqual([expect.objectContaining({ eventoId: recebido.id })]);
    expect(observacao?.acks).toEqual([expect.objectContaining({
      eventoInternoId: observacao?.eventos[0]?.id, ackAceitoEm: null, posse: expect.any(String), posseAte: expect.any(Date),
    })]);
    expect((await caixa(concorrente)).acks[0]).toMatchObject({ ackAceitoEm: expect.any(Date), posse: null, posseAte: null });
    await expect(enviarAckPendenteIfood(concorrente, alvo, enviar)).resolves.toEqual({ situacao: 'sem-lote-disponivel', quantidade: 0 });
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('rejeita gravar e enviar em transação externa, mesmo quando o chamador trata a rejeição', async () => {
    const { cliente, concorrente, alvo } = await massa();
    const recebido = evento(alvo.merchantId);
    const enviar = vi.fn<EnviarAck>(async () => ({ status: 202 }));
    await cliente.transacao(async tx => {
      await expect(gravarLoteEventsIfood(tx, alvo, lote(recebido))).rejects.toMatchObject({ name: 'ErroEventsInbox', codigo: 'ALVO' });
    });
    expect(await caixa(concorrente)).toEqual({ eventos: [], acks: [] });

    await expect(gravarLoteEventsIfood(cliente, alvo, lote(recebido))).resolves.toEqual({ novos: 1, reentregues: 0 });
    await cliente.transacao(async tx => {
      await expect(enviarAckPendenteIfood(tx, alvo, enviar)).rejects.toMatchObject({ name: 'ErroEventsInbox', codigo: 'ALVO' });
    });
    expect(enviar).not.toHaveBeenCalled();
    expect((await caixa(concorrente)).acks[0]).toMatchObject({ ackAceitoEm: null, posse: null });
    await expect(enviarAckPendenteIfood(concorrente, alvo, enviar)).resolves.toEqual({ situacao: 'aceito', quantidade: 1 });
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('um 202 antigo não encerra a pendência reaberta por reentrega durante o envio', async () => {
    const { cliente, concorrente, alvo } = await massa();
    const recebido = evento(alvo.merchantId);
    const resposta = lote(recebido);
    await gravarLoteEventsIfood(cliente, alvo, resposta);
    const pendenciaOriginal = (await caixa(cliente)).acks[0];
    let reentrega: Awaited<ReturnType<typeof gravarLoteEventsIfood>> | undefined;
    const primeiroCallback = vi.fn<EnviarAck>(async () => {
      reentrega = await gravarLoteEventsIfood(concorrente, alvo, resposta);
      return { status: 202 };
    });

    await expect(enviarAckPendenteIfood(cliente, alvo, primeiroCallback)).resolves.toEqual({ situacao: 'inconclusivo', quantidade: 1 });
    expect(reentrega).toEqual({ novos: 0, reentregues: 1 });
    expect(primeiroCallback).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ corpo: [{ id: recebido.id }] }));
    const reaberta = await caixa(concorrente);
    expect(reaberta.eventos).toHaveLength(1);
    expect(reaberta.acks).toEqual([expect.objectContaining({
      id: pendenciaOriginal.id, ackAceitoEm: null, posse: null, posseAte: null,
    })]);

    const segundoCallback = vi.fn<EnviarAck>(async () => ({ status: 202 }));
    await expect(enviarAckPendenteIfood(concorrente, alvo, segundoCallback)).resolves.toEqual({ situacao: 'aceito', quantidade: 1 });
    expect(segundoCallback).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ corpo: [{ id: recebido.id }] }));
    expect((await caixa(cliente)).acks).toEqual([
      expect.objectContaining({ id: pendenciaOriginal.id, ackAceitoEm: expect.any(Date), posse: null, posseAte: null }),
    ]);
  });

  it('nova conexão ativa da mesma loja recebe reentrega e confirma ACK sem trocar a origem do evento', async () => {
    const { cliente, concorrente, alvo } = await massa();
    const recebido = evento(alvo.merchantId);
    const resposta = lote(recebido);
    await gravarLoteEventsIfood(cliente, alvo, resposta);
    const original = await caixa(cliente);
    await expect(desligarConexao(cliente, alvo.conexaoId, AUTOR)).resolves.toMatchObject({ ok: true });
    const novaConexao = await ligarConexao(cliente, {
      provedor: 'IFOOD', ambiente: alvo.ambiente, lojaId: alvo.lojaId,
      idExterno: alvo.merchantId, nomeExterno: 'Loja externa sintética reconectada',
    }, { nome: AUTOR });
    if (!novaConexao.ok) throw new Error('A conexão sintética de Events não foi religada.');
    expect(novaConexao.id).not.toBe(alvo.conexaoId);
    const novoAlvo = { ...alvo, conexaoId: novaConexao.id };
    const enviar = vi.fn<EnviarAck>(async () => ({ status: 202 }));

    await expect(enviarAckPendenteIfood(cliente, alvo, enviar)).rejects.toMatchObject({ codigo: 'ALVO' });
    expect(enviar).not.toHaveBeenCalled();
    await expect(gravarLoteEventsIfood(cliente, novoAlvo, resposta)).resolves.toEqual({ novos: 0, reentregues: 1 });
    await expect(enviarAckPendenteIfood(concorrente, novoAlvo, enviar)).resolves.toEqual({ situacao: 'aceito', quantidade: 1 });
    expect(enviar).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ corpo: [{ id: recebido.id }] }));
    const depois = await caixa(cliente);
    expect(depois.eventos).toEqual(original.eventos);
    expect(depois.acks).toEqual([expect.objectContaining({ id: original.acks[0].id, ackAceitoEm: expect.any(Date) })]);
  });

  it.each([
    { falha: 'timeout do transporte', enviar: async () => { throw new Error('Timeout sintético'); }, situacao: 'inconclusivo' },
    { falha: 'status desconhecido', enviar: async () => ({ status: null }), situacao: 'inconclusivo' },
    { falha: 'HTTP 503', enviar: async () => ({ status: 503 }), situacao: 'inconclusivo' },
    { falha: 'HTTP 403', enviar: async () => ({ status: 403 }), situacao: 'pendente' },
  ])('$falha preserva a pendência e só permite reenvio após expirar a reserva', async ({ enviar, situacao }) => {
    const { cliente, concorrente, alvo } = await massa();
    const recebido = evento(alvo.merchantId);
    await gravarLoteEventsIfood(cliente, alvo, lote(recebido));
    const falhar = vi.fn<EnviarAck>(enviar);
    await expect(enviarAckPendenteIfood(cliente, alvo, falhar)).resolves.toEqual({ situacao, quantidade: 1 });
    expect(falhar).toHaveBeenCalledTimes(1);

    const pendentes = await caixa(concorrente);
    expect(pendentes.acks).toHaveLength(1);
    const reserva = pendentes.acks[0];
    expect(reserva).toMatchObject({ ackAceitoEm: null, posse: expect.any(String), posseAte: expect.any(Date) });
    const aceitar = vi.fn<EnviarAck>(async () => ({ status: 202 }));
    await expect(enviarAckPendenteIfood(concorrente, alvo, aceitar)).resolves.toEqual({ situacao: 'sem-lote-disponivel', quantidade: 0 });
    expect(aceitar).not.toHaveBeenCalled();

    // Antecipar a expiração no PostgreSQL evita espera real de dois minutos na suíte.
    await expect(cliente.integracaoEventoIfoodAck.updateMany({
      where: { id: reserva.id, posse: reserva.posse }, data: { posseAte: new Date(0) },
    })).resolves.toEqual({ count: 1 });
    await expect(enviarAckPendenteIfood(concorrente, alvo, aceitar)).resolves.toEqual({ situacao: 'aceito', quantidade: 1 });
    expect(aceitar).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ corpo: [{ id: recebido.id }] }));
    expect((await caixa(cliente)).acks).toEqual([expect.objectContaining({ id: reserva.id, ackAceitoEm: expect.any(Date), posse: null })]);
  });

  it('duas conexões concorrentes não enviam o mesmo ACK enquanto a primeira reserva está vigente', async () => {
    const { cliente, concorrente, alvo } = await massa();
    await gravarLoteEventsIfood(cliente, alvo, lote(evento(alvo.merchantId)));
    const chamadaIniciada = Promise.withResolvers<void>();
    const liberarResposta = Promise.withResolvers<void>();
    const primeiroCallback = vi.fn<EnviarAck>(async () => {
      chamadaIniciada.resolve();
      await liberarResposta.promise;
      return { status: 202 };
    });
    const segundoCallback = vi.fn<EnviarAck>(async () => ({ status: 202 }));
    const primeira = enviarAckPendenteIfood(cliente, alvo, primeiroCallback);
    try {
      await Promise.race([chamadaIniciada.promise, primeira.then(() => {
        throw new Error('O primeiro envio terminou antes de chamar o transporte.');
      })]);
      await expect(enviarAckPendenteIfood(concorrente, alvo, segundoCallback)).resolves.toEqual({ situacao: 'sem-lote-disponivel', quantidade: 0 });
      expect(segundoCallback).not.toHaveBeenCalled();
    } finally {
      liberarResposta.resolve();
      await primeira;
    }
    await expect(primeira).resolves.toEqual({ situacao: 'aceito', quantidade: 1 });
    expect(primeiroCallback).toHaveBeenCalledTimes(1);
  });
});
