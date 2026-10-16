/**
 * Ficha técnica (1.2) — a parte PURA (sem banco, sem Next): leitura do
 * formulário (o mesmo leitor serve à planilha), rendimento, custo exato da
 * receita, retrato para o histórico e filtros da lista. Serve ao servidor
 * (`fichas.ts`, `ficha-importar.ts`) e à prévia da tela; o que vale é o que o
 * servidor calcula a partir do texto.
 *
 * Ficha é a RECEITA: Prato (rende N porções) ou Pré-preparo (rende kg, L ou
 * un). Item = insumo + quantidade LÍQUIDA em milésimos da unidade base do
 * insumo, digitada em g/kg, ml/L ou un. O custo nunca é gravado: é a soma
 * exata (fração) de custo de referência × quantidade × fator de correção, e
 * só arredonda na tela. Insumo "Sem preço" deixa o custo INCOMPLETO (nunca
 * vira R$ 0,00). Subficha e fator de correção na tela são da 1.3; o esquema e
 * a conta já os recebem.
 */

import { z } from 'zod';
import { marcado, nomeObrigatorio, primeiroErroPorCampo, um, type Erros, type Leitura, type Retrato } from './insumo-campos';
import {
  custoDaEmbalagem,
  custoExatoDaQuantidade,
  escalaDaSigla,
  formatarFracao,
  formatarQuantidade,
  lerInteiro,
  lerQuantidadeNa,
  porRendimento,
  somar,
  UNIDADES,
  ZERO,
  type CustoExato,
  type Fracao,
  type Unidade,
} from './unidades';

export const TIPOS_DE_FICHA = {
  PRATO: 'Prato',
  PRE_PREPARO: 'Pré-preparo',
} as const;
export type TipoFicha = keyof typeof TIPOS_DE_FICHA;

export const LIMITES_DA_FICHA = { nome: 80, descricao: 280, modoPreparo: 4000, itens: 60 } as const;

/**
 * Em que a ficha rende, como a pessoa escolhe na tela: Prato em porções
 * (inteiras); Pré-preparo em kg/g, L/ml ou un. Vira `unidadeRendimento` +
 * milésimos no servidor.
 */
export const RENDE_EM = {
  porcao: { unidade: 'UN', escala: 'base', rotulo: 'porções' },
  kg: { unidade: 'KG', escala: 'base', rotulo: 'kg' },
  g: { unidade: 'KG', escala: 'menor', rotulo: 'g' },
  L: { unidade: 'L', escala: 'base', rotulo: 'L' },
  ml: { unidade: 'L', escala: 'menor', rotulo: 'ml' },
  un: { unidade: 'UN', escala: 'base', rotulo: 'un' },
} as const;
export type RendeEm = keyof typeof RENDE_EM;
export const RENDE_DO_PREPARO: readonly RendeEm[] = ['kg', 'g', 'L', 'ml', 'un'];

/** Insumo como a ficha precisa dele (para converter e custear). */
export interface InsumoDaFicha {
  id: string;
  nome: string;
  unidade: Unidade;
  ativo: boolean;
  conteudoMilesimos: number;
  precoEmbalagemCentavos: number;
  taxaEntregaCentavos: number;
}

export interface ItemDigitado {
  insumoId: string;
  /** Texto, como digitado ("180", "1,5"). */
  quantidade: string;
  /** Sigla digitada: g, kg, ml, L ou un. */
  unidade: string;
}

/** O que chega do formulário (ou da planilha, já casada com os doCadastro). */
export interface EntradaDaFicha {
  nome?: unknown;
  tipo?: unknown;
  descricao?: unknown;
  modoPreparo?: unknown;
  rendimento?: unknown;
  rendimentoUnidade?: unknown;
  itens: ItemDigitado[];
}

export interface DadosFicha {
  nome: string;
  tipo: TipoFicha;
  descricao: string | null;
  modoPreparo: string | null;
  rendimentoMilesimos: number;
  unidadeRendimento: Unidade;
  itens: { insumoId: string; quantidadeMilesimos: number }[];
}

const texto = (v: unknown) => (typeof v === 'string' ? v : '');

/** Texto livre: espaço sobrando sai, quebra de linha fica (modo de preparo é passo a passo). */
function textoLivre(v: unknown): string | null {
  const t = texto(v)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return t || null;
}

const formFicha = z.object({
  nome: nomeObrigatorio(LIMITES_DA_FICHA.nome),
  tipo: z.enum(['PRATO', 'PRE_PREPARO'], { message: 'Escolha se é prato ou pré-preparo.' }),
});

/** Rótulo da linha do item no resumo de erros e na mensagem ("Item 2"). */
export const chaveDoItem = (i: number) => `item-${i}`;

/**
 * Formulário (ou planilha) → dados prontos para gravar. `insumos` = os do
 * parceiro que a entrada cita (o servidor lê pelo portão: insumo de outro
 * parceiro simplesmente não está no mapa). Insumo desativado só fica se já
 * estava nesta ficha (`jaNaFicha`).
 */
export function lerFormFicha(
  entrada: EntradaDaFicha,
  doCadastro: ReadonlyMap<string, InsumoDaFicha>,
  jaNaFicha: ReadonlySet<string> = new Set(),
): Leitura<DadosFicha> {
  const r = formFicha.safeParse({ nome: entrada.nome, tipo: entrada.tipo || 'PRATO' });
  const erros: Erros = r.success ? {} : primeiroErroPorCampo(r.error.issues);
  const tipo: TipoFicha = r.success ? r.data.tipo : entrada.tipo === 'PRE_PREPARO' ? 'PRE_PREPARO' : 'PRATO';

  const descricao = textoLivre(entrada.descricao)?.replace(/\s+/g, ' ') ?? null;
  if (descricao && descricao.length > LIMITES_DA_FICHA.descricao) {
    erros.descricao = `Descrição curta: até ${LIMITES_DA_FICHA.descricao} letras (o passo a passo vai no modo de preparo).`;
  }
  const modoPreparo = textoLivre(entrada.modoPreparo);
  if (modoPreparo && modoPreparo.length > LIMITES_DA_FICHA.modoPreparo) {
    erros.modoPreparo = `Modo de preparo longo demais (máx. ${LIMITES_DA_FICHA.modoPreparo} letras).`;
  }

  // Rendimento.
  const rendeEm = tipo === 'PRATO' ? 'porcao' : um(entrada.rendimentoUnidade, RENDE_DO_PREPARO);
  const rendeTxt = texto(entrada.rendimento).trim() || (tipo === 'PRATO' ? '1' : '');
  let rendimentoMilesimos: number | null = null;
  if (!rendeEm) erros.rendimento = 'Diga em que o pré-preparo rende: kg, g, L, ml ou un.';
  else if (!rendeTxt) erros.rendimento = 'Diga quanto a receita rende. Ex.: 2,5 kg.';
  else if (rendeEm === 'porcao') {
    const n = lerInteiro(rendeTxt);
    if (n === null || n === 0) erros.rendimento = 'Porções em número inteiro, maior que zero. Ex.: 1 ou 4.';
    else if (n > 1000) erros.rendimento = 'Mais de 1.000 porções? Confira o número.';
    else rendimentoMilesimos = n * 1000;
  } else {
    const { unidade, escala } = RENDE_EM[rendeEm];
    const q = lerQuantidadeNa(rendeTxt, unidade, escala);
    if (q === null) erros.rendimento = escala === 'menor' ? `Em ${RENDE_EM[rendeEm].rotulo}, só números inteiros.` : 'Rendimento inválido. Ex.: 2,5.';
    else if (q === 0) erros.rendimento = 'O rendimento precisa ser maior que zero.';
    else rendimentoMilesimos = q;
  }

  // Itens.
  const itens: DadosFicha['itens'] = [];
  const vistos = new Map<string, number>();
  if (entrada.itens.length === 0) erros.itens = 'Inclua pelo menos um insumo na ficha.';
  if (entrada.itens.length > LIMITES_DA_FICHA.itens) erros.itens = `Até ${LIMITES_DA_FICHA.itens} insumos por ficha.`;
  entrada.itens.slice(0, LIMITES_DA_FICHA.itens).forEach((item, i) => {
    const chave = chaveDoItem(i);
    const insumo = item.insumoId ? doCadastro.get(item.insumoId) : undefined;
    if (!item.insumoId) return void (erros[chave] = 'Escolha o insumo.');
    if (!insumo) return void (erros[chave] = 'Insumo não encontrado neste cadastro.');
    if (!insumo.ativo && !jaNaFicha.has(insumo.id)) {
      return void (erros[chave] = `“${insumo.nome}” está desativado: reative em Insumos para usar.`);
    }
    const repetido = vistos.get(insumo.id);
    if (repetido !== undefined) return void (erros[chave] = `“${insumo.nome}” já está na ficha (item ${repetido + 1}).`);
    vistos.set(insumo.id, i);
    const u = UNIDADES[insumo.unidade];
    const escala = escalaDaSigla(item.unidade, insumo.unidade);
    if (!escala) {
      const aceitas = insumo.unidade === 'UN' ? 'un' : `${u.menor} ou ${u.sigla}`;
      return void (erros[chave] = `“${insumo.nome}” é medido em ${u.nome.toLowerCase()}: use ${aceitas}.`);
    }
    const qTxt = item.quantidade.trim();
    const q = qTxt ? lerQuantidadeNa(qTxt, insumo.unidade, escala) : null;
    if (!qTxt) return void (erros[chave] = `Diga quanto de “${insumo.nome}” vai na receita.`);
    if (q === null) {
      return void (erros[chave] =
        escala === 'menor' ? `Em ${u.menor}, só números inteiros (1 ${u.menor} é o menor passo).` : 'Quantidade inválida. Ex.: 180 ou 0,5.');
    }
    if (q === 0) return void (erros[chave] = 'A quantidade precisa ser maior que zero.');
    itens.push({ insumoId: insumo.id, quantidadeMilesimos: q });
  });

  if (!r.success || rendimentoMilesimos === null || Object.keys(erros).length > 0) return { ok: false, erros };
  return {
    ok: true,
    dados: {
      nome: r.data.nome,
      tipo,
      descricao,
      modoPreparo,
      rendimentoMilesimos,
      unidadeRendimento: RENDE_EM[rendeEm!].unidade,
      itens,
    },
  };
}

// ------------------------------------------------------------ rendimento

/** "1 porção", "4 porções", "2,5 kg", "750 ml". */
export function formatarRendimento(milesimos: number, unidade: Unidade, tipo: TipoFicha): string {
  if (tipo === 'PRATO' && unidade === 'UN') {
    const n = milesimos / 1000;
    return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${n === 1 ? 'porção' : 'porções'}`;
  }
  return formatarQuantidade(milesimos, unidade);
}

/** "por porção", "por kg", "por L", "por un": o custo de uma unidade de rendimento. */
export function porUnidadeDeRendimento(unidade: Unidade, tipo: TipoFicha): string {
  return tipo === 'PRATO' && unidade === 'UN' ? 'por porção' : `por ${UNIDADES[unidade].sigla}`;
}

/** Rendimento gravado → o que volta para o campo (texto + em que rende). */
export function rendimentoParaCampo(milesimos: number, unidade: Unidade, tipo: TipoFicha): { texto: string; em: RendeEm } {
  if (tipo === 'PRATO') return { texto: String(Math.trunc(milesimos / 1000)), em: 'porcao' };
  const menor = unidade !== 'UN' && milesimos < 1000;
  const em: RendeEm = unidade === 'KG' ? (menor ? 'g' : 'kg') : unidade === 'L' ? (menor ? 'ml' : 'L') : 'un';
  if (menor) return { texto: String(milesimos), em };
  const inteiro = Math.trunc(milesimos / 1000);
  const resto = milesimos % 1000;
  return { texto: `${inteiro}${resto ? ',' + String(resto).padStart(3, '0').replace(/0+$/, '') : ''}`, em };
}

/** Item gravado → campo: 180 milésimos de KG = "180" g; 1500 = "1,5" kg; un = "2" un. */
export function itemParaCampo(milesimos: number, unidade: Unidade): { quantidade: string; unidade: string } {
  const u = UNIDADES[unidade];
  if (unidade !== 'UN' && milesimos < 1000) return { quantidade: String(milesimos), unidade: u.menor };
  const inteiro = Math.trunc(milesimos / 1000);
  const resto = milesimos % 1000;
  return { quantidade: `${inteiro}${resto ? ',' + String(resto).padStart(3, '0').replace(/0+$/, '') : ''}`, unidade: u.sigla };
}

// ----------------------------------------------------------------- custo

export interface ItemParaCusto {
  nome: string;
  quantidadeMilesimos: number;
  fatorCorrecaoMilesimos: number;
  /** Custo de referência do insumo; null = "Sem preço". */
  custo: CustoExato | null;
}

export interface CustoDaFicha {
  /** Soma exata dos itens COM preço. */
  total: Fracao;
  /** Total ÷ rendimento (uma porção, 1 kg...). */
  porRendimento: Fracao;
  /** Custo de cada item, na ordem; null = sem preço. */
  itens: (Fracao | null)[];
  /** Nomes dos insumos sem preço: com algum, o custo é INCOMPLETO. */
  semPreco: string[];
}

export function custoDoInsumo(i: Pick<InsumoDaFicha, 'precoEmbalagemCentavos' | 'taxaEntregaCentavos' | 'conteudoMilesimos'>): CustoExato | null {
  return custoDaEmbalagem(i.precoEmbalagemCentavos, i.taxaEntregaCentavos, i.conteudoMilesimos);
}

/**
 * Custo da receita: Σ custo × quantidade × fator, em fração exata, e o custo
 * de uma unidade de rendimento. Nada se arredonda aqui.
 */
export function custoDaFicha(itens: readonly ItemParaCusto[], rendimentoMilesimos: number): CustoDaFicha {
  let total = ZERO;
  const semPreco: string[] = [];
  const porItem = itens.map((i) => {
    if (!i.custo) {
      semPreco.push(i.nome);
      return null;
    }
    const v = custoExatoDaQuantidade(i.custo, i.quantidadeMilesimos, i.fatorCorrecaoMilesimos);
    total = somar(total, v);
    return v;
  });
  return { total, porRendimento: porRendimento(total, rendimentoMilesimos), itens: porItem, semPreco };
}

/**
 * A conta da ficha, por extenso: "R$ 12,34 ÷ 4 porções = R$ 3,09 por porção".
 * Incompleto: diz que é parcial e o que falta.
 */
export function contaDaFicha(c: CustoDaFicha, rendimentoMilesimos: number, unidade: Unidade, tipo: TipoFicha): string {
  const conta = `${formatarFracao(c.total)} ÷ ${formatarRendimento(rendimentoMilesimos, unidade, tipo)} = ${formatarFracao(c.porRendimento)} ${porUnidadeDeRendimento(unidade, tipo)}`;
  if (c.semPreco.length === 0) return conta;
  const faltam = c.semPreco.length === 1 ? `“${c.semPreco[0]}”` : `${c.semPreco.length} insumos`;
  return `${conta}, sem contar ${faltam} (sem preço).`;
}

// ------------------------------------------------------------- histórico

/** "Pão brioche 1 un · Blend bovino 180 g": os itens numa frase, na ordem da ficha. */
export function itensEmTexto(itens: readonly { nome: string; unidade: Unidade; quantidadeMilesimos: number }[]): string {
  return itens.map((i) => `${i.nome} ${formatarQuantidade(i.quantidadeMilesimos, i.unidade)}`).join(' · ');
}

/**
 * O que vai para o histórico de uma ficha: os campos que a pessoa mexe, em
 * texto legível (rendimento "4 porções", itens numa frase). A foto entra pelo
 * nome do arquivo (trocar a foto é mudança; a tela diz "foto nova"). O custo
 * não entra: é derivado dos doCadastro, que têm o próprio histórico de preço.
 */
export function retratoDaFicha(
  d: DadosFicha,
  doCadastro: ReadonlyMap<string, { nome: string; unidade: Unidade }>,
  fotoArquivo: string | null,
): Retrato {
  return {
    nome: d.nome,
    tipo: d.tipo,
    rendimento: formatarRendimento(d.rendimentoMilesimos, d.unidadeRendimento, d.tipo),
    descricao: d.descricao,
    modoPreparo: d.modoPreparo,
    foto: fotoArquivo,
    itens: itensEmTexto(
      d.itens.map((i) => {
        const ins = doCadastro.get(i.insumoId);
        return { nome: ins?.nome ?? '?', unidade: ins?.unidade ?? 'UN', quantidadeMilesimos: i.quantidadeMilesimos };
      }),
    ),
  };
}

// --------------------------------------------------------- filtros da lista

export type SituacaoDaFicha = 'ativas' | 'desativadas' | 'todas';

export interface FiltrosDeFicha {
  q: string;
  tipo: TipoFicha | null;
  situacao: SituacaoDaFicha;
  /** Só fichas com algum insumo "Sem preço". */
  incompleto: boolean;
  pagina: number;
}

export const FICHAS_POR_PAGINA = 50;

export const FILTROS_DE_FICHA_PADRAO: FiltrosDeFicha = { q: '', tipo: null, situacao: 'ativas', incompleto: false, pagina: 1 };

export function lerFiltrosDeFicha(sp: Record<string, string | string[] | undefined>): FiltrosDeFicha {
  const v = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]);
  return {
    q: (v('q') ?? '').trim().slice(0, 80),
    tipo: um(v('tipo'), Object.keys(TIPOS_DE_FICHA) as TipoFicha[]),
    situacao: um(v('situacao'), ['ativas', 'desativadas', 'todas'] as const) ?? 'ativas',
    incompleto: marcado(v('custo')) || v('custo') === 'incompleto',
    pagina: Math.max(1, Math.trunc(Number(v('pagina'))) || 1),
  };
}

export function queryDosFiltrosDeFicha(f: FiltrosDeFicha): string {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.tipo) p.set('tipo', f.tipo);
  if (f.situacao !== 'ativas') p.set('situacao', f.situacao);
  if (f.incompleto) p.set('custo', 'incompleto');
  if (f.pagina > 1) p.set('pagina', String(f.pagina));
  return p.toString();
}

export function temFiltroDeFicha(f: FiltrosDeFicha): boolean {
  return !!(f.q || f.tipo || f.situacao !== 'ativas' || f.incompleto);
}
