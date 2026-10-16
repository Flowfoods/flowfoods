import type { Previa } from '@/lib/erp/ficha-importar';
import { fraseDe } from '../cadastro/estado';

/** O que aparece no detalhe da ficha depois de gravar (`?feito=`). Frases fixas: a URL só escolhe. */
export const FEITO_FICHA: Readonly<Record<string, string>> = {
  criada: 'Ficha cadastrada.',
  editada: 'Alterações salvas. O antes e o depois estão em Últimas alterações.',
  igual: 'Nada mudou: os valores já eram esses.',
  desativada: 'Ficha desativada. Ela sai da lista padrão; o histórico continua. Para editar, reative.',
  reativada: 'Ficha reativada.',
};

export function fraseDoFeitoDaFicha(feito: string | undefined): string | undefined {
  return fraseDe(FEITO_FICHA, feito);
}

/** Estado da tela de importar: prévia (nada gravado) ou o resultado da gravação. */
export type EstadoImportacao = {
  vez: number;
  erro?: string;
  previa?: Previa;
  /** O texto da planilha, devolvido para confirmar sem reenviar o arquivo. */
  texto?: string;
  arquivo?: string;
  resultado?: { criadas: number; alteradas: number; iguais: number; comErro: number };
} | null;

export type AcaoDeImportacao = (anterior: EstadoImportacao, form: FormData) => Promise<EstadoImportacao>;
