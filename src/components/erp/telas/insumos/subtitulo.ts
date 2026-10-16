import { temFiltro, type FiltrosDeInsumo } from '@/lib/erp/insumo-campos';
import { rotuloDaVisao, type Visao } from '@/lib/erp/visao';

/**
 * Subtítulo da lista: contexto + contagem. Insumo é cadastro da REDE (não tem
 * loja): com uma loja escolhida no topo, a tela diz isso em vez de fingir que
 * filtrou ("Loja Tijuca · cadastro da rede: 43 insumos"). Com busca ou
 * filtro, a contagem é a do que foi encontrado.
 */
export function subtituloDosInsumos(visao: Visao, total: number, filtros?: FiltrosDeInsumo): string {
  const filtrado = !!filtros && temFiltro(filtros);
  const n = `${total} insumo${total === 1 ? '' : 's'}${filtrado ? (total === 1 ? ' encontrado' : ' encontrados') : ''}`;
  return visao.tipo === 'loja' ? `${visao.nome} · cadastro da rede: ${n}` : `${rotuloDaVisao(visao)} · ${n}`;
}
