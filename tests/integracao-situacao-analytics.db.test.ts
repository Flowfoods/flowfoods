/** INT-1.8A: leituras reais em PostgreSQL descartável. Não chama o provedor. */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContextoDoParceiro } from '@/lib/erp/contexto-base';
const URL_TESTE = process.env.ERP_DB_TESTE;
const central = vi.hoisted(() => ({ exigirParceiro: vi.fn<(slug: string) => Promise<ContextoDoParceiro>>(), revalidar: vi.fn() }));
vi.mock('@/lib/erp/contexto', () => ({ exigirParceiro: central.exigirParceiro }));
vi.mock('next/cache', () => ({ revalidatePath: central.revalidar }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw Object.assign(new Error('REDIRECT'), { url }); } }));
vi.mock('@/lib/db', async () => {
  const { PrismaClient: P } = await import('@prisma/client');
  const real = await vi.importActual<typeof import('@/lib/db')>('@/lib/db');
  return { prisma: real.travarTenant(new P({ datasources: { db: { url: process.env.ERP_DB_TESTE ?? 'postgresql://sem-banco/x' } } })) };
});
import { prisma } from '@/lib/db';
import { acaoSolicitarReleitura } from '@/app/rodolfo/(painel)/integracoes/actions';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance, type Permissao } from '@/lib/erp/permissoes';
import { mudarLiberacao } from '@/lib/erp/liberacao';
import { obterDia } from '@/lib/erp/faturamento';
import { aplicarFaturamentoAnalytics } from '@/lib/erp/faturamento-integracao';
import { appPorId } from '@/lib/integracoes/core/apps';
import { armazemDoBanco } from '@/lib/integracoes/core/armazem-token';
import { desligarConexao, mudarModulo } from '@/lib/integracoes/core/conexoes';
import { pausarAnalytics } from '@/lib/integracoes/core/controle-analytics';
import { lerOrigemAnalyticsNoFaturamento, lerSituacaoAnalyticsDaLoja } from '@/lib/integracoes/core/situacao-analytics';
import type { PedidoReleituraAnalytics } from '@/lib/integracoes/core/situacao-analytics-campos';
import { ServicoDeToken } from '@/lib/integracoes/ifood/auth';
import { Limitador } from '@/lib/integracoes/ifood/limitador';
import { executarTarefaAnalytics } from '@/lib/integracoes/ifood/pipeline-executor';
import { agendarJanela, criarRepositorioAnalytics } from '@/lib/integracoes/ifood/pipeline-repositorio';
import type { PedidoHttp } from '@/lib/integracoes/ifood/transporte';
import { criarPeriodoFechadoDeTeste, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';
import { assumirPosseFinanceira, bucketFinanceiro, DIA_FINANCEIRO, massaFinanceira, publicarFinanceiro, type MassaFinanceira } from './integracao-faturamento-apoio';

const inventario = { parceiros: [] as string[], apps: [] as string[], autor: `QA Situação ${randomUUID()}` };
const DIA = DIA_FINANCEIRO;
const todas = resolverAlcance({ perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
const al = (lojaId: string, permissoes: Permissao[] = ['integracao.ver']): Alcance => ({ nivel: 'LOJA', lojas: [lojaId], permissoes: new Set(permissoes) });
const contexto = (m: MassaFinanceira) => ({ parceiroId: m.cliente.parceiroId, homologacaoDeIntegracao: m.ambiente === 'TEST' });

describe.skipIf(!URL_TESTE)('INT-1.8A · fotografia e isolamento reais', { timeout: 120_000 }, () => {
  let db: PrismaClient, concorrente: PrismaClient, perfil: PerfilDoBanco;
  let lider: Awaited<ReturnType<typeof assumirPosseFinanceira>>;
  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('Somente banco local descartável.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE! } } });
    concorrente = new PrismaClient({ datasources: { db: { url: URL_TESTE! } } });
    perfil = await perfilDoBanco(db);
  });
  beforeEach(async () => {
    await prisma.integracaoControle.update({ where: { id: 'IFOOD_ANALYTICS' }, data: { bloqueadaAte: null, proximaChamadaEm: null } });
    await pausarAnalytics(false, inventario.autor); lider = await assumirPosseFinanceira(URL_TESTE!);
  });
  afterEach(async () => { if (lider) { lider.liberar(); await lider.encerrada; } });
  afterAll(async () => {
    if (!db) return;
    try {
      await prisma.integracaoControle.update({ where: { id: 'IFOOD_ANALYTICS' }, data: { pausada: false, bloqueadaAte: null, proximaChamadaEm: null, donoAtual: null } });
      await limparParceiros(db, perfil, inventario.parceiros);
      await db.$transaction(async tx => {
        await tx.$executeRawUnsafe('ALTER TABLE "IntegracaoApp" DISABLE TRIGGER "IntegracaoApp_nao_apaga"');
        await tx.$executeRawUnsafe('DELETE FROM "IntegracaoApp" WHERE id=ANY($1::text[])', inventario.apps);
        await tx.$executeRawUnsafe('ALTER TABLE "IntegracaoApp" ENABLE TRIGGER "IntegracaoApp_nao_apaga"');
      });
      await prisma.auditLog.deleteMany({ where: { evento: 'integracao.analytics-pausa', dados: { path: ['autor'], equals: inventario.autor } } });
    } finally { await Promise.all([db.$disconnect(), concorrente.$disconnect(), prisma.$disconnect()]); }
  }, 360_000);
  const massa = () => massaFinanceira(db, inventario);
  const aplicar = (m: MassaFinanceira, c = m.cliente) => aplicarFaturamentoAnalytics(c, lider.posse, { lojaId: m.lojaId, dia: DIA }, () => true);
  const ler = (m: MassaFinanceira, c = m.cliente, a = al(m.lojaId)) => lerSituacaoAnalyticsDaLoja(c, a, contexto(m), { lojaId: m.lojaId, dia: DIA });

  async function centralDaMassa(m: MassaFinanceira) {
    const parceiro = await db.parceiroFlow.findUniqueOrThrow({ where: { id: m.cliente.parceiroId } });
    const ctx: ContextoDoParceiro = { parceiro, sessao: { userId: 'operador-sintetico', autorNome: inventario.autor },
      alcance: ALCANCE_FLOWFOODS, cliente: m.cliente, podeEscrever: true, bloqueio: null };
    central.exigirParceiro.mockImplementation(async slug => { if (slug !== parceiro.slug) throw new Error('Sessão inválida.'); return ctx; });
    return ctx;
  }
  function pedidoPara(m: MassaFinanceira, estado: PedidoReleituraAnalytics['estado'], geracao = 1): PedidoReleituraAnalytics {
    return { lojaId: m.lojaId, conexaoId: m.conexaoId, dia: DIA, estado, geracao };
  }
  async function enviar(slug: string, pedido: PedidoReleituraAnalytics) {
    try { return (await acaoSolicitarReleitura(slug, pedido, null))?.erros?.geral; }
    catch (e) { if (e instanceof Error && 'url' in e && typeof e.url === 'string') return e.url; throw e; }
  }
  const historicoReleitura = (m: MassaFinanceira) => m.cliente.historicoAlteracao.findMany({ where: { acao: 'PEDIU_RELEITURA' } });
  async function podeReagendar(m: MassaFinanceira) {
    const r = await ler(m, m.cliente, ALCANCE_FLOWFOODS);
    if (!r.ok || !r.situacao) throw new Error('Fixture sem situação de loja.');
    return r.situacao.fontes.find(f => f.chave === m.conexaoId)?.tentativa?.nivel1?.podeReagendar;
  }

  it('encerra a falta de credencial na geração adquirida, orienta só a Central e publica a mesma janela após correção', async () => {
    const m = await massa(), ctx = await centralDaMassa(m);
    await agendarJanela(m.cliente, { moduloId: m.moduloId, dia: DIA, ciclo: '2026-10-20', tipo: 'D1', fuso: 'America/Sao_Paulo', unidade: 'REAL' });
    const repositorio = criarRepositorioAnalytics(m.cliente, lider.posse, () => true);
    const primeira = await repositorio.adquirir(), app = await appPorId(m.appId);
    if (!primeira || !app) throw new Error('Sem execução ou app na fixture.');
    const env: Record<string, string> = { INTEGRACAO_IFOOD_ATIVA: 'true', INTEGRACAO_CHAVE_CIFRAGEM: 'a'.repeat(64) };
    const transporte = vi.fn(async (p: PedidoHttp) => {
      const dados = p.url.endsWith('/oauth/token') ? { accessToken: 'token-sintetico', expiresIn: 3600 }
        : { data: [bucketFinanceiro()], currentPage: 1, size: 1, totalItems: 1, totalPages: 1 };
      return { status: 200, cabecalhos: {}, corpo: JSON.stringify(dados) };
    });
    const limitador = new Limitador();
    const tokens = new ServicoDeToken({ armazem: armazemDoBanco, transporte, limitador, env });
    const http = { app: { ...app, homologacao: app.estadoHomologacao }, tokens, limitador, transporte, env };
    expect(await executarTarefaAnalytics(primeira, { repositorio, http })).toEqual({ estado: 'falhou', paginas: 0 });
    expect(transporte).not.toHaveBeenCalled();
    expect(await m.cliente.integracaoExecucao.findMany()).toMatchObject([{
      id: primeira.id, geracao: primeira.geracao, estado: 'FALHA', ultimoErro: 'configuracao-credencial-ausente', ultimoHttp: null, ultimoRequestId: null, dono: null, leaseAte: null,
    }]);
    expect(await m.cliente.integracaoPayload.count()).toBe(0);
    expect(await m.cliente.integracaoSnapshot.count()).toBe(0);
    expect(await m.cliente.integracaoConexaoModulo.findUnique({ where: { id: m.moduloId } })).toMatchObject({ estado: 'ATIVO', ultimoErro: null });
    expect(await repositorio.adquirir()).toBeNull();
    const central = await ler(m, m.cliente, ALCANCE_FLOWFOODS), loja = await ler(m);
    expect(central).toMatchObject({ situacao: { fontes: [{ tentativa: {
      mensagem: { explicacao: 'Disponibilize a credencial do app ao coletor.' }, nivel1: { paginasConfirmadas: 0, podeReagendar: true },
    } }] } });
    expect(loja).toMatchObject({ situacao: { fontes: [{ tentativa: { mensagem: { explicacao: 'A FlowFoods precisa conferir a configuração do coletor antes de solicitar outra leitura.' } } }] } });
    expect(JSON.stringify([central, loja])).not.toMatch(/configuracao-credencial|IFOOD_BI_CLIENT_SECRET|Dokploy|Falta a variável/);
    expect(JSON.stringify(loja)).not.toMatch(/nivel1|credencial do app/);

    env[app.nomeDoSegredo] = 'credencial-sintetica';
    expect(await enviar(ctx.parceiro.slug, pedidoPara(m, 'FALHA', primeira.geracao))).toContain('feito=releitura');
    const nova = await repositorio.adquirir();
    if (!nova) throw new Error('A releitura não foi adquirida.');
    expect(nova).toMatchObject({ id: primeira.id, geracao: primeira.geracao + 1, moduloId: m.moduloId, lojaId: m.lojaId });
    expect(await executarTarefaAnalytics(nova, { repositorio, http })).toEqual({ estado: 'publicada', paginas: 1 });
    expect(transporte).toHaveBeenCalledTimes(2);
    expect(await m.cliente.integracaoExecucao.findMany()).toMatchObject([{ id: primeira.id, estado: 'SUCESSO', ultimoErro: null }]);
    expect(await m.cliente.integracaoSnapshot.count()).toBe(1);
    expect(await historicoReleitura(m)).toHaveLength(1);
  });

  it('ação N1 concorrente reaproveita o dia/fonte, retém filtro e autoria e reaplica o mesmo conteúdo uma única vez', async () => {
    const m = await massa(), ctx = await centralDaMassa(m), slug = ctx.parceiro.slug;
    const antes = await publicarFinanceiro(m, lider.posse); await aplicar(m);
    const lancamento = await m.cliente.faturamentoLancamento.findFirstOrThrow();
    const pedido = pedidoPara(m, 'SUCESSO', antes.tarefa.geracao);
    const destino = `/rodolfo/integracoes/${slug}?loja=${m.lojaId}&dia=${DIA}&feito=releitura`;
    const saidas = await Promise.all([enviar(slug, pedido), enviar(slug, pedido)]);
    expect(saidas.filter(s => s === destino)).toHaveLength(1);
    expect(saidas.find(s => s !== destino)).toContain('janela mudou');
    expect(central.revalidar).toHaveBeenCalledWith(`/rodolfo/integracoes/${slug}`);
    expect(await historicoReleitura(m)).toMatchObject([{ autorNome: inventario.autor, entidadeId: m.moduloId, depois: { data: DIA, geracao: 1, execucaoId: antes.tarefa.id, usuarioId: ctx.sessao.userId } }]);
    expect(await m.cliente.integracaoExecucao.findMany()).toMatchObject([{ id: antes.tarefa.id, geracao: 1, estado: 'PLANEJADA', prioridade: 0 }]);
    expect(await m.cliente.faturamentoLancamento.findMany()).toEqual([lancamento]);

    const repo = criarRepositorioAnalytics(m.cliente, lider.posse, () => true), t = await repo.adquirir();
    if (!t) throw new Error('A fila não adquiriu a releitura.');
    expect(t).toMatchObject({ id: antes.tarefa.id, parceiroId: m.cliente.parceiroId, moduloId: m.moduloId, lojaId: m.lojaId, perfil: 'diario', geracao: 2 });
    const emAndamento = await ler(m, m.cliente, ALCANCE_FLOWFOODS);
    expect(emAndamento).toMatchObject({ situacao: { fontes: [{ tentativa: { estado: 'EXECUTANDO', nivel1: { geracao: 2, paginasConfirmadas: 0, podeReagendar: false } } }] } });
    expect(JSON.stringify(await ler(m))).not.toMatch(/nivel1|paginasConfirmadas|inicioDaGeracao/);
    await repo.salvarPagina(t, { pagina: 1, http: 200, requestId: null, corpoOriginal: JSON.stringify({ data: [bucketFinanceiro()], currentPage: 1, size: 1, totalItems: 1, totalPages: 1 }) });
    expect(await ler(m, m.cliente, ALCANCE_FLOWFOODS)).toMatchObject({ situacao: { fontes: [{ tentativa: { nivel1: { geracao: 2, paginasConfirmadas: 1 } } }] } });
    expect(await repo.publicar(t)).toBe('sem-mudanca');
    expect(await aplicar(m)).toMatchObject({ estado: 'igual' });
    // O mesmo estado SUCESSO voltou, mas o antigo clique ainda não se aplica à nova geração.
    expect(await enviar(slug, pedido)).toContain('janela mudou');
    expect(await m.cliente.integracaoSnapshot.count()).toBe(1);
    expect(await m.cliente.integracaoFaturamentoDia.count()).toBe(1);
    expect(await m.cliente.faturamentoLancamento.findMany()).toEqual([lancamento]);
    expect(await historicoReleitura(m)).toHaveLength(1);
  });

  it('ação revalida o nível, o contexto, o vínculo de produção, a liberação e o dia, sem criar primeira leitura', async () => {
    const m = await massa(), ctx = await centralDaMassa(m), slug = ctx.parceiro.slug, outro = await massa();
    const pedido = pedidoPara(m, 'SUCESSO');
    await expect(enviar('slug-forjado', pedido)).rejects.toThrow('Sessão inválida');
    expect(await enviar(slug, pedido)).toContain('janela mudou');
    expect(await m.cliente.integracaoExecucao.count()).toBe(0);
    const { tarefa } = await publicarFinanceiro(m, lider.posse);
    const antes = await m.cliente.integracaoExecucao.findUniqueOrThrow({ where: { id: tarefa.id } });
    for (const campos of [{ alcance: todas }, { bloqueio: 'Suspenso' }, { podeEscrever: false }, { cliente: doParceiro(m.cliente.parceiroId, db, { somenteLeitura: true }) },
      { parceiro: { ...ctx.parceiro, homologacaoDeIntegracao: true } }, { cliente: outro.cliente }]) {
      central.exigirParceiro.mockResolvedValueOnce({ ...ctx, ...campos });
      expect(await enviar(slug, pedido)).toContain('escrita de nível 1');
    }
    for (const campos of [{ lojaId: outro.lojaId }, { conexaoId: outro.conexaoId }]) {
      expect(await enviar(slug, { ...pedido, ...campos })).toContain('indisponível');
    }
    for (const campos of [{ dia: '2999-01-01' }, { dia: '2026-02-30' }, { dia: '' }, { geracao: 0 }]) {
      expect(await enviar(slug, { ...pedido, ...campos })).toContain('dia já encerrado');
    }
    await prisma.integracaoApp.update({ where: { id: m.appId }, data: { estadoHomologacao: 'PENDENTE' } });
    expect(await podeReagendar(m)).toBe(false);
    expect(await enviar(slug, pedido)).toContain('indisponível');
    await prisma.integracaoApp.update({ where: { id: m.appId }, data: { estadoHomologacao: 'HOMOLOGADO' } });
    await mudarLiberacao(m.cliente, 'integracao', false, inventario.autor);
    expect(await enviar(slug, pedido)).toContain('indisponível');
    await mudarLiberacao(m.cliente, 'integracao', true, inventario.autor);
    await desligarConexao(m.cliente, m.conexaoId, inventario.autor);
    expect(await podeReagendar(m)).toBe(false);
    expect(await enviar(slug, pedido)).toContain('indisponível');
    expect(await m.cliente.integracaoExecucao.findUnique({ where: { id: tarefa.id } })).toEqual(antes);
    expect(await historicoReleitura(m)).toEqual([]);
  });

  it('espera local, 429, pausa e prazo inválido continuam protegidos contra um pedido forjado', async () => {
    const m = await massa(), ctx = await centralDaMassa(m), slug = ctx.parceiro.slug;
    const { tarefa } = await publicarFinanceiro(m, lider.posse);
    const where = { id: tarefa.id };
    const pedido = pedidoPara(m, 'SUCESSO');
    const futura = new Date('2099-11-01T10:00:00Z');
    await pausarAnalytics(true, inventario.autor);
    expect(await podeReagendar(m)).toBe(false);
    expect(await enviar(slug, pedido)).toContain('indisponível');
    await pausarAnalytics(false, inventario.autor);
    await m.cliente.integracaoExecucao.update({ where, data: { naoAntesDe: futura } });
    expect(await podeReagendar(m)).toBe(false);
    expect(await enviar(slug, pedido)).toContain('janela mudou');
    expect(await m.cliente.integracaoExecucao.findUnique({ where })).toMatchObject({ estado: 'SUCESSO', geracao: 1, naoAntesDe: futura });
    await m.cliente.integracaoExecucao.update({ where, data: { naoAntesDe: new Date(0), estado: 'AGUARDANDO', ultimoErro: 'limite', ultimoHttp: 429 } });
    await prisma.integracaoControle.update({ where: { id: 'IFOOD_ANALYTICS' }, data: { bloqueadaAte: futura } });
    expect(await podeReagendar(m)).toBe(false);
    expect(await enviar(slug, pedido)).toContain('indisponível');
    await prisma.integracaoControle.update({ where: { id: 'IFOOD_ANALYTICS' }, data: { bloqueadaAte: null } });
    expect(await enviar(slug, pedido)).toContain('janela mudou');
    expect(await enviar(slug, { ...pedido, estado: 'AGUARDANDO' })).toContain('dia já encerrado');
    await m.cliente.integracaoExecucao.update({ where, data: { estado: 'FALHA', ultimoErro: 'prazo-invalido' } });
    expect(await podeReagendar(m)).toBe(false);
    expect(await enviar(slug, { ...pedido, estado: 'FALHA' })).toContain('janela mudou');
    expect(await historicoReleitura(m)).toEqual([]);
  });

  it('a releitura histórica precede outro D1 dentro do perfil e consome essa prioridade ao ser adquirida', async () => {
    const m = await massa(), ctx = await centralDaMassa(m);
    const diario = { moduloId: m.moduloId, dia: DIA, ciclo: '2026-10-20', fuso: 'America/Sao_Paulo', unidade: 'REAL' as const };
    await agendarJanela(m.cliente, { ...diario, tipo: 'HISTORICO' });
    const repo = criarRepositorioAnalytics(m.cliente, lider.posse, () => true), antiga = await repo.adquirir();
    if (!antiga) throw new Error('Faltou a janela do histórico.');
    await repo.falhar(antiga, { codigo: 'requisicao-invalida', http: 400, requestId: 'referencia-anterior' });
    await agendarJanela(m.cliente, { ...diario, dia: '2026-10-20', tipo: 'D1' });
    expect(await enviar(ctx.parceiro.slug, pedidoPara(m, 'FALHA'))).toContain('feito=releitura');
    const nova = await repo.adquirir();
    expect(nova).toMatchObject({ id: antiga.id, tipo: 'HISTORICO', geracao: 2 });
    expect(await m.cliente.integracaoExecucao.findUnique({ where: { id: antiga.id } })).toMatchObject({
      estado: 'EXECUTANDO', prioridade: 3, ultimoHttp: null, ultimoRequestId: null, ultimoErro: null,
    });
    expect(await ler(m, m.cliente, ALCANCE_FLOWFOODS)).toMatchObject({ situacao: { fontes: [{ tentativa: { nivel1: { geracao: 2, paginasConfirmadas: 0 } } }] } });
    expect(await m.cliente.integracaoExecucao.findFirst({ where: { tipo: 'D1' } })).toMatchObject({ estado: 'PLANEJADA', geracao: 0, prioridade: 1 });
  });

  it('lease vivo, posse antiga ainda viva e reaquisição do worker são cercados por geração; lease órfão é recuperável', async () => {
    const m = await massa(), ctx = await centralDaMassa(m), slug = ctx.parceiro.slug;
    await agendarJanela(m.cliente, { moduloId: m.moduloId, tipo: 'D1', dia: DIA, ciclo: '2026-10-20', fuso: 'America/Sao_Paulo', unidade: 'REAL' });
    const original = criarRepositorioAnalytics(m.cliente, lider.posse, () => true), t = await original.adquirir();
    if (!t) throw new Error('Teste sem janela adquirida.');
    const where = { id: t.id }, pedido = pedidoPara(m, 'EXECUTANDO', t.geracao);
    expect(await podeReagendar(m)).toBe(false);
    expect(await enviar(slug, pedido)).toContain('janela mudou');
    const vencido = { leaseAte: new Date(0) };
    await m.cliente.integracaoExecucao.update({ where, data: vencido });
    expect(await podeReagendar(m)).toBe(false);
    expect(await enviar(slug, pedido)).toContain('janela mudou');
    expect(await original.adquirir()).toBeNull();
    lider.liberar(); await lider.encerrada;
    lider = await assumirPosseFinanceira(URL_TESTE!);
    expect(await podeReagendar(m)).toBe(true);
    expect(await enviar(slug, pedido)).toContain('feito=releitura');
    const atual = criarRepositorioAnalytics(m.cliente, lider.posse, () => true);
    const nova = await atual.adquirir();
    expect(nova).toMatchObject({ id: t.id, geracao: 2, perfil: 'diario' });
    await expect(original.renovar(t)).rejects.toMatchObject({ codigo: 'POSSE' });
    expect(await enviar(slug, pedido)).toContain('janela mudou');
    expect(await m.cliente.integracaoExecucao.findMany()).toMatchObject([{ id: t.id, estado: 'EXECUTANDO', geracao: 2, dono: lider.posse.id }]);
    expect(await historicoReleitura(m)).toHaveLength(1);
  });

  it('loja multimarca mantém o aviso de ambiguidade e só oferece a fonte independente, inclusive em centavos', async () => {
    const m = await massa(), ctx = await centralDaMassa(m), slug = ctx.parceiro.slug;
    const antiga = await massaFinanceira(db, inventario, { cliente: m.cliente, lojaId: m.lojaId });
    await publicarFinanceiro(antiga, lider.posse);
    await desligarConexao(m.cliente, antiga.conexaoId, inventario.autor);
    const religada = await massaFinanceira(db, inventario, { cliente: m.cliente, lojaId: m.lojaId, merchantId: antiga.merchantId });
    await publicarFinanceiro(religada, lider.posse);
    await agendarJanela(m.cliente, { moduloId: m.moduloId, dia: DIA, tipo: 'D1', ciclo: '2026-10-20', fuso: 'America/Sao_Paulo', unidade: 'CENTAVO' });
    const repo = criarRepositorioAnalytics(m.cliente, lider.posse, () => true), t = await repo.adquirir();
    if (!t || t.moduloId !== m.moduloId) throw new Error('Faltou a janela independente.');
    await repo.falhar(t, { codigo: 'configuracao' });
    const situacao = await ler(m, m.cliente, ALCANCE_FLOWFOODS);
    expect(situacao).toMatchObject({ situacao: { cobertura: 'vinculo-ambiguo' } });
    expect(await podeReagendar(religada)).toBe(false);
    expect(await podeReagendar(m)).toBe(true);
    // Mesmo conhecendo as chaves de uma janela elegível, outro portão só recebe false.
    const outro = await massa();
    expect(await outro.cliente.sql<{ ok: boolean }>`SELECT erp_integracao_pode_reler_dia(${m.cliente.parceiroId}, ${m.lojaId}, ${t.id}, 1) AS ok`).toEqual([{ ok: false }]);
    expect(await enviar(slug, pedidoPara(religada, 'SUCESSO'))).toContain('janela mudou');
    expect(await enviar(slug, pedidoPara(m, 'FALHA'))).toContain('feito=releitura');
    expect(await m.cliente.integracaoExecucao.findUnique({ where: { id: t.id } })).toMatchObject({ estado: 'PLANEJADA', unidade: 'CENTAVO' });
  });

  it('sem as permissões/modulo ou com loja/tenant forjados não devolve situação', async () => {
    const m = await massa(), outro = await massa(); await publicarFinanceiro(m, lider.posse);
    expect(await ler(m, m.cliente, al(m.lojaId, ['faturamento.ver']))).toMatchObject({ ok: false, motivo: 'sem-permissao' });
    expect(await lerSituacaoAnalyticsDaLoja(m.cliente, al(m.lojaId), contexto(m), { lojaId: outro.lojaId, dia: DIA })).toMatchObject({ ok: false, motivo: 'loja-indisponivel' });
    expect(await lerSituacaoAnalyticsDaLoja(m.cliente, todas, contexto(m), { lojaId: outro.lojaId, dia: DIA })).toMatchObject({ ok: false, motivo: 'loja-indisponivel' });
    expect(await lerSituacaoAnalyticsDaLoja(m.cliente, todas, contexto(outro), { lojaId: m.lojaId, dia: DIA })).toMatchObject({ ok: false, motivo: 'contexto-invalido' });
    expect(await mudarLiberacao(m.cliente, 'integracao', false, inventario.autor)).toMatchObject({ ok: true });
    expect(await ler(m)).toMatchObject({ ok: false, motivo: 'sem-modulo' });
  });
  it('operacional não consulta Kpi/payload/dinheiro e nenhuma projeção financeira sai ao navegador', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse); await aplicar(m);
    const consultas: unknown[] = [];
    const protegido: ClienteDoParceiro = { ...m.cliente, transacao: (fn, opcoes) => m.cliente.transacao(async tx => {
      const envolver = <T extends object>(delegate: T): T => Object.fromEntries(Object.entries(delegate).map(([k, v]) => [k, typeof v === 'function' ? (...args: unknown[]) => {
        consultas.push(args); return v(...args);
      } : v])) as T;
      return fn({ ...tx, integracaoSnapshot: envolver(tx.integracaoSnapshot), integracaoExecucao: envolver(tx.integracaoExecucao), integracaoConexao: envolver(tx.integracaoConexao), integracaoFaturamentoDia: envolver(tx.integracaoFaturamentoDia),
        kpiIfoodDia: { ...tx.kpiIfoodDia, findMany: () => { throw new Error('Leu métricas.'); } },
        integracaoPayload: { ...tx.integracaoPayload, findMany: () => { throw new Error('Leu raw.'); } },
      });
    }, opcoes) };
    const r = await ler(m, protegido); expect(r).toMatchObject({ ok: true, situacao: { podeVerFaturamento: false, cobertura: 'disponivel', aplicacao: { estado: 'aplicado' } } });
    const texto = JSON.stringify({ r, consultas });
    for (const vedado of ['pedidos', 'valorCentavos', 'gmv', 'vazioOficial', 'numeroGrupos', 'ultimoHash', 'ultimoRequestId', 'appId', 'leaseAte', 'corpoOriginal']) expect(texto).not.toContain(vedado);
  });
  it('ausência de leitura difere de versão publicada, inclusive vazio oficial sem revelar zero', async () => {
    const m = await massa();
    expect(await ler(m)).toMatchObject({ situacao: { cobertura: 'sem-leitura', fontes: [{ tentativa: null, versaoDisponivel: null }] } });
    await publicarFinanceiro(m, lider.posse, []);
    const r = await ler(m);
    expect(r).toMatchObject({ situacao: { cobertura: 'disponivel', fontes: [{ tentativa: { estado: 'SUCESSO' }, versaoDisponivel: { publicadaEm: expect.any(String) } }] } });
    expect(JSON.stringify(r)).not.toMatch(/vazioOficial|zero vendas|"pedidos"/);
  });
  it('no-op seguido de falha mantém data da versão e distingue tentativa posterior', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse); const a = await ler(m);
    await publicarFinanceiro(m, lider.posse, undefined, { ciclo: '2026-10-21' });
    await agendarJanela(m.cliente, { moduloId: m.moduloId, dia: DIA, tipo: 'REVISAO', ciclo: '2026-10-22', fuso: 'America/Sao_Paulo', unidade: 'REAL' });
    const repo = criarRepositorioAnalytics(m.cliente, lider.posse, () => true), t = await repo.adquirir();
    if (!t) throw new Error('Fixture sem tarefa.');
    await repo.falhar(t, { codigo: 'requisicao-invalida', http: 400, requestId: 'qa-operacional-400' });
    const b = await ler(m); if (!a.ok || !b.ok) throw new Error('Leitura recusada.');
    expect(b.situacao?.fontes[0].versaoDisponivel).toEqual(a.situacao?.fontes[0].versaoDisponivel);
    expect(b.situacao?.fontes[0].tentativa).toMatchObject({ estado: 'FALHA', mensagem: { rotulo: 'Pedido de leitura recusado' }, concluidaEm: expect.any(String) });
    expect(JSON.stringify(b)).not.toContain('qa-operacional-400');
  });
  it('período fechado conserva PUBLICADO e aplicação anterior com revisão pendente visível', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse); await aplicar(m); const a = await ler(m);
    await m.cliente.transacao(tx => criarPeriodoFechadoDeTeste(tx, { nome: 'QA período', inicio: '2026-10-01', fim: '2026-10-31' }));
    await publicarFinanceiro(m, lider.posse, [bucketFinanceiro(34.99)], { ciclo: '2026-10-21' });
    const b = await ler(m); if (!a.ok || !b.ok) throw new Error('Leitura recusada.');
    expect(b.situacao?.fontes[0]).toMatchObject({ revisaoPendente: true, tentativa: { estado: 'PENDENTE_PERIODO' }, versaoDisponivel: a.situacao?.fontes[0].versaoDisponivel });
    expect(b.situacao?.aplicacao.aplicadoEm).toBe(a.situacao?.aplicacao.aplicadoEm);
  });
  it('vários merchants e fonte desligada não desaparecem e incompletude continua explícita', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse); await aplicar(m);
    const segunda = await massaFinanceira(db, inventario, { cliente: m.cliente, lojaId: m.lojaId });
    await aplicar(m);
    const r = await ler(m); expect(r).toMatchObject({ situacao: { cobertura: 'parcial', aplicacao: { estado: 'pendente', mantemAplicacaoAnterior: true } } });
    expect(await desligarConexao(m.cliente, m.conexaoId, inventario.autor)).toMatchObject({ ok: true });
    const d = await ler(m); if (!d.ok) throw new Error('Leitura recusada.');
    expect(d.situacao?.fontes).toHaveLength(2); expect(d.situacao?.fontes.find(f => f.chave === m.conexaoId)).toMatchObject({ vinculada: false, aplicada: true });
    expect(d.situacao?.fontes.find(f => f.chave === segunda.conexaoId)?.versaoDisponivel).toBeNull();
  });
  it('403 não elimina histórico e pausa real aparece sem prometer sucesso', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse);
    await agendarJanela(m.cliente, { moduloId: m.moduloId, dia: DIA, tipo: 'REVISAO', ciclo: '2026-10-21', fuso: 'America/Sao_Paulo', unidade: 'REAL' });
    const repo = criarRepositorioAnalytics(m.cliente, lider.posse, () => true), t = await repo.adquirir(); if (!t) throw new Error('Sem tarefa.');
    await repo.falhar(t, { codigo: 'sem-permissao', http: 403 });
    expect(await ler(m)).toMatchObject({ situacao: { fontes: [{ acesso: { rotulo: 'Acesso recusado pelo iFood' }, tentativa: { mensagem: { rotulo: 'Acesso recusado' } }, versaoDisponivel: { publicadaEm: expect.any(String) } }] } });
    const pausada = await massa(); await publicarFinanceiro(pausada, lider.posse);
    expect(await mudarModulo(pausada.cliente, pausada.moduloId, 'pausar', inventario.autor)).toMatchObject({ ok: true });
    expect(await ler(pausada)).toMatchObject({ situacao: { fontes: [{ acesso: { rotulo: 'Coleta pausada' } }] } });
  });
  it('TEST deriva do parceiro/conexão, e perfil acesso não vira leitura diária', async () => {
    const m = await massaFinanceira(db, inventario, { ambiente: 'TEST' });
    await agendarJanela(m.cliente, { moduloId: m.moduloId, dia: DIA, tipo: 'ACESSO', ciclo: '2026-10-21', fuso: 'America/Sao_Paulo', unidade: 'REAL' });
    const repo = criarRepositorioAnalytics(m.cliente, lider.posse, () => true), t = await repo.adquirir(); if (!t) throw new Error('Sem tarefa.');
    await repo.salvarPagina(t, { pagina: 1, http: 200, requestId: 'qa-acesso', corpoOriginal: JSON.stringify({ orderStatus: { value: { CONCLUDED: 1 } } }) });
    await repo.verificarAcesso(t);
    expect(await ler(m)).toMatchObject({ ambiente: 'TEST', situacao: { cobertura: 'sem-leitura', fontes: [{ tentativa: null, versaoDisponivel: null }], aplicacao: { estado: 'teste' } } });
    await publicarFinanceiro(m, lider.posse);
    expect(await ler(m)).toMatchObject({ ambiente: 'TEST', situacao: { cobertura: 'disponivel', aplicacao: { estado: 'teste', aplicadoEm: null } } });
    expect(await lerSituacaoAnalyticsDaLoja(m.cliente, todas, { ...contexto(m), homologacaoDeIntegracao: false }, { lojaId: m.lojaId, dia: DIA })).toMatchObject({ ok: false, motivo: 'ambiente-incompativel' });
  });
  it('relação comercial em outra loja produz só pendência, sem divulgar a loja fora do alcance', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse); await desligarConexao(m.cliente, m.conexaoId, inventario.autor);
    const outra = await massaFinanceira(db, inventario, { cliente: m.cliente, merchantId: m.merchantId });
    const r = await ler(m); expect(r).toMatchObject({ situacao: { cobertura: 'vinculo-ambiguo' } });
    expect(JSON.stringify(r)).not.toContain(outra.lojaId); expect(JSON.stringify(r)).not.toContain(outra.conexaoId);
  });
  it('origem mínima segue disponível sem integracao.ver ou liberação, mas respeita faturamento.ver/loja', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse); await aplicar(m);
    const gravado = await m.cliente.integracaoFaturamentoDia.findFirstOrThrow();
    await mudarLiberacao(m.cliente, 'integracao', false, inventario.autor);
    expect(await lerOrigemAnalyticsNoFaturamento(m.cliente, al(m.lojaId, ['faturamento.ver']), { lojaId: m.lojaId, dia: DIA })).toEqual({ origem: 'ifood-analytics', aplicadoEm: gravado.aplicadoEm!.toISOString(), atualizacaoPendente: false });
    expect(await lerOrigemAnalyticsNoFaturamento(m.cliente, al(m.lojaId), { lojaId: m.lojaId, dia: DIA })).toBeNull();
    expect((await obterDia(m.cliente, al(m.lojaId, ['faturamento.ver']), m.lojaId, DIA))?.origemAnalytics).toMatchObject({ aplicadoEm: gravado.aplicadoEm!.toISOString() });
  });
  it('recusa aninhamento inadequado e aceita a fotografia externa de obterDia/relatório', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse); await aplicar(m);
    expect(await m.cliente.transacao(tx => ler(m, tx))).toMatchObject({ ok: false, motivo: 'leitura-indisponivel' });
    expect(await m.cliente.transacao(tx => lerOrigemAnalyticsNoFaturamento(tx, todas, { lojaId: m.lojaId, dia: DIA }))).toBeNull();
    expect(await m.cliente.transacao(tx => ler(m, tx), { repetivel: true, relatorio: {} })).toMatchObject({ ok: true });
    await expect(m.cliente.transacao(async tx => { await ler(m, tx); await tx.loja.update({ where: { id: m.lojaId }, data: { nome: 'não gravar' } }); }, { repetivel: true, relatorio: {} })).rejects.toThrow();
  });
  it('publicação/aplicação concorrentes não misturam snapshot anterior com recibo novo', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse); await aplicar(m);
    const antes = await ler(m); if (!antes.ok) throw new Error('Leitura recusada.');
    const outro = { ...m, cliente: doParceiro(m.cliente.parceiroId, concorrente) };
    let atualizou = false;
    const interrompido: ClienteDoParceiro = { ...m.cliente, transacao: (fn, opcoes) => m.cliente.transacao(tx => fn({ ...tx,
      integracaoSnapshot: { ...tx.integracaoSnapshot, findMany: (async args => {
        const resposta = await tx.integracaoSnapshot.findMany(args);
        if (!atualizou) { atualizou = true; await publicarFinanceiro(outro, lider.posse, [bucketFinanceiro(35.99)], { ciclo: '2026-10-21' }); await aplicar(outro); }
        return resposta;
      }) as typeof tx.integracaoSnapshot.findMany },
    }), opcoes) };
    const durante = await ler(m, interrompido), depois = await ler(m);
    expect(atualizou).toBe(true); if (!durante.ok || !depois.ok) throw new Error('Leitura recusada.');
    expect(durante.situacao?.fontes[0].versaoDisponivel).toEqual(antes.situacao?.fontes[0].versaoDisponivel);
    expect(durante.situacao?.aplicacao).toEqual(antes.situacao?.aplicacao);
    expect(depois.situacao?.fontes[0].versaoDisponivel).not.toEqual(antes.situacao?.fontes[0].versaoDisponivel);
    expect(depois.situacao?.aplicacao.aplicadoEm).not.toBe(antes.situacao?.aplicacao.aplicadoEm);
  });
  it('obterDia mantém os valores e o selo da mesma versão durante revisão concorrente', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse); await aplicar(m);
    const antes = await obterDia(m.cliente, todas, m.lojaId, DIA);
    const outro = { ...m, cliente: doParceiro(m.cliente.parceiroId, concorrente) };
    let atualizou = false;
    const interrompido: ClienteDoParceiro = { ...m.cliente, transacao: (fn, opcoes) => m.cliente.transacao(tx => fn({ ...tx,
      faturamentoLancamento: { ...tx.faturamentoLancamento, findMany: (async args => {
        const resposta = await tx.faturamentoLancamento.findMany(args);
        if (!atualizou) { atualizou = true; await publicarFinanceiro(outro, lider.posse, [bucketFinanceiro(35.99)], { ciclo: '2026-10-21' }); await aplicar(outro); }
        return resposta;
      }) as typeof tx.faturamentoLancamento.findMany },
    }), opcoes) };
    const durante = await obterDia(interrompido, todas, m.lojaId, DIA), depois = await obterDia(m.cliente, todas, m.lojaId, DIA);
    expect(atualizou).toBe(true);
    expect(durante?.canais.find(c => c.canal === 'IFOOD')?.valendo?.valorCentavos).toBe(1999);
    expect(durante?.origemAnalytics).toEqual(antes?.origemAnalytics);
    expect(depois?.canais.find(c => c.canal === 'IFOOD')?.valendo?.valorCentavos).toBe(3599);
    expect(depois?.origemAnalytics?.aplicadoEm).not.toBe(antes?.origemAnalytics?.aplicadoEm);
  });
});
