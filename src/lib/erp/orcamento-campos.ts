/**
 * Orçamento de compra ao vivo (2.5) — a CONTA, pura (sem banco e sem Next).
 *
 * A pergunta do comprador: "quanto ainda posso comprar neste período sem furar o CMV meta?".
 *
 *   teto  = meta do CMV × receita prevista do período       (decisão 208)
 *   cabe  = teto − já comprado no período                   (negativo = passou)
 *
 *  - "Já comprado" é o CMV de compra do período INTEIRO (notas LANÇADAS, valor + frete rateado, pela data da nota), a
 *    mesma soma do DRE (2.3), só que até o fim do período: a nota de hoje já conta.
 *  - A receita prevista (decisão 209) é POR LOJA: o que a loja vendeu nos dias do período com faturamento completo (cada
 *    canal que ela vende lançado, a regra da 2.1 e da decisão 207), mais cada dia que falta (hoje até o fim) e cada dia
 *    sem lançamento completo pela MÉDIA DO MESMO DIA DA SEMANA nas últimas 4 semanas completas da loja. Dia sem
 *    lançamento nunca vale zero (receita a menos = orçamento a menos, e o número mentiria igual).
 *  - Sem faturamento suficiente (menos de 14 dias completos nas últimas 4 semanas) ou sem meta do CMV: SEM NÚMERO, com o
 *    motivo escrito. Nunca R$ 0,00 no lugar de dado ausente.
 *  - Cobertura POR LOJA (herança da 2.4): a rede só tem número quando CADA loja ativa tem; somar primeiro esconde o
 *    buraco de uma loja atrás da outra.
 *  - O farol (o "ritmo das compras") é o da 2.4, na escala de custo: o CMV pelas compras ATÉ ONTEM contra a meta, sobre a
 *    receita até ontem. Sem cor quando falta faturamento em algum dia do período de alguma loja do escopo, ou quando uma
 *    loja que vendeu não tem nota (a mesma regra do DRE: o CMV de uma loja dividido pela receita de todas sai baixo).
 *  - É AVISO, nunca bloqueio: a nota que passa do orçamento entra igual; a tela só diz quanto passou.
 *
 * Quem não vê a receita (sem `dre.ver` na loja) recebe só o "cabe" ARREDONDADO a R$ 100 para o lado prudente (para baixo
 * quando cabe, para cima quando passou), sem receita, meta, teto, percentual ou farol (decisão 210). A prévia da nota
 * dessa pessoa também parte do número arredondado: digitar notas de valores diferentes não revela o centavo.
 */

import { CODIGO } from './dre-plano';
import { dividirExato, percentualDaReceita, textoDosPontos } from './dre-campos';
import { canaisEmFalta, diaDaSemana } from './faturamento-campos';
import type { CanalVenda } from './canal-campos';
import { faixaDoDesvio, rotuloDoFarol } from './farol-campos';
import { MOTIVO_FALTA_FATURAMENTO, type FarolDaLinha } from './farol-dre-campos';
import { diasEntre, somarDias } from './contagem-campos';
import { formatarDinheiro } from './unidades';

/** A janela da média: as últimas 4 semanas antes de hoje (4 amostras de cada dia da semana). */
export const DIAS_DA_JANELA = 28;
/** Menos que isso de dias completos na janela, a média não diz nada: sem número. */
export const MINIMO_DE_DIAS_COMPLETOS = 14;
/** Quem não vê a receita recebe o "cabe" em degraus de R$ 100. */
export const DEGRAU_SEM_RECEITA = 10_000;
/** A chave da meta do CMV no plano. */
export const CHAVE_DA_META = CODIGO.cmv;

export const MOTIVO_SEM_META = 'falta a meta do CMV';
export const MOTIVO_LOJA_SEM_NOTA = (nome: string) => `sem nota de compra de ${nome} até ontem`;

// ================================================================ a entrada

export interface GraoDoOrcamento {
  data: string;
  canal: CanalVenda;
  valorCentavos: number;
}

export interface LojaDoOrcamento {
  lojaId: string;
  nome: string;
  /** Os canais em que a loja vende (configuração de hoje): o dia só é completo com todos lançados. */
  canais: readonly CanalVenda[];
  /** O primeiro dia em que a loja lançou faturamento (qualquer data); nulo = nunca lançou. */
  primeiroLancamento: string | null;
  /** Os grãos da leitura única do faturamento, de `inicioDaLeitura` até ontem. */
  graos: readonly GraoDoOrcamento[];
  /** Notas lançadas com data no período (o período inteiro). */
  compradoCentavos: number;
  /** Notas lançadas com data do início do período até ontem (o ritmo, igual ao CMV de compra do DRE). */
  compradoAteOntemCentavos: number;
}

export interface PeriodoDoOrcamento {
  inicio: string;
  fim: string;
  nome: string;
}

/** O primeiro dia que a leitura precisa: o começo do período ou o da janela, o que vier antes. */
export function inicioDaLeitura(periodo: Pick<PeriodoDoOrcamento, 'inicio'>, hoje: string): string {
  const janela = somarDias(hoje, -DIAS_DA_JANELA);
  return periodo.inicio < janela ? periodo.inicio : janela;
}

// ================================================================ a receita prevista de uma loja

export interface PrevisaoDaLoja {
  /** Vendido nos dias do período (até ontem) com faturamento completo. */
  realizadoCentavos: number;
  /** Os dias que faltam e os dias sem lançamento completo, pela média do mesmo dia da semana. */
  projetadoCentavos: number;
  previstaCentavos: number;
  /** Dias do período até ontem com faturamento completo. */
  diasCompletos: number;
  /** Dias do período até ontem sem faturamento completo (entraram pela média). */
  diasSemLancamento: number;
  /** Hoje até o fim do período. */
  diasRestantes: number;
  /** Dias completos na janela das últimas 4 semanas. */
  diasNaJanela: number;
}

export type ResultadoDaPrevisao = { ok: true; previsao: PrevisaoDaLoja } | { ok: false; motivo: string; diasNaJanela: number };

/** Os dias de `de` a `ate`, inclusive (vazio se `ate` < `de`). */
function dias(de: string, ate: string): string[] {
  const out: string[] = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) out.push(d);
  return out;
}

/**
 * A receita prevista de uma loja no período. Um dia é COMPLETO quando a loja já lançava (a partir do primeiro lançamento)
 * e cada canal que ela vende tem lançamento ("Não vendeu" é lançamento). O dia incompleto não vale zero: entra pela média.
 * A média é do mesmo dia da semana nos dias completos das últimas 4 semanas; um dia da semana sem amostra usa a média geral
 * da janela. Um arredondamento por dia da semana (até 7, menos de 4 centavos no total).
 */
export function preverReceita(loja: LojaDoOrcamento, periodo: Pick<PeriodoDoOrcamento, 'inicio' | 'fim'>, hoje: string): ResultadoDaPrevisao {
  const ontem = somarDias(hoje, -1);
  const porDia = new Map<string, { centavos: number; canais: Set<CanalVenda> }>();
  for (const g of loja.graos) {
    const d = porDia.get(g.data) ?? { centavos: 0, canais: new Set<CanalVenda>() };
    d.centavos += g.valorCentavos;
    d.canais.add(g.canal);
    porDia.set(g.data, d);
  }
  const completo = (d: string) => {
    if (!loja.primeiroLancamento || d < loja.primeiroLancamento || d >= hoje) return false;
    return canaisEmFalta(d, hoje, loja.primeiroLancamento, loja.canais, porDia.get(d)?.canais ?? new Set()).length === 0;
  };
  const valor = (d: string) => porDia.get(d)?.centavos ?? 0;

  // ---- a janela: as últimas 4 semanas
  const somaPorDia = [0, 0, 0, 0, 0, 0, 0];
  const nPorDia = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dias(somarDias(hoje, -DIAS_DA_JANELA), ontem)) {
    if (!completo(d)) continue;
    somaPorDia[diaDaSemana(d)] += valor(d);
    nPorDia[diaDaSemana(d)] += 1;
  }
  const diasNaJanela = nPorDia.reduce((s, n) => s + n, 0);
  if (diasNaJanela < MINIMO_DE_DIAS_COMPLETOS) {
    return {
      ok: false,
      diasNaJanela,
      motivo:
        diasNaJanela === 0
          ? 'sem faturamento lançado nas últimas 4 semanas'
          : `poucos dias com faturamento completo nas últimas 4 semanas: ${diasNaJanela} de ${MINIMO_DE_DIAS_COMPLETOS} necessários`,
    };
  }

  // ---- o período: o realizado e os dias a projetar, por dia da semana
  const apurados = periodo.inicio <= ontem ? dias(periodo.inicio, ontem < periodo.fim ? ontem : periodo.fim) : [];
  let realizado = 0;
  let diasCompletos = 0;
  const aProjetar = [0, 0, 0, 0, 0, 0, 0];
  for (const d of apurados) {
    if (completo(d)) {
      realizado += valor(d);
      diasCompletos += 1;
    } else aProjetar[diaDaSemana(d)] += 1;
  }
  const diasSemLancamento = apurados.length - diasCompletos;
  const restantes = hoje <= periodo.fim ? dias(hoje > periodo.inicio ? hoje : periodo.inicio, periodo.fim) : [];
  for (const d of restantes) aProjetar[diaDaSemana(d)] += 1;

  const somaGeral = somaPorDia.reduce((s, v) => s + v, 0);
  let projetado = 0;
  for (let w = 0; w < 7; w++) {
    if (aProjetar[w] === 0) continue;
    projetado +=
      nPorDia[w] > 0
        ? dividirExato(BigInt(somaPorDia[w]) * BigInt(aProjetar[w]), BigInt(nPorDia[w]))
        : dividirExato(BigInt(somaGeral) * BigInt(aProjetar[w]), BigInt(diasNaJanela));
  }
  return {
    ok: true,
    previsao: {
      realizadoCentavos: realizado,
      projetadoCentavos: projetado,
      previstaCentavos: realizado + projetado,
      diasCompletos,
      diasSemLancamento,
      diasRestantes: restantes.length,
      diasNaJanela,
    },
  };
}

// ================================================================ o orçamento

export interface ContaDoOrcamento {
  previstaCentavos: number;
  metaBp: number;
  tetoCentavos: number;
  compradoCentavos: number;
  /** teto − comprado; negativo = passou. */
  saldoCentavos: number;
}

export interface OrcamentoDaLoja {
  lojaId: string;
  nome: string;
  compradoCentavos: number;
  /** Nulo = sem número (o motivo diz por quê). */
  conta: ContaDoOrcamento | null;
  motivo: string | null;
  previsao: PrevisaoDaLoja | null;
  /** O ritmo das compras até ontem contra a meta (o farol da 2.4). */
  ritmo: FarolDaLinha | null;
  /** O CMV pelas compras até ontem, em pontos-base da receita até ontem; nulo sem receita ou sem dado completo. */
  cmvAteOntemBp: number | null;
  /** Receita dos dias do período até ontem (todos completos, senão nulo). */
  receitaAteOntemCentavos: number | null;
  compradoAteOntemCentavos: number;
}

export interface OrcamentoDoEscopo {
  conta: ContaDoOrcamento | null;
  motivo: string | null;
  ritmo: FarolDaLinha | null;
  cmvAteOntemBp: number | null;
  /** Lojas do escopo com dias do período sem lançamento completo (entraram pela média). */
  diasSemLancamento: number;
}

/** teto = meta × prevista ÷ 10.000, um arredondamento. */
export const tetoDe = (previstaCentavos: number, metaBp: number) => dividirExato(BigInt(previstaCentavos) * BigInt(metaBp), 10_000n);

function contaDe(previstaCentavos: number, metaBp: number, compradoCentavos: number): ContaDoOrcamento {
  const teto = tetoDe(previstaCentavos, metaBp);
  return { previstaCentavos, metaBp, tetoCentavos: teto, compradoCentavos, saldoCentavos: teto - compradoCentavos };
}

/**
 * O ritmo das compras: CMV pelas compras até ontem (pontos da receita até ontem) menos a meta, na escala de custo
 * (menos é melhor). Sem cor quando o dado não fecha; o desvio vem em texto quando existe.
 */
export function ritmoDasCompras(p: {
  metaBp: number | null;
  /** Receita até ontem; nulo = algum dia do período sem lançamento completo em alguma loja do escopo. */
  receitaAteOntemCentavos: number | null;
  compradoAteOntemCentavos: number;
  /** Lojas que venderam até ontem e não têm nota até ontem (num escopo de várias, o CMV sai baixo). */
  lojasSemNota: readonly string[];
}): { farol: FarolDaLinha | null; cmvBp: number | null } {
  if (p.metaBp === null) return { farol: null, cmvBp: null };
  if (p.receitaAteOntemCentavos === null) return { farol: { tipo: 'sem', motivo: MOTIVO_FALTA_FATURAMENTO, desvioTexto: null }, cmvBp: null };
  const cmvBp = percentualDaReceita(p.compradoAteOntemCentavos, p.receitaAteOntemCentavos);
  if (cmvBp === null) return { farol: { tipo: 'sem', motivo: 'sem faturamento até ontem', desvioTexto: null }, cmvBp: null };
  const desvio = cmvBp - p.metaBp;
  const desvioTexto = textoDosPontos(desvio);
  if (p.lojasSemNota.length > 0) return { farol: { tipo: 'sem', motivo: MOTIVO_LOJA_SEM_NOTA(p.lojasSemNota.join(' e ')), desvioTexto }, cmvBp };
  const f = faixaDoDesvio('MENOR_MELHOR', desvio, 'custo');
  return { farol: { tipo: 'cor', escala: 'custo', cor: f.cor, posicao: f.posicao, palavra: f.palavra, confira: f.confira, desvioTexto, rotulo: rotuloDoFarol(f, desvioTexto) }, cmvBp };
}

/** O orçamento de uma loja no período em curso. `metaBp` nula = sem meta do CMV. */
export function orcamentoDaLoja(loja: LojaDoOrcamento, periodo: PeriodoDoOrcamento, hoje: string, metaBp: number | null): OrcamentoDaLoja {
  const prev = preverReceita(loja, periodo, hoje);
  const previsao = prev.ok ? prev.previsao : null;
  const completoAteOntem = previsao !== null && previsao.diasSemLancamento === 0;
  const receitaAteOntem = completoAteOntem ? previsao!.realizadoCentavos : null;
  const semNota = receitaAteOntem !== null && receitaAteOntem > 0 && loja.compradoAteOntemCentavos === 0 ? [loja.nome] : [];
  const { farol, cmvBp } = ritmoDasCompras({ metaBp, receitaAteOntemCentavos: receitaAteOntem, compradoAteOntemCentavos: loja.compradoAteOntemCentavos, lojasSemNota: semNota });
  const base = { lojaId: loja.lojaId, nome: loja.nome, compradoCentavos: loja.compradoCentavos, previsao, ritmo: farol, cmvAteOntemBp: cmvBp, receitaAteOntemCentavos: receitaAteOntem, compradoAteOntemCentavos: loja.compradoAteOntemCentavos };
  if (metaBp === null) return { ...base, conta: null, motivo: MOTIVO_SEM_META };
  if (!prev.ok) return { ...base, conta: null, motivo: prev.motivo };
  return { ...base, conta: contaDe(prev.previsao.previstaCentavos, metaBp, loja.compradoCentavos), motivo: null };
}

/**
 * O orçamento de várias lojas (a rede, ou as lojas de um gerente). Cobertura POR LOJA: uma loja sem número deixa o escopo
 * sem número, com o nome dela. O ritmo do escopo só tem cor quando cada loja tem o período completo até ontem e cada loja
 * que vendeu tem nota.
 */
export function orcamentoDoEscopo(lojas: readonly OrcamentoDaLoja[], metaBp: number | null): OrcamentoDoEscopo {
  const diasSemLancamento = lojas.reduce((s, l) => s + (l.previsao?.diasSemLancamento ?? 0), 0);
  const semNumero = lojas.filter((l) => l.conta === null);
  const algumaIncompleta = lojas.some((l) => l.receitaAteOntemCentavos === null);
  const receita = algumaIncompleta ? null : lojas.reduce((s, l) => s + (l.receitaAteOntemCentavos ?? 0), 0);
  const ateOntem = lojas.reduce((s, l) => s + l.compradoAteOntemCentavos, 0);
  const semNota = lojas.filter((l) => (l.receitaAteOntemCentavos ?? 0) > 0 && l.compradoAteOntemCentavos === 0).map((l) => l.nome);
  const { farol, cmvBp } = ritmoDasCompras({ metaBp, receitaAteOntemCentavos: lojas.length === 0 ? null : receita, compradoAteOntemCentavos: ateOntem, lojasSemNota: semNota });
  if (metaBp === null) return { conta: null, motivo: MOTIVO_SEM_META, ritmo: farol, cmvAteOntemBp: cmvBp, diasSemLancamento };
  if (lojas.length === 0) return { conta: null, motivo: 'nenhuma loja ativa', ritmo: null, cmvAteOntemBp: null, diasSemLancamento };
  if (semNumero.length > 0) {
    return { conta: null, motivo: `sem o orçamento de ${semNumero.map((l) => l.nome).join(' e ')}`, ritmo: farol, cmvAteOntemBp: cmvBp, diasSemLancamento };
  }
  const prevista = lojas.reduce((s, l) => s + l.conta!.previstaCentavos, 0);
  const comprado = lojas.reduce((s, l) => s + l.compradoCentavos, 0);
  return { conta: contaDe(prevista, metaBp, comprado), motivo: null, ritmo: farol, cmvAteOntemBp: cmvBp, diasSemLancamento };
}

// ================================================================ quem não vê a receita

/**
 * O "cabe" de quem não vê a receita, em degraus de R$ 100, para o lado prudente: o que cabe arredonda para BAIXO,
 * o que passou arredonda para CIMA (R$ 0,01 passado vira "passou R$ 100,00"). Zero cabe = "menos de R$ 100,00".
 */
export function saldoArredondado(saldoCentavos: number): number {
  if (saldoCentavos >= 0) return Math.floor(saldoCentavos / DEGRAU_SEM_RECEITA) * DEGRAU_SEM_RECEITA;
  return -Math.ceil(-saldoCentavos / DEGRAU_SEM_RECEITA) * DEGRAU_SEM_RECEITA;
}

/** A frase do saldo: "cabe R$ 4.300,00" / "passou R$ 200,00" / "cabe menos de R$ 100,00" (só no arredondado). */
export function fraseDoSaldo(saldoCentavos: number, arredondado: boolean): string {
  if (saldoCentavos < 0) return `passou ${formatarDinheiro(-saldoCentavos)}`;
  if (arredondado && saldoCentavos < DEGRAU_SEM_RECEITA) return `cabe menos de ${formatarDinheiro(DEGRAU_SEM_RECEITA)}`;
  return `cabe ${formatarDinheiro(saldoCentavos)}`;
}

// ================================================================ a nota (prévia e depois de lançar)

export interface ImpactoDaNota {
  /** O saldo sem esta nota (exato para quem vê a receita; arredondado para quem não vê). */
  antesCentavos: number;
  /** O saldo com esta nota. */
  depoisCentavos: number;
  /** A nota faz o orçamento passar (ou passar mais). */
  passa: boolean;
  arredondado: boolean;
}

/**
 * O que uma nota faz no orçamento da loja. `saldoSemEstaCentavos` é o saldo de agora SEM a nota (na edição, a versão
 * gravada dela já saiu do "já comprado"). Para quem não vê a receita, a conta parte do saldo arredondado.
 */
export function impactoDaNota(saldoSemEstaCentavos: number, notaCentavos: number, veReceita: boolean): ImpactoDaNota {
  const antes = veReceita ? saldoSemEstaCentavos : saldoArredondado(saldoSemEstaCentavos);
  const depois = antes - notaCentavos;
  return { antesCentavos: antes, depoisCentavos: depois, passa: depois < 0, arredondado: !veReceita };
}

/** "dia 21 de 31" do período em curso. */
export function diaDoPeriodo(periodo: Pick<PeriodoDoOrcamento, 'inicio' | 'fim'>, hoje: string): { dia: number; de: number } {
  return { dia: diasEntre(periodo.inicio, hoje) + 1, de: diasEntre(periodo.inicio, periodo.fim) + 1 };
}
