import { dinheiroAnalytics } from './formato-analytics';
import { MedidaFinancial } from './medidas-conferencia-financial';

/** Mesma leitura de valores do parceiro, com liquidação quando o saldo do envelope está disponível. */
export function SaldosConferenciaFinancial({ arquivoCentavos, eventosCentavos, liquidacaoCentavos }: {
  arquivoCentavos: string; eventosCentavos: string; liquidacaoCentavos?: string;
}) {
  const diferenca = (a: string, b: string) => dinheiroAnalytics((BigInt(a) - BigInt(b)).toString());
  return <dl className="mt-2 grid gap-3 sm:grid-cols-3">
    <MedidaFinancial rotulo="Arquivo mensal" valor={dinheiroAnalytics(arquivoCentavos)} />
    <MedidaFinancial rotulo="Eventos financeiros" valor={dinheiroAnalytics(eventosCentavos)} />
    <MedidaFinancial rotulo="Eventos menos arquivo" valor={diferenca(eventosCentavos, arquivoCentavos)} />
    {liquidacaoCentavos !== undefined && <>
      <MedidaFinancial rotulo="Saldo da liquidação" valor={dinheiroAnalytics(liquidacaoCentavos)} />
      <MedidaFinancial rotulo="Liquidação menos eventos" valor={diferenca(liquidacaoCentavos, eventosCentavos)} />
    </>}
  </dl>;
}
