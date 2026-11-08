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
  /** Progresso independente: não emprestar o marco diário para saltar o histórico marginal. */
  pagamentos?: { primeiroDiaPlanejado?: string | null; historicosPendentes: number };
}

/** Uma loja por vez; no máximo 35 janelas e uma histórica por perfil. Não faz I/O. */
export function planejarAnalytics(agora: number, loja: AgendaDaLoja): JanelaAnalytics[] {
  const instante = DateTime.fromMillis(agora, { zone: loja.fuso });
  const brasilia = DateTime.fromMillis(agora, { zone: 'America/Sao_Paulo' });
  if (!instante.isValid || !brasilia.isValid) throw new Error('Fuso ou instante inválido para o planejamento.');
  const hoje = instante.startOf('day');
  const ciclo = hoje.toISODate()!;
  const janela = (dia: string, tipo: JanelaAnalytics['tipo'], perfil?: JanelaAnalytics['perfil']): JanelaAnalytics => ({ moduloId: loja.moduloId, dia, tipo, ciclo, fuso: loja.fuso, unidade: loja.unidade, ...(perfil ? { perfil } : {}) });
  const resultado = [janela(hoje.minus({ days: 1 }).toISODate()!, 'ACESSO')];
  if (!loja.ativo || brasilia.hour * 60 + brasilia.minute < 570) return resultado;
  for (const perfil of ['diario', 'pagamentos'] as const) {
    const marco = perfil === 'diario' ? loja : (loja.pagamentos ?? { historicosPendentes: 0 });
    for (let n = 1; n <= 16; n++) resultado.push(janela(hoje.minus({ days: n }).toISODate()!, n === 1 ? 'D1' : 'REVISAO', perfil));
    if (marco.historicosPendentes >= 20) continue;
    const primeiro = marco.primeiroDiaPlanejado ? DateTime.fromISO(marco.primeiroDiaPlanejado, { zone: loja.fuso }) : hoje.minus({ days: 16 });
    if (!primeiro.isValid) throw new Error('Marco do histórico inválido.');
    const proximo = primeiro.minus({ days: 1 });
    if (proximo >= hoje.minus({ months: 13 })) resultado.push(janela(proximo.toISODate()!, 'HISTORICO', perfil));
  }
  return resultado;
}
