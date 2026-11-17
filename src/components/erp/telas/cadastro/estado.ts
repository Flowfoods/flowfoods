/**
 * Estado que as actions de cadastro do ERP (insumos, fichas técnicas — nível 1
 * e pessoa do parceiro) devolvem para `useActionState`. Sucesso não volta por
 * aqui: a action leva para o detalhe com a frase do que mudou (`?feito=`).
 */
export type EstadoCadastro = {
  ok: false;
  erros: Partial<Record<string, string>>;
  /** Alguém gravou depois que esta tela leu: recarregar, não insistir. */
  conflito?: boolean;
  /**
   * INS-SALVAR-CONFIRMACAO: o ERP foi atualizado com esta tela aberta. A ação dela não existe no servidor novo, então NADA
   * foi salvo, e salvar de novo falha igual: só recarregar resolve.
   */
  versaoNova?: boolean;
  /** Com `versaoNova`: o que foi digitado ficou guardado no rascunho da aba e volta preenchido depois de recarregar. */
  rascunhoGuardado?: boolean;
  /** Nome repetido de um cadastro desativado: link para reativar. */
  desativadoId?: string;
  /** I.1a: nome repetido de um cadastro ativo (ou escrito de outro jeito): link para abrir o que já existe. */
  existenteId?: string;
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
