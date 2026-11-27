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

const horariosSchema = z.array(z.object({ shifts: z.array(turnoSchema) }));

export class ErroContratoMerchantHorarios extends Error {
  constructor(public readonly codigo: 'PARAMETROS' | 'ESQUEMA', mensagem: string) {
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

/** Projeta os horários locais configurados no formato do guia de endpoints. */
export function conferirHorariosMerchant(entrada: unknown, resposta: unknown) {
  const { merchantId } = lerConsulta(entrada);
  const resultado = horariosSchema.safeParse(resposta);
  if (!resultado.success) {
    throw new ErroContratoMerchantHorarios('ESQUEMA', 'Resposta dos horários Merchant fora do formato esperado.');
  }
  const grupos = resultado.data.map(({ shifts }) => ({
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
