/** Composição da mesma leitura mensal autorizada, sem consulta ou nova totalização financeira. */
import type { LojaNoMes } from './faturamento';
import { CANAIS_EM_ORDEM, ehCanal, type CanalVenda } from './faturamento-campos';
import type { EstadoDoWidgetHome } from './home-contratos';

export interface ComposicaoFaturamentoHome {
  estado: 'ok' | 'parcial' | 'sem_dados' | 'indisponivel' | 'erro';
  totalCentavos: number | null;
  canais: {
    canal: CanalVenda;
    /** Null = nenhum lançamento no canal; zero exige presença na leitura canônica. */
    centavos: number | null;
    /** Lançamentos vencidos ausentes; hoje não é falta. */
    faltas: number;
    percentualBp: number | null;
  }[];
  aviso: string;
}

interface FonteDosCanais {
  totalCentavos: number;
  faltas: number;
  diasDoPeriodo: number;
  porCanal: LojaNoMes['porCanal'];
  faltasPorCanal: LojaNoMes['faltasPorCanal'];
  configurados: readonly CanalVenda[];
  /** Da série canônica: inclui o canal com zero declarado e histórico desativado. */
  comLancamento: readonly CanalVenda[];
}

export const inteiroNaoNegativo = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;

/** Somente apresentação: participação arredondada em pontos-base, sem alterar centavos. */
export function percentualDoInformado(centavos: number | null, total: number): number | null {
  if (centavos === null || total <= 0) return null;
  return Number((BigInt(centavos) * 20_000n + BigInt(total)) / (2n * BigInt(total)));
}

const vazio = (estado: ComposicaoFaturamentoHome['estado'], aviso: string): ComposicaoFaturamentoHome => ({ estado, totalCentavos: null, canais: [], aviso });
function exigir(condicao: unknown): asserts condicao {
  if (!condicao) throw new Error('Composição incompatível.');
}

/** A presença vem dos grãos já projetados, nunca de valor > 0 ou de quantidade de pedidos. */
export function projetarCanaisDoFaturamento(estado: EstadoDoWidgetHome, ler?: () => FonteDosCanais): ComposicaoFaturamentoHome {
  if (estado === 'sem_dados') return vazio('sem_dados', 'Ainda não há lançamentos neste mês.');
  if (estado === 'erro') return vazio('erro', 'Não foi possível carregar o faturamento por canal.');
  if ((estado !== 'ok' && estado !== 'parcial') || !ler) return vazio('indisponivel', 'A composição por canal está indisponível nesta leitura.');
  try {
    const f = ler();
    exigir(inteiroNaoNegativo(f.totalCentavos) && inteiroNaoNegativo(f.faltas)
      && inteiroNaoNegativo(f.diasDoPeriodo) && f.diasDoPeriodo >= 28 && f.diasDoPeriodo <= 31);
    exigir(Array.isArray(f.configurados) && f.configurados.every(ehCanal)
      && Array.isArray(f.comLancamento) && f.comLancamento.length > 0 && f.comLancamento.every(ehCanal)
      && new Set(f.configurados).size === f.configurados.length && new Set(f.comLancamento).size === f.comLancamento.length);
    const canais: ComposicaoFaturamentoHome['canais'] = [];
    let soma = 0n, faltas = 0;
    for (const canal of CANAIS_EM_ORDEM) {
      // Allowlist: não lê pedidos, clientes, ticket, conferência humana ou identificadores da integração.
      const centavos = f.porCanal[canal].valorCentavos, falta = f.faltasPorCanal[canal];
      exigir(inteiroNaoNegativo(centavos) && inteiroNaoNegativo(falta) && falta <= f.diasDoPeriodo);
      const presente = f.comLancamento.includes(canal);
      exigir(presente || centavos === 0);
      soma += BigInt(centavos); faltas += falta;
      if (f.configurados.includes(canal) || presente || falta > 0) canais.push({ canal, centavos: presente ? centavos : null, faltas: falta, percentualBp: null });
    }
    // Reconciliação dos números recebidos, sem refazer a precedência ou a soma dos grãos.
    exigir(soma === BigInt(f.totalCentavos) && faltas === f.faltas && (estado === 'parcial') === (faltas > 0));
    return {
      estado, totalCentavos: f.totalCentavos,
      canais: canais.map(c => ({ ...c, percentualBp: percentualDoInformado(c.centavos, f.totalCentavos) })),
      aviso: estado === 'parcial'
        ? 'Composição dos valores informados; há canais sem lançamento. Hoje ainda está em aberto.'
        : 'Composição dos valores informados no mês. Hoje ainda está em aberto.',
    };
  } catch {
    return vazio('indisponivel', 'A composição por canal não pôde ser conferida com o total deste mês.');
  }
}
