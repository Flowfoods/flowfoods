/**
 * Peças das telas de produção (3.1): o selo do estado do lote e a linha "planejado · saiu" de um lote. As mesmas no quadro,
 * no lote e na conclusão. O atraso e as horas são os da requisição (`requisicoes/partes`): uma peça só.
 */

import { ROTULO_DA_PRODUCAO, type StatusDaProducao } from '@/lib/erp/producao-campos';
import { Selo, type Tom } from '../../ui/superficies';

/** Planejada espera (atenção), em produção segue (neutro), concluída ok, cancelada apagada. */
export const TOM_DO_LOTE: Record<StatusDaProducao, Tom> = { PLANEJADA: 'alerta', EM_EXECUCAO: 'neutro', CONCLUIDA: 'ok', CANCELADA: 'neutro' };

export function SeloDoLote({ status, estornado }: { status: StatusDaProducao; estornado?: boolean }) {
  return <Selo tom={TOM_DO_LOTE[status]}>{estornado ? 'Estornada' : ROTULO_DA_PRODUCAO[status]}</Selo>;
}
