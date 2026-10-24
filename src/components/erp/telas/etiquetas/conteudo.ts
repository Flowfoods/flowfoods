/**
 * Etiquetas (3.4): o conteúdo da etiqueta atravessa do servidor para a tela do navegador como texto (as datas em ISO), e a
 * prévia ao vivo o desenha de novo com a MESMA função do ZPL (`montarEtiqueta`). O papel final sempre sai do servidor.
 */

import type { ConteudoDaEtiqueta } from '@/lib/erp/etiqueta-zpl';

export type ConteudoSerial = Omit<ConteudoDaEtiqueta, 'manipuladoEm' | 'abertoEm' | 'validade'> & {
  manipuladoEm: string | null;
  abertoEm: string | null;
  validade: { tipo: 'instante'; em: string } | { tipo: 'dia'; dia: string } | { tipo: 'nao-informada' } | { tipo: 'consumo-imediato' };
};

export function serializar(c: ConteudoDaEtiqueta): ConteudoSerial {
  return {
    ...c,
    manipuladoEm: c.manipuladoEm ? c.manipuladoEm.toISOString() : null,
    abertoEm: c.abertoEm ? c.abertoEm.toISOString() : null,
    validade: c.validade.tipo === 'instante' ? { tipo: 'instante', em: c.validade.em.toISOString() } : c.validade,
  };
}

export function desserializar(s: ConteudoSerial): ConteudoDaEtiqueta {
  return {
    ...s,
    manipuladoEm: s.manipuladoEm ? new Date(s.manipuladoEm) : null,
    abertoEm: s.abertoEm ? new Date(s.abertoEm) : null,
    validade: s.validade.tipo === 'instante' ? { tipo: 'instante', em: new Date(s.validade.em) } : s.validade,
  };
}

/** Uma chave de envio nova (duplo clique, rede que volta: a mesma chave = o mesmo registro). */
export function chaveNova(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return `env-${c.randomUUID()}`;
  return `env-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
