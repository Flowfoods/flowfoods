/**
 * Estado das actions das notas recebidas por XML (F.1b) para `useFormState`. Receber, salvar, conciliar, ligar e cancelar levam à
 * tela do documento com a frase do que aconteceu (`?feito=`); o que volta por aqui é o erro (sem perder o que a pessoa escolheu) ou a
 * PRÉVIA do "Conferir o impacto" (nada foi gravado).
 */
import type { PreviaDaNota } from '@/lib/erp/compras';
import { fraseDe } from '../cadastro/estado';

export type EstadoDocumento = {
  ok: false;
  erros: Partial<Record<string, string>>;
  conflito?: boolean;
  /** Receber: o documento que já existe com esta chave (e que a pessoa pode abrir). */
  existenteId?: string;
  /** Resultado do "Conferir o impacto" (sem gravar). */
  previa?: PreviaDaNota;
  /** Para a prévia: o que cada item vai virar ("Muçarela · Peça 2 kg"). */
  contas?: Record<number, string>;
  vez: number;
} | null;

export type AcaoDeDocumento = (anterior: EstadoDocumento, form: FormData) => Promise<EstadoDocumento>;

const FEITO_DO_DOCUMENTO: Readonly<Record<string, string>> = {
  recebida: 'Nota fiscal recebida. Nada foi lançado ainda: confira os itens, escolha o insumo de cada um e depois concilie.',
  'ja-recebida': 'Esta nota já tinha sido recebida: nada foi gravado de novo. Estas são as escolhas dela.',
  salva: 'Escolhas salvas. O sistema vai lembrar estes itens deste fornecedor nas próximas notas. A nota de compra ainda não foi lançada.',
  conciliada: 'Nota conciliada: a nota de compra foi lançada e o custo dos insumos já vale nas fichas.',
  ligada: 'Nota ligada à que você já tinha lançado. Nada foi lançado de novo: o estoque e o custo ficaram como estavam.',
  cancelada: 'Nota fiscal descartada. Ela não entra mais; a chave dela fica guardada para não ser recebida de novo.',
};

export const fraseDoDocumento = (feito: string | undefined) => fraseDe(FEITO_DO_DOCUMENTO, feito);
