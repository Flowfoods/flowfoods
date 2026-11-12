import { dinheiroAnalytics } from './formato-analytics';

export function formatarCompetenciaFinancial(mes: string) {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${mes}-01T00:00:00Z`));
}

export const dinheiroFinancial = (valor: bigint | null) => valor === null ? '—' : dinheiroAnalytics(valor.toString());

export function MedidaFinancial({ rotulo, valor }: { rotulo: string; valor: string }) {
  return <div className="min-w-0">
    <dt className="text-[12px] text-suave">{rotulo}</dt>
    <dd className="mt-1 break-words font-semibold tabular-nums text-texto">{valor}</dd>
  </div>;
}
