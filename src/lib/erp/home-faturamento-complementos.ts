/** Projeção pura do mesmo total mensal já autorizado; não consulta nem calcula ticket. */
import type { TotaisDoRecorte } from './faturamento-campos';
import type { EstadoDoWidgetHome } from './home-contratos';

export interface ComplementosFaturamentoHome {
  estado: 'ok' | 'parcial' | 'sem_dados' | 'indisponivel' | 'erro';
  pedidos: number | null;
  /** Cópia de total.clientes: atendimentos informados, nunca pessoas únicas. */
  atendimentos: number | null;
  ticketMedioCentavos: number | null;
  aviso: string | null;
}

const contador = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const vazio = (estado: ComplementosFaturamentoHome['estado'], aviso: string): ComplementosFaturamentoHome => ({
  estado, pedidos: null, atendimentos: null, ticketMedioCentavos: null, aviso,
});

/** O chamador confere loja/alcance/mês antes; o leitor só é chamado com lançamento válido. */
export function complementosDoFaturamento(
  estado: EstadoDoWidgetHome,
  lerTotal?: () => TotaisDoRecorte,
): ComplementosFaturamentoHome {
  if (estado === 'sem_dados') return vazio('sem_dados', 'Ainda não há lançamentos para informar pedidos, atendimentos e ticket médio.');
  if (estado === 'erro') return vazio('erro', 'Não foi possível carregar pedidos, atendimentos e ticket médio.');
  if ((estado !== 'ok' && estado !== 'parcial') || !lerTotal) return vazio('indisponivel', 'Pedidos, atendimentos e ticket médio não estão disponíveis nesta leitura.');
  try {
    const total = lerTotal();
    const pedidos = total.pedidos, atendimentos = total.clientes, ticketMedioCentavos = total.ticketMedioCentavos;
    if (!contador(pedidos) || !contador(atendimentos)
      || (ticketMedioCentavos !== null && !Number.isSafeInteger(ticketMedioCentavos))
      || (pedidos === 0 && ticketMedioCentavos !== null)) {
      return vazio('indisponivel', 'Pedidos, atendimentos e ticket médio não puderam ser conferidos nesta leitura.');
    }
    return {
      estado, pedidos, atendimentos, ticketMedioCentavos,
      aviso: estado === 'parcial'
        ? 'Valores dos lançamentos informados; há canais sem lançamento. Atendimentos não representam pessoas únicas.'
        : 'Atendimentos informados não representam pessoas únicas.',
    };
  } catch {
    return vazio('erro', 'Não foi possível carregar pedidos, atendimentos e ticket médio.');
  }
}
