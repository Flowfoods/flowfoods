import { describe, expect, it } from 'vitest';
import { hashDoToken, tokenJaUsado } from '@/lib/rodolfo/setup-token';

describe('token de setup: vale uma vez, e um token novo reabre o setup', () => {
  const atual = hashDoToken('token-a');

  it('hash é determinístico e não é o token', () => {
    expect(hashDoToken('token-a')).toBe(atual);
    expect(atual).toHaveLength(64);
    expect(atual).not.toContain('token-a');
  });

  it('admin existe mas não há registro do setup: bloqueia, o token pode ser o original', () => {
    expect(tokenJaUsado(atual, null)).toBe(true);
    expect(tokenJaUsado(atual, undefined)).toBe(true);
  });

  it('o mesmo token do último setup está usado', () => {
    expect(tokenJaUsado(atual, { email: 'x@y', tokenHash: atual })).toBe(true);
  });

  it('um token diferente do último setup reabre o setup', () => {
    expect(tokenJaUsado(atual, { email: 'x@y', tokenHash: hashDoToken('token-b') })).toBe(false);
  });

  it('registro antigo, sem hash, bloqueia: o token do primeiro setup não volta a valer', () => {
    expect(tokenJaUsado(atual, { email: 'x@y' })).toBe(true);
    expect(tokenJaUsado(atual, { email: 'x@y', tokenHash: 42 })).toBe(true);
  });
});
