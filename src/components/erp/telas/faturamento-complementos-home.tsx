/** Complementos do mesmo lançamento mensal; somente apresentação, sem conta. */
import type { FaturamentoDiarioHome, WidgetFaturamentoHome } from '@/lib/erp/home-analitico';
import type { ComplementosFaturamentoHome } from '@/lib/erp/home-faturamento-complementos';
import { ValorMonetarioHome } from './valor-monetario-home';

const indisponivel = (): ComplementosFaturamentoHome => ({ estado: 'indisponivel', pedidos: null, atendimentos: null, ticketMedioCentavos: null, aviso: 'Pedidos, atendimentos e ticket médio não estão disponíveis nesta leitura.' });
const contador = (n: unknown) => Number.isSafeInteger(n) && typeof n === 'number' && n >= 0;

function mesmoRecorte(widget: WidgetFaturamentoHome, leitura: FaturamentoDiarioHome): boolean {
  const ref = widget.referencia;
  const destino = new URL(widget.detalhe.href, 'https://flowfoods.invalid'); // Só análise, sem requisição.
  return widget.detalhe.href === leitura.detalhe.href
    && destino.searchParams.get('loja') === widget.escopo.lojaId && destino.searchParams.get('mes') === leitura.mes
    && ref?.base === 'mes_civil' && ref.inicio?.slice(0, 7) === leitura.mes && ref.fim?.slice(0, 7) === leitura.mes
    && ref.apuradoAte === leitura.hoje && widget.consultadoEm === leitura.consultadoEm
    && widget.estado === leitura.estado && widget.valor.valor === leitura.totalCentavos;
}

function paraExibir(widget: WidgetFaturamentoHome, leitura: FaturamentoDiarioHome): ComplementosFaturamentoHome | null {
  try {
    const c = widget.complementos;
    if (c == null) return null;
    const { estado, pedidos, atendimentos, ticketMedioCentavos, aviso } = c;
    if (!['ok', 'parcial', 'sem_dados', 'indisponivel', 'erro'].includes(estado) || (aviso !== null && typeof aviso !== 'string')) return indisponivel();
    if (estado !== 'ok' && estado !== 'parcial') return { estado, pedidos: null, atendimentos: null, ticketMedioCentavos: null, aviso };
    if ((widget.estado !== 'ok' && widget.estado !== 'parcial') || !mesmoRecorte(widget, leitura)
      || widget.origem?.fonte !== 'faturamento' || widget.escopo.tipo !== 'loja'
      || !contador(pedidos) || !contador(atendimentos) || (ticketMedioCentavos !== null && !Number.isSafeInteger(ticketMedioCentavos))
      || (pedidos === 0 && ticketMedioCentavos !== null)) return indisponivel();
    return { estado, pedidos, atendimentos, ticketMedioCentavos, aviso };
  } catch {
    return { ...indisponivel(), estado: 'erro' };
  }
}

export function FaturamentoComplementosHome({ widget, leitura }: { widget: WidgetFaturamentoHome; leitura: FaturamentoDiarioHome }) {
  const c = paraExibir(widget, leitura);
  if (!c) return null;
  const disponivel = c.estado === 'ok' || c.estado === 'parcial';
  const parcial = c.estado === 'parcial' || (disponivel && widget.estado === 'parcial');
  return (
    <div role="group" aria-label="Complementos do Faturamento" className="min-w-0 space-y-3 border-b border-linha pb-4">
      <p className="text-[12px] font-medium leading-relaxed text-suave">Dos lançamentos informados{parcial ? ' · leitura parcial' : ''}</p>
      {disponivel ? (
        <dl className="grid min-w-0 gap-3 sm:grid-cols-3">
          <div className="min-w-0"><dt className="text-[12px] text-suave">Pedidos</dt><dd className="mt-1 break-words font-display text-[22px] font-bold leading-tight tabular-nums text-texto [overflow-wrap:anywhere]">{c.pedidos!.toLocaleString('pt-BR')}</dd></div>
          <div className="min-w-0"><dt className="text-[12px] text-suave">Atendimentos</dt><dd className="mt-1 break-words font-display text-[22px] font-bold leading-tight tabular-nums text-texto [overflow-wrap:anywhere]">{c.atendimentos!.toLocaleString('pt-BR')}</dd></div>
          <div className="min-w-0"><dt className="text-[12px] text-suave">Ticket médio</dt><dd className="mt-1 font-display text-[22px] font-bold leading-tight tabular-nums text-texto">{c.ticketMedioCentavos === null ? <span className="text-[16px]">Não disponível</span> : <ValorMonetarioHome centavos={c.ticketMedioCentavos} />}</dd></div>
        </dl>
      ) : (
        <p className="text-[12px] font-medium leading-relaxed text-suave">{c.estado === 'sem_dados' ? 'Complementos sem dados neste mês.' : 'Complementos indisponíveis nesta leitura.'}</p>
      )}
      <p className="break-words text-[12px] leading-relaxed text-suave">{c.aviso || 'Atendimentos informados não representam pessoas únicas.'}</p>
    </div>
  );
}
