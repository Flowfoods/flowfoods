import { z } from 'zod';
import type { ChamadaIfood } from './http';

const consultaSchema = z.strictObject({
  merchantId: z.guid().transform(valor => valor.toLowerCase()),
});

const texto = z.string().refine(valor => valor.trim().length > 0);
const respostaSchema = z.array(z.object({
  catalogId: texto,
  context: z.array(texto),
  status: texto,
  modifiedAt: z.number(),
}));

export class ErroContratoCatalog extends Error {
  constructor(public readonly codigo: 'PARAMETROS' | 'ESQUEMA', mensagem: string) {
    super(mensagem);
    this.name = 'ErroContratoCatalog';
  }
}

function lerLoja(entrada: unknown): string {
  const resultado = consultaSchema.safeParse(entrada);
  if (!resultado.success) {
    throw new ErroContratoCatalog('PARAMETROS', 'Parâmetros da listagem Catalog inválidos.');
  }
  return resultado.data.merchantId;
}

export function chamadaDaListagemCatalog(entrada: unknown): ChamadaIfood {
  const merchantId = lerLoja(entrada);
  return {
    metodo: 'GET', familia: 'catalog', caminho: `/catalog/v2.0/merchants/${merchantId}/catalogs`,
  };
}

/** Projeta o corpo de sucesso da loja solicitada, com o valor de modifiedAt informado pelo iFood. */
export function conferirCatalogos(entrada: unknown, resposta: unknown) {
  const merchantIdSolicitado = lerLoja(entrada);
  const resultado = respostaSchema.safeParse(resposta);
  if (!resultado.success) {
    throw new ErroContratoCatalog('ESQUEMA', 'A listagem Catalog respondeu num formato inesperado.');
  }
  return {
    merchantIdSolicitado,
    situacao: resultado.data.length === 0 ? 'vazia' : 'observada',
    catalogos: resultado.data,
  } as const;
}
