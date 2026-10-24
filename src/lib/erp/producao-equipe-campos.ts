/**
 * A cozinha pega a tarefa (3.3) — regras PURAS, sem banco e sem Next: quem está com o lote (as frases da tela da cozinha),
 * o período e os filtros do histórico da produção, o desfecho de cada lote encerrado, o tempo de produção e os
 * indicadores por pessoa, sempre com a amostra. As telas e `producao-equipe.ts` usam as mesmas funções.
 *
 * Princípios (decisões 231 a 240):
 * - quem fez o lote é quem o PEGOU (ou para quem a gerência passou); sem pegar (lote da 3.1, ou concluído direto), quem
 *   concluiu. A FlowFoods (nível 1) nunca é "quem fez";
 * - sem dado = frase, nunca zero: lote sem hora de pegar não tem tempo; pessoa sem lote concluído não tem rendimento;
 * - indicador é HIPÓTESE a validar com a casa: sem nota, sem ranking (a ordem é alfabética), sempre com o período e a
 *   amostra; menos de 5 lotes é "amostra pequena";
 * - quantidade em milésimos e rendimento em pontos-base, inteiros; R$ não entra nos indicadores.
 */

import { diasEntre, somarDias } from './contagem-campos';
import { formatarData, hojeNoRio } from './compra-campos';
import { formatarRendimento, rendimentoDoLote } from './producao-campos';
import { formatarQuantidade, type Unidade } from './unidades';

// ================================================================ quem está com o lote

const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const DIA_HORA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/** "09:12" (hoje) ou "20/10 às 09:12" (outro dia). */
export function horaDoDia(d: Date, hoje: string): string {
  return hojeNoRio(d) === hoje ? HORA.format(d) : DIA_HORA.format(d).replace(',', ' às');
}

/** "às 09:12" (hoje) ou "em 20/10 às 09:12". */
function desdeQuando(desde: Date, hoje: string): string {
  const quando = horaDoDia(desde, hoje);
  return quando.includes(' às ') ? `em ${quando}` : `às ${quando}`;
}

/**
 * "Caio Cozinha pegou às 09:12" / "… pegou em 20/10 às 09:12"; o lote que a gerência passou: "Duda Lima recebeu às 18:14
 * (passado por Gil Gerente)" — quem recebeu não pegou (polimento da 3.3).
 */
export function fraseDeQuemPegou(nome: string, desde: Date, hoje: string, passadoPor: string | null = null): string {
  return passadoPor ? `${nome} recebeu ${desdeQuando(desde, hoje)} (passado por ${passadoPor})` : `${nome} pegou ${desdeQuando(desde, hoje)}`;
}

/** O "desde quando" curto do cartão: "pegou 09:12" ou "recebeu 18:14 (passado por Gil Gerente)". */
export function quandoPegou(desde: Date, hoje: string, passadoPor: string | null): string {
  return passadoPor ? `recebeu ${horaDoDia(desde, hoje)} (passado por ${passadoPor})` : `pegou ${horaDoDia(desde, hoje)}`;
}

/** A recusa de quem tenta pegar (ou concluir, ou cancelar) o lote que está com outra pessoa. */
export function fraseDoLoteComOutro(nome: string, desde: Date, hoje: string, acao: 'pegar' | 'concluir' | 'cancelar'): string {
  const base = `Este lote está com ${nome} (pegou ${desdeQuando(desde, hoje)}).`;
  if (acao === 'pegar') return `${base} Se for para você fazer, peça para a gerência passar o lote para você.`;
  return `${base} Só ${nome} ou a gerência ${acao === 'concluir' ? 'conclui' : 'cancela'}. Se for para você terminar, peça para a gerência passar o lote para você.`;
}

/** O motivo de soltar ou passar o lote: 3 a 200 letras (o mesmo de cancelar). */
export const MOTIVO_DE_SOLTAR = 'Diga o motivo (pelo menos 3 letras).';

// ================================================================ o período do histórico

export type AtalhoDoPeriodo = 'hoje' | '7' | '30';

export const ATALHOS_DO_PERIODO: readonly { chave: AtalhoDoPeriodo; rotulo: string }[] = [
  { chave: 'hoje', rotulo: 'Hoje' },
  { chave: '7', rotulo: '7 dias' },
  { chave: '30', rotulo: '30 dias' },
];

/** Até quantos dias de uma vez (um trimestre): o histórico e os indicadores leem tudo do período. */
export const MAIOR_PERIODO_DIAS = 92;

export interface PeriodoDoHistorico {
  de: string;
  ate: string;
  /** O atalho que o período é (para o segmentado marcar); null = de/até escolhidos. */
  atalho: AtalhoDoPeriodo | null;
  dias: number;
  /** O que foi ajustado no que a pessoa pediu (dia no futuro, período longo demais, datas trocadas). */
  aviso: string | null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const ehDia = (v: unknown): v is string => typeof v === 'string' && ISO.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`)) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;

function doAtalho(a: AtalhoDoPeriodo, hoje: string): PeriodoDoHistorico {
  const dias = a === 'hoje' ? 1 : Number(a);
  return { de: somarDias(hoje, -(dias - 1)), ate: hoje, atalho: a, dias, aviso: null };
}

/**
 * O período pedido na URL: `?periodo=hoje|7|30` ou `?de=aaaa-mm-dd&ate=aaaa-mm-dd` (só `de` = aquele dia). Padrão: os
 * últimos 7 dias. O fim nunca passa de hoje; de/até trocados se invertem; mais de 92 dias encurta o começo (com o aviso).
 */
export function lerPeriodoDoHistorico(q: { periodo?: unknown; de?: unknown; ate?: unknown }, hoje: string): PeriodoDoHistorico {
  if (ehDia(q.de)) {
    let de = q.de;
    let ate = ehDia(q.ate) ? q.ate : q.de;
    const avisos: string[] = [];
    if (de > ate) [de, ate] = [ate, de];
    if (ate > hoje) {
      ate = hoje;
      avisos.push('não há produção no futuro: o período vai até hoje');
    }
    if (de > ate) de = ate;
    if (diasEntre(de, ate) + 1 > MAIOR_PERIODO_DIAS) {
      de = somarDias(ate, -(MAIOR_PERIODO_DIAS - 1));
      avisos.push(`no máximo ${MAIOR_PERIODO_DIAS} dias de uma vez: começa em ${formatarData(de)}`);
    }
    const atalho = ATALHOS_DO_PERIODO.find((a) => {
      const p = doAtalho(a.chave, hoje);
      return p.de === de && p.ate === ate;
    })?.chave ?? null;
    return { de, ate, atalho, dias: diasEntre(de, ate) + 1, aviso: avisos.length ? `${avisos.join('; ')}.`.replace(/^./, (c) => c.toUpperCase()) : null };
  }
  const atalho = ATALHOS_DO_PERIODO.find((a) => a.chave === q.periodo)?.chave ?? '7';
  return doAtalho(atalho, hoje);
}

/** "hoje, 21/10/2026" · "21/10/2026" · "de 15/10 a 21/10/2026 (7 dias)". */
export function rotuloDoPeriodo(p: Pick<PeriodoDoHistorico, 'de' | 'ate' | 'dias'>, hoje: string): string {
  if (p.de === p.ate) return p.de === hoje ? `hoje, ${formatarData(p.de)}` : formatarData(p.de);
  return `de ${formatarData(p.de, true)} a ${formatarData(p.ate)} (${p.dias} dias)`;
}

/** Id de pessoa ou de ficha vindo da URL (cuid, ou a chave de teste "u-caio"); fora disso, nenhum filtro. */
export function lerFiltroId(v: unknown): string | null {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null;
}

// ================================================================ o lote encerrado

export type DesfechoDoLote = 'CONCLUIDO' | 'PERDIDO' | 'ESTORNADO' | 'CANCELADO';

export const ROTULO_DO_DESFECHO: Record<DesfechoDoLote, string> = {
  CONCLUIDO: 'Concluído',
  PERDIDO: 'Perdido',
  ESTORNADO: 'Estornado',
  CANCELADO: 'Cancelado',
};

export interface LoteEncerrado {
  id: string;
  codigo: string;
  fichaId: string;
  fichaNome: string;
  unidade: Unidade;
  status: 'CONCLUIDA' | 'CANCELADA';
  planejadoMilesimos: number;
  produzidoMilesimos: number | null;
  /**
   * Quem fez, se é PESSOA DA EQUIPE: quem pegou (ou para quem a gerência passou) ou, sem pegar, quem concluiu. Null =
   * ninguém da equipe: cancelado antes de alguém pegar, ou concluído pela FlowFoods (o nível 1 nunca é "quem fez"; o lote
   * da 3.1 que ele concluiu tem o login dele gravado, e a leitura o tira — polimento da 3.3).
   */
  responsavel: { id: string; nome: string } | null;
  /** Desde quando estava com a pessoa (null = não pegou pelo ERP: lote da 3.1 ou concluído direto). */
  responsavelDesde: Date | null;
  /** Quando os insumos acabaram de sair pela requisição do lote. */
  insumosEntreguesEm: Date | null;
  iniciadaEm: Date | null;
  concluidaEm: Date | null;
  concluidaPorNome: string | null;
  canceladaEm: Date | null;
  canceladaPorNome: string | null;
  motivoCancelamento: string | null;
  motivoRendimento: string | null;
}

export function desfechoDoLote(l: Pick<LoteEncerrado, 'status' | 'concluidaEm' | 'produzidoMilesimos'>): DesfechoDoLote {
  if (l.status === 'CANCELADA') return l.concluidaEm ? 'ESTORNADO' : 'CANCELADO';
  return l.produzidoMilesimos === 0 ? 'PERDIDO' : 'CONCLUIDO';
}

/** O dia do lote no histórico (Rio): o da conclusão (o estornado também: foi produzido nesse dia); o do cancelamento, senão. */
export function diaDoEncerramento(l: Pick<LoteEncerrado, 'concluidaEm' | 'canceladaEm'>): string {
  return hojeNoRio((l.concluidaEm ?? l.canceladaEm)!);
}

/**
 * Tempo de produção do lote, em minutos: da hora em que a pessoa pegou — ou em que os insumos acabaram de sair, se foi
 * depois (a espera pelo estoque não conta contra a cozinha) — até a conclusão. Null = sem hora de pegar (lote da 3.1, ou
 * concluído sem pegar) ou não concluído. HIPÓTESE a validar com a casa (decisão 237).
 */
export function tempoDoLote(l: Pick<LoteEncerrado, 'concluidaEm' | 'responsavelDesde' | 'insumosEntreguesEm'>): number | null {
  if (!l.concluidaEm || !l.responsavelDesde) return null;
  const inicio = Math.max(l.responsavelDesde.getTime(), l.insumosEntreguesEm?.getTime() ?? 0);
  return Math.max(0, Math.round((l.concluidaEm.getTime() - inicio) / 60_000));
}

/** "menos de 1 min", "45 min", "1 h", "1 h 20 min". */
export function formatarTempo(min: number): string {
  if (min < 1) return 'menos de 1 min';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// ================================================================ resumo do histórico

export interface ResumoDoHistorico {
  total: number;
  concluidos: number;
  perdidos: number;
  estornados: number;
  cancelados: number;
}

export function resumoDoHistorico(lotes: readonly Pick<LoteEncerrado, 'status' | 'concluidaEm' | 'produzidoMilesimos'>[]): ResumoDoHistorico {
  const r: ResumoDoHistorico = { total: lotes.length, concluidos: 0, perdidos: 0, estornados: 0, cancelados: 0 };
  for (const l of lotes) {
    const d = desfechoDoLote(l);
    if (d === 'CONCLUIDO') r.concluidos++;
    else if (d === 'PERDIDO') r.perdidos++;
    else if (d === 'ESTORNADO') r.estornados++;
    else r.cancelados++;
  }
  return r;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** "12 lotes encerrados: 9 concluídos · 1 perdido · 2 cancelados"; nenhum = a frase do vazio. */
export function fraseDoResumo(r: ResumoDoHistorico): string {
  if (r.total === 0) return 'Nenhum lote encerrado neste período.';
  const partes = [
    r.concluidos ? plural(r.concluidos, 'concluído', 'concluídos') : null,
    r.perdidos ? plural(r.perdidos, 'perdido', 'perdidos') : null,
    r.estornados ? plural(r.estornados, 'estornado', 'estornados') : null,
    r.cancelados ? plural(r.cancelados, 'cancelado', 'cancelados') : null,
  ].filter(Boolean);
  return `${plural(r.total, 'lote encerrado', 'lotes encerrados')}: ${partes.join(' · ')}`;
}

/** O rendimento do lote encerrado em palavras: "92%", "lote perdido", "cancelado antes de produzir". */
export function fraseDoRendimentoDoLote(l: Pick<LoteEncerrado, 'status' | 'concluidaEm' | 'produzidoMilesimos' | 'planejadoMilesimos'>): string {
  const d = desfechoDoLote(l);
  if (d === 'CANCELADO') return 'cancelado antes de produzir';
  if (d === 'PERDIDO') return 'lote perdido';
  return formatarRendimento(rendimentoDoLote(l.planejadoMilesimos, l.produzidoMilesimos!).rendimentoBp);
}

// ================================================================ indicadores por pessoa

/** Menos lotes que isto na amostra é "amostra pequena": o número existe, mas ainda não diz muito (hipótese, decisão 237). */
export const AMOSTRA_PEQUENA = 5;

export interface ProduzidoPorFicha {
  fichaId: string;
  nome: string;
  unidade: Unidade;
  lotes: number;
  planejadoMilesimos: number;
  produzidoMilesimos: number;
  /** Soma produzida ÷ soma planejada (o lote grande pesa mais). */
  rendimentoBp: number;
}

export interface IndicadoresDaPessoa {
  id: string;
  nome: string;
  /** Concluídos com produção (sem os perdidos e os estornados). */
  concluidos: number;
  perdidos: number;
  estornados: number;
  /** Cancelados PELA PRÓPRIA pessoa enquanto estavam com ela (polimento da 3.3: só estes contam para ela). */
  cancelou: number;
  /** Cancelados pela gerência (ou pela FlowFoods) enquanto estavam com a pessoa: à parte, não contam para ela. */
  canceladosPelaGerencia: number;
  porFicha: ProduzidoPorFicha[];
  /** Média dos rendimentos dos concluídos (cada lote pesa igual); null sem concluído. */
  rendimentoMedioBp: number | null;
  /** Concluídos fora de ±10% do planejado (os perdidos contam à parte). */
  foraDaFaixa: number;
  /** Tempo médio de produção (só dos lotes com hora de pegar); null sem nenhum. */
  tempo: { mediaMin: number; amostra: number } | null;
  /** Concluídos + perdidos: é a amostra dos indicadores. */
  amostra: number;
  amostraPequena: boolean;
}

/**
 * Quanto saiu de cada ficha (por unidade) nos lotes CONCLUÍDOS com produção: soma produzida ÷ soma planejada (o lote grande pesa
 * mais). Os perdidos e os estornados não entram (aparecem à parte). Ordem alfabética.
 */
export function produzidoPorFicha(lotes: readonly LoteEncerrado[]): ProduzidoPorFicha[] {
  const porFichaMap = new Map<string, ProduzidoPorFicha>();
  for (const l of lotes) {
    if (desfechoDoLote(l) !== 'CONCLUIDO') continue;
    const k = `${l.fichaId}:${l.unidade}`;
    const f = porFichaMap.get(k) ?? { fichaId: l.fichaId, nome: l.fichaNome, unidade: l.unidade, lotes: 0, planejadoMilesimos: 0, produzidoMilesimos: 0, rendimentoBp: 0 };
    f.lotes++;
    f.planejadoMilesimos += l.planejadoMilesimos;
    f.produzidoMilesimos += l.produzidoMilesimos!;
    porFichaMap.set(k, f);
  }
  return Array.from(porFichaMap.values())
    .map((f) => ({ ...f, rendimentoBp: rendimentoDoLote(f.planejadoMilesimos, f.produzidoMilesimos).rendimentoBp }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.unidade.localeCompare(b.unidade));
}

/**
 * Os indicadores de cada pessoa nos lotes encerrados do período: lotes, quanto produziu de cada ficha, rendimento médio
 * contra o planejado pela ficha, fora da faixa, tempo médio, perdidos, cancelados por ela (os da gerência à parte) e
 * estornados. Ordem alfabética (nada de ranking). Fora das pessoas: `semPessoa` = cancelados antes de alguém pegar;
 * `daFlowFoods` = encerrados sem pessoa da equipe (concluídos pela FlowFoods — o nível 1 nunca é "quem fez").
 */
export function indicadoresPorPessoa(lotes: readonly LoteEncerrado[]): { pessoas: IndicadoresDaPessoa[]; semPessoa: number; daFlowFoods: number } {
  const grupos = new Map<string, { nome: string; lotes: LoteEncerrado[] }>();
  let semPessoa = 0;
  let daFlowFoods = 0;
  for (const l of lotes) {
    if (!l.responsavel) {
      if (desfechoDoLote(l) === 'CANCELADO') semPessoa++;
      else daFlowFoods++;
      continue;
    }
    const g = grupos.get(l.responsavel.id) ?? { nome: l.responsavel.nome, lotes: [] };
    g.lotes.push(l);
    grupos.set(l.responsavel.id, g);
  }
  const pessoas: IndicadoresDaPessoa[] = [];
  for (const [id, g] of Array.from(grupos.entries())) {
    // O nome mais recente (a pessoa pode ter mudado de nome no cadastro): o do lote encerrado por último.
    const nome = g.lotes.reduce((a, b) => (fimDe(b) > fimDe(a) ? b : a)).responsavel!.nome;
    const concluidos = g.lotes.filter((l) => desfechoDoLote(l) === 'CONCLUIDO');
    const perdidos = g.lotes.filter((l) => desfechoDoLote(l) === 'PERDIDO');
    const porFicha = produzidoPorFicha(concluidos);
    const rendimentos = concluidos.map((l) => rendimentoDoLote(l.planejadoMilesimos, l.produzidoMilesimos!));
    const tempos = [...concluidos, ...perdidos].map(tempoDoLote).filter((t): t is number => t !== null);
    const amostra = concluidos.length + perdidos.length;
    pessoas.push({
      id,
      nome,
      concluidos: concluidos.length,
      perdidos: perdidos.length,
      estornados: g.lotes.filter((l) => desfechoDoLote(l) === 'ESTORNADO').length,
      // Quem cancelou: a própria pessoa (o nome gravado no cancelamento é o dela) ou a gerência (só ela ou a gerência cancela
      // o lote com outra pessoa, decisão 235). O cancelamento da gerência não conta para a pessoa.
      cancelou: g.lotes.filter((l) => desfechoDoLote(l) === 'CANCELADO' && canceladoPelaPessoa(l)).length,
      canceladosPelaGerencia: g.lotes.filter((l) => desfechoDoLote(l) === 'CANCELADO' && !canceladoPelaPessoa(l)).length,
      porFicha,
      rendimentoMedioBp: rendimentos.length ? Math.round(rendimentos.reduce((s, r) => s + r.rendimentoBp, 0) / rendimentos.length) : null,
      foraDaFaixa: rendimentos.filter((r) => r.foraDaFaixa).length,
      tempo: tempos.length ? { mediaMin: Math.round(tempos.reduce((s, t) => s + t, 0) / tempos.length), amostra: tempos.length } : null,
      amostra,
      amostraPequena: amostra < AMOSTRA_PEQUENA,
    });
  }
  pessoas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.id.localeCompare(b.id));
  return { pessoas, semPessoa, daFlowFoods };
}

/** O lote cancelado foi cancelado pela pessoa que estava com ele (e não pela gerência)? */
export function canceladoPelaPessoa(l: Pick<LoteEncerrado, 'responsavel' | 'canceladaPorNome'>): boolean {
  return !!l.responsavel && !!l.canceladaPorNome && l.canceladaPorNome === l.responsavel.nome;
}

const fimDe = (l: Pick<LoteEncerrado, 'concluidaEm' | 'canceladaEm'>) => (l.canceladaEm ?? l.concluidaEm ?? new Date(0)).getTime();

/** "12 lotes" · "3 lotes: amostra pequena, ainda não diz muito" · "nenhum lote concluído no período". */
export function fraseDaAmostra(n: number): string {
  if (n === 0) return 'nenhum lote concluído no período';
  return n < AMOSTRA_PEQUENA ? `${plural(n, 'lote', 'lotes')}: amostra pequena, ainda não diz muito` : plural(n, 'lote', 'lotes');
}

/** "92% em média (cada lote pesa igual)"; sem concluído, a frase. */
export function fraseDoRendimentoMedio(p: Pick<IndicadoresDaPessoa, 'rendimentoMedioBp' | 'perdidos'>): string {
  if (p.rendimentoMedioBp === null) return p.perdidos ? 'sem lote concluído com produção (só perdidos)' : 'sem lote concluído';
  return `${formatarRendimento(p.rendimentoMedioBp)} em média${p.perdidos ? ', sem contar os perdidos' : ''}`;
}

/** "1 h 05 min em média (4 lotes)"; sem hora de pegar, a frase. */
export function fraseDoTempo(p: Pick<IndicadoresDaPessoa, 'tempo'>): string {
  if (!p.tempo) return 'sem lote pego pelo ERP (sem hora de começo)';
  return `${formatarTempo(p.tempo.mediaMin)} em média (${plural(p.tempo.amostra, 'lote', 'lotes')})`;
}

/** "Molho cheddar: 9,2 kg em 2 lotes · rendeu 92%". */
export function fraseDaFicha(f: ProduzidoPorFicha): string {
  return `${f.nome}: ${formatarQuantidade(f.produzidoMilesimos, f.unidade)} em ${plural(f.lotes, 'lote', 'lotes')} · rendeu ${formatarRendimento(f.rendimentoBp)}`;
}
