import { lerIdDaLojaIfood } from '../core/campos';
import { diaDoPainelValido } from './painel-campos';
import { lerPaginaEventosV3 } from './financial-v3-eventos';
import { lerLiquidacoesV3 } from './financial-v3-liquidacoes';
import { lerAntecipacoesV3 } from './financial-v3-antecipacoes';
import { lerPaginaVendasV3, type PaginaVendasV3, type VendaV3 } from './financial-v3-vendas';
import {
  conferirEscopoConciliacaoV3, lerConsultaConciliacaoV3, lerProtocoloConciliacaoV3,
  requestIdConciliacaoValido, ultimoRequestIdConciliacaoV3, type ProtocoloConciliacaoV3,
} from './financial-v3-conciliacao-resposta';
import type { RespostaHttp, Transporte } from './transporte';

type Intervalo = Readonly<{ merchantId: string; inicio: string; fim: string }>;
export type ConsultaLiquidacoesV3 = Intervalo & { readonly filtro: 'APURACAO' | 'PAGAMENTO' };
export type ConsultaAntecipacoesV3 = Intervalo & { readonly filtro: 'APURACAO' | 'PAGAMENTO_ANTECIPADO' };
const base = 'https://merchant-api.ifood.com.br/financial/v3.0/merchants/';
const tamanho = 100; // Tamanho padrão da referência v3 para Events.
const limiteDePaginas = 100; // Limite local por execução.
const limiteDeItensDeVendas = 10_000; // Vendas, lançamentos e meios de pagamento retidos por consulta.

export class ErroConsultaFinancialV3 extends Error {
  constructor(readonly codigo: 'CONSULTA_INVALIDA' | 'TRANSPORTE' | 'HTTP' | 'PAGINACAO', readonly status?: number) {
    super('A consulta Financial v3 não foi concluída.');
    this.name = 'ErroConsultaFinancialV3';
  }
}

function conferirIntervalo(p: Intervalo): Intervalo {
  const merchantId = lerIdDaLojaIfood(p?.merchantId);
  if (!merchantId || !diaDoPainelValido(p.inicio) || !diaDoPainelValido(p.fim) || p.fim < p.inicio) {
    throw new ErroConsultaFinancialV3('CONSULTA_INVALIDA');
  }
  return { merchantId, inicio: p.inicio, fim: p.fim };
}

/** O transporte é fornecido pelo chamador. A entrada desta entrega usa somente fixtures. */
async function chamar(transportar: Transporte, url: URL, pedido: { metodo: 'GET' } | { metodo: 'POST'; corpo: string } = { metodo: 'GET' }): Promise<RespostaHttp> {
  const cabecalhos: Record<string, string> = { accept: 'application/json' };
  if (pedido.metodo === 'POST') cabecalhos['content-type'] = 'application/json';
  try {
    return await transportar({ ...pedido, url: url.href, cabecalhos, tempoMaximoMs: 15_000 });
  } catch {
    throw new ErroConsultaFinancialV3('TRANSPORTE');
  }
}

function corpo200(resposta: RespostaHttp): string {
  if (resposta.status !== 200) throw new ErroConsultaFinancialV3('HTTP', resposta.status);
  return resposta.corpo;
}

/** Uma sequência de páginas de uma consulta. Fechamento da competência depende de evidência própria. */
export async function consultarEventosFinancialV3(entrada: Intervalo, transportar: Transporte) {
  const consulta = conferirIntervalo(entrada);
  const diasInclusivos = (Date.parse(consulta.fim) - Date.parse(consulta.inicio)) / 86_400_000 + 1;
  if (diasInclusivos > 33) throw new ErroConsultaFinancialV3('CONSULTA_INVALIDA');
  const url = new URL(base + consulta.merchantId + '/financial-events');
  url.searchParams.set('beginDate', consulta.inicio);
  url.searchParams.set('endDate', consulta.fim);
  url.searchParams.set('size', String(tamanho));
  const eventos: ReturnType<typeof lerPaginaEventosV3>['eventos'][number][] = [];
  for (let page = 1; page <= limiteDePaginas; page++) {
    url.searchParams.set('page', String(page));
    const pagina = lerPaginaEventosV3(corpo200(await chamar(transportar, url)), { page, size: tamanho });
    if (pagina.hasNextPage && !pagina.eventos.length) {
      throw new ErroConsultaFinancialV3('PAGINACAO');
    }
    eventos.push(...pagina.eventos);
    if (!pagina.hasNextPage) return { consulta, paginasLidas: page, eventos };
  }
  throw new ErroConsultaFinancialV3('PAGINACAO');
}

export async function consultarLiquidacoesFinancialV3(entrada: ConsultaLiquidacoesV3, transportar: Transporte) {
  const consulta = conferirIntervalo(entrada);
  const filtro = entrada.filtro;
  if (filtro !== 'APURACAO' && filtro !== 'PAGAMENTO') throw new ErroConsultaFinancialV3('CONSULTA_INVALIDA');
  const url = new URL(base + consulta.merchantId + '/settlements');
  const sufixo = filtro === 'APURACAO' ? 'CalculationDate' : 'PaymentDate';
  url.searchParams.set('begin' + sufixo, consulta.inicio);
  url.searchParams.set('end' + sufixo, consulta.fim);
  const liquidacoes = lerLiquidacoesV3(corpo200(await chamar(transportar, url)), consulta);
  return { filtro, liquidacoes };
}

/** Uma resposta à consulta de antecipações. O contrato consultado não comprova cobertura do intervalo. */
export async function consultarAntecipacoesFinancialV3(entrada: ConsultaAntecipacoesV3, transportar: Transporte) {
  const consulta = conferirIntervalo(entrada);
  const filtro = entrada.filtro;
  if (filtro !== 'APURACAO' && filtro !== 'PAGAMENTO_ANTECIPADO') throw new ErroConsultaFinancialV3('CONSULTA_INVALIDA');
  const url = new URL(base + consulta.merchantId + '/anticipations');
  const sufixo = filtro === 'APURACAO' ? 'CalculationDate' : 'AnticipatedPaymentDate';
  url.searchParams.set('begin' + sufixo, consulta.inicio);
  url.searchParams.set('end' + sufixo, consulta.fim);
  const antecipacoes = lerAntecipacoesV3(corpo200(await chamar(transportar, url)), consulta);
  return { filtro, antecipacoes };
}

type PaginacaoVendas = Pick<PaginaVendasV3, 'total' | 'pageCount'>;

/** A conclusão da paginação confirma apenas os registros recebidos nessa consulta. */
export async function consultarVendasFinancialV3(entrada: Intervalo, transportar: Transporte) {
  const consulta = conferirIntervalo(entrada);
  const diasInclusivos = (Date.parse(consulta.fim) - Date.parse(consulta.inicio)) / 86_400_000 + 1;
  if (diasInclusivos > 90) throw new ErroConsultaFinancialV3('CONSULTA_INVALIDA'); // Janela local.
  const url = new URL(base + consulta.merchantId + '/sales');
  url.searchParams.set('beginSalesDate', consulta.inicio);
  url.searchParams.set('endSalesDate', consulta.fim);

  const cobertura = 'NAO_COMPROVADA' as const;
  const vendas: VendaV3[] = [];
  const ids = new Set<string>();
  let itensRetidos = 0;
  let paginacao: PaginacaoVendas | undefined;
  for (let page = 1; page <= limiteDePaginas; page++) {
    url.searchParams.set('page', String(page));
    const resposta = await chamar(transportar, url);
    if (resposta.status === 204 && resposta.corpo === '') {
      return { estado: 'INCONCLUSIVO_204' as const, consulta, cobertura, paginaSemConteudo: page };
    }
    const pagina = lerPaginaVendasV3(corpo200(resposta), { ...consulta, page });
    const { total, pageCount } = pagina;
    if (paginacao && (total !== paginacao.total || pageCount !== paginacao.pageCount)) {
      throw new ErroConsultaFinancialV3('PAGINACAO');
    }
    if (pageCount > limiteDePaginas || total > limiteDeItensDeVendas) throw new ErroConsultaFinancialV3('PAGINACAO');
    if (vendas.length + pagina.vendas.length > total) throw new ErroConsultaFinancialV3('PAGINACAO');
    paginacao = { total, pageCount };
    for (const venda of pagina.vendas) {
      itensRetidos += 1 + (venda.faturamento?.lancamentos?.length ?? 0) + (venda.metodosPagamento?.length ?? 0);
      if (itensRetidos > limiteDeItensDeVendas) throw new ErroConsultaFinancialV3('PAGINACAO');
      if (ids.has(venda.id)) throw new ErroConsultaFinancialV3('PAGINACAO');
      ids.add(venda.id);
      vendas.push(venda);
    }
    if (page >= pageCount) {
      if (vendas.length !== total) throw new ErroConsultaFinancialV3('PAGINACAO');
      return { estado: 'PAGINAS_LIDAS' as const, consulta, cobertura, paginasLidas: page, totalInformado: total, vendas };
    }
  }
  throw new ErroConsultaFinancialV3('PAGINACAO');
}

type EscopoConciliacao = Pick<ProtocoloConciliacaoV3, 'merchantId' | 'competencia'>;
type SolicitacaoConciliacao =
  | { estado: 'SOLICITADO' | 'REUTILIZADO'; protocolo: ProtocoloConciliacaoV3 }
  | { estado: 'CONFLITO_SEM_PROTOCOLO'; consulta: EscopoConciliacao };

function conferirProtocolo(protocolo: ProtocoloConciliacaoV3): ProtocoloConciliacaoV3 {
  const escopo = conferirEscopoConciliacaoV3(protocolo);
  if (!requestIdConciliacaoValido(protocolo.requestId)) throw new ErroConsultaFinancialV3('CONSULTA_INVALIDA');
  return { ...escopo, requestId: protocolo.requestId };
}

function caminhoConciliacao(merchantId: string) {
  return base + merchantId + '/reconciliation/on-demand';
}

/** Envia um POST. Um conflito só permite retomar o protocolo conhecido desta mesma loja e mês. */
export async function solicitarConciliacaoFinancialV3(
  entrada: EscopoConciliacao, transportar: Transporte, anterior?: ProtocoloConciliacaoV3,
): Promise<SolicitacaoConciliacao> {
  const consulta = conferirEscopoConciliacaoV3(entrada);
  const conhecido = anterior === undefined ? undefined : conferirProtocolo(anterior);
  if (conhecido && (conhecido.merchantId !== consulta.merchantId || conhecido.competencia !== consulta.competencia)) {
    throw new ErroConsultaFinancialV3('CONSULTA_INVALIDA');
  }
  const resposta = await chamar(transportar, new URL(caminhoConciliacao(consulta.merchantId)), {
    metodo: 'POST', corpo: JSON.stringify({ competence: consulta.competencia }),
  });
  if (resposta.status === 409) {
    const informado = ultimoRequestIdConciliacaoV3(resposta.corpo, consulta);
    if (conhecido && (informado === null || conhecido.requestId === informado)) {
      return { estado: 'REUTILIZADO', protocolo: conhecido };
    }
    return { estado: 'CONFLITO_SEM_PROTOCOLO', consulta };
  }
  if (resposta.status !== 200 && resposta.status !== 202) throw new ErroConsultaFinancialV3('HTTP', resposta.status);
  return { estado: 'SOLICITADO', protocolo: lerProtocoloConciliacaoV3(resposta.corpo, consulta) };
}

/** O primeiro GET é imediato. A espera segue o exemplo do guia e termina dentro da janela de 30 minutos. */
export async function acompanharConciliacaoFinancialV3(
  entrada: ProtocoloConciliacaoV3, transportar: Transporte, esperar: (ms: number) => Promise<void>,
  agora: () => number = () => performance.now(),
) {
  const protocolo = conferirProtocolo(entrada);
  const url = new URL(caminhoConciliacao(protocolo.merchantId) + '/' + encodeURIComponent(protocolo.requestId));
  const janelaMs = 30 * 60_000;
  const inicio = agora();
  let intervaloMs = 30_000;
  let esperaAcumuladaMs = 0;
  // O ensaio pode simular a pausa sem avançar o relógio do processo.
  const tempoDecorrido = () => Math.max(agora() - inicio, esperaAcumuladaMs);
  for (let consultas = 1; ; consultas++) {
    const resposta = await chamar(transportar, url);
    if (resposta.status === 404) return { estado: 'PROTOCOLO_INDISPONIVEL' as const, protocolo, consultas };
    if (resposta.status !== 200 && resposta.status !== 202) throw new ErroConsultaFinancialV3('HTTP', resposta.status);
    const leitura = lerConsultaConciliacaoV3(resposta.status, resposta.corpo, protocolo);
    const resultado = { ...leitura, protocolo, consultas };
    if (leitura.estado !== 'PROCESSANDO' || tempoDecorrido() + intervaloMs >= janelaMs) return resultado;
    await esperar(intervaloMs);
    esperaAcumuladaMs += intervaloMs;
    if (tempoDecorrido() >= janelaMs) return resultado;
    intervaloMs = Math.min(60_000, intervaloMs * 1.5);
  }
}
