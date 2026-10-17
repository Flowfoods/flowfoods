/**
 * Peças das telas de requisição (1.8): selo do estado, selo do atraso e a
 * linha "pedido · saiu" de um item. As mesmas no quadro, no detalhe e na
 * entrega.
 */

import { ROTULO_DA_REQUISICAO, textoDoAtraso, type StatusDaRequisicao } from '@/lib/erp/requisicao-campos';
import { formatarQuantidade, type Unidade } from '@/lib/erp/unidades';
import { Selo, type Tom } from '../../ui/superficies';

/** Tom de cada estado: pedida espera (atenção), em parte segue (neutro forte), atendida ok, cancelada apagada. */
export const TOM_DO_ESTADO: Record<StatusDaRequisicao, Tom> = { ABERTA: 'alerta', PARCIAL: 'neutro', ATENDIDA: 'ok', CANCELADA: 'neutro' };

export function SeloDaRequisicao({ status }: { status: StatusDaRequisicao }) {
  return <Selo tom={TOM_DO_ESTADO[status]}>{ROTULO_DA_REQUISICAO[status]}</Selo>;
}

export function SeloDoAtraso({ dias }: { dias: number }) {
  if (dias <= 0) return null;
  return <Selo tom="erro">{textoDoAtraso(dias)}</Selo>;
}

const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const DIA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
const DIA_HORA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/** "10:42" se for hoje (Rio), senão "14/10". */
export function quandoCurto(d: Date, hoje: string): string {
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
  return dia === hoje ? HORA.format(d) : DIA.format(d);
}

/** "10:42" se for hoje (Rio), senão o dia e a hora: "14/10 10:42" (cartão de lote que vem de outro dia). */
export function quandoDoCartao(d: Date, hoje: string): string {
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
  return dia === hoje ? HORA.format(d) : DIA_HORA.format(d).replace(',', '');
}

/** "14/10 às 10:42". */
export const quandoLongo = (d: Date) => DIA_HORA.format(d).replace(',', ' às');

/** "2 kg" ou, com entrega, "1 de 2 kg" (o que saiu de quanto foi pedido). */
export function quantoDoItem(i: { unidade: Unidade; solicitadoMilesimos: number; atendidoMilesimos: number }, mostrarSaida: boolean): string {
  const pedido = formatarQuantidade(i.solicitadoMilesimos, i.unidade);
  if (!mostrarSaida) return pedido;
  if (i.atendidoMilesimos === i.solicitadoMilesimos) return pedido;
  return `${formatarQuantidade(i.atendidoMilesimos, i.unidade)} de ${pedido}`;
}
