/**
 * Documento fiscal por XML (F.1b) — a parte PURA da conferência e da conciliação (sem banco, sem Next): a memória do item
 * (fornecedor + código + unidade → insumo, embalagem e fator), a conta "3 PC → 6 kg", a conferência do total da nota, a montagem
 * da entrada que o serviço de lançamento da 1.5 recebe e os filtros da lista. O que o XML diz já chegou lido e em centavos e
 * milésimos de `nfe-xml.ts`; aqui se decide o que fazer com isso. Serve ao servidor e à tela (a conta ao vivo).
 *
 *  - FATOR: quantas embalagens do insumo vêm em 1 unidade comercial da nota ("1 PC = 1 peça de 2 kg" → 1; "1 CX = 10 pacotes de
 *    1 kg" → 10). Em milésimos, de 0,001 a 1.000. A quantidade que entra é qCom × fator embalagens × o conteúdo de cada.
 *  - CUSTO: o valor do item é o LÍQUIDO (vProd − vDesc + outras despesas + seguro + IPI + ST), porque custo é o que se paga. O frete
 *    da nota vai inteiro e é rateado pelo valor dos itens, como na nota digitada (1.5); o frete que o emitente já dividiu por item
 *    é guardado e não é usado.
 *  - TOTAL: itens líquidos + frete = total da nota (vNF), ao centavo. Se não fecha, não concilia: a frase diz a diferença.
 */

import {
  A_GRANEL,
  EMBALAGEM_PADRAO,
  formatarEmbalagens,
  LIMITES_DO_FORNECEDOR,
  PREFIXO_DA_EMBALAGEM,
  type EntradaDaNota,
  type ItemDigitadoDaNota,
} from './compra-campos';
import { dividirArredondado, formatarDinheiro, formatarQuantidade, lerQuantidade, type Unidade } from './unidades';
import type { NotaDoXml } from './nfe-xml';

export const FATOR_MINIMO = 1;
export const FATOR_MAXIMO = 1_000_000;
export const LIMITES_DO_DOCUMENTO = { motivo: 200 } as const;

// ------------------------------------------------------------ a memória do item

/** A chave da memória: código do produto e unidade comercial, em caixa alta, sem espaço nas pontas (o mesmo código em outra unidade é outro item). */
export function chaveDaMemoria(codigoProduto: string, unidadeComercial: string): { codigoProduto: string; unidadeComercial: string } {
  return { codigoProduto: codigoProduto.trim().replace(/\s+/g, ' ').toUpperCase().slice(0, 60), unidadeComercial: unidadeComercial.trim().toUpperCase().slice(0, 10) };
}

/** Os 44 dígitos em grupos de 4, como o DANFE imprime. */
export function formatarChave(chave: string): string {
  return chave.replace(/(\d{4})(?=\d)/g, '$1 ');
}

/** "3.0000" → "3"; "2.5000" → "2,5": a quantidade comercial como a pessoa lê. */
export function quantidadeComercialEmTexto(qComMilesimos: number): string {
  return formatarEmbalagens(qComMilesimos);
}

/** O fator digitado ("1", "10", "0,5") em milésimos; ou a frase do erro. */
export function lerFator(texto: string, unidadeComercial: string): { ok: true; milesimos: number } | { ok: false; erro: string } {
  const t = texto.trim();
  if (!t) return { ok: false, erro: `Diga quantas embalagens vêm em 1 ${unidadeComercial}.` };
  const m = lerQuantidade(t);
  if (m === null) return { ok: false, erro: 'Número inválido. Ex.: 1, 10 ou 0,5.' };
  if (m < FATOR_MINIMO) return { ok: false, erro: 'O fator precisa ser maior que zero.' };
  if (m > FATOR_MAXIMO) return { ok: false, erro: 'O fator passa de 1.000 embalagens por unidade. Confira o número.' };
  return { ok: true, milesimos: m };
}

/** O fator guardado (milésimos) como o campo mostra: 1000 → "1", 10000 → "10", 500 → "0,5". */
export function fatorParaCampo(milesimos: number): string {
  return (milesimos / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3, useGrouping: false });
}

/** Quantas embalagens (milésimos) a quantidade comercial vira, arredondado ao milésimo (metade para cima). */
export function embalagensDoItem(qComMilesimos: number, fatorMilesimos: number): number {
  return dividirArredondado(qComMilesimos * fatorMilesimos, 1000);
}

/** O que o insumo escolhido sabe dizer da embalagem: conteúdo (milésimos da unidade base). */
export interface EmbalagemEscolhida {
  conteudoMilesimos: number;
  unidade: Unidade;
  /** "Peça 2 kg · 2 kg", "A granel (kg)": o que a nota digitada mostraria. */
  texto: string;
}

/** "3 PC → 6 kg", e a conta por extenso embaixo: "3 PC × 1 = 3 embalagens · 6 kg". */
export function contaDoItem(
  q: { qComMilesimos: number; unidadeComercial: string; fatorMilesimos: number },
  emb: Pick<EmbalagemEscolhida, 'conteudoMilesimos' | 'unidade'>,
): { curta: string; longa: string; quantidadeMilesimos: number } {
  const embalagens = embalagensDoItem(q.qComMilesimos, q.fatorMilesimos);
  const quantidade = dividirArredondado(embalagens * emb.conteudoMilesimos, 1000);
  const qCom = `${quantidadeComercialEmTexto(q.qComMilesimos)} ${q.unidadeComercial}`;
  const final = formatarQuantidade(quantidade, emb.unidade);
  return {
    curta: `${qCom} → ${final}`,
    longa: `${qCom} × ${fatorParaCampo(q.fatorMilesimos)} = ${formatarEmbalagens(embalagens)} ${embalagens === 1000 ? 'embalagem' : 'embalagens'} · ${final}`,
    quantidadeMilesimos: quantidade,
  };
}

// ------------------------------------------------------------ o total da nota

export interface ConferenciaDoTotal {
  somaItensCentavos: number;
  freteCentavos: number;
  /** Itens + frete: o que o sistema vai lançar. */
  calculadoCentavos: number;
  totalDaNotaCentavos: number;
  /** nota − calculado (positivo: a nota diz mais). */
  diferencaCentavos: number;
  fecha: boolean;
  /** A frase para a pessoa quando não fecha (vazio quando fecha). */
  frase: string | null;
}

export function conferirTotalDoDocumento(
  itens: readonly { liquidoCentavos: number }[],
  d: { vFreteCentavos: number; vNfCentavos: number; temAjusteQueNaoLanca?: boolean },
): ConferenciaDoTotal {
  const soma = itens.reduce((s, i) => s + i.liquidoCentavos, 0);
  const calculado = soma + d.vFreteCentavos;
  const diferenca = d.vNfCentavos - calculado;
  const fecha = diferenca === 0;
  let frase: string | null = null;
  if (!fecha) {
    frase = `Os itens (${formatarDinheiro(soma)}) mais o frete (${formatarDinheiro(d.vFreteCentavos)}) dão ${formatarDinheiro(calculado)}, mas a nota diz ${formatarDinheiro(d.vNfCentavos)} (diferença de ${formatarDinheiro(Math.abs(diferenca))}). `;
    frase += d.temAjusteQueNaoLanca
      ? 'A nota traz desoneração de ICMS, imposto de importação ou IPI devolvido, que o sistema não lança. Lance a nota à mão.'
      : 'O sistema não concilia uma nota que não fecha. Confira o arquivo ou lance a nota à mão.';
  }
  return { somaItensCentavos: soma, freteCentavos: d.vFreteCentavos, calculadoCentavos: calculado, totalDaNotaCentavos: d.vNfCentavos, diferencaCentavos: diferenca, fecha, frase };
}

// ------------------------------------------------------------ do documento para a entrada da nota

/** O que a pessoa escolheu para um item do documento. */
export interface EscolhaDoItem {
  nItem: number;
  insumoId: string;
  /** 'padrao' | 'granel' | 'v:<id da embalagem>': o mesmo seletor da nota digitada. */
  embalagem: string;
  /** O fator como foi digitado. */
  fator: string;
}

export interface ItemDoDocumentoParaMontar {
  nItem: number;
  unidadeComercial: string;
  qComMilesimos: number;
  liquidoCentavos: number;
}

/** "3" / "2,5" / "0,333": milésimos como o leitor da nota digitada espera, sem separador de milhar. */
function milesimosEmTexto(m: number): string {
  return (m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3, useGrouping: false });
}

/** 14500 → "145,00" (sem separador de milhar, como o campo de valor). */
function centavosEmTexto(c: number): string {
  return `${Math.trunc(c / 100)},${String(c % 100).padStart(2, '0')}`;
}

export interface EntradaMontada {
  entrada: EntradaDaNota;
  /** Para cada linha da entrada, os números dos itens do documento que ela soma (o mesmo insumo na mesma embalagem vira uma linha só). */
  itensDaLinha: number[][];
}

/**
 * O documento + as escolhas → a entrada que o lançamento da 1.5 lê. Itens do mesmo insumo e da mesma embalagem se somam numa linha só
 * (a nota digitada não aceita duas); embalagens = qCom × fator de cada um, valor = líquido de cada um. O frete é o da nota, inteiro; o
 * total, o da nota (o lançamento confere a soma e recusa se não fecha). Escolha que falta ou fator torto: erro por item.
 */
export function montarEntradaDaNota(
  doc: { lojaId: string; fornecedorId: string; numero: string; serie: string; vFreteCentavos: number; vNfCentavos: number },
  itens: readonly ItemDoDocumentoParaMontar[],
  escolhas: readonly EscolhaDoItem[],
  dataDigitada: string,
): { ok: true; montada: EntradaMontada } | { ok: false; erros: Record<string, string> } {
  const erros: Record<string, string> = {};
  const porItem = new Map(escolhas.map((e) => [e.nItem, e]));
  const linhas = new Map<string, { item: ItemDigitadoDaNota & { embalagensMilesimos: number; valorCentavos: number }; itens: number[] }>();
  for (const it of itens) {
    const e = porItem.get(it.nItem);
    if (!e || !e.insumoId) {
      erros[`item-${it.nItem}`] = 'Escolha o insumo deste item.';
      continue;
    }
    const f = lerFator(e.fator, it.unidadeComercial);
    if (!f.ok) {
      erros[`fator-${it.nItem}`] = f.erro;
      continue;
    }
    const embalagem = e.embalagem || EMBALAGEM_PADRAO;
    const chave = `${e.insumoId}|${embalagem}`;
    const embalagens = embalagensDoItem(it.qComMilesimos, f.milesimos);
    const ja = linhas.get(chave);
    if (ja) {
      ja.item.embalagensMilesimos += embalagens;
      ja.item.valorCentavos += it.liquidoCentavos;
      ja.itens.push(it.nItem);
    } else {
      linhas.set(chave, { item: { insumoId: e.insumoId, embalagem, quantidade: '', valor: '', embalagensMilesimos: embalagens, valorCentavos: it.liquidoCentavos }, itens: [it.nItem] });
    }
  }
  if (Object.keys(erros).length > 0) return { ok: false, erros };
  const montadas = Array.from(linhas.values());
  return {
    ok: true,
    montada: {
      entrada: {
        lojaId: doc.lojaId,
        fornecedorId: doc.fornecedorId,
        numero: doc.numero,
        serie: doc.serie,
        data: dataDigitada,
        frete: doc.vFreteCentavos ? centavosEmTexto(doc.vFreteCentavos) : '',
        total: centavosEmTexto(doc.vNfCentavos),
        itens: montadas.map((m) => ({ insumoId: m.item.insumoId, embalagem: m.item.embalagem, quantidade: milesimosEmTexto(m.item.embalagensMilesimos), valor: centavosEmTexto(m.item.valorCentavos) })),
      },
      itensDaLinha: montadas.map((m) => m.itens),
    },
  };
}

/** O erro da linha `item-N` do lançamento (a linha somada) vira erro em cada item do documento que ela soma. */
export function errosPorItemDoDocumento(erros: Record<string, string | undefined>, itensDaLinha: readonly number[][]): Record<string, string> {
  const fora: Record<string, string> = {};
  for (const [chave, frase] of Object.entries(erros)) {
    if (!frase) continue;
    const m = /^item-(\d+)$/.exec(chave);
    if (!m) {
      fora[chave] = frase;
      continue;
    }
    for (const nItem of itensDaLinha[Number(m[1])] ?? []) fora[`item-${nItem}`] = frase;
  }
  return fora;
}

/** O seletor de embalagem da memória: 'padrao' | 'granel' | 'v:<id>'. */
export function embalagemDaMemoria(m: { varianteId: string | null; aGranel: boolean }): string {
  return m.aGranel ? A_GRANEL : m.varianteId ? `${PREFIXO_DA_EMBALAGEM}${m.varianteId}` : EMBALAGEM_PADRAO;
}

/** Do seletor para as colunas da memória e do item: a granel não tem embalagem; 'padrao' também não (é a do insumo). */
export function colunasDaEmbalagem(embalagem: string): { varianteId: string | null; aGranel: boolean } | null {
  if (embalagem === A_GRANEL) return { varianteId: null, aGranel: true };
  if (embalagem === EMBALAGEM_PADRAO || embalagem === '') return { varianteId: null, aGranel: false };
  if (embalagem.startsWith(PREFIXO_DA_EMBALAGEM) && /^[a-z0-9]{1,64}$/i.test(embalagem.slice(PREFIXO_DA_EMBALAGEM.length))) {
    return { varianteId: embalagem.slice(PREFIXO_DA_EMBALAGEM.length), aGranel: false };
  }
  return null;
}

// ------------------------------------------------------------ o fornecedor que o sistema cria

/** O cadastro provisório do emitente desconhecido: só o que veio no próprio XML (e-mail e WhatsApp ficam vazios: é "a completar"). */
export function dadosDoFornecedorProvisorio(e: NotaDoXml['emitente']) {
  return {
    nome: (e.fantasia ?? e.razao).slice(0, LIMITES_DO_FORNECEDOR.nome),
    razaoSocial: e.razao.slice(0, LIMITES_DO_FORNECEDOR.razaoSocial),
    documento: e.documento,
    inscricaoEstadual: e.inscricaoEstadual,
    endereco: e.endereco,
    municipio: e.municipio,
    uf: e.uf,
    cep: e.cep,
  };
}

// ------------------------------------------------------------ lista

export type SituacaoNaLista = 'fila' | 'conciliadas' | 'canceladas' | 'todas';
export interface FiltrosDeDocumento {
  lojaId: string;
  fornecedorId: string;
  situacao: SituacaoNaLista;
  pagina: number;
}
export const DOCUMENTOS_POR_PAGINA = 30;
export const FILTROS_DE_DOCUMENTO_PADRAO: FiltrosDeDocumento = { lojaId: '', fornecedorId: '', situacao: 'fila', pagina: 1 };

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const idOuNada = (v: string) => (/^[a-z0-9]{1,64}$/i.test(v) ? v : '');

export function lerFiltrosDeDocumento(sp: Record<string, string | string[] | undefined>): FiltrosDeDocumento {
  const s = um(sp.situacao);
  return {
    lojaId: idOuNada(um(sp.loja)),
    fornecedorId: idOuNada(um(sp.fornecedor)),
    situacao: s === 'conciliadas' || s === 'canceladas' || s === 'todas' ? s : 'fila',
    pagina: Math.max(1, Math.trunc(Number(um(sp.pagina))) || 1),
  };
}

export function queryDosFiltrosDeDocumento(f: FiltrosDeDocumento, pagina = f.pagina): string {
  const q = new URLSearchParams();
  if (f.lojaId) q.set('loja', f.lojaId);
  if (f.fornecedorId) q.set('fornecedor', f.fornecedorId);
  if (f.situacao !== 'fila') q.set('situacao', f.situacao);
  if (pagina > 1) q.set('pagina', String(pagina));
  return q.toString();
}

export function temFiltroDeDocumento(f: FiltrosDeDocumento): boolean {
  return !!(f.lojaId || f.fornecedorId || f.situacao !== 'fila');
}

export const ROTULO_DA_SITUACAO: Record<string, string> = {
  RECEBIDO: 'Recebida',
  AGUARDANDO_CONFERENCIA: 'Aguardando conferência',
  CONCILIADO: 'Conciliada',
  CANCELADO: 'Cancelada',
  ERRO: 'Com erro',
};

/** O retrato do documento para o histórico. */
export function retratoDoDocumento(d: { numero: string; serie: string; emitente: string; loja: string | null; situacao: string; nota?: string | null }): Record<string, string | null> {
  return {
    nome: `Nota ${d.numero}${d.serie ? ` · série ${d.serie}` : ''}`,
    emitente: d.emitente,
    loja: d.loja,
    situacao: d.situacao,
    notaDeCompra: d.nota ?? null,
  };
}
