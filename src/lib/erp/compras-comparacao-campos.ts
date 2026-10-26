/**
 * Comparação de fornecedores e de períodos (L.3) — a parte PURA (sem banco, sem Next): ler os filtros da URL, a conta que separa o
 * efeito do VOLUME do efeito do PREÇO (e a troca de fornecedor), o ranking de fornecedores por preço do item e por custo entregue e as
 * frases. O banco fica em `compras-comparacao.ts`; as telas, em `src/components/erp/telas/compras/comparacao-*.tsx`.
 *
 * Regras que atravessam tudo (decisões 374 em diante):
 *  - só se compara o MESMO insumo na MESMA unidade base; o que a L.2 chama de "sem base" (sem insumo, sem unidade, conversão que não
 *    fecha, valor zero) fica FORA da conta, mas é contado, valorizado e aberto;
 *  - preço do item = valor ÷ quantidade; custo entregue = (valor + frete atribuído) ÷ quantidade; o frete é o rateio já gravado em
 *    cada item da nota (decisão 367). Nunca se mistura um com o outro: cada número diz qual é;
 *  - variação de gasto = efeito VOLUME + efeito PREÇO, em forma simétrica (ponto médio) e em inteiros, então a soma fecha ao centavo
 *    em qualquer conjunto de itens. Não há "inflação" nem "economia": há efeito preço, efeito volume e troca de fornecedor.
 *
 * Toda conta de dinheiro e quantidade é em BigInt (centavos e milésimos): nada de ponto flutuante.
 */

import { hojeNoRio, lerData } from './compra-campos';
import {
  FRASE_DO_MOTIVO,
  lerFiltrosDoRelatorio,
  primeiroDiaDoMes,
  somarDias,
  ultimoDiaDoMes,
  type BaseDeData,
  type FiltrosDoRelatorio,
  type MotivoSemBase,
} from './compras-relatorio-campos';
import { custoDaEmbalagem, formatarDinheiro, somar, ZERO, type CustoExato, type Fracao, type Unidade } from './unidades';

// ------------------------------------------------------------------ medida

/** O que o "gasto" mede nos dois lados: o custo entregue (itens + frete atribuído) ou só o preço do item. */
export type Medida = 'entregue' | 'item';
export const MEDIDAS: Record<Medida, { rotulo: string; curto: string; explica: string }> = {
  entregue: {
    rotulo: 'Custo entregue (itens + frete)',
    curto: 'custo entregue',
    explica: 'Custo entregue é o preço do item mais a parte do frete que coube a ele, dividido pela quantidade: o que cada kg, litro ou unidade custou até chegar.',
  },
  item: {
    rotulo: 'Preço do item (sem o frete)',
    curto: 'preço do item',
    explica: 'Preço do item é só o valor da nota para aquela linha, dividido pela quantidade, sem o frete.',
  },
};
export const LISTA_DE_MEDIDAS = Object.keys(MEDIDAS) as Medida[];

/** Uma frase só para o efeito preço x efeito volume (a tela, a planilha e a ajuda usam esta). */
export const FRASE_PRECO_VOLUME =
  'Efeito volume é quanto o gasto mudou por você ter comprado mais ou menos; efeito preço é quanto mudou porque cada unidade ficou mais cara ou mais barata. Os dois somados dão a variação.';

/** Como a conta é feita, para a tela, a planilha e o ERP.md (a mesma frase). */
export const FRASE_DA_FORMULA =
  'Por insumo e unidade: efeito preço = (custo médio de B − custo médio de A) × (quantidade de A + quantidade de B) ÷ 2; efeito volume = (quantidade de B − quantidade de A) × (custo médio de A + custo médio de B) ÷ 2. Somados, dão exatamente o gasto de B menos o gasto de A.';

// ------------------------------------------------------------ aritmética

const grande = (n: number) => BigInt(Math.round(n));

/** a ÷ b em BigInt arredondado para o mais próximo, metade para longe do zero (b > 0). */
export function dividirArredondado(a: bigint, b: bigint): bigint {
  if (b <= 0n) throw new RangeError('Divisor precisa ser positivo.');
  const negativo = a < 0n;
  const m = negativo ? -a : a;
  const q = (2n * m + b) / (2n * b);
  return negativo ? -q : q;
}

/** A fração arredondada para centavos inteiros, metade para longe do zero. */
export function centavosDe(f: Fracao): number {
  return Number(dividirArredondado(f.num, f.den));
}

/**
 * O efeito PREÇO exato de um par de lados: (G1·Q0 − G0·Q1)·(Q0 + Q1) ÷ (2·Q0·Q1), em centavos. G em centavos, Q em milésimos (a
 * escala da quantidade some na conta: p = G ÷ Q, e Q aparece uma vez no numerador e uma no denominador). Precisa dos dois lados com
 * quantidade positiva.
 */
export function efeitoPrecoExato(g0: number, q0: number, g1: number, q1: number): Fracao {
  const G0 = grande(g0);
  const G1 = grande(g1);
  const Q0 = grande(q0);
  const Q1 = grande(q1);
  if (Q0 <= 0n || Q1 <= 0n) throw new RangeError('Os dois lados precisam ter quantidade.');
  return { num: (G1 * Q0 - G0 * Q1) * (Q0 + Q1), den: 2n * Q0 * Q1 };
}

/** Percentual em DÉCIMOS de ponto (12,3% = 123), metade para longe do zero. Denominador não positivo = sem base (null). */
export function percentualEmDecimos(numerador: number | bigint, denominador: number | bigint): number | null {
  const d = BigInt(denominador);
  if (d <= 0n) return null;
  return Number(dividirArredondado(BigInt(numerador) * 1000n, d));
}

// ------------------------------------------------------------ as células

/** O que o banco entrega de cada lado: uma célula por insumo × unidade × fornecedor, SÓ com as linhas comparáveis. */
export interface Celula {
  insumoId: string;
  insumo: string;
  unidade: Unidade;
  /** "-" = a nota não tem fornecedor. */
  fornecedorId: string;
  fornecedor: string;
  notas: number;
  linhas: number;
  quantidadeMilesimos: number;
  valorCentavos: number;
  freteCentavos: number;
}

export interface Lado {
  notas: number;
  linhas: number;
  quantidadeMilesimos: number;
  valorCentavos: number;
  freteCentavos: number;
  /** O gasto pela medida escolhida. */
  gastoCentavos: number;
  /** Custo médio ponderado pela medida escolhida (R$ por unidade base). */
  custo: CustoExato | null;
}

const gastoDa = (c: Pick<Celula, 'valorCentavos' | 'freteCentavos'>, m: Medida) => c.valorCentavos + (m === 'entregue' ? c.freteCentavos : 0);

function juntar(celulas: Celula[], m: Medida): Lado | null {
  if (celulas.length === 0) return null;
  const q = celulas.reduce((s, c) => s + c.quantidadeMilesimos, 0);
  const g = celulas.reduce((s, c) => s + gastoDa(c, m), 0);
  return {
    // Uma nota tem um fornecedor só: as notas das células de fornecedores diferentes nunca se repetem, então a soma é a contagem certa.
    notas: celulas.reduce((s, c) => s + c.notas, 0),
    linhas: celulas.reduce((s, c) => s + c.linhas, 0),
    quantidadeMilesimos: q,
    valorCentavos: celulas.reduce((s, c) => s + c.valorCentavos, 0),
    freteCentavos: celulas.reduce((s, c) => s + c.freteCentavos, 0),
    gastoCentavos: g,
    custo: custoDaEmbalagem(g, 0, q),
  };
}

export type SituacaoDoItem = 'ambos' | 'so-a' | 'so-b';

export interface FornecedorComparado {
  fornecedorId: string;
  fornecedor: string;
  a: Lado | null;
  b: Lado | null;
  /** Efeito preço DESTE fornecedor (só quando ele está nos dois lados), em centavos arredondados. */
  efeitoPrecoCentavos: number | null;
}

export interface ItemComparado {
  chave: string;
  insumoId: string;
  insumo: string;
  unidade: Unidade;
  situacao: SituacaoDoItem;
  a: Lado | null;
  b: Lado | null;
  /** B − A (só A: −gasto de A; só B: +gasto de B). */
  variacaoCentavos: number;
  /** Os efeitos só existem com compra comparável nos DOIS lados. */
  volumeCentavos: number | null;
  precoCentavos: number | null;
  /** Dentro do efeito preço: a parte que vem de fornecedores presentes nos dois lados mudando o próprio preço. */
  mesmoFornecedorCentavos: number | null;
  /** Dentro do efeito preço: o que sobra, vindo de trocar de fornecedor ou mudar a fatia de cada um. */
  trocaCentavos: number | null;
  /** Só em B: o gasto inteiro entrou. */
  entrouCentavos: number;
  /** Só em A: o gasto inteiro saiu (negativo). */
  saiuCentavos: number;
  /** Variação do custo médio em décimos de ponto; null = sem base (falta um lado). */
  variacaoDoCustoDecimos: number | null;
  fornecedores: FornecedorComparado[];
}

/** Compara um insumo × unidade: as células de A e de B (todas do mesmo insumo e unidade). */
export function compararItem(a: Celula[], b: Celula[], medida: Medida): ItemComparado {
  const ref = (a[0] ?? b[0])!;
  const ladoA = juntar(a, medida);
  const ladoB = juntar(b, medida);
  const ids = Array.from(new Set([...a.map((c) => c.fornecedorId), ...b.map((c) => c.fornecedorId)]));
  const porId = (cs: Celula[], id: string) => cs.filter((c) => c.fornecedorId === id);
  let mesmo: Fracao = ZERO;
  const fornecedores: FornecedorComparado[] = ids
    .map((id) => {
      const ca = porId(a, id);
      const cb = porId(b, id);
      const fa = juntar(ca, medida);
      const fb = juntar(cb, medida);
      let efeito: number | null = null;
      if (fa && fb && fa.quantidadeMilesimos > 0 && fb.quantidadeMilesimos > 0) {
        const exato = efeitoPrecoExato(fa.gastoCentavos, fa.quantidadeMilesimos, fb.gastoCentavos, fb.quantidadeMilesimos);
        mesmo = somar(mesmo, exato);
        efeito = centavosDe(exato);
      }
      return { fornecedorId: id, fornecedor: (ca[0] ?? cb[0])!.fornecedor, a: fa, b: fb, efeitoPrecoCentavos: efeito };
    })
    .sort((x, y) => (y.b?.gastoCentavos ?? 0) + (y.a?.gastoCentavos ?? 0) - ((x.b?.gastoCentavos ?? 0) + (x.a?.gastoCentavos ?? 0)) || x.fornecedor.localeCompare(y.fornecedor, 'pt-BR') || x.fornecedorId.localeCompare(y.fornecedorId));

  const base = { chave: `${ref.insumoId}|${ref.unidade}`, insumoId: ref.insumoId, insumo: ref.insumo, unidade: ref.unidade, a: ladoA, b: ladoB, fornecedores };
  if (ladoA && ladoB) {
    const variacao = ladoB.gastoCentavos - ladoA.gastoCentavos;
    const preco = centavosDe(efeitoPrecoExato(ladoA.gastoCentavos, ladoA.quantidadeMilesimos, ladoB.gastoCentavos, ladoB.quantidadeMilesimos));
    const mesmoFornecedor = centavosDe(mesmo);
    return {
      ...base,
      situacao: 'ambos',
      variacaoCentavos: variacao,
      precoCentavos: preco,
      volumeCentavos: variacao - preco,
      mesmoFornecedorCentavos: mesmoFornecedor,
      trocaCentavos: preco - mesmoFornecedor,
      entrouCentavos: 0,
      saiuCentavos: 0,
      variacaoDoCustoDecimos: percentualEmDecimos(
        BigInt(ladoB.gastoCentavos) * BigInt(ladoA.quantidadeMilesimos) - BigInt(ladoA.gastoCentavos) * BigInt(ladoB.quantidadeMilesimos),
        BigInt(ladoA.gastoCentavos) * BigInt(ladoB.quantidadeMilesimos),
      ),
    };
  }
  const so = ladoB ?? ladoA!;
  return {
    ...base,
    situacao: ladoB ? 'so-b' : 'so-a',
    variacaoCentavos: ladoB ? so.gastoCentavos : -so.gastoCentavos,
    volumeCentavos: null,
    precoCentavos: null,
    mesmoFornecedorCentavos: null,
    trocaCentavos: null,
    entrouCentavos: ladoB ? so.gastoCentavos : 0,
    saiuCentavos: ladoB ? 0 : -so.gastoCentavos,
    variacaoDoCustoDecimos: null,
  };
}

export interface ResumoDaComparacao {
  /** Gasto comparável de cada lado (pela medida): a base da conta. */
  gastoACentavos: number;
  gastoBCentavos: number;
  variacaoCentavos: number;
  /** Variação em décimos de ponto sobre A; null = A sem compra comparável (sem base). */
  variacaoDecimos: number | null;
  volumeCentavos: number;
  precoCentavos: number;
  mesmoFornecedorCentavos: number;
  trocaCentavos: number;
  entrouCentavos: number;
  saiuCentavos: number;
  /** Quantos insumos × unidade estão nos dois lados / só em B / só em A. */
  nosDois: number;
  soEmB: number;
  soEmA: number;
  /** volume + preço + entrou + saiu = variação (conferido, e a tela escreve a soma). */
  fecha: boolean;
  /** Um dos lados não tem NENHUMA compra comparável: não há variação, nem % (a manchete é "sem base"), nem efeito volume ou preço. */
  semCompraA: boolean;
  semCompraB: boolean;
  /** "Entrou" (insumos novos) é a maior parte de uma variação positiva: a tela diz junto ao %. */
  entrouDomina: boolean;
}

export function resumirItens(itens: ItemComparado[]): ResumoDaComparacao {
  const soma = (f: (i: ItemComparado) => number | null) => itens.reduce((s, i) => s + (f(i) ?? 0), 0);
  const gastoA = itens.reduce((s, i) => s + (i.a?.gastoCentavos ?? 0), 0);
  const gastoB = itens.reduce((s, i) => s + (i.b?.gastoCentavos ?? 0), 0);
  const variacao = gastoB - gastoA;
  const semA = itens.every((i) => !i.a);
  const semB = itens.every((i) => !i.b);
  const r = {
    gastoACentavos: gastoA,
    gastoBCentavos: gastoB,
    variacaoCentavos: variacao,
    variacaoDecimos: semA || semB ? null : percentualEmDecimos(variacao, gastoA),
    volumeCentavos: soma((i) => i.volumeCentavos),
    precoCentavos: soma((i) => i.precoCentavos),
    mesmoFornecedorCentavos: soma((i) => i.mesmoFornecedorCentavos),
    trocaCentavos: soma((i) => i.trocaCentavos),
    entrouCentavos: soma((i) => i.entrouCentavos),
    saiuCentavos: soma((i) => i.saiuCentavos),
    nosDois: itens.filter((i) => i.situacao === 'ambos').length,
    soEmB: itens.filter((i) => i.situacao === 'so-b').length,
    soEmA: itens.filter((i) => i.situacao === 'so-a').length,
  };
  return {
    ...r,
    fecha: r.volumeCentavos + r.precoCentavos + r.entrouCentavos + r.saiuCentavos === variacao,
    semCompraA: semA,
    semCompraB: semB,
    entrouDomina: !semA && !semB && variacao > 0 && r.entrouCentavos * 2 > variacao,
  };
}

export interface Comparacao {
  itens: ItemComparado[];
  resumo: ResumoDaComparacao;
}

/** Compara dois conjuntos de células (A e B) pela medida: um item por insumo × unidade, do que mais mexeu no gasto ao que menos. */
export function compararPeriodos(a: Celula[], b: Celula[], medida: Medida): Comparacao {
  const chaves = new Map<string, { a: Celula[]; b: Celula[] }>();
  const pega = (c: Celula) => {
    const k = `${c.insumoId}|${c.unidade}`;
    let e = chaves.get(k);
    if (!e) chaves.set(k, (e = { a: [], b: [] }));
    return e;
  };
  for (const c of a) pega(c).a.push(c);
  for (const c of b) pega(c).b.push(c);
  const itens = Array.from(chaves.values())
    .map((e) => compararItem(e.a, e.b, medida))
    .sort((x, y) => Math.abs(y.variacaoCentavos) - Math.abs(x.variacaoCentavos) || x.insumo.localeCompare(y.insumo, 'pt-BR') || x.chave.localeCompare(y.chave));
  return { itens, resumo: resumirItens(itens) };
}

// -------------------------------------------------------------- fornecedores

/** O que se sabe de um fornecedor × unidade neste insumo e período: só as linhas comparáveis entram no preço. */
export interface FornecedorDoInsumo {
  fornecedorId: string;
  fornecedor: string;
  unidade: Unidade | null;
  notas: number;
  linhas: number;
  /** Todas as linhas (com e sem base): para dizer quantas ficaram de fora. */
  linhasSemBase: number;
  comparavel: { linhas: number; quantidadeMilesimos: number; valorCentavos: number; freteCentavos: number };
  embalagens: string[];
  ultima: { data: string; notaId: string; rotuloDaNota: string; quantidadeMilesimos: number; valorCentavos: number; freteCentavos: number } | null;
}

export interface FornecedorRanqueado extends FornecedorDoInsumo {
  precoDoItem: CustoExato | null;
  custoEntregue: CustoExato | null;
  maisBaratoNoItem: boolean;
  maisBaratoEntregue: boolean;
  /** Diferença para o mais barato, em centavos por unidade base (fração exata) e em décimos de ponto. Nulo no mais barato e quando não há base. */
  difItem: { porUnidade: Fracao; decimos: number } | null;
  difEntregue: { porUnidade: Fracao; decimos: number } | null;
  /** Parte do frete no custo entregue, em décimos de ponto do preço do item. */
  fretePesaDecimos: number | null;
}

function menorCusto(cs: (CustoExato | null)[]): CustoExato | null {
  let m: CustoExato | null = null;
  for (const c of cs) if (c && (!m || BigInt(c.centavos) * BigInt(m.milesimos) < BigInt(m.centavos) * BigInt(c.milesimos))) m = c;
  return m;
}
const igual = (a: CustoExato, b: CustoExato) => BigInt(a.centavos) * BigInt(b.milesimos) === BigInt(b.centavos) * BigInt(a.milesimos);

/** Diferença de `c` para o mais barato `min`: centavos por unidade (exato) e décimos de ponto sobre o mais barato. */
function diferenca(c: CustoExato, min: CustoExato): { porUnidade: Fracao; decimos: number } | null {
  const dif = BigInt(c.centavos) * BigInt(min.milesimos) - BigInt(min.centavos) * BigInt(c.milesimos);
  if (dif === 0n) return null;
  const dec = percentualEmDecimos(dif, BigInt(min.centavos) * BigInt(c.milesimos));
  return dec === null ? null : { porUnidade: { num: dif * 1000n, den: BigInt(c.milesimos) * BigInt(min.milesimos) }, decimos: dec };
}

export interface TabelaDeUnidade {
  unidade: Unidade;
  fornecedores: FornecedorRanqueado[];
  /** Fornecedores com base nesta unidade (só com 2 ou mais há o que comparar). */
  comBase: number;
}

/**
 * Os fornecedores de UM insumo, uma tabela por unidade. O "mais barato" é dito DUAS vezes (preço do item e custo entregue) porque o
 * frete pode inverter a ordem. Ordem: custo entregue crescente (quem não tem base vai para o fim); empate pelo nome.
 */
export function ranquearFornecedores(lista: FornecedorDoInsumo[]): { tabelas: TabelaDeUnidade[]; semUnidade: FornecedorDoInsumo[] } {
  const comUnidade = lista.filter((f) => f.unidade);
  const unidades = Array.from(new Set(comUnidade.map((f) => f.unidade as Unidade))).sort((x, y) => ({ KG: 0, L: 1, UN: 2 })[x] - ({ KG: 0, L: 1, UN: 2 })[y]);
  const tabelas = unidades.map((u): TabelaDeUnidade => {
    const doGrupo = comUnidade.filter((f) => f.unidade === u);
    const base = doGrupo.map((f) => ({
      f,
      item: custoDaEmbalagem(f.comparavel.valorCentavos, 0, f.comparavel.quantidadeMilesimos),
      entregue: custoDaEmbalagem(f.comparavel.valorCentavos, f.comparavel.freteCentavos, f.comparavel.quantidadeMilesimos),
    }));
    const comBase = base.filter((x) => x.item).length;
    const minItem = comBase >= 2 ? menorCusto(base.map((x) => x.item)) : null;
    const minEntregue = comBase >= 2 ? menorCusto(base.map((x) => x.entregue)) : null;
    const ranqueados = base.map(({ f, item, entregue }): FornecedorRanqueado => ({
      ...f,
      precoDoItem: item,
      custoEntregue: entregue,
      maisBaratoNoItem: !!(minItem && item && igual(item, minItem)),
      maisBaratoEntregue: !!(minEntregue && entregue && igual(entregue, minEntregue)),
      difItem: minItem && item ? diferenca(item, minItem) : null,
      difEntregue: minEntregue && entregue ? diferenca(entregue, minEntregue) : null,
      fretePesaDecimos: item && entregue ? percentualEmDecimos(BigInt(entregue.centavos) * BigInt(item.milesimos) - BigInt(item.centavos) * BigInt(entregue.milesimos), BigInt(item.centavos) * BigInt(entregue.milesimos)) : null,
    }));
    ranqueados.sort((x, y) => {
      if (!!x.custoEntregue !== !!y.custoEntregue) return x.custoEntregue ? -1 : 1;
      if (x.custoEntregue && y.custoEntregue) {
        const c = BigInt(x.custoEntregue.centavos) * BigInt(y.custoEntregue.milesimos) - BigInt(y.custoEntregue.centavos) * BigInt(x.custoEntregue.milesimos);
        if (c !== 0n) return c < 0n ? -1 : 1;
      }
      return x.fornecedor.localeCompare(y.fornecedor, 'pt-BR') || x.fornecedorId.localeCompare(y.fornecedorId);
    });
    return { unidade: u, fornecedores: ranqueados, comBase };
  });
  return { tabelas, semUnidade: lista.filter((f) => !f.unidade) };
}

// -------------------------------------------------------------- os filtros

export interface FiltrosDePeriodos {
  /** Lojas, fornecedor, insumo, busca, categoria e data usada valem para os DOIS lados; `de` e `ate` são os do período A. */
  rel: FiltrosDoRelatorio;
  deB: string;
  ateB: string;
  medida: Medida;
  pagina: number;
  porPagina: number;
  /** Frase quando um dos períodos não faz sentido (o relatório sai vazio, com a frase). */
  periodoInvalido: string | null;
}

type Params = Record<string, string | string[] | undefined>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const ANO_MINIMO = '2000-01-01';
const ANO_MAXIMO = '2100-12-31';

function fraseDoErro(nome: 'A' | 'B', de: string, ate: string): string | null {
  if (ate < de) return `No período ${nome}, a data final vem antes da inicial. Corrija para comparar.`;
  if (de < ANO_MINIMO || ate > ANO_MAXIMO) return `Escolha datas entre 2000 e 2100 no período ${nome}.`;
  return null;
}

/** Quantos dias tem o período (inclusive o primeiro e o último). */
export function diasDoPeriodo(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Os dois períodos padrão: os últimos 30 dias (B) contra os 30 dias antes deles (A): mesmo tamanho, sem buraco. */
export function periodosPadrao(hoje: string): { de: string; ate: string; deB: string; ateB: string } {
  return { de: somarDias(hoje, -59), ate: somarDias(hoje, -30), deB: somarDias(hoje, -29), ateB: hoje };
}

/** A comparação de fornecedores usa os filtros do relatório da L.2; sem datas na URL, os últimos 90 dias (como o histórico do insumo). */
export function lerFiltrosDeFornecedores(sp: Params, hoje = hojeNoRio()): FiltrosDoRelatorio {
  return { ...lerFiltrosDoRelatorio(sp, hoje, { de: somarDias(hoje, -89) }), agrupar: 'fornecedor', situacao: 'lancadas', ver: 'resumo', grupo: '', unidade: '', so: '' };
}

export function lerFiltrosDePeriodos(sp: Params, hoje = hojeNoRio()): FiltrosDePeriodos {
  const p = periodosPadrao(hoje);
  const rel = lerFiltrosDoRelatorio({ ...sp, de: undefined, ate: undefined }, hoje, { de: p.de, ate: p.ate, ver: 'resumo' });
  const de = lerData(um(sp.de)) ?? p.de;
  const ate = lerData(um(sp.ate)) ?? p.ate;
  const deB = lerData(um(sp.de2)) ?? p.deB;
  const ateB = lerData(um(sp.ate2)) ?? p.ateB;
  const periodoInvalido = fraseDoErro('A', de, ate) ?? fraseDoErro('B', deB, ateB);
  const medida = um(sp.medida) === 'item' ? 'item' : 'entregue';
  return {
    rel: { ...rel, de, ate, agrupar: 'insumo', situacao: 'lancadas', ver: 'resumo', grupo: '', unidade: '', so: '', periodoInvalido },
    deB,
    ateB,
    medida,
    pagina: rel.pagina,
    porPagina: rel.porPagina,
    periodoInvalido,
  };
}

/** A URL da comparação de períodos com estes filtros (e as mudanças pedidas): sempre leva as quatro datas e a data usada. */
/** O que se pode mudar numa URL de comparação: os campos da comparação e, dentro de `rel`, os filtros do relatório. */
export type MudancaDosPeriodos = Omit<Partial<FiltrosDePeriodos>, 'rel'> & { rel?: Partial<FiltrosDoRelatorio> };

export function queryDosPeriodos(f: FiltrosDePeriodos, mudar: MudancaDosPeriodos = {}, opcoes: { semPagina?: boolean } = {}): string {
  const x = { ...f, ...mudar, rel: { ...f.rel, ...(mudar.rel ?? {}) } };
  const q = new URLSearchParams();
  for (const l of x.rel.lojaIds) q.append('loja', l);
  if (x.rel.rede && x.rel.lojaIds.length === 0) q.set('rede', '1');
  if (x.rel.fornecedorId) q.set('fornecedor', x.rel.fornecedorId);
  if (x.rel.insumoId) q.set('insumo', x.rel.insumoId);
  if (x.rel.q) q.set('q', x.rel.q);
  if (x.rel.categoriaId) q.set('categoria', x.rel.categoriaId);
  q.set('de', x.rel.de);
  q.set('ate', x.rel.ate);
  q.set('de2', x.deB);
  q.set('ate2', x.ateB);
  q.set('base', x.rel.base);
  if (x.medida !== 'entregue') q.set('medida', x.medida);
  if (x.porPagina !== 50) q.set('por', String(x.porPagina));
  if (!opcoes.semPagina && x.pagina > 1) q.set('pagina', String(x.pagina));
  if (x.rel.volta) q.set('volta', x.rel.volta);
  return q.toString();
}

/** Os atalhos de comparação: cada um escolhe os dois períodos de uma vez (links que mantêm os outros filtros). */
export function atalhosDeComparacao(hoje: string): { chave: string; rotulo: string; de: string; ate: string; deB: string; ateB: string }[] {
  const dia = Number(hoje.slice(8, 10));
  const mesPassado = somarDias(primeiroDiaDoMes(hoje), -1);
  const retrasado = somarDias(primeiroDiaDoMes(mesPassado), -1);
  const inicioMesPassado = primeiroDiaDoMes(mesPassado);
  // "Mesmo trecho do mês passado": do dia 1 até o mesmo dia do mês, sem passar do fim do mês passado (31 de março contra fevereiro).
  const ateMesmoDia = somarDias(inicioMesPassado, Math.min(dia, Number(ultimoDiaDoMes(mesPassado).slice(8, 10))) - 1);
  return [
    { chave: '30dias', rotulo: '30 dias × 30 dias antes', ...periodosPadrao(hoje) },
    { chave: '7dias', rotulo: '7 dias × 7 dias antes', de: somarDias(hoje, -13), ate: somarDias(hoje, -7), deB: somarDias(hoje, -6), ateB: hoje },
    { chave: 'mes-ate-hoje', rotulo: 'Este mês até hoje × mesmo trecho do mês passado', de: inicioMesPassado, ate: ateMesmoDia, deB: primeiroDiaDoMes(hoje), ateB: hoje },
    { chave: 'mes-passado', rotulo: 'Mês passado × mês retrasado', de: primeiroDiaDoMes(retrasado), ate: ultimoDiaDoMes(retrasado), deB: inicioMesPassado, ateB: ultimoDiaDoMes(mesPassado) },
  ];
}

/** O período imediatamente anterior, do mesmo tamanho (7 dias viram os 7 anteriores; o mês inteiro, os mesmos dias antes). */
export function periodoAnterior(de: string, ate: string): { de: string; ate: string } {
  const n = diasDoPeriodo(de, ate);
  const fim = somarDias(de, -1);
  return { de: somarDias(fim, -(n - 1)), ate: fim };
}

/** O endereço (só a busca) de "Comparar com o período anterior" a partir de um relatório da L.2: B é o período dele, A o anterior. */
export function queryParaCompararComOAnterior(f: FiltrosDoRelatorio): string {
  const a = periodoAnterior(f.de, f.ate);
  return queryDosPeriodos(
    { rel: { ...f, de: a.de, ate: a.ate, volta: '' }, deB: f.de, ateB: f.ate, medida: 'entregue', pagina: 1, porPagina: 50, periodoInvalido: null },
    {},
    { semPagina: true },
  );
}

// -------------------------------------------------------------- os avisos

export interface AvisoDaComparacao {
  chave: string;
  texto: string;
}

/** Os avisos de cobertura que só dependem das datas: tamanhos diferentes, sobreposição e período que ainda não terminou. */
export function avisosDeDatas(f: { de: string; ate: string; deB: string; ateB: string }, hoje: string): AvisoDaComparacao[] {
  const avisos: AvisoDaComparacao[] = [];
  const dA = diasDoPeriodo(f.de, f.ate);
  const dB = diasDoPeriodo(f.deB, f.ateB);
  if (dA !== dB) {
    avisos.push({
      chave: 'tamanhos',
      texto: `O período A tem ${dA} ${dA === 1 ? 'dia' : 'dias'} e o B tem ${dB} ${dB === 1 ? 'dia' : 'dias'}. O gasto e a quantidade crescem só por haver mais dias, e isso entra no efeito volume. O custo médio de cada insumo não depende do tamanho do período.`,
    });
  }
  if (f.de <= f.ateB && f.deB <= f.ate) {
    avisos.push({ chave: 'sobrepoe', texto: 'Os períodos se sobrepõem: as mesmas compras entram nos dois lados, e por isso a diferença parece menor do que é.' });
  }
  const emAndamento = [f.ate > hoje ? 'A' : '', f.ateB > hoje ? 'B' : ''].filter(Boolean);
  if (emAndamento.length) {
    const quem = emAndamento.length === 2 ? 'Os períodos A e B terminam' : `O período ${emAndamento[0]} termina`;
    avisos.push({ chave: 'andamento', texto: `${quem} depois de hoje: só entram as compras já lançadas, e o resto ainda pode chegar.` });
  }
  return avisos;
}

/** O que o aviso de cobertura precisa de cada lado (a `LadoDaTela` do banco serve). */
export interface LadoParaAviso {
  de: string;
  ate: string;
  celulas: unknown[];
  semBase: { linhas: number; valorCentavos: number; freteCentavos: number; porMotivo: Partial<Record<MotivoSemBase, number>> };
  dinheiroTotalCentavos: number;
  dinheiroComparavelCentavos: number;
  semEmissao: number | null;
}

export interface AvisoDeCobertura extends AvisoDaComparacao {
  /** O aviso fala das linhas sem base deste lado: a tela põe o link que as abre. */
  semBaseDoLado?: 'A' | 'B';
}

const plural = (n: number, um: string, varios: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
const faixaBr = (de: string, ate: string) => {
  const br = (d: string) => d.split('-').reverse().join('/');
  return de === ate ? br(de) : `${br(de)} a ${br(ate)}`;
};

/** TODOS os avisos de uma comparação (datas, cobertura, lado sem compra, notas sem emissão, documentos aguardando): a tela e o CSV dizem as mesmas frases. */
export function avisosDaComparacao(f: { de: string; ate: string; deB: string; ateB: string }, a: LadoParaAviso, b: LadoParaAviso, aguardando: number, hoje: string): AvisoDeCobertura[] {
  const avisos: AvisoDeCobertura[] = avisosDeDatas(f, hoje);
  if (a.celulas.length === 0 && b.celulas.length === 0) {
    avisos.push({ chave: 'sem-ambos', texto: `Nenhum dos dois períodos teve compra comparável neste recorte (A: ${faixaBr(a.de, a.ate)}; B: ${faixaBr(b.de, b.ate)}): não há o que comparar. Confira os períodos, os filtros e a data usada.` });
  } else if (a.celulas.length === 0) {
    avisos.push({ chave: 'sem-a', texto: `No período A (${faixaBr(a.de, a.ate)}) não houve compra comparável neste recorte. Não há variação a calcular (sem base) e tudo o que B comprou aparece como “entrou”: não dá para dizer se o preço subiu ou desceu.` });
  }
  else if (b.celulas.length === 0) {
    avisos.push({ chave: 'sem-b', texto: `No período B (${faixaBr(b.de, b.ate)}) não houve compra comparável neste recorte. Não há variação a calcular (sem base) e tudo o que A comprou aparece como “saiu”: não dá para dizer se o preço subiu ou desceu.` });
  }
  for (const [nome, l] of [['A', a], ['B', b]] as const) {
    if (l.semBase.linhas > 0) {
      const pct = l.dinheiroTotalCentavos > 0 ? Math.floor((l.dinheiroComparavelCentavos * 1000) / l.dinheiroTotalCentavos) : null;
      const m = l.semBase.porMotivo;
      const motivos = (Object.keys(m) as MotivoSemBase[]).filter((k) => m[k]).map((k) => `${plural(m[k] ?? 0, 'linha', 'linhas')}: ${FRASE_DO_MOTIVO[k]}`).join('; ');
      avisos.push({
        chave: `base-${nome}`,
        semBaseDoLado: nome,
        texto: `Cobertura incompleta no período ${nome}: ${plural(l.semBase.linhas, 'linha', 'linhas')} (${formatarDinheiro(l.semBase.valorCentavos + l.semBase.freteCentavos)}) ficou fora da conta por falta de base${pct === null ? '' : pct === 0 ? ', e nada do que foi comprado entra na conta' : `, e a comparação cobre ${formatarPercentual(pct).replace('+', '')} do dinheiro comprado`}. ${motivos}.`,
      });
    }
    if (l.semEmissao) {
      avisos.push({ chave: `emissao-${nome}`, texto: `${plural(l.semEmissao, 'nota lançada no período', 'notas lançadas no período')} ${nome} não ${l.semEmissao === 1 ? 'tem' : 'têm'} data de emissão (foram digitadas à mão) e ficou de fora. Para vê-las, use a data da entrada.` });
    }
  }
  if (aguardando > 0) {
    avisos.push({ chave: 'aguardando', texto: `${plural(aguardando, 'nota fiscal recebida (XML) aguarda', 'notas fiscais recebidas (XML) aguardam')} conferência e não ${aguardando === 1 ? 'conta' : 'contam'} como compra nos dois períodos até serem conciliadas.` });
  }
  return avisos;
}

// -------------------------------------------------------------- formatação

const MENOS = '−';

/** "+R$ 42,50", "−R$ 6,25" ou "R$ 0,00" (sinal à frente: quem lê vê o sentido, sem depender de cor). */
export function formatarVariacao(centavos: number): string {
  if (centavos === 0) return formatarDinheiro(0);
  return `${centavos > 0 ? '+' : MENOS}${formatarDinheiro(Math.abs(centavos))}`;
}

/** Décimos de ponto em "+12,3%", "−4,5%" ou "0,0%"; null = "sem base". */
export function formatarPercentual(decimos: number | null): string {
  if (decimos === null) return 'sem base';
  const abs = Math.abs(decimos);
  const t = `${Math.trunc(abs / 10).toLocaleString('pt-BR')},${abs % 10}%`;
  return decimos === 0 ? t : `${decimos > 0 ? '+' : MENOS}${t}`;
}

/** O mesmo percentual para a planilha: ASCII, vírgula decimal, sem o símbolo. */
export function percentualParaPlanilha(decimos: number | null): string {
  if (decimos === null) return '';
  const abs = Math.abs(decimos);
  return `${decimos < 0 ? '-' : ''}${Math.trunc(abs / 10)},${abs % 10}`;
}

/** Centavos com sinal para a planilha: "-6,25". */
export function variacaoParaPlanilha(centavos: number): string {
  const abs = Math.abs(centavos);
  return `${centavos < 0 ? '-' : ''}${Math.trunc(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

export type { BaseDeData };
