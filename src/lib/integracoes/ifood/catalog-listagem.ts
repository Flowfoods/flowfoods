import { z } from 'zod';
import type { ChamadaIfood } from './http';

const consultaSchema = z.strictObject({
  merchantId: z.guid().transform(valor => valor.toLowerCase()),
});
const consultaCategoriasSchema = consultaSchema.extend({
  catalogId: z.string().regex(/^[A-Za-z0-9._~:-]+$/).refine(id => id !== '.' && !id.includes('..')),
});

const texto = z.string().refine(valor => valor.trim().length > 0);
const respostaSchema = z.array(z.object({
  catalogId: texto,
  context: z.array(texto),
  status: texto,
  modifiedAt: z.union([z.number(), z.iso.datetime({ offset: true })]),
}));
const categoriasSchema = z.array(z.object({
  id: texto,
  index: z.number(),
  name: texto,
  externalCode: z.string().nullish(),
  status: texto,
  template: texto.nullish(),
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

function lerConsultaCategorias(entrada: unknown) {
  const resultado = consultaCategoriasSchema.safeParse(entrada);
  if (!resultado.success) {
    throw new ErroContratoCatalog('PARAMETROS', 'Informe a loja e um identificador de catálogo válido para a rota.');
  }
  return resultado.data;
}

const caminhoDosCatalogos = (merchantId: string) => `/catalog/v2.0/merchants/${merchantId}/catalogs`;

export function chamadaDaListagemCatalog(entrada: unknown): ChamadaIfood {
  const merchantId = lerLoja(entrada);
  return {
    metodo: 'GET', familia: 'catalog', caminho: caminhoDosCatalogos(merchantId),
  };
}

export function chamadaDaListagemCategoriasCatalog(entrada: unknown): ChamadaIfood {
  const { merchantId, catalogId } = lerConsultaCategorias(entrada);
  return {
    metodo: 'GET', familia: 'catalog', caminho: `${caminhoDosCatalogos(merchantId)}/${catalogId}/categories`,
    consulta: { includeItems: 'false' },
  };
}

/** Projeta os campos de GetCategoryDto para a loja e o catálogo solicitados. */
export function conferirCategoriasCatalog(entrada: unknown, resposta: unknown) {
  const { merchantId, catalogId } = lerConsultaCategorias(entrada);
  const resultado = categoriasSchema.safeParse(resposta);
  if (!resultado.success || new Set(resultado.data.map(categoria => categoria.id)).size !== resultado.data.length) {
    throw new ErroContratoCatalog('ESQUEMA', 'A listagem de categorias respondeu num formato inesperado.');
  }
  const categorias = resultado.data.map(categoria => ({
    ...categoria, externalCode: categoria.externalCode ?? null, template: categoria.template ?? null,
  }));
  return {
    merchantIdSolicitado: merchantId, catalogIdSolicitado: catalogId,
    situacao: categorias.length === 0 ? 'vazia' : 'observada', categorias,
  } as const;
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
