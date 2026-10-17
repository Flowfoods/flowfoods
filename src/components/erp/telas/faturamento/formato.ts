/** Texto das telas de faturamento (2.1): datas, valores e a frase de quem lançou. */

import { formatarData } from '@/lib/erp/compra-campos';
import { nomeDoDiaDaSemana, ROTULO_DA_ORIGEM, type OrigemDoLancamento } from '@/lib/erp/faturamento-campos';

const SEM_R$ = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 435000 → "4.350,00" (o que o campo de faturamento mostra e o servidor lê de volta). */
export const textoDoValor = (centavos: number) => SEM_R$.format(centavos / 100);

const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** "quinta, 14/10/2026". */
export function dataLonga(iso: string): string {
  const dia = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return `${SEMANA[dia]}, ${formatarData(iso)}`;
}

/** "qui 14/10". */
export const dataCurta = (iso: string) => `${nomeDoDiaDaSemana(iso)} ${formatarData(iso, true)}`;

const QUANDO = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/** "Ana · 17/10 às 08:12 · Digitado". */
export function quemLancou(l: { atualizadoPorNome: string; atualizadoEm: Date; origem: OrigemDoLancamento }): string {
  const quando = QUANDO.format(l.atualizadoEm).replace(',', ' às');
  return `${l.atualizadoPorNome ? `${l.atualizadoPorNome} · ` : ''}${quando} · ${ROTULO_DA_ORIGEM[l.origem]}`;
}
