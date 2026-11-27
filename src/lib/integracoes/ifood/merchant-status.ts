import { z } from 'zod';
import type { ChamadaIfood } from './http';

const consultaSchema = z.strictObject({
  merchantId: z.guid().transform(valor => valor.toLowerCase()),
  operation: z.literal('DELIVERY').default('DELIVERY'),
  salesChannel: z.literal('MARKETPLACE').default('MARKETPLACE'),
});

const texto = z.string().trim().min(1);
const canaisSchema = z.array(z.looseObject({ operation: texto, salesChannel: texto }));
const statusSchema = z.object({
  available: z.boolean(),
  state: z.enum(['OK', 'WARNING', 'CLOSED', 'ERROR']),
  validations: z.array(z.object({ code: texto, state: texto })),
});

export class ErroContratoMerchantStatus extends Error {
  constructor(public readonly codigo: 'PARAMETROS' | 'ESQUEMA', mensagem: string) {
    super(mensagem);
    this.name = 'ErroContratoMerchantStatus';
  }
}

function lerConsulta(entrada: unknown) {
  const resultado = consultaSchema.safeParse(entrada);
  if (!resultado.success) {
    throw new ErroContratoMerchantStatus('PARAMETROS', 'Parâmetros da consulta de status Merchant inválidos.');
  }
  return resultado.data;
}

export function chamadaDoStatusMerchant(entrada: unknown): ChamadaIfood {
  const { merchantId } = lerConsulta(entrada);
  return {
    metodo: 'GET', familia: 'merchant', caminho: `/merchant/v1.0/merchants/${merchantId}/status`,
  };
}

/** Projeta o corpo de sucesso do GET. A operação e o canal são selecionados na resposta da loja solicitada. */
export function conferirStatusMerchant(entrada: unknown, resposta: unknown) {
  const { merchantId, operation, salesChannel } = lerConsulta(entrada);
  const consulta = { merchantIdSolicitado: merchantId, operation, salesChannel };
  const canais = canaisSchema.safeParse(resposta);
  if (!canais.success) {
    throw new ErroContratoMerchantStatus('ESQUEMA', 'Os canais da resposta de status Merchant estão fora do formato esperado.');
  }

  const selecionados = canais.data.filter(item => {
    // O /status em TEST devolve "delivery" e "ifood-app" para a entrega pelo app do iFood.
    const canalRecebido = item.salesChannel === 'ifood-app' ? 'MARKETPLACE' : item.salesChannel;
    return item.operation.toUpperCase() === operation && canalRecebido === salesChannel;
  });
  if (selecionados.length !== 1) {
    return { ...consulta, situacao: 'inconclusiva', motivo: selecionados.length === 0 ? 'canal-ausente' : 'canal-duplicado' } as const;
  }

  const resultado = statusSchema.safeParse(selecionados[0]);
  if (!resultado.success) {
    throw new ErroContratoMerchantStatus('ESQUEMA', 'O status Merchant do canal consultado está fora do formato esperado.');
  }
  return { ...consulta, situacao: 'observada', ...resultado.data } as const;
}
