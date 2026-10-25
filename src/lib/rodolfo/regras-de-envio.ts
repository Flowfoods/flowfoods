/**
 * A conferência do formulário de Regras de envio (E5.1, decisão 473), antes de gravar. Pura.
 *
 * Antes, o servidor apertava em silêncio: um teto acima do máximo virava o máximo, uma janela invertida voltava para as
 * 18h e um intervalo de 600 minutos (um zero a mais) era aceito e parava a fila sem ninguém entender por quê. Agora o pedido
 * fora da faixa é recusado com o nome do campo e a faixa, e nada é gravado. `apertar` (config.ts) continua valendo como a
 * última barreira, na escrita e na leitura.
 *
 * Campo vazio não é erro: mantém o valor atual (a conferência cruzada usa o atual no lugar do vazio).
 */

import { INTERVALO_MIN_S, MAX_POR_DIA, MAX_POR_HORA } from '@/lib/barney/regras';
import { janelaPadrao } from '@/lib/barney/janela';

/** Intervalo máximo entre dois envios que a tela aceita. Acima disso, um dia de janela mal passa de dez envios. */
export const INTERVALO_MAXIMO_MIN = 60;

export interface PedidoDeRegras {
  maxPorDia?: number;
  maxPorHora?: number;
  horaInicio?: number;
  horaFim?: number;
  intervaloMinMinutos?: number;
  intervaloMaxMinutos?: number;
}

export interface RegrasAtuais {
  horaInicio: number;
  horaFim: number;
  intervaloMinS: number;
  intervaloMaxS: number;
}

/** O motivo da recusa, ou null quando o pedido pode ser gravado. */
export function conferirRegrasDeEnvio(p: PedidoDeRegras, atual: RegrasAtuais): string | null {
  const base = janelaPadrao();
  const inteiroEntre = (v: number | undefined, min: number, max: number) => v === undefined || (Number.isInteger(v) && v >= min && v <= max);

  if (!inteiroEntre(p.maxPorDia, 1, MAX_POR_DIA)) return `Máximo por dia vai de 1 a ${MAX_POR_DIA}.`;
  if (!inteiroEntre(p.maxPorHora, 1, MAX_POR_HORA)) return `Máximo por hora vai de 1 a ${MAX_POR_HORA}.`;
  if (!inteiroEntre(p.horaInicio, base.horaInicio, base.horaFim - 1)) return `"Abre às" vai das ${base.horaInicio}h às ${base.horaFim - 1}h.`;
  if (!inteiroEntre(p.horaFim, base.horaInicio + 1, base.horaFim)) return `"Fecha às" vai das ${base.horaInicio + 1}h às ${base.horaFim}h.`;
  const inicio = p.horaInicio ?? atual.horaInicio;
  const fim = p.horaFim ?? atual.horaFim;
  if (fim <= inicio) return `"Fecha às" precisa ser depois de "Abre às" (abre às ${inicio}h).`;

  const pisoMin = INTERVALO_MIN_S / 60;
  const entre = (v: number | undefined) => v === undefined || (v >= pisoMin && v <= INTERVALO_MAXIMO_MIN);
  if (!entre(p.intervaloMinMinutos)) return `O intervalo mínimo vai de ${pisoMin} a ${INTERVALO_MAXIMO_MIN} minutos.`;
  if (!entre(p.intervaloMaxMinutos)) return `O intervalo máximo vai de ${pisoMin} a ${INTERVALO_MAXIMO_MIN} minutos.`;
  const minS = p.intervaloMinMinutos !== undefined ? Math.round(p.intervaloMinMinutos * 60) : atual.intervaloMinS;
  const maxS = p.intervaloMaxMinutos !== undefined ? Math.round(p.intervaloMaxMinutos * 60) : atual.intervaloMaxS;
  if (maxS < minS) return 'O intervalo máximo não pode ser menor que o mínimo.';
  return null;
}
