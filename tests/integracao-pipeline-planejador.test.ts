import { describe, expect, it } from 'vitest';
import { planejarAnalytics, type AgendaDaLoja } from '@/lib/integracoes/ifood/pipeline-planejador';

const loja: AgendaDaLoja = { moduloId: 'modulo', fuso: 'America/Sao_Paulo', unidade: 'REAL', ativo: true, historicosPendentes: 0 };
describe('INT-1.6 · calendário e materialização limitada', () => {
  it('a fronteira das 9h30 BRT não antecipa D1; depois são16 dias distintos e só um histórico', () => {
    expect(planejarAnalytics(Date.parse('2026-11-07T12:29:59Z'), loja).map(j => j.tipo)).toEqual(['ACESSO']);
    const j = planejarAnalytics(Date.parse('2026-11-07T12:30:00Z'), loja);
    expect(j).toHaveLength(18);
    expect(j.filter(x => x.tipo === 'D1').map(x => x.dia)).toEqual(['2026-11-06']);
    expect(j.filter(x => x.tipo === 'REVISAO').map(x => x.dia)).toEqual([
      '2026-11-05', '2026-11-04', '2026-11-03', '2026-11-02', '2026-11-01', '2026-10-31', '2026-10-30', '2026-10-29',
      '2026-10-28', '2026-10-27', '2026-10-26', '2026-10-25', '2026-10-24', '2026-10-23', '2026-10-22',
    ]);
    expect(j.at(-1)?.dia).toBe('2026-10-21');
    expect(new Set(j.filter(x => x.tipo !== 'ACESSO').map(x => x.dia)).size).toBe(17);
  });
  it('ontem vem do fuso da loja; o gatilho horário continua em Brasília', () => {
    const j = planejarAnalytics(Date.parse('2026-11-07T23:30:00Z'), { ...loja, fuso: 'Asia/Tokyo' });
    expect(j.find(x => x.tipo === 'D1')).toMatchObject({ dia: '2026-11-07', ciclo: '2026-11-08', fuso: 'Asia/Tokyo' });
  });
  it('retoma histórico atrás do primeiro marco e não interpreta vazio como fim', () => {
    const j = planejarAnalytics(Date.parse('2026-11-07T14:00:00Z'), { ...loja, primeiroDiaPlanejado: '2026-10-01' });
    expect(j.at(-1)).toMatchObject({ dia: '2026-09-30', tipo: 'HISTORICO' });
  });
  it('limita a materialização pendente e respeita13 meses sem criar limpeza', () => {
    for (const extra of [{ historicosPendentes: 20 }, { primeiroDiaPlanejado: '2025-10-07' }]) {
      const j = planejarAnalytics(Date.parse('2026-11-07T14:00:00Z'), { ...loja, ...extra });
      expect(j).toHaveLength(17);
      expect(j.some(x => x.tipo === 'HISTORICO')).toBe(false);
    }
  });
  it('módulo autorizado mas não ativo apenas verifica acesso', () => {
    expect(planejarAnalytics(Date.parse('2026-11-07T14:00:00Z'), { ...loja, ativo: false }).map(j => j.tipo)).toEqual(['ACESSO']);
  });
  it('ano bissexto não gera datas inexistentes', () => {
    const j = planejarAnalytics(Date.parse('2024-03-01T14:00:00Z'), loja);
    expect(j.find(x => x.tipo === 'D1')?.dia).toBe('2024-02-29');
  });
  it('recusa fuso e marco inválidos', () => {
    expect(() => planejarAnalytics(Date.now(), { ...loja, fuso: 'não-existe' })).toThrow();
    expect(() => planejarAnalytics(Date.parse('2026-11-07T14:00:00Z'), { ...loja, primeiroDiaPlanejado: '2026-02-30' })).toThrow();
  });
});
