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
};

export const fraseDoEstoque = (feito: string | undefined) => fraseDe(FEITO, feito);
