import { rotuloDaVisao, type Visao } from '@/lib/erp/visao';

/**
 * Subtítulo de lista de cadastro da REDE (insumos, fichas técnicas): contexto
 * + contagem. Cadastro da rede não tem loja: com uma loja escolhida no topo, a
 * tela diz isso em vez de fingir que filtrou ("Loja Tijuca · cadastro da
 * rede: 43 insumos"). Com busca ou filtro, a contagem é a do que foi achado.
 */
export function subtituloDaLista(
  visao: Visao,
  total: number,
  nome: { singular: string; plural: string; feminino?: boolean },
  filtrado = false,
): string {
  const achado = nome.feminino ? ['encontrada', 'encontradas'] : ['encontrado', 'encontrados'];
  const n = `${total} ${total === 1 ? nome.singular : nome.plural}${filtrado ? ` ${total === 1 ? achado[0] : achado[1]}` : ''}`;
  return visao.tipo === 'loja' ? `${visao.nome} · cadastro da rede: ${n}` : `${rotuloDaVisao(visao)} · ${n}`;
}

export const INSUMOS = { singular: 'insumo', plural: 'insumos' };
export const FICHAS = { singular: 'ficha', plural: 'fichas', feminino: true };
