import { createHash } from 'node:crypto';
import { z } from 'zod';
import { diaSeguinte } from './datas';
import { conferirConteudoArquivoV3 } from './financial-v3-arquivo';
import { requestIdConciliacaoValido } from './financial-v3-conciliacao-resposta';
import { copiarGzipConciliacaoV3 } from './financial-v3-csv';
import { centavosNumeroFinancialV3, objetoPeriodoFinancialV3 } from './financial-v3-envelope-periodo';
import { lerPaginaEventosV3 } from './financial-v3-eventos';
import { janelaDaCompetencia, somarEventosMensaisV3, type MotivoEventosMensaisV3 } from './financial-v3-eventos-mensais';
import { lerJsonFinancialV3, NumeroJsonFinancial } from './financial-v3-json';
import { diaDoPainelValido, UUID_DO_MERCHANT } from './painel-campos';

export const LIMITE_ARQUIVO_FONTES_FINANCIAL = 2 * 1024 * 1024;
export const LIMITE_MANIFESTO_FONTES_FINANCIAL = 2 * 1024 * 1024;
const maximoPaginas = 100;
const tamanhoPagina = 100;
const maximoLinhas = 100_000;

const mensagens = {
  ESCOPO: 'O pacote precisa identificar a mesma loja, conexão, ambiente e competência da seleção.',
  LIMITE: 'O tamanho das fontes excede o limite permitido.',
  MANIFESTO: 'O manifesto precisa seguir o modelo JSON da versão 1.',
  ARQUIVO: 'O arquivo mensal diverge do protocolo, da identificação, do SHA-256 ou das contagens declaradas.',
  EVENTOS: 'Confira a sequência das páginas, o período consultado e a identificação dos eventos.',
  VIGENCIAS: 'Informe taxas explícitas em vigências ordenadas que cubram cada dia da competência uma única vez.',
};
type Codigo = keyof typeof mensagens;
export class ErroPacoteFontesFinancial extends Error {
  constructor(readonly codigo: Codigo) {
    super(mensagens[codigo]);
    this.name = 'ErroPacoteFontesFinancial';
  }
}

const idInterno = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const merchant = z.string().length(36).toLowerCase().regex(UUID_DO_MERCHANT);
const competencia = z.string().length(7).refine(mes => diaDoPainelValido(mes + '-01'));
const dia = z.string().refine(diaDoPainelValido);
const escopoSchema = z.strictObject({
  parceiroId: idInterno, lojaId: idInterno, conexaoId: idInterno, merchantId: merchant,
  competencia, ambiente: z.enum(['TEST', 'PRODUCAO']),
});
export type EscopoFontesFinancial = z.infer<typeof escopoSchema>;

export interface VigenciaFontesFinancial {
  inicio: string;
  fim: string;
  comissaoBp: number;
  pagamentoBp: number;
}
export interface ReciboPacoteFontesFinancial {
  versao: 1;
  escopo: EscopoFontesFinancial;
  requestIdSha256: string;
  arquivoSha256: string;
  manifestoSha256: string;
  eventosSha256: string;
  vigenciasSha256: string;
  pacoteSha256: string;
  linhasArquivo: number;
  pedidosDistintos: number;
  paginasEventos: number;
  quantidadeEventos: number;
  vigencias: VigenciaFontesFinancial[];
}

// O leitor preserva o literal numérico. Uma fração não pode ser arredondada para uma contagem ou taxa.
const natural = z.instanceof(NumeroJsonFinancial).transform((valor, ctx) => {
  try {
    const centavos = centavosNumeroFinancialV3(valor, Error);
    if (centavos >= 0n && centavos <= BigInt(maximoLinhas) * 100n && centavos % 100n === 0n) return Number(centavos / 100n);
  } catch { /* Reportado ao chamador somente pelo código de domínio. */ }
  ctx.addIssue({ code: 'custom', message: 'Inteiro fora da faixa.' });
  return z.NEVER;
});
const manifestoSchema = z.strictObject({
  versao: natural.pipe(z.literal(1)), escopo: z.unknown(), arquivo: z.unknown(), eventos: z.unknown(), configuracao: z.unknown(),
});
const arquivoSchema = z.strictObject({
  merchantId: merchant, competencia, requestId: z.string().refine(requestIdConciliacaoValido),
  sha256: z.string().length(64).toLowerCase().regex(/^[0-9a-f]{64}$/),
  produto: z.literal('IFOOD'), moeda: z.literal('BRL'), linhas: natural, pedidos: natural,
});
const paginaSchema = z.strictObject({
  consulta: z.strictObject({ merchantId: merchant, inicio: dia, fim: dia, page: natural, size: natural.pipe(z.literal(tamanhoPagina)) }),
  corpo: z.string().min(1),
});
const configuracaoSchema = z.strictObject({
  parceiroId: idInterno, lojaId: idInterno, canal: z.literal('IFOOD'), competencia, vigencias: z.unknown(),
});
const vigenciaSchema = z.strictObject({ inicio: dia, fim: dia, comissaoBp: natural, pagamentoBp: natural });

function ler<T>(schema: z.ZodType<T>, valor: unknown, codigo: Codigo): T {
  const resultado = schema.safeParse(valor);
  if (!resultado.success) throw new ErroPacoteFontesFinancial(codigo);
  return resultado.data;
}

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function validarTamanho(bytes: Uint8Array, limite: number, codigo: Codigo): void {
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength) throw new ErroPacoteFontesFinancial(codigo);
  if (bytes.byteLength > limite) throw new ErroPacoteFontesFinancial('LIMITE');
}

function lerManifesto(bytes: Uint8Array) {
  try {
    return ler(manifestoSchema, lerJsonFinancialV3(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), 'MANIFESTO');
  } catch { throw new ErroPacoteFontesFinancial('MANIFESTO'); }
}

function conferirVigencias(valor: unknown, escopo: EscopoFontesFinancial, primeiro: string, ultimo: string) {
  const config = ler(configuracaoSchema, valor, 'VIGENCIAS');
  if (config.parceiroId !== escopo.parceiroId || config.lojaId !== escopo.lojaId || config.competencia !== escopo.competencia) {
    throw new ErroPacoteFontesFinancial('ESCOPO');
  }
  if (!Array.isArray(config.vigencias) || !config.vigencias.length || config.vigencias.length > 31) {
    throw new ErroPacoteFontesFinancial('VIGENCIAS');
  }
  const vigencias: VigenciaFontesFinancial[] = [];
  let proximo: string | null = primeiro;
  for (const candidato of config.vigencias) {
    const faixa = ler(vigenciaSchema, candidato, 'VIGENCIAS');
    // O contrato pode ter começado antes do mês ou continuar no mês seguinte.
    const inicioNoMes = faixa.inicio < primeiro ? primeiro : faixa.inicio;
    const fimNoMes = faixa.fim > ultimo ? ultimo : faixa.fim;
    if (inicioNoMes !== proximo || fimNoMes < inicioNoMes || faixa.comissaoBp + faixa.pagamentoBp >= 10_000) {
      throw new ErroPacoteFontesFinancial('VIGENCIAS');
    }
    proximo = fimNoMes === ultimo ? null : diaSeguinte(fimNoMes);
    vigencias.push(faixa);
  }
  if (proximo !== null) throw new ErroPacoteFontesFinancial('VIGENCIAS');
  const vigenciasSha256 = sha256(JSON.stringify([config.parceiroId, config.lojaId, config.canal, config.competencia, vigencias]));
  return { vigencias, vigenciasSha256 };
}

function conferirEcosDaPagina(pagina: Readonly<Record<string, unknown>>, consulta: z.infer<typeof paginaSchema>['consulta'], mes: string) {
  if ((Object.hasOwn(pagina, 'merchantId') && (typeof pagina.merchantId !== 'string' || pagina.merchantId.toLowerCase() !== consulta.merchantId))
      || (Object.hasOwn(pagina, 'beginDate') && pagina.beginDate !== consulta.inicio)
      || (Object.hasOwn(pagina, 'endDate') && pagina.endDate !== consulta.fim)
      || (Object.hasOwn(pagina, 'competence') && pagina.competence !== mes)
      || (Object.hasOwn(pagina, 'currency') && pagina.currency !== 'BRL')) throw new ErroPacoteFontesFinancial('EVENTOS');
  // O leitor de eventos verifica o recebedor quando informado. A loja da página vem da consulta declarada.
  for (const item of pagina.financialEvents as unknown[]) {
    const evento = objetoPeriodoFinancialV3(item, Error);
    if (evento.amount != null) {
      const valor = objetoPeriodoFinancialV3(evento.amount, Error);
      if (Object.hasOwn(valor, 'currency') && valor.currency !== 'BRL') throw new ErroPacoteFontesFinancial('EVENTOS');
    }
  }
}

function conferirEventos(valor: unknown, escopo: EscopoFontesFinancial) {
  if (!Array.isArray(valor) || !valor.length || valor.length > maximoPaginas) throw new ErroPacoteFontesFinancial('EVENTOS');
  const paginas = [];
  let quantidadeEventos = 0;
  try {
    for (const [indice, candidata] of valor.entries()) {
      const { consulta, corpo } = ler(paginaSchema, candidata, 'EVENTOS');
      if (consulta.page !== indice + 1 || consulta.merchantId !== escopo.merchantId || !janelaDaCompetencia(consulta, escopo.competencia)) {
        throw new ErroPacoteFontesFinancial('EVENTOS');
      }
      if (!corpo.isWellFormed()) throw new ErroPacoteFontesFinancial('EVENTOS');
      const pagina = lerPaginaEventosV3(corpo, consulta, p => conferirEcosDaPagina(p, consulta, escopo.competencia));
      if (pagina.hasNextPage !== (indice < valor.length - 1) || (pagina.hasNextPage && !pagina.eventos.length)) {
        throw new ErroPacoteFontesFinancial('EVENTOS');
      }
      const motivos = new Set<MotivoEventosMensaisV3>();
      somarEventosMensaisV3({ consulta, paginasLidas: 1, eventos: [...pagina.eventos] }, escopo, 'IFOOD', motivos);
      if (motivos.size) throw new ErroPacoteFontesFinancial('EVENTOS');
      quantidadeEventos += pagina.eventos.length;
      paginas.push({ consulta, sha256: sha256(corpo) });
    }
  } catch { throw new ErroPacoteFontesFinancial('EVENTOS'); }
  return { janela: paginas[0].consulta, paginasEventos: paginas.length, quantidadeEventos, eventosSha256: sha256(JSON.stringify(paginas)) };
}

/** Compara fontes entregues manualmente com o escopo obtido no servidor e devolve somente o recibo da conferência. */
export async function prepararPacoteFontesFinancial(
  escopoEsperado: EscopoFontesFinancial, arquivoGzip: Uint8Array, manifestoJson: Uint8Array,
): Promise<ReciboPacoteFontesFinancial> {
  const escopo = ler(escopoSchema, escopoEsperado, 'ESCOPO');
  validarTamanho(arquivoGzip, LIMITE_ARQUIVO_FONTES_FINANCIAL, 'ARQUIVO');
  validarTamanho(manifestoJson, LIMITE_MANIFESTO_FONTES_FINANCIAL, 'MANIFESTO');
  const bytesManifesto = Uint8Array.from(manifestoJson);
  const manifesto = lerManifesto(bytesManifesto);
  // Os dois escopos passam pelo mesmo schema, que projeta as chaves em ordem fixa e normaliza o UUID.
  if (JSON.stringify(ler(escopoSchema, manifesto.escopo, 'ESCOPO')) !== JSON.stringify(escopo)) throw new ErroPacoteFontesFinancial('ESCOPO');
  const arquivo = ler(arquivoSchema, manifesto.arquivo, 'ARQUIVO');
  if (arquivo.merchantId !== escopo.merchantId || arquivo.competencia !== escopo.competencia) throw new ErroPacoteFontesFinancial('ESCOPO');
  let bytes: Uint8Array;
  try { bytes = copiarGzipConciliacaoV3(arquivoGzip); } catch { throw new ErroPacoteFontesFinancial('ARQUIVO'); }
  const arquivoSha256 = sha256(bytes);
  if (arquivoSha256 !== arquivo.sha256) throw new ErroPacoteFontesFinancial('ARQUIVO');
  const { janela, paginasEventos, quantidadeEventos, eventosSha256 } = conferirEventos(manifesto.eventos, escopo);
  const { vigencias, vigenciasSha256 } = conferirVigencias(manifesto.configuracao, escopo, janela.inicio, janela.fim);
  let resumo;
  try { resumo = await conferirConteudoArquivoV3(escopo, bytes, { linhas: arquivo.linhas, pedidos: arquivo.pedidos }, arquivo); }
  catch { throw new ErroPacoteFontesFinancial('ARQUIVO'); }
  if (resumo.linhas > 0 && resumo.valorComImpactoCentavos === null) throw new ErroPacoteFontesFinancial('ARQUIVO');
  const requestIdSha256 = sha256(arquivo.requestId);
  const pacoteSha256 = sha256(JSON.stringify([
    'FINANCIAL_FONTES_MENSAIS_V1', escopo, requestIdSha256, arquivoSha256, eventosSha256, vigenciasSha256,
    arquivo.produto, arquivo.moeda, resumo.linhas, resumo.pedidosDistintos,
  ]));
  return {
    versao: 1, escopo, requestIdSha256, arquivoSha256, manifestoSha256: sha256(bytesManifesto), eventosSha256, vigenciasSha256, pacoteSha256,
    linhasArquivo: resumo.linhas, pedidosDistintos: resumo.pedidosDistintos, paginasEventos, quantidadeEventos, vigencias,
  };
}
