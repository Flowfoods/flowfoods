/**
 * Estado que as actions de equipe (nível 1 em /rodolfo/erp/<slug>/acessos e a
 * pessoa do parceiro em /erp/equipe) devolvem para `useFormState`. O link de
 * senha aparece UMA vez, aqui: o banco guarda só o hash.
 */
export type EstadoEquipe = {
  ok: boolean;
  mensagem?: string;
  erros?: Partial<Record<string, string>>;
  link?: string;
  validade?: string;
  vez: number;
} | null;

export type AcaoDeEquipe = (anterior: EstadoEquipe, form: FormData) => Promise<EstadoEquipe>;

const VALIDADE = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

export function validadeDoLink(d: Date): string {
  return VALIDADE.format(d).replace(',', ' às');
}
