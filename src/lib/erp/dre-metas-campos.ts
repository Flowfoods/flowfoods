/**
 * Metas e comparação do DRE (2.2b) — a CONTA e as regras de leitura, puras (sem
 * banco e sem Next): ler a meta digitada, comparar o realizado com a meta, e comparar
 * a receita com o mesmo período do ano passado.
 *
 * Decisões 149 a 151 (2.2b) e 172 a 175 (2.4):
 *  - a meta é um percentual (pontos-base) de 0 a 100,00 %, com até duas casas; vazio é "sem meta"
 *    e "0" é uma meta (de zero). Nas linhas de custo, margem e resultado é % da RECEITA BRUTA; nas
 *    de receita (bruta e dos 3 canais) é o CRESCIMENTO sobre o mesmo período do ano passado
 *    (0 = igualar o ano passado), `tipoDaMeta`;
 *  - o desvio é realizado menos meta, em pontos-base; a faixa do farol (`farol-campos.ts`) sai do
 *    desvio e do SENTIDO da linha; a palavra da 2.2b ("melhor/pior que a meta") foi aposentada;
 *  - o ano passado só existe na RECEITA, com as mesmas datas menos um ano (29/02 compara
 *    com 28/02), e a variação só aparece quando há dado completo dos dois lados.
 */

import { diasEntre } from './contagem-campos';
import { faixaDoDesvio, FAIXAS_DO_FAROL, type FaixaDoDesvio, type FaixasDoFarol } from './farol-campos';
import { CHAVE_CMV_COMPRA, CHAVE_CMV_REAL, dividirExato, montarDre, textoDosPontos, type LinhaDoDre } from './dre-campos';
import { SEM_CMV } from './cmv-campos';
import { CODIGO, codigoDoSubtotal, type LinhaDoPlano, type SentidoDaLinha } from './dre-plano';
import type { CanalVenda } from './canal-campos';
import { lerPontosBase } from './unidades';

/** A meta vai de 0 a 100,00 % (pontos-base). */
export const META_MAXIMA_BP = 10_000;

/** As duas linhas de detalhe do CMV (2.3): a meta é da linha CMV. */
const SEM_META_POR_DEFINICAO: ReadonlySet<string> = new Set([CHAVE_CMV_COMPRA, CHAVE_CMV_REAL]);

/** A linha (pela chave: `codigo` ou `id:<id>`) aceita meta? */
export const aceitaMeta = (chave: string) => !SEM_META_POR_DEFINICAO.has(chave);

/**
 * As linhas de receita (bruta e dos 3 canais) têm meta de CRESCIMENTO sobre o mesmo período do ano passado (2.4,
 * decisão 174). Todas as outras, meta em % da receita bruta (2.2b). O número guardado é o mesmo: pontos-base, 0 a 10.000.
 */
export type TipoDaMeta = 'percentual' | 'crescimento';
const CHAVE_DA_RECEITA: Readonly<Record<string, ChaveDaReceita>> = {
  [codigoDoSubtotal('RECEITA')]: 'bruta',
  [CODIGO.receitaLoja]: 'LOJA',
  [CODIGO.receitaDelivery]: 'DELIVERY_PROPRIO',
  [CODIGO.receitaIfood]: 'IFOOD',
};
export const tipoDaMeta = (chave: string): TipoDaMeta => (chave in CHAVE_DA_RECEITA ? 'crescimento' : 'percentual');

/**
 * Na visão de UMA loja, estas duas linhas não mostram meta: a loja não carrega as
 * despesas da rede, então comparar o resultado dela com a meta da rede mentiria.
 */
const SEM_META_NA_LOJA: ReadonlySet<string> = new Set([CODIGO.operacional, CODIGO.resultado]);
export const metaApareceNaLoja = (chave: string) => !SEM_META_NA_LOJA.has(chave);

export const FRASE_DA_META = 'Meta de 0 a 100 %, com até duas casas (ex.: 12,5). Deixe em branco para ficar sem meta.';
export const FRASE_DA_META_DE_CRESCIMENTO = 'Crescimento sobre o mesmo período do ano passado, de 0 a 100 % (0 = igualar o ano passado), com até duas casas. Deixe em branco para ficar sem meta.';

export type LeituraDaMeta = { ok: true; bp: number | null } | { ok: false; erro: string };

/**
 * O texto do campo → pontos-base. "12,5" e "12,55 %" valem; vazio é "sem meta" (null); "0" é meta.
 * Negativo, notação científica, letra, terceira casa e mais de 100 % são recusados com frase.
 */
export function lerMetaDigitada(texto: unknown, tipo: TipoDaMeta = 'percentual'): LeituraDaMeta {
  const frase = tipo === 'crescimento' ? FRASE_DA_META_DE_CRESCIMENTO : FRASE_DA_META;
  if (typeof texto !== 'string') return { ok: false, erro: frase };
  const t = texto.trim();
  if (t === '') return { ok: true, bp: null };
  if (t.length > 12) return { ok: false, erro: frase };
  const bp = lerPontosBase(t);
  if (bp === null) return { ok: false, erro: frase };
  if (bp > META_MAXIMA_BP) return { ok: false, erro: tipo === 'crescimento' ? 'A meta de crescimento vai até 100 %.' : 'A meta vai até 100 %.' };
  return { ok: true, bp };
}

/** "25,0 %" · "12,55 %": uma casa, ou duas quando a meta tem. */
export function textoDaMeta(bp: number): string {
  return `${(bp / 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} %`;
}

/** Pontos-base de volta para o campo: 1250 = "12,5"; 3000 = "30". */
export function metaParaCampo(bp: number): string {
  return (bp / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2, useGrouping: false });
}

// ============================================================ realizado × meta

export interface ComparacaoComMeta {
  metaBp: number;
  /** Percentual da receita bruta (custo, margem, resultado) ou crescimento sobre o ano passado (receita). */
  tipo: TipoDaMeta;
  /** Percentual: meta × receita bruta. Crescimento: o ano passado × (1 + meta). Um arredondamento. Nulo quando falta a base. */
  metaCentavos: number | null;
  /** Realizado menos meta, em pontos-base. Nulo quando não há realizado para comparar. */
  desvioBp: number | null;
  /** "+1,0 pp" · "−0,5 pp". */
  desvioTexto: string | null;
  /** Só no crescimento: a variação da receita sobre o ano passado, em pontos-base. */
  variacaoBp: number | null;
  /** A faixa do farol que o desvio dá, sozinho; o contexto do dado (falta lançamento, CMV ausente…) decide se vira cor (`farol-dre-campos.ts`). */
  faixa: FaixaDoDesvio | null;
  /** Por que não compara ("sem lançamento", "sem faturamento", "sem valor apurado", "ano passado: 12 de 15 dias"). */
  semComparacao: string | null;
}

interface LinhaParaComparar {
  valorCentavos: number | null;
  percentualBp: number | null;
  tipo: string;
  sentido: SentidoDaLinha;
}

/**
 * Compara o realizado de uma linha com a meta. Valor nulo (CMV, taxa), receita zero e
 * linha de despesa sem lançamento NÃO comparam: o desvio e a meta em R$ ficam em "—", nunca em zero
 * (ausência de dado não é um resultado bom).
 */
export function compararComMeta(linha: LinhaParaComparar, metaBp: number, receitaBrutaCentavos: number, faixas: FaixasDoFarol = FAIXAS_DO_FAROL): ComparacaoComMeta {
  const metaCentavos = receitaBrutaCentavos > 0 ? dividirExato(BigInt(metaBp) * BigInt(receitaBrutaCentavos), 10_000n) : null;
  const sem = (motivo: string): ComparacaoComMeta => ({ metaBp, tipo: 'percentual', metaCentavos, desvioBp: null, desvioTexto: null, variacaoBp: null, faixa: null, semComparacao: motivo });
  if (receitaBrutaCentavos <= 0) return sem('sem faturamento');
  if (linha.valorCentavos === null || linha.percentualBp === null) return sem('sem valor apurado');
  // Zero numa linha de despesa ou subtotal é "nada lançado"; só o resultado pode fechar em zero de verdade.
  if (linha.valorCentavos === 0 && linha.tipo !== 'resultado') return sem('sem lançamento');
  const desvioBp = linha.percentualBp - metaBp;
  return { metaBp, tipo: 'percentual', metaCentavos, desvioBp, desvioTexto: textoDosPontos(desvioBp), variacaoBp: null, faixa: faixaDoDesvio(linha.sentido, desvioBp, 'custo', faixas), semComparacao: null };
}

// ============================================================ ano passado

const ehBissexto = (a: number) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;

/** A mesma data um ano antes; 29/02 compara com 28/02. */
export function mesmaDataNoAnoPassado(data: string): string {
  const [a, m, d] = data.split('-').map(Number);
  const ano = a - 1;
  const dia = m === 2 && d === 29 && !ehBissexto(ano) ? 28 : d;
  return `${String(ano).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export type ChaveDaReceita = 'bruta' | CanalVenda;

export interface LinhaDoAnoPassado {
  chave: ChaveDaReceita;
  atualCentavos: number;
  /** Nulo = nenhum lançamento no ano passado ("sem lançamento", nunca R$ 0,00). */
  anteriorCentavos: number | null;
  /** Variação em pontos-base; nula quando falta dado dos dois lados. */
  variacaoBp: number | null;
  /** Por que ESTA linha não tem variação (a cobertura é por loja e, na receita de um canal, por canal); nulo quando tem. */
  semVariacaoPorque: string | null;
  motivoCurto: string | null;
}

export interface AnoPassado {
  de: string;
  ate: string;
  /** Dias do recorte do ano passado: o pior que uma loja exigida cobre (o que sobra de menos), e quantos dias o recorte tem. */
  diasComLancamento: number;
  diasDoRecorte: number;
  /** A frase que explica por que não há variação na receita bruta (nula quando há). */
  semVariacaoPorque: string | null;
  /** O mesmo motivo em poucas palavras, para a célula do farol ("ano passado: 12 de 15 dias"). */
  motivoCurto: string | null;
  linhas: LinhaDoAnoPassado[];
}

export interface GraoDoAnoPassado {
  data: string;
  canal: CanalVenda;
  valorCentavos: number;
  /** Sem loja (testes antigos): vale como uma loja só. */
  lojaId?: string;
}

/**
 * O ano passado de UMA loja, já somado. `dias` é quantos dias do recorte têm algum lançamento (a receita bruta); `canais[c].dias`,
 * quantos têm lançamento naquele canal (a receita do canal). `exigida` = a loja está ativa: ela precisa ter todos os dias, e o canal
 * que ela vende hoje precisa ter todos os dias (decisão 176: uma loja com buraco no ano passado não deixa a rede ter cor).
 */
export interface LojaDoAnoPassado {
  lojaId: string;
  nome: string;
  exigida: boolean;
  vende: readonly CanalVenda[];
  dias: number;
  canais: Record<CanalVenda, { centavos: number | null; dias: number }>;
}

const CANAIS_DA_RECEITA: readonly CanalVenda[] = ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'];
const NOME_DO_CANAL_NA_FRASE: Record<CanalVenda, string> = { LOJA: 'Loja', DELIVERY_PROPRIO: 'Delivery próprio', IFOOD: 'iFood' };

/**
 * Compara a receita do recorte [de, ate] com as mesmas datas um ano antes, loja por loja. A variação em % só sai quando CADA loja
 * exigida do escopo tem lançamento em todos os dias do recorte (e, na receita de um canal, cada loja que vende o canal tem todos
 * os dias dele) e o período atual não tem lançamento faltando; senão ficam os dois números e a razão com o nome de quem falta
 * ("ano passado incompleto: Delivery 29 de 30 dias"). Somar as lojas esconderia o buraco de uma atrás da outra.
 */
export function compararComOAnoPassadoPorLoja(entrada: {
  de: string;
  ate: string;
  atual: Record<CanalVenda, number>;
  lojas: readonly LojaDoAnoPassado[];
  faltasNoPeriodoAtual: number;
}): AnoPassado {
  const de = mesmaDataNoAnoPassado(entrada.de);
  const ate = mesmaDataNoAnoPassado(entrada.ate);
  const diasDoRecorte = ate < de ? 0 : diasEntre(de, ate) + 1;
  const exigidas = entrada.lojas.filter((l) => l.exigida);
  const umaSo = exigidas.length === 1;
  const antes: Record<CanalVenda, number | null> = { LOJA: null, DELIVERY_PROPRIO: null, IFOOD: null };
  for (const l of entrada.lojas) for (const c of CANAIS_DA_RECEITA) if (l.canais[c].centavos !== null) antes[c] = (antes[c] ?? 0) + l.canais[c].centavos!;
  const temAlgum = CANAIS_DA_RECEITA.some((c) => antes[c] !== null);
  const bruta = temAlgum ? (antes.LOJA ?? 0) + (antes.DELIVERY_PROPRIO ?? 0) + (antes.IFOOD ?? 0) : null;
  const atualBruta = entrada.atual.LOJA + entrada.atual.DELIVERY_PROPRIO + entrada.atual.IFOOD;
  // Cobertura da receita BRUTA de uma loja (2.4, 2ª reprovação do Guardião): o dia só conta se TODOS os canais que ela precisa cobrir
  // têm lançamento nele. Contar "algum canal" deixava a loja que lançou o salão e esqueceu o iFood de um dia com o ano passado menor, e
  // a rede pintava de azul (+37,6 % no lugar de −4,1 %). Precisa cobrir: o canal que ela vende hoje e que existia no ano passado (alguma
  // loja lançou), e o canal que ela mesma lançou. Canal que nenhuma loja lançou "não vendia" (a mesma regra da linha do canal).
  const existia = (c: CanalVenda) => antes[c] !== null;
  const coberturaDaBruta = (l: LojaDoAnoPassado): { nome: string; dias: number; canais: string | null } => {
    const exige = CANAIS_DA_RECEITA.filter((c) => (l.vende.includes(c) && existia(c)) || l.canais[c].dias > 0);
    if (exige.length === 0) return { nome: l.nome, dias: l.dias, canais: null };
    const dias = Math.min(...exige.map((c) => l.canais[c].dias));
    // Faltou o dia inteiro (todos os canais iguais): só o nome. Faltou só um canal: o nome do canal vai junto.
    const faltam = exige.filter((c) => l.canais[c].dias < diasDoRecorte && l.canais[c].dias < l.dias);
    return { nome: l.nome, dias, canais: faltam.length > 0 ? faltam.map((c) => NOME_DO_CANAL_NA_FRASE[c]).join(' e ') : null };
  };
  const coberturas = exigidas.map(coberturaDaBruta);
  const diasComLancamento = coberturas.length === 0 ? 0 : Math.min(...coberturas.map((c) => c.dias));

  const SEM_LANCAMENTO = { porque: 'Sem lançamento de faturamento no mesmo período do ano passado.', curto: 'sem lançamento no ano passado' };
  /** O motivo de uma linha: nulo = a variação vale. `pares` = (loja, dias lançados) que a linha exige. */
  const motivoDe = (pares: readonly { nome: string; dias: number; canais?: string | null }[], rotulo: string | null): { porque: string; curto: string } | null => {
    if (!temAlgum) return SEM_LANCAMENTO;
    const faltam = pares.filter((p) => p.dias < diasDoRecorte);
    if (faltam.length > 0 && !(rotulo !== null && pares.every((p) => p.dias === 0))) {
      const quem = umaSo
        ? `${faltam[0].canais ? `${faltam[0].canais} ` : ''}${faltam[0].dias} de ${diasDoRecorte} dias`
        : faltam.map((p) => `${p.nome}${p.canais ? ` (${p.canais})` : ''} ${p.dias} de ${diasDoRecorte}`).join(', ');
      const onde = rotulo ? ` no canal ${rotulo}` : '';
      return {
        porque: `Ano passado${umaSo ? '' : ' incompleto'}${onde}: ${quem}${umaSo ? ' com lançamento' : ''}. Sem a cobertura inteira a variação não é justa.`,
        curto: `ano passado${umaSo ? '' : ' incompleto'}${onde}: ${quem}`,
      };
    }
    if (entrada.faltasNoPeriodoAtual > 0) return { porque: 'O período de agora tem lançamento de faturamento faltando: a variação sai quando ele estiver completo.', curto: 'faltam lançamentos de faturamento neste período' };
    return null;
  };
  const doCanal = (c: CanalVenda) => exigidas.filter((l) => l.vende.includes(c)).map((l) => ({ nome: l.nome, dias: l.canais[c].dias }));
  const daBruta = motivoDe(coberturas, null);
  const variacao = (atual: number, anterior: number | null, m: ReturnType<typeof motivoDe>): number | null => (m === null && anterior !== null && anterior > 0 ? dividirExato(BigInt(atual - anterior) * 10_000n, BigInt(anterior)) : null);
  return {
    de,
    ate,
    diasComLancamento,
    diasDoRecorte,
    semVariacaoPorque: daBruta?.porque ?? null,
    motivoCurto: daBruta?.curto ?? null,
    linhas: [
      { chave: 'bruta', atualCentavos: atualBruta, anteriorCentavos: bruta, variacaoBp: variacao(atualBruta, bruta, daBruta), semVariacaoPorque: daBruta?.porque ?? null, motivoCurto: daBruta?.curto ?? null },
      ...CANAIS_DA_RECEITA.map((c) => {
        // Um canal que NENHUMA loja lançou no ano passado "não vendia": a frase é a do canal (sem lançamento), não a de buraco.
        const m = motivoDe(doCanal(c), NOME_DO_CANAL_NA_FRASE[c]);
        return { chave: c as ChaveDaReceita, atualCentavos: entrada.atual[c], anteriorCentavos: antes[c], variacaoBp: variacao(entrada.atual[c], antes[c], m), semVariacaoPorque: m?.porque ?? null, motivoCurto: m?.curto ?? null };
      }),
    ],
  };
}

/** Os grãos do ano passado (um por dia e canal) somados por loja: dias distintos e total por canal. `lojas` = as do escopo (nome, ativa, canais que vende). */
export function somarOAnoPassadoPorLoja(graos: readonly GraoDoAnoPassado[], lojas?: readonly { id: string; nome: string; ativa: boolean; canais: readonly CanalVenda[] }[]): LojaDoAnoPassado[] {
  const porLoja = new Map<string, GraoDoAnoPassado[]>();
  for (const g of graos) porLoja.set(g.lojaId ?? '', [...(porLoja.get(g.lojaId ?? '') ?? []), g]);
  const base = lojas ? lojas.map((l) => ({ id: l.id, nome: l.nome, exigida: l.ativa, vende: l.canais })) : Array.from(porLoja.keys()).map((id) => ({ id, nome: '', exigida: true, vende: CANAIS_DA_RECEITA.filter((c) => porLoja.get(id)!.some((g) => g.canal === c)) }));
  // Loja com lançamento mas fora da lista (desativada): entra na soma, não é exigida.
  for (const id of porLoja.keys()) if (!base.some((b) => b.id === id)) base.push({ id, nome: '', exigida: false, vende: [] });
  return base.map((b) => {
    const gs = porLoja.get(b.id) ?? [];
    const canais = Object.fromEntries(
      CANAIS_DA_RECEITA.map((c) => {
        const dc = gs.filter((g) => g.canal === c);
        return [c, { centavos: dc.length ? dc.reduce((t, g) => t + g.valorCentavos, 0) : null, dias: new Set(dc.map((g) => g.data)).size }];
      }),
    ) as LojaDoAnoPassado['canais'];
    return { lojaId: b.id, nome: b.nome, exigida: b.exigida, vende: b.vende, dias: new Set(gs.map((g) => g.data)).size, canais };
  });
}

/** O mesmo, a partir dos grãos do ano passado (a leitura ao vivo). */
export function compararComOAnoPassado(entrada: {
  de: string;
  ate: string;
  atual: Record<CanalVenda, number>;
  graosDoAnoPassado: readonly GraoDoAnoPassado[];
  faltasNoPeriodoAtual: number;
  /** As lojas do escopo: sem elas, cada `lojaId` dos grãos vale como uma loja exigida (e sem `lojaId`, uma loja só). */
  lojas?: readonly { id: string; nome: string; ativa: boolean; canais: readonly CanalVenda[] }[];
}): AnoPassado {
  return compararComOAnoPassadoPorLoja({ de: entrada.de, ate: entrada.ate, atual: entrada.atual, lojas: somarOAnoPassadoPorLoja(entrada.graosDoAnoPassado, entrada.lojas), faltasNoPeriodoAtual: entrada.faltasNoPeriodoAtual });
}

// ============================================================ o ano passado guardado na fotografia (2.4, decisão 179)

/**
 * O que a fotografia v3 guarda do ano passado, por loja: o nome, se era exigida (ativa), os canais que vendia, os dias com lançamento
 * (qualquer canal) e, por canal, o total e os dias. O fechado lê o ano passado e a cobertura SÓ daqui: editar o faturamento de um
 * período antigo depois não muda a variação do fechado, e a regra "cada loja com todos os dias" vale igual ao vivo e no fechado.
 */
export interface AnoPassadoGuardado {
  versao: 1;
  de: string;
  ate: string;
  lojas: Record<string, { nome: string; exigida: boolean; vende: CanalVenda[]; dias: number; canais: Partial<Record<CanalVenda, { centavos: number; dias: number }>> }>;
}

export function anoPassadoParaGravar(de: string, ate: string, graos: readonly (GraoDoAnoPassado & { lojaId: string })[], lojas: readonly { id: string; nome: string; ativa: boolean; canais: readonly CanalVenda[] }[]): AnoPassadoGuardado {
  const out: AnoPassadoGuardado['lojas'] = {};
  for (const l of somarOAnoPassadoPorLoja(graos, lojas)) {
    const canais: AnoPassadoGuardado['lojas'][string]['canais'] = {};
    for (const c of CANAIS_DA_RECEITA) if (l.canais[c].centavos !== null) canais[c] = { centavos: l.canais[c].centavos!, dias: l.canais[c].dias };
    const dados = lojas.find((x) => x.id === l.lojaId);
    out[l.lojaId] = { nome: dados?.nome ?? '', exigida: l.exigida, vende: [...l.vende], dias: l.dias, canais };
  }
  return { versao: 1, de, ate, lojas: out };
}

/** Lê o que `anoPassadoParaGravar` guardou (e devolve null se o JSON não é isso), só das lojas pedidas. */
export function lerAnoPassadoGuardado(bruto: unknown, lojas: readonly string[] | 'todas'): LojaDoAnoPassado[] | null {
  if (typeof bruto !== 'object' || bruto === null) return null;
  const g = bruto as Partial<AnoPassadoGuardado>;
  if (g.versao !== 1 || typeof g.lojas !== 'object' || g.lojas === null) return null;
  const out: LojaDoAnoPassado[] = [];
  for (const [id, l] of Object.entries(g.lojas)) {
    if (lojas !== 'todas' && !lojas.includes(id)) continue;
    const canais = Object.fromEntries(CANAIS_DA_RECEITA.map((c) => [c, { centavos: typeof l.canais?.[c]?.centavos === 'number' ? l.canais[c]!.centavos : null, dias: Number(l.canais?.[c]?.dias ?? 0) }])) as LojaDoAnoPassado['canais'];
    out.push({ lojaId: id, nome: String(l.nome ?? ''), exigida: l.exigida === true, vende: (l.vende ?? []).filter((c) => CANAIS_DA_RECEITA.includes(c)), dias: Number(l.dias ?? 0), canais });
  }
  return out;
}

/** "+12,5 %" · "−3,0 %" (variação da receita, em pontos-base). */
export function textoDaVariacao(bp: number): string {
  const v = (Math.abs(bp) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${bp < 0 ? '−' : '+'}${v} %`;
}

// ============================================================ a tela das metas


export interface LinhaDeMeta {
  chave: string;
  nome: string;
  tipo: LinhaDoDre['tipo'];
  nivel: 0 | 1;
  /** A linha aceita meta? (só as duas de detalhe do CMV não.) */
  aceita: boolean;
  /** Receita: crescimento sobre o ano passado; o resto, % da receita bruta. */
  tipoDaMeta: TipoDaMeta;
  /** A linha está oculta do formulário de despesa (continua no DRE se tem valor). */
  oculta: boolean;
}

/**
 * As linhas do DRE, na ordem em que aparecem, para a tela das metas: a estrutura de um DRE sem
 * nenhum número (todas as linhas do plano, até as ocultas).
 */
export function linhasDeMeta(plano: readonly LinhaDoPlano[]): LinhaDeMeta[] {
  const todasVisiveis = plano.map((l) => ({ ...l, ativa: true }));
  const vazio = montarDre({ escopo: { tipo: 'rede' }, plano: todasVisiveis, receitas: [], taxaIfood: null, despesas: [], cmv: SEM_CMV });
  const oculta = new Map(plano.map((l) => [l.codigo ?? `id:${l.id}`, !l.ativa]));
  return vazio.linhas.filter((l) => l.chave !== CHAVE_CMV_COMPRA && l.chave !== CHAVE_CMV_REAL).map((l) => ({ chave: l.chave, nome: l.nome, tipo: l.tipo, nivel: l.nivel, aceita: aceitaMeta(l.chave), tipoDaMeta: tipoDaMeta(l.chave), oculta: oculta.get(l.chave) === true }));
}

/**
 * Compara o CRESCIMENTO da receita com a meta de crescimento (2.4): o realizado é a variação sobre o mesmo período do
 * ano passado (`AnoPassado`), o desvio é variação menos meta, e a faixa usa a escala da receita. Sem dado dos dois lados
 * (sem dia apurado, ano passado sem lançamento ou incompleto, canal que não vendia) NÃO compara, e diz por quê.
 */
export function compararCrescimento(chave: ChaveDaReceita, metaBp: number, anoPassado: AnoPassado | null, faixas: FaixasDoFarol = FAIXAS_DO_FAROL): ComparacaoComMeta {
  const linha = anoPassado?.linhas.find((l) => l.chave === chave);
  const metaCentavos = linha && linha.anteriorCentavos !== null && linha.anteriorCentavos > 0 ? dividirExato(BigInt(linha.anteriorCentavos) * BigInt(10_000 + metaBp), 10_000n) : null;
  const sem = (motivo: string, variacaoBp: number | null = null): ComparacaoComMeta => ({ metaBp, tipo: 'crescimento', metaCentavos, desvioBp: null, desvioTexto: null, variacaoBp, faixa: null, semComparacao: motivo });
  if (!anoPassado || !linha) return sem('nenhum dia apurado');
  if (linha.motivoCurto !== null) return sem(linha.motivoCurto);
  if (linha.anteriorCentavos === null || linha.anteriorCentavos <= 0 || linha.variacaoBp === null) return sem(chave === 'bruta' ? 'sem lançamento no ano passado' : 'o canal não vendia no ano passado');
  const desvioBp = linha.variacaoBp - metaBp;
  return { metaBp, tipo: 'crescimento', metaCentavos, desvioBp, desvioTexto: textoDosPontos(desvioBp), variacaoBp: linha.variacaoBp, faixa: faixaDoDesvio('MAIOR_MELHOR', desvioBp, 'receita', faixas), semComparacao: null };
}

/**
 * O realizado × meta de cada linha do DRE de um escopo. `metas` = chave → pontos-base (só as que
 * têm meta). Na visão de uma loja, os dois "Resultado" ficam sem meta. Linha sem meta não entra.
 * As linhas de receita comparam o crescimento sobre o ano passado (`anoPassado`), as outras o % da receita.
 */
export function compararLinhas(
  linhas: readonly LinhaDoDre[],
  metas: ReadonlyMap<string, number>,
  receitaBrutaCentavos: number,
  daLoja: boolean,
  anoPassado: AnoPassado | null = null,
  faixas: FaixasDoFarol = FAIXAS_DO_FAROL,
): Record<string, ComparacaoComMeta> {
  const out: Record<string, ComparacaoComMeta> = {};
  for (const l of linhas) {
    const bp = metas.get(l.chave);
    if (bp === undefined || !aceitaMeta(l.chave) || (daLoja && !metaApareceNaLoja(l.chave))) continue;
    out[l.chave] = tipoDaMeta(l.chave) === 'crescimento' ? compararCrescimento(CHAVE_DA_RECEITA[l.chave], bp, anoPassado, faixas) : compararComMeta(l, bp, receitaBrutaCentavos, faixas);
  }
  return out;
}

/** "+5,0 %" · "0,0 %": a meta de crescimento escrita (o sinal vai junto, é um acréscimo). */
export function textoDaMetaDeCrescimento(bp: number): string {
  return `${bp > 0 ? '+' : ''}${(bp / 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} %`;
}
