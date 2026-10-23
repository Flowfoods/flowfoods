/**
 * Etiquetas (3.4) — as regras PURAS, sem banco e sem Next: a validade efetiva do item comprado que foi ABERTO, os dias e as
 * horas no relógio do Rio, a leitura dos formulários (emitir a etiqueta de um lote, abrir uma embalagem, registrar o lote do
 * fornecedor no recebimento, pedir uma impressão), o código da etiqueta e as frases. `etiquetas.ts` (banco) e as telas usam as
 * mesmas funções; o desenho da etiqueta (ZPL e prévia) mora em `etiqueta-zpl.ts`.
 *
 * Princípios (decisões 400 a 429):
 * - NUNCA inventar prazo: sem prazo após abertura cadastrado, a validade do item aberto é "prazo após abertura não informado"
 *   (sem data); sem vencimento do lote, vale só o prazo, e a tela avisa;
 * - abrir NÃO prolonga o vencimento: validade efetiva = o MENOR entre o fim do dia do vencimento do lote (no Rio) e
 *   abertura + prazo após abertura na conservação escolhida; lote já vencido não abre;
 * - dias são DURAÇÃO (minutos, como a validade do lote produzido na 3.1); o vencimento do lote é uma data de calendário e vale
 *   até o fim daquele dia no Rio (meia-noite do dia seguinte);
 * - o lote PRODUZIDO já tem a validade fotografada na conclusão (3.1): a etiqueta copia, a reimpressão usa a emissão e nada
 *   recalcula; o prazo de produto comprado nunca serve para o pré-preparo.
 */

import { lerData } from './compra-campos';
import { limparTexto } from './texto-limpo';
import { formatarQuantidade, lerQuantidadeNa, type Escala, type Unidade } from './unidades';
import { CONSERVACOES, ORDEM_DAS_CONSERVACOES, formatarValidade, type Conservacao } from './validade';

// ================================================================ formatos e limites

export const FORMATOS = {
  E60X40: { rotulo: '60 × 40 mm', larguraMm: 60, alturaMm: 40 },
  E60X60: { rotulo: '60 × 60 mm', larguraMm: 60, alturaMm: 60 },
} as const;
export type Formato = keyof typeof FORMATOS;
export const ORDEM_DOS_FORMATOS: readonly Formato[] = ['E60X40', 'E60X60'];
export const ehFormato = (v: unknown): v is Formato => typeof v === 'string' && (ORDEM_DOS_FORMATOS as readonly string[]).includes(v);

/** Resolução da impressora: 203 dpi (8 pontos por mm) é o padrão da Zebra de balcão; 300 dpi (12 por mm) é opção por computador. */
export const RESOLUCOES = { 203: 8, 300: 12 } as const;
export type Resolucao = keyof typeof RESOLUCOES;
export const lerResolucao = (v: unknown): Resolucao => (String(v) === '300' ? 300 : 203);

/** Até quantas etiquetas numa emissão (uma por pote ou porção) e quantas cópias num pedido de impressão (decisão 412). */
export const MAX_ETIQUETAS = 50;
export const MAX_COPIAS = 50;

export const LIMITES_DO_LOTE = { codigo: 40, marca: 80 } as const;

export type RegraDaValidade = 'PRAZO_APOS_ABERTURA' | 'VENCIMENTO_DO_LOTE' | 'PRAZO_NAO_INFORMADO';
export type Transporte = 'BROWSER_PRINT' | 'ARQUIVO_ZPL' | 'PAPEL';
export type SituacaoDaImpressao = 'PREPARADA' | 'ENVIADA' | 'EXPORTADA' | 'FALHOU';

export const ROTULO_DO_TRANSPORTE: Record<Transporte, string> = {
  BROWSER_PRINT: 'Zebra (Browser Print)',
  ARQUIVO_ZPL: 'Arquivo .zpl',
  PAPEL: 'Papel A4',
};

/** O que aconteceu com o pedido, sem fingir: "enviada" é que o aplicativo da impressora recebeu, não que saiu no papel. */
export const ROTULO_DA_SITUACAO: Record<SituacaoDaImpressao, string> = {
  PREPARADA: 'Sem resultado',
  ENVIADA: 'Enviada à impressora',
  EXPORTADA: 'Arquivo gerado',
  FALHOU: 'Falhou',
};

/** O nome do pedido na tela (rodada 1, UX 11): pelo caminho, não pela ordem ("Reimpressão 2" de um papel confundia). */
export const NOME_DO_PEDIDO: Record<Transporte, string> = { BROWSER_PRINT: 'Zebra', ARQUIVO_ZPL: 'Arquivo', PAPEL: 'Papel' };

/**
 * O selo do pedido (rodada 1, decisão 418): "Já imprimi" quando alguém disse que saiu; a Zebra sem resposta fica "Sem
 * resultado" (pode ter saído); o arquivo foi "baixado" e o papel "aberto" — nenhum dos dois é "impresso".
 */
export function seloDoPedido(p: { transporte: Transporte; situacao: SituacaoDaImpressao; confirmadaEm: Date | null }): { texto: string; tom: 'ok' | 'alerta' | 'erro' | 'neutro' } {
  if (p.confirmadaEm) return { texto: 'Já imprimi', tom: 'ok' };
  if (p.situacao === 'ENVIADA') return { texto: 'Enviada à impressora', tom: 'ok' };
  if (p.situacao === 'FALHOU') return { texto: 'Falhou', tom: 'erro' };
  if (p.situacao === 'PREPARADA') return { texto: 'Sem resultado', tom: 'alerta' };
  return { texto: p.transporte === 'PAPEL' ? 'Papel aberto' : 'Arquivo baixado', tom: 'neutro' };
}

export const ehTransporte = (v: unknown): v is Transporte => v === 'BROWSER_PRINT' || v === 'ARQUIVO_ZPL' || v === 'PAPEL';

// ================================================================ o relógio do Rio

const FUSO = 'America/Sao_Paulo';

function partesNoRio(d: Date) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '00';
  return { ano: v('year'), mes: v('month'), dia: v('day'), hora: v('hour'), minuto: v('minute') };
}

/** O dia ("2026-10-23") de um instante, no Rio. */
export function diaNoRio(d: Date): string {
  const p = partesNoRio(d);
  return `${p.ano}-${p.mes}-${p.dia}`;
}

/** "23/10/26 14:05" (ou só "23/10/26"): o que vai na etiqueta, sempre no relógio do Rio. */
export function dataHoraDaEtiqueta(d: Date, comHora = true): string {
  const p = partesNoRio(d);
  return `${p.dia}/${p.mes}/${p.ano.slice(2)}${comHora ? ` ${p.hora}:${p.minuto}` : ''}`;
}

/** "10/11/26": uma data de calendário (aaaa-mm-dd) na etiqueta. */
export function diaDaEtiqueta(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a.slice(2)}`;
}

/** "23/10/2026 às 14:05": a mesma hora na tela. */
export function quandoNaTela(d: Date): string {
  const p = partesNoRio(d);
  return `${p.dia}/${p.mes}/${p.ano} às ${p.hora}:${p.minuto}`;
}

/**
 * O instante em que um dia do Rio começa (meia-noite local, em UTC). O Rio não tem horário de verão desde 2019, mas a conta
 * não supõe isso: acha o deslocamento do fuso naquele dia.
 */
export function inicioDoDiaNoRio(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number);
  const palpite = Date.UTC(a, m - 1, d, 3, 0, 0);
  const p = partesNoRio(new Date(palpite));
  const local = Date.UTC(Number(p.ano), Number(p.mes) - 1, Number(p.dia), Number(p.hora), Number(p.minuto));
  return new Date(palpite - (local - Date.UTC(a, m - 1, d, 0, 0, 0)));
}

/** O fim do dia do vencimento (aaaa-mm-dd), no Rio: a meia-noite do dia seguinte. É até quando o lote vale. */
export function fimDoVencimento(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number);
  const seguinte = new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
  return inicioDoDiaNoRio(seguinte);
}

// ================================================================ a validade do item aberto

export type ValidadeDaAbertura =
  | { ok: true; validadeEm: Date | null; regra: RegraDaValidade }
  | { ok: false; erro: string };

/**
 * A validade EFETIVA de uma embalagem aberta (decisão 402): o menor entre o fim do dia do vencimento do lote e abertura +
 * prazo após abertura. Sem prazo: sem data ("prazo após abertura não informado"), mesmo com o vencimento do lote (o
 * vencimento não é a validade depois de aberto: usá-lo seria prolongar). Lote que já venceu não abre.
 */
export function validadeDaAbertura(a: { abertoEm: Date; prazoMin: number | null; vencimentoLote: string | null }): ValidadeDaAbertura {
  const fim = a.vencimentoLote ? fimDoVencimento(a.vencimentoLote) : null;
  if (fim && a.abertoEm.getTime() >= fim.getTime()) {
    return { ok: false, erro: `Este lote venceu em ${diaPorExtenso(a.vencimentoLote!)}: não abra. Separe para descarte e avise a gerência.` };
  }
  if (a.prazoMin === null) return { ok: true, validadeEm: null, regra: 'PRAZO_NAO_INFORMADO' };
  const pelaAbertura = new Date(a.abertoEm.getTime() + a.prazoMin * 60_000);
  if (fim && fim.getTime() < pelaAbertura.getTime()) return { ok: true, validadeEm: fim, regra: 'VENCIMENTO_DO_LOTE' };
  return { ok: true, validadeEm: pelaAbertura, regra: 'PRAZO_APOS_ABERTURA' };
}

/**
 * Rodada 1 (decisão 417): a validade da etiqueta já passou? Lote produzido ou embalagem aberta vencidos não emitem nem
 * reimprimem (Zebra, arquivo e papel). Sem data (não informada), não há como dizer: segue.
 */
export function venceu(validadeEm: Date | null, agora: Date): boolean {
  return !!validadeEm && validadeEm.getTime() <= agora.getTime();
}

/** "Este lote venceu em 22/10 às 14:05: não use. Separe para descarte e avise a gerência." (pelo dia, quando é o vencimento do lote). */
export function fraseDoVencido(o: { origem: 'LOTE' | 'ABERTA'; validadeEm: Date; porDia: string | null }): string {
  const p = partesNoRio(o.validadeEm);
  const quando = o.porDia ? `${o.porDia.slice(8, 10)}/${o.porDia.slice(5, 7)}` : `${p.dia}/${p.mes} às ${p.hora}:${p.minuto}`;
  return `${o.origem === 'LOTE' ? 'Este lote venceu' : 'Esta embalagem venceu'} em ${quando}: não use. Separe para descarte e avise a gerência.`;
}

/** "10/11/2026" a partir do dia (aaaa-mm-dd). */
export function diaPorExtenso(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

/** A frase da validade do item aberto, para a tela (a etiqueta tem a dela, curta). */
export function fraseDaValidadeDaAbertura(v: { regra: RegraDaValidade; validadeEm: Date | null; vencimentoLote: string | null; prazoMin: number | null; conservacao: Conservacao }): string {
  const onde = CONSERVACOES[v.conservacao].toLowerCase();
  if (v.regra === 'PRAZO_NAO_INFORMADO') {
    return `Prazo após abertura não informado em ${onde}: a etiqueta sai sem data de validade.${v.vencimentoLote ? ` O lote vence em ${diaPorExtenso(v.vencimentoLote)}, mas isso não é a validade depois de aberto.` : ''}`;
  }
  if (v.regra === 'VENCIMENTO_DO_LOTE') {
    return `Vale até ${diaPorExtenso(v.vencimentoLote!)}, o vencimento do lote: chega antes de ${formatarValidade(v.prazoMin!)} depois de aberto (${onde}). Abrir não prolonga o vencimento.`;
  }
  return `Vale até ${quandoNaTela(v.validadeEm!)}: ${formatarValidade(v.prazoMin!)} depois de aberto (${onde})${v.vencimentoLote ? `, antes do vencimento do lote (${diaPorExtenso(v.vencimentoLote)})` : '. Sem o vencimento do lote, vale só o prazo: confira a embalagem'}.`;
}

// ================================================================ o código da etiqueta

/** "E261023-0007": dia (Rio) e a sequência do dia no parceiro. Vai impresso e é o que se procura no histórico. */
export function codigoDaEtiqueta(dia: string, sequencia: number): string {
  const [a, m, d] = dia.split('-');
  return `E${a.slice(2)}${m}${d}-${String(sequencia).padStart(4, '0')}`;
}

export function sequenciaDaEtiqueta(codigo: string): number | null {
  const m = /^E\d{6}-(\d{4,5})$/.exec(codigo);
  return m ? Number(m[1]) : null;
}

// ================================================================ leitura dos formulários

type Erros = Record<string, string>;

/** Inteiro de 1 a `max` digitado ("3"); vazio = `padrao`. */
function lerQuantas(v: unknown, max: number, padrao: number | null, oQue: string): { ok: true; n: number } | { ok: false; erro: string } {
  const t = typeof v === 'string' ? v.trim() : '';
  if (!t) return padrao === null ? { ok: false, erro: `Diga quantas ${oQue}.` } : { ok: true, n: padrao };
  if (!/^\d{1,3}$/.test(t)) return { ok: false, erro: `Quantas ${oQue}: um número inteiro, de 1 a ${max}.` };
  const n = Number(t);
  if (n < 1) return { ok: false, erro: `Pelo menos 1.` };
  if (n > max) return { ok: false, erro: `No máximo ${max} de uma vez. Para mais, faça outra emissão.` };
  return { ok: true, n };
}

/** Quantidade opcional, na unidade do produto ("0,5" kg ou "500" g). Vazio = sem quantidade na etiqueta. */
function lerQuantidadeOpcional(v: unknown, escala: unknown, unidade: Unidade): { ok: true; q: number | null } | { ok: false; erro: string } {
  const t = typeof v === 'string' ? v.trim() : '';
  if (!t) return { ok: true, q: null };
  const e: Escala = escala === 'menor' && unidade !== 'UN' ? 'menor' : 'base';
  const q = lerQuantidadeNa(t, unidade, e);
  const sigla = unidade === 'UN' ? 'un' : unidade === 'L' ? (e === 'menor' ? 'ml' : 'L') : e === 'menor' ? 'g' : 'kg';
  if (q === null) return { ok: false, erro: `Quanto em cada: número como 0,5 (${sigla === 'g' || sigla === 'ml' ? `inteiro em ${sigla}` : sigla}).` };
  if (q <= 0) return { ok: false, erro: 'Quanto em cada: maior que zero, ou deixe vazio.' };
  if (q > 10_000_000) return { ok: false, erro: 'Quanto em cada: confira o número.' };
  return { ok: true, q };
}

const ehSim = (v: unknown) => v === 'on' || v === 'sim' || v === 'true' || v === '1' || v === true;

export interface EmissaoLida {
  formato: Formato;
  quantas: number;
  quantidadeMilesimos: number | null;
  mostrarHora: boolean;
}

/**
 * Emitir a etiqueta de um lote produzido: formato, quantas etiquetas (uma por pote), quanto em cada (opcional) e se a hora
 * aparece. As etiquetas, juntas, não passam do que saiu do lote (decisão 412).
 */
export function lerEmissaoDoLote(
  f: { formato: unknown; quantas: unknown; quanto: unknown; escala: unknown; hora: unknown },
  c: { unidade: Unidade; produzidoMilesimos: number },
): { ok: true; emissao: EmissaoLida } | { ok: false; erros: Erros } {
  const erros: Erros = {};
  if (!ehFormato(f.formato)) erros.formato = 'Escolha o tamanho da etiqueta: 60 × 40 ou 60 × 60 mm.';
  const quantas = lerQuantas(f.quantas, MAX_ETIQUETAS, null, 'etiquetas');
  if (!quantas.ok) erros.quantas = quantas.erro;
  const q = lerQuantidadeOpcional(f.quanto, f.escala, c.unidade);
  if (!q.ok) erros.quanto = q.erro;
  if (quantas.ok && q.ok && q.q !== null && quantas.n * q.q > c.produzidoMilesimos) {
    erros.quanto = `${quantas.n} × ${formatarQuantidade(q.q, c.unidade)} passa do que saiu do lote (${formatarQuantidade(c.produzidoMilesimos, c.unidade)}).`;
  }
  if (Object.keys(erros).length || !quantas.ok || !q.ok || !ehFormato(f.formato)) return { ok: false, erros };
  return { ok: true, emissao: { formato: f.formato, quantas: quantas.n, quantidadeMilesimos: q.q, mostrarHora: ehSim(f.hora) } };
}

/** Emitir a etiqueta de uma embalagem aberta: formato, quantas (padrão 1) e a hora. A quantidade é a da abertura. */
export function lerEmissaoDaAbertura(f: { formato: unknown; quantas: unknown; hora: unknown }): { ok: true; emissao: Omit<EmissaoLida, 'quantidadeMilesimos'> } | { ok: false; erros: Erros } {
  const erros: Erros = {};
  if (!ehFormato(f.formato)) erros.formato = 'Escolha o tamanho da etiqueta: 60 × 40 ou 60 × 60 mm.';
  const quantas = lerQuantas(f.quantas, MAX_ETIQUETAS, 1, 'etiquetas');
  if (!quantas.ok) erros.quantas = quantas.erro;
  if (Object.keys(erros).length || !quantas.ok || !ehFormato(f.formato)) return { ok: false, erros };
  return { ok: true, emissao: { formato: f.formato, quantas: quantas.n, mostrarHora: ehSim(f.hora) } };
}

/** Quantas cópias num pedido de impressão (primeira ou reimpressão). */
export function lerCopias(v: unknown): { ok: true; copias: number } | { ok: false; erro: string } {
  const r = lerQuantas(v, MAX_COPIAS, null, 'cópias');
  return r.ok ? { ok: true, copias: r.n } : { ok: false, erro: r.erro };
}

/** Código do lote do fornecedor como está impresso: letras, números e - / . e espaço, até 40. Vazio = não informado. */
export function lerCodigoDoLote(v: unknown): { ok: true; codigo: string | null } | { ok: false; erro: string } {
  const t = limparTexto(v);
  if (!t) return { ok: true, codigo: null };
  if (t.length > LIMITES_DO_LOTE.codigo) return { ok: false, erro: `Lote: até ${LIMITES_DO_LOTE.codigo} letras.` };
  // Rodada 1 (Guardião M8): a pontuação comum do lote impresso (e do nLote do XML) também vale; o ZPL protege `^`, `~` e `_`.
  if (!/^[\p{L}\p{N} ./\-_:#,()+]+$/u.test(t)) return { ok: false, erro: 'Lote: letras, números, espaço e . / - _ : # , ( ) +, como está na embalagem.' };
  return { ok: true, codigo: t };
}

export function lerMarcaDoLote(v: unknown): { ok: true; marca: string | null } | { ok: false; erro: string } {
  const t = limparTexto(v);
  if (!t) return { ok: true, marca: null };
  if (t.length > LIMITES_DO_LOTE.marca) return { ok: false, erro: `Marca: até ${LIMITES_DO_LOTE.marca} letras.` };
  return { ok: true, marca: t };
}

export interface LoteLido {
  codigo: string | null;
  vencimento: string | null;
  fabricacao: string | null;
  marca: string | null;
}

/**
 * O lote do fornecedor (no recebimento, ou lido na embalagem na hora de abrir): código, vencimento, fabricação (dd/mm/aaaa) e
 * marca, todos opcionais e NUNCA inventados. No recebimento é preciso o código ou o vencimento (um lote sem nada não rastreia).
 * Fabricação não depois de hoje nem do vencimento; vencimento até 10 anos.
 */
export function lerLote(
  f: { codigo: unknown; vencimento: unknown; fabricacao: unknown; marca: unknown },
  c: { hoje: string; exigeAlgo: boolean },
): { ok: true; lote: LoteLido } | { ok: false; erros: Erros } {
  const erros: Erros = {};
  const codigo = lerCodigoDoLote(f.codigo);
  if (!codigo.ok) erros.codigo = codigo.erro;
  const marca = lerMarcaDoLote(f.marca);
  if (!marca.ok) erros.marca = marca.erro;
  const data = (v: unknown, campo: 'vencimento' | 'fabricacao', nome: string): string | null => {
    const t = typeof v === 'string' ? v.trim() : '';
    if (!t) return null;
    const d = lerData(t);
    if (!d) erros[campo] = `${nome}: use dd/mm/aaaa (ex.: 10/11/2026).`;
    return d;
  };
  const vencimento = data(f.vencimento, 'vencimento', 'Vencimento do lote');
  const fabricacao = data(f.fabricacao, 'fabricacao', 'Fabricação');
  if (vencimento && vencimento < '2000-01-01') erros.vencimento = 'Vencimento do lote: confira o ano.';
  const [ah, mh, dh] = c.hoje.split('-').map(Number);
  const limite = new Date(Date.UTC(ah + 10, mh - 1, dh)).toISOString().slice(0, 10);
  if (vencimento && vencimento > limite) erros.vencimento = 'Vencimento do lote a mais de 10 anos? Confira o ano.';
  if (fabricacao && fabricacao > c.hoje) erros.fabricacao = 'Fabricação depois de hoje? Confira a data.';
  if (fabricacao && fabricacao < '2000-01-01') erros.fabricacao = 'Fabricação: confira o ano.';
  if (fabricacao && vencimento && fabricacao > vencimento) erros.fabricacao = 'A fabricação vem antes do vencimento: confira as datas.';
  if (c.exigeAlgo && codigo.ok && !codigo.codigo && !vencimento && !erros.vencimento) {
    erros.codigo = 'Diga pelo menos o lote ou o vencimento, como estão na embalagem.';
  }
  if (Object.keys(erros).length || !codigo.ok || !marca.ok) return { ok: false, erros };
  return { ok: true, lote: { codigo: codigo.codigo, vencimento, fabricacao, marca: marca.marca } };
}

const ehConservacao = (v: unknown): v is Conservacao => typeof v === 'string' && (ORDEM_DAS_CONSERVACOES as readonly string[]).includes(v);

export interface AberturaLida {
  conservacao: Conservacao;
  quantidadeMilesimos: number | null;
}

/** Abrir: onde a embalagem aberta vai ficar (decide o prazo) e quanto foi aberto (opcional). */
export function lerAbertura(f: { conservacao: unknown; quanto: unknown; escala: unknown }, unidade: Unidade): { ok: true; abertura: AberturaLida } | { ok: false; erros: Erros } {
  const erros: Erros = {};
  if (!ehConservacao(f.conservacao)) erros.conservacao = 'Escolha onde a embalagem aberta vai ficar: é daí que sai o prazo.';
  const q = lerQuantidadeOpcional(f.quanto, f.escala, unidade);
  if (!q.ok) erros.quanto = q.erro.replace('Quanto em cada', 'Quanto foi aberto');
  if (Object.keys(erros).length || !q.ok || !ehConservacao(f.conservacao)) return { ok: false, erros };
  return { ok: true, abertura: { conservacao: f.conservacao, quantidadeMilesimos: q.q } };
}

/** O prazo após abertura de um insumo comprado, na conservação escolhida (minutos), ou null = não informado. */
export function prazoNaConservacao(
  insumo: { validadeSecoMin: number | null; validadePistaFriaMin: number | null; validadeRefrigeradoMin: number | null; validadeCongeladoMin: number | null },
  c: Conservacao,
): number | null {
  const m = { SECO: insumo.validadeSecoMin, PISTA_FRIA: insumo.validadePistaFriaMin, REFRIGERADO: insumo.validadeRefrigeradoMin, CONGELADO: insumo.validadeCongeladoMin }[c];
  return m && m > 0 ? m : null;
}

/** A conservação que a tela sugere ao abrir: a única com prazo, senão a principal do insumo. */
export function conservacaoSugerida(insumo: Parameters<typeof prazoNaConservacao>[0] & { conservacao: Conservacao }): Conservacao {
  const comPrazo = ORDEM_DAS_CONSERVACOES.filter((c) => prazoNaConservacao(insumo, c) !== null);
  if (comPrazo.includes(insumo.conservacao)) return insumo.conservacao;
  return comPrazo.length === 1 ? comPrazo[0] : insumo.conservacao;
}

/** A chave de um envio (duplo clique, rede que volta): texto curto e sem estranheza; fora disso, sem chave. */
export function lerChaveDoEnvio(v: unknown): string | null {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null;
}

/** A frase de uma situação de validade relativa a agora: "vence em 2 dias", "venceu", "vence hoje às 14:05". */
export function situacaoDaValidade(validadeEm: Date | null, agora: Date, porDia: string | null = null): { texto: string; tom: 'ok' | 'alerta' | 'erro' | 'neutro' } {
  if (!validadeEm) return { texto: 'Validade não informada', tom: 'alerta' };
  if (porDia) {
    // Vale pelo vencimento do lote (uma data): até o fim daquele dia.
    const d = diasEntreDias(diaNoRio(agora), porDia);
    if (d < 0) return { texto: 'Venceu', tom: 'erro' };
    if (d === 0) return { texto: 'Vence hoje', tom: 'alerta' };
    return { texto: d === 1 ? 'Vence amanhã' : `Vence em ${d} dias`, tom: 'neutro' };
  }
  const ms = validadeEm.getTime() - agora.getTime();
  if (ms <= 0) return { texto: 'Venceu', tom: 'erro' };
  const hojeD = diaNoRio(agora);
  const diaV = diaNoRio(validadeEm);
  if (diaV === hojeD) {
    const p = partesNoRio(validadeEm);
    return { texto: `Vence hoje às ${p.hora}:${p.minuto}`, tom: 'alerta' };
  }
  const dias = diasEntreDias(hojeD, diaV);
  if (dias === 1) return { texto: 'Vence amanhã', tom: 'neutro' };
  return { texto: `Vence em ${dias} dias`, tom: 'neutro' };
}

/** Dias de calendário de `a` até `b` (aaaa-mm-dd). */
export function diasEntreDias(a: string, b: string): number {
  const utc = (iso: string) => {
    const [x, y, z] = iso.split('-').map(Number);
    return Date.UTC(x, y - 1, z);
  };
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}
