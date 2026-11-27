import { z } from 'zod';
import type { ChamadaIfood } from './http';

const TAMANHO_MAXIMO = 50;
const uuid = z.guid().transform(valor => valor.toLowerCase());
const instante = z.iso.datetime({ offset: true });
const contagem = z.int().nonnegative();
const texto = z.string().trim().min(1);

const listagemSchema = z.strictObject({
  merchantId: uuid,
  de: instante,
  ate: instante,
  pagina: z.int().positive().default(1),
  tamanho: z.int().min(1).max(TAMANHO_MAXIMO).default(10),
  ordem: z.enum(['ASC', 'DESC']).default('DESC'),
});

const detalheSchema = z.strictObject({ merchantId: uuid, reviewId: uuid });

const avaliacaoSchema = z.object({
  id: uuid,
  createdAt: instante,
  score: z.number().nullish(),
  status: texto.nullish(),
  version: texto.nullish(),
  visibility: texto.nullish(),
  replies: z.array(z.object({ from: texto.nullish() })),
});

const paginaSchema = z.object({
  page: contagem,
  size: contagem,
  total: contagem.optional(),
  pageCount: contagem.optional(),
  reviews: z.array(avaliacaoSchema).max(TAMANHO_MAXIMO),
});

const respostaDetalheSchema = avaliacaoSchema.extend({ merchant: z.object({ id: uuid.optional() }).nullish() });

type CodigoContratoReview = 'PARAMETROS' | 'ESQUEMA' | 'PAGINACAO' | 'PERIODO' | 'IDENTIDADE';

export class ErroContratoReview extends Error {
  constructor(public readonly codigo: CodigoContratoReview, mensagem: string) {
    super(mensagem);
    this.name = 'ErroContratoReview';
  }
}

function exigir(condicao: unknown, codigo: CodigoContratoReview, mensagem: string): asserts condicao {
  if (!condicao) throw new ErroContratoReview(codigo, mensagem);
}

function lerInstante(valor: string) {
  const fracao = valor.match(/\.(\d+)/)?.[1] ?? '';
  return { milissegundos: Date.parse(valor), fracaoDoMilissegundo: fracao.slice(3).replace(/0+$/, '') };
}

type InstanteReview = ReturnType<typeof lerInstante>;

function compararInstantes(a: InstanteReview, b: InstanteReview) {
  if (a.milissegundos !== b.milissegundos) return a.milissegundos - b.milissegundos;
  const digitos = Math.max(a.fracaoDoMilissegundo.length, b.fracaoDoMilissegundo.length);
  const esquerda = a.fracaoDoMilissegundo.padEnd(digitos, '0');
  const direita = b.fracaoDoMilissegundo.padEnd(digitos, '0');
  if (esquerda === direita) return 0;
  return esquerda < direita ? -1 : 1;
}

function dataEmUtc(valor: InstanteReview) {
  const utc = new Date(valor.milissegundos).toISOString();
  return `${utc.slice(0, -1)}${valor.fracaoDoMilissegundo}Z`;
}

function lerParametrosDaListagem(entrada: unknown) {
  const resultado = listagemSchema.safeParse(entrada);
  exigir(resultado.success, 'PARAMETROS', 'Parâmetros da listagem Review inválidos.');
  const dados = resultado.data;
  const inicio = lerInstante(dados.de);
  const fim = lerInstante(dados.ate);
  exigir(compararInstantes(inicio, fim) <= 0, 'PARAMETROS', 'O início da consulta precisa anteceder ou coincidir com o fim.');
  return { ...dados, inicio, fim };
}

function lerParametrosDoDetalhe(entrada: unknown) {
  const resultado = detalheSchema.safeParse(entrada);
  exigir(resultado.success, 'PARAMETROS', 'Parâmetros do detalhe Review inválidos.');
  return resultado.data;
}

function caminhoDasAvaliacoes(merchantId: string) {
  return `/review/v2.0/merchants/${merchantId}/reviews`;
}

export function chamadaDaListagemReview(entrada: unknown): ChamadaIfood {
  const { merchantId, inicio, fim, pagina, tamanho, ordem } = lerParametrosDaListagem(entrada);
  return {
    metodo: 'GET',
    familia: 'review',
    caminho: caminhoDasAvaliacoes(merchantId),
    consulta: {
      page: String(pagina), pageSize: String(tamanho), addCount: 'true',
      dateFrom: dataEmUtc(inicio), dateTo: dataEmUtc(fim), sort: ordem, sortBy: 'CREATED_AT',
    },
  };
}

export function chamadaDoDetalheReview(entrada: unknown): ChamadaIfood {
  const { merchantId, reviewId } = lerParametrosDoDetalhe(entrada);
  return { metodo: 'GET', familia: 'review', caminho: `${caminhoDasAvaliacoes(merchantId)}/${reviewId}` };
}

function projetarAvaliacao(avaliacao: z.infer<typeof avaliacaoSchema>) {
  const autores = avaliacao.replies.map(resposta => resposta.from);
  return {
    id: avaliacao.id,
    criadaEm: avaliacao.createdAt,
    nota: avaliacao.score ?? null,
    status: avaliacao.status ?? null,
    versao: avaliacao.version ?? null,
    visibilidade: avaliacao.visibility ?? null,
    temRespostaDaLoja: autores.includes('MERCHANT') ? true : autores.every(autor => autor === 'CUSTOMER') ? false : null,
  };
}

type EstadoPaginaReview = 'observada' | 'contagem-incompleta' | 'vazia' | 'fora-das-paginas';

function conferirContagem(consulta: z.infer<typeof listagemSchema>, dados: z.infer<typeof paginaSchema>): EstadoPaginaReview {
  const { reviews, size, total, pageCount } = dados;
  const quantidade = reviews.length;
  const { pagina, tamanho } = consulta;
  exigir(quantidade <= size && size <= tamanho, 'PAGINACAO', 'A quantidade recebida ou o tamanho informado diverge da consulta Review.');
  exigir(total === undefined || total >= quantidade, 'PAGINACAO', 'A resposta Review tem mais itens do que o total informado.');
  exigir(pageCount === undefined || pagina <= pageCount || quantidade === 0,
    'PAGINACAO', 'A resposta Review trouxe itens fora da contagem de páginas.');
  if (total === undefined || pageCount === undefined) return 'contagem-incompleta';

  exigir(pageCount === Math.ceil(total / tamanho) || (total === 0 && pageCount === 1),
    'PAGINACAO', 'O total e o número de páginas da resposta Review são incompatíveis.');
  if (total === 0 && pagina === 1) return 'vazia';
  if (pagina > pageCount) return 'fora-das-paginas';
  const esperados = Math.min(tamanho, total - (pagina - 1) * tamanho);
  exigir(quantidade === esperados, 'PAGINACAO', 'A quantidade recebida na página Review diverge da contagem.');
  return 'observada';
}

/** Confere uma página da consulta por criação. O offset retornado fica separado da página pedida. */
export function conferirPaginaReview(entrada: unknown, resposta: unknown) {
  const consulta = lerParametrosDaListagem(entrada);
  const resultado = paginaSchema.safeParse(resposta);
  exigir(resultado.success, 'ESQUEMA', 'Resposta da listagem Review fora do formato esperado.');
  const dados = resultado.data;
  const estado = conferirContagem(consulta, dados);
  const ids = new Set<string>();
  for (const avaliacao of dados.reviews) {
    const quando = lerInstante(avaliacao.createdAt);
    exigir(compararInstantes(quando, consulta.inicio) >= 0 && compararInstantes(quando, consulta.fim) <= 0,
      'PERIODO', 'A listagem Review trouxe uma avaliação fora do período consultado.');
    exigir(!ids.has(avaliacao.id), 'IDENTIDADE', 'A listagem Review repetiu uma avaliação na mesma página.');
    ids.add(avaliacao.id);
  }
  return {
    estado,
    merchantIdSolicitado: consulta.merchantId,
    paginaSolicitada: consulta.pagina,
    paginaInformada: dados.page,
    tamanhoInformado: dados.size,
    total: dados.total ?? null,
    paginas: dados.pageCount ?? null,
    avaliacoes: dados.reviews.map(projetarAvaliacao),
  };
}

export function conferirDetalheReview(entrada: unknown, resposta: unknown) {
  const { merchantId, reviewId } = lerParametrosDoDetalhe(entrada);
  const resultado = respostaDetalheSchema.safeParse(resposta);
  exigir(resultado.success, 'ESQUEMA', 'Resposta do detalhe Review fora do formato esperado.');
  const dados = resultado.data;
  exigir(dados.id === reviewId, 'IDENTIDADE', 'O detalhe Review indica outra avaliação.');
  if (!dados.merchant?.id) return { estado: 'loja-nao-confirmada' } as const;
  exigir(dados.merchant.id === merchantId, 'IDENTIDADE', 'O detalhe Review indica outra loja.');
  return { estado: 'conferido', merchantId, avaliacao: projetarAvaliacao(dados) } as const;
}
