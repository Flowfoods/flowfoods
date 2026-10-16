import { fraseDe } from '../cadastro/estado';

/** O que aparece no detalhe do insumo depois de gravar (`?feito=`). Frases fixas: a URL só escolhe. */
export const FEITO: Readonly<Record<string, string>> = {
  criado: 'Insumo cadastrado.',
  editado: 'Alterações salvas. O antes e o depois estão em Últimas alterações.',
  igual: 'Nada mudou: os valores já eram esses.',
  desativado: 'Insumo desativado. Ele sai da lista padrão; o histórico continua. Para editar, reative.',
  reativado: 'Insumo reativado.',
  'embalagem-criada': 'Embalagem cadastrada.',
  'embalagem-editada': 'Embalagem alterada. O antes e o depois estão em Últimas alterações.',
  'embalagem-igual': 'Nada mudou na embalagem: os valores já eram esses.',
  'embalagem-desativada': 'Embalagem desativada.',
  'embalagem-reativada': 'Embalagem reativada.',
};

export function fraseDoFeito(feito: string | undefined): string | undefined {
  return fraseDe(FEITO, feito);
}
