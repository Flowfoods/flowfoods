/** Origem mínima da aplicação efetiva. O caller já exige faturamento.ver. */
import Link from 'next/link';
import type { OrigemAnalyticsNoFaturamento } from '@/lib/integracoes/core/situacao-analytics-campos';
import { Selo } from '@/components/erp/ui/superficies';
import { LINK_DE_TEXTO } from '@/components/erp/ui/estilos';
import { InstanteDaIntegracao } from '../integracoes/data-da-situacao';

export function SeloOrigemAnalytics({ origem, hrefIntegracao }: {
  origem: OrigemAnalyticsNoFaturamento | null;
  /** Ausente sem integracao.ver/liberação; o selo por si não exige esse acesso. */
  hrefIntegracao?: string;
}) {
  if (!origem) return null;
  return (
    <div className="min-w-0 space-y-2 text-[13px] text-suave">
      <Selo>Origem: iFood Analytics</Selo>
      <p>Aplicado em <InstanteDaIntegracao valor={origem.aplicadoEm} /> · horário de São Paulo.</p>
      {origem.atualizacaoPendente && <p>Há uma atualização pendente. O valor aplicado anteriormente foi preservado.</p>}
      {hrefIntegracao && <Link href={hrefIntegracao} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center`}>Conferir a situação da integração</Link>}
    </div>
  );
}
