import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const d = vi.hoisted(() => ({
  ativo: true, pausada: false, parceiro: vi.fn(), modulo: vi.fn(), liberacao: vi.fn(), app: vi.fn(),
  adquirir: vi.fn(), renovar: vi.fn(), executar: vi.fn(), registrar: vi.fn(), reservar: vi.fn(), planejar: vi.fn(),
  token: vi.fn(), transporte: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ prisma: { parceiroFlow: { findFirst: d.parceiro } } }));
vi.mock('@/lib/erp/tenant', () => ({ doParceiro: () => ({
  liberacaoDeModulo: { findFirst: d.liberacao }, integracaoConexaoModulo: { findFirst: d.modulo },
  integracaoExecucao: { findFirst: async () => null, count: async () => 0 },
}) }));
vi.mock('@/lib/integracoes/core/cofre', () => ({ integracaoIfoodAtiva: () => d.ativo }));
vi.mock('@/lib/integracoes/core/apps', () => ({ appPorId: d.app }));
vi.mock('@/lib/integracoes/core/armazem-token', () => ({ armazemDoBanco: {} }));
vi.mock('@/lib/integracoes/core/posse-analytics', () => ({ comPosseAnalytics: async (_url: string, f: (p: unknown) => unknown) => f({ id: 'dono', confirmar: async () => true }) }));
vi.mock('@/lib/integracoes/core/controle-analytics', () => ({ controleAnalytics: async () => ({ pausada: d.pausada }), registrarDonoAnalytics: d.registrar, reservarChamadaAnalytics: d.reservar }));
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
    d.parceiro.mockResolvedValue({ id: 'parceiro' });
    d.modulo.mockResolvedValue({ id: 'modulo', appId: 'app', estado: 'ATIVO' });
    d.liberacao.mockResolvedValue({ liberado: true });
    d.app.mockResolvedValue(app);
    d.adquirir.mockResolvedValue(tarefa);
    d.executar.mockResolvedValue({ estado: 'publicada', paginas: 1 });
    d.reservar.mockResolvedValue(0);
    d.renovar.mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(['chave', 'pausa'] as const)('desligado por %s não adquire nem chama o iFood', async motivo => {
    if (motivo === 'chave') d.ativo = false; else d.pausada = true;
    await criarRotinaAnalytics(vi.fn())();
    expect(d.registrar).not.toHaveBeenCalled();
    expect(d.executar).not.toHaveBeenCalled();
    expect(d.transporte).not.toHaveBeenCalled();
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
});
