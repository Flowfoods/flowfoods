/**
 * Contagem do dia a dia (1.7) — regras PURAS, sem banco e sem Next: período
 * de apuração, curva ABC e frequência, o que contar hoje, divergência
 * (contado × esperado), quando a contagem fecha sozinha, o ajuste no razão,
 * cobertura do período contra o piso e as regras da loja. As telas e
 * `contagem.ts` usam as mesmas funções.
 *
 * Princípios (Notion "Core · Estoque unificado"):
 * - nunca `saldo = contagem` apagando o que entrou depois: o ajuste é a
 *   DIFERENÇA entre o contado e o esperado no momento em que o item foi
 *   contado, aplicada sobre o saldo de agora;
 * - item não contado não é zero e não é ajustado;
 * - divergência não é perda (a 1.8 cruza com a requisição);
 * - contagem que passou do prazo fecha SEM aplicar.
 */

import { formatarData } from './compra-campos';
import type { Periodo } from './periodo-campos';
import { valorDaQuantidade, type MovimentoNovo } from './estoque-campos';
import { formatarDinheiro, lerDinheiro, type Fracao, type Unidade } from './unidades';
import type { Conservacao } from './validade';

// ================================================================ datas (texto AAAA-MM-DD, sem fuso)

const DIA_MS = 86_400_000;
const paraData = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const paraIso = (d: Date) => d.toISOString().slice(0, 10);

/** "2026-10-16" + n dias. */
export function somarDias(iso: string, n: number): string {
  return paraIso(new Date(paraData(iso).getTime() + n * DIA_MS));
}

/** Dias de `de` até `ate` (ate − de). */
export function diasEntre(de: string, ate: string): number {
  return Math.round((paraData(ate).getTime() - paraData(de).getTime()) / DIA_MS);
}

// ================================================================ período de apuração (a regra mora em periodo-campos.ts)

/** "Cobertura da semana de 10/10 a 16/10" / "de outubro de 2026" / "da 1ª quinzena · …" / "de 15/10 a 14/11". */
export function coberturaDe(nome: string): string {
  if (/^Semana /.test(nome)) return `Cobertura da ${nome[0].toLowerCase()}${nome.slice(1)}`;
  if (/^\dª quinzena/.test(nome)) return `Cobertura da ${nome}`;
  if (/^\d/.test(nome)) return `Cobertura de ${nome}`;
  return `Cobertura de ${nome[0].toLowerCase()}${nome.slice(1)}`;
}

/** Dias antes do fim em que o fechamento já pode começar (os 3 últimos dias do período). */
export const ABRE_FECHAMENTO_DIAS_ANTES = 2;

/** O fechamento do período já pode começar? A partir de 2 dias antes do fim (e depois dele, sempre). */
export function janelaDoFechamento(p: Periodo, hoje: string): { pode: boolean; abreEm: string } {
  const abreEm = somarDias(p.fim, -ABRE_FECHAMENTO_DIAS_ANTES);
  return { pode: hoje >= abreEm, abreEm };
}

// ================================================================ regras da loja

export interface RegrasDaContagem {
  /** Piso do fechamento: cobertura mínima por valor e por itens, em pontos-base. */
  pisoValorBp: number;
  pisoItensBp: number;
  /** Frequência por classe ABC, em dias. */
  freqADias: number;
  freqBDias: number;
  freqCDias: number;
  /** Diferença por item (em R$) que ainda deixa a contagem fechar sozinha. */
  toleranciaCentavos: number;
}

export const REGRAS_PADRAO: RegrasDaContagem = { pisoValorBp: 8000, pisoItensBp: 5000, freqADias: 7, freqBDias: 15, freqCDias: 30, toleranciaCentavos: 500 };

/** As colunas da `Loja` → regras. */
export function regrasDaLoja(l: {
  contagemPisoValorBp: number;
  contagemPisoItensBp: number;
  contagemFreqADias: number;
  contagemFreqBDias: number;
  contagemFreqCDias: number;
  contagemToleranciaCentavos: number;
}): RegrasDaContagem {
  return {
    pisoValorBp: l.contagemPisoValorBp,
    pisoItensBp: l.contagemPisoItensBp,
    freqADias: l.contagemFreqADias,
    freqBDias: l.contagemFreqBDias,
    freqCDias: l.contagemFreqCDias,
    toleranciaCentavos: l.contagemToleranciaCentavos,
  };
}

/** "80 %" a partir de pontos-base. */
export const porcento = (bp: number) => `${(Math.floor(bp / 10) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} %`;

export type CampoDasRegras = 'pisoValor' | 'pisoItens' | 'freqA' | 'freqB' | 'freqC' | 'tolerancia';

/**
 * Lê o formulário das regras (texto). Faixas iguais às do banco: piso por
 * valor 50–100 %, por itens 0–100 % (inteiros), frequência 1–90 dias com
 * A ≤ B ≤ C, tolerância R$ 0,00 a R$ 1.000,00.
 */
export function lerRegras(f: Partial<Record<CampoDasRegras, unknown>>): { ok: true; regras: RegrasDaContagem } | { ok: false; erros: Partial<Record<CampoDasRegras, string>> } {
  const erros: Partial<Record<CampoDasRegras, string>> = {};
  const txt = (k: CampoDasRegras) => (typeof f[k] === 'string' ? (f[k] as string).trim().replace(/\s*%$/, '') : '');
  const inteiro = (k: CampoDasRegras, min: number, max: number, frase: string) => {
    const t = txt(k);
    const n = /^\d{1,3}$/.test(t) ? Number(t) : NaN;
    if (!Number.isInteger(n) || n < min || n > max) {
      erros[k] = frase;
      return 0;
    }
    return n;
  };
  const pisoValor = inteiro('pisoValor', 50, 100, 'Piso por valor: número inteiro de 50 a 100 (%).');
  const pisoItens = inteiro('pisoItens', 0, 100, 'Piso por itens: número inteiro de 0 a 100 (%).');
  const a = inteiro('freqA', 1, 90, 'De 1 a 90 dias.');
  const b = inteiro('freqB', 1, 90, 'De 1 a 90 dias.');
  const c = inteiro('freqC', 1, 90, 'De 1 a 90 dias.');
  if (!erros.freqA && !erros.freqB && a > b) erros.freqB = 'Os médios (B) não podem ser contados mais vezes que os mais caros (A): use um número maior ou igual ao da A.';
  if (!erros.freqB && !erros.freqC && b > c) erros.freqC = 'Os menores (C) não podem ser contados mais vezes que os médios (B): use um número maior ou igual ao da B.';
  const tolTxt = txt('tolerancia').replace(/^R\$\s*/i, '');
  const tol = tolTxt === '' ? null : lerDinheiro(tolTxt);
  if (tol === null || tol < 0 || tol > 100_000) erros.tolerancia = 'Tolerância em reais, de 0,00 a 1.000,00 (0 = só fecha sozinha se bater exato).';
  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, regras: { pisoValorBp: pisoValor * 100, pisoItensBp: pisoItens * 100, freqADias: a, freqBDias: b, freqCDias: c, toleranciaCentavos: tol! } };
}

/** Regras → campos do formulário. */
export function camposDasRegras(r: RegrasDaContagem): Record<CampoDasRegras, string> {
  return {
    pisoValor: String(Math.round(r.pisoValorBp / 100)),
    pisoItens: String(Math.round(r.pisoItensBp / 100)),
    freqA: String(r.freqADias),
    freqB: String(r.freqBDias),
    freqC: String(r.freqCDias),
    tolerancia: formatarDinheiro(r.toleranciaCentavos).replace(/^R\$\s*/, ''),
  };
}

// ================================================================ curva ABC e frequência

export type Classe = 'A' | 'B' | 'C';

/**
 * Curva ABC pelo valor do saldo na loja (custo de referência de hoje): do
 * maior para o menor, A até 80 % do valor acumulado, B até 95 %, C o resto.
 * O item que cruza a fronteira fica na classe de cima. Sem preço, zero ou
 * negativo = C. Empate de valor: pelo id (estável).
 */
export function curvaAbc(itens: readonly { insumoId: string; valorCentavos: number | null }[]): Map<string, Classe> {
  const classes = new Map<string, Classe>();
  const comValor = itens.filter((i) => i.valorCentavos !== null && i.valorCentavos > 0).sort((x, y) => y.valorCentavos! - x.valorCentavos! || (x.insumoId < y.insumoId ? -1 : 1));
  const total = comValor.reduce((s, i) => s + i.valorCentavos!, 0);
  let acumulado = 0;
  for (const i of comValor) {
    // Antes de somar este: abaixo de 80 % → A; abaixo de 95 % → B.
    classes.set(i.insumoId, acumulado * 100 < total * 80 ? 'A' : acumulado * 100 < total * 95 ? 'B' : 'C');
    acumulado += i.valorCentavos!;
  }
  for (const i of itens) if (!classes.has(i.insumoId)) classes.set(i.insumoId, 'C');
  return classes;
}

export const frequenciaDa = (classe: Classe, r: RegrasDaContagem) => (classe === 'A' ? r.freqADias : classe === 'B' ? r.freqBDias : r.freqCDias);

export type SituacaoDoItem = 'nunca' | 'vencido' | 'vence-hoje' | 'em-dia';

/**
 * Situação de um insumo pela frequência: última contagem APLICADA na loja
 * (data no Rio) + dias da classe. Nunca contado = vencido (entra primeiro).
 */
export function situacaoDoItem(ultima: string | null, classe: Classe, r: RegrasDaContagem, hoje: string): { situacao: SituacaoDoItem; venceEm: string | null } {
  if (!ultima) return { situacao: 'nunca', venceEm: null };
  const venceEm = somarDias(ultima, frequenciaDa(classe, r));
  return { situacao: venceEm < hoje ? 'vencido' : venceEm === hoje ? 'vence-hoje' : 'em-dia', venceEm };
}

export const PARA_CONTAR: ReadonlySet<SituacaoDoItem> = new Set(['nunca', 'vencido', 'vence-hoje']);

export type Quais = 'vencidos' | 'todos' | 'A';

export const ROTULO_DE_QUAIS: Record<Quais, string> = { vencidos: 'Vencidos', todos: 'Todos daqui', A: 'Mais caros (A)' };

/** A classe ABC em palavras: "Mais caro (A)", "Médio (B)", "Menor (C)". */
export const ROTULO_DA_CLASSE: Record<Classe, string> = { A: 'Mais caro (A)', B: 'Médio (B)', C: 'Menor (C)' };

/** O que já vem marcado no planejamento: o lugar escolhido e "quais" (vencidos, todos ou curva A); quem está em outra contagem aberta, nunca. */
export function sugerido(i: { conservacao: Conservacao; classe: Classe; situacao: SituacaoDoItem; emOutraContagem: boolean }, filtro: { conservacao: Conservacao | ''; quais: Quais }): boolean {
  if (i.emOutraContagem) return false;
  if (filtro.conservacao && i.conservacao !== filtro.conservacao) return false;
  if (filtro.quais === 'todos') return true;
  if (filtro.quais === 'A') return i.classe === 'A';
  return PARA_CONTAR.has(i.situacao);
}

// ================================================================ prazo e estado

/**
 * Prazo de uma contagem cíclica: fim do dia SEGUINTE no Rio (23:59:59,999,
 * UTC−3). Passou sem aplicar = fecha sozinha sem mexer no estoque (contagem
 * velha não se aplica como se fosse de agora).
 */
export function prazoDoCiclo(hoje: string): Date {
  return new Date(paraData(somarDias(hoje, 2)).getTime() + 3 * 3_600_000 - 1);
}

export type EstadoDaContagem = 'EM_CONTAGEM' | 'PRONTA' | 'VENCIDA' | 'APLICADA' | 'APLICADA_SOZINHA' | 'DESCARTADA';

export const ROTULO_DA_CONTAGEM: Record<EstadoDaContagem, string> = {
  EM_CONTAGEM: 'Em contagem',
  PRONTA: 'Pronta para conferir',
  VENCIDA: 'Fechou sem aplicar',
  APLICADA: 'Aplicada',
  APLICADA_SOZINHA: 'Fechou sozinha',
  DESCARTADA: 'Descartada',
};

/** Estado de uma contagem (aberta e vencida = "fechou sem aplicar", mesmo antes de alguém gravar isso). */
export function estadoDaContagem(
  c: { status: 'ABERTA' | 'FECHADA' | 'CANCELADA'; desfecho: 'APLICADA' | 'APLICADA_SOZINHA' | 'VENCIDA' | null; fechaAutomaticoEm: Date | null },
  naoContados: number,
  agora: Date,
): EstadoDaContagem {
  if (c.status === 'CANCELADA') return 'DESCARTADA';
  if (c.status === 'FECHADA') return c.desfecho === 'VENCIDA' ? 'VENCIDA' : c.desfecho === 'APLICADA_SOZINHA' ? 'APLICADA_SOZINHA' : 'APLICADA';
  if (c.fechaAutomaticoEm && c.fechaAutomaticoEm.getTime() < agora.getTime()) return 'VENCIDA';
  return naoContados === 0 ? 'PRONTA' : 'EM_CONTAGEM';
}

// ================================================================ divergência e ajuste

export interface Divergencia {
  contado: boolean;
  /** contado − esperado (esperado = saldo do livro quando o item foi contado). */
  diferencaMilesimos: number;
  /** A diferença pelo custo de referência de agora; null = sem preço (pendente). */
  valorCentavos: number | null;
  /** O que entrou/saiu do item DEPOIS que ele foi contado (atual − esperado). */
  mudouDepoisMilesimos: number;
  /** Saldo depois de aplicar: atual + diferença. */
  ficaEmMilesimos: number;
  dentroDaTolerancia: boolean;
}

/**
 * Divergência de um item. Nunca "saldo = contado": a diferença é contra o
 * esperado do momento da contagem e se soma ao saldo de agora — a nota que
 * entrou depois de contar continua no estoque. Dentro da tolerância = bateu
 * exato, ou a diferença em R$ cabe na tolerância (sem preço só se bater).
 */
export function divergenciaDoItem(
  i: { contadoMilesimos: number | null; esperadoMilesimos: number; atualMilesimos: number },
  porUnidade: Fracao | null,
  toleranciaCentavos: number,
): Divergencia {
  const mudouDepoisMilesimos = i.atualMilesimos - i.esperadoMilesimos;
  if (i.contadoMilesimos === null) {
    return { contado: false, diferencaMilesimos: 0, valorCentavos: 0, mudouDepoisMilesimos, ficaEmMilesimos: i.atualMilesimos, dentroDaTolerancia: true };
  }
  const diferencaMilesimos = i.contadoMilesimos - i.esperadoMilesimos;
  const valorCentavos = valorDaQuantidade(porUnidade, diferencaMilesimos);
  const dentroDaTolerancia = diferencaMilesimos === 0 || (valorCentavos !== null && Math.abs(valorCentavos) <= toleranciaCentavos);
  return { contado: true, diferencaMilesimos, valorCentavos, mudouDepoisMilesimos, ficaEmMilesimos: i.atualMilesimos + diferencaMilesimos, dentroDaTolerancia };
}

/**
 * Fecha sozinha? Todos contados, todos dentro da tolerância e nada mexeu em
 * nenhum item depois de contado (nota entrando no meio pede um olho humano:
 * a mercadoria estava ou não na prateleira?). Lista vazia não fecha.
 */
export function fechaSozinha(divergencias: readonly Divergencia[]): boolean {
  return divergencias.length > 0 && divergencias.every((d) => d.contado && d.dentroDaTolerancia && d.mudouDepoisMilesimos === 0);
}

/** Os movimentos CONTAGEM (±) de uma contagem: um por item contado com diferença, chave única por item. */
export function ajustesDaContagem(
  lojaId: string,
  itens: readonly { id: string; insumoId: string; nome: string; unidade: Unidade; contadoMilesimos: number | null; esperadoMilesimos: number }[],
  custos: ReadonlyMap<string, Fracao | null>,
  motivo: string,
): MovimentoNovo[] {
  return itens
    .filter((i) => i.contadoMilesimos !== null && i.contadoMilesimos !== i.esperadoMilesimos)
    .map((i) => {
      const q = i.contadoMilesimos! - i.esperadoMilesimos;
      return {
        lojaId,
        insumoId: i.insumoId,
        tipo: 'CONTAGEM' as const,
        quantidadeMilesimos: q,
        valorCentavos: valorDaQuantidade(custos.get(i.insumoId) ?? null, q) ?? 0,
        // N.1: a referência é só para sobra sem base na loja; sem ela, o custo é desconhecido (não zero).
        semCusto: !custos.get(i.insumoId),
        insumoNome: i.nome,
        unidade: i.unidade,
        motivo,
        chave: `contagem:${i.id}`,
        contagemItemId: i.id,
      };
    });
}

/** Somas da conferência: o que sobra e o que falta, em R$ (sem preço fica de fora e é contado à parte). */
export function somaDasDivergencias(ds: readonly Divergencia[]): { sobraCentavos: number; faltaCentavos: number; comDiferenca: number; semPreco: number; foraDaTolerancia: number } {
  let sobraCentavos = 0;
  let faltaCentavos = 0;
  let comDiferenca = 0;
  let semPreco = 0;
  let foraDaTolerancia = 0;
  for (const d of ds) {
    if (!d.contado || d.diferencaMilesimos === 0) continue;
    comDiferenca++;
    if (!d.dentroDaTolerancia) foraDaTolerancia++;
    if (d.valorCentavos === null) semPreco++;
    else if (d.valorCentavos > 0) sobraCentavos += d.valorCentavos;
    else faltaCentavos += -d.valorCentavos;
  }
  return { sobraCentavos, faltaCentavos, comDiferenca, semPreco, foraDaTolerancia };
}

// ================================================================ cobertura do período e piso

export interface ItemDaCobertura {
  insumoId: string;
  /** Valor do saldo de agora pelo custo de referência (null = sem preço; negativo conta como zero). */
  valorCentavos: number | null;
  contadoNoPeriodo: boolean;
}

export interface Cobertura {
  itens: { contados: number; total: number; bp: number };
  valor: { contadoCentavos: number; totalCentavos: number; bp: number };
  semPreco: number;
  atingeValor: boolean;
  atingeItens: boolean;
  atinge: boolean;
  /** O menor conjunto (do maior valor para o menor) que, contado, leva ao piso. */
  paraOPiso: string[];
}

const bpDe = (parte: number, total: number) => (total <= 0 ? 10_000 : Math.floor((parte * 10_000) / total));
const atingiu = (parte: number, total: number, pisoBp: number) => total <= 0 || parte * 10_000 >= total * pisoBp;

/**
 * Cobertura do período: quantos insumos (e quanto do valor) tiveram
 * contagem APLICADA no período, sobre o universo da loja (saldo ≠ 0 agora ∪
 * contados no período). Atinge o piso quando as DUAS medidas chegam lá. O
 * que falta: os não contados de maior valor primeiro, até as duas fecharem.
 */
export function coberturaDoPeriodo(itens: readonly ItemDaCobertura[], r: Pick<RegrasDaContagem, 'pisoValorBp' | 'pisoItensBp'>): Cobertura {
  const v = (i: ItemDaCobertura) => (i.valorCentavos === null ? 0 : Math.max(0, i.valorCentavos));
  const total = itens.length;
  let contados = 0;
  let totalCentavos = 0;
  let contadoCentavos = 0;
  let semPreco = 0;
  for (const i of itens) {
    totalCentavos += v(i);
    if (i.valorCentavos === null) semPreco++;
    if (i.contadoNoPeriodo) {
      contados++;
      contadoCentavos += v(i);
    }
  }
  const atingeValor = atingiu(contadoCentavos, totalCentavos, r.pisoValorBp);
  const atingeItens = atingiu(contados, total, r.pisoItensBp);
  const paraOPiso: string[] = [];
  let c = contados;
  let cc = contadoCentavos;
  const faltam = itens.filter((i) => !i.contadoNoPeriodo).sort((x, y) => v(y) - v(x) || (x.insumoId < y.insumoId ? -1 : 1));
  for (const i of faltam) {
    if (atingiu(cc, totalCentavos, r.pisoValorBp) && atingiu(c, total, r.pisoItensBp)) break;
    paraOPiso.push(i.insumoId);
    c++;
    cc += v(i);
  }
  return {
    itens: { contados, total, bp: bpDe(contados, total) },
    valor: { contadoCentavos, totalCentavos, bp: bpDe(contadoCentavos, totalCentavos) },
    semPreco,
    atingeValor,
    atingeItens,
    atinge: atingeValor && atingeItens,
    paraOPiso,
  };
}

/** "Contado 62 % do valor (piso 80 %) e 40 % dos insumos (piso 50 %)." */
export function fraseDaCobertura(c: Cobertura, r: Pick<RegrasDaContagem, 'pisoValorBp' | 'pisoItensBp'>): string {
  return `${porcento(c.valor.bp)} do valor (piso ${porcento(r.pisoValorBp)}) e ${porcento(c.itens.bp)} dos insumos (piso ${porcento(r.pisoItensBp)})`;
}

/** A frase da recusa de fechar abaixo do piso. */
export function fraseAbaixoDoPiso(c: Cobertura, r: Pick<RegrasDaContagem, 'pisoValorBp' | 'pisoItensBp'>): string {
  const falta = c.paraOPiso.length;
  return `O período não fecha abaixo do piso: com esta contagem, a cobertura fica em ${fraseDaCobertura(c, r)}. Conte mais ${falta} ${falta === 1 ? 'insumo' : 'insumos'} (os de maior valor estão marcados “para o piso”); nada foi gravado.`;
}

/** "R$ 12,40 sobrando" / "R$ 3,10 faltando". */
export function textoDoValorDaDiferenca(valor: number | null): string {
  // Herança da 1.7: curto (a cor de atenção já diz "confira").
  if (valor === null) return 'sem preço';
  if (valor === 0) return 'R$ 0,00';
  return valor > 0 ? `${formatarDinheiro(valor)} a mais` : `${formatarDinheiro(-valor)} a menos`;
}
