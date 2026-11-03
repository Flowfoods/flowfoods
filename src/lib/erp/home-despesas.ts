/**
 * Despesas por competência de UMA loja, projetadas do MESMO DRE que a Home já
 * leu para o CMV. Puro: nenhuma consulta, cache, relógio ou fórmula financeira.
 *
 * Recorte (Home analítica, "Proposta concreta de Despesas"): os oito grupos de
 * despesa abaixo do CMV — variáveis, pessoal, ocupação, utilidades,
 * administrativas, marketing, outras e financeiras. Ficam de fora o CMV e as
 * deduções da venda (impostos, taxas de cartão e a taxa do iFood). Soma só as
 * linhas lançáveis (`tipo === 'linha'`), inclusive as criadas pela casa e as
 * ocultas que têm valor, e confere cada grupo contra o subtotal `grupo:X` do
 * próprio DRE: se não bater, o card fica indisponível, nunca com um número
 * divergente. Período fechado vem da fotografia que o DRE já leu.
 *
 * Sem `dre.ver` nenhum valor sai daqui: quem só lança despesas recebe o
 * marcador antigo, e quem não tem nenhuma das duas não recebe o card.
 */
import type { DreDoPeriodo } from './dre';
import type { LinhaDoDre } from './dre-campos';
import { codigoDoSubtotal, ROTULO_DO_GRUPO, type GrupoDoDre } from './dre-plano';
import type { LeituraDoDreParaHome } from './home-cmv';
import type { AvisoDoWidgetHome, EstadoDoWidgetHome, WidgetHome } from './home-contratos';
import { baseDoWidgetHome, contextoHomePermitido, despesasIndisponiveis, type ContextoHomeLoja } from './home-analitico';

/** Os grupos do recorte, na ordem do DRE. CMV, deduções, receita e resultados ficam fora. */
export const GRUPOS_DAS_DESPESAS_DA_HOME = [
  'DESPESA_VARIAVEL', 'PESSOAL', 'OCUPACAO', 'UTILIDADES', 'ADMINISTRATIVA', 'MARKETING', 'OUTRAS', 'FINANCEIRA',
] as const satisfies readonly GrupoDoDre[];
export type GrupoDasDespesasHome = (typeof GRUPOS_DAS_DESPESAS_DA_HOME)[number];
/** A linha que acompanha o total no card e no painel: a base e o que fica de fora. */
export const RECORTE_DAS_DESPESAS_DA_HOME = 'No período do DRE · sem CMV e deduções';

export interface GrupoDaComposicaoDespesasHome {
  grupo: GrupoDasDespesasHome;
  rotulo: string;
  /** O subtotal do grupo no DRE, já conferido contra a soma das linhas do grupo. */
  centavos: number;
  /** Alguma linha do grupo tem valor. Sem lançamento não é R$ 0,00 informado. */
  comLancamento: boolean;
}

export interface ComposicaoDespesasHome {
  estado: 'ok' | 'sem_dados' | 'indisponivel' | 'erro';
  base: 'competencia_sem_cmv_e_deducoes';
  /** Os oito grupos, na ordem do DRE, quando há valor conferido; vazio nos outros estados. */
  grupos: GrupoDaComposicaoDespesasHome[];
}

export interface WidgetDespesasHome extends WidgetHome<'despesas'> {
  /** Só no card lido do DRE (`dre.ver`). Ausente no marcador de quem apenas lança despesas. */
  composicaoPorGrupo?: ComposicaoDespesasHome;
  /** Despesas que repetem todo mês sem o mês lançado nesta loja (só contagem); null quando a leitura não informa. */
  recorrentesSemLancamento?: number | null;
}

const INDISPONIVEL = 'As despesas não estão disponíveis neste resumo. Confira o DRE da loja.';
const doRecorte = (g: unknown) => (GRUPOS_DAS_DESPESAS_DA_HOME as readonly unknown[]).includes(g);
const DIVERGENTE = 'As despesas não conferem com os subtotais do DRE desta leitura. Confira o DRE da loja.';

/** Valor de uma linha do DRE como BigInt; recusa o que não é inteiro seguro. */
function centavosDaLinha(l: LinhaDoDre): bigint | null {
  const v = l.valorCentavos;
  return Number.isSafeInteger(v) ? BigInt(v as number) : null;
}

type Conferencia = { ok: true; grupos: GrupoDaComposicaoDespesasHome[]; total: number } | { ok: false };

/** Confere cada grupo: soma das linhas lançáveis === subtotal do próprio DRE. Não soma subtotal com linha. */
function conferirGrupos(d: DreDoPeriodo): Conferencia {
  const linhas = d.resultado.linhas;
  const grupos: GrupoDaComposicaoDespesasHome[] = [];
  const chaves = new Set<string>();
  let total = 0n;
  for (const grupo of GRUPOS_DAS_DESPESAS_DA_HOME) {
    const subtotais = linhas.filter((l) => l.chave === codigoDoSubtotal(grupo));
    if (subtotais.length !== 1 || subtotais[0].tipo !== 'subtotal') return { ok: false };
    const subtotal = centavosDaLinha(subtotais[0]);
    if (subtotal === null) return { ok: false };
    let soma = 0n;
    let comLancamento = false;
    for (const l of linhas) {
      if (l.tipo !== 'linha' || l.grupo !== grupo) continue;
      const v = centavosDaLinha(l);
      if (v === null || chaves.has(l.chave)) return { ok: false };
      chaves.add(l.chave);
      soma += v;
      if (v !== 0n) comLancamento = true;
    }
    if (soma !== subtotal) return { ok: false };
    total += subtotal;
    grupos.push({ grupo, rotulo: ROTULO_DO_GRUPO[grupo], centavos: Number(subtotal), comLancamento });
  }
  if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER)) return { ok: false };
  return { ok: true, grupos, total: Number(total) };
}

/**
 * null = omitir (sem `dre.ver` nem `despesas.lancar`, contexto inválido ou escopo que não é o da loja).
 * Sem `dre.ver`, devolve o marcador sem valor e sequer olha a leitura.
 */
export function despesasDaHome(leitura: LeituraDoDreParaHome, c: ContextoHomeLoja): WidgetDespesasHome | null {
  if (!contextoHomePermitido(c, 'dre.ver')) return despesasIndisponiveis(c);
  const loja = c.loja;
  const query = new URLSearchParams({ loja: loja.id });
  const composicao = (estado: ComposicaoDespesasHome['estado'], grupos: GrupoDaComposicaoDespesasHome[] = []): ComposicaoDespesasHome => ({ estado, base: 'competencia_sem_cmv_e_deducoes', grupos });
  const vazio = (estado: 'erro' | 'indisponivel', codigo: string, texto: string): WidgetDespesasHome => ({
    ...baseDoWidgetHome('despesas', 'Despesas', c, 'centavos', { href: c.raiz + '/dre?' + query.toString(), rotulo: 'Ver o DRE atual da loja' }),
    estado, avisos: [{ codigo, texto }], composicaoPorGrupo: composicao(estado), recorrentesSemLancamento: null,
  });
  if (leitura.estado === 'erro') return vazio('erro', 'despesas-erro', 'Não foi possível carregar as despesas.');
  if (leitura.estado !== 'lido' || !leitura.dre) return vazio('indisponivel', 'despesas-indisponivel', INDISPONIVEL);

  const d = leitura.dre;
  // Nunca projetar a rede (com as despesas sem loja) ou outra loja como se fosse esta.
  if (d.escopo.tipo !== 'loja' || d.escopo.lojaId !== loja.id
    || d.resultado.escopo.tipo !== 'loja' || d.resultado.escopo.lojaId !== loja.id
    || d.lojasDoEscopo.length !== 1 || d.lojasDoEscopo[0].id !== loja.id) return null;
  // Fechado só vale lido da fotografia; nunca a leitura viva no lugar dela.
  if (d.status === 'FECHADO' && !d.fechamento) return vazio('indisponivel', 'despesas-indisponivel', INDISPONIVEL);

  const avisos: AvisoDoWidgetHome[] = [];
  const avisar = (codigo: string, texto: string) => avisos.push({ codigo, texto });
  // A loja só cobra o que é dela e do recorte: recorrentes da rede (sem loja) e de dedução (ex.: DAS) ficam fora deste card.
  const recorrentes = d.fechamento ? null : d.faltaLancar.filter((f) => f.lojaId === loja.id && doRecorte(f.grupo)).length;
  // Ressalva antiga, gravada sem o grupo, conta (lado conservador); com grupo, só os oito do recorte.
  const ressalvaRecorrente = d.fechamento?.ressalvas.some((r) => r.tipo === 'RECORRENTE' && r.lojaId === loja.id
    && (r.grupo === undefined || r.grupo === null || doRecorte(r.grupo))) ?? false;
  if (recorrentes) {
    avisar('recorrentes-sem-lancamento', recorrentes === 1
      ? 'Uma despesa que repete todo mês ainda está sem o mês lançado nesta loja. O total está incompleto.'
      : `${recorrentes.toLocaleString('pt-BR')} despesas que repetem todo mês ainda estão sem o mês lançado nesta loja. O total está incompleto.`);
  }
  if (ressalvaRecorrente) avisar('fechado-com-ressalva-recorrente', 'O fechamento tem ressalva de despesa que repete todo mês sem o mês lançado nesta loja. Confira o DRE.');

  let estado: EstadoDoWidgetHome;
  let valor: number | null = null;
  let grupos: ComposicaoDespesasHome;
  if (d.ate === null) {
    estado = 'sem_dados'; grupos = composicao('sem_dados');
    avisar('nenhum-dia-apurado', 'Nenhum dia deste período foi apurado ainda. O DRE em curso apura até ontem.');
  } else {
    const conferencia = conferirGrupos(d);
    if (!conferencia.ok) return vazio('indisponivel', 'despesas-divergentes', DIVERGENTE);
    if (!conferencia.grupos.some((g) => g.comLancamento)) {
      // Nenhuma linha com valor: ausência de lançamento, não R$ 0,00 apurado.
      estado = 'sem_dados'; grupos = composicao('sem_dados');
      avisar('despesas-sem-lancamento', 'Nenhuma despesa lançada para esta loja no período até a data apurada.');
    } else {
      valor = conferencia.total; grupos = composicao('ok', conferencia.grupos);
      estado = d.emCurso || (recorrentes ?? 0) > 0 || ressalvaRecorrente ? 'parcial' : 'ok';
    }
  }
  if (d.emCurso && d.ate !== null) avisar('periodo-em-curso', 'Período em curso: as despesas entram dia a dia, só até a data apurada.');

  query.set('periodo', d.periodo.inicio);
  return {
    familia: 'despesas', titulo: 'Despesas', estado,
    escopo: { tipo: 'loja', lojaId: loja.id, nome: d.escopo.nome },
    valor: { unidade: 'centavos', valor }, percentual: null,
    referencia: { base: 'periodo_apuracao', rotulo: d.periodo.nome, inicio: d.periodo.inicio, fim: d.periodo.fim, apuradoAte: d.ate },
    origem: {
      fonte: 'dre', modo: d.fechamento ? 'fotografia' : 'vivo',
      fotografia: d.fechamento ? { id: d.fechamento.fotografiaId, versao: d.fechamento.versao, versaoDaConta: d.fechamento.versaoDaConta, fechadaEm: d.fechamento.fechadoEm.toISOString() } : null,
    },
    cobertura: {
      lojasIncluidas: [loja.id], lojasElegiveis: 1, diasApurados: d.diasApurados, diasDoPeriodo: d.diasDoPeriodo,
      faltasDeFaturamento: null, custosDoEstoque: null,
    },
    consultadoEm: c.consultadoEm, avisos, composicaoPorGrupo: grupos, recorrentesSemLancamento: recorrentes,
    detalhe: { href: c.raiz + '/dre?' + query.toString(), rotulo: 'Ver as despesas no DRE da loja' },
  };
}
