/**
 * H1: projeção pura do CMV de UMA loja a partir de um DRE já lido.
 * Nenhuma consulta/fórmula financeira, cache, relógio ou ativação de regra.
 * O chamador resolve parceiro/alcance/loja/raiz na mesma requisição do DRE.
 */
import type { DreDoPeriodo } from '@/lib/erp/dre';
import { fraseDoSemPreco } from '@/lib/erp/cmv-campos';
import { pode, type Alcance } from '@/lib/erp/permissoes';
import type { AvisoDoWidgetHome, EstadoDoWidgetHome, WidgetHome } from './home-contratos';

export type LeituraDoDreParaHome =
  | { estado: 'lido'; dre: DreDoPeriodo | null }
  | { estado: 'erro' }
  | { estado: 'indisponivel' };

export interface ContextoDoCmvHome {
  alcance: Alcance;
  /** Identidade/nome resolvidos no servidor, não valores aceitos do cliente. */
  loja: { id: string; nome: string };
  /** Raiz do mesmo contexto que leu o DRE. A sintaxe não prova vínculo ao parceiro. */
  raiz: string;
  consultadoEm: string | null;
}

export interface WidgetCmvHome extends WidgetHome<'cmv'> {
  valor: { unidade: 'centavos'; valor: number | null };
  /** Misto é consolidação multiloja e fica fora deste adaptador de uma loja. */
  fonteDoCmv: 'real' | 'compras' | null;
  notaDaConta: string | null;
  semContar: readonly string[];
}

const raizValida = (raiz: string) => raiz === '/erp' || /^\/rodolfo\/erp\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raiz);
const horaValida = (hora: string | null) => hora !== null && Number.isFinite(Date.parse(hora)) ? hora : null;

/** null = omitir sem revelar fonte/contagem quando permissão ou escopo não confere. */
export function cmvDaHome(leitura: LeituraDoDreParaHome, contexto: ContextoDoCmvHome): WidgetCmvHome | null {
  const { alcance, loja, raiz } = contexto;
  if (!loja.id || !raizValida(raiz) || !pode(alcance, 'dre.ver', { lojaId: loja.id })) return null;

  const consulta = horaValida(contexto.consultadoEm);
  const query = new URLSearchParams({ loja: loja.id });
  const vazio = (estado: 'erro' | 'indisponivel', texto: string): WidgetCmvHome => ({
    familia: 'cmv', titulo: 'CMV', estado, escopo: { tipo: 'loja', lojaId: loja.id, nome: loja.nome },
    valor: { unidade: 'centavos', valor: null }, percentual: null, referencia: null, origem: null, cobertura: null,
    consultadoEm: consulta, fonteDoCmv: null, notaDaConta: null, semContar: [],
    avisos: [{ codigo: estado, texto }], detalhe: { href: raiz + '/dre?' + query.toString(), rotulo: 'Ver o DRE atual da loja' },
  });
  if (leitura.estado === 'erro') return vazio('erro', 'Não foi possível carregar o CMV.');
  if (leitura.estado === 'indisponivel' || !leitura.dre) return vazio('indisponivel', 'O CMV não está disponível neste resumo. Confira o DRE da loja.');

  const d = leitura.dre;
  // Nunca projetar um total de rede como se fosse da loja. O resultado e os
  // metadados de escopo precisam corresponder à mesma leitura canônica.
  if (d.escopo.tipo !== 'loja' || d.escopo.lojaId !== loja.id
    || d.resultado.escopo.tipo !== 'loja' || d.resultado.escopo.lojaId !== loja.id
    || d.lojasDoEscopo.length !== 1 || d.lojasDoEscopo[0].id !== loja.id
    || d.cmvDasLojas.lojas.some((l) => l.lojaId !== loja.id) || d.cmvDasLojas.lojas.length > 1) return null;

  const linhas = d.resultado.linhas.filter((l) => l.tipo === 'cmv');
  if (linhas.length !== 1 || (d.status === 'FECHADO' && !d.fechamento)) return vazio('indisponivel', 'O CMV não está disponível neste resumo. Confira o DRE da loja.');
  const linha = linhas[0];
  const daLoja = d.cmvDasLojas.lojas[0];
  const avisos: AvisoDoWidgetHome[] = [];
  const avisar = (codigo: string, texto: string) => avisos.push({ codigo, texto });
  const real = daLoja?.real ?? null;
  const fonte = real ? 'real' : daLoja && daLoja.compraCentavos !== null ? 'compras' : null;
  if (linha.nota?.startsWith('misto') || (linha.valorCentavos !== null && !d.cmv.antigo && fonte === null)) return vazio('indisponivel', 'O CMV não está disponível neste resumo. Confira o DRE da loja.');
  const semPrecoInicial = real ? fraseDoSemPreco(real.semPrecoInicial, 'inicial', real.inicialDe) : null;
  const semPrecoFinal = real ? fraseDoSemPreco(real.semPrecoFinal, 'final') : null;
  if (semPrecoInicial) avisar('estoque-inicial-sem-preco', semPrecoInicial);
  if (semPrecoFinal) avisar('estoque-final-sem-preco', semPrecoFinal);
  if (d.faltas.total > 0) avisar('faturamento-incompleto', 'Há canais sem lançamento de faturamento neste recorte. Confira o DRE antes de interpretar o percentual.');
  // Ressalvas de outras lojas e de despesas não formam o widget CMV da loja.
  const ressalvas = d.fechamento?.ressalvas.filter((r) => r.lojaId === loja.id) ?? [];
  if (ressalvas.some((r) => r.tipo === 'ESTOQUE')) avisar('fechado-com-ressalva-estoque', 'O fechamento tem ressalva de estoque desta loja. Confira o DRE.');
  if (ressalvas.some((r) => r.tipo === 'LOJA_SEM_LANCAMENTO')) avisar('fechado-sem-faturamento', 'A loja foi fechada sem lançamento de faturamento. Confira a ressalva no DRE.');
  if (d.trocasDeCusto.length > 0) avisar('troca-de-custo', 'A base de custo mudou durante este período. Confira a ponte de custo no DRE.');
  if (linha.semContar.length > 0) avisar('cmv-incompleto', 'A conta de CMV tem parcelas não consideradas. Confira o detalhe do DRE.');

  let estado: EstadoDoWidgetHome;
  let valor = linha.valorCentavos;
  let percentual = linha.percentualBp;
  if (d.ate === null) {
    estado = 'sem_dados'; valor = null; percentual = null;
    avisar('nenhum-dia-apurado', 'Nenhum dia deste período foi apurado ainda. O DRE em curso apura até ontem.');
  } else if (d.cmv.antigo) {
    estado = 'indisponivel'; valor = null; percentual = null;
    avisar('fechado-anterior-ao-cmv', 'O CMV não foi apurado neste fechamento antigo.');
  } else if (valor === null) {
    estado = 'sem_base'; percentual = null;
    avisar('cmv-sem-base', 'Sem base de CMV neste recorte. Confira as notas e a apuração no DRE.');
  } else if (d.resultado.receitaBrutaCentavos <= 0 || d.resultado.semFaturamento) {
    estado = 'sem_base'; percentual = null;
    avisar('percentual-sem-receita', 'Sem receita bruta para calcular o percentual. O valor de CMV continua informado em reais.');
  } else {
    estado = d.emCurso || d.cmvDasLojas.parcial || avisos.length > 0 ? 'parcial' : 'ok';
  }
  if (d.emCurso && d.ate !== null) avisar('periodo-em-curso', 'Período em curso: os valores do DRE vão somente até a data apurada.');

  query.set('periodo', d.periodo.inicio);
  return {
    familia: 'cmv', titulo: 'CMV', estado,
    escopo: { tipo: 'loja', lojaId: loja.id, nome: d.escopo.nome },
    valor: { unidade: 'centavos', valor },
    percentual: { pontosBase: percentual, denominador: { unidade: 'centavos', valor: d.ate === null ? null : d.resultado.receitaBrutaCentavos, rotulo: 'Receita bruta do mesmo recorte do DRE' } },
    referencia: { base: 'periodo_apuracao', rotulo: d.periodo.nome, inicio: d.periodo.inicio, fim: d.periodo.fim, apuradoAte: d.ate },
    origem: {
      fonte: 'dre', modo: d.fechamento ? 'fotografia' : 'vivo',
      fotografia: d.fechamento ? { id: d.fechamento.fotografiaId, versao: d.fechamento.versao, versaoDaConta: d.fechamento.versaoDaConta, fechadaEm: d.fechamento.fechadoEm.toISOString() } : null,
    },
    cobertura: {
      lojasIncluidas: [loja.id], lojasElegiveis: 1, diasApurados: d.diasApurados, diasDoPeriodo: d.diasDoPeriodo,
      faltasDeFaturamento: d.faltas.total,
      custosDoEstoque: real ? { semPrecoInicial: real.semPrecoInicial, semPrecoFinal: real.semPrecoFinal } : null,
    },
    consultadoEm: consulta, fonteDoCmv: estado === 'sem_dados' || d.cmv.antigo ? null : fonte,
    notaDaConta: linha.nota, semContar: [...linha.semContar], avisos,
    detalhe: { href: raiz + '/dre?' + query.toString(), rotulo: 'Ver o CMV no DRE da loja' },
  };
}
