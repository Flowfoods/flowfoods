import { describe, expect, it } from 'vitest';
import { conferirRecepcaoEventsIfood } from '@/lib/integracoes/ifood/events-recepcao';

const merchantId = '00000000-0000-4000-8000-00000000000a';
const outroMerchant = '00000000-0000-4000-8000-00000000000b';
const outroPedido = '00000000-0000-4000-8000-00000000000c';
const escopo = { merchantId, ambiente: 'TEST' };
const recebido = {
  id: 'evt_Food_001',
  orderId: '00000000-0000-4000-8000-00000000000d',
  merchantId,
  code: 'PLC',
  fullCode: 'PLACED',
  createdAt: '2026-11-28T12:00:00.123456789Z',
};

describe('Events v1 · recepção FOOD por loja', () => {
  it('projeta o array direto e preserva identificadores opacos sem metadados', () => {
    const resultado = conferirRecepcaoEventsIfood({ ...escopo, merchantId: merchantId.toUpperCase() }, {
      status: 200,
      dados: [{
        ...recebido,
        merchantId: merchantId.toUpperCase(), orderId: recebido.orderId.toUpperCase(),
        metadata: { customerEmail: 'cliente@example.invalid' },
      }],
    });

    expect(resultado).toEqual({
      ...escopo, provedor: 'IFOOD', situacao: 'lote-recebido', status: 200, eventos: [recebido], idsReentregues: [],
    });
  });

  it.each([undefined, null])('trata o 204 sem corpo como ausência de pendências (%s)', dados => {
    expect(conferirRecepcaoEventsIfood(escopo, { status: 204, dados })).toEqual({
      ...escopo, provedor: 'IFOOD', situacao: 'sem-eventos-pendentes', status: 204, eventos: [], idsReentregues: [],
    });
  });

  it('preserva o array vazio recebido com HTTP 200', () => {
    expect(conferirRecepcaoEventsIfood(escopo, { status: 200, dados: [] })).toMatchObject({
      situacao: 'lote-recebido', status: 200, eventos: [],
    });
  });

  it('agrupa cópias equivalentes em um lote FOOD, inclusive com categoria opcional', () => {
    const resultado = conferirRecepcaoEventsIfood(escopo, {
      status: 200, dados: [recebido, { ...recebido, category: 'FOOD' }, recebido],
    });
    expect(resultado.eventos).toEqual([recebido]);
    expect(resultado.idsReentregues).toEqual([recebido.id]);
  });

  it('reconhece o mesmo instante com outro fuso e conserva a precisão recebida', () => {
    const comOutroFuso = { ...recebido, createdAt: '2026-11-28T09:00:00.1234567890-03:00' };
    const resultado = conferirRecepcaoEventsIfood(escopo, { status: 200, dados: [recebido, comOutroFuso] });
    expect(resultado.eventos).toEqual([recebido]);
    expect(resultado.idsReentregues).toEqual([recebido.id]);
  });

  it('preserva eventos distintos do mesmo pedido e a sequência de recepção', () => {
    const conclusao = {
      ...recebido, id: 'evt_Food_002', code: 'CON', fullCode: 'CONCLUDED',
      createdAt: '2026-11-28T12:15:00Z', category: 'FOOD', salesChannel: 'DIGITAL_CATALOG',
    };
    const informativo = { ...recebido, id: 'evt_Food_003', code: 'NOV', fullCode: 'FUTURE_EVENT' };
    const eventos = [conclusao, recebido, informativo];

    expect(conferirRecepcaoEventsIfood(escopo, { status: 200, dados: eventos }).eventos).toEqual(eventos);
  });

  it.each([
    { orderId: outroPedido }, { code: 'CFM' }, { fullCode: 'CONFIRMED' },
    { createdAt: '2026-11-28T12:00:00.123456780Z' }, { salesChannel: 'POS' },
  ])('sinaliza conflito quando o mesmo ID tem outro conteúdo (%j)', mudanca => {
    expect(() => conferirRecepcaoEventsIfood(escopo, {
      status: 200, dados: [recebido, { ...recebido, ...mudanca }],
    })).toThrow(expect.objectContaining({ codigo: 'CONFLITO' }));
  });

  it.each([{ merchantId: outroMerchant }, { category: 'GROCERY' }])('recusa todo o lote misto (%j)', mudanca => {
    expect(() => conferirRecepcaoEventsIfood(escopo, {
      status: 200, dados: [recebido, { ...recebido, ...mudanca }],
    })).toThrow(expect.objectContaining({ codigo: 'ESCOPO' }));
  });

  it.each([
    { status: 200, dados: { events: [recebido] } }, { status: 204, dados: [recebido] },
    { status: 200, dados: [{ ...recebido, id: ' ' }] }, { status: 200, dados: [{ ...recebido, fullCode: undefined }] },
    { status: 200, dados: [{ ...recebido, createdAt: '2026-11-28T12:00:00' }] },
  ])('recusa respostas malformadas (%j)', resposta => {
    expect(() => conferirRecepcaoEventsIfood(escopo, resposta))
      .toThrow(expect.objectContaining({ codigo: 'ESQUEMA' }));
  });

  it.each([403, 429, 503])('trata HTTP %s como erro do polling', status => {
    expect(() => conferirRecepcaoEventsIfood(escopo, { status, dados: null }))
      .toThrow(expect.objectContaining({ codigo: 'HTTP' }));
  });

  it.each(['id', 'code', 'fullCode', 'category', 'salesChannel'])('recusa texto fora do formato em %s', campo => {
    expect(() => conferirRecepcaoEventsIfood(escopo, {
      status: 200, dados: [{ ...recebido, [campo]: 'cliente@example.invalid' }],
    })).toThrow(expect.objectContaining({ codigo: 'ESQUEMA' }));
  });

  it('exige escopo de loja e ambiente até para fila vazia', () => {
    expect(() => conferirRecepcaoEventsIfood({ ambiente: 'TEST' }, { status: 204 }))
      .toThrow(expect.objectContaining({ codigo: 'PARAMETROS' }));
    expect(() => conferirRecepcaoEventsIfood({ merchantId, ambiente: 'outro' }, { status: 204 }))
      .toThrow(expect.objectContaining({ codigo: 'PARAMETROS' }));
  });
});
