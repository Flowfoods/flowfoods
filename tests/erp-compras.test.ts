/**
 * ERP 1.5 · Entrada de compra — regras puras (sem banco).
 *
 * Heranças da 1.4: (b) o marcador JPEG 0xC8 (reservado, JPG) sai da lista do
 * que fica; (c) ficha com principal marcada e nenhuma validade avisa.
 */
import { describe, expect, it } from 'vitest';
import { limparMetadados, MENSAGEM_JPEG_ESTRANHO } from '@/lib/erp/foto-metadados';
import { JPG_LIMPO } from './erp-fotos-teste';

describe('ERP 1.5 (herança b da 1.4) · JPEG: o reservado 0xC8 recusa', () => {
  const comSegmento = (marcador: number, dados: number[]) =>
    new Uint8Array([0xff, 0xd8, 0xff, marcador, 0, dados.length + 2, ...dados, ...JPG_LIMPO.subarray(2)]);

  it('C8 (JPG, reservado para extensões) recusa a foto inteira', () => {
    expect(limparMetadados(comSegmento(0xc8, [1, 2, 3, 4]), 'jpg')).toEqual({ ok: false, erro: MENSAGEM_JPEG_ESTRANHO });
  });

  it('os vizinhos que desenham a imagem continuam ficando (C4 DHT, CC DAC)', () => {
    for (const m of [0xc4, 0xcc]) {
      const r = limparMetadados(comSegmento(m, [0, 2]), 'jpg');
      expect(r.ok, `marcador ${m.toString(16)}`).toBe(true);
    }
  });
});
