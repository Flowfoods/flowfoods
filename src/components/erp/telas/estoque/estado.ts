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
};

export const fraseDoEstoque = (feito: string | undefined) => fraseDe(FEITO, feito);
