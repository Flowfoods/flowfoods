/** F4 — as fotos de apoio da ficha, regras puras (a lista guardada na ficha, saneada). */

import { NOME_DA_FOTO } from './foto';

export const MAXIMO_DE_APOIOS = 8;
export const LEGENDA_MAX = 120;

export interface FotoDeApoio {
  arquivo: string;
  mime: string;
  bytes: number;
  legenda: string | null;
}

/** A lista guardada, saneada: só item no formato, sem repetição, até o máximo. */
export function lerFotosDeApoio(v: unknown): FotoDeApoio[] {
  if (!Array.isArray(v)) return [];
  const vistos = new Set<string>();
  const r: FotoDeApoio[] = [];
  for (const x of v) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    if (typeof o.arquivo !== 'string' || !NOME_DA_FOTO.test(o.arquivo) || vistos.has(o.arquivo)) continue;
    if (typeof o.mime !== 'string' || !/^image\/(jpeg|png|webp)$/.test(o.mime)) continue;
    vistos.add(o.arquivo);
    r.push({
      arquivo: o.arquivo,
      mime: o.mime,
      bytes: typeof o.bytes === 'number' && Number.isFinite(o.bytes) ? Math.max(0, Math.trunc(o.bytes)) : 0,
      legenda: typeof o.legenda === 'string' && o.legenda.trim() ? o.legenda.trim().slice(0, LEGENDA_MAX) : null,
    });
    if (r.length === MAXIMO_DE_APOIOS) break;
  }
  return r;
}

