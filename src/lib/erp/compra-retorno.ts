/** Retorno de um lançamento: somente seleção da loja e remontagem do formulário, nunca ID ou valores da nota. */
export function lerRetornoDeCompra(query: { feito?: unknown; loja?: unknown; nova?: unknown } = {}) {
  if (query.feito !== 'lancada' || typeof query.loja !== 'string' || !/^[a-z0-9]{1,64}$/i.test(query.loja)
    || typeof query.nova !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(query.nova)) return null;
  return { lojaId: query.loja, chave: query.nova };
}
