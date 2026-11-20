import { describe, expect, it } from 'vitest';
import { conferirCoberturaReviewSimulada, type PaginaReviewSimulada } from '@/lib/integracoes/ifood/review-cobertura-simulada';
import { cenarioCoberturaReviewSimulado, simularCoberturaReview } from '@/lib/integracoes/ifood/review-cobertura-cenario-simulado';

const cenario = () => cenarioCoberturaReviewSimulado();
function pagina(indice = 0): Extract<PaginaReviewSimulada, { tipo: 'OK' }> {
  const p = cenario().paginas[indice];
  if (p.tipo !== 'OK') throw Error('Fixture sem página OK');
  return p;
}
function conferir(paginas: unknown[], mudancas: Record<string, unknown> = {}) {
  return conferirCoberturaReviewSimulada({ ...cenario(), paginas, ...mudancas });
}
function vazia() { return { ...pagina(), proxima: { tipo: 'FIM' as const }, registros: [] }; }

describe('Review: cobertura e contagens abstratas', () => {
  it('reconcilia recebidos, repetidos, únicos e desconhecidos sem atribuir elegibilidade', () => {
    const r = conferirCoberturaReviewSimulada(cenario());
    expect(r).toMatchObject({ origem: 'LOCAL_SIMULATION', cobertura: 'COMPLETA', problemas: [],
      intervaloCoberto: { inicio: 1000, fim: 2000 }, ultimaConsultaEm: 3200, vaziaConfirmada: false,
      observado: { recebidos: 3, repetidos: 1, unicos: 2, elegiveisConfirmados: 1, inelegiveisConfirmados: 0, pendentesDeClassificacao: 1 },
      totais: { avaliacoes: 2, elegiveis: null, inelegiveis: null, pendentesDeClassificacao: 1 },
    });
  });
  it('consulta completa vazia exige início, fim, snapshot e frescor explícitos', () => {
    const r = conferir([vazia()]);
    expect(r).toMatchObject({ cobertura: 'COMPLETA', vaziaConfirmada: true,
      totais: { avaliacoes: 0, elegiveis: 0, inelegiveis: 0, pendentesDeClassificacao: 0 } });
  });
  it('ausência total de páginas não vira zero', () => {
    expect(conferir([])).toMatchObject({ cobertura: 'INCOMPLETA', observado: null, totais: null, vaziaConfirmada: null, ultimaConsultaEm: null });
  });
  it('página vazia com continuação ausente não representa consulta vazia confirmada', () => {
    const r = conferir([{ ...pagina(), registros: [] }]);
    expect(r.problemas).toContain('PAGINA_AUSENTE');
    expect(r.observado?.recebidos).toBe(0);
    expect(r.totais).toBeNull();
    expect(r.vaziaConfirmada).toBeNull();
  });
  it('reentrega integral da página é idempotente e distinta de registro repetido', () => {
    const c = cenario();
    const r = conferir([...c.paginas, structuredClone(c.paginas[0])]);
    expect(r).toMatchObject({ cobertura: 'COMPLETA', paginasRecebidas: 3, paginasDistintas: 2, paginasRepetidas: 1,
      observado: { recebidos: 3, repetidos: 1, unicos: 2 } });
  });
  it('mesmo ID repetido dentro da página não infla únicos', () => {
    const p = pagina();
    const r = conferir([{ ...p, proxima: { tipo: 'FIM' }, registros: [p.registros[0], p.registros[0]] }]);
    expect(r.observado).toMatchObject({ recebidos: 2, repetidos: 1, unicos: 1 });
    expect(r.totais).toMatchObject({ avaliacoes: 1, elegiveis: 1, inelegiveis: 0, pendentesDeClassificacao: 0 });
  });
  it('ordem de chegada não muda cobertura ou registros canônicos', () => {
    const c = cenario();
    expect(conferir([...c.paginas].reverse())).toEqual(conferir(c.paginas));
  });
  it('congela resultado sem alterar nem reter referências mutáveis da entrada', () => {
    const c = cenario();
    const r = conferirCoberturaReviewSimulada(c);
    c.identidade.loja = 'alterada';
    if (c.paginas[0].tipo === 'OK') c.paginas[0].registros[0].conteudoSintetico = 'alterado';
    expect(r.identidade.loja).toBe('loja-ficticia');
    expect(r.registrosObservados?.[0].conteudoSintetico).toBe('Avaliação inventada A');
    expect(() => Object.assign(r.registrosObservados![0], { elegibilidade: 'ELEGIVEL' })).toThrow();
    expect(Object.isFrozen(r.intervaloCoberto)).toBe(true);
  });
});

describe('Review: encadeamento incompleto nunca promove totais', () => {
  it.each([
    ['PAGINA_AUSENTE', [pagina()]],
    ['TERMINACAO_DESCONHECIDA', [{ ...pagina(), proxima: { tipo: 'DESCONHECIDA' } }]],
    ['CICLO', [{ ...pagina(), proxima: { tipo: 'PAGINA', id: 'pagina-A' } }]],
    ['CICLO', [pagina(), { ...pagina(1), proxima: { tipo: 'PAGINA', id: 'pagina-A' } }]],
    ['PAGINA_ORFA', [vazia(), pagina(1)]],
    ['PAGINA_AUSENTE', [pagina(1)]],
  ])('detecta %s', (problema, paginas) => {
    const r = conferir(paginas as unknown[]);
    expect(r.cobertura).toBe('INCOMPLETA');
    expect(r.problemas).toContain(problema);
    expect(r.totais).toBeNull();
    expect(r.intervaloCoberto).toBeNull();
    expect(r.vaziaConfirmada).toBeNull();
  });
  it.each(['ERRO', 'SEM_ACESSO'] as const)('distingue %s de consulta vazia', tipo => {
    const { tipo: _tipo, snapshotId: _snapshotId, validaAte: _validaAte, proxima: _proxima, registros: _registros, ...base } = pagina();
    const r = conferir([{ ...base, tipo }]);
    expect(r.problemas).toContain(tipo === 'ERRO' ? 'ERRO_COLETA' : 'SEM_ACESSO');
    expect(r).toMatchObject({ cobertura: 'INCOMPLETA', observado: null, totais: null, vaziaConfirmada: null, ultimaConsultaEm: 3100 });
  });
  it('página final com erro preserva somente as contagens observadas', () => {
    const p = pagina(1);
    const r = conferir([pagina(), { tipo: 'ERRO', id: p.id, consultaId: p.consultaId, execucaoId: p.execucaoId,
      identidade: p.identidade, intervalo: p.intervalo, observadaEm: p.observadaEm }]);
    expect(r.observado?.unicos).toBe(1);
    expect(r.totais).toBeNull();
    expect(r.problemas).toContain('ERRO_COLETA');
  });
  it('sucesso de outra execução não transfere o marcador COMPLETA para uma consulta nova', () => {
    const primeira = conferirCoberturaReviewSimulada(cenario());
    const nova = conferir([], { execucaoId: 'nova-execucao' });
    expect(primeira.cobertura).toBe('COMPLETA');
    expect(nova).toMatchObject({ cobertura: 'INCOMPLETA', totais: null, observado: null });
  });
});

describe('Review: divergências invalidam o snapshot inteiro', () => {
  it.each([
    { consultaId: 'outra-consulta' }, { execucaoId: 'outra-execucao' },
    { identidade: { parceiro: 'outro', loja: 'loja-ficticia' } },
    { identidade: { parceiro: 'parceiro-ficticio', loja: 'outra' } },
    { intervalo: { inicio: 1000, fim: 2001 } },
    { snapshotId: 'outro-snapshot' }, { observadaEm: 2999 }, { observadaEm: 3501 }, { validaAte: 3100 },
  ])('recusa mistura: %j', mudanca => {
    const r = conferir([{ ...vazia(), ...mudanca }]);
    expect(r).toMatchObject({ cobertura: 'INCONSISTENTE', observado: null, totais: null, registrosObservados: null, ultimaConsultaEm: null });
  });
  it('revisão divergente da mesma página não escolhe silenciosamente a primeira ou última', () => {
    const r = conferir([vazia(), { ...vazia(), proxima: { tipo: 'PAGINA', id: 'pagina-B' } }]);
    expect(r.problemas).toContain('PAGINA_REPETIDA_DIVERGENTE');
    expect(r.observado).toBeNull();
    expect(r.totais).toBeNull();
  });
  it('snapshot esperado desconhecido não permite misturar snapshots nem declarar completude', () => {
    const desconhecido = conferir(cenario().paginas, { snapshotId: null });
    expect(desconhecido).toMatchObject({ cobertura: 'INCOMPLETA', totais: null });
    expect(desconhecido.problemas).toContain('SNAPSHOT_DESCONHECIDO');
    const misturado = conferir([pagina(), { ...pagina(1), snapshotId: 'outro' }], { snapshotId: null });
    expect(misturado).toMatchObject({ cobertura: 'INCONSISTENTE', observado: null, totais: null });
    expect(misturado.problemas).toContain('SNAPSHOT_DIVERGENTE');
  });
  it.each([
    { versao: 'v2' }, { conteudoSintetico: 'Mesmo ID, outro comentário' },
    { criadoEm: 1001 }, { elegibilidade: 'INELEGIVEL' },
  ])('mesmo ID com conteúdo divergente não é last-wins: %j', mudanca => {
    const b = pagina(1);
    const r = conferir([pagina(), { ...b, registros: [{ ...b.registros[0], ...mudanca }, b.registros[1]] }]);
    expect(r.problemas).toContain('REGISTRO_REPETIDO_DIVERGENTE');
    expect(r).toMatchObject({ cobertura: 'INCONSISTENTE', observado: null, totais: null, registrosObservados: null });
  });
});

describe('Review: intervalo, frescor e limites da preparação', () => {
  it.each([1000, 1999])('inclui instante %s no intervalo [1000,2000)', criadoEm => {
    const p = pagina();
    const r = conferir([{ ...p, proxima: { tipo: 'FIM' }, registros: [{ ...p.registros[0], criadoEm }] }]);
    expect(r.cobertura).toBe('COMPLETA');
  });
  it.each([999, 2000])('não cobre registro externo em %s', criadoEm => {
    const p = pagina();
    const r = conferir([{ ...p, proxima: { tipo: 'FIM' }, registros: [{ ...p.registros[0], criadoEm }] }]);
    expect(r.problemas).toContain('REGISTRO_FORA_INTERVALO');
    expect(r.totais).toBeNull();
  });
  it.each([{ inicio: 2000, fim: 1000 }, { inicio: 1000, fim: 1000 }, { inicio: NaN, fim: 2000 }])('intervalo inválido é recusado: %j', intervalo => {
    expect(() => conferir([vazia()], { intervalo })).toThrow('ENTRADA_SIMULADA_INVALIDA');
  });
  it('intervalo ainda aberto na coleta não vira cobertura completa mesmo se vazio', () => {
    const intervalo = { inicio: 1000, fim: 3100 };
    const r = conferir([{ ...vazia(), intervalo }], { intervalo });
    expect(r.problemas).toContain('INTERVALO_AINDA_ABERTO');
    expect(r.vaziaConfirmada).toBeNull();
  });
  it.each([
    ['FRESCOR_DESCONHECIDO', { validaAte: null }],
    ['OBSERVACAO_VENCIDA', { validaAte: 3500 }],
    ['SNAPSHOT_DESCONHECIDO', { snapshotId: null }],
  ])('não promove %s a resultado atual', (problema, mudanca) => {
    const r = conferir([{ ...vazia(), ...mudanca }]);
    expect(r.problemas).toContain(problema);
    expect(r.totais).toBeNull();
    expect(r.vaziaConfirmada).toBeNull();
  });
  it.each(['PRODUCAO', 'TEST', 'PROVIDER_TEST', null])('não aceita origem %s', origem => {
    expect(() => conferir([vazia()], { origem })).toThrow('ENTRADA_SIMULADA_INVALIDA');
  });
  it('não aceita payload oficial, declaração pronta de cobertura ou elegibilidade inferida pela nota', () => {
    expect(() => conferir([{ page: 1, reviews: [] }])).toThrow('ENTRADA_SIMULADA_INVALIDA');
    expect(() => conferir([vazia()], { cobertura: 'COMPLETA' })).toThrow('ENTRADA_SIMULADA_INVALIDA');
    const p = pagina();
    expect(() => conferir([{ ...p, registros: [{ ...p.registros[0], elegibilidade: undefined, nota: 5 }] }])).toThrow('ENTRADA_SIMULADA_INVALIDA');
  });
  it('CLI lógico evidencia simulação, atraso e cobertura parcial sem totais inventados', () => {
    const r = simularCoberturaReview();
    expect(r).toMatchObject({ origem: 'LOCAL_SIMULATION', efeitoExterno: 'NENHUM',
      completa: { cobertura: 'COMPLETA', totais: { avaliacoes: 2, elegiveis: null } },
      parcial: { cobertura: 'INCOMPLETA', totais: null }, atrasada: { cobertura: 'INCOMPLETA', totais: null } });
  });
});
