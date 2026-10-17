/**
 * O DRE realizado, ao vivo (2.2a) — a leitura com banco. Junta o que cada
 * módulo já sabe e entrega a `montarDre` (a conta pura):
 *
 *  - o PERÍODO vem de `periodos.ts` (a regra, versionada, e os registrados);
 *  - a RECEITA, só de `faturamentoDosGraos` (a leitura única da 2.1: a
 *    integração vence a digitação) e a FALTA de `faltasDoIntervalo`;
 *  - a taxa do iFood, de `CanalConfig` (de HOJE, estimada);
 *  - as despesas, apropriadas dia a dia ao centavo no recorte apurado;
 *  - o plano, do banco completado pelo padrão (nada é gravado para ler).
 *
 * PARCIAL AO VIVO (decisão 145): o período em curso mostra até ONTEM — hoje
 * está em aberto, como na 2.1 — com as despesas apropriadas por dia (o aluguel
 * de 31 dias no dia 16 entra 15/31), por isso o % de cada linha já é
 * comparável no meio do mês. SEM projeção: ritmo × dias restantes ignora fim
 * de semana e dia de pagamento, e não é honesto.
 *
 * REDE × LOJA (decisão 146): a rede é a soma das lojas mais as despesas da
 * rede e só abre para quem tem a rede inteira; a loja traz só o que é dela
 * (resultado antes das despesas da rede, sem rateio). Quem não tem `dre.ver`
 * não recebe nada daqui.
 */

import { hojeNoRio } from './compra-campos';
import { diasEntre, somarDias } from './contagem-campos';
import { despesasApropriadas, faltaLancar, type RecorrenteEmFalta } from './despesas';
import { montarDre, type Escopo, type ReceitaLida, type ResultadoDoDre, type TaxaDoIfood } from './dre-campos';
import { CODIGO, type LinhaDoPlano } from './dre-plano';
import { faltasDoIntervalo, faturamentoDosGraos, lojasDoFaturamento, type LojaDoFaturamento } from './faturamento';
import { PRIMEIRO_DIA_DO_ERP, type Periodo } from './periodo-campos';
import { periodoDe } from './periodos';
import { planoDoParceiro } from './plano';
import { alcancaLoja, recusa, type Alcance } from './permissoes';
import type { ClienteDoParceiro } from './tenant';

export type PedidoDoEscopo = { tipo: 'rede' } | { tipo: 'loja'; lojaId: string };

export interface ResumoDaLoja {
  loja: LojaDoFaturamento;
  receitaBrutaCentavos: number;
  resultadoCentavos: number;
  resultadoBp: number | null;
  semContar: string[];
  faltas: number;
}

export interface DreDoPeriodo {
  periodo: Periodo;
  hoje: string;
  /** O último dia que entrou na conta (até ontem no período em curso); nulo = nenhum dia apurado ainda. */
  ate: string | null;
  /** O período contém hoje: o parcial ao vivo. */
  emCurso: boolean;
  /** O período já terminou (todos os dias entram). */
  encerrado: boolean;
  diasDoPeriodo: number;
  /** Em que dia do período hoje cai (1..N); nulo se hoje não está nele. */
  diaDeHoje: number | null;
  /** Dias que entraram na conta (0 se nenhum). */
  diasApurados: number;
  status: 'ABERTO' | 'FECHADO' | null;
  escopo: Escopo;
  resultado: ResultadoDoDre;
  /** Só na visão da rede. */
  porLoja: ResumoDaLoja[] | null;
  faltas: { total: number };
  faltaLancar: RecorrenteEmFalta[];
  taxaConfigurada: boolean;
  anterior: Periodo | null;
  proximo: Periodo | null;
  lojasDoEscopo: LojaDoFaturamento[];
}

/** A frase da recusa de abrir o DRE do escopo, ou null se pode. Rede: rede inteira. Loja: `dre.ver` na loja. */
export function recusaDoDre(alcance: Alcance, escopo: PedidoDoEscopo): string | null {
  if (escopo.tipo === 'rede') {
    if (alcance.lojas !== 'todas') return 'Só quem tem a rede inteira vê o DRE da rede. Escolha uma loja no topo.';
    return recusa(alcance, 'dre.ver');
  }
  return recusa(alcance, 'dre.ver', { lojaId: escopo.lojaId });
}

/** A data da URL (`?periodo=`) vira uma data dentro do período pedido: válida, entre 2020 e hoje; senão, hoje. */
export function dataDoPeriodoPedido(texto: string | undefined, hoje: string): string {
  if (!texto || !/^\d{4}-\d{2}-\d{2}$/.test(texto) || Number.isNaN(Date.parse(texto))) return hoje;
  return texto > hoje || texto < PRIMEIRO_DIA_DO_ERP ? hoje : texto;
}

/**
 * O DRE de um período. `data` é qualquer dia dentro dele. Loja fora do alcance, ou sem `dre.ver`:
 * null (a página responde 404/volta ao hub). Não escreve nada.
 */
export async function dreDoPeriodo(cliente: ClienteDoParceiro, alcance: Alcance, pedido: PedidoDoEscopo, data: string, hoje = hojeNoRio()): Promise<DreDoPeriodo | null> {
  if (recusaDoDre(alcance, pedido)) return null;
  if (pedido.tipo === 'loja' && !alcancaLoja(alcance, pedido.lojaId)) return null;
  const todas = await lojasDoFaturamento(cliente, alcance);
  const lojaPedida = pedido.tipo === 'loja' ? todas.find((l) => l.id === pedido.lojaId) : undefined;
  if (pedido.tipo === 'loja' && !lojaPedida) return null;

  const periodo = await periodoDe(cliente, data > hoje ? hoje : data);
  const ontem = somarDias(hoje, -1);
  const emCurso = periodo.inicio <= hoje && hoje <= periodo.fim;
  const encerrado = periodo.fim < hoje;
  const ate = encerrado ? periodo.fim : ontem >= periodo.inicio ? (ontem < periodo.fim ? ontem : periodo.fim) : null;
  const escopo: Escopo = pedido.tipo === 'rede' ? { tipo: 'rede' } : { tipo: 'loja', lojaId: pedido.lojaId, nome: lojaPedida!.nome };
  const lojasDoEscopo = pedido.tipo === 'rede' ? todas : [lojaPedida!];
  const lojaId = pedido.tipo === 'loja' ? pedido.lojaId : undefined;

  const [plano, graos, taxaLinha, despesas, falta, aFalta, anterior, proximo, registro] = await Promise.all([
    planoDoParceiro(cliente),
    ate ? faturamentoDosGraos(cliente, alcance, { de: periodo.inicio, ate, lojaId }) : Promise.resolve([]),
    cliente.canalConfig.findFirst({ where: { canal: 'IFOOD' }, select: { taxaBp: true, taxaPagamentoBp: true } }),
    ate ? despesasApropriadas(cliente, alcance, { de: periodo.inicio, ate }, lojaId) : Promise.resolve([]),
    ate ? faltasDoIntervalo(cliente, alcance, { de: periodo.inicio, ate, lojaId }, hoje) : Promise.resolve({ total: 0, porLoja: [] as { loja: LojaDoFaturamento; faltas: number }[] }),
    cliente.transacao((tx) => faltaLancar(tx, alcance, periodo.inicio, ate ?? periodo.inicio, hoje)),
    periodo.inicio > PRIMEIRO_DIA_DO_ERP ? periodoDe(cliente, somarDias(periodo.inicio, -1)) : Promise.resolve(null),
    encerrado ? periodoDe(cliente, somarDias(periodo.fim, 1)) : Promise.resolve(null),
    cliente.periodoApuracao.findFirst({ where: { inicio: new Date(`${periodo.inicio}T00:00:00.000Z`), fim: new Date(`${periodo.fim}T00:00:00.000Z`) }, select: { status: true } }),
  ]);

  const taxaIfood: TaxaDoIfood | null = taxaLinha ? { comissaoBp: taxaLinha.taxaBp, pagamentoBp: taxaLinha.taxaPagamentoBp } : null;
  const receitas: ReceitaLida[] = graos.map((g) => ({ lojaId: g.lojaId, canal: g.canal, valorCentavos: g.valorCentavos }));
  const entrada = (e: Escopo) => ({ escopo: e, plano: plano as readonly LinhaDoPlano[], receitas, taxaIfood, despesas });
  const resultado = montarDre(entrada(escopo));

  let porLoja: ResumoDaLoja[] | null = null;
  if (pedido.tipo === 'rede') {
    const faltasDe = new Map(falta.porLoja.map((f) => [f.loja.id, f.faltas]));
    porLoja = lojasDoEscopo
      .map((loja) => {
        const r = montarDre(entrada({ tipo: 'loja', lojaId: loja.id, nome: loja.nome }));
        const fim = r.linhas.find((l) => l.codigo === CODIGO.resultado)!;
        return { loja, receitaBrutaCentavos: r.receitaBrutaCentavos, resultadoCentavos: fim.valorCentavos ?? 0, resultadoBp: fim.percentualBp, semContar: fim.semContar, faltas: faltasDe.get(loja.id) ?? 0 };
      })
      // Loja desativada sem nada no período não é linha: só pesa quem vendeu ou lançou.
      .filter((l) => l.loja.ativa || l.receitaBrutaCentavos !== 0 || l.resultadoCentavos !== 0);
  }

  const diasDoPeriodo = diasEntre(periodo.inicio, periodo.fim) + 1;
  return {
    periodo,
    hoje,
    ate,
    emCurso,
    encerrado,
    diasDoPeriodo,
    diaDeHoje: emCurso ? diasEntre(periodo.inicio, hoje) + 1 : null,
    diasApurados: ate ? diasEntre(periodo.inicio, ate) + 1 : 0,
    status: registro?.status ?? null,
    escopo,
    resultado,
    porLoja,
    faltas: { total: falta.total },
    // A loja só cobra o que é dela; a rede, tudo (inclusive a despesa sem loja).
    faltaLancar: pedido.tipo === 'rede' ? aFalta : aFalta.filter((f) => f.lojaId === pedido.lojaId),
    taxaConfigurada: taxaIfood !== null,
    anterior,
    proximo,
    lojasDoEscopo,
  };
}
