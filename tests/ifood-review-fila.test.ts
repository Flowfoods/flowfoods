import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aprovarReviewFilaSchema, conferirLimiteEditorialReview, congelarReviewFila, gravarReviewFilaSchema, identidadeReviewFilaSchema, listarReviewFilaSchema } from '@/lib/integracoes/ifood/review-fila-campos';

const mocks = vi.hoisted(() => ({ exigirParceiro: vi.fn(), gravar: vi.fn(), aprovar: vi.fn(), consultar: vi.fn(), listar: vi.fn() }));
vi.mock('@/lib/erp/contexto', () => ({ exigirParceiro: mocks.exigirParceiro }));
vi.mock('@/lib/integracoes/ifood/review-fila', () => ({ gravarReviewFila: mocks.gravar, aprovarReviewFila: mocks.aprovar, consultarReviewFila: mocks.consultar, listarReviewFila: mocks.listar }));
import { aprovarReviewFilaDoNivel1, consultarReviewFilaDoNivel1, gravarReviewFilaDoNivel1, listarReviewFilaDoNivel1 } from '@/lib/integracoes/ifood/review-fila-servidor';

const identidade = { lojaId: 'loja-sintetica', avaliacaoLocalId: 'avaliacao-local' };
const entrada = () => ({ ...identidade, revisaoEsperada: 0, fatos: { versao: 'fonte-1', comentario: '' }, texto: '  Resposta\n sintética.  ', visibilidade: 'PUBLICA', motivo: 'Ensaio editorial' });
describe('Review fila · contratos internos de preparação', () => {
  it('teto editorial conta pontos de código, sem truncar emoji ou confundir grafema com caractere', () => {
    const snapshot = { conteudo: { tom: 'Cordial', assinatura: '', exemplos: [], restricoes: [], limiteEditorial: 3 } };
    expect(() => conferirLimiteEditorialReview('😀😀😀', snapshot)).not.toThrow();
    expect(() => conferirLimiteEditorialReview('😀😀😀😀', snapshot)).toThrow('limite editorial');
    expect(() => conferirLimiteEditorialReview('e\u0301x', snapshot)).not.toThrow();
    expect(() => conferirLimiteEditorialReview('e\u0301xy', snapshot)).toThrow('limite editorial');
    expect(() => conferirLimiteEditorialReview('texto', {})).toThrow();
  });
  it('preserva exatamente o texto e aceita comentário vazio conhecido, sem fabricar um', () => {
    expect(gravarReviewFilaSchema.parse(entrada())).toEqual(entrada());
    expect(gravarReviewFilaSchema.safeParse({ ...entrada(), fatos: { versao: 'fonte-1' } }).success).toBe(false);
  });
  it.each(['lojaId', 'avaliacaoLocalId', 'revisaoEsperada', 'fatos', 'texto', 'visibilidade', 'motivo'])('recusa ausência de %s', campo => {
    const e: Record<string, unknown> = entrada(); delete e[campo];
    expect(gravarReviewFilaSchema.safeParse(e).success).toBe(false);
  });
  it.each(['parceiroId', 'autor', 'editorUserId', 'aprovadorUserId', 'criadoEm', 'origem', 'capacidade', 'estado', 'politica', 'politicaSnapshot', 'politicaVersaoId'])('não aceita %s do cliente', campo => {
    expect(gravarReviewFilaSchema.safeParse({ ...entrada(), [campo]: 'forjado' }).success).toBe(false);
    expect(aprovarReviewFilaSchema.safeParse({ ...identidade, revisaoEsperada: 1, motivo: 'Revisado', [campo]: 'forjado' }).success).toBe(false);
  });
  it.each(['', ' ', '\n\t', '\u00a0\u2003', '\ufeff'])('recusa branco sem normalizar: %j', branco => {
    for (const campo of ['lojaId', 'avaliacaoLocalId', 'texto', 'motivo']) expect(gravarReviewFilaSchema.safeParse({ ...entrada(), [campo]: branco }).success).toBe(false);
    expect(gravarReviewFilaSchema.safeParse({ ...entrada(), fatos: { versao: branco, comentario: '' } }).success).toBe(false);
  });
  it.each([-1, 0.5, 2_147_483_647, NaN, Infinity, '1', null])('recusa revisão inválida %j', revisaoEsperada => {
    expect(gravarReviewFilaSchema.safeParse({ ...entrada(), revisaoEsperada }).success).toBe(false);
  });
  it('aprovação exige revisão existente e motivo explícito, sem texto novo', () => {
    expect(aprovarReviewFilaSchema.parse({ ...identidade, revisaoEsperada: 1, motivo: 'Revisado' }).revisaoEsperada).toBe(1);
    for (const invalida of [{ revisaoEsperada: 0, motivo: 'x' }, { revisaoEsperada: 1 }, { revisaoEsperada: 1, motivo: 'x', texto: 'Outro' }]) {
      expect(aprovarReviewFilaSchema.safeParse({ ...identidade, ...invalida }).success).toBe(false);
    }
  });
  it('tetos são de armazenamento local; não trunca ou converte visibilidade desconhecida', () => {
    for (const invalido of [{ texto: 'x'.repeat(10001) }, { motivo: 'x'.repeat(2001) }, { lojaId: 'x'.repeat(201) }, { visibilidade: 'DESCONHECIDA' }, { fatos: { versao: 'x', comentario: 'x'.repeat(10001) } }, { fatos: { versao: 'x', comentario: '', outra: true } }]) {
      expect(gravarReviewFilaSchema.safeParse({ ...entrada(), ...invalido }).success).toBe(false);
    }
    expect(gravarReviewFilaSchema.parse({ ...entrada(), texto: 'x'.repeat(10000) }).texto).toHaveLength(10000);
  });
  it('listagem limitada explicitamente, sem estados de transporte ou identidade de outro tenant', () => {
    expect(listarReviewFilaSchema.parse({ lojaId: identidade.lojaId, limite: 10 })).toEqual({ lojaId: identidade.lojaId, limite: 10 });
    for (const invalido of [{ limite: 0 }, { limite: 101 }, { limite: 10, estado: 'EM_ENVIO' }, { limite: 10, parceiroId: 'outro' }]) {
      expect(listarReviewFilaSchema.safeParse({ lojaId: identidade.lojaId, ...invalido }).success).toBe(false);
    }
    expect(listarReviewFilaSchema.safeParse({ lojaId: identidade.lojaId }).success).toBe(false);
    expect(identidadeReviewFilaSchema.safeParse({ ...identidade, id: 'forjado' }).success).toBe(false);
  });
  it('DTO copia/congela arrays e snapshots e serializa relógio sem Date mutável', () => {
    const original = { criadoEm: new Date('2026-01-01T00:00:00Z'), revisoes: [{ politica: { exemplos: ['Sintético'] } }] };
    const dto = congelarReviewFila(original);
    original.criadoEm.setFullYear(2030); original.revisoes[0].politica.exemplos.push('Outro');
    expect(dto.criadoEm).toBe('2026-01-01T00:00:00.000Z');
    expect(dto.revisoes[0].politica.exemplos).toEqual(['Sintético']);
    for (const camada of [dto, dto.revisoes, dto.revisoes[0], dto.revisoes[0].politica, dto.revisoes[0].politica.exemplos]) expect(Object.isFrozen(camada)).toBe(true);
  });
});

describe('Review fila · fachada Nível 1 sem consumidor externo', () => {
  const cliente = { parceiroId: 'parceiro-servidor' }; const sessao = { userId: 'editor-servidor', autorNome: 'Pessoa sintética' };
  beforeEach(() => { vi.resetAllMocks(); mocks.exigirParceiro.mockResolvedValue({ cliente, sessao, podeEscrever: true }); });
  it.each([[gravarReviewFilaDoNivel1, mocks.gravar], [aprovarReviewFilaDoNivel1, mocks.aprovar]] as const)('escrita usa somente contexto e identidade do servidor', async (fn, repo) => {
    const e = entrada(); repo.mockResolvedValue('recibo');
    expect(await fn('slug', e)).toBe('recibo');
    expect(mocks.exigirParceiro).toHaveBeenCalledExactlyOnceWith('slug');
    expect(repo).toHaveBeenCalledExactlyOnceWith(cliente, sessao, e);
  });
  it.each([gravarReviewFilaDoNivel1, aprovarReviewFilaDoNivel1])('bloqueio ou falta de Nível 1 impede chamar o repositório', async fn => {
    mocks.exigirParceiro.mockResolvedValueOnce({ cliente, sessao, podeEscrever: false, bloqueio: 'Suspenso' });
    await expect(fn('slug', entrada())).rejects.toThrow('Suspenso');
    mocks.exigirParceiro.mockRejectedValueOnce(new Error('Nível 1 obrigatório'));
    await expect(fn('slug', entrada())).rejects.toThrow('Nível 1');
    expect(mocks.gravar).not.toHaveBeenCalled(); expect(mocks.aprovar).not.toHaveBeenCalled();
  });
  it.each([[consultarReviewFilaDoNivel1, mocks.consultar], [listarReviewFilaDoNivel1, mocks.listar]] as const)('leitura também obtém o parceiro autorizado', async (fn, repo) => {
    repo.mockResolvedValue(null); expect(await fn('slug', identidade)).toBeNull();
    expect(repo).toHaveBeenCalledExactlyOnceWith(cliente, identidade);
  });
});
