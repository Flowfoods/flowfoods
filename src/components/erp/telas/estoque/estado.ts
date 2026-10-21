/**
 * Estado das actions de estoque (1.6) para `useFormState` e as frases do
 * `?feito=`. Contar um item não passa por aqui: a tela chama a action direto
 * e recebe o item salvo (ou o conflito) — `ResultadoDoItem`.
 */
import type { ResultadoDoItem } from '@/lib/erp/estoque';
import { fraseDe } from '../cadastro/estado';

export type EstadoEstoque = {
  ok: false;
  erros: Partial<Record<string, string>>;
  conflito?: boolean;
  vez: number;
} | null;

export type AcaoDeEstoque = (anterior: EstadoEstoque, form: FormData) => Promise<EstadoEstoque>;

/** O que a tela de contagem manda de um item (a action confere tudo de novo). */
export interface ItemParaSalvar {
  itemId: string;
  embalagens: string;
  solto: string;
  escala: string;
  versao: number;
  /** Há quantos ms a pessoa digitou (relógio do aparelho). Dado do cliente: o servidor prende entre o início da contagem e agora. */
  idadeMs?: number;
}

export type AcaoDeContar = (item: ItemParaSalvar) => Promise<ResultadoDoItem>;

const FEITO: Readonly<Record<string, string>> = {
  iniciada: 'Contagem de abertura começada. Conte cada insumo; o que você digita é salvo sozinho.',
  aberto: 'Estoque aberto. O saldo de cada insumo é o que foi contado; daqui em diante as notas desta loja entram no estoque.',
  'ja-aberto': 'Este estoque já tinha sido aberto (por outra pessoa ou outra aba): nada foi gravado de novo.',
  descartada: 'Contagem descartada. Nada foi para o estoque; dá para começar de novo.',
  // 1.7
  ciclo: 'Contagem começada. Quem conta abre no celular; o que se digita salva sozinho. Se tudo bater, ela fecha sozinha.',
  aplicada: 'Contagem aplicada: as diferenças entraram no livro do estoque, com o antes e o depois.',
  'ja-aplicada': 'Esta contagem já tinha sido aplicada (por outra pessoa ou outra aba): nada foi gravado de novo.',
  'ciclo-descartado': 'Contagem descartada. Nada foi para o estoque.',
  fechamento: 'Fechamento começado. Conte o que falta; o período fecha quando a cobertura chega ao piso.',
  'fechamento-ja': 'O fechamento deste período já estava começado: continue de onde parou.',
  'periodo-fechado': 'Período fechado: os ajustes entraram no livro e o estoque final ficou fotografado.',
  regras: 'Regras da contagem salvas. Valem a partir de agora.',
  // 1.8
  pedida: 'Requisição pedida. O estoque vê no quadro e entrega; a baixa acontece na entrega.',
  entregue: 'Entregue: a baixa entrou no livro do estoque, com o antes e o depois.',
  'ja-atendida': 'Esta requisição já tinha sido entregue (por outra pessoa ou outra aba): nada saiu de novo.',
  devolvida: 'Devolução registrada: a saída foi estornada no livro e saiu de novo só o que ficou.',
  cancelada: 'Requisição cancelada. Nada saiu do estoque por ela.',
  'ja-cancelada': 'Esta requisição já estava cancelada.',
  // 3.1
  planejado: 'Lote planejado. A requisição dos insumos já está com o estoque; quando os insumos chegarem, comece a produzir.',
  iniciado: 'Produção começada. Quando o lote ficar pronto, conclua dizendo quanto saiu de verdade.',
  'ja-iniciado': 'Este lote já estava em produção.',
  concluido: 'Lote concluído: ele entrou no estoque da loja e o custo ficou fechado pelo que saiu do estoque.',
  'ja-concluido': 'Este lote já tinha sido concluído (por outra pessoa ou outra aba): nada entrou no estoque de novo.',
  'lote-cancelado': 'Lote cancelado. A requisição dos insumos foi cancelada junto.',
  'lote-ja-cancelado': 'Este lote já estava cancelado.',
  estornado: 'Lote estornado: o que ele pôs no estoque foi tirado, com o antes e o depois no livro.',
  'ja-estornado': 'Este lote já tinha sido estornado: nada mudou de novo.',
};

export const fraseDoEstoque = (feito: string | undefined) => fraseDe(FEITO, feito);
