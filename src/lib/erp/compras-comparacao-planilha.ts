/**
 * Comparação de fornecedores e de períodos (L.3) — a planilha (CSV). Sai do MESMO motor da tela (`comparacao-*`), com os mesmos
 * filtros, os mesmos períodos, a mesma data usada, a mesma medida e as mesmas contas puras: cada número é o da tela, sem refazer
 * conta. Mesma proteção da L.2 (texto que abre como fórmula ganha apóstrofo; `;`, vírgula decimal, BOM) e a mesma regra de acesso
 * (`compras.ver`, só as lojas do acesso; sem sessão 401, sem permissão 403, período torto 400, grande demais 413 em frase).
 */

import type { Alcance } from './permissoes';
import { pode } from './permissoes';
import type { ClienteDoParceiro } from './tenant';
import { comparacaoDeFornecedores, comparacaoDePeriodos, type ComparacaoDeFornecedoresDaTela, type ComparacaoDePeriodosDaTela, TETO_DE_CELULAS } from './compras-comparacao';
import {
  avisosDaComparacao,
  FRASE_DA_FORMULA,
  FRASE_PRECO_VOLUME,
  MEDIDAS,
  lerFiltrosDeFornecedores,
  lerFiltrosDePeriodos,
  percentualParaPlanilha,
  variacaoParaPlanilha,
  type FiltrosDePeriodos,
  type FornecedorRanqueado,
  type ItemComparado,
  type Lado,
} from './compras-comparacao-campos';
import {
  BASES_DE_DATA,
  BOM_DO_CSV,
  celulaDeTexto,
  fraseDoPeriodo,
  quantidadeParaPlanilha,
  reaisParaPlanilha,
  type FiltrosDoRelatorio,
} from './compras-relatorio-campos';
import { parametrosDaUrl, precoParaPlanilha, respostaHttpDaPlanilha, type RespostaDaPlanilha } from './compras-relatorio-planilha';
import { formatarData, hojeNoRio } from './compra-campos';
import { UNIDADES, type Fracao, type Unidade } from './unidades';

const SEP = ';';
const linha = (celulas: (string | number)[]) => celulas.map((c) => (typeof c === 'number' ? String(c) : c)).join(SEP);
const texto = celulaDeTexto;
const nomeDaUnidade = (u: Unidade | null) => (u ? UNIDADES[u].sigla : 'sem unidade');

/** Reais por unidade com 4 casas a partir de centavos por unidade em fração exata (metade para cima), ex.: 150/1 -> "1,5000". */
export function fracaoParaPlanilha(f: Fracao): string {
  const n = (2n * f.num * 100n + f.den) / (2n * f.den);
  return `${n / 10_000n},${String(n % 10_000n).padStart(4, '0')}`;
}

const doLado = (l: Lado | null, campo: (l: Lado) => string) => (l ? campo(l) : '');
const custoDoLado = (l: Lado | null) => (l && l.custo ? precoParaPlanilha(l.gastoCentavos, l.quantidadeMilesimos) : '');

function cabecalho(titulo: string, periodos: string[], f: FiltrosDoRelatorio, c: { lojas: string[]; fornecedor?: string; insumo?: string; categoria?: string; medida?: string }, geradoEm: string): string[] {
  const filtros = [
    'Notas lançadas (canceladas ficam de fora)',
    c.fornecedor ? `Fornecedor: ${c.fornecedor}` : '',
    c.insumo ? `Insumo: ${c.insumo}` : f.q ? `Insumo com “${f.q}” no nome ou na marca` : '',
    c.categoria ? `Categoria (a de hoje no cadastro): ${c.categoria}` : '',
  ].filter(Boolean);
  return [
    linha([texto('Relatório'), texto(titulo)]),
    ...periodos.map((p) => linha([texto(p.split('|')[0]), texto(p.split('|')[1])])),
    linha([texto('Como a data é lida'), texto(BASES_DE_DATA[f.base].explica)]),
    ...(c.medida ? [linha([texto('Medida do gasto'), texto(c.medida)])] : []),
    linha([texto('Lojas'), texto(c.lojas.join(', '))]),
    linha([texto('Filtros'), texto(filtros.join(' · '))]),
    linha([texto('Gerado em'), texto(geradoEm)]),
    linha([texto('Valores'), texto('Reais (R$) com vírgula decimal; quantidade na unidade base de cada linha (kg, L ou un); unidades diferentes nunca são somadas. Só entram as compras comparáveis (com insumo, unidade e valor); o resto é contado à parte.')]),
  ];
}

// ------------------------------------------------------------- períodos

export const COLUNAS_DOS_INSUMOS = [
  'Insumo',
  'Unidade',
  'Situação',
  'Quantidade A',
  'Quantidade B',
  'Compras A (notas)',
  'Compras B (notas)',
  'Custo médio A (R$/un base)',
  'Custo médio B (R$/un base)',
  'Variação do custo médio (%)',
  'Gasto A (R$)',
  'Gasto B (R$)',
  'Variação (R$)',
  'Efeito volume (R$)',
  'Efeito preço (R$)',
  'Efeito preço: mesmo fornecedor (R$)',
  'Efeito preço: troca de fornecedor (R$)',
  'Entrou (R$)',
  'Saiu (R$)',
] as const;

const SITUACAO = { ambos: 'Nos dois períodos', 'so-a': 'Só no período A (saiu)', 'so-b': 'Só no período B (entrou)' } as const;
const opcional = (n: number | null) => (n === null ? '' : variacaoParaPlanilha(n));

export function linhaDoInsumo(i: ItemComparado): string {
  return linha([
    texto(i.insumo),
    texto(nomeDaUnidade(i.unidade)),
    texto(SITUACAO[i.situacao]),
    doLado(i.a, (l) => quantidadeParaPlanilha(l.quantidadeMilesimos)),
    doLado(i.b, (l) => quantidadeParaPlanilha(l.quantidadeMilesimos)),
    i.a ? i.a.notas : '',
    i.b ? i.b.notas : '',
    custoDoLado(i.a),
    custoDoLado(i.b),
    percentualParaPlanilha(i.variacaoDoCustoDecimos),
    doLado(i.a, (l) => reaisParaPlanilha(l.gastoCentavos)),
    doLado(i.b, (l) => reaisParaPlanilha(l.gastoCentavos)),
    variacaoParaPlanilha(i.variacaoCentavos),
    opcional(i.volumeCentavos),
    opcional(i.precoCentavos),
    opcional(i.mesmoFornecedorCentavos),
    opcional(i.trocaCentavos),
    i.situacao === 'so-b' ? variacaoParaPlanilha(i.entrouCentavos) : '',
    i.situacao === 'so-a' ? variacaoParaPlanilha(i.saiuCentavos) : '',
  ]);
}

export const COLUNAS_DOS_FORNECEDORES_DO_INSUMO = [
  'Insumo',
  'Fornecedor',
  'Quantidade A',
  'Quantidade B',
  'Custo médio A (R$/un base)',
  'Custo médio B (R$/un base)',
  'Gasto A (R$)',
  'Gasto B (R$)',
  'Efeito preço do fornecedor (R$)',
] as const;

export function totaisDosPeriodos(r: ComparacaoDePeriodosDaTela, f: FiltrosDePeriodos): string[] {
  const s = r.comparacao!.resumo;
  const a = r.a!;
  const b = r.b!;
  const fora = (l: typeof a) => `${l.semBase.linhas} linha(s), R$ ${reaisParaPlanilha(l.semBase.valorCentavos + l.semBase.freteCentavos)}`;
  const semLado = s.semCompraA || s.semCompraB;
  const semEfeitos = semLado || s.nosDois === 0;
  const canc = (l: typeof a) => `${l.canceladas.notas} nota(s), R$ ${reaisParaPlanilha(l.canceladas.valorCentavos + l.canceladas.freteCentavos)}`;
  return [
    linha([texto('TOTAIS'), '']),
    linha([texto('Gasto no período A (R$)'), s.semCompraA ? 'sem compra comparável' : reaisParaPlanilha(s.gastoACentavos)]),
    linha([texto('Gasto no período B (R$)'), s.semCompraB ? 'sem compra comparável' : reaisParaPlanilha(s.gastoBCentavos)]),
    linha([texto('Variação B menos A (R$)'), semLado ? 'sem base (um dos períodos não tem compra comparável)' : variacaoParaPlanilha(s.variacaoCentavos)]),
    linha([texto('Variação sobre A (%)'), s.variacaoDecimos === null ? 'sem base' : percentualParaPlanilha(s.variacaoDecimos)]),
    ...(s.entrouDomina ? [linha([texto('Nota sobre a variação'), texto(`A maior parte (R$ ${reaisParaPlanilha(s.entrouCentavos)}) é de insumo que só aparece em B: não é aumento de preço.`)])] : []),
    linha([texto('Efeito volume (R$)'), semEfeitos ? '' : variacaoParaPlanilha(s.volumeCentavos)]),
    linha([texto('Efeito preço (R$)'), semEfeitos ? '' : variacaoParaPlanilha(s.precoCentavos)]),
    linha([texto('  do mesmo fornecedor (R$)'), semEfeitos ? '' : variacaoParaPlanilha(s.mesmoFornecedorCentavos)]),
    linha([texto('  troca de fornecedor (R$)'), semEfeitos ? '' : variacaoParaPlanilha(s.trocaCentavos)]),
    linha([texto(`Insumos só em B: entraram (${s.soEmB}) (R$)`), variacaoParaPlanilha(s.entrouCentavos)]),
    linha([texto(`Insumos só em A: saíram (${s.soEmA}) (R$)`), variacaoParaPlanilha(s.saiuCentavos)]),
    linha([texto('Conferência: volume + preço + entrou + saiu = variação'), texto(semLado ? 'não se aplica (sem base)' : s.fecha ? 'fecha' : 'NÃO FECHA')]),
    linha([texto('Fora da comparação (sem base) em A'), texto(fora(a))]),
    linha([texto('Fora da comparação (sem base) em B'), texto(fora(b))]),
    linha([texto('Canceladas em A (FORA dos totais)'), texto(canc(a))]),
    linha([texto('Canceladas em B (FORA dos totais)'), texto(canc(b))]),
    linha([texto('Medida'), texto(MEDIDAS[f.medida].rotulo)]),
  ];
}

export function planilhaDosPeriodos(r: ComparacaoDePeriodosDaTela, f: FiltrosDePeriodos, nomes: { fornecedor?: string; insumo?: string; categoria?: string }, geradoEm: string, hoje: string): string {
  const periodos = [
    `Período A (base)|${fraseDoPeriodo({ de: f.rel.de, ate: f.rel.ate, base: f.rel.base })}`,
    `Período B (comparado)|${fraseDoPeriodo({ de: f.deB, ate: f.ateB, base: f.rel.base })}`,
  ];
  const partes = cabecalho('Comparação de períodos', periodos, f.rel, { lojas: r.lojasUsadas.map((l) => l.nome), ...nomes, medida: MEDIDAS[f.medida].explica }, geradoEm);
  partes.push(linha([texto('Como ler'), texto(FRASE_PRECO_VOLUME)]));
  partes.push(linha([texto('A conta'), texto(FRASE_DA_FORMULA)]));
  // Os MESMOS avisos da tela ("Antes de ler"): quem lê só a planilha também sabe do que mudou a leitura.
  for (const x of avisosDaComparacao({ de: f.rel.de, ate: f.rel.ate, deB: f.deB, ateB: f.ateB }, r.a!, r.b!, r.aguardando, hoje)) partes.push(linha([texto('Aviso'), texto(x.texto)]));
  partes.push('');
  partes.push(linha(COLUNAS_DOS_INSUMOS.map((c) => texto(c))));
  for (const i of r.comparacao!.itens) partes.push(linhaDoInsumo(i));
  if (r.umInsumo) {
    partes.push('');
    partes.push(linha(COLUNAS_DOS_FORNECEDORES_DO_INSUMO.map((c) => texto(c))));
    for (const i of r.comparacao!.itens) {
      for (const x of i.fornecedores) {
        partes.push(
          linha([
            texto(`${i.insumo} (${nomeDaUnidade(i.unidade)})`),
            texto(x.fornecedor),
            doLado(x.a, (l) => quantidadeParaPlanilha(l.quantidadeMilesimos)),
            doLado(x.b, (l) => quantidadeParaPlanilha(l.quantidadeMilesimos)),
            custoDoLado(x.a),
            custoDoLado(x.b),
            doLado(x.a, (l) => reaisParaPlanilha(l.gastoCentavos)),
            doLado(x.b, (l) => reaisParaPlanilha(l.gastoCentavos)),
            opcional(x.efeitoPrecoCentavos),
          ]),
        );
      }
    }
  }
  partes.push('');
  partes.push(...totaisDosPeriodos(r, f));
  return BOM_DO_CSV + partes.join('\r\n') + '\r\n';
}

// ----------------------------------------------------------- fornecedores

export const COLUNAS_DOS_FORNECEDORES = [
  'Fornecedor',
  'Unidade',
  'Compras (notas)',
  'Quantidade',
  'Embalagens compradas',
  'Preço do item (R$/un base)',
  'Custo entregue (R$/un base)',
  'Frete atribuído (R$)',
  'Frete sobre o preço do item (%)',
  'Mais barato no preço do item',
  'Diferença do preço do item para o mais barato (R$/un)',
  'Diferença do preço do item para o mais barato (%)',
  'Mais barato no custo entregue',
  'Diferença do custo entregue para o mais barato (R$/un)',
  'Diferença do custo entregue para o mais barato (%)',
  'Última compra',
  'Preço do item na última compra (R$/un base)',
  'Linhas sem base',
] as const;

const simNao = (b: boolean) => (b ? 'Sim' : '');

export function linhaDoFornecedor(x: FornecedorRanqueado): string {
  const c = x.comparavel;
  return linha([
    texto(x.fornecedor),
    texto(nomeDaUnidade(x.unidade)),
    x.notas,
    x.unidade ? quantidadeParaPlanilha(c.quantidadeMilesimos) : '',
    texto(x.embalagens.join(' · ')),
    x.precoDoItem ? precoParaPlanilha(c.valorCentavos, c.quantidadeMilesimos) : 'sem base',
    x.custoEntregue ? precoParaPlanilha(c.valorCentavos + c.freteCentavos, c.quantidadeMilesimos) : 'sem base',
    reaisParaPlanilha(c.freteCentavos),
    percentualParaPlanilha(x.fretePesaDecimos),
    simNao(x.maisBaratoNoItem),
    x.difItem ? fracaoParaPlanilha(x.difItem.porUnidade) : '',
    x.difItem ? percentualParaPlanilha(x.difItem.decimos) : '',
    simNao(x.maisBaratoEntregue),
    x.difEntregue ? fracaoParaPlanilha(x.difEntregue.porUnidade) : '',
    x.difEntregue ? percentualParaPlanilha(x.difEntregue.decimos) : '',
    x.ultima ? formatarData(x.ultima.data) : '',
    x.ultima ? precoParaPlanilha(x.ultima.valorCentavos, x.ultima.quantidadeMilesimos) : '',
    x.linhasSemBase,
  ]);
}

export function planilhaDosFornecedores(r: ComparacaoDeFornecedoresDaTela, f: FiltrosDoRelatorio, nomes: { fornecedor?: string; categoria?: string }, geradoEm: string): string {
  const partes = cabecalho('Comparação de fornecedores', [`Período e data usada|${fraseDoPeriodo(f)}`], f, { lojas: r.lojasUsadas.map((l) => l.nome), insumo: r.insumo?.nome, ...nomes }, geradoEm);
  if (r.insumo) partes.push(linha([texto('Marca de referência do insumo'), texto(r.insumo.marcaReferencia ?? 'não informada (a nota não guarda a marca comprada)')]));
  partes.push(linha([texto('Como ler'), texto(`${MEDIDAS.item.explica} ${MEDIDAS.entregue.explica} O frete é o rateio gravado em cada item da nota.`)]));
  for (const t of r.tabelas) {
    partes.push('');
    partes.push(linha([texto(`Fornecedores em ${nomeDaUnidade(t.unidade)}`), '']));
    partes.push(linha(COLUNAS_DOS_FORNECEDORES.map((c) => texto(c))));
    for (const x of t.fornecedores) partes.push(linhaDoFornecedor(x));
  }
  if (r.semUnidade.length) {
    partes.push('');
    partes.push(linha([texto('Linhas sem unidade gravada (fora de qualquer comparação)'), '']));
    for (const x of r.semUnidade) partes.push(linha([texto(x.fornecedor), `${x.linhas} linha(s)`]));
  }
  partes.push('');
  partes.push(linha([texto('TOTAIS'), '']));
  if (r.totais) {
    partes.push(linha([texto('Compras (notas)'), r.totais.notas]));
    partes.push(linha([texto('Valor dos itens (R$)'), reaisParaPlanilha(r.totais.valorCentavos)]));
    partes.push(linha([texto('Frete atribuído (R$)'), reaisParaPlanilha(r.totais.freteCentavos)]));
    partes.push(linha([texto('Total (R$)'), reaisParaPlanilha(r.totais.totalCentavos)]));
    const sem = Object.values(r.totais.semBase).reduce((s, n) => s + (n ?? 0), 0);
    if (sem > 0) partes.push(linha([texto('Linhas sem base (fora do preço)'), sem]));
  }
  if (r.aguardando > 0) partes.push(linha([texto('Notas fiscais (XML) aguardando conferência: NÃO são compra'), r.aguardando]));
  if (r.semEmissao) partes.push(linha([texto('Notas digitadas sem data de emissão (fora da base emissão)'), r.semEmissao]));
  if (r.canceladas) partes.push(linha([texto('Canceladas no mesmo recorte (FORA dos totais)'), texto(`${r.canceladas.notas} nota(s), R$ ${reaisParaPlanilha(r.canceladas.valorCentavos + r.canceladas.freteCentavos)}`)]));
  return BOM_DO_CSV + partes.join('\r\n') + '\r\n';
}

// ------------------------------------------------------------- a resposta

async function nomesDosFiltros(cliente: ClienteDoParceiro, f: FiltrosDoRelatorio) {
  return {
    fornecedor: f.fornecedorId ? (await cliente.fornecedor.findUnique({ where: { id: f.fornecedorId }, select: { nome: true } }))?.nome : undefined,
    categoria: f.categoriaId ? (await cliente.categoriaInsumo.findUnique({ where: { id: f.categoriaId }, select: { nome: true } }))?.nome : undefined,
  };
}

const agora = (a?: Date) => (a ?? new Date()).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

export async function planilhaDaComparacaoDePeriodos(cliente: ClienteDoParceiro | null, alcance: Alcance | null, f: FiltrosDePeriodos, opcoes: { agora?: Date } = {}): Promise<RespostaDaPlanilha> {
  if (!cliente || !alcance) return { ok: false, status: 401, frase: 'Entre no ERP para baixar a planilha.' };
  if (!pode(alcance, 'compras.ver')) return { ok: false, status: 403, frase: 'Seu acesso não inclui ver compras e notas.' };
  if (f.periodoInvalido) return { ok: false, status: 400, frase: f.periodoInvalido };
  const r = await comparacaoDePeriodos(cliente, alcance, f);
  if (!r.a || !r.b) return { ok: false, status: 403, frase: 'Nenhuma loja do seu acesso entra neste relatório.' };
  if (r.passouDoTeto || !r.comparacao) {
    return { ok: false, status: 413, frase: `Este recorte tem mais de ${TETO_DE_CELULAS.toLocaleString('pt-BR')} combinações de insumo e fornecedor num dos períodos e a planilha não corta calada. Filtre por loja, fornecedor, categoria ou insumo.` };
  }
  const nomes = { ...(await nomesDosFiltros(cliente, f.rel)), insumo: r.insumo?.nome };
  return { ok: true, nome: `comparacao-periodos-${f.rel.de}_a_${f.rel.ate}-contra-${f.deB}_a_${f.ateB}.csv`, corpo: planilhaDosPeriodos(r, f, nomes, agora(opcoes.agora), hojeNoRio(opcoes.agora)) };
}

export async function planilhaDaComparacaoDeFornecedores(cliente: ClienteDoParceiro | null, alcance: Alcance | null, f: FiltrosDoRelatorio, opcoes: { agora?: Date } = {}): Promise<RespostaDaPlanilha> {
  if (!cliente || !alcance) return { ok: false, status: 401, frase: 'Entre no ERP para baixar a planilha.' };
  if (!pode(alcance, 'compras.ver')) return { ok: false, status: 403, frase: 'Seu acesso não inclui ver compras e notas.' };
  if (f.periodoInvalido) return { ok: false, status: 400, frase: f.periodoInvalido };
  if (!f.insumoId) return { ok: false, status: 400, frase: 'Escolha o insumo para comparar os fornecedores.' };
  const r = await comparacaoDeFornecedores(cliente, alcance, f);
  if (r.motivoVazio || !r.insumo) return { ok: false, status: 403, frase: 'Nenhuma loja do seu acesso entra neste relatório, ou o insumo não existe.' };
  return { ok: true, nome: `comparacao-fornecedores-${f.de}_a_${f.ate}.csv`, corpo: planilhaDosFornecedores(r, f, await nomesDosFiltros(cliente, f), agora(opcoes.agora)) };
}

/** A rota de download das duas árvores: lê os filtros da URL (`tela=fornecedores|periodos`) e responde. */
export async function responderPlanilhaDaComparacao(cliente: ClienteDoParceiro | null, alcance: Alcance | null, req: Request): Promise<Response> {
  const params = parametrosDaUrl(new URL(req.url));
  if (params.tela === 'periodos') return respostaHttpDaPlanilha(await planilhaDaComparacaoDePeriodos(cliente, alcance, lerFiltrosDePeriodos(params)));
  return respostaHttpDaPlanilha(await planilhaDaComparacaoDeFornecedores(cliente, alcance, lerFiltrosDeFornecedores(params)));
}
