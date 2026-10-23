/**
 * Etiquetas (3.4): as frases do `?feito=` (o que acabou de acontecer) das telas de etiqueta e do lote na nota. A URL só
 * escolhe uma chave do mapa.
 */

import { fraseDe } from '../cadastro/estado';

const FEITO: Readonly<Record<string, string>> = {
  emitida: 'Etiqueta emitida. Agora mande para a impressora: a Zebra, o arquivo .zpl ou o papel.',
  impressa: 'Registrado: a etiqueta saiu de “Esperando a impressora”, com o seu nome e a hora.',
  'ja-emitida': 'Esta etiqueta já tinha sido emitida (o mesmo toque, ou outra aba): nenhuma etiqueta nova.',
  aberta: 'Abertura registrada com a data e a hora de agora. Emita a etiqueta e cole na embalagem.',
  'ja-aberta': 'Esta abertura já estava registrada (o mesmo toque, ou outra aba): nada mudou.',
  'lote-registrado': 'Lote registrado. Ele aparece na hora de abrir a embalagem deste insumo nesta loja.',
  'lote-ja': 'Este lote já estava registrado neste insumo da nota: nada mudou.',
  'lote-tirado': 'Lote tirado da nota. A nota não mudou.',
  'lote-ja-tirado': 'Este lote já não estava na nota.',
};

export const fraseDasEtiquetas = (feito: string | undefined) => fraseDe(FEITO, feito);
