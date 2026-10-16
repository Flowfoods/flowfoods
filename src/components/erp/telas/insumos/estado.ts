/**
 * Estado que as actions de insumo (nível 1 em /rodolfo/erp/<slug>/insumos e a
 * pessoa do parceiro em /erp/insumos) devolvem para `useFormState`. Sucesso
 * não volta por aqui: a action leva para o detalhe com a mensagem do que mudou.
 */
export type EstadoInsumo = {
  ok: false;
  erros: Partial<Record<string, string>>;
  /** Alguém gravou depois que esta tela leu: recarregar, não insistir. */
  conflito?: boolean;
  /** Nome repetido de um insumo desativado: link para reativar. */
  desativadoId?: string;
  vez: number;
} | null;

export type AcaoDeInsumo = (anterior: EstadoInsumo, form: FormData) => Promise<EstadoInsumo>;

/** O que aparece no detalhe depois de gravar (`?feito=`). Frases fixas: a URL só escolhe. */
export const FEITO: Record<string, string> = {
  criado: 'Insumo cadastrado.',
  editado: 'Alterações salvas. O antes e o depois estão em Últimas alterações.',
  igual: 'Nada mudou: os valores já eram esses.',
  desativado: 'Insumo desativado. Ele sai da lista padrão; o histórico continua.',
  reativado: 'Insumo reativado.',
  'embalagem-criada': 'Embalagem cadastrada.',
  'embalagem-editada': 'Embalagem alterada. O antes e o depois estão em Últimas alterações.',
  'embalagem-igual': 'Nada mudou na embalagem: os valores já eram esses.',
  'embalagem-desativada': 'Embalagem desativada.',
  'embalagem-reativada': 'Embalagem reativada.',
};
