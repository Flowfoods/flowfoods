/**
 * Estado da instância da Evolution em palavra de gente ("close" não é texto de
 * tela). Puro: serve a Hoje, Métricas, Config e à explicação do envio parado.
 */

export type TomDaInstancia = 'ok' | 'alerta' | 'erro';

/** `curto` cabe no número grande de um card a 390 px (a Hoje); `texto` é o nome por extenso. */
const ROTULOS: Record<string, { texto: string; curto: string; tom: TomDaInstancia }> = {
  open: { texto: 'Conectado', curto: 'Conectado', tom: 'ok' },
  connecting: { texto: 'Conectando', curto: 'Conectando', tom: 'alerta' },
  close: { texto: 'Desconectado', curto: 'Fora do ar', tom: 'erro' },
};

export function situacaoDaInstancia(estado: string | null | undefined): { texto: string; curto: string; tom: TomDaInstancia } {
  return ROTULOS[estado ?? 'close'] ?? { texto: 'Sem resposta da Evolution', curto: 'Sem resposta', tom: 'erro' };
}
