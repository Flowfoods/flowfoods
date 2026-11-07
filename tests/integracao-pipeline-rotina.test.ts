import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const d = vi.hoisted(() => ({
  ativo: true, pausada: false, parceiro: vi.fn(), modulo: vi.fn(), liberacao: vi.fn(), app: vi.fn(),
  adquirir: vi.fn(), renovar: vi.fn(), executar: vi.fn(), registrar: vi.fn(), reservar: vi.fn(), planejar: vi.fn(),
  token: vi.fn(), transporte: vi.fn(), financeiro: vi.fn(), confirmar: vi.fn(), bloqueadaAte: null as Date | null,
  primeiraJanela: vi.fn(), contarJanelas: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ prisma: { parceiroFlow: { findFirst: d.parceiro } } }));
vi.mock('@/lib/erp/tenant', () => ({ doParceiro: () => ({
  liberacaoDeModulo: { findFirst: d.liberacao }, integracaoConexaoModulo: { findFirst: d.modulo },
  integracaoExecucao: { findFirst: d.primeiraJanela, count: d.contarJanelas },
}) }));
vi.mock('@/lib/integracoes/core/cofre', () => ({ integracaoIfoodAtiva: () => d.ativo }));
vi.mock('@/lib/integracoes/core/apps', () => ({ appPorId: d.app }));
vi.mock('@/lib/integracoes/core/armazem-token', () => ({ armazemDoBanco: {} }));
vi.mock('@/lib/integracoes/core/posse-analytics', () => ({ comPosseAnalytics: async (_url: string, f: (p: unknown) => unknown) => f({ id: 'dono', confirmar: d.confirmar }) }));
vi.mock('@/lib/integracoes/core/controle-analytics', () => ({ controleAnalytics: async () => ({ pausada: d.pausada, bloqueadaAte: d.bloqueadaAte }), registrarDonoAnalytics: d.registrar, reservarChamadaAnalytics: d.reservar }));
vi.mock('@/lib/integracoes/ifood/faturamento-pendencias', () => ({ processarUmFaturamentoPendente: d.financeiro }));
vi.mock('@/lib/integracoes/ifood/pipeline-repositorio', () => ({ agendarJanela: d.planejar, criarRepositorioAnalytics: () => ({ adquirir: d.adquirir, renovar: d.renovar }) }));
vi.mock('@/lib/integracoes/ifood/pipeline-executor', () => ({ executarTarefaAnalytics: d.executar }));
vi.mock('@/lib/integracoes/ifood/auth', () => ({ ServicoDeToken: class { constructor(o: unknown) { d.token(o); } } }));
vi.mock('@/lib/integracoes/ifood/transporte', () => ({ transporteFetch: d.transporte }));
import { criarRotinaAnalytics } from '@/lib/integracoes/core/rotina-analytics';

const app = { id: 'app', ambiente: 'PRODUCAO', estadoHomologacao: 'HOMOLOGADO', clientId: 'publico', nomeDoSegredo: 'IFOOD_BI_CLIENT_SECRET' };
const tarefa = { id: 'tarefa', appId: 'app', identidade: { ambiente: 'PRODUCAO' } };
describe('INT-1.6 · fronteira da rotina automática', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('DATABASE_URL', 'postgresql://sintetico/sintetico');
    d.ativo = true; d.pausada = false;
    d.bloqueadaAte = null;
    d.financeiro.mockReset().mockResolvedValue(null);
    d.confirmar.mockReset().mockResolvedValue(true);
    d.parceiro.mockResolvedValue({ id: 'parceiro' });
    d.modulo.mockResolvedValue({ id: 'modulo', appId: 'app', estado: 'ATIVO' });
    d.liberacao.mockResolvedValue({ liberado: true });
    d.app.mockResolvedValue(app);
    d.adquirir.mockResolvedValue(tarefa);
    d.executar.mockResolvedValue({ estado: 'publicada', paginas: 1 });
    d.reservar.mockResolvedValue(0);
    d.renovar.mockResolvedValue(undefined);
    d.primeiraJanela.mockReset().mockResolvedValue(null); d.contarJanelas.mockReset().mockResolvedValue(0);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

  it.each(['chave', 'pausa', 'cooldown'] as const)('desligado por %s não adquire nem chama o iFood', async motivo => {
    if (motivo === 'chave') d.ativo = false;
    else if (motivo === 'pausa') d.pausada = true;
    else d.bloqueadaAte = new Date(Date.now() + 60_000);
    await criarRotinaAnalytics(vi.fn())();
    expect(d.registrar).not.toHaveBeenCalled();
    expect(d.executar).not.toHaveBeenCalled();
    expect(d.transporte).not.toHaveBeenCalled();
    expect(d.financeiro).not.toHaveBeenCalled();
  });
  it.each(['liberacao', 'modulo', 'app', 'tarefa'] as const)('retoma uma pendência financeira sem trabalho HTTP: %s ausente', async ausente => {
    if (ausente === 'liberacao') d.liberacao.mockResolvedValue(null);
    if (ausente === 'modulo') d.modulo.mockResolvedValue(null);
    if (ausente === 'app') d.app.mockResolvedValue(null);
    if (ausente === 'tarefa') d.adquirir.mockResolvedValue(null);
    d.financeiro.mockResolvedValue({ estado: 'pendente', reciboId: 'recibo', motivo: 'ACESSO' });
    const log = vi.fn();
    await criarRotinaAnalytics(log)();
    expect(d.financeiro).toHaveBeenCalledTimes(1);
    expect(d.financeiro.mock.calls[0][1].id).toBe('dono');
    expect(d.registrar.mock.invocationCallOrder[0]).toBeLessThan(d.financeiro.mock.invocationCallOrder[0]);
    expect(d.financeiro.mock.invocationCallOrder[0]).toBeLessThan(d.liberacao.mock.invocationCallOrder[0]);
    expect(log).toHaveBeenCalledWith('faturamento-pendente');
    expect(d.token).not.toHaveBeenCalled();
    expect(d.reservar).not.toHaveBeenCalled();
    expect(d.transporte).not.toHaveBeenCalled();
    expect(d.executar).not.toHaveBeenCalled();
  });
  it('cancelamento ou perda de posse antes do replay impede aplicação', async () => {
    const cancelamento = new AbortController();
    cancelamento.abort();
    await criarRotinaAnalytics(vi.fn(), cancelamento.signal)();
    d.confirmar.mockResolvedValue(false);
    await criarRotinaAnalytics(vi.fn())();
    expect(d.financeiro).not.toHaveBeenCalled();
    expect(d.token).not.toHaveBeenCalled();
  });
  it('desligamento durante o replay reconfere a chave e impede continuar para a coleta', async () => {
    d.financeiro.mockImplementation(async (_cliente, _posse, chave) => {
      expect(chave()).toBe(true);
      d.ativo = false;
      expect(chave()).toBe(false);
      return null;
    });
    await criarRotinaAnalytics(vi.fn())();
    expect(d.liberacao).not.toHaveBeenCalled();
    expect(d.token).not.toHaveBeenCalled();
  });
  it('falha de persistência no replay não vira sucesso nem inicia transporte', async () => {
    d.financeiro.mockRejectedValue(new Error('banco indisponível'));
    const log = vi.fn();
    await expect(criarRotinaAnalytics(log)()).rejects.toThrow('banco indisponível');
    expect(log).not.toHaveBeenCalled();
    expect(d.token).not.toHaveBeenCalled();
    expect(d.executar).not.toHaveBeenCalled();
  });
  it.each(['liberacao', 'homologacao', 'TEST'] as const)('recusa %s sem criar jobs ou chamar transporte', async motivo => {
    if (motivo === 'liberacao') d.liberacao.mockResolvedValue(null);
    if (motivo === 'homologacao') d.app.mockResolvedValue({ ...app, estadoHomologacao: 'PENDENTE' });
    if (motivo === 'TEST') d.app.mockResolvedValue({ ...app, ambiente: 'TEST' });
    await criarRotinaAnalytics(vi.fn())();
    expect(d.planejar).not.toHaveBeenCalled();
    expect(d.executar).not.toHaveBeenCalled();
    expect(d.token).not.toHaveBeenCalled();
  });
  it('OAuth não abre transações de outra conexão durante a transação coordenada do token', async () => {
    await criarRotinaAnalytics(vi.fn())();
    const tokenOpcoes = d.token.mock.calls[0][0];
    expect(tokenOpcoes.transporte).toBe(d.transporte);
    const opcoes = d.executar.mock.calls[0][1];
    await opcoes.http.transporte({});
    expect(d.reservar).toHaveBeenCalledTimes(1);
    expect(d.renovar).toHaveBeenCalledWith(tarefa);
    expect(d.transporte).toHaveBeenCalledTimes(1);
    expect(d.reservar.mock.invocationCallOrder[0]).toBeLessThan(d.renovar.mock.invocationCallOrder[0]);
    expect(d.renovar.mock.invocationCallOrder[0]).toBeLessThan(d.transporte.mock.invocationCallOrder[0]);
  });
  it('revogação na emissão impede a chamada mesmo depois de reservar cota', async () => {
    await criarRotinaAnalytics(vi.fn())();
    d.renovar.mockRejectedValue(new Error('revogado'));
    await expect(d.executar.mock.calls[0][1].http.transporte({})).rejects.toThrow('revogado');
    expect(d.transporte).not.toHaveBeenCalled();
  });
  it('fila pode escolher outro app; transporte usa o app da tarefa, nunca o da loja planejada', async () => {
    d.adquirir.mockResolvedValue({ ...tarefa, appId: 'app-2' });
    d.app.mockImplementation(async id => ({ ...app, id }));
    await criarRotinaAnalytics(vi.fn())();
    expect(d.executar.mock.calls[0][1].http.app.id).toBe('app-2');
  });
  it('avança o rodízio após parceiro sem liberação e volta ao começo ao acabar', async () => {
    d.parceiro.mockReset().mockResolvedValueOnce({ id: 'a' }).mockResolvedValueOnce({ id: 'b' }).mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'a' });
    d.liberacao.mockResolvedValue(null);
    const rodar = criarRotinaAnalytics(vi.fn());
    await rodar(); await rodar(); await rodar();
    expect(d.parceiro.mock.calls.map(([q]) => q.where.id?.gt ?? 'inicio')).toEqual(['', 'a', 'b', 'inicio']);
    expect(d.executar).not.toHaveBeenCalled();
  });
  it('planeja três históricos independentes, mas executa somente uma tarefa adquirida por rodada', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-07T14:00:00Z'));
    d.primeiraJanela.mockImplementation(async q => q.where.perfil === 'diario'
      ? { dia: new Date('2026-10-01T00:00:00Z'), fuso: 'America/Sao_Paulo', unidade: 'REAL' } : null);
    const marginal = { ...tarefa, perfil: 'pagamentos' }; d.adquirir.mockResolvedValue(marginal);
    await criarRotinaAnalytics(vi.fn())();
    expect(d.primeiraJanela.mock.calls.map(([q]) => q.where.perfil)).toEqual(['diario', 'pagamentos', 'complementares']);
    expect(d.contarJanelas.mock.calls.map(([q]) => q.where.perfil)).toEqual(['diario', 'pagamentos', 'complementares']);
    const janelas = d.planejar.mock.calls.map(([, j]) => j);
    expect(janelas).toHaveLength(52);
    expect(janelas.find(j => j.perfil === 'diario' && j.tipo === 'HISTORICO').dia).toBe('2026-09-30');
    expect(janelas.find(j => j.perfil === 'pagamentos' && j.tipo === 'HISTORICO').dia).toBe('2026-10-21');
    expect(janelas.find(j => j.perfil === 'complementares' && j.tipo === 'HISTORICO').dia).toBe('2026-10-21');
    expect(d.executar).toHaveBeenCalledTimes(1); expect(d.executar.mock.calls[0][0]).toBe(marginal);
    expect(d.financeiro).toHaveBeenCalledTimes(1); expect(d.reservar).not.toHaveBeenCalled();
  });
  it('teto marginal não ocupa o limite do histórico diário e módulo AUTORIZADO só verifica acesso', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-07T14:00:00Z'));
    d.contarJanelas.mockImplementation(async q => q.where.perfil === 'pagamentos' ? 20 : 0);
    await criarRotinaAnalytics(vi.fn())();
    const janelas = d.planejar.mock.calls.map(([, j]) => j);
    expect(janelas.some(j => j.perfil === 'diario' && j.tipo === 'HISTORICO')).toBe(true);
    expect(janelas.some(j => j.perfil === 'pagamentos' && j.tipo === 'HISTORICO')).toBe(false);
    d.planejar.mockClear(); d.modulo.mockResolvedValue({ id: 'modulo', appId: 'app', estado: 'AUTORIZADO' });
    await criarRotinaAnalytics(vi.fn())();
    expect(d.planejar.mock.calls.map(([, j]) => j.tipo)).toEqual(['ACESSO']);
  });
});
