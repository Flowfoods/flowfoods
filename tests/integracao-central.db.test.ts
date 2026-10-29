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
import { lerRegistroDaLeitura, MENSAGEM_TROCA_COM_LOJA_LIGADA } from '@/lib/integracoes/core/central';
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

describe.skipIf(!URL_TESTE)('INT-1.8 · Central de Integrações do nível 1 (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = uuid().slice(0, 8);
  const ids: string[] = [];
  const apps: string[] = [];
  let A: { id: string; slug: string };
  let H: { id: string; slug: string };
  let S: { id: string; slug: string };
  let a: ClienteDoParceiro;
  let h: ClienteDoParceiro;
  let lojaA = '';
  let lojaH = '';
  let appTeste = '';
  let appBi = '';
  const clientTeste = `teste-${sufixo}`;
  const clientBi = `bi-${sufixo}`;

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE! } } });
    perfil = await perfilDoBanco(db);
    atual.userId = (await db.user.create({ data: { email: `central-${sufixo}@teste.local` } })).id;
    A = await db.parceiroFlow.create({ data: { nome: `Central A ${sufixo}`, slug: `central-a-${sufixo}`, status: 'ATIVO' } });
    H = await db.parceiroFlow.create({ data: { nome: `Central Testes ${sufixo}`, slug: `central-h-${sufixo}`, status: 'ATIVO' } });
    S = await db.parceiroFlow.create({ data: { nome: `Central Suspenso ${sufixo}`, slug: `central-s-${sufixo}`, status: 'SUSPENSO' } });
    ids.push(A.id, H.id, S.id);
    a = doParceiro(A.id, db);
    h = doParceiro(H.id, db);
    const loja = async (c: ClienteDoParceiro, nome: string) => {
      const r = await cadastrarLoja(c, { nome }, 'teste');
      if (!r.ok) throw new Error(JSON.stringify(r));
      return r.id;
    };
    lojaA = await loja(a, 'Vila da Penha');
    lojaH = await loja(h, 'Loja de teste');
    const t = await registrarApp({ provedor: 'IFOOD', ambiente: 'TEST', nome: 'Teste (C)', categoria: 'TEST', clientId: clientTeste, nomeDoSegredo: 'IFOOD_TEST_CLIENT_SECRET', modulos: ['ANALYTICS'] }, 'teste');
    const bi = await registrarApp({ provedor: 'IFOOD', ambiente: 'PRODUCAO', nome: 'FlowFoods ERP · BI', categoria: 'BI', clientId: clientBi, nomeDoSegredo: 'IFOOD_BI_CLIENT_SECRET', modulos: ['ANALYTICS'] }, 'teste');
    if (!t.ok || !bi.ok) throw new Error('apps de teste não entraram');
    appTeste = t.id;
    appBi = bi.id;
    apps.push(t.id, bi.id);
  });

  afterAll(async () => {
    if (!db) return;
    await limparParceiros(db, perfil, ids);
    const nossos = await db.integracaoApp.findMany({ where: { clientId: { contains: sufixo } }, select: { id: true } });
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`ALTER TABLE "IntegracaoApp" DISABLE TRIGGER "IntegracaoApp_nao_apaga"`);
      await tx.$executeRawUnsafe(`DELETE FROM "IntegracaoApp" WHERE id = ANY($1::text[])`, [...apps, ...nossos.map((x) => x.id)]);
      await tx.$executeRawUnsafe(`ALTER TABLE "IntegracaoApp" ENABLE TRIGGER "IntegracaoApp_nao_apaga"`);
    });
    await db.auditLog.deleteMany({ where: { userId: atual.userId } });
    await db.auditLog.deleteMany({ where: { evento: 'integracao.leitura-test', dados: { path: ['clientId'], equals: clientTeste } } });
    await db.user.delete({ where: { id: atual.userId } });
    await db.$disconnect();
    await prisma.$disconnect();
  });

  it('a Central mostra apps (Client ID e o NOME da variável do cofre), leituras de teste e parceiros; nunca o segredo nem "testar conexão"', async () => {
    const segredo = `segredo-${uuid()}`;
    process.env.IFOOD_TEST_CLIENT_SECRET = segredo;
    await db.auditLog.create({
      data: { evento: 'integracao.leitura-test', dados: { appId: appTeste, clientId: clientTeste, dia: '2026-10-28', loja: '0b1f6d3e-8a51-4c2e-9d7a-3f2b6c1e5a90', ok: true, passos: [{ nome: 'lojas', status: 200, requestId: `req-${sufixo}`, tentativas: 1 }] } },
    });
    try {
      const pagina = await html(CentralPage());
      expect(pagina).toContain(clientTeste);
      expect(pagina).toContain(clientBi);
      expect(pagina).toContain('IFOOD_BI_CLIENT_SECRET');
      expect(pagina).toContain(`req-${sufixo}`);
      expect(pagina).toContain(`/rodolfo/integracoes/${A.slug}`);
      expect(pagina).toContain('Homologação pendente');
      expect(pagina).not.toContain(segredo);
      expect(pagina.toLowerCase()).not.toContain('testar conexão');
    } finally {
      delete process.env.IFOOD_TEST_CLIENT_SECRET;
    }
  });

  it('parceiro de testes: marcar pede a confirmação; ligar usa o ambiente da marca; com loja ligada a marca não muda', async () => {
    const sem = await acoes.acaoMarcarHomologacao(H.slug, null, form({ valor: 'sim' }));
    expect(sem?.ok).toBe(false);
    expect(sem?.erros?.soTestes).toMatch(/só para testes/);
    expect((await db.parceiroFlow.findUniqueOrThrow({ where: { id: H.id } })).homologacaoDeIntegracao).toBe(false);

    expect((await acoes.acaoMarcarHomologacao(H.slug, null, form({ valor: 'sim', soTestes: 'sim' })))?.ok).toBe(true);
    expect((await acoes.acaoMarcarHomologacao(H.slug, null, form({ valor: 'sim', soTestes: 'sim' })))?.mensagem).toBe('Já estava assim.');

    // O ambiente não vem do formulário: um "ambiente" forjado é ignorado.
    const ligouH = await acoes.acaoLigarConexao(H.slug, null, form({ lojaId: lojaH, idExterno: uuid(), nomeExterno: 'Loja de teste do iFood', ambiente: 'PRODUCAO' }));
    expect(ligouH?.ok, JSON.stringify(ligouH)).toBe(true);
    const ligouA = await acoes.acaoLigarConexao(A.slug, null, form({ lojaId: lojaA, idExterno: uuid(), nomeExterno: 'Valentin’s Burger', ambiente: 'TEST' }));
    expect(ligouA?.ok, JSON.stringify(ligouA)).toBe(true);
    expect((await h.integracaoConexao.findMany({ select: { ambiente: true } })).map((c) => c.ambiente)).toEqual(['TEST']);
    expect((await a.integracaoConexao.findMany({ select: { ambiente: true } })).map((c) => c.ambiente)).toEqual(['PRODUCAO']);

    const troca = await acoes.acaoMarcarHomologacao(H.slug, null, form({ valor: 'nao' }));
    expect(troca?.erros?.geral).toBe(MENSAGEM_TROCA_COM_LOJA_LIGADA);
    expect((await acoes.acaoMarcarHomologacao(A.slug, null, form({ valor: 'sim', soTestes: 'sim' })))?.erros?.geral).toBe(MENSAGEM_TROCA_COM_LOJA_LIGADA);
    expect((await db.parceiroFlow.findUniqueOrThrow({ where: { id: H.id } })).homologacaoDeIntegracao).toBe(true);
    expect((await db.parceiroFlow.findUniqueOrThrow({ where: { id: A.id } })).homologacaoDeIntegracao).toBe(false);
  });

  it('módulo no teste: preparar, autorizar e ativar pela tela; "erro de permissão" não é ação de tela', async () => {
    const c = (await h.integracaoConexao.findFirstOrThrow({ where: { estado: 'ATIVA' } })).id;
    expect((await acoes.acaoPrepararModulo(H.slug, c, null, form({ appModulo: `${appTeste}|ANALYTICS` })))?.ok).toBe(true);
    const m = (await h.integracaoConexaoModulo.findFirstOrThrow({ where: { conexaoId: c } })).id;

    let pagina = await html(ParceiroPage({ params: { slug: H.slug } }));
    expect(pagina).toContain('Marcar como autorizado');
    expect(pagina).not.toContain('Registrar pedido de acesso');

    const forjada = await acoes.acaoMudarModulo(H.slug, m, null, form({ acao: 'erro-permissao' }));
    expect(forjada?.erros?.geral).toBe('Ação desconhecida.');
    expect((await acoes.acaoMudarModulo(H.slug, m, null, form({ acao: 'autorizar' })))?.ok).toBe(true);
    expect((await acoes.acaoMudarModulo(H.slug, m, null, form({ acao: 'ativar' })))?.ok).toBe(true);
    expect((await h.integracaoConexaoModulo.findUniqueOrThrow({ where: { id: m } })).estado).toBe('ATIVO');

    pagina = await html(ParceiroPage({ params: { slug: H.slug } }));
    expect(pagina).toContain('Pausar');
    expect(pagina).toContain('Ambiente de teste');
    const hist = await h.historicoAlteracao.findMany({ where: { entidade: 'IntegracaoConexaoModulo', entidadeId: m }, orderBy: { ocorridoEm: 'asc' } });
    expect(hist.map((x) => x.acao)).toEqual(['PREPAROU', 'ALTEROU', 'ATIVOU']);
    expect(await db.auditLog.count({ where: { userId: atual.userId, evento: 'integracao.modulo-mudou' } })).toBe(2);
  });

  it('módulo em produção sem homologação: a tela não oferece ativar e o serviço recusa', async () => {
    const c = (await a.integracaoConexao.findFirstOrThrow({ where: { estado: 'ATIVA' } })).id;
    expect((await acoes.acaoPrepararModulo(A.slug, c, null, form({ appModulo: `${appBi}|ANALYTICS` })))?.ok).toBe(true);
    const m = (await a.integracaoConexaoModulo.findFirstOrThrow({ where: { conexaoId: c } })).id;
    expect((await acoes.acaoMudarModulo(A.slug, m, null, form({ acao: 'autorizar' })))?.erros?.geral).toMatch(/Portal do Parceiro/);
    expect((await acoes.acaoMudarModulo(A.slug, m, null, form({ acao: 'solicitar' })))?.ok).toBe(true);
    expect((await acoes.acaoMudarModulo(A.slug, m, null, form({ acao: 'autorizar' })))?.ok).toBe(true);
    const pagina = await html(ParceiroPage({ params: { slug: A.slug } }));
    expect(pagina).toContain('só ativa depois que o app for homologado');
    expect(pagina).not.toMatch(/>Ativar</);
    expect((await acoes.acaoMudarModulo(A.slug, m, null, form({ acao: 'ativar' })))?.erros?.geral).toMatch(/homologado pelo iFood/);
    expect((await a.integracaoConexaoModulo.findUniqueOrThrow({ where: { id: m } })).estado).toBe('AUTORIZADO');
  });

  it('liberação do módulo com histórico; repetir não grava; desligar a loja pausa o módulo ativo', async () => {
    expect((await acoes.acaoMudarLiberacao(A.slug, null, form({ liberado: 'sim' })))?.ok).toBe(true);
    expect((await acoes.acaoMudarLiberacao(A.slug, null, form({ liberado: 'sim' })))?.mensagem).toBe('Já estava assim.');
    expect((await acoes.acaoMudarLiberacao(A.slug, null, form({ liberado: 'nao' })))?.ok).toBe(true);
    const hist = await a.historicoAlteracao.findMany({ where: { entidade: 'LiberacaoDeModulo' }, orderBy: { ocorridoEm: 'asc' } });
    expect(hist.map((x) => x.acao)).toEqual(['LIBEROU', 'BLOQUEOU']);

    const c = (await h.integracaoConexao.findFirstOrThrow({ where: { estado: 'ATIVA' } })).id;
    expect((await acoes.acaoDesligarConexao(H.slug, c, null))?.ok).toBe(true);
    expect((await h.integracaoConexaoModulo.findFirstOrThrow({ where: { conexaoId: c } })).estado).toBe('PAUSADO');
    // Sem loja ligada, a marca de testes pode sair.
    expect((await acoes.acaoMarcarHomologacao(H.slug, null, form({ valor: 'nao' })))?.ok).toBe(true);
  });

  it('parceiro suspenso: a tela só lê (sem formulário de escrita) e as ações são recusadas sem gravar nada', async () => {
    const pagina = await html(ParceiroPage({ params: { slug: S.slug } }));
    expect(pagina).toContain('Só leitura');
    expect(pagina).not.toContain('Ligar loja');
    expect(pagina).not.toContain('Liberar módulo');
    for (const r of [
      await acoes.acaoMudarLiberacao(S.slug, null, form({ liberado: 'sim' })),
      await acoes.acaoLigarConexao(S.slug, null, form({ lojaId: 'x', idExterno: uuid(), nomeExterno: 'X' })),
    ]) {
      expect(r?.ok).toBe(false);
      expect(r?.erros?.geral).toMatch(/suspenso/);
    }
    const s = doParceiro(S.id, db);
    expect(await s.liberacaoDeModulo.count()).toBe(0);
    expect(await s.integracaoConexao.count()).toBe(0);
  });

  it('cadastro de app pela action: segredo de produção num app de teste é recusado; o certo entra e fica auditado', async () => {
    const errado = await acoes.acaoRegistrarApp(null, form({ ambiente: 'TEST', categoria: 'TEST', nome: 'Teste 2', clientId: `t2-${sufixo}`, nomeDoSegredo: 'IFOOD_BI_CLIENT_SECRET', modulos: ['ANALYTICS'] }));
    expect(errado?.erros?.nomeDoSegredo).toMatch(/IFOOD_TEST_/);
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
