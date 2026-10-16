/**
 * Redirect depois do login: só caminho interno da área (fiscal Guardião,
 * `?callbackUrl=javascript:alert(1)` executava no /rodolfo/login).
 */
import { describe, expect, it } from 'vitest';
import { AREA_DO_ERP, AREA_DO_RODOLFO, destinoSeguro } from '@/lib/destino-seguro';

const O = 'https://portal.consultoriaflowfoods.com.br';
const rodolfo = (cb: string | null) => destinoSeguro(cb, O, AREA_DO_RODOLFO, '/rodolfo');

describe('destino depois de entrar', () => {
  it('aceita caminho interno do /rodolfo, com busca e âncora', () => {
    expect(rodolfo('/rodolfo/leads?status=novo#x')).toBe('/rodolfo/leads?status=novo#x');
    expect(rodolfo('/rodolfo')).toBe('/rodolfo');
    expect(rodolfo(`${O}/rodolfo/erp`)).toBe('/rodolfo/erp');
  });

  it('recusa javascript:, data:, outro site, protocolo relativo e fora da área', () => {
    for (const cb of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(document.cookie)',
      'data:text/html,<script>alert(1)</script>',
      'https://evil.example/rodolfo',
      '//evil.example/rodolfo',
      '/\\evil.example',
      '/rodolfoX',
      '/erp',
      '/',
      '/rodolfo/../portal/x',
    ]) {
      expect(rodolfo(cb), cb).toBe('/rodolfo');
    }
    expect(rodolfo(null)).toBe('/rodolfo');
    expect(rodolfo('')).toBe('/rodolfo');
  });

  it('área do ERP: /erp e /entrar/escolher', () => {
    expect(destinoSeguro('/erp', O, AREA_DO_ERP, '/erp')).toBe('/erp');
    expect(destinoSeguro('/entrar/escolher', O, AREA_DO_ERP, '/erp')).toBe('/entrar/escolher');
    expect(destinoSeguro('javascript:alert(1)', O, AREA_DO_ERP, '/erp')).toBe('/erp');
  });
});
