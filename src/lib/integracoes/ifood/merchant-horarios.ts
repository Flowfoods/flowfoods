import { z } from 'zod';
import type { ChamadaIfood } from './http';

const consultaSchema = z.strictObject({
  merchantId: z.guid().transform(valor => valor.toLowerCase()),
});

const turnoSchema = z.object({
  id: z.string().trim().min(1).nullish(),
  dayOfWeek: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
  start: z.iso.time({ precision: 0 }),
  duration: z.int().positive(),
  enabled: z.boolean().nullish(),
});

const storeIdSchema = z.guid().transform(valor => valor.toLowerCase());
const grupoDeHorariosSchema = z.object({ shifts: z.array(turnoSchema), storeId: storeIdSchema.optional() });
const horariosSchema = z.union([
  z.array(grupoDeHorariosSchema),
  grupoDeHorariosSchema.extend({ storeId: storeIdSchema }),
]);

export class ErroContratoMerchantHorarios extends Error {
  constructor(public readonly codigo: 'PARAMETROS' | 'ESQUEMA' | 'IDENTIDADE', mensagem: string) {
    super(mensagem);
    this.name = 'ErroContratoMerchantHorarios';
  }
}

function lerConsulta(entrada: unknown) {
  const resultado = consultaSchema.safeParse(entrada);
  if (!resultado.success) {
    throw new ErroContratoMerchantHorarios('PARAMETROS', 'Parâmetros da consulta de horários Merchant inválidos.');
  }
  return resultado.data;
}

export function chamadaDosHorariosMerchant(entrada: unknown): ChamadaIfood {
  const { merchantId } = lerConsulta(entrada);
  return { metodo: 'GET', familia: 'merchant', caminho: `/merchant/v1.0/merchants/${merchantId}/opening-hours` };
}

/** Projeta horários locais nos formatos do guia e da resposta da API em TEST. */
export function conferirHorariosMerchant(entrada: unknown, resposta: unknown) {
  const { merchantId } = lerConsulta(entrada);
  const resultado = horariosSchema.safeParse(resposta);
  if (!resultado.success) {
    throw new ErroContratoMerchantHorarios('ESQUEMA', 'Resposta dos horários Merchant fora do formato esperado.');
  }
  const gruposRecebidos = Array.isArray(resultado.data) ? resultado.data : [resultado.data];
  if (gruposRecebidos.some(grupo => grupo.storeId !== undefined && grupo.storeId !== merchantId)) {
    throw new ErroContratoMerchantHorarios('IDENTIDADE', 'O iFood retornou horários de uma loja diferente da solicitada.');
  }
  const grupos = gruposRecebidos.map(({ shifts }) => ({
    turnos: shifts.map(({ id, dayOfWeek, start, duration, enabled }) => ({
      id: id ?? null,
      diaDaSemana: dayOfWeek,
      inicioLocal: start,
      duracaoEmMinutos: duration,
      habilitado: enabled ?? null,
    })),
  }));
  return {
    merchantIdSolicitado: merchantId,
    estado: grupos.some(grupo => grupo.turnos.length > 0) ? 'observados' : 'sem-turnos-informados',
    grupos,
  } as const;
}
