/** Confirmação do próprio envio: valores e versão pertencem à mesma transação de configuração. */
export type ConfirmacaoConfiguracao = { versao: string; campos: Record<string, string> };
export type EstadoConfiguracao =
  | null
  | { ok: false; vez: number; erros: Partial<Record<string, string>>; conflito?: boolean }
  | { ok: true; vez: number; mensagem: string; confirmacao: ConfirmacaoConfiguracao };
export type AcaoConfiguracao = (anterior: EstadoConfiguracao, form: FormData) => Promise<EstadoConfiguracao>;
