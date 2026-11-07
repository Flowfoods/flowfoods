import { DateTime } from 'luxon';
import type { JanelaAnalytics } from './pipeline-tipos';

export interface AgendaDaLoja {
  moduloId: string;
  fuso: string;
  unidade: 'REAL' | 'CENTAVO';
  ativo: boolean;
  /** Data mais antiga já materializada. Não equivale ao primeiro dia com dados. */
  primeiroDiaPlanejado?: string | null;
  historicosPendentes: number;
}

/** Uma loja por vez; no máximo 18 janelas, das quais apenas uma é histórica. Não faz I/O. */
export function planejarAnalytics(agora: number, loja: AgendaDaLoja): JanelaAnalytics[] {
  const instante = DateTime.fromMillis(agora, { zone: loja.fuso });
  const brasilia = DateTime.fromMillis(agora, { zone: 'America/Sao_Paulo' });
  if (!instante.isValid || !brasilia.isValid) throw new Error('Fuso ou instante inválido para o planejamento.');
  const hoje = instante.startOf('day');
  const ciclo = hoje.toISODate()!;
  const janela = (dia: string, tipo: JanelaAnalytics['tipo']): JanelaAnalytics => ({ moduloId: loja.moduloId, dia, tipo, ciclo, fuso: loja.fuso, unidade: loja.unidade });
  const resultado = [janela(hoje.minus({ days: 1 }).toISODate()!, 'ACESSO')];
  if (!loja.ativo || brasilia.hour * 60 + brasilia.minute < 570) return resultado;
  for (let n = 1; n <= 16; n++) resultado.push(janela(hoje.minus({ days: n }).toISODate()!, n === 1 ? 'D1' : 'REVISAO'));
  if (loja.historicosPendentes >= 20) return resultado;
  const primeiro = loja.primeiroDiaPlanejado ? DateTime.fromISO(loja.primeiroDiaPlanejado, { zone: loja.fuso }) : hoje.minus({ days: 16 });
  if (!primeiro.isValid) throw new Error('Marco do histórico inválido.');
  const proximo = primeiro.minus({ days: 1 });
  if (proximo >= hoje.minus({ months: 13 })) resultado.push(janela(proximo.toISODate()!, 'HISTORICO'));
  return resultado;
}
