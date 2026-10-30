/** H2 de uma loja: contrato serializável e projeções das fontes já lidas. */
import type { WidgetHome, EstadoDoWidgetHome } from './home-contratos';
import type { WidgetCmvHome } from './home-cmv';
import type { SerieDoMes } from './grafico';
import { serieDoMes } from './grafico';
import type { MesDoFaturamento } from './faturamento';
import type { SituacaoDaLoja } from './estoque';
import type { lojasDaListaDoDia } from './producao-lista';
import { pode, type Alcance, type Permissao } from './permissoes';
import type { FamiliaDaHome, MedidaDoWidgetHome } from './home-contratos';
import type { ComposicaoComprasHome } from './home-compras-categorias';
import { complementosDoFaturamento, type ComplementosFaturamentoHome } from './home-faturamento-complementos';

export interface WidgetFaturamentoHome extends WidgetHome<'faturamento'> {
  /** Mesmo total da loja/mês; ausência do campo preserva compatibilidade com DTO antigo. */
  complementos?: ComplementosFaturamentoHome;
}
export interface WidgetComprasHome extends WidgetHome<'compras'> {
  baseDeData: 'entrada';
  notas: number | null;
  itensCentavos: number | null;
  freteCentavos: number | null;
  /** Motivos fora da base do preço médio; não tornam o total entregue incompleto. */
  semBase: Partial<Record<'insumo' | 'unidade' | 'conversao' | 'valor', number>> | null;
  notasComDesconto: number | null;
  /** Recorte do mesmo KPI; classificação atual, sem fotografia ou percentual novo. */
  composicaoPorCategoria?: ComposicaoComprasHome;
}
export interface WidgetEstoqueHome extends WidgetHome<'estoque'> {
  situacao: 'NAO_ABERTO' | 'EM_CONTAGEM' | 'ABERTO' | null;
  verValores: boolean;
  rotuloDoValor: 'Valor conhecido do estoque' | 'Itens com saldo';
  itensComSaldo: number | null;
  /** Omitido quando a pessoa não pode ver valores. */
  itensSemCusto?: number;
  contagem: { contados: number; total: number } | null;
}
export interface WidgetProducaoHome extends WidgetHome<'producao'> {
  naLista: number | null;
  semLote: number | null;
}
export type WidgetDespesasHome = WidgetHome<'despesas'>;
export type WidgetAnaliticoHome = WidgetFaturamentoHome | WidgetCmvHome | WidgetComprasHome | WidgetDespesasHome | WidgetEstoqueHome | WidgetProducaoHome;

export interface FaturamentoDiarioHome {
  mes: string;
  hoje: string;
  totalCentavos: number | null;
  /** A projeção canônica serieDoMes da MESMA leitura mensal; sem forecast/interpolação. */
  serie: SerieDoMes | null;
  estado: EstadoDoWidgetHome;
  detalhe: { href: string; rotulo: string };
  consultadoEm: string;
}

export type AnaliticoDaHome = { tipo: 'rede' } | {
  tipo: 'loja';
  loja: { id: string; nome: string };
  widgets: WidgetAnaliticoHome[];
  faturamentoDiario?: FaturamentoDiarioHome;
};

export interface ContextoHomeLoja {
  alcance: Alcance;
  loja: { id: string; nome: string };
  /** Raiz resolvida junto do cliente/tenant, nunca aceita do navegador. */
  raiz: string;
  hoje: string;
  consultadoEm: string;
}
export type LeituraHome<T> = { estado: 'lido'; dados: T | null } | { estado: 'erro' } | { estado: 'indisponivel' };

export function contextoHomePermitido(c: ContextoHomeLoja, permissao: Permissao): boolean {
  return /^[a-z0-9]{1,64}$/i.test(c.loja.id)
    && (c.raiz === '/erp' || /^\/rodolfo\/erp\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.raiz))
    && pode(c.alcance, permissao, { lojaId: c.loja.id });
}

export function baseDoWidgetHome<F extends FamiliaDaHome>(familia: F, titulo: string, c: ContextoHomeLoja, unidade: MedidaDoWidgetHome['unidade'], detalhe: { href: string; rotulo: string }): WidgetHome<F> {
  return {
    familia, titulo, estado: 'indisponivel', escopo: { tipo: 'loja', lojaId: c.loja.id, nome: c.loja.nome },
    valor: { unidade, valor: null }, percentual: null, referencia: null, origem: null, cobertura: null,
    consultadoEm: c.consultadoEm, avisos: [], detalhe,
  };
}

export function faturamentoAnalitico(leitura: LeituraHome<MesDoFaturamento>, c: ContextoHomeLoja): { widget: WidgetFaturamentoHome; diario: FaturamentoDiarioHome } | null {
  if (!contextoHomePermitido(c, 'faturamento.ver')) return null;
  const mes = c.hoje.slice(0, 7);
  const detalhe = { href: c.raiz + '/faturamento?' + new URLSearchParams({ mes, loja: c.loja.id }).toString(), rotulo: 'Ver o faturamento da loja' };
  const widget: WidgetFaturamentoHome = {
    ...baseDoWidgetHome('faturamento', 'Faturamento', c, 'centavos', detalhe),
    complementos: complementosDoFaturamento('indisponivel'),
  };
  const diario: FaturamentoDiarioHome = { mes, hoje: c.hoje, totalCentavos: null, serie: null, estado: widget.estado, detalhe, consultadoEm: c.consultadoEm };
  const terminar = (estado: EstadoDoWidgetHome, codigo: string, texto: string) => {
    widget.estado = estado; diario.estado = estado; widget.avisos = [{ codigo, texto }];
    widget.valor.valor = null; diario.totalCentavos = null; diario.serie = null;
    widget.referencia = null; widget.origem = null; widget.cobertura = null;
    widget.complementos = complementosDoFaturamento(estado);
    return { widget, diario };
  };
  if (leitura.estado === 'erro') return terminar('erro', 'faturamento-erro', 'Não foi possível carregar o faturamento desta loja.');
  if (leitura.estado !== 'lido' || !leitura.dados) return terminar('indisponivel', 'faturamento-indisponivel', 'O faturamento não está disponível neste resumo.');
  const m = leitura.dados;
  try {
    if (m.mes === mes && m.hoje === c.hoje && m.lojas.length === 0) return terminar('sem_dados', 'faturamento-sem-loja', 'Nenhuma loja disponível para faturamento neste contexto.');
    if (m.mes !== mes || m.hoje !== c.hoje || m.lojas.length !== 1 || m.lojas[0].loja.id !== c.loja.id
      || !Array.isArray(m.dias) || new Set(m.dias).size !== m.dias.length) return terminar('indisponivel', 'faturamento-contexto', 'O recorte do faturamento não corresponde à loja e ao mês deste resumo.');
    const loja = m.lojas[0];
    if (loja.dias.length !== m.dias.length || loja.dias.some((d, i) => d.data !== m.dias[i])
      || m.total.valorCentavos !== loja.total.valorCentavos) return terminar('indisponivel', 'faturamento-contexto', 'O recorte do faturamento não corresponde à loja e ao mês deste resumo.');
    // A mesma projeção já usada no módulo. Nenhuma consulta, nova soma ou interpolação.
    diario.serie = serieDoMes(m, loja);
    widget.estado = diario.serie.diasLancados === 0 ? 'sem_dados' : loja.faltas > 0 ? 'parcial' : 'ok';
    widget.valor.valor = diario.serie.diasLancados ? loja.total.valorCentavos : null;
    diario.totalCentavos = widget.valor.valor; diario.estado = widget.estado;
    widget.referencia = { base: 'mes_civil', rotulo: 'Mês civil · ' + mes, inicio: mes + '-01', fim: m.dias.at(-1) ?? null, apuradoAte: c.hoje };
    widget.origem = { fonte: 'faturamento', modo: 'vivo', fotografia: null };
    widget.cobertura = { lojasIncluidas: [c.loja.id], lojasElegiveis: 1, diasApurados: null, diasDoPeriodo: m.dias.length, faltasDeFaturamento: loja.faltas, custosDoEstoque: null };
    if (!diario.serie.diasLancados) widget.avisos = [{ codigo: 'faturamento-sem-lancamento', texto: 'Ainda não há lançamentos neste mês.' }];
    else if (loja.faltas > 0) widget.avisos = [{ codigo: 'faturamento-parcial', texto: 'Há canais sem lançamento neste mês. O valor ainda está incompleto.' }];
    // Fronteira própria: falha dos campos adicionais não desfaz receita/série.
    // Somente o total desta mesma loja, já revalidada, é lido pela projeção pura.
    widget.complementos = complementosDoFaturamento(widget.estado, () => loja.total);
    return { widget, diario };
  } catch {
    return terminar('erro', 'faturamento-erro', 'Não foi possível carregar o faturamento desta loja.');
  }
}

export function estoqueAnalitico(leitura: LeituraHome<SituacaoDaLoja[]>, c: ContextoHomeLoja): WidgetEstoqueHome | null {
  if (!contextoHomePermitido(c, 'estoque.ver')) return null;
  const podeValor = pode(c.alcance, 'compras.ver', { lojaId: c.loja.id });
  const widget: WidgetEstoqueHome = {
    ...baseDoWidgetHome('estoque', 'Estoque', c, podeValor ? 'centavos' : 'contagem', { href: c.raiz + '/estoque/' + encodeURIComponent(c.loja.id), rotulo: 'Ver o estoque da loja' }),
    situacao: null, verValores: podeValor, rotuloDoValor: podeValor ? 'Valor conhecido do estoque' : 'Itens com saldo', itensComSaldo: null, contagem: null,
  };
  const terminar = (estado: EstadoDoWidgetHome, codigo: string, texto: string) => { widget.estado = estado; widget.avisos = [{ codigo, texto }]; return widget; };
  if (leitura.estado === 'erro') return terminar('erro', 'estoque-erro', 'Não foi possível carregar a posição atual do estoque.');
  if (leitura.estado !== 'lido' || !leitura.dados) return terminar('indisponivel', 'estoque-indisponivel', 'A posição atual do estoque não está disponível neste resumo.');
  const loja = leitura.dados.find((l) => l.id === c.loja.id);
  if (!loja || !loja.ativa) return terminar('sem_dados', 'estoque-sem-loja', 'Nenhuma loja ativa disponível para estoque neste contexto.');
  widget.situacao = loja.estado;
  widget.verValores = podeValor && loja.verValores;
  widget.rotuloDoValor = widget.verValores ? 'Valor conhecido do estoque' : 'Itens com saldo';
  widget.valor.unidade = widget.verValores ? 'centavos' : 'contagem';
  widget.referencia = { base: 'posicao_atual', rotulo: 'Posição atual', inicio: null, fim: null, apuradoAte: null };
  widget.origem = { fonte: 'estoque', modo: 'vivo', fotografia: null };
  if (loja.estado === 'NAO_ABERTO') return terminar('sem_base', 'estoque-nao-aberto', 'O estoque ainda não foi aberto. A posição começa depois da contagem de abertura.');
  if (loja.estado === 'EM_CONTAGEM') {
    widget.contagem = loja.contagem ? { contados: loja.contagem.contados, total: loja.contagem.total } : null;
    return terminar('sem_base', 'estoque-em-contagem', 'A contagem de abertura está em andamento. A posição começa depois da conclusão.');
  }
  if (!loja.aberto) return terminar('indisponivel', 'estoque-sem-posicao', 'A posição atual do estoque não está disponível neste resumo.');
  widget.itensComSaldo = loja.aberto.itensComSaldo;
  widget.valor.valor = widget.verValores ? loja.aberto.valorCentavos : loja.aberto.itensComSaldo;
  widget.estado = widget.verValores && loja.aberto.pendentes > 0 ? 'parcial' : 'ok';
  if (widget.verValores) {
    widget.itensSemCusto = loja.aberto.pendentes;
    if (loja.aberto.pendentes > 0) widget.avisos = [{ codigo: 'estoque-valor-parcial', texto: 'Valor conhecido: há itens sem custo fora da soma. Confira o detalhe do estoque.' }];
  }
  return widget;
}

type LojasDaProducaoHome = Awaited<ReturnType<typeof lojasDaListaDoDia>>;
export function producaoAnalitica(leitura: LeituraHome<LojasDaProducaoHome>, c: ContextoHomeLoja): WidgetProducaoHome | null {
  if (!contextoHomePermitido(c, 'producao.ver')) return null;
  const widget: WidgetProducaoHome = {
    ...baseDoWidgetHome('producao', 'Produção', c, 'contagem', { href: c.raiz + '/producao/lista/' + encodeURIComponent(c.loja.id) + '?' + new URLSearchParams({ dia: c.hoje }).toString(), rotulo: 'Ver a lista de hoje' }),
    naLista: null, semLote: null,
  };
  const terminar = (estado: EstadoDoWidgetHome, codigo: string, texto: string) => { widget.estado = estado; widget.avisos = [{ codigo, texto }]; return widget; };
  if (leitura.estado === 'erro') return terminar('erro', 'producao-erro', 'Não foi possível carregar a lista de produção de hoje.');
  if (leitura.estado !== 'lido' || !leitura.dados) return terminar('indisponivel', 'producao-indisponivel', 'A lista de hoje não está disponível neste resumo.');
  const loja = leitura.dados.find((l) => l.id === c.loja.id);
  if (!loja) return terminar('sem_dados', 'producao-sem-loja', 'Nenhuma loja ativa disponível para produção neste contexto.');
  widget.naLista = loja.naLista; widget.semLote = loja.semLote; widget.valor.valor = loja.naLista;
  widget.estado = loja.naLista ? 'ok' : 'sem_dados';
  widget.referencia = { base: 'dia_operacional', rotulo: 'Hoje · ' + c.hoje, inicio: c.hoje, fim: c.hoje, apuradoAte: c.hoje };
  widget.origem = { fonte: 'producao', modo: 'vivo', fotografia: null };
  if (!loja.naLista) widget.avisos = [{ codigo: 'producao-lista-vazia', texto: 'Nenhum pré-preparo listado hoje. Isso não representa toda a produção da loja.' }];
  else if (loja.semLote) widget.avisos = [{ codigo: 'producao-sem-lote', texto: 'Há pré-preparos da lista ainda sem lote ativo. A lista inclui os que já viraram lote.' }];
  return widget;
}

export function despesasIndisponiveis(c: ContextoHomeLoja): WidgetDespesasHome | null {
  if (!contextoHomePermitido(c, 'dre.ver') && !contextoHomePermitido(c, 'despesas.lancar')) return null;
  const widget = baseDoWidgetHome('despesas', 'Despesas', c, 'centavos', { href: c.raiz + '/dre/despesas?' + new URLSearchParams({ loja: c.loja.id }).toString(), rotulo: 'Ver as despesas da loja' });
  widget.avisos = [{ codigo: 'despesas-sem-contrato', texto: 'O total de despesas por competência ainda não está disponível neste resumo. Confira os lançamentos no detalhe.' }];
  return widget;
}
