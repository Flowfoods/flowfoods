/**
 * Lista do dia (3.2) — regras PURAS, sem banco e sem Next: ler o dia e o rascunho da tela, juntar as linhas, e a conta de
 * "vai usar · tem · comprar". A tela e `lista-do-dia.ts` usam as mesmas funções.
 *
 * Princípios (decisões 202 a 213):
 * - a lista do dia É o conjunto de lotes (`OrdemProducao`) do dia: não há tabela de lista;
 * - VAI USAR = o que ainda vai SAIR do estoque até o dia (falta de cada requisição aberta + o rascunho), não o planejado
 *   bruto: a entrega parcial não conta duas vezes (o saldo já caiu E a falta caiu);
 * - TEM = o saldo do livro agora; negativo conta 0 na conta e a tela mostra o alarme;
 * - COMPRAR = max(0, vai usar − tem) em embalagens padrão, arredondando PARA CIMA; pré-preparo nunca vai para comprar:
 *   vai para "Falta produzir" (a cascata nunca explode sozinha);
 * - dinheiro em centavos inteiros, 1 arredondamento por item; sem preço = "incompleto", nunca R$ 0,00.
 */

import { somarDias } from './contagem-campos';
import { DIAS_A_FRENTE } from './requisicao-campos';
import { centavosDaFracao, custoDoUso, formatarQuantidade, lerQuantidadeNa, UNIDADES, type Fracao, type Unidade } from './unidades';

// ================================================================ o dia

/** Até quantas linhas num envio (a transação grava um lote e uma requisição por linha). */
export const LINHAS_POR_ENVIO = 30;
/** Até quanto de um pré-preparo numa linha: 10 mil kg/L/un (o mesmo teto do lote da 3.1). */
export const TETO_DA_LINHA_MILESIMOS = 10_000_000;
/** Quantos dias para trás a tela deixa olhar (só leitura). */
export const DIAS_PARA_TRAS = 365;

const DIA = /^\d{4}-\d{2}-\d{2}$/;

function diaValido(t: string): boolean {
  if (!DIA.test(t)) return false;
  const d = new Date(`${t}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t;
}

/**
 * O dia da tela (`?dia=AAAA-MM-DD`): de um ano atrás até 14 dias à frente. Lixo, vazio ou fora disso volta para hoje.
 * `passado`: o dia já foi (só leitura: lotes com etapa e planejado × produzido, sem tem/comprar).
 */
export function lerDiaDaLista(texto: unknown, hoje: string): { dia: string; passado: boolean } {
  const t = typeof texto === 'string' ? texto.trim() : '';
  if (!diaValido(t) || t < somarDias(hoje, -DIAS_PARA_TRAS) || t > somarDias(hoje, DIAS_A_FRENTE)) return { dia: hoje, passado: false };
  return { dia: t, passado: t < hoje };
}

const SEMANA = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' });

/** "sábado, 18/10" (e "hoje · sábado, 18/10" quando é o dia de hoje). */
export function rotuloDoDia(dia: string, hoje: string): string {
  const [, m, d] = dia.split('-');
  const base = `${SEMANA.format(new Date(`${dia}T12:00:00.000Z`))}, ${d}/${m}`;
  if (dia === hoje) return `hoje · ${base}`;
  if (dia === somarDias(hoje, 1)) return `amanhã · ${base}`;
  if (dia === somarDias(hoje, -1)) return `ontem · ${base}`;
  return base;
}

// ================================================================ o rascunho (na URL)

/** Uma linha do rascunho como a tela a manda: o pré-preparo e quanto, em kg|L|un (o texto que a pessoa digitou). */
export interface LinhaDoRascunho {
  fichaId: string;
  quantidade: string;
}

const ID = /^[a-z0-9]{1,64}$/i;

/**
 * O rascunho vem da URL (`?l=<ficha>~<quanto>`, repetido). Tudo que vem de lá é dado de fora: o que não tem a forma é
 * descartado, e passar de 30 linhas devolve `excedeu` (a tela diz; o servidor recusa o envio, nada é gravado pela metade).
 */
export function lerRascunho(valores: string | readonly string[] | undefined): { linhas: LinhaDoRascunho[]; excedeu: boolean } {
  const lista = valores === undefined ? [] : typeof valores === 'string' ? [valores] : valores;
  const linhas: LinhaDoRascunho[] = [];
  let excedeu = false;
  for (const v of lista) {
    if (typeof v !== 'string') continue;
    const [fichaId, ...resto] = v.split('~');
    const quantidade = resto.join('~').trim();
    if (!ID.test(fichaId ?? '') || quantidade.length > 20) continue;
    if (linhas.length >= LINHAS_POR_ENVIO) {
      excedeu = true;
      continue;
    }
    linhas.push({ fichaId, quantidade });
  }
  return { linhas, excedeu };
}

/** A linha na forma da URL. */
export const linhaNaUrl = (l: LinhaDoRascunho) => `${l.fichaId}~${l.quantidade}`;

/** Milésimos → o texto digitável na unidade base ("0,5", "5"). */
export function textoDaQuantidade(milesimos: number): string {
  const inteiro = Math.trunc(milesimos / 1000);
  const resto = milesimos % 1000;
  return `${inteiro}${resto ? ',' + String(resto).padStart(3, '0').replace(/0+$/, '') : ''}`;
}

export interface FichaParaLinha {
  nome: string;
  unidade: Unidade;
  /** Por que esta ficha não se produz (prato, desativada, sem insumo produzido); null = produz. */
  naoProduz: string | null;
}

export interface LinhaJuntada {
  /** A posição da PRIMEIRA linha digitada desta ficha. */
  posicao: number;
  fichaId: string;
  nome: string;
  unidade: Unidade;
  quantidadeMilesimos: number;
  /** Quantas linhas digitadas viraram esta (a mesma ficha duas vezes soma). */
  juntou: number;
}

/**
 * Lê as linhas digitadas e junta a mesma ficha numa só (soma). Erro por linha (`linha:<n>`, n = posição digitada) e geral.
 * `linhas` traz só as que valem (a prévia mostra a conta com elas e marca as outras); quem GRAVA exige `erros` vazio:
 * a lista vale inteira ou não vale, nada entra pela metade. A ordem é a da primeira aparição.
 */
export function juntarLinhas(linhas: readonly LinhaDoRascunho[], fichas: ReadonlyMap<string, FichaParaLinha>): { linhas: LinhaJuntada[]; erros: Record<string, string> } {
  const erros: Record<string, string> = {};
  if (linhas.length === 0) return { linhas: [], erros: { geral: 'Ponha pelo menos um pré-preparo na lista.' } };
  if (linhas.length > LINHAS_POR_ENVIO) return { linhas: [], erros: { geral: `Até ${LINHAS_POR_ENVIO} linhas por vez: confirme estas e monte o resto depois.` } };
  const juntas = new Map<string, LinhaJuntada>();
  linhas.forEach((l, n) => {
    const chave = `linha:${n}`;
    const f = ID.test(l.fichaId) ? fichas.get(l.fichaId) : undefined;
    if (!f) return void (erros[chave] = 'Escolha o pré-preparo.');
    if (f.naoProduz) return void (erros[chave] = f.naoProduz);
    const txt = (l.quantidade ?? '').trim();
    const q = txt ? lerQuantidadeNa(txt, f.unidade, 'base') : null;
    if (q === null || q <= 0) return void (erros[chave] = `Quanto de “${f.nome}”: número como 2 ou 1,5 (${UNIDADES[f.unidade].sigla}).`);
    if (q > TETO_DA_LINHA_MILESIMOS) return void (erros[chave] = `“${f.nome}”: até ${formatarQuantidade(TETO_DA_LINHA_MILESIMOS, f.unidade)} por lote, confira o número.`);
    const ja = juntas.get(l.fichaId);
    if (!ja) {
      juntas.set(l.fichaId, { posicao: n, fichaId: l.fichaId, nome: f.nome, unidade: f.unidade, quantidadeMilesimos: q, juntou: 1 });
      return;
    }
    if (ja.quantidadeMilesimos + q > TETO_DA_LINHA_MILESIMOS) return void (erros[chave] = `“${f.nome}” soma mais de ${formatarQuantidade(TETO_DA_LINHA_MILESIMOS, f.unidade)} na lista: divida em outro dia.`);
    ja.quantidadeMilesimos += q;
    ja.juntou += 1;
  });
  return { linhas: Array.from(juntas.values()), erros };
}

// ================================================================ a conta

export type TipoDoInsumo = 'INGREDIENTE' | 'EMBALAGEM' | 'PRE_PREPARO';

export interface InsumoDaConta {
  id: string;
  nome: string;
  unidade: Unidade;
  tipo: TipoDoInsumo;
  ativo: boolean;
  /** A embalagem de compra padrão do insumo (milésimos da unidade base). */
  conteudoMilesimos: number;
}

/** "Lista do dia" (os lotes do dia e o rascunho) ou "Outros pedidos até o dia" (lote atrasado, salão, qualquer requisição). */
export type GrupoDoUso = 'LISTA' | 'OUTROS';

/** O que ainda vai sair do estoque de um insumo, e por quê. */
export interface UsoPrevisto {
  insumoId: string;
  grupo: GrupoDoUso;
  quantidadeMilesimos: number;
  /** De onde vem: o nome da ficha ("Molho especial"), ou "Salão #12". */
  de: string;
}

/** O que a lista do dia já produz de um pré-preparo (lotes pendentes até o dia e o rascunho). */
export interface ProducaoPrevista {
  insumoId: string;
  quantidadeMilesimos: number;
}

export interface OrigemDoUso {
  grupo: GrupoDoUso;
  de: string;
  quantidadeMilesimos: number;
}

export interface CompraDaLista {
  faltaMilesimos: number;
  embalagens: number;
  /** embalagens × conteúdo: o que se compra de fato. */
  totalMilesimos: number;
  /** "4 kg" · "2 × 3 kg (6 kg)". */
  texto: string;
}

export type SituacaoDoPreparo = 'FALTA' | 'COBERTO' | 'TEM';

export interface ProduzirDaLista {
  situacao: SituacaoDoPreparo;
  /** O que falta produzir além do que a lista já produz e do que há no estoque. */
  faltaMilesimos: number;
  /** O que a lista (lotes pendentes e rascunho) já produz deste pré-preparo. */
  produzMilesimos: number;
  /** Quem usa este pré-preparo na lista do dia ("produza antes de Molho especial"). */
  paraFichas: string[];
}

export interface ContaDoInsumo {
  insumoId: string;
  nome: string;
  unidade: Unidade;
  tipo: TipoDoInsumo;
  ativo: boolean;
  vaiUsarMilesimos: number;
  daListaMilesimos: number;
  deOutrosMilesimos: number;
  origens: OrigemDoUso[];
  /** O saldo do livro, sem o sinal negativo (negativo conta 0). */
  temMilesimos: number;
  /** O saldo do livro como está (pode ser negativo: o alarme da requisição). */
  noLivroMilesimos: number;
  /** Só ingrediente e embalagem; null = não precisa comprar. */
  comprar: CompraDaLista | null;
  /** Só pré-preparo. */
  produzir: ProduzirDaLista | null;
}

/** "4 kg" quando a embalagem é de 1 kg/1 L/1 un; senão "2 × 3 kg (6 kg)" (o total só quando passa de uma). */
export function textoDaCompra(embalagens: number, conteudoMilesimos: number, unidade: Unidade): string {
  const total = formatarQuantidade(embalagens * conteudoMilesimos, unidade);
  if (conteudoMilesimos === 1000) return total;
  const emb = `${embalagens} × ${formatarQuantidade(conteudoMilesimos, unidade)}`;
  return embalagens > 1 ? `${emb} (${total})` : emb;
}

/** O que falta, em embalagens padrão arredondando PARA CIMA. Sem falta ou sem embalagem válida: null. */
export function compraEmEmbalagens(faltaMilesimos: number, conteudoMilesimos: number, unidade: Unidade): CompraDaLista | null {
  if (faltaMilesimos <= 0 || !Number.isSafeInteger(conteudoMilesimos) || conteudoMilesimos <= 0) return null;
  const embalagens = Math.ceil(faltaMilesimos / conteudoMilesimos);
  return { faltaMilesimos, embalagens, totalMilesimos: embalagens * conteudoMilesimos, texto: textoDaCompra(embalagens, conteudoMilesimos, unidade) };
}

/**
 * Vai usar · tem · comprar de cada insumo que a lista toca. `usos` é tudo o que ainda sai do estoque (falta das requisições
 * abertas até o dia + o rascunho); `saldos` o livro da loja agora; `producoes` o que a lista já produz de cada pré-preparo.
 * Ordem: pelo nome. Insumo fora de `insumos` é ignorado (a leitura já trouxe todos).
 */
export function contaDaLista(entrada: {
  insumos: ReadonlyMap<string, InsumoDaConta>;
  usos: readonly UsoPrevisto[];
  saldos: ReadonlyMap<string, number>;
  producoes: readonly ProducaoPrevista[];
}): ContaDoInsumo[] {
  const porInsumo = new Map<string, UsoPrevisto[]>();
  for (const u of entrada.usos) {
    if (u.quantidadeMilesimos <= 0) continue;
    const l = porInsumo.get(u.insumoId);
    if (l) l.push(u);
    else porInsumo.set(u.insumoId, [u]);
  }
  const produz = new Map<string, number>();
  for (const p of entrada.producoes) produz.set(p.insumoId, (produz.get(p.insumoId) ?? 0) + p.quantidadeMilesimos);
  const contas: ContaDoInsumo[] = [];
  for (const [insumoId, usos] of Array.from(porInsumo)) {
    const i = entrada.insumos.get(insumoId);
    if (!i) continue;
    const origens = new Map<string, OrigemDoUso>();
    for (const u of usos) {
      const k = `${u.grupo}|${u.de}`;
      const o = origens.get(k);
      if (o) o.quantidadeMilesimos += u.quantidadeMilesimos;
      else origens.set(k, { grupo: u.grupo, de: u.de, quantidadeMilesimos: u.quantidadeMilesimos });
    }
    const lista = Array.from(origens.values()).sort((a, b) => (a.grupo === b.grupo ? a.de.localeCompare(b.de, 'pt-BR') : a.grupo === 'LISTA' ? -1 : 1));
    const daLista = lista.filter((o) => o.grupo === 'LISTA').reduce((s, o) => s + o.quantidadeMilesimos, 0);
    const deOutros = lista.filter((o) => o.grupo === 'OUTROS').reduce((s, o) => s + o.quantidadeMilesimos, 0);
    const vai = daLista + deOutros;
    const noLivro = entrada.saldos.get(insumoId) ?? 0;
    const tem = Math.max(0, noLivro);
    const base = {
      insumoId,
      nome: i.nome,
      unidade: i.unidade,
      tipo: i.tipo,
      ativo: i.ativo,
      vaiUsarMilesimos: vai,
      daListaMilesimos: daLista,
      deOutrosMilesimos: deOutros,
      origens: lista,
      temMilesimos: tem,
      noLivroMilesimos: noLivro,
    };
    if (i.tipo === 'PRE_PREPARO') {
      const jaProduz = produz.get(insumoId) ?? 0;
      const falta = Math.max(0, vai - tem - jaProduz);
      const precisa = vai > tem;
      contas.push({
        ...base,
        comprar: null,
        produzir: {
          situacao: falta > 0 ? 'FALTA' : precisa ? 'COBERTO' : 'TEM',
          faltaMilesimos: falta,
          produzMilesimos: jaProduz,
          paraFichas: Array.from(new Set(lista.filter((o) => o.grupo === 'LISTA').map((o) => o.de))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
        },
      });
      continue;
    }
    contas.push({ ...base, comprar: compraEmEmbalagens(Math.max(0, vai - tem), i.conteudoMilesimos, i.unidade), produzir: null });
  }
  return contas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

// ================================================================ o dinheiro da compra

export interface ValorDaCompra {
  /** Σ (1 arredondamento por item) dos que têm preço. */
  totalCentavos: number;
  /** Os que entram sem preço: o total é INCOMPLETO e a tela diz quais. */
  semPreco: string[];
  /** O valor de cada insumo que tem preço (centavos); sem preço não aparece. */
  porInsumo: Map<string, number>;
}

/**
 * O que a compra custa: embalagens × conteúdo × custo de referência, UM arredondamento por item (metade para cima),
 * somados em centavos inteiros. Insumo sem custo de referência não entra no total: vai em `semPreco` (nunca R$ 0,00).
 */
export function valorDaCompra(
  itens: readonly { insumoId: string; nome: string; totalMilesimos: number }[],
  custos: ReadonlyMap<string, Fracao | null>,
): ValorDaCompra {
  let total = 0;
  const semPreco: string[] = [];
  const porInsumo = new Map<string, number>();
  for (const i of itens) {
    const c = custos.get(i.insumoId) ?? null;
    if (!c) {
      semPreco.push(i.nome);
      continue;
    }
    const centavos = Number(centavosDaFracao(custoDoUso(c, i.totalMilesimos)));
    porInsumo.set(i.insumoId, centavos);
    total += centavos;
  }
  return { totalCentavos: total, semPreco, porInsumo };
}

// ================================================================ frases

/** "Já tem o lote 261018-03 de 5 kg para este dia" (a ficha entra de novo na lista: lote novo, com aviso). */
export function avisoDoLoteJaExistente(lotes: readonly { codigoLote: string; quantidade: string }[]): string | null {
  if (lotes.length === 0) return null;
  const l = lotes.map((x) => `${x.codigoLote} de ${x.quantidade}`);
  const lista = l.length === 1 ? l[0] : `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`;
  return `Já tem ${lotes.length === 1 ? 'o lote' : 'os lotes'} ${lista} neste dia: confirmar cria um lote novo.`;
}

/** "Produza antes de Molho especial" / "antes de A e B". */
export function fraseDoCoberto(paraFichas: readonly string[]): string {
  if (paraFichas.length === 0) return 'A lista do dia já produz o que falta.';
  const n = paraFichas.length;
  const lista = n === 1 ? paraFichas[0] : `${paraFichas.slice(0, -1).join(', ')} e ${paraFichas[n - 1]}`;
  return `Produza antes de ${lista}.`;
}
