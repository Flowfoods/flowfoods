import { describe, expect, it } from 'vitest';
import type { CoberturaDoPainelAnalytics } from '@/lib/integracoes/ifood/painel-campos';
import { horaComplementarConhecida, resumirComplementaresDoPainel, type OcorrenciaComplementar } from '@/lib/integracoes/ifood/painel-complementares';

const cobertura = (mudancas: Partial<CoberturaDoPainelAnalytics> = {}): CoberturaDoPainelAnalytics => ({
  completa: true, diasEsperados: 1, diasCompletos: 1, fontesSelecionadas: 1,
  paresEsperados: 1, paresCobertos: 1, dias: [], ...mudancas,
});
const presentes = { horarios: false, primeirosPedidos: false };
const linha = (termo: string, ocorrencias = '1'): OcorrenciaComplementar => ({ termo, ocorrencias });
describe('Horário e primeiro pedido: resumo de ocorrências na origem', () => {
  it('preserva denominadores independentes e soma exata entre fontes', () => {
    const r = resumirComplementaresDoPainel(cobertura(), [linha('14', '9007199254740991'), linha('14', '20')],
      [linha('true', '4'), linha('false', '6')], presentes);
    expect(r.horarios.total).toEqual({ estado: 'disponivel', valor: '9007199254741011' });
    expect(r.primeirosPedidos.total).toEqual({ estado: 'disponivel', valor: '10' });
    expect(r.horarios.distribuicao).toEqual({ estado: 'disponivel', valor: [linha('14', '9007199254741011')] });
  });
  it.each(['nulo', 'vazio', 'zero'] as const)('combina horário %s com todos os estados do primeiro pedido', horario => {
    for (const primeiro of ['nulo', 'vazio', 'zero'] as const) {
      const r = resumirComplementaresDoPainel(cobertura(), horario === 'zero' ? [linha('0', '0')] : [],
        primeiro === 'zero' ? [linha('true', '0')] : [], { horarios: horario === 'nulo', primeirosPedidos: primeiro === 'nulo' });
      for (const [estado, dados, termo] of [[horario, r.horarios, '0'], [primeiro, r.primeirosPedidos, 'true']] as const) {
        expect(dados.total).toEqual(estado === 'nulo' ? { estado: 'sem-dado', motivo: 'valor-nao-informado' } : { estado: 'disponivel', valor: '0' });
        expect(dados.distribuicao).toEqual(estado === 'nulo' ? dados.total : { estado: 'disponivel', valor: estado === 'vazio' ? [] : [linha(termo, '0')] });
      }
    }
  });
  it('ordena horas canônicas numericamente, sem criar zeros para horas omitidas', () => {
    const r = resumirComplementaresDoPainel(cobertura(), ['23', '9', '0', '14'].map(v => linha(v)), [], presentes);
    expect(r.horarios.distribuicao).toEqual({ estado: 'disponivel', valor: ['0', '9', '14', '23'].map(v => linha(v)) });
  });
  it.each(['00', '01', '24', '-1', '1e1', '1.0', ' 1', '__proto__', 'null', 'Novo 🕘'])('preserva hora desconhecida %s sem coerção', termo => {
    expect(horaComplementarConhecida(termo)).toBeNull();
    const r = resumirComplementaresDoPainel(cobertura(), [linha(termo, '0'), linha('2')], [], presentes);
    expect(r.horarios.distribuicao).toEqual({ estado: 'disponivel', valor: [linha('2'), linha(termo, '0')] });
  });
  it('preserva termos novos do primeiro pedido sem juntá-los a false', () => {
    const termos = ['TRUE', '__proto__', 'constructor', 'null', 'true', 'false'];
    const r = resumirComplementaresDoPainel(cobertura(), [], termos.map(v => linha(v)), presentes);
    expect(r.primeirosPedidos.distribuicao).toEqual({ estado: 'disponivel', valor:
      ['true', 'false', 'TRUE', '__proto__', 'constructor', 'null'].map(v => linha(v)) });
    expect(r.primeirosPedidos.total).toEqual({ estado: 'disponivel', valor: '6' });
  });
  it('cobertura parcial impede os dois totais, mesmo com valores disponíveis', () => {
    const r = resumirComplementaresDoPainel(cobertura({ completa: false }), [linha('0', '15')], [linha('true', '10')], presentes);
    expect(r.horarios.total).toEqual({ estado: 'sem-dado', motivo: 'cobertura-parcial' });
    expect(r.primeirosPedidos.total).toEqual(r.horarios.total);
  });
  it('sem fontes conserva motivo próprio', () => {
    const r = resumirComplementaresDoPainel(cobertura({ completa: false, fontesSelecionadas: 0 }), [], [], presentes);
    expect(r.horarios.total).toEqual({ estado: 'sem-dado', motivo: 'sem-fontes' });
    expect(r.primeirosPedidos.total).toEqual(r.horarios.total);
  });
  it.each(['-1', '1.1', '01', '1e3'])('recusa contagem não canônica %s em ambos campos', valor => {
    expect(() => resumirComplementaresDoPainel(cobertura(), [linha('0', valor)], [], presentes)).toThrow();
    expect(() => resumirComplementaresDoPainel(cobertura(), [], [linha('true', valor)], presentes)).toThrow();
  });
  it('recusa excesso de termos sem truncar', () => {
    const termos = Array.from({ length: 2001 }, (_, i) => linha(`novo${i}`));
    expect(() => resumirComplementaresDoPainel(cobertura(), termos, [], presentes)).toThrow(/Reduza/);
    expect(() => resumirComplementaresDoPainel(cobertura(), [], termos, presentes)).toThrow(/Reduza/);
  });
});
