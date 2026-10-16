/**
 * Validade por conservação (1.4) — a parte PURA: leitura do formulário (ficha
 * e insumo) e da planilha, conversão dias/horas ↔ minutos, texto da tela e do
 * histórico, colunas do banco. O que vale é o que o servidor lê do texto.
 *
 * Modelo (o mesmo no Insumo, desde a 0.1, e na FichaTecnica, desde a 1.4):
 * `conservacao` = a PRINCIPAL (onde o item fica normalmente) e uma validade em
 * MINUTOS por conservação. **O item aceita uma conservação quando tem validade
 * nela**: não existe "aceita, mas não sei quanto dura". A principal é uma das
 * aceitas. Nenhuma aceita = validade não informada (nunca um prazo inventado).
 *
 * - Ficha: tudo opcional; sem nenhuma, a principal fica nula.
 * - Insumo: a principal sempre existe (é onde se guarda; coluna NOT NULL);
 *   as validades são opcionais. Para o insumo COMPRADO, a validade é a de
 *   depois de aberto ou manipulado — a do fabricante vem no lote (etiqueta,
 *   fase 3.4).
 *
 * Na tela, a pessoa digita dias ou horas INTEIROS (pista fria costuma ser em
 * horas); grava minutos (3 dias = 4320). Teto: 730 dias.
 */

import { lerInteiro } from './unidades';

export const CONSERVACOES = {
  SECO: 'Seco',
  PISTA_FRIA: 'Pista fria',
  REFRIGERADO: 'Refrigerado',
  CONGELADO: 'Congelado',
} as const;
export type Conservacao = keyof typeof CONSERVACOES;

type Erros = Record<string, string>;

/** Ordem fixa da tela e do texto (a principal vem primeiro no texto). */
export const ORDEM_DAS_CONSERVACOES: readonly Conservacao[] = ['SECO', 'PISTA_FRIA', 'REFRIGERADO', 'CONGELADO'];

/** Coluna de cada conservação (Insumo e FichaTecnica têm as mesmas). */
export const COLUNA_DA_VALIDADE = {
  SECO: 'validadeSecoMin',
  PISTA_FRIA: 'validadePistaFriaMin',
  REFRIGERADO: 'validadeRefrigeradoMin',
  CONGELADO: 'validadeCongeladoMin',
} as const satisfies Record<Conservacao, string>;

export const MINUTOS = { hora: 60, dia: 1440 } as const;
/** 730 dias: acima disso é erro de digitação (e a etiqueta não faria sentido). */
export const VALIDADE_MAXIMA_MIN = 730 * MINUTOS.dia;

export type EmQue = 'dias' | 'horas';

/** Validades de um item: a principal e os minutos de cada conservação aceita. */
export interface Validades {
  principal: Conservacao;
  minutos: Partial<Record<Conservacao, number>>;
}

/** O que chega da tela (ou da planilha): por conservação, se está marcada e o texto. */
export interface EntradaDeValidade {
  principal?: unknown;
  linhas: Partial<Record<Conservacao, { marcada: boolean; quantidade: string; em: EmQue }>>;
}

/** Chave do erro de uma linha (o resumo de erros leva até o campo `<idBase>-validade-SECO`). */
export const chaveDaValidade = (c: Conservacao) => `validade-${c}`;

// --------------------------------------------------------------- conversão

/** Dias/horas inteiros → minutos; null = inválido. */
export function paraMinutos(texto: string, em: EmQue): number | null {
  const t = texto.trim();
  if (!/^\d{1,6}$/.test(t)) return null;
  const n = lerInteiro(t);
  if (n === null) return null;
  return n * (em === 'dias' ? MINUTOS.dia : MINUTOS.hora);
}

/** Minutos gravados → o que volta para o campo: dias quando fecha em dias, senão horas. */
export function validadeParaCampo(min: number): { quantidade: string; em: EmQue } {
  if (min % MINUTOS.dia === 0) return { quantidade: String(min / MINUTOS.dia), em: 'dias' };
  return { quantidade: String(Math.max(1, Math.round(min / MINUTOS.hora))), em: 'horas' };
}

/** "1 dia", "3 dias", "6 horas", "1 hora"; minuto quebrado (gravado por fora) aparece como é. */
export function formatarValidade(min: number): string {
  if (min % MINUTOS.dia === 0) {
    const d = min / MINUTOS.dia;
    return `${d.toLocaleString('pt-BR')} ${d === 1 ? 'dia' : 'dias'}`;
  }
  if (min % MINUTOS.hora === 0) {
    const h = min / MINUTOS.hora;
    return `${h.toLocaleString('pt-BR')} ${h === 1 ? 'hora' : 'horas'}`;
  }
  return `${min.toLocaleString('pt-BR')} min`;
}

// ------------------------------------------------------------------ leitura

const ehConservacao = (v: unknown): v is Conservacao => typeof v === 'string' && (ORDEM_DAS_CONSERVACOES as readonly string[]).includes(v);

/**
 * Entrada → validades. `insumo`: sem nenhuma marcada, a principal escolhida
 * fica (sem validade); `ficha`: sem nenhuma marcada, devolve null. Erros por
 * linha (`validade-REFRIGERADO`) e da principal (`conservacao`).
 */
export function lerValidades(
  entrada: EntradaDeValidade,
  para: 'ficha' | 'insumo',
): { ok: true; validades: Validades | null } | { ok: false; erros: Erros } {
  const erros: Erros = {};
  const minutos: Partial<Record<Conservacao, number>> = {};
  for (const c of ORDEM_DAS_CONSERVACOES) {
    const l = entrada.linhas[c];
    if (!l?.marcada) continue;
    const nome = CONSERVACOES[c];
    if (!l.quantidade.trim()) {
      erros[chaveDaValidade(c)] = `Diga quanto dura em ${nome.toLowerCase()} (ex.: 3 dias) ou desmarque.`;
      continue;
    }
    const m = paraMinutos(l.quantidade, l.em);
    if (m === null) erros[chaveDaValidade(c)] = `Em ${nome.toLowerCase()}: número inteiro de ${l.em}. Ex.: ${l.em === 'dias' ? '3' : '12'}.`;
    else if (m === 0) erros[chaveDaValidade(c)] = `A validade em ${nome.toLowerCase()} precisa ser maior que zero.`;
    else if (m > VALIDADE_MAXIMA_MIN) erros[chaveDaValidade(c)] = `Mais de 730 dias em ${nome.toLowerCase()}? Confira o número.`;
    else minutos[c] = m;
  }
  const marcadas = ORDEM_DAS_CONSERVACOES.filter((c) => entrada.linhas[c]?.marcada);
  const escolhida = ehConservacao(entrada.principal) ? entrada.principal : null;
  if (entrada.principal !== undefined && entrada.principal !== '' && !escolhida) erros.conservacao = 'Conservação principal desconhecida.';

  let principal: Conservacao | null = null;
  if (marcadas.length === 0) {
    if (para === 'insumo') {
      principal = escolhida ?? 'SECO';
    }
  } else if (escolhida && marcadas.includes(escolhida)) principal = escolhida;
  else if (marcadas.length === 1 && !escolhida) principal = marcadas[0];
  else if (escolhida) erros.conservacao ??= `A principal (${CONSERVACOES[escolhida].toLowerCase()}) precisa estar marcada, com a validade.`;
  else erros.conservacao ??= 'Diga qual é a conservação principal (onde o item fica normalmente).';

  if (Object.keys(erros).length > 0) return { ok: false, erros };
  if (principal === null) return { ok: true, validades: null };
  return { ok: true, validades: { principal, minutos } };
}

/** Os campos do formulário (`aceita_SECO`, `validade_SECO`, `validadeEm_SECO`, `conservacao`) → entrada. */
export function entradaDoFormulario(get: (nome: string) => unknown): EntradaDeValidade {
  const txt = (v: unknown) => (typeof v === 'string' ? v : '');
  const linhas: EntradaDeValidade['linhas'] = {};
  for (const c of ORDEM_DAS_CONSERVACOES) {
    const marcada = ['on', 'sim', 'true', '1'].includes(txt(get(`aceita_${c}`)));
    linhas[c] = { marcada, quantidade: txt(get(`validade_${c}`)), em: get(`validadeEm_${c}`) === 'horas' ? 'horas' : 'dias' };
  }
  return { principal: get('conservacao') ?? undefined, linhas };
}

/** Validades → valores do formulário (editar). */
export function validadesParaCampos(v: Validades | null): Record<Conservacao, { marcada: boolean; quantidade: string; em: EmQue }> & { principal: Conservacao | null } {
  const out = { principal: v?.principal ?? null } as ReturnType<typeof validadesParaCampos>;
  for (const c of ORDEM_DAS_CONSERVACOES) {
    const m = v?.minutos[c];
    out[c] = m ? { marcada: true, ...validadeParaCampo(m) } : { marcada: false, quantidade: '', em: c === 'PISTA_FRIA' ? 'horas' : 'dias' };
  }
  return out;
}

// --------------------------------------------------------------- planilha

/**
 * Célula da planilha → minutos: "3" (dias), "3 dias", "3d", "1 dia", "6 h",
 * "6 horas", "6hs". Vazio = não aceita (undefined). Inválido = null.
 */
export function lerValidadeDaPlanilha(texto: string): number | null | undefined {
  const t = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return undefined;
  const m = /^(\d{1,6}) ?(d|dia|dias|h|hs|hr|hrs|hora|horas)?$/.exec(t);
  if (!m) return null;
  const em: EmQue = m[2] && m[2].startsWith('h') ? 'horas' : 'dias';
  return paraMinutos(m[1], em);
}

/** Nome da conservação escrito na planilha ("refrigerado", "pista fria", "seco", "ambiente") → código. */
export function lerConservacaoDaPlanilha(texto: string): Conservacao | null | undefined {
  const t = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return undefined;
  const mapa: Record<string, Conservacao> = {
    seco: 'SECO',
    ambiente: 'SECO',
    'seco ambiente': 'SECO',
    'pista fria': 'PISTA_FRIA',
    pista: 'PISTA_FRIA',
    refrigerado: 'REFRIGERADO',
    geladeira: 'REFRIGERADO',
    resfriado: 'REFRIGERADO',
    congelado: 'CONGELADO',
    freezer: 'CONGELADO',
  };
  return mapa[t] ?? null;
}

// ------------------------------------------------------------------- texto

/** As aceitas na ordem do texto: a principal primeiro, depois a ordem fixa. */
export function aceitas(v: Validades): { conservacao: Conservacao; minutos: number; principal: boolean }[] {
  const lista = ORDEM_DAS_CONSERVACOES.filter((c) => v.minutos[c] !== undefined);
  lista.sort((a, b) => (a === v.principal ? -1 : b === v.principal ? 1 : 0));
  return lista.map((c) => ({ conservacao: c, minutos: v.minutos[c]!, principal: c === v.principal }));
}

/** Para o cozinheiro: "Refrigerado: 3 dias · Congelado: 30 dias" (principal primeiro). null = não informada. */
export function validadesEmTexto(v: Validades | null): string | null {
  if (!v || aceitas(v).length === 0) return null;
  return aceitas(v)
    .map((a) => `${CONSERVACOES[a.conservacao]}: ${formatarValidade(a.minutos)}`)
    .join(' · ');
}

/**
 * Para o histórico: "Refrigerado 3 dias · Congelado 30 dias" na ordem fixa (a
 * principal vai no campo `conservacao` do retrato). Sem validade: null.
 */
export function retratoDaValidade(v: Validades | null): string | null {
  if (!temValidade(v)) return null;
  return ORDEM_DAS_CONSERVACOES.filter((c) => v!.minutos[c] !== undefined)
    .map((c) => `${CONSERVACOES[c]} ${formatarValidade(v!.minutos[c]!)}`)
    .join(' · ');
}

// ------------------------------------------------------------------- banco

export type ColunasDaValidade = {
  validadeSecoMin: number | null;
  validadePistaFriaMin: number | null;
  validadeRefrigeradoMin: number | null;
  validadeCongeladoMin: number | null;
};

/** Validades → colunas (as 4, sempre: a que não aceita vira null). */
export function colunasDaValidade(v: Validades | null): ColunasDaValidade {
  const col = {} as ColunasDaValidade;
  for (const c of ORDEM_DAS_CONSERVACOES) col[COLUNA_DA_VALIDADE[c]] = v?.minutos[c] ?? null;
  return col;
}

/** Linha do banco → validades. `conservacao` nula (ficha sem validade) → null. */
export function validadesDaLinha(l: ColunasDaValidade & { conservacao: Conservacao | null }): Validades | null {
  if (!l.conservacao) return null;
  const minutos: Partial<Record<Conservacao, number>> = {};
  for (const c of ORDEM_DAS_CONSERVACOES) {
    const m = l[COLUNA_DA_VALIDADE[c]];
    if (m !== null && m !== undefined) minutos[c] = m;
  }
  return { principal: l.conservacao, minutos };
}

/** Seleção Prisma das colunas (Insumo e FichaTecnica). */
export const SELECAO_DA_VALIDADE = {
  conservacao: true,
  validadeSecoMin: true,
  validadePistaFriaMin: true,
  validadeRefrigeradoMin: true,
  validadeCongeladoMin: true,
} as const;

/** Tem alguma validade dita? (insumo "Seco" sem validade não tem.) */
export const temValidade = (v: Validades | null) => !!v && Object.keys(v.minutos).length > 0;
