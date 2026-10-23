/**
 * Relatórios de compras (L.2) — a planilha (CSV) e a resposta HTTP dela. Sai do MESMO motor da tela (`relatorioCompleto`), com os
 * mesmos filtros, o mesmo período, a mesma data usada, as mesmas unidades e os mesmos totais; só que SEM página: o que passa do teto
 * não é cortado calado, a resposta é uma recusa em frase.
 *
 * Planilha segura: texto que abre como fórmula (= + - @ tab CR) ganha um apóstrofo na frente; separador `;` e vírgula decimal (o
 * Excel em português); BOM para o acento abrir certo; números sempre como o sistema formatou (nunca texto digitado por alguém).
 * Permissão: a MESMA da tela (`compras.ver`, só nas lojas do acesso); sem sessão 401, sem permissão 403, nada de dado no corpo.
 */

import type { Alcance } from './permissoes';
import { pode } from './permissoes';
import type { ClienteDoParceiro } from './tenant';
import type { LinhaDeCompra, LinhaDeGrupo, TotaisDoRecorte } from './compras-relatorio';
import { relatorioCompleto } from './compras-relatorio';
import {
  BASES_DE_DATA,
  BOM_DO_CSV,
  FRASE_DO_MOTIVO,
  ROTULO_DO_AGRUPAMENTO,
  TETO_DA_PLANILHA,
  celulaDeTexto,
  custoMedioEntregue,
  fraseDoPeriodo,
  lerFiltrosDoRelatorio,
  precoMedioPonderado,
  quantidadeParaPlanilha,
  recorteDeUmInsumo,
  reaisParaPlanilha,
  type FiltrosDoRelatorio,
} from './compras-relatorio-campos';
import { UNIDADES, type Unidade } from './unidades';
import { formatarData, hojeNoRio } from './compra-campos';

const SEP = ';';
const linha = (celulas: (string | number)[]) => celulas.map((c) => (typeof c === 'number' ? String(c) : c)).join(SEP);
const texto = celulaDeTexto;

/** O preço por unidade base em reais, com 4 casas (45,6154), por divisão inteira exata (metade para cima). Nulo = vazio. */
export function precoParaPlanilha(valorCentavos: number, quantidadeMilesimos: number): string {
  if (valorCentavos <= 0 || quantidadeMilesimos <= 0) return '';
  const n = (2n * BigInt(valorCentavos) * 100_000n + BigInt(quantidadeMilesimos)) / (2n * BigInt(quantidadeMilesimos));
  const inteiro = n / 10_000n;
  const frac = String(n % 10_000n).padStart(4, '0');
  return `${inteiro},${frac}`;
}

const nomeDaUnidade = (u: Unidade | null) => (u ? UNIDADES[u].sigla : 'sem unidade');

/** O cabeçalho que repete o que a tela diz: o que é, o período, a data usada, as lojas, os filtros e quando saiu. */
export function cabecalhoDaPlanilha(
  titulo: string,
  f: FiltrosDoRelatorio,
  c: { lojas: string[]; fornecedor?: string; insumo?: string; categoria?: string },
  geradoEm: string,
): string[] {
  const filtros = [
    f.situacao === 'canceladas' ? 'SÓ notas CANCELADAS (não são compra e não entram em nenhum total)' : 'Notas lançadas (canceladas ficam de fora)',
    c.fornecedor ? `Fornecedor: ${c.fornecedor}` : '',
    c.insumo ? `Insumo: ${c.insumo}` : f.q ? `Insumo com “${f.q}” no nome ou na marca` : '',
    c.categoria ? `Categoria (a de hoje no cadastro): ${c.categoria}` : '',
    f.grupo ? `Só um ${ROTULO_DO_AGRUPAMENTO[f.agrupar].toLowerCase()} (aberto na tela)` : '',
    f.unidade ? `Só a unidade ${f.unidade === 'sem' ? 'sem unidade gravada' : UNIDADES[f.unidade].sigla}` : '',
    f.so === 'sembase' ? 'Só as linhas sem base para o preço médio' : '',
  ].filter(Boolean);
  return [
    linha([texto('Relatório'), texto(titulo)]),
    linha([texto('Período e data usada'), texto(fraseDoPeriodo(f))]),
    linha([texto('Como a data é lida'), texto(BASES_DE_DATA[f.base].explica)]),
    linha([texto('Lojas'), texto(c.lojas.join(', '))]),
    linha([texto('Filtros'), texto(filtros.join(' · '))]),
    linha([texto('Gerado em'), texto(geradoEm)]),
    linha([texto('Valores'), texto('Reais (R$) com vírgula decimal. Quantidade na unidade base de cada linha (kg, L ou un); unidades diferentes nunca são somadas.')]),
  ];
}

export const COLUNAS_DAS_LINHAS = [
  'Data (pela data usada)',
  'Entrada da nota',
  'Emissão da nota fiscal',
  'Lançada no sistema (dia no Rio)',
  'Loja',
  'Fornecedor',
  'Nota',
  'Chave de acesso',
  'Insumo',
  'Embalagem original',
  'Quantidade de embalagens',
  'Quantidade convertida',
  'Unidade',
  'Preço unitário (R$/un base)',
  'Valor dos itens (R$)',
  'Frete atribuído (R$)',
  'Descontos (R$)',
  'Total (R$)',
  'Situação',
  'Sem base para o preço médio porque',
  'Documento fiscal (XML)',
] as const;

/** O dia do lançamento no relógio do Rio (a mesma conta do SQL: o instante gravado em UTC lido no fuso da operação). */
function diaDoLancamento(iso: string | null): string {
  return iso ? formatarData(hojeNoRio(new Date(iso))) : '';
}

export function linhaDaCompra(l: LinhaDeCompra): string {
  const unidade = l.unidade;
  return linha([
    formatarData(l.data),
    formatarData(l.entradaEm),
    l.emitidaEm ? formatarData(l.emitidaEm) : '',
    diaDoLancamento(l.lancadaEm),
    texto(l.loja),
    texto(l.fornecedor),
    texto(l.rotuloDaNota),
    texto(l.chaveAcesso ?? ''),
    texto(l.insumo),
    texto(l.embalagem),
    quantidadeParaPlanilha(l.embalagensMilesimos),
    unidade ? quantidadeParaPlanilha(l.quantidadeMilesimos) : '',
    texto(nomeDaUnidade(unidade)),
    l.motivoSemBase ? '' : precoParaPlanilha(l.valorCentavos, l.quantidadeMilesimos),
    reaisParaPlanilha(l.valorCentavos),
    reaisParaPlanilha(l.freteCentavos),
    reaisParaPlanilha(0),
    reaisParaPlanilha(l.totalCentavos),
    l.cancelada ? 'CANCELADA' : 'Lançada',
    l.motivoSemBase ? texto(FRASE_DO_MOTIVO[l.motivoSemBase]) : '',
    l.documentoId ? 'Sim' : '',
  ]);
}

export const COLUNAS_DOS_GRUPOS = ['Grupo', 'Unidade', 'Quantidade', 'Compras (notas)', 'Linhas', 'Valor dos itens (R$)', 'Frete atribuído (R$)', 'Total (R$)', 'Preço médio ponderado (R$/un base)', 'Custo médio entregue (R$/un base)', 'Linhas sem base'] as const;

export function linhaDoGrupo(g: LinhaDeGrupo, comPreco: boolean): string {
  const t = g.total;
  const preco = comPreco ? precoMedioPonderado(t) : null;
  const entregue = comPreco ? custoMedioEntregue(t) : null;
  return linha([
    texto(g.rotulo),
    texto(nomeDaUnidade(t.unidade)),
    t.unidade ? quantidadeParaPlanilha(t.quantidadeMilesimos) : '',
    g.notas,
    t.linhas,
    reaisParaPlanilha(t.valorCentavos),
    reaisParaPlanilha(t.freteCentavos),
    reaisParaPlanilha(t.valorCentavos + t.freteCentavos),
    preco ? precoParaPlanilha(t.comparavel.valorCentavos, t.comparavel.quantidadeMilesimos) : '',
    entregue ? precoParaPlanilha(t.comparavel.valorCentavos + t.comparavel.freteCentavos, t.comparavel.quantidadeMilesimos) : '',
    t.linhas - t.comparavel.linhas,
  ]);
}

/** O rodapé: os MESMOS totais do resumo da tela (dinheiro somado; quantidade uma linha por unidade). */
export function totaisDaPlanilha(t: TotaisDoRecorte, comPreco: boolean, canceladas: { notas: number; valorCentavos: number } | null): string[] {
  const saida = [
    linha([texto('TOTAIS'), '']),
    linha([texto('Linhas'), t.linhas]),
    linha([texto('Compras (notas)'), t.notas]),
    linha([texto('Valor dos itens (R$)'), reaisParaPlanilha(t.valorCentavos)]),
    linha([texto('Frete atribuído (R$)'), reaisParaPlanilha(t.freteCentavos)]),
    linha([texto('Descontos (R$)'), reaisParaPlanilha(0)]),
    linha([texto('Total (R$)'), reaisParaPlanilha(t.totalCentavos)]),
  ];
  for (const u of t.unidades) {
    const rotulo = `Quantidade em ${nomeDaUnidade(u.unidade)}`;
    saida.push(linha([texto(rotulo), u.unidade ? quantidadeParaPlanilha(u.quantidadeMilesimos) : 'não se soma (a nota não gravou a unidade)']));
    if (comPreco && u.unidade) {
      saida.push(linha([texto(`Preço médio ponderado (R$/${UNIDADES[u.unidade].sigla})`), precoMedioPonderado(u) ? precoParaPlanilha(u.comparavel.valorCentavos, u.comparavel.quantidadeMilesimos) : 'sem base']));
      saida.push(linha([texto(`Custo médio entregue (R$/${UNIDADES[u.unidade].sigla})`), custoMedioEntregue(u) ? precoParaPlanilha(u.comparavel.valorCentavos + u.comparavel.freteCentavos, u.comparavel.quantidadeMilesimos) : 'sem base']));
    }
  }
  const sem = Object.values(t.semBase).reduce((s, n) => s + (n ?? 0), 0);
  if (sem > 0) saida.push(linha([texto('Linhas sem base para o preço médio'), sem]));
  if (canceladas) saida.push(linha([texto('Canceladas no mesmo recorte (FORA dos totais)'), texto(`${canceladas.notas} nota(s), R$ ${reaisParaPlanilha(canceladas.valorCentavos)}`)]));
  return saida;
}

export type ParteDaPlanilha = 'linhas' | 'resumo';

export type RespostaDaPlanilha = { ok: true; nome: string; corpo: string } | { ok: false; status: 400 | 401 | 403 | 413 | 503; frase: string };

/** O relatório não coube agora: 413 se passou do teto de tempo, 503 se o servidor está ocupado com outros. A frase é a mesma da tela. */
export const recusaDeRelatorio = (e: { motivo: 'tempo' | 'ocupado'; message: string }): RespostaDaPlanilha => ({ ok: false, status: e.motivo === 'ocupado' ? 503 : 413, frase: e.message });

/**
 * A planilha inteira de um relatório. `titulo`: o nome da tela de onde saiu. Devolve a recusa em frase (sem sessão, sem permissão,
 * período torto, recorte grande demais), nunca um arquivo cortado.
 */
export async function planilhaDoRelatorio(
  cliente: ClienteDoParceiro | null,
  alcance: Alcance | null,
  f: FiltrosDoRelatorio,
  opcoes: { titulo: string; parte: ParteDaPlanilha; agora?: Date },
): Promise<RespostaDaPlanilha> {
  if (!cliente || !alcance) return { ok: false, status: 401, frase: 'Entre no ERP para baixar a planilha.' };
  if (!pode(alcance, 'compras.ver')) return { ok: false, status: 403, frase: 'Seu acesso não inclui ver compras e notas.' };
  if (f.periodoInvalido) return { ok: false, status: 400, frase: f.periodoInvalido };
  const r = await relatorioCompleto(cliente, alcance, f, TETO_DA_PLANILHA);
  if (!r.recorte || !r.totais || !r.linhas || !r.grupos) {
    return { ok: false, status: 403, frase: 'Nenhuma loja do seu acesso entra neste relatório.' };
  }
  if (r.linhas.passouDoTeto) {
    return { ok: false, status: 413, frase: `Este recorte tem mais de ${TETO_DA_PLANILHA.toLocaleString('pt-BR')} linhas e a planilha não corta calada. Reduza o período ou filtre por loja, fornecedor ou insumo.` };
  }
  if (r.grupos.passouDoTeto) {
    return { ok: false, status: 413, frase: 'Este recorte tem grupos demais para a planilha. Reduza o período ou filtre por loja, fornecedor ou insumo.' };
  }
  const nomes = {
    lojas: r.lojasUsadas.map((l) => l.nome),
    fornecedor: f.fornecedorId ? (await cliente.fornecedor.findUnique({ where: { id: f.fornecedorId }, select: { nome: true } }))?.nome : undefined,
    insumo: f.insumoId ? (await cliente.insumo.findUnique({ where: { id: f.insumoId }, select: { nome: true } }))?.nome : undefined,
    categoria: f.categoriaId ? (await cliente.categoriaInsumo.findUnique({ where: { id: f.categoriaId }, select: { nome: true } }))?.nome : undefined,
  };
  const quando = (opcoes.agora ?? new Date()).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  const comPreco = recorteDeUmInsumo(f) || (r.recorte.insumoIds?.length === 1) || (opcoes.parte === 'resumo' && f.agrupar === 'insumo');
  const partes: string[] = cabecalhoDaPlanilha(opcoes.titulo + (opcoes.parte === 'resumo' ? ` · resumo por ${ROTULO_DO_AGRUPAMENTO[f.agrupar].toLowerCase()}` : ' · compras'), f, nomes, quando);
  partes.push('');
  if (opcoes.parte === 'resumo') {
    partes.push(linha(COLUNAS_DOS_GRUPOS.map((c) => texto(c))));
    for (const g of r.grupos.grupos) partes.push(linhaDoGrupo(g, f.agrupar === 'insumo' || comPreco));
  } else {
    partes.push(linha(COLUNAS_DAS_LINHAS.map((c) => texto(c))));
    for (const l of r.linhas.linhas) partes.push(linhaDaCompra(l));
  }
  partes.push('');
  partes.push(...totaisDaPlanilha(r.totais, comPreco, r.canceladas));
  const periodo = f.de === f.ate ? f.de : `${f.de}_a_${f.ate}`;
  return { ok: true, nome: `compras-${opcoes.parte === 'resumo' ? `por-${f.agrupar}-` : ''}${periodo}.csv`, corpo: BOM_DO_CSV + partes.join('\r\n') + '\r\n' };
}

/** A resposta HTTP: o arquivo, ou a frase da recusa em texto puro (sem dado, sem página de erro do framework). */
export function respostaHttpDaPlanilha(r: RespostaDaPlanilha): Response {
  if (!r.ok) {
    return new Response(r.frase, { status: r.status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
  return new Response(r.corpo, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${r.nome}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** `?loja=a&loja=b` -> { loja: ['a', 'b'] }: o que `lerFiltrosDoRelatorio` espera. */
export function parametrosDaUrl(url: URL): Record<string, string | string[]> {
  const saida: Record<string, string | string[]> = {};
  for (const chave of Array.from(new Set(url.searchParams.keys()))) {
    const valores = url.searchParams.getAll(chave);
    saida[chave] = valores.length > 1 ? valores : valores[0];
  }
  return saida;
}

/** A rota de download das duas árvores: lê os filtros da URL e responde. */
export async function responderPlanilha(cliente: ClienteDoParceiro | null, alcance: Alcance | null, req: Request): Promise<Response> {
  const url = new URL(req.url);
  const params = parametrosDaUrl(url);
  const f = lerFiltrosDoRelatorio(params);
  const parte: ParteDaPlanilha = params.parte === 'resumo' ? 'resumo' : 'linhas';
  const titulo = params.tela === 'insumo' ? 'Histórico de compras de um insumo' : 'Compras do período';
  return respostaHttpDaPlanilha(await planilhaDoRelatorio(cliente, alcance, f, { titulo, parte }));
}
