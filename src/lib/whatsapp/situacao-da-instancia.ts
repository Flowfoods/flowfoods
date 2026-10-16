/**
 * Estado da instância da Evolution em palavra de gente ("close" não é texto de
 * tela). Puro: serve a Hoje, Métricas, Config e à explicação do envio parado.
 */

export type TomDaInstancia = 'ok' | 'alerta' | 'erro';

const ROTULOS: Record<string, { texto: string; tom: TomDaInstancia }> = {
  open: { texto: 'Conectado', tom: 'ok' },
  connecting: { texto: 'Conectando', tom: 'alerta' },
  close: { texto: 'Desconectado', tom: 'erro' },
};

export function situacaoDaInstancia(estado: string | null | undefined): { texto: string; tom: TomDaInstancia } {
  return ROTULOS[estado ?? 'close'] ?? { texto: 'Sem resposta da Evolution', tom: 'erro' };
}
