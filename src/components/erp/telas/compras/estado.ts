/**
 * Estado das actions de compras (1.5) para `useFormState`. A nota tem um passo
 * a mais que os cadastros: "Conferir" devolve a PRÉVIA (nada gravado); lançar
 * ou salvar leva ao detalhe com a frase do que mudou (`?feito=`).
 */
import type { PreviaDaNota } from '@/lib/erp/compras';
import { fraseDe } from '../cadastro/estado';

export type EstadoNota = {
  ok: false;
  erros: Partial<Record<string, string>>;
  conflito?: boolean;
  desativadoId?: string;
  /** A mesma nota já lançada (visível para quem tenta). */
  duplicadaId?: string;
  /** Resultado do "Conferir" (sem gravar). */
  previa?: PreviaDaNota;
  vez: number;
} | null;

export type AcaoDeNota = (anterior: EstadoNota, form: FormData) => Promise<EstadoNota>;

const FEITO_DA_NOTA: Readonly<Record<string, string>> = {
  lancada: 'Nota lançada. O custo dos insumos dela já vale nas fichas.',
  editada: 'Nota alterada. O antes e o depois estão em Alterações; o custo já acompanha.',
  igual: 'Nada mudou: a nota já estava assim.',
  cancelada: 'Nota cancelada. Ela não vale mais para o custo: cada insumo voltou ao preço da compra anterior (ou ao preço cadastrado).',
};

const FEITO_DO_FORNECEDOR: Readonly<Record<string, string>> = {
  igual: 'Nada mudou: os valores já eram esses.',
  desativado: 'Fornecedor desativado. As notas dele continuam; nota nova não pode escolher.',
  reativado: 'Fornecedor reativado.',
};

/**
 * F.1a: o retorno de quem cadastra ou edita o fornecedor diz O QUE foi salvo, com o nome lido do BANCO (a URL só escolhe a chave).
 *  - criado: "Fornecedor salvo com sucesso: Laticínios Rio";
 *  - criado-repetido: o mesmo envio chegou duas vezes e o fornecedor existe uma vez só;
 *  - editado: "Fornecedor atualizado com sucesso: Laticínios Rio".
 */
const SALVO_DO_FORNECEDOR: Readonly<Record<string, (nome: string) => { titulo: string; apoio?: string }>> = {
  criado: (nome) => ({ titulo: `Fornecedor salvo com sucesso: ${nome}`, apoio: 'Já dá para lançar nota dele.' }),
  'criado-repetido': (nome) => ({ titulo: `Fornecedor salvo com sucesso: ${nome}`, apoio: 'O envio chegou mais de uma vez; o fornecedor foi cadastrado uma vez só.' }),
  editado: (nome) => ({ titulo: `Fornecedor atualizado com sucesso: ${nome}`, apoio: 'O antes e o depois estão em Alterações.' }),
};

export function fraseDoSalvoDoFornecedor(feito: string | undefined, nome: string): { titulo: string; apoio?: string; criou: boolean } | undefined {
  if (!feito || !Object.hasOwn(SALVO_DO_FORNECEDOR, feito)) return undefined;
  return { ...SALVO_DO_FORNECEDOR[feito](nome), criou: feito !== 'editado' };
}

export const fraseDaNota = (feito: string | undefined) => fraseDe(FEITO_DA_NOTA, feito);
export const fraseDoFornecedor = (feito: string | undefined) => fraseDe(FEITO_DO_FORNECEDOR, feito);
