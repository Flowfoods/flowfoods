/**
 * Estado de cada item do portal: recebido, marcado ou pendente.
 *
 * Função pura — a mesma régua vale para o contador que o cliente vê, para o
 * painel do Rodolfo e para o aviso no WhatsApp. Se cada tela contasse do seu
 * jeito, "faltam 3" no celular dela e "faltam 5" no painel dele seria questão
 * de tempo.
 *
 * Precedência: conteúdo vence marcação. Quem marcou NÃO SEI e depois subiu a
 * planilha entregou — a marcação fica registrada, mas o item conta como
 * recebido.
 */

import type { Item, Marcacao } from './questionario';

export type EstadoItem = 'RECEBIDO' | 'MARCADO' | 'PENDENTE';

export interface RespostaItem {
  itemId: string;
  texto: string | null;
  marcacao: Marcacao | null;
}

export interface ArquivoItem {
  itemId: string;
}

export interface SituacaoItem {
  item: Item;
  estado: EstadoItem;
  texto: string | null;
  marcacao: Marcacao | null;
  arquivos: number;
}

export interface Progresso {
  situacoes: SituacaoItem[];
  total: number;
  recebidos: number;
  marcados: number;
  pendentes: number;
  /** Contagem por marcação, para o painel ler "onde a gestão precisa evoluir". */
  porMarcacao: Record<Marcacao, number>;
}

export function temTexto(t: string | null | undefined): boolean {
  return typeof t === 'string' && t.trim().length > 0;
}

export function calcularProgresso(
  itens: Item[],
  respostas: RespostaItem[],
  arquivos: ArquivoItem[],
): Progresso {
  const porItem = new Map(respostas.map((r) => [r.itemId, r]));
  const arquivosPorItem = new Map<string, number>();
  for (const a of arquivos) arquivosPorItem.set(a.itemId, (arquivosPorItem.get(a.itemId) ?? 0) + 1);

  const porMarcacao: Record<Marcacao, number> = { NAO_TENHO: 0, NAO_SEI: 0, AGORA_NAO: 0 };

  const situacoes = itens.map((item): SituacaoItem => {
    const r = porItem.get(item.id);
    const nArquivos = arquivosPorItem.get(item.id) ?? 0;
    const texto = r?.texto ?? null;
    const marcacao = r?.marcacao ?? null;

    let estado: EstadoItem = 'PENDENTE';
    if (temTexto(texto) || nArquivos > 0) estado = 'RECEBIDO';
    else if (marcacao) estado = 'MARCADO';

    if (estado === 'MARCADO' && marcacao) porMarcacao[marcacao] += 1;

    return { item, estado, texto, marcacao, arquivos: nArquivos };
  });

  const contar = (e: EstadoItem) => situacoes.filter((s) => s.estado === e).length;

  return {
    situacoes,
    total: itens.length,
    recebidos: contar('RECEBIDO'),
    marcados: contar('MARCADO'),
    pendentes: contar('PENDENTE'),
    porMarcacao,
  };
}
