/** Os limites do XML da NF-e (F.1b), num arquivo sem dependências: a tela (navegador) e o leitor (servidor) leem os mesmos números. */
export const LIMITES_DO_XML = { bytes: 1_000_000, itens: 200, tags: 60_000, profundidade: 40, duplicatas: 120 } as const;
