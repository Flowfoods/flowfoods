/**
 * As respostas de um cliente no painel (E5.1, decisão 472): o filtro por situação e a contagem de cada bloco.
 * Funções puras, sobre o mesmo `calcularProgresso` do formulário e do aviso no WhatsApp: o número do bloco no painel
 * é o mesmo que o cliente vê no celular.
 */

import type { Bloco } from './questionario';
import type { EstadoItem, SituacaoItem } from './progresso';

/** As opções do filtro, na ordem da tela. '' = todos os itens. */
export const FILTROS_DE_ITEM: { chave: '' | EstadoItem; rotulo: string }[] = [
  { chave: '', rotulo: 'Todos' },
  { chave: 'RECEBIDO', rotulo: 'Recebidos' },
  { chave: 'MARCADO', rotulo: 'Pulados com motivo' },
  { chave: 'PENDENTE', rotulo: 'Pendentes' },
];

/** Só um valor conhecido vira filtro; qualquer outro (ou nenhum) mostra tudo. */
export function lerFiltroDeItem(valor: string | undefined): EstadoItem | null {
  return valor === 'RECEBIDO' || valor === 'MARCADO' || valor === 'PENDENTE' ? valor : null;
}

export interface BlocoNoPainel {
  bloco: string;
  titulo: string;
  total: number;
  recebidos: number;
  marcados: number;
  pendentes: number;
  /** Os itens do bloco que passam no filtro, na ordem do questionário. */
  situacoes: SituacaoItem[];
}

/**
 * Os blocos na ordem do questionário, cada um com a contagem inteira (o filtro não muda o "3 de 7") e só os itens que
 * passam no filtro. Com filtro, o bloco sem nenhum item que passe sai da tela.
 */
export function blocosNoPainel(blocos: Bloco[], situacoes: SituacaoItem[], filtro: EstadoItem | null): BlocoNoPainel[] {
  const porItem = new Map(situacoes.map((s) => [s.item.id, s]));
  const saida: BlocoNoPainel[] = [];
  for (const b of blocos) {
    const doBloco = b.itens.map((i) => porItem.get(i.id)).filter((s): s is SituacaoItem => Boolean(s));
    const contar = (e: EstadoItem) => doBloco.filter((s) => s.estado === e).length;
    const visiveis = filtro ? doBloco.filter((s) => s.estado === filtro) : doBloco;
    if (filtro && visiveis.length === 0) continue;
    saida.push({
      bloco: b.bloco,
      titulo: b.titulo,
      total: doBloco.length,
      recebidos: contar('RECEBIDO'),
      marcados: contar('MARCADO'),
      pendentes: contar('PENDENTE'),
      situacoes: visiveis,
    });
  }
  return saida;
}

/** "3 de 7 recebidos", e os pulados quando há: "3 de 7 recebidos, 1 pulado". */
export function contagemDoBloco(b: Pick<BlocoNoPainel, 'total' | 'recebidos' | 'marcados'>): string {
  // "1 de 7 recebidos": o plural é dos 7.
  const base = `${b.recebidos} de ${b.total} recebidos`;
  return b.marcados > 0 ? `${base}, ${b.marcados} ${b.marcados === 1 ? 'pulado' : 'pulados'}` : base;
}

/** O vazio do filtro, no singular do que se procurava. */
export function vazioDoFiltro(filtro: EstadoItem): string {
  return filtro === 'RECEBIDO' ? 'Nenhum item recebido ainda.' : filtro === 'MARCADO' ? 'Nenhum item pulado com motivo.' : 'Nenhum item pendente.';
}
