/**
 * Insumos — a parte PURA (sem banco, sem Next): leitura do formulário, rótulos,
 * retrato para o histórico, diferença entre versões e comparação de
 * embalagens. Serve ao servidor (`insumos.ts`, `variantes.ts`) e à prévia da
 * tela. O que vale é sempre o que o servidor calcula a partir do texto.
 */

import { z } from 'zod';
import {
  compararCustos,
  custoDaEmbalagem,
  formatarCusto,
  formatarReaisDaFracao,
  lerDinheiro,
  lerQuantidadeNa,
  UNIDADES,
  type CustoExato,
  type Escala,
  type Unidade,
} from './unidades';

export const TIPOS = {
  INGREDIENTE: 'Ingrediente',
  EMBALAGEM: 'Embalagem',
  MATERIAL: 'Material de limpeza e uso',
  PRE_PREPARO: 'Pré-preparo',
} as const;
export type TipoInsumo = keyof typeof TIPOS;
/** Pré-preparo nasce da ficha técnica (fase 1.3): no formulário, só estes. */
export const TIPOS_DO_FORM = ['INGREDIENTE', 'EMBALAGEM', 'MATERIAL'] as const;

/**
 * I.1b: o que cada tipo FAZ no ERP (o papel do item), dito ao lado da escolha. Tipo não é categoria (a natureza para o CMV) nem
 * conservação (onde fica guardado): é o papel dele na ficha técnica e nas embalagens por canal.
 */
export const AJUDA_DO_TIPO: Readonly<Record<'INGREDIENTE' | 'EMBALAGEM' | 'MATERIAL', string>> = {
  INGREDIENTE: 'Entra nas fichas técnicas e no custo dos pratos.',
  EMBALAGEM: 'Vai na embalagem do delivery e do iFood (custo por canal), não na receita.',
  MATERIAL: 'Detergente, luva, pano, saco de lixo: comprado e estocado, mas não entra em ficha técnica.',
};

/**
 * I.1b: "conservação a confirmar". Até a I.1a o servidor assumia Seco quando nada vinha, então um insumo antigo em Seco pode ser
 * Seco de verdade ou um padrão que ninguém escolheu. Nada é reinterpretado: só aparece na lista, para uma PESSOA confirmar, o
 * que é Seco, ainda sem confirmação, numa categoria que costuma ficar no frio (Proteína, Laticínios, frios e embutidos,
 * Hortifruti). Pré-preparo não conta: a conservação dele vem da ficha.
 */
export const CATEGORIAS_QUE_COSTUMAM_SER_FRIAS = ['PROTEINA', 'LATICINIOS', 'HORTIFRUTI'] as const;
export function conservacaoAConfirmar(i: { tipo: string; conservacao: string; conservacaoConfirmadaEm: Date | string | null; categoriaChave: string | null }): boolean {
  return (
    i.tipo !== 'PRE_PREPARO' &&
    i.conservacao === 'SECO' &&
    !i.conservacaoConfirmadaEm &&
    i.categoriaChave !== null &&
    (CATEGORIAS_QUE_COSTUMAM_SER_FRIAS as readonly string[]).includes(i.categoriaChave)
  );
}
/** O valor do filtro "Conservação" da lista que lista só esses. */
export const FILTRO_A_CONFIRMAR = 'confirmar';

/** I.1b: o limite da marca de referência (texto informativo). */
export const MARCA_MAXIMA = 80;

// Conservações e validade (1.4) moram em `validade.ts`; daqui seguem exportadas para quem já usava.
import { CONSERVACOES, entradaDoFormulario, lerValidades, retratoDaValidade, type Conservacao, type Validades } from './validade';
export { CONSERVACOES, type Conservacao };

export type Erros = Record<string, string>;

const MARCADO = new Set(['on', 'sim', 'true', '1']);
export const marcado = (v: unknown) => typeof v === 'string' && MARCADO.has(v);
const texto = (v: unknown) => (typeof v === 'string' ? v : '');

/**
 * O texto como a pessoa o vê: forma composta (NFC, "í" é uma letra só e não "i" + acento) e sem caracteres invisíveis
 * (largura zero, soft hyphen, marcas de direção, BOM) nem de controle. Sem isso "Farínha" decomposto e "Proteína" com um
 * espaço de largura zero passavam por nomes diferentes dos que parecem iguais.
 */
export function limparTexto(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
}

/** Nome obrigatório (2..max letras, espaços colapsados, sem invisíveis): insumo, embalagem, ficha. */
export function nomeObrigatorio(max: number) {
  return z
    .string({ message: 'Dê um nome.' })
    .transform(limparTexto)
    .pipe(
      z
        .string()
        .trim()
        .min(2, 'Dê um nome com pelo menos 2 letras.')
        .max(max, `Nome longo demais (máx. ${max}).`)
        .transform((s) => s.replace(/\s+/g, ' ')),
    );
}

export function primeiroErroPorCampo(issues: readonly { path: PropertyKey[]; message: string }[]): Erros {
  const erros: Erros = {};
  for (const i of issues) erros[String(i.path[0] ?? 'geral')] ??= i.message;
  return erros;
}

// ------------------------------------------------------------ embalagem

export interface Embalagem {
  conteudoMilesimos: number;
  precoEmbalagemCentavos: number;
  taxaEntregaCentavos: number;
}

/**
 * Conteúdo, preço e frete de uma embalagem (a padrão do insumo ou outra).
 * Texto → inteiro só aqui. Preço vazio sem "Ainda não sei" é erro; marcado,
 * grava 0 (a tela mostra "Custo não informado": 0 é só o sinal de que ninguém
 * informou, nenhuma conta o trata como custo). `oQue`: no insumo o valor é o
 * "custo inicial de referência"; na outra embalagem, o "preço".
 */
export function lerEmbalagem(entrada: Record<string, unknown>, unidade: Unidade, erros: Erros, oQue: 'custo' | 'preço' = 'preço'): Embalagem | null {
  const escala: Escala = entrada.escala === 'menor' ? 'menor' : 'base';
  const u = UNIDADES[unidade];
  const naMenor = escala === 'menor' && unidade !== 'UN';

  const conteudoTxt = texto(entrada.conteudo).trim();
  const conteudoMilesimos = conteudoTxt ? lerQuantidadeNa(conteudoTxt, unidade, escala) : null;
  if (!conteudoTxt) erros.conteudo = `Diga quanto vem na embalagem. Ex.: ${unidade === 'UN' ? '12' : naMenor ? '750' : '5'} ${naMenor ? u.menor : u.sigla}.`;
  else if (conteudoMilesimos === null)
    erros.conteudo = naMenor ? `Em ${u.menor}, só números inteiros. Ex.: 750.` : 'Quantidade inválida. Ex.: 5 ou 0,750.';
  else if (conteudoMilesimos === 0) erros.conteudo = 'A embalagem precisa ter mais que zero.';

  let precoEmbalagemCentavos: number | null = 0;
  if (!marcado(entrada.semPreco)) {
    const precoTxt = texto(entrada.preco).trim();
    precoEmbalagemCentavos = precoTxt ? lerDinheiro(precoTxt) : null;
    const nao = oQue === 'custo' ? 'Ainda não sei o custo' : 'Ainda não sei o preço';
    if (!precoTxt) erros.preco = oQue === 'custo' ? `Informe o custo inicial de referência (o que você paga pela embalagem) ou marque “${nao}”.` : `Informe o preço ou marque “${nao}”.`;
    else if (precoEmbalagemCentavos === null) erros.preco = `${oQue === 'custo' ? 'Custo' : 'Preço'} inválido. Ex.: 89,90.`;
    else if (precoEmbalagemCentavos === 0) erros.preco = `${oQue === 'custo' ? 'Custo zero' : 'Preço zero'}? Se ainda não sabe, marque “${nao}”.`;
  }

  const freteTxt = texto(entrada.frete).trim();
  const taxaEntregaCentavos = freteTxt ? lerDinheiro(freteTxt) : 0;
  if (taxaEntregaCentavos === null) erros.frete = 'Frete inválido. Ex.: 5,00 (deixe vazio se não paga frete).';

  if (!conteudoMilesimos || precoEmbalagemCentavos === null || taxaEntregaCentavos === null) return null;
  if (erros.preco) return null;
  return { conteudoMilesimos, precoEmbalagemCentavos, taxaEntregaCentavos };
}

// --------------------------------------------------------------- insumo

/** I.1a: o que falta é dito campo a campo; a categoria não tem valor padrão (a pessoa escolhe, ou aceita a sugestão). */
export const FRASE_SEM_CATEGORIA = 'Escolha a categoria do insumo: é ela que diz onde o custo dele entra no CMV.';
export const FRASE_SEM_UNIDADE = 'Escolha a unidade base: como você controla o estoque e como a ficha usa o insumo.';

const formInsumo = z.object({
  nome: nomeObrigatorio(80),
  tipo: z.enum(['INGREDIENTE', 'EMBALAGEM', 'MATERIAL', 'PRE_PREPARO'], { message: 'Escolha o tipo.' }).default('INGREDIENTE'),
  unidade: z.enum(['KG', 'L', 'UN'], { message: FRASE_SEM_UNIDADE }),
  categoriaId: z
    .string({ message: FRASE_SEM_CATEGORIA })
    .trim()
    .min(1, FRASE_SEM_CATEGORIA)
    .max(60, FRASE_SEM_CATEGORIA),
  // I.1b: marca de referência, opcional. Vazia = sem marca; só espaços ou invisíveis também. Nunca bloqueia nada.
  marcaReferencia: z
    .string()
    .transform(limparTexto)
    .pipe(
      z
        .string()
        .transform((s) => s.replace(/\s+/g, ' ').trim())
        .pipe(z.string().max(MARCA_MAXIMA, `Marca longa demais (máx. ${MARCA_MAXIMA} letras).`)),
    )
    .optional()
    .transform((s) => (s ? s : null)),
});

/** A chave que o formulário manda para o servidor reconhecer o reenvio (um UUID por montagem do formulário). */
const CHAVE_DE_ENVIO = /^[A-Za-z0-9_-]{8,80}$/;
/** Chave ausente = quem chama não pediu idempotência (seed, testes); presente mas torta é erro. */
export function lerChaveDeEnvio(v: unknown): { ok: true; chave: string | null } | { ok: false } {
  if (v === undefined || v === null || v === '') return { ok: true, chave: null };
  return typeof v === 'string' && CHAVE_DE_ENVIO.test(v) ? { ok: true, chave: v } : { ok: false };
}

export interface DadosInsumo extends Embalagem {
  nome: string;
  tipo: TipoInsumo;
  unidade: Unidade;
  /** I.1a: a categoria (id) que o formulário escolheu; o servidor confere que existe, é do parceiro e está ativa. */
  categoriaId?: string;
  /** I.1a: o nome da categoria, só para o retrato do histórico. */
  categoriaNome?: string | null;
  /** I.1b: a marca de referência (texto informativo, opcional); null = sem marca. */
  marcaReferencia?: string | null;
  /** A principal (onde se guarda); é `validades.principal`. */
  conservacao: Conservacao;
  /** 1.4: validade por conservação (minutos); sem nenhuma = não informada. */
  validades: Validades;
}

export type Leitura<T> = { ok: true; dados: T } | { ok: false; erros: Erros };

/**
 * Formulário do insumo → dados prontos para gravar. `tipoAtual` (editar): um
 * pré-preparo continua pré-preparo; nenhum outro vira pré-preparo pelo
 * formulário (nasce da ficha técnica, fase 1.3).
 */
export function lerFormInsumo(entrada: Record<string, unknown>, tipoAtual?: TipoInsumo): Leitura<DadosInsumo> {
  const vazio = (v: unknown) => (v === '' ? undefined : v);
  const r = formInsumo.safeParse({
    nome: entrada.nome,
    tipo: vazio(entrada.tipo),
    unidade: vazio(entrada.unidade),
    categoriaId: entrada.categoriaId,
    marcaReferencia: typeof entrada.marcaReferencia === 'string' ? entrada.marcaReferencia : undefined,
  });
  const erros: Erros = r.success ? {} : primeiroErroPorCampo(r.error.issues);
  // 1.4: conservação principal + validade em cada uma que o insumo aceita (opcionais). I.1b: a principal é escolhida, nunca assumida.
  const v = lerValidades(entradaDoFormulario((k) => (k === 'conservacao' ? vazio(entrada.conservacao) : entrada[k])), 'insumo');
  if (!v.ok) Object.assign(erros, v.erros);
  if (r.success) {
    if (tipoAtual === 'PRE_PREPARO' && r.data.tipo !== 'PRE_PREPARO') {
      erros.tipo = 'Pré-preparo continua pré-preparo: ele nasce da ficha técnica.';
    } else if (tipoAtual !== 'PRE_PREPARO' && r.data.tipo === 'PRE_PREPARO') {
      erros.tipo = 'Pré-preparo nasce da ficha técnica: em Fichas técnicas, crie a receita como pré-preparo.';
    }
  }
  const unidade = r.success ? r.data.unidade : (['KG', 'L', 'UN'] as const).find((u) => u === entrada.unidade);
  const embalagem = unidade ? lerEmbalagem(entrada, unidade, erros, 'custo') : null;
  if (!r.success || !embalagem || !v.ok || !v.validades || Object.keys(erros).length > 0) return { ok: false, erros };
  return { ok: true, dados: { ...r.data, ...embalagem, conservacao: v.validades.principal, validades: v.validades } };
}

// ------------------------------------------------------------- variante

const formVariante = z.object({
  nome: nomeObrigatorio(60),
  codigoBarras: z
    .string()
    .trim()
    .transform((s) => s.replace(/\s+/g, ''))
    .refine((s) => s === '' || /^\d{8,14}$/.test(s), 'Código de barras tem de 8 a 14 números.')
    .default(''),
});

export interface DadosVariante extends Embalagem {
  nome: string;
  codigoBarras: string | null;
}

/** Outra embalagem de compra do mesmo insumo: conteúdo na unidade DO INSUMO. */
export function lerFormVariante(entrada: Record<string, unknown>, unidade: Unidade): Leitura<DadosVariante> {
  const r = formVariante.safeParse({ nome: entrada.nome, codigoBarras: entrada.codigoBarras ?? undefined });
  const erros: Erros = r.success ? {} : primeiroErroPorCampo(r.error.issues);
  const embalagem = lerEmbalagem(entrada, unidade, erros);
  if (!r.success || !embalagem || Object.keys(erros).length > 0) return { ok: false, erros };
  return { ok: true, dados: { nome: r.data.nome, codigoBarras: r.data.codigoBarras || null, ...embalagem } };
}

// ------------------------------------------------- histórico e versões

/** Custo exato como vai para o JSON do histórico (tipo literal: cabe em `JsonValue`). */
type CustoNoJson = { centavos: number; milesimos: number };
export type Retrato = Record<string, string | number | boolean | null | CustoNoJson>;

/**
 * O que vai para o histórico de um insumo. Leva o custo de referência EXATO do
 * momento (a fração reduzida, nunca um centavo arredondado: R$ 4,00 por 1000 un
 * não vira "0") e a unidade, que formata a embalagem ("5 kg").
 */
export function retratoDoInsumo(i: DadosInsumo & { ativo?: boolean }): Retrato {
  return {
    nome: i.nome,
    tipo: i.tipo,
    // I.1a: a categoria no nome (o que a tela mostra) e no id (o que o "excluir categoria" confere); fora do retrato
    // quando o insumo ainda não tem (o antigo): a ausência não é uma mudança.
    ...(i.categoriaId ? { categoria: i.categoriaNome ?? null, categoriaId: i.categoriaId } : {}),
    unidade: i.unidade,
    conservacao: i.conservacao,
    // I.1b: no insumo COMPRADO é o prazo de uso após abertura (a validade do pré-preparo é a da ficha: outra chave, outro rótulo).
    prazoAposAbertura: retratoDaValidade(i.validades),
    conteudoMilesimos: i.conteudoMilesimos,
    precoEmbalagemCentavos: i.precoEmbalagemCentavos,
    taxaEntregaCentavos: i.taxaEntregaCentavos,
    custoPorUnidade: custoDaEmbalagem(i.precoEmbalagemCentavos, i.taxaEntregaCentavos, i.conteudoMilesimos),
    // I.1b: sempre no retrato (null = sem marca): tirar a marca também é uma mudança que o histórico mostra.
    marcaReferencia: i.marcaReferencia ?? null,
  };
}

export function retratoDaVariante(v: DadosVariante, insumo: { nome: string; unidade: Unidade }): Retrato {
  return {
    insumo: insumo.nome,
    nome: v.nome,
    unidade: insumo.unidade,
    conteudoMilesimos: v.conteudoMilesimos,
    precoEmbalagemCentavos: v.precoEmbalagemCentavos,
    taxaEntregaCentavos: v.taxaEntregaCentavos,
    custoPorUnidade: custoDaEmbalagem(v.precoEmbalagemCentavos, v.taxaEntregaCentavos, v.conteudoMilesimos),
    codigoBarras: v.codigoBarras,
  };
}

/** Campos que identificam a linha no histórico: vão nos dois lados mesmo sem mudar. */
const CONTEXTO = ['insumo', 'nome', 'unidade', 'alvo', 'faturamentoLojaId', 'faturamentoDia'];

/**
 * Antes e depois só com o que mudou (mais o contexto: nome e unidade, para a
 * linha do histórico dizer de quem é e formatar a quantidade). null = nada mudou.
 */
export function diferenca(antes: Retrato, depois: Retrato): { antes: Retrato; depois: Retrato; campos: string[] } | null {
  // `insumo` (na embalagem) é só de quem ela é: renomear o insumo não muda a embalagem.
  const mudaram = Object.keys(depois).filter(
    (k) => k !== 'insumo' && JSON.stringify(antes[k] ?? null) !== JSON.stringify(depois[k] ?? null),
  );
  if (mudaram.length === 0) return null;
  const a: Retrato = {};
  const d: Retrato = {};
  for (const k of [...CONTEXTO.filter((k) => k in depois), ...mudaram]) {
    a[k] = antes[k] ?? null;
    d[k] = depois[k] ?? null;
  }
  return { antes: a, depois: d, campos: mudaram };
}

/**
 * Versão de uma embalagem (variante não tem `atualizadoEm`): uma impressão
 * dos valores lidos. O formulário devolve a que leu; se a de agora for outra,
 * alguém mudou no meio do caminho.
 */
export function versaoDaVariante(v: {
  nome: string;
  conteudoMilesimos: number;
  precoEmbalagemCentavos: number;
  taxaEntregaCentavos: number;
  codigoBarras: string | null;
  ativo: boolean;
}): string {
  const s = JSON.stringify([v.nome, v.conteudoMilesimos, v.precoEmbalagemCentavos, v.taxaEntregaCentavos, v.codigoBarras, v.ativo]);
  // FNV-1a 32 bits: só para comparar, não é segredo.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(36)}.${s.length}`;
}

// ---------------------------------------------------- comparar embalagens

export interface EmbalagemComparada {
  nome: string;
  custo: CustoExato | null;
}

/**
 * Qual embalagem sai mais barata por unidade, em texto. Só entra quem tem
 * preço; sem duas com preço, não há comparação (e a frase diz isso). Ordem e
 * diferença pelo custo EXATO (multiplicação cruzada): 1000 un por R$ 4,00 e
 * 5000 un por R$ 15,00 não "empatam em R$ 0,00".
 */
export function compararEmbalagens(lista: EmbalagemComparada[], unidade: Unidade): string | null {
  if (lista.length < 2) return null;
  const comPreco = lista.filter((e): e is { nome: string; custo: CustoExato } => e.custo !== null);
  if (comPreco.length < 2) return 'Falta preço para comparar as embalagens.';
  const ordenada = [...comPreco].sort((a, b) => compararCustos(a.custo, b.custo));
  const barata = ordenada[0];
  const cara = ordenada[ordenada.length - 1];
  if (compararCustos(barata.custo, cara.custo) === 0) {
    return `As embalagens saem pelo mesmo custo: ${formatarCusto(barata.custo, unidade)}.`;
  }
  // Diferença por unidade base = 1000 × (c/m da cara − c/m da barata), exata.
  const num =
    1000n * (BigInt(cara.custo.centavos) * BigInt(barata.custo.milesimos) - BigInt(barata.custo.centavos) * BigInt(cara.custo.milesimos));
  const den = BigInt(cara.custo.milesimos) * BigInt(barata.custo.milesimos);
  const diferenca = formatarReaisDaFracao(num, den);
  return `“${barata.nome}” sai mais barata: ${formatarCusto(barata.custo, unidade)}, ${diferenca} a menos por ${UNIDADES[unidade].sigla} que “${cara.nome}” (${formatarCusto(cara.custo, unidade)}).`;
}

// --------------------------------------------------------- filtros da lista

export type Situacao = 'ativos' | 'desativados' | 'todos';

export interface FiltrosDeInsumo {
  q: string;
  tipo: TipoInsumo | null;
  /**
   * I.1a: 'sem' = ainda sem categoria; 'revisar' = sem categoria ou em "Outros / a classificar" (a fila de revisão); um id =
   * os dessa categoria. Valor torto na URL cai em null (todas).
   */
  categoria: string | null;
  /** Uma conservação, ou `FILTRO_A_CONFIRMAR` (os Seco ainda não confirmados de Proteína, Laticínios e Hortifruti). */
  conservacao: Conservacao | typeof FILTRO_A_CONFIRMAR | null;
  situacao: Situacao;
  semPreco: boolean;
  /** L.1: a marca de referência (sem diferenciar caixa) ou `FILTRO_SEM_MARCA` (os que não têm marca informada). */
  marca: string | null;
  /** L.1: só os de cadastro incompleto (ver `motivosDoCadastro`). Custo não informado NÃO conta: tem o filtro dele (`semPreco`). */
  incompleto: boolean;
  ordem: 'nome' | 'custo';
  direcao: 'asc' | 'desc';
  pagina: number;
  /** L.1: itens por página, só um dos valores de `OPCOES_POR_PAGINA` (o servidor valida; valor torto cai no padrão). */
  porPagina: number;
}

/** L.1: as quantidades por página que a lista oferece. São quantidades (10 itens, 25 itens...), não intervalos. */
export const OPCOES_POR_PAGINA = [10, 25, 50, 100] as const;
export const POR_PAGINA_PADRAO = 50;

/** O valor do filtro "Marca" que lista só os insumos sem marca informada. */
export const FILTRO_SEM_MARCA = 'sem-marca';

/** `por` da URL ou do formulário -> uma das opções; qualquer outra coisa (texto, negativo, 1000, 25.5) cai no padrão. */
export function lerPorPagina(v: unknown): number {
  const n = typeof v === 'string' && /^\d{1,4}$/.test(v) ? Number(v) : typeof v === 'number' ? v : NaN;
  return (OPCOES_POR_PAGINA as readonly number[]).includes(n) ? n : POR_PAGINA_PADRAO;
}

/**
 * L.1: por que um insumo está com o cadastro incompleto (derivado na leitura; nada é gravado). Custo não informado é outra coisa e
 * NÃO entra aqui. "Sem unidade" e "sem a quantidade da embalagem" não existem: a unidade base é coluna obrigatória e a quantidade
 * tem CHECK maior que zero no banco, então nenhum insumo fica sem elas. O filtro do banco (`insumos.ts`) e esta função saem da
 * mesma lista; um teste confere que concordam insumo a insumo.
 */
export const MOTIVOS_DE_CADASTRO_INCOMPLETO = {
  'sem-categoria': 'Sem categoria',
  'a-classificar': 'Categoria a classificar (Outros)',
  conservacao: 'Conservação a confirmar',
  validade: 'Validade do pré-preparo não informada (na ficha)',
} as const;
export type MotivoIncompleto = keyof typeof MOTIVOS_DE_CADASTRO_INCOMPLETO;
/** A chave da categoria do sistema "Outros / a classificar" (a mesma de `CHAVE_DO_SISTEMA`; aqui por causa da ordem dos imports). */
const CHAVE_OUTROS = 'OUTROS';

export function motivosDoCadastro(i: {
  tipo: string;
  categoriaChave: string | null;
  temCategoria: boolean;
  conservacao: string;
  conservacaoConfirmadaEm: Date | string | null;
  /** Pré-preparo cuja ficha ainda não diz a validade (a conservação dele vem da ficha). */
  preparoSemValidade: boolean;
}): MotivoIncompleto[] {
  const m: MotivoIncompleto[] = [];
  if (!i.temCategoria) m.push('sem-categoria');
  else if (i.categoriaChave === CHAVE_OUTROS) m.push('a-classificar');
  if (conservacaoAConfirmar({ tipo: i.tipo, conservacao: i.conservacao, conservacaoConfirmadaEm: i.conservacaoConfirmadaEm, categoriaChave: i.categoriaChave })) m.push('conservacao');
  if (i.preparoSemValidade) m.push('validade');
  return m;
}

export const FILTROS_PADRAO: FiltrosDeInsumo = {
  q: '',
  tipo: null,
  categoria: null,
  conservacao: null,
  situacao: 'ativos',
  semPreco: false,
  marca: null,
  incompleto: false,
  ordem: 'nome',
  direcao: 'asc',
  pagina: 1,
  porPagina: POR_PAGINA_PADRAO,
};


/** Um valor de uma lista fechada (vindo da URL ou do formulário); fora dela, null. */
export const um = <T extends string>(v: unknown, lista: readonly T[]): T | null =>
  typeof v === 'string' && (lista as readonly string[]).includes(v) ? (v as T) : null;

/**
 * Filtros da lista lidos da URL (o estado mora na URL: voltar do detalhe e
 * mandar o link já filtrado funcionam). Valor desconhecido cai no padrão.
 */
export function lerFiltros(sp: Record<string, string | string[] | undefined>): FiltrosDeInsumo {
  const v = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]);
  return {
    q: (v('q') ?? '').trim().slice(0, 80),
    tipo: um(v('tipo'), Object.keys(TIPOS) as TipoInsumo[]),
    categoria: ((c) => (c && /^[A-Za-z0-9_-]{1,40}$/.test(c) ? c : null))(v('categoria')),
    conservacao: um(v('conservacao'), [...(Object.keys(CONSERVACOES) as Conservacao[]), FILTRO_A_CONFIRMAR]),
    situacao: um(v('situacao'), ['ativos', 'desativados', 'todos'] as const) ?? 'ativos',
    semPreco: v('preco') === 'sem',
    marca: lerMarcaDoFiltro(v('marca')),
    incompleto: v('incompleto') === '1',
    ordem: um(v('ordem'), ['nome', 'custo'] as const) ?? 'nome',
    direcao: um(v('dir'), ['asc', 'desc'] as const) ?? 'asc',
    // Página absurda (texto, negativa, gigante) vira número seguro; o servidor ainda ajusta à última página que existe.
    pagina: ((n) => (Number.isSafeInteger(n) && n > 0 ? Math.min(n, 1_000_000) : 1))(Math.trunc(Number(v('pagina')))),
    porPagina: lerPorPagina(v('por')),
  };
}

/** A marca do filtro: texto limpo (sem invisíveis, espaços colapsados, até `MARCA_MAXIMA`); vazio = sem filtro. */
function lerMarcaDoFiltro(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = limparTexto(v).replace(/\s+/g, ' ').trim().slice(0, MARCA_MAXIMA);
  return t || null;
}

/**
 * L.1: o "de volta para a lista" que viaja num formulário ou numa URL (`de=`). É dado de fora: só os filtros que a lista
 * conhece voltam (os outros somem), então nunca vira endereço, só texto de busca já normalizado.
 */
export function deSeguro(valor: unknown): string {
  if (typeof valor !== 'string' || valor.length > 600) return '';
  return queryDosFiltros(lerFiltros(Object.fromEntries(new URLSearchParams(valor))));
}

/** Os filtros de volta para a URL, só o que difere do padrão. */
export function queryDosFiltros(f: FiltrosDeInsumo): string {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.tipo) p.set('tipo', f.tipo);
  if (f.categoria) p.set('categoria', f.categoria);
  if (f.conservacao) p.set('conservacao', f.conservacao);
  if (f.situacao !== 'ativos') p.set('situacao', f.situacao);
  if (f.semPreco) p.set('preco', 'sem');
  if (f.marca) p.set('marca', f.marca);
  if (f.incompleto) p.set('incompleto', '1');
  if (f.ordem !== 'nome') p.set('ordem', f.ordem);
  if (f.direcao !== 'asc') p.set('dir', f.direcao);
  if (f.porPagina !== POR_PAGINA_PADRAO) p.set('por', String(f.porPagina));
  if (f.pagina > 1) p.set('pagina', String(f.pagina));
  return p.toString();
}

/** Há algum filtro (além da ordem e da página)? Serve ao "Limpar filtros". */
export function temFiltro(f: FiltrosDeInsumo): boolean {
  return !!(f.q || f.tipo || f.categoria || f.conservacao || f.situacao !== 'ativos' || f.semPreco || f.marca || f.incompleto);
}
