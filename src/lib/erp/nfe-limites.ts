/** Os limites do XML da NF-e (F.1b), num arquivo sem dependências: a tela (navegador) e o leitor (servidor) leem os mesmos números. */
/** O tamanho fica em 900 KB de propósito: o Next recusa o corpo da requisição acima de 1 MB com uma página de erro, e o arquivo vai junto com o resto do formulário. */
export const LIMITES_DO_XML = { bytes: 900_000, itens: 200, tags: 60_000, profundidade: 40, duplicatas: 120 } as const;
