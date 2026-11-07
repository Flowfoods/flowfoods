import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import type { Alcance, Permissao } from '@/lib/erp/permissoes';
import { lerOrigemAnalyticsNoFaturamento, lerSituacaoAnalyticsDaLoja } from '@/lib/integracoes/core/situacao-analytics';
import { diaValidoDaSituacao, mensagemDaPendenciaAnalytics, mensagemDaTentativaAnalytics, mensagemDoAcessoAnalytics, ontemDaSituacaoAnalytics } from '@/lib/integracoes/core/situacao-analytics-campos';

const contexto = { parceiroId: 'p1', homologacaoDeIntegracao: false };
const dia = '2026-11-06';
const alcance = (permissoes: Permissao[] = ['integracao.ver'], lojas: Alcance['lojas'] = ['l1']): Alcance => ({ nivel: 'LOJA', permissoes: new Set(permissoes), lojas });
function clienteFalso() {
  const calls: { modelo: string; argumento: unknown }[] = [];
  const ler = <T>(modelo: string, valor: T) => vi.fn(async (argumento?: unknown) => { calls.push({ modelo, argumento }); return valor; });
  const mock = {
    parceiroId: 'p1', somenteLeitura: true,
    sql: vi.fn(async (argumento: TemplateStringsArray) => {
      calls.push({ modelo: 'sql', argumento });
      return argumento.join(' ').includes('AS ambigua') ? [{ ambigua: false }] : [{ repetivel: true, leitura: true }];
    }),
    loja: { findMany: ler('loja', [{ id: 'l1', nome: 'Loja própria', ativa: true }]), findFirst: ler('loja-id', { id: 'l1' }) },
    liberacaoDeModulo: { findUnique: ler('liberacao', { liberado: true }) },
    integracaoConexao: { findMany: ler('conexao', [{ id: 'c1', idExterno: 'merchant-um', nomeExterno: 'Fonte própria', ambiente: 'PRODUCAO', estado: 'ATIVA', marca: null as { nome: string } | null, modulos: [{ id: 'm1', estado: 'ATIVO' }] }]) },
    integracaoExecucao: { findMany: ler('execucao', [{ id: 'e1', moduloId: 'm1', estado: 'FALHA', fuso: 'America/Sao_Paulo', iniciadaEm: new Date('2026-11-07T12:00:00Z'), concluidaEm: new Date('2026-11-07T12:01:00Z'), naoAntesDe: new Date('2026-11-07T12:11:00Z'), ultimoErro: 'indisponivel' }]) },
    integracaoSnapshot: { findMany: ler('snapshot', [{ execucaoId: 'e1', situacao: 'PUBLICADO', geracao: 1, criadoEm: new Date('2026-11-07T10:00:00Z') }]) },
    integracaoFaturamentoDia: { findFirst: ler('recibo', null as null | { estado: string; motivo: string | null; revisaoSolicitada: bigint; revisaoConferida: bigint; aplicadoEm: Date | null; conferidaEm: Date | null; fontes: { conexaoId: string }[] }) },
    kpiIfoodDia: { findMany: vi.fn(() => { throw new Error('Métrica consultada pelo operacional.'); }) },
    integracaoPayload: { findMany: vi.fn(() => { throw new Error('Corpo consultado pelo operacional.'); }) },
  };
  const transacao = vi.fn(async <T>(fn: (tx: ClienteDoParceiro) => Promise<T>) => fn(cliente));
  const cliente = { ...mock, transacao } as unknown as ClienteDoParceiro;
  return { cliente, mock, transacao, calls };
}
const rAplicado = { estado: 'APLICADO', motivo: null, revisaoSolicitada: 1n, revisaoConferida: 1n, aplicadoEm: new Date('2026-11-07T10:01:00Z'), conferidaEm: new Date('2026-11-07T10:02:00Z'), fontes: [{ conexaoId: 'c1' }] };

describe('INT-1.8A · campos e mensagens operacionais', () => {
  it.each(['2026-02-29', '2026-11-31', '2026-1-01', '2026-01-01x', '', null, ['2026-01-01']])('recusa dia inválido %j', v => expect(diaValidoDaSituacao(v)).toBe(false));
  it('dia civil e ontem são de São Paulo na virada e em ano bissexto', () => {
    expect(diaValidoDaSituacao('2024-02-29')).toBe(true);
    expect(ontemDaSituacaoAnalytics(new Date('2026-01-01T02:59:59Z'))).toBe('2025-12-30');
    expect(ontemDaSituacaoAnalytics(new Date('2026-01-01T03:00:00Z'))).toBe('2025-12-31');
    expect(ontemDaSituacaoAnalytics(new Date('2024-03-01T12:00:00Z'))).toBe('2024-02-29');
  });
  it('somente frases conhecidas, sem prometer agendamento ou repetir texto arbitrário', () => {
    expect(mensagemDaTentativaAnalytics('AGUARDANDO', 'limite').explicacao).toContain('não garante');
    expect(mensagemDaTentativaAnalytics('FALHA', 'sem-permissao').explicacao).not.toContain('paus');
    expect(mensagemDoAcessoAnalytics('ERRO_PERMISSAO', true).rotulo).toContain('recusado');
    expect(mensagemDoAcessoAnalytics('ATIVO', false).rotulo).toBe('Vínculo desligado');
    const texto = JSON.stringify([mensagemDaTentativaAnalytics('FALHA', 'segredo-teste'), mensagemDaPendenciaAnalytics('segredo-teste'), mensagemDoAcessoAnalytics('segredo-teste', true)]);
    expect(texto).not.toContain('segredo-teste');
    expect(texto).not.toContain('cofre');
  });
});

describe('INT-1.8A · domínio operacional e projeção', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-07T18:00:00Z')); });
  afterEach(() => vi.useRealTimers());
  it.each([{ permissoes: [] as Permissao[] }, { permissoes: ['faturamento.ver'] as Permissao[] }])('recusa sem integracao.ver antes de consultar %j', async ({ permissoes }) => {
    const f = clienteFalso(); expect(await lerSituacaoAnalyticsDaLoja(f.cliente, alcance(permissoes), contexto, { dia })).toMatchObject({ ok: false, motivo: 'sem-permissao' });
    expect(f.transacao).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
  });
  it('recusa contexto de outro parceiro e booleano não válido antes da consulta', async () => {
    const f = clienteFalso();
    expect(await lerSituacaoAnalyticsDaLoja(f.cliente, alcance(), { ...contexto, parceiroId: 'outro' })).toMatchObject({ ok: false, motivo: 'contexto-invalido' });
    expect(await lerSituacaoAnalyticsDaLoja(f.cliente, alcance(), { ...contexto, homologacaoDeIntegracao: 'true' as unknown as boolean })).toMatchObject({ ok: false, motivo: 'contexto-invalido' });
    expect(f.calls).toEqual([]);
  });
  it.each([{ lojaId: 'outra' }, { lojaId: ['l1'] }, { lojaId: ' ' }, { dia: '2026-11-07' }, { dia: ['2026-11-06'] }])('entrada forjada não cai na loja/default: %j', async entrada => {
    const f = clienteFalso(); expect((await lerSituacaoAnalyticsDaLoja(f.cliente, alcance(), contexto, entrada)).ok).toBe(false); expect(f.calls).toEqual([]);
  });
  it('confere liberação dentro da fotografia antes de listar lojas/fontes', async () => {
    const f = clienteFalso(); f.mock.liberacaoDeModulo.findUnique.mockResolvedValue({ liberado: false });
    expect(await lerSituacaoAnalyticsDaLoja(f.cliente, alcance(), contexto)).toMatchObject({ ok: false, motivo: 'sem-modulo' });
    expect(f.mock.liberacaoDeModulo.findUnique).toHaveBeenCalledOnce();
    expect(f.mock.sql.mock.invocationCallOrder[0]).toBeLessThan(f.mock.liberacaoDeModulo.findUnique.mock.invocationCallOrder[0]);
    expect(f.mock.loja.findMany).not.toHaveBeenCalled();
  });
  it.each([{ repetivel: false, leitura: true }, { repetivel: true, leitura: false }])('recusa transação aninhada sem garantias %j', async setting => {
    const f = clienteFalso(); f.mock.sql.mockResolvedValue([setting]);
    expect(await lerSituacaoAnalyticsDaLoja(f.cliente, alcance(), contexto)).toMatchObject({ ok: false, motivo: 'leitura-indisponivel' });
    expect(f.calls.map(c => c.modelo)).toEqual([]); // mockResolvedValue substitui o registrador, nenhum delegate leu dado.
    expect(f.mock.loja.findMany).not.toHaveBeenCalled();
  });
  it('default servidor, filtro de alcance antes das leituras e projeção sem finanças', async () => {
    const f = clienteFalso(), r = await lerSituacaoAnalyticsDaLoja(f.cliente, alcance(), contexto);
    expect(f.transacao).toHaveBeenCalledWith(expect.any(Function), { repetivel: true, relatorio: {} });
    expect(f.mock.loja.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['l1'] } } }));
    expect(f.mock.integracaoConexao.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { lojaId: 'l1', provedor: 'IFOOD' } }));
    expect(f.mock.integracaoExecucao.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { moduloId: { in: ['m1'] }, dia: new Date(`${dia}T00:00:00Z`), perfil: 'diario' } }));
    expect(r).toMatchObject({ ok: true, dia, ambiente: 'PRODUCAO', situacao: { cobertura: 'disponivel', podeVerFaturamento: false,
      fontes: [{ tentativa: { estado: 'FALHA', concluidaEm: '2026-11-07T12:01:00.000Z', naoAntesDe: null }, versaoDisponivel: { publicadaEm: '2026-11-07T10:00:00.000Z' } }] } });
    const serializado = JSON.stringify({ r, consultas: f.calls });
    for (const proibido of ['gmv', 'pedidos', 'numeroGrupos', 'vazioOficial', 'hashAplicado', 'appId', 'ultimoRequestId', 'corpoOriginal', 'leaseAte', 'dono']) expect(serializado).not.toContain(proibido);
    expect(f.mock.kpiIfoodDia.findMany).not.toHaveBeenCalled(); expect(f.mock.integracaoPayload.findMany).not.toHaveBeenCalled();
  });
  it('loja válida mas inexistente no tenant não faz fallback', async () => {
    const f = clienteFalso();
    expect(await lerSituacaoAnalyticsDaLoja(f.cliente, alcance(['integracao.ver'], 'todas'), contexto, { lojaId: 'inexistente' })).toMatchObject({ ok: false, motivo: 'loja-indisponivel' });
    expect(f.mock.integracaoConexao.findMany).not.toHaveBeenCalled();
  });
  it('sem loja ou conexão conserva TEST real, sem produzir amostra', async () => {
    const f = clienteFalso(); f.mock.loja.findMany.mockResolvedValue([]);
    expect(await lerSituacaoAnalyticsDaLoja(f.cliente, alcance(), { ...contexto, homologacaoDeIntegracao: true })).toEqual({ ok: true, dia, ambiente: 'TEST', lojas: [], situacao: null });
    f.mock.loja.findMany.mockResolvedValue([{ id: 'l1', nome: 'Loja própria', ativa: true }]); f.mock.integracaoConexao.findMany.mockResolvedValue([]);
    expect(await lerSituacaoAnalyticsDaLoja(f.cliente, alcance(), { ...contexto, homologacaoDeIntegracao: true })).toMatchObject({ ok: true, ambiente: 'TEST', situacao: { cobertura: 'sem-fontes', fontes: [], aplicacao: { estado: 'teste' } } });
    expect(f.mock.integracaoFaturamentoDia.findFirst).not.toHaveBeenCalled();
  });
  it('conexão de ambiente diferente recusa antes de ler execuções/recibos', async () => {
    const f = clienteFalso();
    expect(await lerSituacaoAnalyticsDaLoja(f.cliente, alcance(), { ...contexto, homologacaoDeIntegracao: true })).toMatchObject({ ok: false, motivo: 'ambiente-incompativel' });
    expect(f.mock.integracaoExecucao.findMany).not.toHaveBeenCalled(); expect(f.mock.integracaoFaturamentoDia.findFirst).not.toHaveBeenCalled();
  });
  it('aguardo informa somente o prazo durável e não usa atualização/publicação como tentativa', async () => {
    const f = clienteFalso(), [e] = await f.mock.integracaoExecucao.findMany();
    f.mock.integracaoExecucao.findMany.mockResolvedValue([{ ...e, estado: 'AGUARDANDO', ultimoErro: 'limite' }]);
    const r = await lerSituacaoAnalyticsDaLoja(f.cliente, alcance(), contexto);
    expect(r).toMatchObject({ situacao: { fontes: [{ tentativa: { estado: 'AGUARDANDO', naoAntesDe: '2026-11-07T12:11:00.000Z' } }] } });
    expect(JSON.stringify(r)).not.toContain('última leitura válida');
  });
  it('reagendamento PLANEJADA não atribui datas da tentativa anterior à nova leitura prevista', async () => {
    const f = clienteFalso(), [e] = await f.mock.integracaoExecucao.findMany();
    f.mock.integracaoExecucao.findMany.mockResolvedValue([{ ...e, estado: 'PLANEJADA' }]);
    const r = await lerSituacaoAnalyticsDaLoja(f.cliente, alcance(), contexto);
    expect(r).toMatchObject({ situacao: { fontes: [{ tentativa: { estado: 'PLANEJADA', iniciadaEm: null, concluidaEm: null, naoAntesDe: null }, versaoDisponivel: { publicadaEm: '2026-11-07T10:00:00.000Z' } }] } });
    expect(JSON.stringify(r)).not.toContain('2026-11-07T12:00:00.000Z'); expect(JSON.stringify(r)).not.toContain('2026-11-07T12:01:00.000Z');
  });
  it('revisão de período não substitui data do PUBLICADO; aplicação anterior é preservada', async () => {
    const f = clienteFalso(), [s] = await f.mock.integracaoSnapshot.findMany();
    f.mock.integracaoSnapshot.findMany.mockResolvedValue([{ ...s, situacao: 'PENDENTE_PERIODO', geracao: 2, criadoEm: new Date('2026-11-07T12:02:00Z') }, s]);
    f.mock.integracaoFaturamentoDia.findFirst.mockResolvedValue({ ...rAplicado, estado: 'PENDENTE', motivo: 'PERIODO_FECHADO', revisaoSolicitada: 2n });
    expect(await lerSituacaoAnalyticsDaLoja(f.cliente, alcance(), contexto)).toMatchObject({ situacao: {
      fontes: [{ aplicada: true, revisaoPendente: true, versaoDisponivel: { publicadaEm: '2026-11-07T10:00:00.000Z' } }],
      aplicacao: { estado: 'pendente', aplicadoEm: '2026-11-07T10:01:00.000Z', conferidaEm: '2026-11-07T10:02:00.000Z', mantemAplicacaoAnterior: true },
    } });
  });
  it('fonte desligada continua visível e religação comercial não afirma cobertura completa', async () => {
    const f = clienteFalso(), [c] = await f.mock.integracaoConexao.findMany();
    f.mock.integracaoConexao.findMany.mockResolvedValue([{ ...c, estado: 'DESLIGADA' }, { ...c, id: 'c2', modulos: [{ id: 'm2', estado: 'ATIVO' }] }]);
    f.mock.integracaoFaturamentoDia.findFirst.mockResolvedValue(rAplicado);
    expect(await lerSituacaoAnalyticsDaLoja(f.cliente, alcance(), contexto)).toMatchObject({ situacao: { cobertura: 'vinculo-ambiguo', fontes: [{ vinculada: false, aplicada: true }, { vinculada: true, aplicada: false }] } });
  });
  it('conflito comercial em outra loja é apenas um booleano de integridade, sem expandir recorte', async () => {
    const f = clienteFalso(); f.mock.sql.mockImplementation(async q => q.join(' ').includes('AS ambigua') ? [{ ambigua: true }] : [{ repetivel: true, leitura: true }]);
    const r = await lerSituacaoAnalyticsDaLoja(f.cliente, alcance(), contexto);
    expect(r).toMatchObject({ situacao: { cobertura: 'vinculo-ambiguo', fontes: [{ chave: 'c1', nome: 'Fonte própria' }] } });
    if (!r.ok) throw new Error('Leitura recusada.');
    expect(r.lojas).toHaveLength(1); expect(r.situacao?.fontes).toHaveLength(1);
  });
  it('origem financeira mínima não depende de integração/liberação e usa a mesma fotografia', async () => {
    const f = clienteFalso(); f.mock.integracaoFaturamentoDia.findFirst.mockResolvedValue({ ...rAplicado, revisaoSolicitada: 2n });
    expect(await lerOrigemAnalyticsNoFaturamento(f.cliente, alcance(['faturamento.ver']), { lojaId: 'l1', dia })).toEqual({ origem: 'ifood-analytics', aplicadoEm: '2026-11-07T10:01:00.000Z', atualizacaoPendente: true });
    expect(f.mock.integracaoFaturamentoDia.findFirst).toHaveBeenCalledOnce();
    expect(f.mock.loja.findFirst.mock.invocationCallOrder[0]).toBeLessThan(f.mock.integracaoFaturamentoDia.findFirst.mock.invocationCallOrder[0]);
    expect(f.mock.liberacaoDeModulo.findUnique).not.toHaveBeenCalled();
    expect(f.mock.integracaoConexao.findMany).not.toHaveBeenCalled();
    expect(f.transacao).toHaveBeenCalledWith(expect.any(Function), { repetivel: true, relatorio: {} });
  });
  it('selo não expõe pendência sem aplicação ou quando falta permissão/loja', async () => {
    const f = clienteFalso();
    expect(await lerOrigemAnalyticsNoFaturamento(f.cliente, alcance(), { lojaId: 'l1', dia })).toBeNull();
    expect(f.transacao).not.toHaveBeenCalled();
    expect(await lerOrigemAnalyticsNoFaturamento(f.cliente, alcance(['faturamento.ver']), { lojaId: 'outra', dia })).toBeNull();
    f.mock.integracaoFaturamentoDia.findFirst.mockResolvedValue({ ...rAplicado, aplicadoEm: null });
    expect(await lerOrigemAnalyticsNoFaturamento(f.cliente, alcance(['faturamento.ver']), { lojaId: 'l1', dia })).toBeNull();
  });
  it('origem recusa transação aninhada sem readonly/repetível antes de ler o recibo', async () => {
    const f = clienteFalso(); f.mock.sql.mockResolvedValue([{ repetivel: false, leitura: false }]);
    expect(await lerOrigemAnalyticsNoFaturamento(f.cliente, alcance(['faturamento.ver']), { lojaId: 'l1', dia })).toBeNull();
    expect(f.mock.integracaoFaturamentoDia.findFirst).not.toHaveBeenCalled();
  });
});
