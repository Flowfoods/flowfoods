/**
 * Estado que as actions de cadastro do ERP (insumos, fichas técnicas — nível 1
 * e pessoa do parceiro) devolvem para `useFormState`. Sucesso não volta por
 * aqui: a action leva para o detalhe com a frase do que mudou (`?feito=`).
 */
export type EstadoCadastro = {
  ok: false;
  erros: Partial<Record<string, string>>;
  /** Alguém gravou depois que esta tela leu: recarregar, não insistir. */
  conflito?: boolean;
  /** Nome repetido de um cadastro desativado: link para reativar. */
  desativadoId?: string;
  vez: number;
} | null;

export type AcaoDeCadastro = (anterior: EstadoCadastro, form: FormData) => Promise<EstadoCadastro>;

/**
 * A frase do `?feito=` num mapa de frases fixas: a URL só ESCOLHE uma chave
 * própria do mapa (`__proto__`, `constructor` não são frase).
 */
export function fraseDe(mapa: Readonly<Record<string, string>>, feito: string | undefined): string | undefined {
  return feito && Object.hasOwn(mapa, feito) ? mapa[feito] : undefined;
}
