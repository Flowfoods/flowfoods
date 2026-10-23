/**
 * Relatórios de compras (L.2) — a parte PURA (sem banco, sem Next): ler os filtros da URL, as datas e a base da data, a conta do
 * preço médio ponderado, o texto de cada situação e a planilha (CSV) com a proteção contra fórmula. O banco fica em
 * `compras-relatorio.ts`; a tela, em `src/components/erp/telas/compras/relatorio-*.tsx`.
 *
 * Regras que atravessam tudo (decisões 355 em diante):
 *  - a DATA USADA é uma só em filtro, total, agrupamento por dia e exportação: entrada da nota (padrão), emissão (só as notas do XML
 *    têm) ou lançamento no sistema (instante gravado em UTC, lido no relógio do Rio);
 *  - dinheiro soma; quantidade nunca soma unidades diferentes (uma linha por unidade);
 *  - preço médio = valor comparável ÷ quantidade correspondente (ponderado), nunca média dos preços; sem base, não calcula.
 */

import { OPCOES_POR_PAGINA, POR_PAGINA_PADRAO, lerPorPagina } from './insumo-campos';
import { hojeNoRio, lerData } from './compra-campos';
import { custoDaEmbalagem, type CustoExato, type Unidade } from './unidades';

/** O relógio da operação: todas as lojas do ERP contam o dia no Rio (a loja ainda não tem fuso próprio; decisão 356). */
export const FUSO_OPERACIONAL = 'America/Sao_Paulo';

export type BaseDeData = 'entrada' | 'emissao' | 'lancamento';
export const BASES_DE_DATA: Record<BaseDeData, { rotulo: string; curto: string; explica: string }> = {
  entrada: {
    rotulo: 'Data da entrada da nota',
    curto: 'entrada da nota',
    explica: 'A data que a nota recebeu no sistema (a digitada na nota). É a que põe a compra no período do CMV.',
  },
  emissao: {
    rotulo: 'Data de emissão da nota fiscal',
    curto: 'emissão da nota fiscal',
    explica: 'A data em que o fornecedor emitiu a nota fiscal. Só as notas que vieram do XML têm essa data; as digitadas à mão ficam de fora.',
  },
  lancamento: {
    rotulo: 'Dia do lançamento no sistema',
    curto: 'lançamento no sistema',
    explica: 'O dia em que alguém lançou a nota no ERP, pelo relógio do Rio de Janeiro (a virada do dia é à meia-noite do Rio).',
  },
};
/** O nome curto da opção no seletor (o rótulo inteiro cortava a 1180 px). */
export const OPCAO_DA_BASE: Record<BaseDeData, string> = { entrada: 'Entrada da nota', emissao: 'Emissão da nota fiscal', lancamento: 'Lançamento no sistema' };
export const LISTA_DE_BASES = Object.keys(BASES_DE_DATA) as BaseDeData[];

export type AgruparPor = 'insumo' | 'fornecedor' | 'dia';
export const ROTULO_DO_AGRUPAMENTO: Record<AgruparPor, string> = { insumo: 'Insumo', fornecedor: 'Fornecedor', dia: 'Dia' };
export const LISTA_DE_AGRUPAMENTOS = Object.keys(ROTULO_DO_AGRUPAMENTO) as AgruparPor[];

/** Lançadas = compras; canceladas = nunca são compra e nunca entram em total: só aparecem separadas e rotuladas. */
export type SituacaoDoRelatorio = 'lancadas' | 'canceladas';

export type MotivoSemBase = 'insumo' | 'unidade' | 'conversao' | 'valor';
export const FRASE_DO_MOTIVO: Record<MotivoSemBase, string> = {
  insumo: 'a linha da nota não está ligada a um insumo',
  unidade: 'a unidade não foi gravada na nota',
  conversao: 'a embalagem e a quantidade não fecham a conta',
  valor: 'o valor da linha é zero (bonificação)',
};
export const LISTA_DE_MOTIVOS = Object.keys(FRASE_DO_MOTIVO) as MotivoSemBase[];

/** Ao exportar ou imprimir, o teto de linhas. Passou disso a tela diz (nunca corta calada) e manda reduzir o recorte. */
export const TETO_DA_PLANILHA = 50_000;
export const TETO_DA_IMPRESSAO = 1_500;

export interface FiltrosDoRelatorio {
  /** Vazio = todas as lojas do acesso. Outras lojas pedidas fora do acesso nunca ampliam: o relatório sai vazio. */
  lojaIds: string[];
  fornecedorId: string;
  insumoId: string;
  /** Busca pelo nome (ou marca) do insumo; ignora caixa e acento. */
  q: string;
  categoriaId: string;
  de: string;
  ate: string;
  base: BaseDeData;
  agrupar: AgruparPor;
  situacao: SituacaoDoRelatorio;
  /** O que a tela mostra embaixo: o resumo por grupo ou as linhas das compras. */
  ver: 'resumo' | 'linhas';
  /** Abre só as linhas deste grupo (id do insumo, id do fornecedor ou "n:<nome da nota>" se não tem cadastro, ou dia; "-" = sem insumo/fornecedor). */
  grupo: string;
  /** Abre só as linhas desta unidade ("sem" = sem unidade gravada). */
  unidade: '' | Unidade | 'sem';
  /** "sembase" = só as linhas que não entram no preço médio. */
  so: '' | 'sembase';
  pagina: number;
  porPagina: number;
  /** Frase quando o período digitado não faz sentido (o relatório sai vazio, com a frase). */
  periodoInvalido: string | null;
  /** L.3: de onde a pessoa veio (a comparação). Dado de fora: a página só o aceita depois de `caminhoDeVolta`; aqui só o tamanho e a barra. */
  volta: string;
}

type Params = Record<string, string | string[] | undefined>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const todos = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v === undefined ? [] : [v]);
const idOuNada = (v: string) => (/^[a-z0-9]{1,64}$/i.test(v) ? v : '');

/** A página da URL: inteiro de 1 a 1.000.000 (como a lista de insumos); "1e12", "abc", negativo e decimal caem na primeira. */
export function lerPagina(v: string): number {
  const n = /^\d{1,7}$/.test(v) ? Number(v) : NaN;
  return Number.isSafeInteger(n) && n >= 1 && n <= 1_000_000 ? n : 1;
}

export const primeiroDiaDoMes = (iso: string) => `${iso.slice(0, 7)}-01`;

/** Soma `n` dias a "2026-10-14" no calendário (sem fuso: é data, não instante). */
export function somarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function ultimoDiaDoMes(iso: string): string {
  const [a, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

const ANO_MINIMO = '2000-01-01';
const ANO_MAXIMO = '2100-12-31';

export function lerFiltrosDoRelatorio(sp: Params, hoje = hojeNoRio(), padrao: Partial<FiltrosDoRelatorio> = {}): FiltrosDoRelatorio {
  const base = um(sp.base);
  const agrupar = um(sp.agrupar);
  const unidade = um(sp.unidade);
  const de = lerData(um(sp.de)) ?? padrao.de ?? primeiroDiaDoMes(hoje);
  const ate = lerData(um(sp.ate)) ?? padrao.ate ?? hoje;
  let periodoInvalido: string | null = null;
  if (ate < de) periodoInvalido = 'A data final vem antes da inicial. Corrija o período para ver as compras.';
  else if (de < ANO_MINIMO || ate > ANO_MAXIMO) periodoInvalido = 'Escolha datas entre 2000 e 2100.';
  const grupo = um(sp.grupo);
  return {
    lojaIds: Array.from(new Set(todos(sp.loja).map(idOuNada).filter(Boolean))).slice(0, 100),
    fornecedorId: idOuNada(um(sp.fornecedor)),
    insumoId: idOuNada(um(sp.insumo)),
    q: um(sp.q).trim().slice(0, 80),
    categoriaId: idOuNada(um(sp.categoria)),
    de,
    ate,
    base: (LISTA_DE_BASES as string[]).includes(base) ? (base as BaseDeData) : 'entrada',
    agrupar: (LISTA_DE_AGRUPAMENTOS as string[]).includes(agrupar) ? (agrupar as AgruparPor) : (padrao.agrupar ?? 'insumo'),
    situacao: um(sp.situacao) === 'canceladas' ? 'canceladas' : 'lancadas',
    ver: um(sp.ver) === 'linhas' ? 'linhas' : (padrao.ver ?? 'resumo'),
    // "n:<nome da nota>" = fornecedor sem cadastro, pelo nome que a nota guardou (decisão 386).
    grupo: grupo === '-' || /^[a-z0-9]{1,64}$/i.test(grupo) || lerData(grupo) === grupo || /^n:[^\u0000-\u001f\u007f]{1,500}$/.test(grupo) ? grupo : '',
    unidade: unidade === 'sem' || unidade === 'KG' || unidade === 'L' || unidade === 'UN' ? unidade : '',
    so: um(sp.so) === 'sembase' ? 'sembase' : '',
    pagina: lerPagina(um(sp.pagina)),
    porPagina: lerPorPagina(um(sp.por)),
    periodoInvalido,
    volta: /^\/[^\s]{0,1999}$/.test(um(sp.volta)) ? um(sp.volta) : '',
  };
}

/** A URL do relatório com estes filtros (e as mudanças pedidas). Sempre leva as datas e a base: o endereço não muda com o dia. */
export function queryDoRelatorio(f: FiltrosDoRelatorio, mudar: Partial<FiltrosDoRelatorio> = {}, opcoes: { semPagina?: boolean } = {}): string {
  const x = { ...f, ...mudar };
  const q = new URLSearchParams();
  for (const l of x.lojaIds) q.append('loja', l);
  if (x.fornecedorId) q.set('fornecedor', x.fornecedorId);
  if (x.insumoId) q.set('insumo', x.insumoId);
  if (x.q) q.set('q', x.q);
  if (x.categoriaId) q.set('categoria', x.categoriaId);
  q.set('de', x.de);
  q.set('ate', x.ate);
  q.set('base', x.base);
  q.set('agrupar', x.agrupar);
  if (x.situacao !== 'lancadas') q.set('situacao', x.situacao);
  if (x.ver !== 'resumo') q.set('ver', x.ver);
  if (x.grupo) q.set('grupo', x.grupo);
  if (x.unidade) q.set('unidade', x.unidade);
  if (x.so) q.set('so', x.so);
  if (x.porPagina !== POR_PAGINA_PADRAO) q.set('por', String(x.porPagina));
  if (!opcoes.semPagina && x.pagina > 1) q.set('pagina', String(x.pagina));
  if (x.volta) q.set('volta', x.volta);
  return q.toString();
}

export { OPCOES_POR_PAGINA, POR_PAGINA_PADRAO };

/** Os atalhos de período (links): hoje, ontem, 7 dias, este mês e o mês passado. */
export function atalhosDePeriodo(hoje: string): { chave: string; rotulo: string; de: string; ate: string }[] {
  const mesPassado = somarDias(primeiroDiaDoMes(hoje), -1);
  return [
    { chave: 'hoje', rotulo: 'Hoje', de: hoje, ate: hoje },
    { chave: 'ontem', rotulo: 'Ontem', de: somarDias(hoje, -1), ate: somarDias(hoje, -1) },
    { chave: '7dias', rotulo: 'Últimos 7 dias', de: somarDias(hoje, -6), ate: hoje },
    { chave: 'mes', rotulo: 'Este mês', de: primeiroDiaDoMes(hoje), ate: hoje },
    { chave: 'mespassado', rotulo: 'Mês passado', de: primeiroDiaDoMes(mesPassado), ate: ultimoDiaDoMes(mesPassado) },
  ];
}

/** O recorte tem um insumo só? (só então o preço médio quer dizer alguma coisa) */
export const recorteDeUmInsumo = (f: Pick<FiltrosDoRelatorio, 'insumoId' | 'agrupar' | 'grupo'>) =>
  !!f.insumoId || (f.agrupar === 'insumo' && !!f.grupo && f.grupo !== '-');

// ------------------------------------------------------------------- a conta

/** O que o banco soma por unidade (ou por grupo × unidade). Só inteiros: centavos e milésimos. */
export interface TotalPorUnidade {
  /** null = a nota não gravou a unidade desta linha. */
  unidade: Unidade | null;
  linhas: number;
  quantidadeMilesimos: number;
  valorCentavos: number;
  freteCentavos: number;
  /** Só as linhas com insumo, unidade, conversão que fecha e valor: as que entram no preço médio. */
  comparavel: { linhas: number; quantidadeMilesimos: number; valorCentavos: number; freteCentavos: number };
}

/** Preço médio ponderado dos itens: Σ valor ÷ Σ quantidade (só das comparáveis). Nulo = sem base. */
export function precoMedioPonderado(t: Pick<TotalPorUnidade, 'comparavel'>): CustoExato | null {
  return custoDaEmbalagem(t.comparavel.valorCentavos, 0, t.comparavel.quantidadeMilesimos);
}

/** Custo médio entregue (com o frete atribuído): Σ (valor + frete) ÷ Σ quantidade. Nulo = sem base. */
export function custoMedioEntregue(t: Pick<TotalPorUnidade, 'comparavel'>): CustoExato | null {
  return custoDaEmbalagem(t.comparavel.valorCentavos, t.comparavel.freteCentavos, t.comparavel.quantidadeMilesimos);
}

/** Linhas que ficaram de fora do preço médio nesta unidade. */
export const linhasSemBase = (t: Pick<TotalPorUnidade, 'linhas' | 'comparavel'>) => t.linhas - t.comparavel.linhas;

/** Preço unitário de UMA linha (valor ÷ quantidade) e custo entregue (com o frete). Nulo = sem base. */
export function precoDaLinha(l: { motivoSemBase: MotivoSemBase | null; valorCentavos: number; freteCentavos: number; quantidadeMilesimos: number }) {
  if (l.motivoSemBase) return { preco: null, entregue: null };
  return { preco: custoDaEmbalagem(l.valorCentavos, 0, l.quantidadeMilesimos), entregue: custoDaEmbalagem(l.valorCentavos, l.freteCentavos, l.quantidadeMilesimos) };
}

/** Soma por unidade que sobreviveu à agregação: as chaves em ordem fixa (kg, L, un, sem unidade). */
const ORDEM_DAS_UNIDADES: Record<string, number> = { KG: 0, L: 1, UN: 2, '': 3 };
export const ordemDasUnidades = (a: { unidade: Unidade | null }, b: { unidade: Unidade | null }) =>
  ORDEM_DAS_UNIDADES[a.unidade ?? ''] - ORDEM_DAS_UNIDADES[b.unidade ?? ''];

// ------------------------------------------------------------ texto da tela

/** "Datas pela entrada da nota, de 01/10/2026 a 31/10/2026" (a mesma frase na tela, na impressão e no CSV). */
export function fraseDoPeriodo(f: Pick<FiltrosDoRelatorio, 'de' | 'ate' | 'base'>): string {
  const br = (d: string) => d.split('-').reverse().join('/');
  const quando = f.de === f.ate ? `em ${br(f.de)}` : `de ${br(f.de)} a ${br(f.ate)}`;
  return `${BASES_DE_DATA[f.base].rotulo}, ${quando}`;
}

// ------------------------------------------------------------------- planilha

/** Célula de TEXTO que uma planilha abriria como fórmula (= + - @, tab, retorno de linha), com ou sem espaço antes. */
export function abreComoFormula(t: string): boolean {
  return /^[=+\-@\t\r]/.test(t) || /^\s+[=+\-@]/.test(t);
}

/**
 * Uma célula de texto do CSV: a fórmula ganha um apóstrofo na frente (a planilha mostra o texto, não calcula), as aspas dobram e
 * a célula com `;`, aspas ou quebra de linha vai entre aspas. Quebra de linha dentro do texto vira espaço (a linha do CSV é uma
 * linha). Número NÃO passa por aqui (é sempre o que o sistema formatou).
 */
export function celulaDeTexto(valor: string | null | undefined): string {
  let t = (valor ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ');
  if (abreComoFormula(t)) t = `'${t}`;
  return /[;"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export const reaisParaPlanilha = (centavos: number) => `${Math.trunc(centavos / 100)},${String(centavos % 100).padStart(2, '0')}`;
export const quantidadeParaPlanilha = (milesimos: number) => {
  const inteiro = Math.trunc(milesimos / 1000);
  const resto = milesimos % 1000;
  return resto ? `${inteiro},${String(resto).padStart(3, '0').replace(/0+$/, '')}` : String(inteiro);
};

export const BOM_DO_CSV = '﻿';
