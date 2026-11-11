import { lerIdDaLojaIfood } from '../core/campos';
import { diaDoPainelValido } from './painel-campos';
import { lerPaginaEventosV3 } from './financial-v3-eventos';
import { lerLiquidacoesV3 } from './financial-v3-liquidacoes';
import type { Transporte } from './transporte';

type Intervalo = Readonly<{ merchantId: string; inicio: string; fim: string }>;
export type ConsultaLiquidacoesV3 = Intervalo & { readonly filtro: 'APURACAO' | 'PAGAMENTO' };
const base = 'https://merchant-api.ifood.com.br/financial/v3.0/merchants/';
const tamanho = 100; // Tamanho padrão da referência v3 para Events.
const limiteDePaginas = 100; // Limite local por execução.

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
async function obter(transportar: Transporte, url: URL): Promise<string> {
  let resposta;
  try {
    resposta = await transportar({ url: url.href, metodo: 'GET', cabecalhos: { accept: 'application/json' }, tempoMaximoMs: 15_000 });
  } catch {
    throw new ErroConsultaFinancialV3('TRANSPORTE');
  }
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
    const pagina = lerPaginaEventosV3(await obter(transportar, url), { page, size: tamanho });
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
  const liquidacoes = lerLiquidacoesV3(await obter(transportar, url), consulta);
  return { filtro, liquidacoes };
}
