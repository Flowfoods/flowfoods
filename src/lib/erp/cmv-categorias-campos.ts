/**
 * Metas por categoria e CMV gerencial por categoria (I.2a) — a CONTA e as regras, puras (sem banco e sem Next).
 *
 * O CMV gerencial é o CMV do DRE aberto em categorias: a linha `cmv` do DRE é a soma das categorias (mais, no período
 * encerrado sem o real aberto, a variação do estoque), ao centavo. O painel é leitura, não linha nova (decisão 274).
 *
 *  - a categoria é a DE HOJE do insumo, em todas as parcelas (decisão 270): reclassificar um insumo muda o período ao vivo
 *    inteiro de uma vez, e o total não muda. O período FECHADO lê a fotografia (nome e id da categoria da época);
 *  - a meta é % da RECEITA BRUTA, como a do DRE (base bruta, não líquida: um CMV só, decisão 272). A meta TOTAL é a da linha
 *    `cmv` do DRE (uma fonte só); as metas por categoria dividem esse total e podem não fechar nele: é aviso, não bloqueio;
 *  - o farol é o da 2.4 (`faixaDoDesvio`, escala de custo), e a regra do "sem cor" também: quando o dado não fecha, o desvio
 *    fica em texto e o motivo por extenso. A isso se soma o limiar de "a classificar" (decisão 278);
 *  - "Outros / a classificar" e "Sem categoria" nunca têm farol: o que está lá é fila de classificação, não custo da natureza;
 *  - o desvio tem o MESMO sinal do DRE (realizado menos meta): positivo é custo acima da meta;
 *  - (I.2b) quando a loja tem o retrato por insumo nos dois estoques, o realizado da categoria é o CMV REAL dela: estoque inicial + entradas
 *    do livro − estoque final (com o corte da 2.3), tudo na categoria de HOJE do insumo; o estoque de pré-preparo vai à linha própria;
 *    sem o retrato, a loja segue pelas compras e a diferença para o real do DRE vai na linha de variação do estoque.
 */

import { CATEGORIAS_PADRAO, CHAVE_DO_SISTEMA } from './categoria-campos';
import { dividirExato, percentualDaReceita } from './dre-campos';
import { lerMetaDigitada, metaParaCampo } from './dre-metas-campos';
import { faixaDoDesvio, FAIXAS_DO_FAROL, rotuloDoFarol, type FaixasDoFarol } from './farol-campos';
import type { FarolDaLinha } from './farol-dre-campos';
import { formatarDinheiro, formatarPontosBase } from './unidades';

// ================================================================ o texto dos percentuais

const duasCasas = (bp: number) => (Math.abs(bp) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "29,00%" (pontos-base, duas casas). */
export const percentualComDuasCasas = (bp: number) => `${duasCasas(bp)}%`;

/** "+1,00 pp" / "−3,00 pp" (diferença entre dois percentuais, duas casas; o espaço não quebra). */
export const pontosComDuasCasas = (bp: number) => `${bp < 0 ? '−' : '+'}${duasCasas(bp)} pp`;

// ================================================================ o modelo de 32 %

/** A marca do conjunto que nasceu de "Usar o modelo de 32%" (vai na coluna `aplicouModelo`). */
export const MODELO_32 = 'MODELO_32';
export const TOTAL_DO_MODELO_32_BP = 3200;

/** O modelo do plano (19/10/2026), por `chave` estável: sobrevive ao renomear. Soma 32,00 %. */
export const PERCENTUAIS_DO_MODELO_32: Readonly<Record<string, number>> = Object.freeze({
  PROTEINA: 1100,
  HORTIFRUTI: 300,
  MERCEARIA: 500,
  LATICINIOS: 400,
  CONGELADOS: 200,
  PANIFICACAO: 200,
  BEBIDAS: 300,
  DESCARTAVEIS: 150,
  LIMPEZA: 50,
  OUTROS: 0,
});

export const FRASE_DO_MODELO_32 = 'Referência ilustrativa, não limite: cada casa ajusta os percentuais à sua operação. Nada foi gravado; confira, edite e salve.';

export interface CategoriaParaMeta {
  id: string;
  chave: string | null;
  nome: string;
  ordem: number;
  ativa: boolean;
  sistema: boolean;
}

export interface ResultadoDoModelo {
  /** Texto de cada campo, por id da categoria (vazio = sem meta). Substitui o formulário inteiro. */
  campos: Record<string, string>;
  /** O campo do total. */
  total: string;
  /** Quantas categorias da casa receberam percentual do modelo. */
  aplicadas: number;
  /** As do modelo que a casa não tem (excluída ou desativada), com o percentual que ficou de fora. */
  ausentes: { nome: string; bp: number }[];
  frase: string;
}

/** As metas do modelo nesta casa: categoria ativa (pela chave) → pontos-base. A renomeada mantém; a sem chave não entra. */
export function metasDoModelo32(categorias: readonly CategoriaParaMeta[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const [chave, bp] of Object.entries(PERCENTUAIS_DO_MODELO_32)) {
    const c = categorias.find((x) => x.chave === chave && x.ativa);
    if (c) out.set(c.id, bp);
  }
  return out;
}

/**
 * "Usar o modelo de 32%": PREENCHE o formulário, não grava. Casa pela `chave`; a renomeada mantém; a categoria da casa sem
 * chave fica vazia; a padrão excluída ou desativada não entra e a frase diz ("Bebidas (3%) não existe nesta casa").
 */
export function aplicarModelo32(categorias: readonly CategoriaParaMeta[]): ResultadoDoModelo {
  const campos: Record<string, string> = {};
  const ausentes: ResultadoDoModelo['ausentes'] = [];
  const doModelo = metasDoModelo32(categorias);
  for (const c of categorias) campos[c.id] = doModelo.has(c.id) ? metaParaCampo(doModelo.get(c.id)!) : '';
  for (const [chave, bp] of Object.entries(PERCENTUAIS_DO_MODELO_32)) {
    if (categorias.some((c) => c.chave === chave && c.ativa)) continue;
    const existente = categorias.find((c) => c.chave === chave);
    ausentes.push({ nome: existente?.nome ?? CATEGORIAS_PADRAO.find((p) => p.chave === chave)?.nome ?? chave, bp });
  }
  const aplicadas = doModelo.size;
  const quais = ausentes.filter((a) => a.bp > 0);
  const faltou = quais.length ? ` ${quais.map((a) => `${a.nome} (${formatarPontosBase(a.bp)}) não existe nesta casa`).join('; ')}.` : '';
  return {
    campos,
    total: metaParaCampo(TOTAL_DO_MODELO_32_BP),
    aplicadas,
    ausentes: quais,
    frase: `Modelo de 32% preenchido em ${aplicadas} ${aplicadas === 1 ? 'categoria' : 'categorias'}.${faltou} ${FRASE_DO_MODELO_32}`,
  };
}

// ================================================================ a soma e o aviso

/** A soma das metas lidas, em pontos-base. */
export const somaDasMetas = (metas: ReadonlyMap<string, number>) => Array.from(metas.values()).reduce((s, v) => s + v, 0);

/**
 * O aviso de que a divisão não fecha no total: "Soma 29,00% · total 32,00% · diferença −3,00 pp". Aviso, nunca bloqueio.
 * Sem total, não há com o que comparar: sem aviso.
 */
export function avisoDaSoma(somaBp: number, totalBp: number | null): string | null {
  if (totalBp === null || somaBp === totalBp) return null;
  return `Soma ${percentualComDuasCasas(somaBp)} · total ${percentualComDuasCasas(totalBp)} · diferença ${pontosComDuasCasas(somaBp - totalBp)}`;
}

// ================================================================ ler o formulário

export const FRASE_DE_CATEGORIA_FORA = 'Uma das categorias não existe mais ou não é desta loja. Recarregue a página; nada foi gravado.';

export interface MetasLidas {
  /** O total (a meta do CMV do DRE); nulo = sem meta total. */
  totalBp: number | null;
  /** Só as categorias com meta; vazio no formulário é "sem meta" e fica de fora. */
  metas: Map<string, number>;
}

export const campoDaCategoria = (id: string) => `cat_${id}`;

/**
 * O formulário → pontos-base. `permitidas` são as categorias que o formulário podia mandar; uma fora dela (forjada) é recusada
 * inteira. 100,01, negativo, 3,155 (três casas), "1e2" e letra são recusados no campo com a frase; nada é gravado se houver erro.
 */
export function lerMetasDoFormulario(entrada: { total: unknown; campos: Readonly<Record<string, unknown>> }, permitidas: ReadonlySet<string>): { ok: true; lidas: MetasLidas } | { ok: false; erros: Record<string, string> } {
  const erros: Record<string, string> = {};
  const metas = new Map<string, number>();
  for (const [id, texto] of Object.entries(entrada.campos)) {
    if (!permitidas.has(id)) return { ok: false, erros: { geral: FRASE_DE_CATEGORIA_FORA } };
    const l = lerMetaDigitada(texto, 'percentual');
    if (!l.ok) erros[campoDaCategoria(id)] = l.erro;
    else if (l.bp !== null) metas.set(id, l.bp);
  }
  const t = lerMetaDigitada(entrada.total ?? '', 'percentual');
  if (!t.ok) erros.total = t.erro;
  if (Object.keys(erros).length > 0) return { ok: false, erros: { ...erros, geral: 'Confira os campos marcados; nada foi gravado.' } };
  return { ok: true, lidas: { totalBp: t.ok ? t.bp : null, metas } };
}

// ================================================================ o painel

/** Acima disto, Outros e Sem categoria somados tiram a cor das categorias (hipótese a validar com o Valentin's). */
export const LIMIAR_A_CLASSIFICAR_BP = 200;

export interface CategoriaDoPainel {
  id: string;
  chave: string | null;
  nome: string;
  ordem: number;
  ativa: boolean;
  sistema: boolean;
}

/** A chave, no mapa de compras, do que se comprou de insumo PRÉ-PREPARO: vai à linha própria dos pré-preparos, qualquer que seja a categoria dele. */
export const CHAVE_DOS_PREPARADOS = '@preparos';

/** Os três montantes do real de uma categoria (ou dos pré-preparos) numa loja: o real é inicial + entradas − final. */
export interface MontantesDoEstoque {
  inicial: number;
  /** Entradas de compra que o livro registrou das notas do período (a data da nota decide o período). */
  entradas: number;
  final: number;
}

export const realDoMontante = (m: MontantesDoEstoque) => m.inicial + m.entradas - m.final;

/** O real aberto por categoria de UMA loja: a chave nula é "sem categoria". Σ de tudo (com os pré-preparos) é o CMV real da loja. */
export interface RealDaLoja {
  categorias: ReadonlyMap<string | null, MontantesDoEstoque>;
  preparos: MontantesDoEstoque;
}

export interface LojaNoPainel {
  lojaId: string;
  nome: string;
  receitaBrutaCentavos: number;
  /** Compras LANÇADAS do recorte pela categoria de HOJE do insumo; a chave nula é "sem categoria"; os pré-preparos têm a chave `CHAVE_DOS_PREPARADOS`. Loja sem nota: vazio. */
  compras: ReadonlyMap<string | null, number>;
  /** I.2b: o real aberto por categoria (retrato por insumo nos dois estoques); nulo/ausente = a loja fica pelas compras. */
  real?: RealDaLoja | null;
  /** I.2b: o CMV que vale da loja no DRE (real, senão compras); nulo = sem CMV. Só a matriz e a variação por loja leem. */
  cmvCentavos?: number | null;
  /** I.2b: o DRE da loja usa o REAL e o painel não conseguiu abri-lo por categoria; o motivo, em uma frase. */
  motivoSemRealPorCategoria?: string | null;
  /** Categorias que esta loja não usa. */
  naoUsa: ReadonlySet<string>;
  /** A meta efetiva de cada categoria (pontos-base); nulo = nenhum conjunto vale para a loja. */
  metas: ReadonlyMap<string, number> | null;
  metaVemDe: 'rede' | 'loja' | null;
}

/** O que a loja vale numa categoria: o REAL quando aberto, senão as compras. A chave nula é "sem categoria". */
export function valorDaCategoria(l: LojaNoPainel, id: string | null): number {
  if (l.real) {
    const m = l.real.categorias.get(id);
    return m ? realDoMontante(m) : 0;
  }
  return l.compras.get(id) ?? 0;
}

/** O que a loja vale nos pré-preparos: o real do estoque dele (inicial + entradas − final), ou o que se comprou de insumo pré-preparo. */
export function valorDosPreparos(l: LojaNoPainel): number {
  return l.real ? realDoMontante(l.real.preparos) : (l.compras.get(CHAVE_DOS_PREPARADOS) ?? 0);
}

export interface EntradaDoPainel {
  categorias: readonly CategoriaDoPainel[];
  lojas: readonly LojaNoPainel[];
  /** O CMV do DRE no escopo: o total que a soma tem de fechar. Nulo = nenhuma loja tem CMV. */
  totalCentavos: number | null;
  receitaBrutaCentavos: number;
  /** A nota da linha `cmv` do DRE (o selo da fonte): "sem o CMV de Centro" tira a cor. */
  notaDoCmv: string | null;
  semContarDoCmv: readonly string[];
  /** O motivo que tira a cor de tudo no escopo (faltam lançamentos de faturamento), como o DRE. */
  motivoGeral: string | null;
  faixas: FaixasDoFarol | null;
  /** O período já terminou: a diferença entre o total e as compras é a variação do estoque. */
  encerrado: boolean;
  /** Quantos insumos diferentes compraram em Outros ou sem categoria (para o "Classificar N insumos"); nulo = não lido. */
  insumosAClassificar?: number | null;
}

export type TipoDaLinhaDoPainel = 'categoria' | 'sem-categoria' | 'variacao' | 'preparos';

export interface LinhaDoPainel {
  chave: string;
  tipo: TipoDaLinhaDoPainel;
  categoriaId: string | null;
  nome: string;
  /** Outros / a classificar e Sem categoria: fila, sem meta cobrada e sem farol. */
  aClassificar: boolean;
  desativada: boolean;
  /** Nenhuma loja do escopo usa a categoria, mas ela teve valor: custo nunca some. */
  naoUsada: boolean;
  /** Nulo na linha de pré-preparos (vem com o real por categoria). */
  realizadoCentavos: number | null;
  realizadoBp: number | null;
  metaBp: number | null;
  metaCentavos: number | null;
  metaVemDe: 'rede' | 'loja' | 'mista' | null;
  /** "meta em 2 de 3 lojas": a rede só consolida a meta quando todas as lojas que usam a categoria a têm. */
  metaParcial: string | null;
  desvioBp: number | null;
  desvioCentavos: number | null;
  desvioTexto: string | null;
  /** I.2b: o desvio como % da PRÓPRIA meta (sinal do desvio); só leitura, nunca vira cor nem ordem. Nulo sem meta em R$ ou com meta zero. */
  desvioRelativoBp: number | null;
  farol: FarolDaLinha | null;
  /** I.2b: de onde vem o realizado da linha: as compras, o real aberto por categoria, ou as duas (lojas diferentes). Nulo sem valor. */
  fonte: 'compras' | 'real' | 'mista' | null;
  /** A frase da linha que não é categoria (variação do estoque, pré-preparos). */
  nota: string | null;
}

export interface PainelDeCategorias {
  linhas: LinhaDoPainel[];
  /** Até 3 categorias que SAÍRAM da meta (faixa 3 ou pior), as que passaram mais em R$; quem está "na meta" não entra. */
  maioresDesvios: LinhaDoPainel[];
  /** O motivo que tira a cor de todas as categorias do escopo; nulo = as cores valem. */
  semCor: string | null;
  /** Σ das compras de todas as categorias, com Sem categoria. */
  somaDasComprasCentavos: number;
  /** Total do DRE menos a soma das compras: a variação do estoque (zero no período em curso). */
  variacaoCentavos: number | null;
  /** Outros / a classificar + Sem categoria. */
  aClassificarCentavos: number;
  /** Quanto isso pesa no CMV do escopo, em pontos-base; nulo sem total. */
  aClassificarBp: number | null;
  insumosAClassificar: number | null;
  /** I.2b: compra × real por categoria, das lojas com o real aberto; nulo quando nenhuma loja do escopo tem. */
  compraReal: CompraXRealDoPainel | null;
  /** I.2b: categoria × loja, só na visão com duas ou mais lojas; nulo caso contrário. */
  matriz: MatrizDoPainel | null;
  /** I.2b: lojas cujo CMV do DRE é o real e que ficaram pelas compras (sem o retrato por insumo), com o motivo: é o que a linha de variação explica. */
  lojasSemRealAberto: { nome: string; motivo: string }[];
}

export interface LinhaCompraReal {
  chave: string;
  tipo: TipoDaLinhaDoPainel;
  nome: string;
  /** Notas lançadas da categoria (pré-preparo: o que se comprou de insumo pré-preparo, quase sempre zero). */
  compraCentavos: number | null;
  realCentavos: number;
  /** Real menos compra: o mesmo sinal da 2.3. */
  diferencaCentavos: number | null;
  /** A diferença em pontos-base da receita das lojas comparadas; sempre com o sinal da diferença (zero quando arredonda a 0,00). */
  diferencaBp: number | null;
  inicialCentavos: number;
  entradasCentavos: number;
  finalCentavos: number;
  /** "o estoque subiu R$ X (de A para B)…" ou nulo quando ficou igual. */
  frase: string | null;
}

export interface CompraXRealDoPainel {
  linhas: LinhaCompraReal[];
  /** As lojas comparadas, e as que ficaram de fora com o motivo. */
  lojasComparadas: string[];
  lojasDeFora: { nome: string; motivo: string }[];
  receitaCentavos: number;
  totalCompraCentavos: number;
  totalRealCentavos: number;
  totalDiferencaCentavos: number;
  totalDiferencaBp: number | null;
}

export interface CelulaDaMatriz {
  centavos: number;
  /** % da receita da PRÓPRIA loja; nulo sem receita. */
  bp: number | null;
  /** A meta da categoria nesta loja (nulo = sem meta, ou a loja não usa a categoria). */
  metaBp: number | null;
  /** bp menos meta; sem cor: a matriz mostra o número, o farol é do painel. */
  desvioBp: number | null;
  naoUsa: boolean;
}

export interface LinhaDaMatriz {
  chave: string;
  tipo: TipoDaLinhaDoPainel;
  nome: string;
  /** Na ordem de `MatrizDoPainel.lojas`. */
  celulas: (CelulaDaMatriz | null)[];
  rede: CelulaDaMatriz;
}

export interface MatrizDoPainel {
  lojas: { lojaId: string; nome: string; receitaCentavos: number; cmvCentavos: number | null }[];
  linhas: LinhaDaMatriz[];
  /** O total de cada loja é o CMV do DRE dela: a soma da coluna (com a variação do estoque, quando houver) fecha nele. */
  redeCmvCentavos: number | null;
}

export const NOME_DE_SEM_CATEGORIA = 'Sem categoria';
export const NOME_DOS_PREPARADOS = 'Pré-preparos (variação do estoque)';
export const NOME_DA_VARIACAO = 'Variação do estoque, ainda não aberta por categoria';
export const FRASE_DOS_PREPARADOS = 'Sem meta e sem farol. Aparece quando o CMV real é aberto por categoria.';
export const FRASE_DOS_PREPARADOS_COM_REAL = 'Sem meta e sem farol. É o estoque de pré-preparo que desceu (positivo) ou subiu (negativo) no período; os ingredientes ficam na categoria deles.';
export const FRASE_DA_VARIACAO = 'É a diferença entre o CMV real do DRE e as compras: o painel ainda não abre o estoque por categoria, mas o total nunca diverge do DRE.';
export const FRASE_DO_SEM_COMPRA = 'sem compra no período';
export const FRASE_DO_SEM_CONSUMO = 'sem consumo no período';

/** "+R$ 1.000,00" / "−R$ 300,00" (menos de verdade, não hífen). */
export const dinheiroComSinal = (c: number) => `${c < 0 ? '−' : c > 0 ? '+' : ''}${formatarDinheiro(Math.abs(c))}`;

/** "+40,0% da meta" / "−12,5% da meta": o desvio como parte da própria meta. */
export function textoDoDesvioRelativo(bp: number): string {
  const v = (Math.abs(bp) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${bp < 0 ? '−' : bp > 0 ? '+' : ''}${v}% da meta`;
}

/** "−1,50 pp" / "+0,50 pp" / "0,00 pp": o sinal é o da diferença em R$ (zero quando arredonda a zero). */
export const pontosComSinalDaDiferenca = (bp: number) => (bp === 0 ? '0,00 pp' : pontosComDuasCasas(bp));

/**
 * Por que as categorias do escopo ficam SEM COR, ou nulo se a cor vale. As regras da 2.4 (falta faturamento, "sem o CMV de X",
 * "sem contar …") mais a da I.2 (decisão 278): Outros e Sem categoria somados acima de 2,0 % do CMV do escopo. A meta só é
 * confiável depois da classificação: com a fila grande, a cor de cada categoria seria uma afirmação sobre dado que não fecha.
 */
export function motivoQueTiraACor(e: { faixas: FaixasDoFarol | null; motivoGeral: string | null; notaDoCmv: string | null; semContarDoCmv: readonly string[]; aClassificarCentavos: number; totalCentavos: number | null }): string | null {
  if (e.faixas === null) return 'as faixas do farol deste fechamento são de uma versão que este sistema não conhece';
  if (e.motivoGeral) return e.motivoGeral;
  const incompleto = /sem o CMV de ([^;]+)/.exec(e.notaDoCmv ?? '');
  if (incompleto) return `sem o CMV de ${incompleto[1].trim()}`;
  if (e.semContarDoCmv.length > 0) return `sem contar ${e.semContarDoCmv.join(' e ')}`;
  if (e.totalCentavos !== null && e.totalCentavos > 0 && e.aClassificarCentavos * 10_000 > LIMIAR_A_CLASSIFICAR_BP * e.totalCentavos) {
    const bp = dividirExato(BigInt(e.aClassificarCentavos) * 10_000n, BigInt(e.totalCentavos));
    return `${formatarDinheiro(e.aClassificarCentavos)} ainda a classificar (${percentualComDuasCasas(bp)} do CMV)`;
  }
  return null;
}

/** O farol que uma categoria com meta e desvio tem, ou o motivo de não ter cor. */
function farolDaCategoria(desvioBp: number, desvioTexto: string, semCor: string | null, faixas: FaixasDoFarol): FarolDaLinha {
  if (semCor) return { tipo: 'sem', motivo: semCor, desvioTexto };
  const f = faixaDoDesvio('MENOR_MELHOR', desvioBp, 'custo', faixas);
  return { tipo: 'cor', escala: 'custo', cor: f.cor, posicao: f.posicao, palavra: f.palavra, confira: f.confira, desvioTexto, rotulo: rotuloDoFarol(f, desvioTexto) };
}

const vazia = (categoriaId: string | null, tipo: TipoDaLinhaDoPainel, chave: string, nome: string, extra: Partial<LinhaDoPainel> = {}): LinhaDoPainel => ({
  chave,
  tipo,
  categoriaId,
  nome,
  aClassificar: false,
  desativada: false,
  naoUsada: false,
  realizadoCentavos: null,
  realizadoBp: null,
  metaBp: null,
  metaCentavos: null,
  metaVemDe: null,
  metaParcial: null,
  desvioBp: null,
  desvioCentavos: null,
  desvioTexto: null,
  desvioRelativoBp: null,
  farol: null,
  fonte: null,
  nota: null,
  ...extra,
});

/**
 * O painel de CMV por categoria de um escopo (a rede toda ou uma loja), pelas compras. Cada loja entra com a sua categoria de
 * hoje, as suas metas e a sua receita; a rede é a soma das lojas (meta em R$ = Σ das metas das lojas, um arredondamento por
 * loja). A soma das categorias mais a variação do estoque é o total do DRE: a variação sai da subtração, então o painel não
 * consegue divergir do DRE em silêncio (e, no período em curso, ela aparece como erro se não for zero).
 */
export function montarPainelDeCategorias(e: EntradaDoPainel): PainelDeCategorias {
  const faixas = e.faixas ?? FAIXAS_DO_FAROL;
  const sistema = e.categorias.find((c) => c.chave === CHAVE_DO_SISTEMA);
  const somaDe = (id: string | null) => e.lojas.reduce((s, l) => s + valorDaCategoria(l, id), 0);
  const semCategoria = somaDe(null);
  const aClassificarCentavos = semCategoria + (sistema ? somaDe(sistema.id) : 0);
  const aClassificarBp = e.totalCentavos !== null && e.totalCentavos > 0 ? dividirExato(BigInt(aClassificarCentavos) * 10_000n, BigInt(e.totalCentavos)) : null;
  const semCor = motivoQueTiraACor({ faixas: e.faixas, motivoGeral: e.motivoGeral, notaDoCmv: e.notaDoCmv, semContarDoCmv: e.semContarDoCmv, aClassificarCentavos, totalCentavos: e.totalCentavos });
  const receita = e.receitaBrutaCentavos;
  const bpDe = (centavos: number) => percentualDaReceita(centavos, receita);
  // De onde vem o valor de uma linha: as lojas que têm valor nela dizem se é real, compras ou as duas.
  const fonteDe = (valorDaLoja: (l: LojaNoPainel) => number): LinhaDoPainel['fonte'] => {
    const comValor = e.lojas.filter((l) => valorDaLoja(l) !== 0);
    if (comValor.length === 0) return null;
    const reais = comValor.filter((l) => l.real).length;
    return reais === 0 ? 'compras' : reais === comValor.length ? 'real' : 'mista';
  };

  const linhas: LinhaDoPainel[] = [];
  const ordenadas = [...e.categorias].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'));
  for (const c of ordenadas) {
    const realizado = somaDe(c.id);
    const quemUsa = e.lojas.filter((l) => !l.naoUsa.has(c.id));
    // Quem NÃO usa a categoria mas teve valor nela: o valor entra (custo nunca some, a soma é o DRE), só que fora do que se compara com a meta.
    const foraQueComprou = e.lojas.filter((l) => l.naoUsa.has(c.id) && valorDaCategoria(l, c.id) !== 0);
    // Realizado e meta sobre o MESMO conjunto de lojas e a MESMA receita: o pp e o R$ do desvio sempre contam a mesma história.
    const receitaDeQuemUsa = quemUsa.reduce((acc, l) => acc + l.receitaBrutaCentavos, 0);
    const realizadoDeQuemUsa = quemUsa.reduce((acc, l) => acc + valorDaCategoria(l, c.id), 0);
    const aClassificar = c.chave === CHAVE_DO_SISTEMA;
    // A categoria aparece quando alguma loja do escopo a usa e ela está ativa, ou quando tem valor (custo nunca some), ou tem meta.
    const metasDasQueUsam = quemUsa.map((l) => ({ l, bp: l.metas?.get(c.id) ?? null }));
    const temMeta = metasDasQueUsam.some((x) => x.bp !== null);
    if (!(realizado !== 0 || (c.ativa && quemUsa.length > 0) || temMeta)) continue;
    const linha = vazia(c.id, 'categoria', `cat:${c.id}`, c.nome, { aClassificar, desativada: !c.ativa, naoUsada: quemUsa.length === 0 && realizado !== 0 });
    linha.realizadoCentavos = realizado;
    linha.fonte = fonteDe((l) => valorDaCategoria(l, c.id));
    // Com valor de quem não usa, o % mostrado é o do escopo todo (informativo; essa linha não tem desvio nem cor); senão, o de quem usa.
    const receitaDoPercentual = foraQueComprou.length > 0 || quemUsa.length === 0 ? receita : receitaDeQuemUsa;
    linha.realizadoBp = percentualDaReceita(realizado, receitaDoPercentual);

    // ---- a meta do escopo
    const comMeta = metasDasQueUsam.filter((x) => x.bp !== null);
    if (comMeta.length > 0) {
      if (comMeta.length < quemUsa.length) {
        linha.metaParcial = `meta em ${comMeta.length} de ${quemUsa.length} lojas`;
      } else {
        const metaCentavos = comMeta.reduce((acc, x) => acc + dividirExato(BigInt(x.bp!) * BigInt(x.l.receitaBrutaCentavos), 10_000n), 0);
        const iguais = comMeta.every((x) => x.bp === comMeta[0].bp);
        linha.metaBp = iguais ? comMeta[0].bp : percentualDaReceita(metaCentavos, receitaDeQuemUsa);
        linha.metaCentavos = receitaDeQuemUsa > 0 ? metaCentavos : null;
        const origens = new Set(comMeta.map((x) => x.l.metaVemDe));
        linha.metaVemDe = origens.size === 1 ? (comMeta[0].l.metaVemDe ?? null) : 'mista';
      }
    }

    // ---- o desvio e o farol (Outros e Sem categoria nunca; sem valor no período, sem comparação)
    if (!aClassificar && linha.metaBp !== null) {
      if (receitaDeQuemUsa <= 0) {
        linha.farol = { tipo: 'sem', motivo: 'sem faturamento', desvioTexto: null };
      } else if (foraQueComprou.length > 0) {
        const nomes = foraQueComprou.map((l) => l.nome);
        const quem = nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
        linha.farol = { tipo: 'sem', motivo: `${quem} ${nomes.length === 1 ? 'comprou' : 'compraram'} ${c.nome}, marcada como não usa`, desvioTexto: null };
      } else if (realizado === 0) {
        const algumaReal = quemUsa.some((l) => l.real);
        linha.farol = { tipo: 'sem', motivo: algumaReal ? FRASE_DO_SEM_CONSUMO : FRASE_DO_SEM_COMPRA, desvioTexto: null };
      } else if (linha.realizadoBp !== null && linha.metaCentavos !== null) {
        // O desvio sai dos centavos (sinal sempre igual nos dois) e o pp é esse valor sobre a mesma receita.
        linha.desvioCentavos = realizadoDeQuemUsa - linha.metaCentavos;
        const desvioBp = percentualDaReceita(linha.desvioCentavos, receitaDeQuemUsa) ?? 0;
        linha.desvioBp = desvioBp;
        linha.desvioTexto = pontosComDuasCasas(desvioBp);
        // Categoria pequena: 0,20 pp de desvio é muito perto de 0,50 pp de meta. O percentual da própria meta ajuda a ler, e só a ler.
        linha.desvioRelativoBp = linha.metaCentavos > 0 ? dividirExato(BigInt(linha.desvioCentavos) * 10_000n, BigInt(linha.metaCentavos)) : null;
        linha.farol = farolDaCategoria(desvioBp, linha.desvioTexto, semCor, faixas);
      }
    }
    linhas.push(linha);
  }

  // ---- Sem categoria: o insumo que ainda não foi classificado. Fila, sem farol.
  if (semCategoria !== 0) {
    const l = vazia(null, 'sem-categoria', 'sem-categoria', NOME_DE_SEM_CATEGORIA, { aClassificar: true });
    l.realizadoCentavos = semCategoria;
    l.realizadoBp = bpDe(semCategoria);
    l.fonte = fonteDe((x) => valorDaCategoria(x, null));
    linhas.push(l);
  }

  // ---- pré-preparos: o estoque de pré-preparo entra aqui, qualquer que seja a categoria dele; sem meta e sem farol
  const preparos = e.lojas.reduce((s, l) => s + valorDosPreparos(l), 0);
  const temReal = e.lojas.some((l) => l.real);
  const linhaDosPreparos = vazia(null, 'preparos', 'preparos', NOME_DOS_PREPARADOS, { nota: temReal ? FRASE_DOS_PREPARADOS_COM_REAL : FRASE_DOS_PREPARADOS });
  if (temReal || preparos !== 0) {
    linhaDosPreparos.realizadoCentavos = preparos;
    linhaDosPreparos.realizadoBp = bpDe(preparos);
    linhaDosPreparos.fonte = fonteDe(valorDosPreparos);
  }

  // ---- a variação do estoque: o que falta para a soma ser o CMV do DRE (as lojas com real no DRE que não abriram por categoria)
  const soma = linhas.reduce((s, l) => s + (l.realizadoCentavos ?? 0), 0) + (linhaDosPreparos.realizadoCentavos ?? 0);
  const variacao = e.totalCentavos === null ? null : e.totalCentavos - soma;
  const semReal = e.lojas.filter((l) => l.motivoSemRealPorCategoria).map((l) => ({ nome: l.nome, motivo: l.motivoSemRealPorCategoria! }));
  if (variacao !== null && variacao !== 0) {
    const quais = semReal.length > 0 ? ` Vale para ${semReal.map((x) => x.nome).join(', ')}: ${Array.from(new Set(semReal.map((x) => x.motivo))).join('; ')}.` : '';
    const l = vazia(null, 'variacao', 'variacao', e.encerrado ? NOME_DA_VARIACAO : 'Diferença que o painel não explica', {
      nota: e.encerrado ? `${FRASE_DA_VARIACAO}${quais}` : 'O total do DRE e a soma das compras por categoria deveriam ser iguais no período em curso. Avise a FlowFoods.',
    });
    l.realizadoCentavos = variacao;
    l.realizadoBp = bpDe(variacao);
    linhas.push(l);
  }
  linhas.push(linhaDosPreparos);

  const maioresDesvios = semCor
    ? []
    : linhas
        .filter((l) => l.tipo === 'categoria' && !l.aClassificar && l.farol?.tipo === 'cor' && l.farol.posicao >= 3 && (l.desvioCentavos ?? 0) > 0)
        .sort((a, b) => (b.desvioCentavos ?? 0) - (a.desvioCentavos ?? 0) || a.nome.localeCompare(b.nome, 'pt-BR'))
        .slice(0, 3);

  return {
    linhas,
    maioresDesvios,
    semCor,
    somaDasComprasCentavos: soma,
    variacaoCentavos: variacao,
    aClassificarCentavos,
    aClassificarBp,
    insumosAClassificar: e.insumosAClassificar ?? null,
    compraReal: montarCompraReal(e),
    matriz: montarMatriz(e, linhas),
    lojasSemRealAberto: semReal,
  };
}

/** A diferença entre o real e a compra, por categoria, nas lojas que têm o real aberto. Real menos compra, o sinal da 2.3. */
function montarCompraReal(e: EntradaDoPainel): CompraXRealDoPainel | null {
  const reais = e.lojas.filter((l) => l.real);
  if (reais.length === 0) return null;
  const receita = reais.reduce((s, l) => s + l.receitaBrutaCentavos, 0);
  const montantes = (f: (l: LojaNoPainel) => MontantesDoEstoque | undefined): MontantesDoEstoque =>
    reais.reduce((acc, l) => {
      const m = f(l);
      return m ? { inicial: acc.inicial + m.inicial, entradas: acc.entradas + m.entradas, final: acc.final + m.final } : acc;
    }, { inicial: 0, entradas: 0, final: 0 });
  const saida: LinhaCompraReal[] = [];
  const montar = (chave: string, tipo: TipoDaLinhaDoPainel, nome: string, compra: number | null, m: MontantesDoEstoque) => {
    const real = realDoMontante(m);
    if (compra === 0 && m.inicial === 0 && m.entradas === 0 && m.final === 0) return;
    const diferenca = compra === null ? null : real - compra;
    const delta = m.final - m.inicial;
    const de = `de ${formatarDinheiro(m.inicial)} para ${formatarDinheiro(m.final)}`;
    const frase = delta > 0 ? `o estoque subiu ${formatarDinheiro(delta)} (${de})` : delta < 0 ? `o estoque desceu ${formatarDinheiro(-delta)} (${de})` : null;
    saida.push({
      chave,
      tipo,
      nome,
      compraCentavos: compra,
      realCentavos: real,
      diferencaCentavos: diferenca,
      diferencaBp: diferenca === null ? null : (percentualDaReceita(diferenca, receita) ?? null),
      inicialCentavos: m.inicial,
      entradasCentavos: m.entradas,
      finalCentavos: m.final,
      frase,
    });
  };
  // Todas as categorias da casa (não só as que o painel mostra): a compra de uma categoria sem consumo também entra na diferença.
  const ordenadas = [...e.categorias].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'));
  for (const c of ordenadas) {
    montar(`cat:${c.id}`, 'categoria', c.nome, reais.reduce((s, x) => s + (x.compras.get(c.id) ?? 0), 0), montantes((x) => x.real!.categorias.get(c.id)));
  }
  montar('sem-categoria', 'sem-categoria', NOME_DE_SEM_CATEGORIA, reais.reduce((s, x) => s + (x.compras.get(null) ?? 0), 0), montantes((x) => x.real!.categorias.get(null)));
  montar('preparos', 'preparos', NOME_DOS_PREPARADOS, reais.reduce((s, x) => s + (x.compras.get(CHAVE_DOS_PREPARADOS) ?? 0), 0), montantes((x) => x.real!.preparos));
  const totalCompra = reais.reduce((s, l) => s + Array.from(l.compras.values()).reduce((a, v) => a + v, 0), 0);
  const totalReal = reais.reduce((s, l) => s + valorTotalDoReal(l), 0);
  return {
    linhas: saida,
    lojasComparadas: reais.map((l) => l.nome),
    lojasDeFora: e.lojas.filter((l) => !l.real && l.motivoSemRealPorCategoria).map((l) => ({ nome: l.nome, motivo: l.motivoSemRealPorCategoria! })),
    receitaCentavos: receita,
    totalCompraCentavos: totalCompra,
    totalRealCentavos: totalReal,
    totalDiferencaCentavos: totalReal - totalCompra,
    totalDiferencaBp: percentualDaReceita(totalReal - totalCompra, receita),
  };
}

/** O real total de uma loja com o real aberto: Σ de todas as categorias, do sem categoria e dos pré-preparos. */
function valorTotalDoReal(l: LojaNoPainel): number {
  if (!l.real) return 0;
  return Array.from(l.real.categorias.values()).reduce((s, m) => s + realDoMontante(m), 0) + realDoMontante(l.real.preparos);
}

/** Categoria × loja (só com duas ou mais lojas): o número de cada loja, sem cor; a coluna de cada loja fecha no CMV do DRE dela. */
function montarMatriz(e: EntradaDoPainel, linhas: readonly LinhaDoPainel[]): MatrizDoPainel | null {
  if (e.lojas.length < 2) return null;
  const lojas = [...e.lojas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const celula = (l: LojaNoPainel, centavos: number, metaBp: number | null, naoUsa: boolean): CelulaDaMatriz => {
    const bp = percentualDaReceita(centavos, l.receitaBrutaCentavos);
    return { centavos, bp, metaBp, desvioBp: metaBp !== null && bp !== null && !naoUsa ? bp - metaBp : null, naoUsa };
  };
  const linhasDaMatriz: LinhaDaMatriz[] = [];
  for (const l of linhas) {
    const por = (valor: (x: LojaNoPainel) => number, meta: (x: LojaNoPainel) => number | null, naoUsa: (x: LojaNoPainel) => boolean): LinhaDaMatriz => ({
      chave: l.chave,
      tipo: l.tipo,
      nome: l.nome,
      celulas: lojas.map((x) => celula(x, valor(x), meta(x), naoUsa(x))),
      rede: { centavos: l.realizadoCentavos ?? 0, bp: l.realizadoBp, metaBp: l.metaBp, desvioBp: l.desvioBp, naoUsa: false },
    });
    if (l.tipo === 'categoria') linhasDaMatriz.push(por((x) => valorDaCategoria(x, l.categoriaId), (x) => x.metas?.get(l.categoriaId!) ?? null, (x) => x.naoUsa.has(l.categoriaId!)));
    else if (l.tipo === 'sem-categoria') linhasDaMatriz.push(por((x) => valorDaCategoria(x, null), () => null, () => false));
    else if (l.tipo === 'preparos') linhasDaMatriz.push(por(valorDosPreparos, () => null, () => false));
    else if (l.tipo === 'variacao') {
      linhasDaMatriz.push(
        por(
          (x) => {
            if (x.cmvCentavos == null) return 0;
            return x.cmvCentavos - (e.categorias.reduce((s, c) => s + valorDaCategoria(x, c.id), 0) + valorDaCategoria(x, null) + valorDosPreparos(x));
          },
          () => null,
          () => false,
        ),
      );
    }
  }
  return {
    lojas: lojas.map((x) => ({ lojaId: x.lojaId, nome: x.nome, receitaCentavos: x.receitaBrutaCentavos, cmvCentavos: x.cmvCentavos ?? null })),
    linhas: linhasDaMatriz,
    redeCmvCentavos: e.totalCentavos,
  };
}

// ================================================================ a evolução dos últimos períodos (I.2b)

export interface EntradaDoPeriodoDaEvolucao {
  inicio: string;
  nome: string;
  situacao: 'em-curso' | 'encerrado' | 'fechado';
  /** Fechado antes da I.2: o total existe, as categorias não ("não apurado por categoria"). */
  antigo: boolean;
  semFaturamento: boolean;
  /** O CMV do DRE no período; nulo = sem CMV. */
  totalCentavos: number | null;
  totalBp: number | null;
  metaTotalBp: number | null;
  desvioTotalBp: number | null;
  painel: PainelDeCategorias | null;
}

export interface PeriodoDaEvolucao {
  inicio: string;
  nome: string;
  situacao: EntradaDoPeriodoDaEvolucao['situacao'];
  /** Por que o período não traz categorias (nulo = traz). Nunca um zero no lugar. */
  semDado: string | null;
}

export interface CelulaDaEvolucao {
  realizadoCentavos: number;
  realizadoBp: number | null;
  metaBp: number | null;
  /** Realizado menos meta, em pontos-base, o sinal da DRE; nulo sem meta ou sem comparação. Sem cor: a cor é do painel do período. */
  desvioBp: number | null;
  desvioCentavos: number | null;
  fonte: LinhaDoPainel['fonte'];
}

export interface LinhaDaEvolucao {
  chave: string;
  tipo: TipoDaLinhaDoPainel | 'total';
  nome: string;
  /** Na ordem de `periodos` (do mais antigo ao mais novo); nulo = sem dado naquele período. */
  celulas: (CelulaDaEvolucao | null)[];
}

export interface EvolucaoDeCategorias {
  periodos: PeriodoDaEvolucao[];
  linhas: LinhaDaEvolucao[];
}

/**
 * A evolução por categoria dos períodos lidos (do mais novo ao mais antigo na entrada; sai do mais antigo ao mais novo). O período
 * fechado vem da fotografia como está; o que não tem dado fica vazio com o motivo, nunca zero. Cada célula é a linha do painel daquele
 * período: o mesmo número, a mesma meta e o mesmo desvio.
 */
export function montarEvolucao(entradas: readonly EntradaDoPeriodoDaEvolucao[]): EvolucaoDeCategorias {
  const cronologicas = [...entradas].reverse();
  const periodos: PeriodoDaEvolucao[] = cronologicas.map((e) => ({
    inicio: e.inicio,
    nome: e.nome,
    situacao: e.situacao,
    semDado: e.antigo ? 'não apurado por categoria (fechado antes da I.2)' : !e.painel ? 'sem dado' : e.semFaturamento && e.totalCentavos === null ? 'sem faturamento nem compras' : null,
  }));
  const linhas = new Map<string, { nome: string; tipo: TipoDaLinhaDoPainel; ordem: number }>();
  cronologicas.forEach((e, i) => {
    for (const l of e.painel?.linhas ?? []) {
      if (l.tipo === 'variacao') continue;
      const chave = l.tipo === 'categoria' ? (l.categoriaId as string) : l.chave;
      if ((l.realizadoCentavos ?? 0) === 0 && l.metaBp === null) continue;
      linhas.set(chave, { nome: l.nome, tipo: l.tipo, ordem: linhas.get(chave)?.ordem ?? 1000 * (l.tipo === 'categoria' ? 0 : l.tipo === 'sem-categoria' ? 1 : 2) + i });
    }
  });
  const saida: LinhaDaEvolucao[] = [];
  for (const [chave, info] of linhas) {
    saida.push({
      chave,
      tipo: info.tipo,
      nome: info.nome,
      celulas: cronologicas.map((e) => {
        const l = e.painel?.linhas.find((x) => (x.tipo === 'categoria' ? x.categoriaId : x.chave) === chave);
        if (!l || l.realizadoCentavos === null) return null;
        return { realizadoCentavos: l.realizadoCentavos, realizadoBp: l.realizadoBp, metaBp: l.metaBp, desvioBp: l.desvioBp, desvioCentavos: l.desvioCentavos, fonte: l.fonte };
      }),
    });
  }
  // A ordem das categorias é a do painel mais novo; sem categoria e pré-preparos no fim.
  const ordemDoMaisNovo = new Map((entradas[0]?.painel?.linhas ?? []).map((l, i) => [l.tipo === 'categoria' ? (l.categoriaId as string) : l.chave, i]));
  saida.sort((a, b) => (ordemDoMaisNovo.get(a.chave) ?? 10_000) - (ordemDoMaisNovo.get(b.chave) ?? 10_000) || a.nome.localeCompare(b.nome, 'pt-BR'));
  saida.push({
    chave: 'total',
    tipo: 'total',
    nome: 'CMV do DRE',
    celulas: cronologicas.map((e) => (e.totalCentavos === null ? null : { realizadoCentavos: e.totalCentavos, realizadoBp: e.totalBp, metaBp: e.metaTotalBp, desvioBp: e.desvioTotalBp, desvioCentavos: null, fonte: null })),
  });
  return { periodos, linhas: saida };
}

// ================================================================ o que vai para a fotografia (v4 e v5)

export interface CategoriaGravada {
  id: string;
  chave: string | null;
  nome: string;
  ordem: number;
  ativa: boolean;
  sistema: boolean;
  /** Compras da categoria no recorte do fechamento (notas lançadas, categoria de hoje). */
  compraCentavos: number;
  /** A meta efetiva da época; nulo = sem meta. */
  metaBp: number | null;
  usa: boolean;
  /** v5 (I.2b): os três montantes do real da categoria nesta loja; ausentes quando a loja ficou pelas compras. */
  inicialCentavos?: number;
  entradasCentavos?: number;
  finalCentavos?: number;
}

export interface LojaGravada {
  nome: string;
  /** De onde veio a meta: o conjunto da rede, o da loja; nulo = nenhum conjunto valia. */
  origem: 'rede' | 'loja' | null;
  semCategoriaCentavos: number;
  categorias: CategoriaGravada[];
  /** v5: compras de insumo pré-preparo (vão à linha própria). */
  preparosCompraCentavos?: number;
  /** v5: o real aberto desta loja além das categorias (sem categoria e pré-preparos); ausente = a loja ficou pelas compras. */
  real?: { semCategoria: MontantesDoEstoque; preparos: MontantesDoEstoque } | null;
  /** v5: o DRE usa o real nesta loja e as categorias não abriram: por quê. */
  motivoSemReal?: string | null;
}

export interface CategoriasGravadas {
  /** 1 = compras (I.2a, fotografia v4); 2 = com o real por categoria (I.2b, fotografia v5). */
  versao: 1 | 2;
  lojas: Record<string, LojaGravada>;
}

/**
 * O que a fotografia guarda por loja (dentro de `entrada.categorias`, versão 2): o painel do fechado sai SÓ daqui, com o nome e o id da
 * categoria da ÉPOCA, as compras, o real aberto (quando a loja o tinha) e a meta que valia. Reclassificar um insumo ou renomear uma
 * categoria depois não mexe nele.
 */
export function categoriasParaGravar(categorias: readonly CategoriaDoPainel[], lojas: readonly LojaNoPainel[]): CategoriasGravadas {
  const out: CategoriasGravadas['lojas'] = {};
  for (const l of lojas) {
    const cats: CategoriaGravada[] = [];
    for (const c of categorias) {
      const compra = l.compras.get(c.id) ?? 0;
      const metaBp = l.metas?.get(c.id) ?? null;
      const usa = !l.naoUsa.has(c.id);
      const m = l.real?.categorias.get(c.id);
      // Só o que tem algo a dizer: a categoria desativada que a loja usa e não tem valor nem meta não vai; a que a loja NÃO usa vai sempre (o painel da rede conta quem a usa).
      if (compra === 0 && metaBp === null && !c.ativa && usa && !m) continue;
      cats.push({ id: c.id, chave: c.chave, nome: c.nome, ordem: c.ordem, ativa: c.ativa, sistema: c.sistema, compraCentavos: compra, metaBp, usa, ...(m ? { inicialCentavos: m.inicial, entradasCentavos: m.entradas, finalCentavos: m.final } : {}) });
    }
    const sem = l.real?.categorias.get(null);
    out[l.lojaId] = {
      nome: l.nome,
      origem: l.metaVemDe,
      semCategoriaCentavos: l.compras.get(null) ?? 0,
      categorias: cats,
      preparosCompraCentavos: l.compras.get(CHAVE_DOS_PREPARADOS) ?? 0,
      real: l.real ? { semCategoria: sem ?? { inicial: 0, entradas: 0, final: 0 }, preparos: l.real.preparos } : null,
      motivoSemReal: l.motivoSemRealPorCategoria ?? null,
    };
  }
  return { versao: 2, lojas: out };
}

const inteiro = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
const montanteLido = (m: unknown): MontantesDoEstoque | null => {
  const x = m as Partial<MontantesDoEstoque> | null;
  return x && typeof x === 'object' && inteiro(x.inicial) && inteiro(x.entradas) && inteiro(x.final) ? { inicial: x.inicial, entradas: x.entradas, final: x.final } : null;
};

/**
 * Lê de volta o que `categoriasParaGravar` guardou (versões 1 e 2; a 1 é a da fotografia v4 e nunca tem real). Qualquer coisa fora do
 * formato é descartada (nunca um número inventado). `receitaDaLoja` vem da fotografia do DRE (as linhas), não do JSON.
 */
export function categoriasLidasDaFotografia(json: unknown, receitaDaLoja: (lojaId: string) => number): { categorias: CategoriaDoPainel[]; lojas: LojaNoPainel[] } | null {
  if (!json || typeof json !== 'object') return null;
  const g = json as Partial<CategoriasGravadas>;
  if ((g.versao !== 1 && g.versao !== 2) || !g.lojas || typeof g.lojas !== 'object') return null;
  const porId = new Map<string, CategoriaDoPainel>();
  const lojas: LojaNoPainel[] = [];
  for (const [lojaId, v] of Object.entries(g.lojas)) {
    const l = v as Partial<LojaGravada> | null;
    if (!l || typeof l.nome !== 'string' || !Array.isArray(l.categorias) || !inteiro(l.semCategoriaCentavos ?? 0)) continue;
    const compras = new Map<string | null, number>();
    const naoUsa = new Set<string>();
    const metas = new Map<string, number>();
    const reais = new Map<string | null, MontantesDoEstoque>();
    if ((l.semCategoriaCentavos ?? 0) !== 0) compras.set(null, l.semCategoriaCentavos!);
    if (g.versao === 2 && inteiro(l.preparosCompraCentavos) && l.preparosCompraCentavos !== 0) compras.set(CHAVE_DOS_PREPARADOS, l.preparosCompraCentavos);
    let real: RealDaLoja | null = null;
    const gravado = g.versao === 2 ? l.real : null;
    const semCat = gravado ? montanteLido(gravado.semCategoria) : null;
    const prep = gravado ? montanteLido(gravado.preparos) : null;
    let realValido = !!(semCat && prep);
    for (const c of l.categorias as Partial<CategoriaGravada>[]) {
      if (!c || typeof c.id !== 'string' || typeof c.nome !== 'string' || !inteiro(c.compraCentavos)) continue;
      if (!porId.has(c.id)) porId.set(c.id, { id: c.id, chave: typeof c.chave === 'string' ? c.chave : null, nome: c.nome, ordem: inteiro(c.ordem) ? c.ordem : 0, ativa: c.ativa !== false, sistema: c.sistema === true });
      if (c.compraCentavos !== 0) compras.set(c.id, c.compraCentavos);
      if (c.usa === false) naoUsa.add(c.id);
      if (inteiro(c.metaBp)) metas.set(c.id, c.metaBp);
      if (gravado && (c.inicialCentavos !== undefined || c.entradasCentavos !== undefined || c.finalCentavos !== undefined)) {
        const m = montanteLido({ inicial: c.inicialCentavos, entradas: c.entradasCentavos, final: c.finalCentavos });
        if (m) reais.set(c.id, m);
        else realValido = false;
      }
    }
    if (realValido && semCat && prep) {
      reais.set(null, semCat);
      real = { categorias: reais, preparos: prep };
    }
    lojas.push({
      lojaId,
      nome: l.nome,
      receitaBrutaCentavos: receitaDaLoja(lojaId),
      compras,
      real,
      motivoSemRealPorCategoria: real ? null : typeof l.motivoSemReal === 'string' ? l.motivoSemReal : null,
      naoUsa,
      metas: l.origem === 'rede' || l.origem === 'loja' ? metas : metas.size > 0 ? metas : null,
      metaVemDe: l.origem === 'rede' || l.origem === 'loja' ? l.origem : null,
    });
  }
  return { categorias: Array.from(porId.values()), lojas };
}
