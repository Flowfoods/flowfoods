/**
 * Estado que as actions de faturamento (2.1) devolvem para `useFormState`.
 * Sucesso não volta por aqui: a action leva de volta à tela do dia com a frase
 * do que aconteceu (`?feito=`). Erro volta com a frase no campo (por canal) ou
 * no topo; conflito pede para recarregar (outra pessoa gravou antes).
 */

import type { CanalVenda, ErrosDoCanal } from '@/lib/erp/faturamento-campos';
import type { PreviaDoFaturamento } from '@/lib/erp/faturamento';
import { fraseDe } from '../cadastro/estado';

export type EstadoDoDia = {
  ok: false;
  erros: { geral?: string; data?: string };
  porCanal: Partial<Record<CanalVenda, ErrosDoCanal>>;
  conflito?: boolean;
  vez: number;
} | null;

export type AcaoDoDia = (anterior: EstadoDoDia, form: FormData) => Promise<EstadoDoDia>;

export type EstadoDosCanais = { ok: boolean; erros?: { geral?: string }; mensagem?: string; vez: number } | null;
export type AcaoDosCanais = (anterior: EstadoDosCanais, form: FormData) => Promise<EstadoDosCanais>;

export type EstadoDaImportacao = {
  vez: number;
  erro?: string;
  previa?: PreviaDoFaturamento;
  /** O arquivo, devolvido para a confirmação (a importação refaz a leitura). */
  texto?: string;
  arquivo?: string;
  resultado?: { criadas: number; alteradas: number; iguais: number; comErro: number };
  /** O mundo mudou desde a prévia: a tela pede para ver a prévia de novo. */
  mudou?: boolean;
} | null;

export type AcaoDeImportacaoDeFaturamento = (anterior: EstadoDaImportacao, form: FormData) => Promise<EstadoDaImportacao>;

const FEITO_DO_DIA: Readonly<Record<string, string>> = {
  salvo: 'Dia salvo. O antes e o depois ficam em Alterações deste dia.',
  igual: 'Nada mudou: os números já eram esses.',
  removido: 'Lançamento removido. O canal voltou a ficar sem lançamento.',
};

export const fraseDoDia = (feito: string | undefined) => fraseDe(FEITO_DO_DIA, feito);
