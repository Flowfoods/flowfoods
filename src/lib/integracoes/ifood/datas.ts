import { diaDoPainelValido } from './painel-campos';

/** Instante ISO com fuso explícito. O chamador conserva a representação recebida. */
export function instanteIsoComFusoValido(valor: unknown): valor is string {
  if (typeof valor !== 'string' || valor.length > 256) return false;
  const partes = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/i.exec(valor);
  return partes !== null && diaDoPainelValido(partes[1]);
}

/** Datas civis do Analytics: intervalo [dia, dia seguinte), sem normalizar datas inexistentes. */
export function diaSeguinte(dia: string): string | null {
  if (typeof dia !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dia) || dia < '0001-01-01' || dia >= '9999-12-31') return null;
  const d = new Date(`${dia}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== dia) return null;
  return new Date(d.getTime() + 86_400_000).toISOString().slice(0, 10);
}

export function ontemNoFuso(agora: number, fuso = 'America/Sao_Paulo'): string {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(agora));
  const parte = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)!.value;
  const hoje = `${parte('year')}-${parte('month')}-${parte('day')}`;
  return new Date(Date.parse(`${hoje}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

export const ontemEmBrasilia = (agora: number): string => ontemNoFuso(agora);
