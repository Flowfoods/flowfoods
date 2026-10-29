/**
 * INT-1.8, primeira parte (decisão 490) — a Central de Integrações do nível 1, pela porta de verdade (páginas e actions), com
 * banco:
 *  - a tela mostra apps (Client ID, nome da variável do cofre, nunca o segredo), leituras de teste e parceiros; nada de "testar
 *    conexão";
 *  - parceiro de testes: marcar pede a confirmação; com loja ligada a marca não muda; o ambiente da ligação vem da marca;
 *  - módulo: preparar, autorizar e ativar no teste; "erro de permissão" não é ação de tela; em produção, sem homologação, a tela
 *    não oferece ativar e o serviço recusa;
 *  - liberação do módulo com histórico; parceiro suspenso só lê (tela sem formulário, ações recusadas, nada gravado);
 *  - cadastro de app pela action, com a trava segredo × ambiente (decisão 489).
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_teste npx vitest run tests/integracao-central.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const URL_TESTE = process.env.ERP_DB_TESTE;
const atual = vi.hoisted(() => ({ userId: '' }));

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('react-dom', async (orig) => ({ ...(await orig<typeof import('react-dom')>()), useFormState: (_acao: unknown, inicial: unknown) => [inicial, undefined], useFormStatus: () => ({ pending: false }) }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`REDIRECT ${url}`), { url });
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  usePathname: () => '/rodolfo/integracoes',
  useRouter: () => ({ replace: () => {} }),
}));
// Os dois clientes (portal, com a trava; e o base do ERP, para o portão do tenant) apontam para o banco de teste.
vi.mock('@/lib/db', async () => {
  const { PrismaClient: P } = await import('@prisma/client');
  const real = await vi.importActual<typeof import('@/lib/db')>('@/lib/db');
  return { prisma: real.travarTenant(new P({ datasources: { db: { url: process.env.ERP_DB_TESTE ?? 'postgresql://sem-banco/x' } } })) };
});
vi.mock('@/lib/erp/base', async () => {
  const { PrismaClient: P } = await import('@prisma/client');
  const base = new P({ datasources: { db: { url: process.env.ERP_DB_TESTE ?? 'postgresql://sem-banco/x' } } });
  return { baseDoErp: () => base };
});
vi.mock('@/lib/erp/contexto', async () => {
  const { doParceiro, parceiroPorSlug } = await import('@/lib/erp/tenant');
  const { bloqueioDeEscrita } = await import('@/lib/erp/contexto-base');
  const { ALCANCE_FLOWFOODS } = await import('@/lib/erp/permissoes');
  const sessao = () => ({ userId: atual.userId, autorNome: 'Rodolfo (FlowFoods)' });
  return {
    exigirNivel1: async () => sessao(),
    exigirParceiro: async (slug: string) => {
      const parceiro = await parceiroPorSlug(slug);
      if (!parceiro) throw new Error('NOT_FOUND');
      const bloqueio = bloqueioDeEscrita(parceiro.status);
      return { sessao: sessao(), parceiro, podeEscrever: bloqueio === null, bloqueio, cliente: doParceiro(parceiro.id, undefined, { somenteLeitura: bloqueio !== null }), alcance: ALCANCE_FLOWFOODS };
    },
    leituraDoParceiro: (id: string) => doParceiro(id, undefined, { somenteLeitura: true }),
  };
});

import { prisma } from '@/lib/db';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { registrarApp } from '@/lib/integracoes/core/apps';
import { mudarModulo } from '@/lib/integracoes/core/conexoes';
import { lerRegistroDaLeitura, marcarParceiroDeHomologacao, MENSAGEM_TROCA_COM_LOJA_LIGADA } from '@/lib/integracoes/core/central';
import type { EstadoForm } from '@/components/erp/ui/campos';
import * as acoes from '@/app/rodolfo/(painel)/integracoes/actions';
import CentralPage from '@/app/rodolfo/(painel)/integracoes/page';
import ParceiroPage from '@/app/rodolfo/(painel)/integracoes/[slug]/page';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const uuid = () => globalThis.crypto.randomUUID();
const form = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
};
const html = async (el: Promise<ReactElement>) => renderToStaticMarkup(await el);
/** Dando certo, as ações de botão que some voltam para a página com ?feito=; recusa responde no formulário. */
async function rodar(p: Promise<unknown>): Promise<{ feito: string | null; estado: EstadoForm }> {
  try {
    return { feito: null, estado: (await p) as EstadoForm };
  } catch (e) {
    const url = (e as { url?: string }).url;
    if (!url) throw e;
    return { feito: new URL(url, 'http://x').searchParams.get('feito'), estado: null };
  }
}
const SO_LEITURA = /suspenso ou em rascunho/;

describe.skipIf(!URL_TESTE)('INT-1.8 · Central de Integrações do nível 1 (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = uuid().slice(0, 8);
  const ids: string[] = [];
  const apps: string[] = [];
  let A: { id: string; slug: string };
  let H: { id: string; slug: string };
  let S: { id: string; slug: string };
  let R: { id: string; slug: string };
  let a: ClienteDoParceiro;
  let h: ClienteDoParceiro;
  let lojaA = '';
  let lojaH = '';
  let appTeste = '';
  let appBi = '';
  const clientTeste = `teste-${sufixo}`;
  const clientBi = `bi-${sufixo}`;
  const tokenSentinela = `v1.sentinela-${uuid()}`;

  const loja = async (c: ClienteDoParceiro, nome: string) => {
    const r = await cadastrarLoja(c, { nome }, 'teste');
    if (!r.ok) throw new Error(JSON.stringify(r));
    return r.id;
  };

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE! } } });
    perfil = await perfilDoBanco(db);
    atual.userId = (await db.user.create({ data: { email: `central-${sufixo}@teste.local` } })).id;
    A = await db.parceiroFlow.create({ data: { nome: `Central A ${sufixo}`, slug: `central-a-${sufixo}`, status: 'ATIVO' } });
    H = await db.parceiroFlow.create({ data: { nome: `Central Testes ${sufixo}`, slug: `central-h-${sufixo}`, status: 'ATIVO' } });
    S = await db.parceiroFlow.create({ data: { nome: `Central Suspenso ${sufixo}`, slug: `central-s-${sufixo}`, status: 'ATIVO' } });
    R = await db.parceiroFlow.create({ data: { nome: `Central Rascunho ${sufixo}`, slug: `central-r-${sufixo}`, status: 'RASCUNHO' } });
    ids.push(A.id, H.id, S.id, R.id);
    a = doParceiro(A.id, db);
    h = doParceiro(H.id, db);
    lojaA = await loja(a, 'Vila da Penha');
    lojaH = await loja(h, 'Loja de teste');
    const t = await registrarApp({ provedor: 'IFOOD', ambiente: 'TEST', nome: 'Teste (C)', categoria: 'TEST', clientId: clientTeste, nomeDoSegredo: 'IFOOD_TEST_CLIENT_SECRET', modulos: ['ANALYTICS'] }, 'teste');
    const bi = await registrarApp({ provedor: 'IFOOD', ambiente: 'PRODUCAO', nome: 'FlowFoods ERP · BI', categoria: 'BI', clientId: clientBi, nomeDoSegredo: 'IFOOD_BI_CLIENT_SECRET', modulos: ['ANALYTICS'] }, 'teste');
    if (!t.ok || !bi.ok) throw new Error('apps de teste não entraram');
    appTeste = t.id;
    appBi = bi.id;
    apps.push(t.id, bi.id);
    // O suspenso já tem loja ligada e módulo preparado (para provar que a tela e as ações não mexem nisso).
    const s = doParceiro(S.id, db);
    const lojaS = await loja(s, 'Tijuca');
    const ligS = await rodar(acoes.acaoLigarConexao(S.slug, null, form({ lojaId: lojaS, idExterno: uuid(), nomeExterno: 'Loja suspensa no iFood' })));
    if (ligS.feito !== 'ligou') throw new Error(JSON.stringify(ligS));
    const cS = (await s.integracaoConexao.findFirstOrThrow()).id;
    await rodar(acoes.acaoPrepararModulo(S.slug, cS, null, form({ appModulo: `${appBi}|ANALYTICS` })));
    await db.parceiroFlow.update({ where: { id: S.id }, data: { status: 'SUSPENSO' } });
  });

  afterAll(async () => {
    if (!db) return;
    await limparParceiros(db, perfil, ids);
    const nossos = await db.integracaoApp.findMany({ where: { clientId: { contains: sufixo } }, select: { id: true } });
    const todos = [...apps, ...nossos.map((x) => x.id)];
    await db.integracaoToken.deleteMany({ where: { appId: { in: todos } } });
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`ALTER TABLE "IntegracaoApp" DISABLE TRIGGER "IntegracaoApp_nao_apaga"`);
      await tx.$executeRawUnsafe(`DELETE FROM "IntegracaoApp" WHERE id = ANY($1::text[])`, todos);
      await tx.$executeRawUnsafe(`ALTER TABLE "IntegracaoApp" ENABLE TRIGGER "IntegracaoApp_nao_apaga"`);
    });
    await db.auditLog.deleteMany({ where: { userId: atual.userId } });
    await db.auditLog.deleteMany({ where: { evento: 'integracao.leitura-test', dados: { path: ['clientId'], equals: clientTeste } } });
    await db.user.delete({ where: { id: atual.userId } });
    await db.$disconnect();
    await prisma.$disconnect();
  });

  it('a Central mostra apps (Client ID, NOME da variável do cofre e validade do acesso), leituras de teste e parceiros; nunca o token nem o segredo', async () => {
    const segredo = `segredo-${uuid()}`;
    process.env.IFOOD_TEST_CLIENT_SECRET = segredo;
    await db.integracaoToken.create({ data: { appId: appTeste, tokenCifrado: tokenSentinela, emitidoEm: new Date(), expiraEm: new Date(Date.now() + 3_600_000) } });
    await db.auditLog.create({
      data: { evento: 'integracao.leitura-test', dados: { appId: appTeste, clientId: clientTeste, dia: '2026-10-28', loja: '0b1f6d3e-8a51-4c2e-9d7a-3f2b6c1e5a90', ok: true, passos: [{ nome: 'lojas', status: 200, requestId: `req-${sufixo}`, tentativas: 1 }] } },
    });
    try {
      const pagina = await html(CentralPage());
      expect(pagina).toContain(clientTeste);
      expect(pagina).toContain(clientBi);
      expect(pagina).toContain('IFOOD_BI_CLIENT_SECRET');
      expect(pagina).toContain(`código do pedido req-${sufixo}`);
      expect(pagina).toContain('Lista de lojas');
      expect(pagina).toContain('Dia 28/10/2026');
      expect(pagina).toContain('Deu certo');
      expect(pagina).toContain('vale até');
      expect(pagina).toContain(`/rodolfo/integracoes/${A.slug}`);
      expect(pagina).toContain('Homologação pendente');
      expect(pagina).not.toContain(tokenSentinela);
      expect(pagina).not.toContain('sentinela');
      expect(pagina).not.toContain(segredo);
      expect(pagina.toLowerCase()).not.toContain('testar conexão');
    } finally {
      delete process.env.IFOOD_TEST_CLIENT_SECRET;
    }
  });

  it('parceiro de testes: marcar pede a confirmação; ligar usa o ambiente da marca; com loja ligada a marca não muda; a marca entra no histórico', async () => {
    const sem = await acoes.acaoMarcarHomologacao(H.slug, null, form({ valor: 'sim' }));
    expect(sem?.ok).toBe(false);
    expect(sem?.erros?.soTestes).toMatch(/só para testes/);
    expect((await acoes.acaoMarcarHomologacao(H.slug, null, form({})))?.erros?.geral).toMatch(/marcar ou desmarcar/);
    expect((await db.parceiroFlow.findUniqueOrThrow({ where: { id: H.id } })).homologacaoDeIntegracao).toBe(false);

    expect((await rodar(acoes.acaoMarcarHomologacao(H.slug, null, form({ valor: 'sim', soTestes: 'sim' })))).feito).toBe('marcou');
    expect((await rodar(acoes.acaoMarcarHomologacao(H.slug, null, form({ valor: 'sim', soTestes: 'sim' })))).feito).toBe('sem-mudanca');
    const marcas = await h.historicoAlteracao.findMany({ where: { entidade: 'MarcaDeTestes' } });
    expect(marcas.map((x) => [x.acao, x.antes, x.depois])).toEqual([['ALTEROU', { parceiroDeTestes: 'Não' }, { parceiroDeTestes: 'Sim' }]]);

    // O ambiente não vem do formulário: um "ambiente" forjado é ignorado.
    const ligouH = await rodar(acoes.acaoLigarConexao(H.slug, null, form({ lojaId: lojaH, idExterno: uuid(), nomeExterno: 'Loja de teste do iFood', ambiente: 'PRODUCAO' })));
    expect(ligouH.feito, JSON.stringify(ligouH)).toBe('ligou');
    const ligouA = await rodar(acoes.acaoLigarConexao(A.slug, null, form({ lojaId: lojaA, idExterno: uuid(), nomeExterno: 'Valentin’s Burger', ambiente: 'TEST' })));
    expect(ligouA.feito, JSON.stringify(ligouA)).toBe('ligou');
    expect((await h.integracaoConexao.findMany({ select: { ambiente: true } })).map((c) => c.ambiente)).toEqual(['TEST']);
    expect((await a.integracaoConexao.findMany({ select: { ambiente: true } })).map((c) => c.ambiente)).toEqual(['PRODUCAO']);

    const troca = await acoes.acaoMarcarHomologacao(H.slug, null, form({ valor: 'nao' }));
    expect(troca?.erros?.geral).toBe(MENSAGEM_TROCA_COM_LOJA_LIGADA);
    expect((await acoes.acaoMarcarHomologacao(A.slug, null, form({ valor: 'sim', soTestes: 'sim' })))?.erros?.geral).toBe(MENSAGEM_TROCA_COM_LOJA_LIGADA);
    expect((await db.parceiroFlow.findUniqueOrThrow({ where: { id: H.id } })).homologacaoDeIntegracao).toBe(true);
    expect((await db.parceiroFlow.findUniqueOrThrow({ where: { id: A.id } })).homologacaoDeIntegracao).toBe(false);
    // A recusa desfaz tudo: nem a marca nem o histórico ficam.
    expect(await h.historicoAlteracao.count({ where: { entidade: 'MarcaDeTestes' } })).toBe(1);
    expect(await a.historicoAlteracao.count({ where: { entidade: 'MarcaDeTestes' } })).toBe(0);
  });

  it('marca × loja entrando ao mesmo tempo: a marca espera a ligação e, vendo a loja, desfaz; dois cliques iguais gravam uma vez', async () => {
    const C = await db.parceiroFlow.create({ data: { nome: `Central Corrida ${sufixo}`, slug: `central-c-${sufixo}`, status: 'ATIVO', homologacaoDeIntegracao: true } });
    ids.push(C.id);
    const c = doParceiro(C.id, db);
    const lojaC = await loja(c, 'Loja da corrida');
    // A ligação de teste entra numa transação que demora; a desmarcação chega no meio dela (logo depois do create).
    let entrou: () => void = () => {};
    const criada = new Promise<void>((r) => (entrou = r));
    const ligando = c.transacao(async (tx) => {
      await tx.integracaoConexao.create({ data: { parceiroId: tx.parceiroId, lojaId: lojaC, provedor: 'IFOOD', ambiente: 'TEST', idExterno: uuid(), nomeExterno: 'Loja de teste', criadoPorNome: 'teste' } });
      entrou();
      await new Promise((r) => setTimeout(r, 700));
    });
    await criada;
    const desmarcar = await marcarParceiroDeHomologacao(C.id, false, 'teste');
    await ligando;
    expect(desmarcar).toEqual({ ok: false, erro: MENSAGEM_TROCA_COM_LOJA_LIGADA });
    expect((await db.parceiroFlow.findUniqueOrThrow({ where: { id: C.id } })).homologacaoDeIntegracao).toBe(true);

    const D = await db.parceiroFlow.create({ data: { nome: `Central Duplo ${sufixo}`, slug: `central-d-${sufixo}`, status: 'ATIVO' } });
    ids.push(D.id);
    const dois = await Promise.all([marcarParceiroDeHomologacao(D.id, true, 'teste'), marcarParceiroDeHomologacao(D.id, true, 'teste')]);
    expect(dois.map((r) => r.ok && r.mudou).sort()).toEqual([false, true]);
    expect(await doParceiro(D.id, db).historicoAlteracao.count({ where: { entidade: 'MarcaDeTestes' } })).toBe(1);

    // Dois cliques OPOSTOS: um depois do outro (linha travada); a resposta de cada um bate com o que ficou.
    const E = await db.parceiroFlow.create({ data: { nome: `Central Opostos ${sufixo}`, slug: `central-e-${sufixo}`, status: 'ATIVO' } });
    ids.push(E.id);
    const [marcou, desmarcou] = await Promise.all([marcarParceiroDeHomologacao(E.id, true, 'teste'), marcarParceiroDeHomologacao(E.id, false, 'teste')]);
    const ficou = (await db.parceiroFlow.findUniqueOrThrow({ where: { id: E.id } })).homologacaoDeIntegracao;
    const historicos = await doParceiro(E.id, db).historicoAlteracao.count({ where: { entidade: 'MarcaDeTestes' } });
    if (ficou) expect([marcou, desmarcou, historicos]).toEqual([{ ok: true, mudou: true }, { ok: true, mudou: false }, 1]);
    else expect([marcou, desmarcou, historicos]).toEqual([{ ok: true, mudou: true }, { ok: true, mudou: true }, 2]);
  });

  it('módulo no teste: preparar, autorizar e ativar pela tela (a página volta com o aviso); "erro de permissão" não é ação de tela', async () => {
    const c = (await h.integracaoConexao.findFirstOrThrow({ where: { estado: 'ATIVA' } })).id;
    expect((await rodar(acoes.acaoPrepararModulo(H.slug, c, null, form({ appModulo: `${appTeste}|ANALYTICS` })))).feito).toBe('preparou');
    expect((await rodar(acoes.acaoPrepararModulo(H.slug, c, null, form({ appModulo: `${appTeste}|ANALYTICS` })))).feito).toBe('ja-preparado');
    const m = (await h.integracaoConexaoModulo.findFirstOrThrow({ where: { conexaoId: c } })).id;

    let pagina = await html(ParceiroPage({ params: { slug: H.slug }, searchParams: { feito: 'preparou' } }));
    expect(pagina).toContain('Módulo preparado.');
    expect(pagina).toContain('Marcar como autorizado');
    expect(pagina).not.toContain('Registrar pedido de acesso');
    expect(pagina).toContain('Todos os módulos dos apps cadastrados já estão preparados nesta loja.');
    expect(await html(ParceiroPage({ params: { slug: H.slug }, searchParams: { feito: '<script>' } }))).not.toContain('&lt;script&gt;');

    const forjada = await rodar(acoes.acaoMudarModulo(H.slug, m, null, form({ acao: 'erro-permissao' })));
    expect(forjada.estado?.erros?.geral).toBe('Ação desconhecida.');
    expect((await rodar(acoes.acaoMudarModulo(H.slug, m, null, form({ acao: 'autorizar' })))).feito).toBe('autorizar');
    expect((await rodar(acoes.acaoMudarModulo(H.slug, m, null, form({ acao: 'ativar' })))).feito).toBe('ativar');
    expect((await h.integracaoConexaoModulo.findUniqueOrThrow({ where: { id: m } })).estado).toBe('ATIVO');
    // A mesma ação de novo (dois cliques): recusada com a frase, sem estourar.
    expect((await rodar(acoes.acaoMudarModulo(H.slug, m, null, form({ acao: 'ativar' })))).estado?.erros?.geral).toMatch(/não dá para ativar agora/);

    pagina = await html(ParceiroPage({ params: { slug: H.slug } }));
    expect(pagina).toContain('Pausar');
    expect(pagina).toContain('Ambiente de teste');
    const hist = await h.historicoAlteracao.findMany({ where: { entidade: 'IntegracaoConexaoModulo', entidadeId: m }, orderBy: { ocorridoEm: 'asc' } });
    expect(hist.map((x) => x.acao)).toEqual(['PREPAROU', 'ALTEROU', 'ATIVOU']);
    expect(await db.auditLog.count({ where: { userId: atual.userId, evento: 'integracao.modulo-mudou' } })).toBe(2);
  });

  it('módulo em produção sem homologação: a tela não oferece ativar e o serviço recusa; depois de "sem permissão", só novo pedido', async () => {
    const c = (await a.integracaoConexao.findFirstOrThrow({ where: { estado: 'ATIVA' } })).id;
    expect((await rodar(acoes.acaoPrepararModulo(A.slug, c, null, form({ appModulo: `${appBi}|ANALYTICS` })))).feito).toBe('preparou');
    const m = (await a.integracaoConexaoModulo.findFirstOrThrow({ where: { conexaoId: c } })).id;
    expect((await rodar(acoes.acaoMudarModulo(A.slug, m, null, form({ acao: 'autorizar' })))).estado?.erros?.geral).toMatch(/Portal do Parceiro/);
    expect((await rodar(acoes.acaoMudarModulo(A.slug, m, null, form({ acao: 'solicitar' })))).feito).toBe('solicitar');
    expect((await rodar(acoes.acaoMudarModulo(A.slug, m, null, form({ acao: 'autorizar' })))).feito).toBe('autorizar');
    let pagina = await html(ParceiroPage({ params: { slug: A.slug } }));
    expect(pagina).toContain('só ativa depois que o iFood homologar o app');
    expect(pagina).not.toMatch(/>Ativar</);
    expect((await rodar(acoes.acaoMudarModulo(A.slug, m, null, form({ acao: 'ativar' })))).estado?.erros?.geral).toMatch(/homologado pelo iFood/);
    expect((await a.integracaoConexaoModulo.findUniqueOrThrow({ where: { id: m } })).estado).toBe('AUTORIZADO');
    // O serviço registra o 403 (não é ação de tela); a tela oferece só o novo pedido de acesso.
    expect((await mudarModulo(a, m, 'erro-permissao', 'serviço', { erro: '403 do iFood: a loja não autorizou o app' })).ok).toBe(true);
    pagina = await html(ParceiroPage({ params: { slug: A.slug } }));
    expect(pagina).toContain('403 do iFood: a loja não autorizou o app');
    expect(pagina).toContain('Registrar pedido de acesso');
    expect(pagina).not.toContain('Marcar como autorizado');
  });

  it('liberação do módulo com histórico; repetir não grava; campo ausente é recusado; desligar a loja pausa o módulo ativo', async () => {
    expect((await acoes.acaoMudarLiberacao(A.slug, null, form({})))?.erros?.geral).toMatch(/liberar ou bloquear/);
    expect((await rodar(acoes.acaoMudarLiberacao(A.slug, null, form({ liberado: 'sim' })))).feito).toBe('liberou');
    expect((await rodar(acoes.acaoMudarLiberacao(A.slug, null, form({ liberado: 'sim' })))).feito).toBe('sem-mudanca');
    expect((await rodar(acoes.acaoMudarLiberacao(A.slug, null, form({ liberado: 'nao' })))).feito).toBe('bloqueou');
    const hist = await a.historicoAlteracao.findMany({ where: { entidade: 'LiberacaoDeModulo' }, orderBy: { ocorridoEm: 'asc' } });
    expect(hist.map((x) => x.acao)).toEqual(['LIBEROU', 'BLOQUEOU']);

    const c = (await h.integracaoConexao.findFirstOrThrow({ where: { estado: 'ATIVA' } })).id;
    expect((await rodar(acoes.acaoDesligarConexao(H.slug, c, null))).feito).toBe('desligou');
    expect((await rodar(acoes.acaoDesligarConexao(H.slug, c, null))).feito).toBe('ja-desligada');
    expect((await h.integracaoConexaoModulo.findFirstOrThrow({ where: { conexaoId: c } })).estado).toBe('PAUSADO');
    // Sem loja ligada, a marca de testes pode sair.
    expect((await rodar(acoes.acaoMarcarHomologacao(H.slug, null, form({ valor: 'nao' })))).feito).toBe('desmarcou');
  });

  it('parceiro suspenso (ou em rascunho): a tela só lê, sem formulário de escrita, e toda ação é recusada sem gravar nada', async () => {
    const s = doParceiro(S.id, db);
    const conexao = await s.integracaoConexao.findFirstOrThrow();
    const modulo = await s.integracaoConexaoModulo.findFirstOrThrow();
    const pagina = await html(ParceiroPage({ params: { slug: S.slug } }));
    expect(pagina).toContain('Só leitura');
    expect(pagina).toContain('reative o parceiro em Parceiros Flow');
    expect(pagina).toContain('Loja suspensa no iFood');
    for (const proibido of ['Ligar loja', 'Liberar módulo', 'Desligar loja', 'Preparar módulo', 'Registrar pedido de acesso', 'Marcar como parceiro de testes'])
      expect(pagina, proibido).not.toContain(proibido);
    const respostas = [
      await rodar(acoes.acaoMudarLiberacao(S.slug, null, form({ liberado: 'sim' }))),
      await rodar(acoes.acaoLigarConexao(S.slug, null, form({ lojaId: conexao.lojaId, idExterno: uuid(), nomeExterno: 'X' }))),
      await rodar(acoes.acaoMarcarHomologacao(S.slug, null, form({ valor: 'sim', soTestes: 'sim' }))),
      await rodar(acoes.acaoMarcarHomologacao(R.slug, null, form({ valor: 'sim', soTestes: 'sim' }))),
      await rodar(acoes.acaoDesligarConexao(S.slug, conexao.id, null)),
      await rodar(acoes.acaoPrepararModulo(S.slug, conexao.id, null, form({ appModulo: `${appBi}|ANALYTICS` }))),
      await rodar(acoes.acaoMudarModulo(S.slug, modulo.id, null, form({ acao: 'solicitar' }))),
    ];
    for (const r of respostas) {
      expect(r.feito).toBeNull();
      expect(r.estado?.ok).toBe(false);
      expect(r.estado?.erros?.geral).toMatch(SO_LEITURA);
    }
    expect(await s.liberacaoDeModulo.count()).toBe(0);
    expect(await s.integracaoConexao.count({ where: { estado: 'ATIVA' } })).toBe(1);
    expect((await s.integracaoConexaoModulo.findUniqueOrThrow({ where: { id: modulo.id } })).estado).toBe('NAO_SOLICITADO');
    expect((await db.parceiroFlow.findMany({ where: { id: { in: [S.id, R.id] } }, select: { homologacaoDeIntegracao: true } })).map((x) => x.homologacaoDeIntegracao)).toEqual([false, false]);
  });

  it('cadastro de app pela action: segredo de produção num app de teste é recusado; módulo fora da categoria diz quais servem; o certo entra e fica auditado', async () => {
    const errado = await acoes.acaoRegistrarApp(null, form({ ambiente: 'TEST', categoria: 'TEST', nome: 'Teste 2', clientId: `t2-${sufixo}`, nomeDoSegredo: 'IFOOD_BI_CLIENT_SECRET', modulos: ['ANALYTICS'] }));
    expect(errado?.erros?.nomeDoSegredo).toMatch(/IFOOD_TEST_/);
    const fora = await acoes.acaoRegistrarApp(null, form({ ambiente: 'PRODUCAO', categoria: 'BI', nome: 'BI 2', clientId: `bi2-${sufixo}`, nomeDoSegredo: 'IFOOD_BI_CLIENT_SECRET', modulos: ['ANALYTICS', 'REVIEW'] }));
    expect(fora?.erros?.modulos).toMatch(/Nesta categoria: Analytics\./);
    const certo = await acoes.acaoRegistrarApp(null, form({ ambiente: 'PRODUCAO', categoria: 'FINANCAS', nome: 'FlowFoods ERP · Finanças', clientId: `fin-${sufixo}`, nomeDoSegredo: 'IFOOD_FIN_CLIENT_SECRET', modulos: ['FINANCIAL', 'MERCHANT'] }));
    expect(certo?.ok, JSON.stringify(certo)).toBe(true);
    const app = await db.integracaoApp.findFirstOrThrow({ where: { clientId: `fin-${sufixo}` } });
    expect([app.estadoHomologacao, app.modulos.sort()]).toEqual(['PENDENTE', ['FINANCIAL', 'MERCHANT']]);
    expect(await db.auditLog.count({ where: { userId: atual.userId, evento: 'integracao.app-cadastrado' } })).toBe(1);
  });

  it('o registro da leitura de teste é conferido campo a campo (JSON de outra versão não quebra a tela)', () => {
    const quando = new Date();
    expect(lerRegistroDaLeitura(quando, null)).toBeNull();
    expect(lerRegistroDaLeitura(quando, ['x'])).toBeNull();
    expect(lerRegistroDaLeitura(quando, { clientId: 'c' })).toBeNull();
    expect(lerRegistroDaLeitura(quando, { clientId: 'c', dia: '2026-10-28', ok: 'sim', passos: [null, { nome: 'lojas', status: '200' }, { nome: 'kpis', status: 403, requestId: 'r' }] })).toEqual({
      quando,
      clientId: 'c',
      dia: '2026-10-28',
      loja: null,
      ok: false,
      passos: [
        { nome: 'lojas', status: null, requestId: null },
        { nome: 'kpis', status: 403, requestId: 'r' },
      ],
    });
  });
});
