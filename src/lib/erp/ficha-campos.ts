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
 * vira R$ 0,00).
 *
 * 1.3: o item é um insumo OU um pré-preparo (outra ficha, `subfichaId`), com
 * fator de correção (bruto ÷ líquido: 1,18 = compra 1,18 kg para ter 1 kg
 * limpo). O custo do pré-preparo por unidade (custo da receita ÷ rendimento)
 * entra em cascata em quem o usa (`ficha-cascata.ts`); "incompleto" sobe junto.
 */

import { z } from 'zod';
import { marcado, nomeObrigatorio, primeiroErroPorCampo, um, type Erros, type Leitura, type Retrato } from './insumo-campos';
import {
  custoDaEmbalagem,
  custoDoUso,
  custoPorUnidade,
  escalaDaSigla,
  formatarFracao,
  formatarQuantidade,
  lerInteiro,
  lerQuantidade,
  lerQuantidadeNa,
  porRendimento,
  somar,
  UNIDADES,
  ZERO,
  type CustoExato,
  type Fracao,
  type Unidade,
} from './unidades';
import { lerValidades, retratoDaValidade, type EntradaDeValidade, type Validades } from './validade';

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
  /**
   * Nome da ficha que PRODUZ este insumo (1.3), quando ele é a face de estoque
   * de um pré-preparo. Na receita vale o pré-preparo (`subfichaId`), nunca o
   * insumo produzido: por ele, o item escaparia da conferência de círculo.
   */
  produzidoPor?: string | null;
  /**
   * 1.5: custo exato pela ÚLTIMA nota de compra lançada (anexado na leitura,
   * `compras-custo.ts`). Ausente ou null = sem compra: vale o preço cadastrado.
   */
  ultimaCompra?: CustoExato | null;
}

/** Pré-preparo como o item da ficha precisa dele (1.3): a ficha que pode entrar em outra. */
export interface PreparoDaFicha {
  id: string;
  nome: string;
  tipo: TipoFicha;
  ativa: boolean;
  /** A quantidade do item é na unidade do rendimento dele (2 kg de molho → g/kg). */
  unidadeRendimento: Unidade;
}

export interface ItemDigitado {
  /** O item é um insumo... */
  insumoId?: string;
  /** ...ou um pré-preparo (outra ficha), nunca os dois. */
  subfichaId?: string;
  /** Texto, como digitado ("180", "1,5"): a quantidade LÍQUIDA (limpa). */
  quantidade: string;
  /** Sigla digitada: g, kg, ml, L ou un. */
  unidade: string;
  /** Fator de correção digitado ("1,18"); vazio = 1 (sem perda). */
  fator?: string;
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
  /**
   * 1.4: em que conservação o item fica e quanto dura em cada uma. Ausente
   * (planilha sem as colunas) = não disse nada: quem grava mantém o que a
   * ficha já tem. Presente sem nenhuma marcada (formulário) = não informada.
   */
  validade?: EntradaDeValidade;
}

export interface DadosFicha {
  nome: string;
  tipo: TipoFicha;
  descricao: string | null;
  modoPreparo: string | null;
  rendimentoMilesimos: number;
  unidadeRendimento: Unidade;
  itens: ItemDaFicha[];
  /** 1.4: principal + validade por conservação; null = não informada. */
  validades: Validades | null;
}

export interface ItemDaFicha {
  insumoId: string | null;
  subfichaId: string | null;
  /** Líquida, em milésimos da unidade base do insumo / do rendimento do pré-preparo. */
  quantidadeMilesimos: number;
  /** Bruto ÷ líquido, em milésimos (1000 = sem perda). */
  fatorCorrecaoMilesimos: number;
}

// ------------------------------------------------------- fator de correção

/** 1 a 10: menos que 1 não é perda; mais que 10 é quase certo erro de digitação. */
export const FATOR = { minimo: 1000, maximo: 10_000 } as const;

/**
 * Fator de correção digitado → milésimos. Vazio = 1 (sem perda). Aceita
 * "1,18" e também "1.18" (fator nunca tem milhar).
 */
export function lerFator(t: string | undefined): { ok: true; milesimos: number } | { ok: false; erro: string } {
  const txt = (t ?? '').trim();
  if (!txt) return { ok: true, milesimos: FATOR.minimo };
  const m = lerQuantidade(/^\d+\.\d{1,3}$/.test(txt) ? txt.replace('.', ',') : txt);
  if (m === null) return { ok: false, erro: 'Fator de correção inválido. Ex.: 1,18 (vazio = 1, sem perda).' };
  if (m < FATOR.minimo) return { ok: false, erro: 'O fator de correção começa em 1 (1 = sem perda; 1,18 = compra 1,18 kg para ter 1 kg limpo).' };
  if (m > FATOR.maximo) return { ok: false, erro: 'Fator acima de 10? Confira: é o peso bruto dividido pelo peso limpo.' };
  return { ok: true, milesimos: m };
}

// avoid-ai-design-ignore: CP3 — a seta é de um comentário de exemplo (milésimos para texto), não de botão nem link.
/** 1180 → "1,18"; 1000 → "1". */
export function formatarFator(milesimos: number): string {
  return (milesimos / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

/** Peso bruto (o que se compra/pesa antes de limpar): líquido × fator, arredondado ao milésimo (metade para cima). */
export function quantidadeBruta(liquidaMilesimos: number, fatorMilesimos: number): number {
  return Math.floor((2 * liquidaMilesimos * fatorMilesimos + 1000) / 2000);
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
  opcoes: {
    /** Pré-preparos que a entrada cita, lidos pelo portão (de outro parceiro: não estão aqui). */
    preparos?: ReadonlyMap<string, PreparoDaFicha>;
    /** A própria ficha (edição): não entra nela mesma. */
    propriaId?: string;
  } = {},
): Leitura<DadosFicha> {
  const preparos = opcoes.preparos ?? new Map<string, PreparoDaFicha>();
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
  if (entrada.itens.length === 0) erros.itens = 'Inclua pelo menos um insumo ou pré-preparo na ficha.';
  if (entrada.itens.length > LIMITES_DA_FICHA.itens) erros.itens = `Até ${LIMITES_DA_FICHA.itens} itens por ficha.`;
  entrada.itens.slice(0, LIMITES_DA_FICHA.itens).forEach((item, i) => {
    const chave = chaveDoItem(i);
    let alvo: { chave: string; id: string; nome: string; unidade: Unidade; preparo: boolean };
    if (item.subfichaId) {
      const p = preparos.get(item.subfichaId);
      if (!p) return void (erros[chave] = 'Pré-preparo não encontrado neste cadastro.');
      if (p.id === opcoes.propriaId) return void (erros[chave] = 'Uma ficha não entra nela mesma.');
      if (p.tipo !== 'PRE_PREPARO') return void (erros[chave] = `“${p.nome}” é prato: só pré-preparo entra em outra ficha.`);
      if (!p.ativa && !jaNaFicha.has(p.id)) return void (erros[chave] = `“${p.nome}” está desativado: reative em Fichas técnicas para usar.`);
      alvo = { chave: `f:${p.id}`, id: p.id, nome: p.nome, unidade: p.unidadeRendimento, preparo: true };
    } else {
      const insumo = item.insumoId ? doCadastro.get(item.insumoId) : undefined;
      if (!item.insumoId) return void (erros[chave] = 'Escolha o insumo ou o pré-preparo.');
      if (!insumo) return void (erros[chave] = 'Insumo não encontrado neste cadastro.');
      if (insumo.produzidoPor) {
        return void (erros[chave] = `“${insumo.nome}” é o pré-preparo “${insumo.produzidoPor}”: escolha-o em “Pré-preparos”, não em “Insumos”.`);
      }
      if (!insumo.ativo && !jaNaFicha.has(insumo.id)) {
        return void (erros[chave] = `“${insumo.nome}” está desativado: reative em Insumos para usar.`);
      }
      alvo = { chave: `i:${insumo.id}`, id: insumo.id, nome: insumo.nome, unidade: insumo.unidade, preparo: false };
    }
    const repetido = vistos.get(alvo.chave);
    if (repetido !== undefined) return void (erros[chave] = `“${alvo.nome}” já está na ficha (item ${repetido + 1}).`);
    vistos.set(alvo.chave, i);
    const u = UNIDADES[alvo.unidade];
    const escala = escalaDaSigla(item.unidade, alvo.unidade);
    if (!escala) {
      const aceitas = alvo.unidade === 'UN' ? 'un' : `${u.menor} ou ${u.sigla}`;
      return void (erros[chave] = `“${alvo.nome}” ${alvo.preparo ? 'rende' : 'é medido'} em ${u.nome.toLowerCase()}: use ${aceitas}.`);
    }
    const qTxt = item.quantidade.trim();
    const q = qTxt ? lerQuantidadeNa(qTxt, alvo.unidade, escala) : null;
    if (!qTxt) return void (erros[chave] = `Diga quanto de “${alvo.nome}” vai na receita.`);
    if (q === null) {
      return void (erros[chave] =
        escala === 'menor' ? `Em ${u.menor}, só números inteiros (1 ${u.menor} é o menor passo).` : 'Quantidade inválida. Ex.: 180 ou 0,5.');
    }
    if (q === 0) return void (erros[chave] = 'A quantidade precisa ser maior que zero.');
    const fator = lerFator(item.fator);
    if (!fator.ok) return void (erros[chave] = fator.erro);
    itens.push({
      insumoId: alvo.preparo ? null : alvo.id,
      subfichaId: alvo.preparo ? alvo.id : null,
      quantidadeMilesimos: q,
      fatorCorrecaoMilesimos: fator.milesimos,
    });
  });

  // Validade por conservação (1.4): opcional; marcada exige quanto dura.
  const v = entrada.validade ? lerValidades(entrada.validade, 'ficha') : ({ ok: true, validades: null } as const);
  if (!v.ok) Object.assign(erros, v.erros);

  if (!r.success || rendimentoMilesimos === null || !v.ok || Object.keys(erros).length > 0) return { ok: false, erros };
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
      validades: v.validades,
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
  /** Pré-preparo (1.3): o custo DELE, já calculado (o item usa o custo por unidade de rendimento). */
  preparo?: CustoDaFicha;
}

export interface CustoDaFicha {
  /** Soma exata dos itens COM preço (o pré-preparo incompleto entra com a parte que tem). */
  total: Fracao;
  /** Total ÷ rendimento (uma porção, 1 kg...). */
  porRendimento: Fracao;
  /** Custo de cada item, na ordem; null = insumo sem preço. */
  itens: (Fracao | null)[];
  /** Insumos DESTA receita sem preço. */
  semPreco: string[];
  /** Pré-preparos desta receita com custo incompleto (entram com o parcial). */
  preparosIncompletos: string[];
  /** Todos os insumos sem preço, até o fundo da cascata (sem repetir). Com algum, o custo é INCOMPLETO. */
  faltaPreco: string[];
}

export const custoIncompleto = (c: Pick<CustoDaFicha, 'faltaPreco'>) => c.faltaPreco.length > 0;

/**
 * Custo de referência do insumo: o da última compra lançada (1.5, decisão 65)
 * ou, sem compra, o preço cadastrado da embalagem padrão (1.1). É a única
 * porta da cascata para o preço do insumo.
 */
export function custoDoInsumo(
  i: Pick<InsumoDaFicha, 'precoEmbalagemCentavos' | 'taxaEntregaCentavos' | 'conteudoMilesimos' | 'ultimaCompra'>,
): CustoExato | null {
  if (i.ultimaCompra) return i.ultimaCompra;
  return custoDaEmbalagem(i.precoEmbalagemCentavos, i.taxaEntregaCentavos, i.conteudoMilesimos);
}

/**
 * Custo da receita: Σ custo por unidade × quantidade líquida × fator, em
 * fração exata, e o custo de uma unidade de rendimento. Nada se arredonda
 * aqui. Item de pré-preparo usa o custo dele por unidade de rendimento.
 */
export function custoDaFicha(itens: readonly ItemParaCusto[], rendimentoMilesimos: number): CustoDaFicha {
  let total = ZERO;
  const semPreco: string[] = [];
  const preparosIncompletos: string[] = [];
  const faltaPreco = new Set<string>();
  const porItem = itens.map((i) => {
    if (i.preparo) {
      if (custoIncompleto(i.preparo)) {
        preparosIncompletos.push(i.nome);
        i.preparo.faltaPreco.forEach((n) => faltaPreco.add(n));
      }
      const v = custoDoUso(i.preparo.porRendimento, i.quantidadeMilesimos, i.fatorCorrecaoMilesimos);
      total = somar(total, v);
      return v;
    }
    if (!i.custo) {
      semPreco.push(i.nome);
      faltaPreco.add(i.nome);
      return null;
    }
    const v = custoDoUso(custoPorUnidade(i.custo), i.quantidadeMilesimos, i.fatorCorrecaoMilesimos);
    total = somar(total, v);
    return v;
  });
  return { total, porRendimento: porRendimento(total, rendimentoMilesimos), itens: porItem, semPreco, preparosIncompletos, faltaPreco: [...faltaPreco] };
}

const citar = (nomes: readonly string[]) =>
  nomes.length === 1 ? `“${nomes[0]}”` : `${nomes.slice(0, -1).map((n) => `“${n}”`).join(', ')} e “${nomes[nomes.length - 1]}”`;

/**
 * A conta da ficha, por extenso: "R$ 12,34 ÷ 4 porções = R$ 3,09 por porção".
 * Incompleto: diz que é parcial e o que falta, inclusive dentro do pré-preparo.
 */
export function contaDaFicha(c: CustoDaFicha, rendimentoMilesimos: number, unidade: Unidade, tipo: TipoFicha): string {
  const conta = `${formatarFracao(c.total)} ÷ ${formatarRendimento(rendimentoMilesimos, unidade, tipo)} = ${formatarFracao(c.porRendimento)} ${porUnidadeDeRendimento(unidade, tipo)}`;
  if (!custoIncompleto(c)) return conta;
  const partes: string[] = [];
  if (c.semPreco.length > 0) partes.push(`sem contar ${c.semPreco.length === 1 ? `“${c.semPreco[0]}”` : `${c.semPreco.length} insumos`} (sem preço)`);
  if (c.preparosIncompletos.length > 0) {
    const dentro = c.faltaPreco.filter((n) => !c.semPreco.includes(n));
    partes.push(`${citar(c.preparosIncompletos)} com custo incompleto${dentro.length ? ` (falta preço em ${citar(dentro)})` : ''}`);
  }
  return `${conta}, ${partes.join('; ')}.`;
}

// ------------------------------------------------------------- histórico

/**
 * "Pão brioche 1 un · Cebola 100 g (fator 1,18) · Molho cheddar 40 g": os
 * itens numa frase, na ordem da ficha. O fator só aparece quando há perda.
 */
export function itensEmTexto(itens: readonly { nome: string; unidade: Unidade; quantidadeMilesimos: number; fatorCorrecaoMilesimos?: number }[]): string {
  return itens
    .map((i) => {
      const f = i.fatorCorrecaoMilesimos ?? FATOR.minimo;
      return `${i.nome} ${formatarQuantidade(i.quantidadeMilesimos, i.unidade)}${f !== FATOR.minimo ? ` (fator ${formatarFator(f)})` : ''}`;
    })
    .join(' · ');
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
  preparos: ReadonlyMap<string, { nome: string; unidadeRendimento: Unidade }> = new Map(),
): Retrato {
  return {
    nome: d.nome,
    tipo: d.tipo,
    rendimento: formatarRendimento(d.rendimentoMilesimos, d.unidadeRendimento, d.tipo),
    descricao: d.descricao,
    modoPreparo: d.modoPreparo,
    foto: fotoArquivo,
    conservacao: d.validades?.principal ?? null,
    validade: retratoDaValidade(d.validades),
    itens: itensEmTexto(
      d.itens.map((i) => {
        const p = i.subfichaId ? preparos.get(i.subfichaId) : undefined;
        const ins = i.insumoId ? doCadastro.get(i.insumoId) : undefined;
        return {
          nome: p?.nome ?? ins?.nome ?? '?',
          unidade: p?.unidadeRendimento ?? ins?.unidade ?? 'UN',
          quantidadeMilesimos: i.quantidadeMilesimos,
          fatorCorrecaoMilesimos: i.fatorCorrecaoMilesimos,
        };
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
  /** Só fichas com custo incompleto (insumo "Sem preço", inclusive dentro de pré-preparo). */
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
