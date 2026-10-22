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
 *  - o desvio tem o MESMO sinal do DRE (realizado menos meta): positivo é custo acima da meta.
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

export interface LojaNoPainel {
  lojaId: string;
  nome: string;
  receitaBrutaCentavos: number;
  /** Compras LANÇADAS do recorte pela categoria de HOJE do insumo; a chave nula é "sem categoria". Loja sem nota: vazio. */
  compras: ReadonlyMap<string | null, number>;
  /** Categorias que esta loja não usa. */
  naoUsa: ReadonlySet<string>;
  /** A meta efetiva de cada categoria (pontos-base); nulo = nenhum conjunto vale para a loja. */
  metas: ReadonlyMap<string, number> | null;
  metaVemDe: 'rede' | 'loja' | null;
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
  farol: FarolDaLinha | null;
  /** A frase da linha que não é categoria (variação do estoque, pré-preparos). */
  nota: string | null;
}

export interface PainelDeCategorias {
  linhas: LinhaDoPainel[];
  /** Até 3 categorias com meta e cor, as que passaram mais em R$. */
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
}

export const NOME_DE_SEM_CATEGORIA = 'Sem categoria';
export const NOME_DOS_PREPARADOS = 'Pré-preparos (variação do estoque)';
export const NOME_DA_VARIACAO = 'Variação do estoque, ainda não aberta por categoria';
export const FRASE_DOS_PREPARADOS = 'Sem meta e sem farol. Entra quando o CMV real for aberto por categoria.';
export const FRASE_DA_VARIACAO = 'É a diferença entre o CMV real do DRE e as compras: o painel ainda não abre o estoque por categoria, mas o total nunca diverge do DRE.';
export const FRASE_DO_SEM_COMPRA = 'sem compra no período';

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
  farol: null,
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
  const somaDe = (id: string | null) => e.lojas.reduce((s, l) => s + (l.compras.get(id) ?? 0), 0);
  const semCategoria = somaDe(null);
  const aClassificarCentavos = semCategoria + (sistema ? somaDe(sistema.id) : 0);
  const aClassificarBp = e.totalCentavos !== null && e.totalCentavos > 0 ? dividirExato(BigInt(aClassificarCentavos) * 10_000n, BigInt(e.totalCentavos)) : null;
  const semCor = motivoQueTiraACor({ faixas: e.faixas, motivoGeral: e.motivoGeral, notaDoCmv: e.notaDoCmv, semContarDoCmv: e.semContarDoCmv, aClassificarCentavos, totalCentavos: e.totalCentavos });
  const receita = e.receitaBrutaCentavos;
  const bpDe = (centavos: number) => percentualDaReceita(centavos, receita);

  const linhas: LinhaDoPainel[] = [];
  const ordenadas = [...e.categorias].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'));
  for (const c of ordenadas) {
    const realizado = somaDe(c.id);
    const quemUsa = e.lojas.filter((l) => !l.naoUsa.has(c.id));
    const aClassificar = c.chave === CHAVE_DO_SISTEMA;
    // A categoria aparece quando alguma loja do escopo a usa e ela está ativa, ou quando tem valor (custo nunca some), ou tem meta.
    const metasDasQueUsam = quemUsa.map((l) => ({ l, bp: l.metas?.get(c.id) ?? null }));
    const temMeta = metasDasQueUsam.some((x) => x.bp !== null);
    if (!(realizado !== 0 || (c.ativa && quemUsa.length > 0) || temMeta)) continue;
    const linha = vazia(c.id, 'categoria', `cat:${c.id}`, c.nome, { aClassificar, desativada: !c.ativa, naoUsada: quemUsa.length === 0 && realizado !== 0 });
    linha.realizadoCentavos = realizado;
    linha.realizadoBp = bpDe(realizado);

    // ---- a meta do escopo
    const comMeta = metasDasQueUsam.filter((x) => x.bp !== null);
    if (comMeta.length > 0) {
      if (comMeta.length < quemUsa.length) {
        linha.metaParcial = `meta em ${comMeta.length} de ${quemUsa.length} lojas`;
      } else {
        const metaCentavos = comMeta.reduce((s, x) => s + dividirExato(BigInt(x.bp!) * BigInt(x.l.receitaBrutaCentavos), 10_000n), 0);
        const iguais = comMeta.every((x) => x.bp === comMeta[0].bp);
        linha.metaBp = iguais ? comMeta[0].bp : bpDe(metaCentavos);
        linha.metaCentavos = receita > 0 ? metaCentavos : null;
        const origens = new Set(comMeta.map((x) => x.l.metaVemDe));
        linha.metaVemDe = origens.size === 1 ? (comMeta[0].l.metaVemDe ?? null) : 'mista';
      }
    }

    // ---- o desvio e o farol (Outros e Sem categoria nunca; sem compra no período, sem comparação)
    if (!aClassificar && linha.metaBp !== null) {
      if (receita <= 0) {
        linha.farol = { tipo: 'sem', motivo: 'sem faturamento', desvioTexto: null };
      } else if (realizado === 0) {
        linha.farol = { tipo: 'sem', motivo: FRASE_DO_SEM_COMPRA, desvioTexto: null };
      } else if (linha.realizadoBp !== null) {
        linha.desvioBp = linha.realizadoBp - linha.metaBp;
        linha.desvioTexto = pontosComDuasCasas(linha.desvioBp);
        linha.desvioCentavos = linha.metaCentavos === null ? null : realizado - linha.metaCentavos;
        linha.farol = farolDaCategoria(linha.desvioBp, linha.desvioTexto, semCor, faixas);
      }
    }
    linhas.push(linha);
  }

  // ---- Sem categoria: o insumo que ainda não foi classificado. Fila, sem farol.
  if (semCategoria !== 0) {
    const l = vazia(null, 'sem-categoria', 'sem-categoria', NOME_DE_SEM_CATEGORIA, { aClassificar: true });
    l.realizadoCentavos = semCategoria;
    l.realizadoBp = bpDe(semCategoria);
    linhas.push(l);
  }

  // ---- a variação do estoque: o que falta para a soma ser o CMV do DRE
  const soma = linhas.filter((l) => l.tipo !== 'variacao' && l.tipo !== 'preparos').reduce((s, l) => s + (l.realizadoCentavos ?? 0), 0);
  const variacao = e.totalCentavos === null ? null : e.totalCentavos - soma;
  if (variacao !== null && variacao !== 0) {
    const l = vazia(null, 'variacao', 'variacao', e.encerrado ? NOME_DA_VARIACAO : 'Diferença que o painel não explica', {
      nota: e.encerrado ? FRASE_DA_VARIACAO : 'O total do DRE e a soma das compras por categoria deveriam ser iguais no período em curso. Avise a FlowFoods.',
    });
    l.realizadoCentavos = variacao;
    l.realizadoBp = bpDe(variacao);
    linhas.push(l);
  }
  // ---- pré-preparos: estoque de pré-preparo entra aqui, qualquer que seja a categoria dele (vem com o real por categoria)
  linhas.push(vazia(null, 'preparos', 'preparos', NOME_DOS_PREPARADOS, { nota: FRASE_DOS_PREPARADOS }));

  const maioresDesvios = semCor
    ? []
    : linhas
        .filter((l) => l.tipo === 'categoria' && !l.aClassificar && l.farol?.tipo === 'cor' && (l.desvioCentavos ?? 0) > 0)
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
  };
}

// ================================================================ o que vai para a fotografia (v4)

export interface CategoriaGravada {
  id: string;
  chave: string | null;
  nome: string;
  ordem: number;
  ativa: boolean;
  sistema: boolean;
  /** Compras da categoria no recorte do fechamento; o real por categoria vem na I.2b. */
  compraCentavos: number;
  /** A meta efetiva da época; nulo = sem meta. */
  metaBp: number | null;
  usa: boolean;
}

export interface LojaGravada {
  nome: string;
  /** De onde veio a meta: o conjunto da rede, o da loja; nulo = nenhum conjunto valia. */
  origem: 'rede' | 'loja' | null;
  semCategoriaCentavos: number;
  categorias: CategoriaGravada[];
}

export interface CategoriasGravadas {
  versao: 1;
  lojas: Record<string, LojaGravada>;
}

/**
 * O que a fotografia guarda por loja (dentro de `entrada.categorias`): o painel do fechado sai SÓ daqui, com o nome e o id da
 * categoria da ÉPOCA, as compras e a meta que valia. Reclassificar um insumo ou renomear uma categoria depois não mexe nele.
 */
export function categoriasParaGravar(categorias: readonly CategoriaDoPainel[], lojas: readonly LojaNoPainel[]): CategoriasGravadas {
  const out: CategoriasGravadas['lojas'] = {};
  for (const l of lojas) {
    const cats: CategoriaGravada[] = [];
    for (const c of categorias) {
      const compra = l.compras.get(c.id) ?? 0;
      const metaBp = l.metas?.get(c.id) ?? null;
      const usa = !l.naoUsa.has(c.id);
      // Só o que tem algo a dizer: a categoria desativada que a loja usa e não tem valor nem meta não vai; a que a loja NÃO usa vai sempre (o painel da rede conta quem a usa).
      if (compra === 0 && metaBp === null && !c.ativa && usa) continue;
      cats.push({ id: c.id, chave: c.chave, nome: c.nome, ordem: c.ordem, ativa: c.ativa, sistema: c.sistema, compraCentavos: compra, metaBp, usa });
    }
    out[l.lojaId] = { nome: l.nome, origem: l.metaVemDe, semCategoriaCentavos: l.compras.get(null) ?? 0, categorias: cats };
  }
  return { versao: 1, lojas: out };
}

const inteiro = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);

/**
 * Lê de volta o que `categoriasParaGravar` guardou. Qualquer coisa fora do formato é descartada (nunca um número inventado).
 * `receitaDaLoja` vem da fotografia do DRE (as linhas), não do JSON.
 */
export function categoriasLidasDaFotografia(json: unknown, receitaDaLoja: (lojaId: string) => number): { categorias: CategoriaDoPainel[]; lojas: LojaNoPainel[] } | null {
  if (!json || typeof json !== 'object') return null;
  const g = json as Partial<CategoriasGravadas>;
  if (g.versao !== 1 || !g.lojas || typeof g.lojas !== 'object') return null;
  const porId = new Map<string, CategoriaDoPainel>();
  const lojas: LojaNoPainel[] = [];
  for (const [lojaId, v] of Object.entries(g.lojas)) {
    const l = v as Partial<LojaGravada> | null;
    if (!l || typeof l.nome !== 'string' || !Array.isArray(l.categorias) || !inteiro(l.semCategoriaCentavos ?? 0)) continue;
    const compras = new Map<string | null, number>();
    const naoUsa = new Set<string>();
    const metas = new Map<string, number>();
    if ((l.semCategoriaCentavos ?? 0) !== 0) compras.set(null, l.semCategoriaCentavos!);
    for (const c of l.categorias as Partial<CategoriaGravada>[]) {
      if (!c || typeof c.id !== 'string' || typeof c.nome !== 'string' || !inteiro(c.compraCentavos)) continue;
      if (!porId.has(c.id)) porId.set(c.id, { id: c.id, chave: typeof c.chave === 'string' ? c.chave : null, nome: c.nome, ordem: inteiro(c.ordem) ? c.ordem : 0, ativa: c.ativa !== false, sistema: c.sistema === true });
      if (c.compraCentavos !== 0) compras.set(c.id, c.compraCentavos);
      if (c.usa === false) naoUsa.add(c.id);
      if (inteiro(c.metaBp)) metas.set(c.id, c.metaBp);
    }
    lojas.push({
      lojaId,
      nome: l.nome,
      receitaBrutaCentavos: receitaDaLoja(lojaId),
      compras,
      naoUsa,
      metas: l.origem === 'rede' || l.origem === 'loja' ? metas : metas.size > 0 ? metas : null,
      metaVemDe: l.origem === 'rede' || l.origem === 'loja' ? l.origem : null,
    });
  }
  return { categorias: Array.from(porId.values()), lojas };
}

