import { rotuloDaVisao, type Visao } from '@/lib/erp/visao';

/**
 * Subtítulo da lista: contexto + contagem. Insumo é cadastro da REDE (não tem
 * loja): com uma loja escolhida no topo, a tela diz isso em vez de fingir que
 * filtrou ("Loja Tijuca · cadastro da rede: 43 insumos").
 */
export function subtituloDosInsumos(visao: Visao, total: number): string {
  const n = `${total} insumo${total === 1 ? '' : 's'}`;
  return visao.tipo === 'loja' ? `${visao.nome} · cadastro da rede: ${n}` : `${rotuloDaVisao(visao)} · ${n}`;
}
