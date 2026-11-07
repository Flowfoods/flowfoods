import { MAX_PARCELAS_DO_PAINEL, type MedidaAnalytics, type MotivoSemDadoAnalytics, type ParcelaAnalytics, type ResumoDoPainelAnalytics } from './painel-campos';

/** Linhas agregadas no servidor; nunca são enviadas ao navegador. Contagens e somas SQL são texto exato. */
export interface LinhaAgregadaDoPainelAnalytics {
  dia: string;
  orderStatus: string | null;
  salesChannel: string | null;
  deliveredBy: string | null;
  pedidos: string;
  gmv: string | null;
  gmvSemEntrega: string | null;
}
export class RecorteGrandeDoPainel extends Error {
  constructor() { super('Reduza o período ou a seleção de fontes para conferir este painel.'); this.name = 'RecorteGrandeDoPainel'; }
}
export function inteiroExatoDoPainel(valor: string, contagem = false): bigint {
  if (typeof valor !== 'string' || !/^(?:0|[1-9]\d*|-[1-9]\d*)$/.test(valor)) throw new Error('Inteiro decimal não canônico no painel Analytics.');
  const n = BigInt(valor);
  if (contagem && n < 0n) throw new Error('Contagem negativa no painel Analytics.');
  return n;
}
const disponivel = <T>(valor: T): MedidaAnalytics<T> => ({ estado: 'disponivel', valor });
const semDado = <T>(motivo: MotivoSemDadoAnalytics): MedidaAnalytics<T> => ({ estado: 'sem-dado', motivo });

export function resumirPainelAnalytics(
  linhas: readonly LinhaAgregadaDoPainelAnalytics[], coberturaCompleta: boolean, temFontes = true,
): ResumoDoPainelAnalytics {
  const marginal = () => semDado<ParcelaAnalytics[]>('contrato-indisponivel');
  if (!temFontes || !coberturaCompleta) {
    const motivo = temFontes ? 'cobertura-parcial' : 'sem-fontes';
    return { indicadores: {
      gmv: semDado(motivo), gmvSemEntrega: semDado(motivo), gmvConcluido: semDado(motivo), gmvCancelado: semDado(motivo),
      pedidos: semDado(motivo), concluidos: semDado(motivo), cancelados: semDado(motivo), ticketConcluidos: semDado(motivo), taxaCancelamento: semDado(motivo),
    }, distribuicoes: { canal: semDado(motivo), status: semDado(motivo), logistica: semDado(motivo), pagamento: marginal(), horario: marginal(), primeiroPedido: marginal() } };
  }
  let pedidos = 0n, concluidos = 0n, cancelados = 0n;
  let gmv: bigint | null = 0n, semEntrega: bigint | null = 0n, gmvConcluido: bigint | null = 0n, gmvCancelado: bigint | null = 0n;
  let statusDesconhecido = false;
  const mapas = { canal: new Map<string | null, bigint>(), status: new Map<string | null, bigint>(), logistica: new Map<string | null, bigint>() };
  const somar = (atual: bigint | null, valor: bigint | null) => atual === null || valor === null ? null : atual + valor;
  for (const linha of linhas) {
    const quantidade = inteiroExatoDoPainel(linha.pedidos, true);
    const valor = linha.gmv === null ? null : inteiroExatoDoPainel(linha.gmv);
    const semFrete = linha.gmvSemEntrega === null ? null : inteiroExatoDoPainel(linha.gmvSemEntrega);
    pedidos += quantidade; gmv = somar(gmv, valor); semEntrega = somar(semEntrega, semFrete);
    if (linha.orderStatus === 'CONCLUDED') { concluidos += quantidade; gmvConcluido = somar(gmvConcluido, valor); }
    else if (linha.orderStatus === 'CANCELLED') { cancelados += quantidade; gmvCancelado = somar(gmvCancelado, valor); }
    else statusDesconhecido = true;
    for (const [mapa, chave] of [[mapas.canal, linha.salesChannel], [mapas.status, linha.orderStatus], [mapas.logistica, linha.deliveredBy]] as const) {
      mapa.set(chave, (mapa.get(chave) ?? 0n) + quantidade);
      if (mapa.size > MAX_PARCELAS_DO_PAINEL) throw new RecorteGrandeDoPainel();
    }
  }
  const dinheiro = (valor: bigint | null): MedidaAnalytics<string> => valor === null ? semDado('valor-nao-informado') : disponivel(valor.toString());
  const distribuicao = (mapa: Map<string | null, bigint>) => disponivel([...mapa].sort(([a], [b]) => a === b ? 0 : a === null ? -1 : b === null ? 1 : a < b ? -1 : 1).map(([valor, q]) => ({ valor, pedidos: q.toString() })));
  return { indicadores: {
    gmv: dinheiro(gmv), gmvSemEntrega: dinheiro(semEntrega), gmvConcluido: dinheiro(gmvConcluido), gmvCancelado: dinheiro(gmvCancelado),
    pedidos: disponivel(pedidos.toString()), concluidos: disponivel(concluidos.toString()), cancelados: disponivel(cancelados.toString()),
    ticketConcluidos: concluidos === 0n ? semDado('sem-pedidos') : gmvConcluido === null ? semDado('valor-nao-informado') : disponivel({ numerador: gmvConcluido.toString(), denominador: concluidos.toString() }),
    taxaCancelamento: statusDesconhecido ? semDado('status-nao-classificado') : pedidos === 0n ? semDado('sem-pedidos') : disponivel({ numerador: cancelados.toString(), denominador: pedidos.toString() }),
  }, distribuicoes: { canal: distribuicao(mapas.canal), status: distribuicao(mapas.status), logistica: distribuicao(mapas.logistica), pagamento: marginal(), horario: marginal(), primeiroPedido: marginal() } };
}
