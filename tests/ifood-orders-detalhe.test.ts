import { describe, expect, it } from 'vitest';
import { conferirDetalhePedidoIfood } from '@/lib/integracoes/ifood/orders-detalhe';

const orderId = '00000000-0000-4000-8000-00000000000a';
const merchantId = '00000000-0000-4000-8000-00000000000b';
const outroId = '00000000-0000-4000-8000-00000000000c';
const item = {
  id: '00000000-0000-4000-8000-000000000001',
  uniqueId: '00000000-0000-4000-8000-000000000002',
  index: 1,
  name: 'Sanduíche de teste',
  quantity: 1.5,
  unit: 'KG',
  unitPrice: 20,
  totalPrice: 32.5,
  options: [{
    id: '00000000-0000-4000-8000-000000000003',
    name: 'Complemento',
    quantity: 1.25,
    price: 2.5,
    customizations: [{
      id: '00000000-0000-4000-8000-000000000004',
      name: 'Personalização',
      quantity: 1,
      addition: 0,
    }],
  }],
};
const pedido = {
  id: orderId,
  merchant: { id: merchantId },
  displayId: '0420',
  category: 'FOOD',
  isTest: true,
  orderType: 'DELIVERY',
  orderTiming: 'SCHEDULED',
  salesChannel: 'IFOOD',
  createdAt: '2026-11-27T22:00:00-03:00',
  delivery: { deliveredBy: 'MERCHANT', mode: 'DEFAULT' },
  items: [item],
  total: { subTotal: 32.5, benefits: 0, orderAmount: 32.5 },
};
const consulta = { orderId, merchantId, ambiente: 'TEST' };

describe('Orders v1 · detalhe de pedido FOOD', () => {
  it('preserva o pedido e duas linhas do mesmo item, com complementos e valores informados', () => {
    const segundaLinha = { ...item, index: 2, uniqueId: outroId, quantity: 1, totalPrice: 22.5 };
    const resposta = {
      ...pedido,
      id: orderId.toUpperCase(),
      merchant: { id: merchantId.toUpperCase(), name: 'Loja sintética' },
      customer: { name: 'Consumidor sintético' },
      payments: { methods: [{ transaction: { authorizationCode: 'SINTETICO' } }] },
      delivery: { ...pedido.delivery, deliveryAddress: { streetName: 'Rua sintética' }, pickupCode: '1234' },
      items: [{ ...item, observations: 'Enviar confirmação a exemplo@example.invalid' }, segundaLinha],
      total: { subTotal: 55, deliveryFee: 5, benefits: 0, orderAmount: 59 },
    };

    expect(conferirDetalhePedidoIfood(consulta, resposta)).toEqual({
      ...pedido,
      provedor: 'IFOOD',
      ambiente: 'TEST',
      items: [item, segundaLinha],
      total: resposta.total,
    });
  });

  it('preserva ausência de valores opcionais e distingue um pedido de produção', () => {
    const resultado = conferirDetalhePedidoIfood({ ...consulta, ambiente: 'PRODUCAO' }, {
      ...pedido, isTest: false, orderType: 'TAKEOUT', delivery: null,
    });

    expect(resultado).toMatchObject({ ambiente: 'PRODUCAO', orderType: 'TAKEOUT', delivery: null, isTest: false });
    expect(resultado.total.benefits).toBe(0);
    expect(resultado.total).not.toHaveProperty('deliveryFee');
    expect(resultado.total).not.toHaveProperty('additionalFees');
  });

  it('lê a grafia singular da personalização e recusa as duas listas simultâneas', () => {
    const { customizations, ...opcao } = item.options[0];
    const comSingular = { ...opcao, customization: customizations };
    const resposta = { ...pedido, items: [{ ...item, options: [comSingular] }] };

    expect(conferirDetalhePedidoIfood(consulta, resposta).items[0].options).toEqual(item.options);
    expect(() => conferirDetalhePedidoIfood(consulta, {
      ...resposta, items: [{ ...item, options: [{ ...comSingular, customizations }] }],
    })).toThrow(expect.objectContaining({ codigo: 'ESQUEMA' }));
  });

  it('recusa quantidade fracionária na personalização de terceiro nível', () => {
    const opcao = item.options[0];
    const customizations = opcao.customizations.map(personalizacao => ({ ...personalizacao, quantity: 1.25 }));
    expect(() => conferirDetalhePedidoIfood(consulta, {
      ...pedido, items: [{ ...item, options: [{ ...opcao, customizations }] }],
    })).toThrow(expect.objectContaining({ codigo: 'ESQUEMA' }));
  });

  it.each([
    { id: outroId }, { merchant: { id: outroId } }, { isTest: false },
  ])('recusa resposta de outra identidade (%j)', campos => {
    expect(() => conferirDetalhePedidoIfood(consulta, { ...pedido, ...campos }))
      .toThrow(expect.objectContaining({ codigo: 'IDENTIDADE' }));
  });

  it.each([
    { items: undefined }, { items: [item, { ...item, index: 2 }] },
    { items: [{ ...item, uniqueId: undefined }] }, { items: [{ ...item, quantity: '1.5' }] },
    { total: { subTotal: 32.5 } }, { isTest: undefined }, { category: 'GROCERY' },
  ])('recusa resposta incompleta ou ambígua (%j)', campos => {
    expect(() => conferirDetalhePedidoIfood(consulta, { ...pedido, ...campos }))
      .toThrow(expect.objectContaining({ codigo: 'ESQUEMA' }));
  });

  it('recusa parâmetros sem loja ou pedido válido', () => {
    expect(() => conferirDetalhePedidoIfood({ ...consulta, merchantId: undefined }, pedido))
      .toThrow(expect.objectContaining({ codigo: 'PARAMETROS' }));
    expect(() => conferirDetalhePedidoIfood({ ...consulta, orderId: '0420' }, pedido))
      .toThrow(expect.objectContaining({ codigo: 'PARAMETROS' }));
  });
});
