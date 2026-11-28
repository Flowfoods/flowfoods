import { z } from 'zod';

const uuid = z.guid().transform(valor => valor.toLowerCase());
const texto = z.string().refine(valor => valor.trim().length > 0);
const data = z.iso.datetime({ offset: true });
const valorOpcional = z.number().nullish();

const consultaSchema = z.strictObject({
  orderId: uuid,
  merchantId: uuid,
  ambiente: z.enum(['TEST', 'PRODUCAO']),
});

const complementoSchema = z.object({
  id: uuid,
  index: z.int().nonnegative().nullish(),
  name: texto,
  groupName: z.string().nullish(),
  externalCode: z.string().nullish(),
  type: z.string().nullish(),
  quantity: z.number().positive(),
  unit: z.string().nullish(),
  unitPrice: valorOpcional,
  addition: valorOpcional,
  price: valorOpcional,
});

// A referência de Orders usa as duas grafias para as personalizações da opção.
const personalizacoesSchema = z.array(complementoSchema.extend({ quantity: z.int().positive() })).nullish();
const opcaoSchema = complementoSchema.extend({
  customization: personalizacoesSchema,
  customizations: personalizacoesSchema,
}).refine(opcao => opcao.customization == null || opcao.customizations == null)
  .transform(({ customization, ...opcao }) => customization === undefined
    ? opcao
    : { ...opcao, customizations: opcao.customizations ?? customization });

const itemSchema = z.object({
  id: uuid,
  uniqueId: uuid,
  index: z.int().nonnegative(),
  name: texto,
  externalCode: z.string().nullish(),
  type: z.string().nullish(),
  quantity: z.number().positive(),
  unit: z.string().nullish(),
  unitPrice: valorOpcional,
  price: valorOpcional,
  optionsPrice: valorOpcional,
  customizationPrice: valorOpcional,
  totalPrice: valorOpcional,
  options: z.array(opcaoSchema).nullish(),
});

const respostaSchema = z.object({
  id: uuid,
  merchant: z.object({ id: uuid }),
  isTest: z.boolean(),
  category: z.literal('FOOD'),
  displayId: z.string().nullish(),
  orderType: z.enum(['DELIVERY', 'TAKEOUT', 'DINE_IN']),
  orderTiming: z.enum(['IMMEDIATE', 'SCHEDULED']),
  salesChannel: texto.nullish(),
  createdAt: data,
  preparationStartDateTime: data.nullish(),
  delivery: z.object({
    deliveredBy: z.enum(['MERCHANT', 'IFOOD']).nullish(),
    mode: texto.nullish(),
  }).nullish(),
  items: z.array(itemSchema),
  total: z.object({
    subTotal: z.number(),
    orderAmount: z.number(),
    deliveryFee: valorOpcional,
    benefits: valorOpcional,
    additionalFees: valorOpcional,
  }),
});

export class ErroContratoOrdersDetalhe extends Error {
  constructor(public readonly codigo: 'PARAMETROS' | 'ESQUEMA' | 'IDENTIDADE', mensagem: string) {
    super(mensagem);
    this.name = 'ErroContratoOrdersDetalhe';
  }
}

/** Projeta o corpo de sucesso de Orders v1 FOOD para o escopo já selecionado. */
export function conferirDetalhePedidoIfood(entrada: unknown, resposta: unknown) {
  const consulta = consultaSchema.safeParse(entrada);
  if (!consulta.success) {
    throw new ErroContratoOrdersDetalhe('PARAMETROS', 'Informe o pedido, o merchant e o ambiente da consulta Orders.');
  }

  const resultado = respostaSchema.safeParse(resposta);
  if (!resultado.success) {
    throw new ErroContratoOrdersDetalhe('ESQUEMA', 'O detalhe do pedido FOOD está fora do formato esperado.');
  }

  const pedido = resultado.data;
  const { orderId, merchantId, ambiente } = consulta.data;
  if (pedido.id !== orderId || pedido.merchant.id !== merchantId || pedido.isTest !== (ambiente === 'TEST')) {
    throw new ErroContratoOrdersDetalhe('IDENTIDADE', 'O pedido recebido pertence a outro pedido, merchant ou ambiente.');
  }

  if (new Set(pedido.items.map(item => item.uniqueId)).size !== pedido.items.length) {
    throw new ErroContratoOrdersDetalhe('ESQUEMA', 'O pedido contém linhas com o mesmo identificador.');
  }

  return { provedor: 'IFOOD', ambiente, ...pedido } as const;
}
