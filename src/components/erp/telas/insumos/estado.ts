import { fraseDe } from '../cadastro/estado';

/** O que aparece no detalhe do insumo depois de gravar (`?feito=`). Frases fixas: a URL só escolhe. */
export const FEITO: Readonly<Record<string, string>> = {
  igual: 'Nada mudou: os valores já eram esses.',
  desativado: 'Insumo desativado. Ele sai da lista padrão; o histórico continua. Para editar, reative.',
  reativado: 'Insumo reativado.',
  'embalagem-criada': 'Embalagem cadastrada.',
  'embalagem-editada': 'Embalagem alterada. O antes e o depois estão em Últimas alterações.',
  'embalagem-igual': 'Nada mudou na embalagem: os valores já eram esses.',
  'embalagem-desativada': 'Embalagem desativada.',
  'embalagem-reativada': 'Embalagem reativada.',
};

/**
 * I.1a: o retorno de quem cria ou edita diz O QUE foi salvo e distingue criado de atualizado. O nome vem do BANCO (a página
 * lê o insumo), nunca da URL: a URL só escolhe a chave.
 *  - criado: "Insumo salvo com sucesso: Farinha de trigo";
 *  - criado-repetido: o mesmo envio chegou duas vezes (clique repetido, resposta perdida) e o insumo existe uma vez só;
 *  - editado: "Insumo atualizado com sucesso: Farinha de trigo".
 */
export const SALVO: Readonly<Record<string, (nome: string) => { titulo: string; apoio?: string }>> = {
  criado: (nome) => ({ titulo: `Insumo salvo com sucesso: ${nome}` }),
  'criado-repetido': (nome) => ({
    titulo: `Insumo salvo com sucesso: ${nome}`,
    apoio: 'O envio chegou mais de uma vez; o insumo foi cadastrado uma vez só.',
  }),
  editado: (nome) => ({ titulo: `Insumo atualizado com sucesso: ${nome}`, apoio: 'O antes e o depois estão em Últimas alterações.' }),
};

/** A frase da URL que não leva o nome do insumo. As que levam estão em `fraseDoSalvo`. */
export function fraseDoFeito(feito: string | undefined): string | undefined {
  return fraseDe(FEITO, feito);
}

/** A confirmação de criar ou editar, com o nome lido do banco; undefined se `feito` não for uma delas. */
export function fraseDoSalvo(feito: string | undefined, nome: string): { titulo: string; apoio?: string; criou: boolean } | undefined {
  if (!feito || !Object.hasOwn(SALVO, feito)) return undefined;
  return { ...SALVO[feito](nome), criou: feito !== 'editado' };
}
