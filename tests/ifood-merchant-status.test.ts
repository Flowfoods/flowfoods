import { describe, expect, it } from 'vitest';
import { armazemEmMemoria, ServicoDeToken, type AppParaToken } from '@/lib/integracoes/ifood/auth';
import { criarClienteIfood } from '@/lib/integracoes/ifood/http';
import { Limitador } from '@/lib/integracoes/ifood/limitador';
import { chamadaDoStatusMerchant, conferirStatusMerchant } from '@/lib/integracoes/ifood/merchant-status';
import type { PedidoHttp, Transporte } from '@/lib/integracoes/ifood/transporte';

const loja = 'd05ecab0-7bb7-4a5e-badf-0c6111111111';
const outraLoja = 'd05ecab0-7bb7-4a5e-badf-0c6222222222';
const consulta = { merchantId: loja.toUpperCase(), operation: 'DELIVERY', salesChannel: 'MARKETPLACE' };
const canal = { operation: consulta.operation, salesChannel: consulta.salesChannel };
const status = (campos: Record<string, unknown> = {}) => ({
  ...canal,
  available: true,
  state: 'OK',
  validations: [{ id: 'validacao-sintetica', code: 'is-connected', state: 'OK', message: { title: 'Mensagem sintética' } }],
  message: { description: 'Descrição sintética' },
  ...campos,
});

describe('Merchant · status por operação e canal', () => {
  it('monta um GET para o UUID normalizado sem filtros no transporte', () => {
    const pedido = { metodo: 'GET', familia: 'merchant', caminho: `/merchant/v1.0/merchants/${loja}/status` };
    expect(chamadaDoStatusMerchant(consulta)).toEqual(pedido);
    expect(chamadaDoStatusMerchant({ merchantId: loja })).toEqual(pedido);
  });

  it.each([
    { merchantId: 'invalido' }, { merchantId: `${loja}/interruptions` },
    { operation: 'PICKUP' }, { salesChannel: 'IFOOD_SHOP' }, { consulta: { page: '1' } },
  ])('recusa UUID, operação, canal ou parâmetro fora do recorte (%j)', entrada => {
    expect(() => chamadaDoStatusMerchant({ ...consulta, ...entrada }))
      .toThrow(expect.objectContaining({ codigo: 'PARAMETROS' }));
  });

  it('seleciona a combinação solicitada e entrega somente o status e os códigos das validações', () => {
    const resposta = [
      status({ salesChannel: 'OUTRO_CANAL', available: false, state: 'CLOSED' }),
      status({ operation: 'OUTRA_OPERACAO', state: 'OUTRO_ESTADO' }),
      status(),
    ];
    expect(conferirStatusMerchant(consulta, resposta)).toEqual({
      merchantIdSolicitado: loja,
      ...canal,
      situacao: 'observada',
      available: true,
      state: 'OK',
      validations: [{ code: 'is-connected', state: 'OK' }],
    });
  });

  it.each([
    { state: 'WARNING', available: true, validations: [{ code: 'is-connected', state: 'OK' }] },
    { state: 'WARNING', available: false, validations: [{ code: 'validacao-sintetica', state: 'WARNING' }] },
    { state: 'CLOSED', available: false, validations: [{ code: 'opening-hours', state: 'CLOSED' }] },
    { state: 'ERROR', available: false, validations: [{ code: 'logistics-blocked', state: 'ERROR' }] },
  ])('preserva disponibilidade, estado e validações do iFood em $state', campos => {
    expect(conferirStatusMerchant(consulta, [status(campos)])).toMatchObject({ situacao: 'observada', ...campos });
  });

  it('preserva canal ausente ou duplicado como uma leitura inconclusiva', () => {
    for (const resposta of [[], [status({ salesChannel: 'OUTRO_CANAL' })], [status({ operation: 'OUTRA_OPERACAO' })]]) {
      expect(conferirStatusMerchant(consulta, resposta)).toEqual({
        merchantIdSolicitado: loja, ...canal, situacao: 'inconclusiva', motivo: 'canal-ausente',
      });
    }
    for (const segunda of [status(), status({ available: false, state: 'CLOSED' })]) {
      expect(conferirStatusMerchant(consulta, [status(), segunda])).toEqual({
        merchantIdSolicitado: loja, ...canal, situacao: 'inconclusiva', motivo: 'canal-duplicado',
      });
    }
  });

  it.each([
    { resposta: { errorType: 'FORBIDDEN' } },
    { resposta: [status({ operation: undefined })] },
    { resposta: [status({ available: 'false' })] },
    { resposta: [status({ state: 'NOVO_ESTADO' })] },
    { resposta: [status({ validations: undefined })] },
    { resposta: [status({ validations: [{ code: 'opening-hours' }] })] },
  ])('recusa corpo fora do contrato (%j)', ({ resposta }) => {
    expect(() => conferirStatusMerchant(consulta, resposta)).toThrow(expect.objectContaining({ codigo: 'ESQUEMA' }));
  });
});

it('lê status em memória pelo cliente existente e mantém HTTP 403 como falha de acesso', async () => {
  const registros: PedidoHttp[] = [];
  const app: AppParaToken = { id: 'merchant-local', clientId: 'cliente-sintetico', ambiente: 'TEST',
    nomeDoSegredo: 'IFOOD_TEST_CLIENT_SECRET', homologacao: 'NAO_SE_APLICA' };
  const env = { INTEGRACAO_IFOOD_ATIVA: 'true', INTEGRACAO_CHAVE_CIFRAGEM: 'b'.repeat(64), IFOOD_TEST_CLIENT_SECRET: 'fixture-local' };
  const transporte: Transporte = async pedido => {
    if (pedido.url.endsWith('/oauth/token')) return { status: 200, cabecalhos: {}, corpo: '{"accessToken":"token-sintetico","expiresIn":3600}' };
    registros.push(pedido);
    return pedido.url.endsWith(`/merchants/${loja}/status`)
      ? { status: 200, cabecalhos: {}, corpo: JSON.stringify([status({ available: false, state: 'CLOSED', validations: [] })]) }
      : { status: 403, cabecalhos: {}, corpo: '{"errorType":"FORBIDDEN"}' };
  };
  const limitador = new Limitador();
  const tokens = new ServicoDeToken({ armazem: armazemEmMemoria(), transporte, limitador, env });
  const cliente = criarClienteIfood({ app, tokens, limitador, transporte, env, maxTentativas: 1 });
  const resposta = await cliente.chamar(chamadaDoStatusMerchant(consulta));
  expect(resposta.ok && conferirStatusMerchant(consulta, resposta.dados)).toMatchObject({
    situacao: 'observada', available: false, state: 'CLOSED',
  });
  await expect(cliente.chamar(chamadaDoStatusMerchant({ merchantId: outraLoja }))).resolves.toMatchObject({
    ok: false, status: 403, classificacao: { tipo: 'sem-permissao' },
  });
  expect(registros.map(pedido => ({ metodo: pedido.metodo, caminho: new URL(pedido.url).pathname, consulta: new URL(pedido.url).search })))
    .toEqual([
      { metodo: 'GET', caminho: `/merchant/v1.0/merchants/${loja}/status`, consulta: '' },
      { metodo: 'GET', caminho: `/merchant/v1.0/merchants/${outraLoja}/status`, consulta: '' },
    ]);
});
