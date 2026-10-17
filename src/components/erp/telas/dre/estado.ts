/**
 * Estado que as actions do DRE (2.2a) devolvem para `useFormState`. Sucesso não
 * volta por aqui: a action leva de volta à tela com a frase do que aconteceu
 * (`?feito=`). Erro volta com a frase no campo ou no topo; conflito pede para
 * recarregar (outra pessoa gravou antes).
 */

import type { AcaoDeCadastro, EstadoCadastro } from '../cadastro/estado';
import { fraseDe } from '../cadastro/estado';

export type { AcaoDeCadastro, EstadoCadastro };

/** "Lançar as do mês passado": erro geral e o erro de cada despesa marcada. */
export type EstadoMesPassado = { ok: false; erro: string; porItem?: Record<string, string>; vez: number } | null;
export type AcaoMesPassado = (anterior: EstadoMesPassado, form: FormData) => Promise<EstadoMesPassado>;

/** Resposta de um formulário que fica na própria tela (regra do período, plano de contas). */
export type EstadoLocal = { ok: boolean; mensagem?: string; erros?: Partial<Record<string, string>>; conflito?: boolean; vez: number } | null;
export type AcaoLocal = (anterior: EstadoLocal, form: FormData) => Promise<EstadoLocal>;

const FEITO_DA_DESPESA: Readonly<Record<string, string>> = {
  lancada: 'Despesa lançada. O antes e o depois ficam em Alterações desta despesa.',
  ja: 'Esta despesa já estava lançada (o formulário foi enviado duas vezes). Nada foi duplicado.',
  salva: 'Despesa salva. O antes e o depois ficam em Alterações desta despesa.',
  igual: 'Nada mudou: os dados já eram esses.',
  paga: 'Pagamento anotado. Pagar não muda o DRE.',
  'nao-paga': 'Pagamento desfeito.',
  'nao-repete': 'Pronto: esta despesa não repete mais. O histórico dela continua.',
  removida: 'Despesa removida. O que estava lançado e o motivo ficam no Histórico.',
};
export const fraseDaDespesa = (feito: string | undefined) => fraseDe(FEITO_DA_DESPESA, feito);

const FEITO_DO_MES_PASSADO = (feito: string | undefined, criadas: string | undefined) => {
  if (feito !== 'mes') return undefined;
  const n = Number(criadas);
  return Number.isInteger(n) && n >= 0 && n < 1000 ? `${n} ${n === 1 ? 'despesa lançada' : 'despesas lançadas'} do mês passado. Confira os valores na lista.` : 'Despesas lançadas do mês passado.';
};
export const fraseDoMesPassado = FEITO_DO_MES_PASSADO;
