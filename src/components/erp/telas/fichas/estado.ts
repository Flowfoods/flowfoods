import type { Previa } from '@/lib/erp/ficha-importar';
import { fraseDe } from '../cadastro/estado';

/** O que aparece no detalhe da ficha depois de gravar (`?feito=`). Frases fixas: a URL só escolhe. */
export const FEITO_FICHA: Readonly<Record<string, string>> = {
  criada: 'Ficha cadastrada.',
  editada: 'Alterações salvas. O antes e o depois estão em Últimas alterações.',
  igual: 'Nada mudou: os valores já eram esses.',
  desativada: 'Ficha desativada. Ela sai da lista padrão; o histórico continua. Para editar, reative.',
  reativada: 'Ficha reativada.',
  // 1.9
  embalagens: 'Embalagens salvas. O custo do delivery e do iFood já mudou; o antes e o depois estão em Últimas alterações.',
  taxa: 'Taxa do iFood salva. O custo do iFood de todas as fichas já usa a nova.',
  'taxa-igual': 'Nada mudou: a taxa já era essa.',
  // 1.10
  precos: 'Preços salvos. O antes e o depois, com o custo do canal na hora, estão em Últimas alterações.',
  'precos-custo': 'Preços salvos. O custo mudou enquanto você editava: o CMV e o resultado abaixo já são os de agora.',
  'precos-igual': 'Nada mudou: os preços já eram esses.',
  margens: 'Margens-alvo salvas. É registro antigo: o preço sugerido segue a meta de CMV.',
  'margens-igual': 'Nada mudou: as margens-alvo já eram essas.',
  // N.2
  metas: 'Metas de CMV salvas. A sugestão e o farol de todas as fichas já usam as novas; nenhum preço foi mudado.',
  'metas-igual': 'Nada mudou: as metas de CMV já eram essas.',
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

/** F4: o retorno de uma mudança nas fotos da ficha (`vez` faz a tela anunciar mesmo quando a frase se repete). */
export type EstadoDasFotos = { vez: number; ok: boolean; frase: string } | null;
