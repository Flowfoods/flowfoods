/**
 * Planilha de faturamento (2.1) — a parte PURA: ler o CSV e interpretar cada
 * linha. Nada aqui grava; quem compara e grava é `faturamento.ts`, com a MESMA
 * regra do formulário (`lerCanalDoDia`).
 *
 * Formato (modelo em `public/modelos/faturamento.csv`), uma linha por loja ×
 * canal × dia:
 *
 *   data;loja;canal;faturamento;pedidos;clientes
 *
 * `;` é o recomendado (a vírgula é o decimal do Brasil); `,` vale com aspas.
 * Loja pelo nome (sem caixa nem acento), canal por loja | delivery | ifood.
 * `clientes` pode ficar em branco (= pedidos). Dia que a loja não vendeu vai
 * com 0 em faturamento e pedidos.
 *
 * Proteção (decisão 128): só números e nomes são lidos. Célula que começa com
 * `= + - @` ou tab/CR (fórmula para a planilha de quem abrir depois) nunca casa
 * loja ou canal e é recusada no número; o eco da célula na mensagem é cortado e
 * sem controle/bidi. Teto de tamanho, linhas, colunas e caracteres por campo.
 */

import { decodificarPlanilha, LIMITE_DA_PLANILHA, LIMITE_DE_LINHAS, lerCsv, type ErroDeLinha } from './ficha-planilha';
import { ehCanal, comecaComoFormula, lerCanalDoDia, lerDataDoLancamento, rotuloDoCanal, type CanalVenda, type NumerosDoCanal } from './faturamento-campos';

export { decodificarPlanilha, LIMITE_DA_PLANILHA, LIMITE_DE_LINHAS };
export type { ErroDeLinha };

export const LIMITES_DA_PLANILHA = { colunas: 20, caracteresPorCampo: 200, segundos: 30 } as const;

export const CABECALHO_DO_MODELO = 'data;loja;canal;faturamento;pedidos;clientes';

const COLUNAS = {
  data: ['data', 'dia'],
  loja: ['loja', 'unidade'],
  canal: ['canal'],
  faturamento: ['faturamento', 'faturamento r', 'valor', 'venda', 'vendas'],
  pedidos: ['pedidos', 'qtd pedidos', 'numero de pedidos'],
  clientes: ['clientes', 'clientes atendidos'],
} as const;
type Coluna = keyof typeof COLUNAS;
const OBRIGATORIAS: Coluna[] = ['data', 'loja', 'canal', 'faturamento', 'pedidos'];

/** Minúscula, sem acento, espaços colapsados: "Vila da Penha" = "vila  da PENHA" = "VILA DA PENHÁ". */
export const normalizarNome = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** A célula como aparece na mensagem: sem controle nem bidi, no máximo 40 caracteres. */
export function ecoDaCelula(t: string): string {
  const limpo = t.replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, '').replace(/\s+/g, ' ').trim();
  return limpo.length > 40 ? `${limpo.slice(0, 40)}…` : limpo;
}

/** Quem abre a célula como fórmula, dito de forma que a pessoa ache no Excel: "tab" e "retorno de linha" não se veem. */
export function comoComecaAFormula(v: string): string {
  const nome = (c: string) => (c === '\t' ? 'um tab (espaço de tabulação)' : c === '\r' ? 'um retorno de linha (CR)' : `“${c}”`);
  const primeiro = v[0];
  if (primeiro && /[=+\-@\t\r]/.test(primeiro)) return nome(primeiro);
  const depois = v.trimStart()[0];
  return depois ? `espaço e depois ${nome(depois)}` : 'um sinal de fórmula';
}

export interface LinhaLida {
  linha: number;
  data: string;
  loja: string;
  canal: string;
  faturamento: string;
  pedidos: string;
  clientes: string;
}

export interface LeituraDaPlanilha {
  linhas: LinhaLida[];
  /** Erros que são do arquivo ou da linha antes de qualquer interpretação (campo longo, colunas a mais). */
  erros: ErroDeLinha[];
  linhasLidas: number;
}

/** CSV → linhas cruas. Cabeçalho com ou sem acento; linha vazia é pulada. */
export function lerPlanilhaDeFaturamento(texto: string): LeituraDaPlanilha {
  const registros = lerCsv(texto);
  const arquivo = (mensagem: string): LeituraDaPlanilha => ({ linhas: [], erros: [{ linha: 1, mensagem }], linhasLidas: 0 });
  if (registros.length === 0) return arquivo('A planilha está vazia.');
  if (registros.length > LIMITE_DE_LINHAS + 1) return arquivo(`Mais de ${LIMITE_DE_LINHAS} linhas: divida em arquivos menores.`);
  const [cabecalho, ...corpo] = registros;
  if (cabecalho.campos.length > LIMITES_DA_PLANILHA.colunas) return arquivo(`Mais de ${LIMITES_DA_PLANILHA.colunas} colunas: use o modelo (${CABECALHO_DO_MODELO}).`);
  const posicao = new Map<Coluna, number>();
  cabecalho.campos.forEach((nome, i) => {
    const n = normalizarNome(nome).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    for (const [col, nomes] of Object.entries(COLUNAS) as [Coluna, readonly string[]][]) {
      if (nomes.includes(n) && !posicao.has(col)) posicao.set(col, i);
    }
  });
  const faltam = OBRIGATORIAS.filter((c) => !posicao.has(c));
  if (faltam.length > 0) return arquivo(`Faltam as colunas ${faltam.join(', ')} no cabeçalho. Use o modelo para baixar.`);

  const linhas: LinhaLida[] = [];
  const erros: ErroDeLinha[] = [];
  let linhasLidas = 0;
  for (const r of corpo) {
    if (r.campos.every((x) => x.trim() === '')) continue;
    linhasLidas++;
    if (r.campos.length > cabecalho.campos.length) {
      erros.push({ linha: r.linha, mensagem: 'Colunas a mais que o cabeçalho: vírgula decimal sem aspas? Use ; como separador ou ponha o valor entre aspas.' });
      continue;
    }
    if (r.campos.some((c) => c.length > LIMITES_DA_PLANILHA.caracteresPorCampo)) {
      erros.push({ linha: r.linha, mensagem: `Campo com mais de ${LIMITES_DA_PLANILHA.caracteresPorCampo} caracteres.` });
      continue;
    }
    const val = (c: Coluna) => (posicao.has(c) ? (r.campos[posicao.get(c)!] ?? '') : '');
    linhas.push({ linha: r.linha, data: val('data'), loja: val('loja'), canal: val('canal'), faturamento: val('faturamento'), pedidos: val('pedidos'), clientes: val('clientes') });
  }
  return { linhas, erros, linhasLidas };
}

// ------------------------------------------------------------------ interpretar uma linha

export interface LojaParaPlanilha {
  id: string;
  nome: string;
  ativa: boolean;
  canais: readonly CanalVenda[];
}

export type LinhaInterpretada =
  | ({ ok: true; lojaId: string; lojaNome: string; canal: CanalVenda; data: string } & NumerosDoCanal)
  | { ok: false; erro: string };

/** loja | salão | balcão → LOJA; delivery | delivery próprio → DELIVERY_PROPRIO; ifood → IFOOD. */
export function lerCanalDaPlanilha(texto: string): CanalVenda | null {
  const n = normalizarNome(texto);
  const mapa: Record<string, CanalVenda> = {
    loja: 'LOJA',
    salao: 'LOJA',
    balcao: 'LOJA',
    delivery: 'DELIVERY_PROPRIO',
    'delivery proprio': 'DELIVERY_PROPRIO',
    proprio: 'DELIVERY_PROPRIO',
    ifood: 'IFOOD',
    'i food': 'IFOOD',
  };
  const c = mapa[n];
  return c && ehCanal(c) ? c : null;
}

/**
 * Uma linha → loja, canal, dia e números, ou o motivo. `lojas` são só as do
 * alcance de quem importa (e que a pessoa pode lançar): loja inexistente, de
 * outro parceiro ou fora do acesso recebem a MESMA frase.
 */
export function interpretarLinha(l: LinhaLida, lojas: readonly LojaParaPlanilha[], hoje: string): LinhaInterpretada {
  for (const [rotulo, v] of [['data', l.data], ['loja', l.loja], ['canal', l.canal], ['faturamento', l.faturamento], ['pedidos', l.pedidos], ['clientes', l.clientes]] as const) {
    // Número negativo ("-10,00") é lido adiante e recusado como negativo; qualquer outro "-" é fórmula.
    const numerico = rotulo === 'faturamento' || rotulo === 'pedidos' || rotulo === 'clientes';
    if (comecaComoFormula(v) && !(numerico && /^-\s*\d/.test(v.trim()))) {
      return { ok: false, erro: `A célula de ${rotulo} começa com ${comoComecaAFormula(v)}: fórmula não entra. Cole só o valor.` };
    }
  }
  const data = lerDataDoLancamento(l.data, hoje);
  if (!data.ok) return { ok: false, erro: l.data.trim() ? data.erro : 'Data em branco.' };

  const nome = normalizarNome(l.loja);
  if (!nome) return { ok: false, erro: 'Loja em branco.' };
  const achadas = lojas.filter((x) => normalizarNome(x.nome) === nome);
  if (achadas.length === 0) return { ok: false, erro: `Loja “${ecoDaCelula(l.loja)}” não encontrada no seu acesso.` };
  if (achadas.length > 1) return { ok: false, erro: `Há mais de uma loja chamada “${ecoDaCelula(l.loja)}”: diferencie os nomes no cadastro.` };
  const loja = achadas[0];
  if (!loja.ativa) return { ok: false, erro: `A loja ${loja.nome} está desativada: não recebe lançamento novo.` };

  const canal = lerCanalDaPlanilha(l.canal);
  if (!canal) return { ok: false, erro: l.canal.trim() ? `Canal “${ecoDaCelula(l.canal)}” não existe: use loja, delivery ou ifood.` : 'Canal em branco.' };
  if (!loja.canais.includes(canal)) return { ok: false, erro: `A loja ${loja.nome} não vende por ${rotuloDoCanal(canal)}.` };

  const n = lerCanalDoDia({ valor: l.faturamento, pedidos: l.pedidos, clientes: l.clientes, naoVendeu: false });
  if (n.estado === 'vazio') return { ok: false, erro: 'Faturamento e pedidos em branco: ponha os números, ou 0 e 0 se a loja não vendeu.' };
  if (n.estado === 'erro') return { ok: false, erro: Object.values(n.erros).join(' ') };
  return { ok: true, lojaId: loja.id, lojaNome: loja.nome, canal, data: data.data, ...n.numeros };
}
