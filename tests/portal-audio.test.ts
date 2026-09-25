import { describe, expect, it } from 'vitest';
import {
  LIMITE_GRAVACAO_S,
  ehAudio,
  extensaoDoMime,
  formatarDuracao,
  mimeDoNome,
  nomeDaGravacao,
} from '@/lib/portal/audio';

describe('áudio gravado no formulário', () => {
  it('escolhe a extensão pelo formato que o navegador gravou', () => {
    expect(extensaoDoMime('audio/webm;codecs=opus')).toBe('webm');
    expect(extensaoDoMime('audio/mp4')).toBe('m4a'); // iPhone
    expect(extensaoDoMime('audio/ogg;codecs=opus')).toBe('ogg');
    expect(extensaoDoMime('')).toBe('webm');
  });

  it('dá um nome legível, com item, data e hora', () => {
    const quando = new Date(2026, 8, 25, 14, 7);
    expect(nomeDaGravacao('p1.1', quando, 'audio/webm')).toBe('Audio p1.1 25-09 14h07.webm');
    expect(nomeDaGravacao('p6.3', quando, 'audio/mp4')).toBe('Audio p6.3 25-09 14h07.m4a');
  });

  it('reconhece áudio pela extensão, para o painel tocar em vez de baixar', () => {
    expect(ehAudio('Audio p1.1 25-09 14h07.webm')).toBe(true);
    expect(ehAudio('gravacao.M4A')).toBe(true);
    expect(ehAudio('Faturamento mensal 2025.xlsx')).toBe(false);
    expect(ehAudio('sem-extensao')).toBe(false);
    expect(mimeDoNome('x.webm')).toBe('audio/webm');
    expect(mimeDoNome('x.m4a')).toBe('audio/mp4');
    expect(mimeDoNome('x.pdf')).toBeNull();
  });

  it('mostra a duração como relógio', () => {
    expect(formatarDuracao(0)).toBe('0:00');
    expect(formatarDuracao(7)).toBe('0:07');
    expect(formatarDuracao(102.9)).toBe('1:42');
    expect(formatarDuracao(LIMITE_GRAVACAO_S)).toBe('10:00');
  });
});
