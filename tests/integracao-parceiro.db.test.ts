/**
 * INT-1.8 e P-03 — a Central de Integrações pela página do parceiro, com banco:
 *  - `integracao.ver` dá acesso à Central informativa antes da liberação do módulo; as subrotas de leitura exigem liberação;
 *  - liberado: o Dono vê as lojas do iFood ligadas e o estado de cada módulo em linguagem simples; nada técnico (estado cru,
 *    app, Client ID); ligação desligada não aparece; o parceiro B nunca aparece;
 *  - o Gerente de uma loja só vê a ligação da loja dele;
 *  - a migration do catálogo v4: só o perfil "copiado do Dono" da v3 ganha `integracao.ver`.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_teste npx vitest run tests/integracao-parceiro.db.test.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const URL_TESTE = process.env.ERP_DB_TESTE;
const atual = vi.hoisted(() => ({ ctx: null as null | (() => unknown) }));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`REDIRECT ${url}`), { url });
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  usePathname: () => '/erp/integracoes',
}));
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
  const { pode } = await import('@/lib/erp/permissoes');
  return {
    exigirParceiroDaSessao: async () => atual.ctx!(),
    telasPermitidas: () => [{ href: '/erp', rotulo: 'Áreas da Rede', permissao: null }],
    exigirPermissaoNaPagina: (ctx: { alcance: Parameters<typeof pode>[0] }, p: Parameters<typeof pode>[1]) => {
      if (!pode(ctx.alcance, p)) throw new Error('SEM_ACESSO');
    },
  };
});

import { prisma } from '@/lib/db';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { modulosLiberados, mudarLiberacao, NENHUM_MODULO_LIBERADO } from '@/lib/erp/liberacao';
import { listarPerfis } from '@/lib/erp/credenciais';
import { resolverAlcance, TODAS_AS_PERMISSOES, type Alcance } from '@/lib/erp/permissoes';
import { registrarApp } from '@/lib/integracoes/core/apps';
import { desligarConexao, ligarConexao, mudarModulo, prepararModulo } from '@/lib/integracoes/core/conexoes';
import ErpIntegracoesPage from '@/app/erp/integracoes/page';
import ErpPainelAnalyticsPage from '@/app/erp/integracoes/analytics/page';
import ConferenciaFinancialDoParceiro from '@/app/erp/integracoes/financial/page';
import { createElement } from 'react';
import { TelaIntegracoes } from '@/components/erp/telas/integracoes/tela-integracoes';
import { Selo } from '@/components/erp/ui/superficies';
import { capacidadesIfoodPorLoja, SITUACAO_PARA_O_PARCEIRO } from '@/lib/integracoes/core/do-parceiro';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const uuid = () => globalThis.crypto.randomUUID();
const html = async (el: Promise<ReactElement>) => renderToStaticMarkup(await el);
const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR', lojaIds: string[] | 'rede', extras: string[] = []): Alcance =>
  resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: extras, permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });

describe.skipIf(!URL_TESTE)('INT-1.8 · Integrações do parceiro (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = uuid().slice(0, 8);
  const ids: string[] = [];
  let appBi = '';
  let A: { id: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  let lojaA1 = '';
  let lojaA2 = '';
  let lojaB = '';

  const como = (alcance: Alcance, cliente: ClienteDoParceiro = a, homologacaoDeIntegracao = false) => {
    atual.ctx = () => ({ alcance, cliente, bloqueio: null, podeEscrever: true, parceiro: { id: cliente.parceiroId, homologacaoDeIntegracao } });
  };

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE! } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: `Parceiro Int A ${sufixo}`, slug: `pint-a-${sufixo}`, status: 'ATIVO' } });
    const B = await db.parceiroFlow.create({ data: { nome: `Parceiro Int B ${sufixo}`, slug: `pint-b-${sufixo}`, status: 'ATIVO' } });
    ids.push(A.id, B.id);
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    const loja = async (c: ClienteDoParceiro, nome: string) => {
      const r = await cadastrarLoja(c, { nome }, 'teste');
      if (!r.ok) throw new Error(JSON.stringify(r));
      return r.id;
    };
    lojaA1 = await loja(a, 'Vila da Penha');
    lojaA2 = await loja(a, 'Méier');
    lojaB = await loja(b, 'Tijuca');
    const bi = await registrarApp({ provedor: 'IFOOD', ambiente: 'PRODUCAO', nome: 'FlowFoods ERP · BI', categoria: 'BI', clientId: `bi-par-${sufixo}`, nomeDoSegredo: 'IFOOD_BI_CLIENT_SECRET', modulos: ['ANALYTICS'] }, 'teste');
    if (!bi.ok) throw new Error('app não entrou');
    appBi = bi.id;
    const ligar = async (c: ClienteDoParceiro, lojaId: string, nome: string) => {
      const r = await ligarConexao(c, { lojaId, provedor: 'IFOOD', ambiente: 'PRODUCAO', idExterno: uuid(), nomeExterno: nome }, { nome: 'teste' });
      if (!r.ok) throw new Error(JSON.stringify(r));
      return r.id;
    };
    const c1 = await ligar(a, lojaA1, `Valentin Burger Penha ${sufixo}`);
    await ligar(a, lojaA2, `Valentin Gourmet Meier ${sufixo}`);
    const velha = await ligar(a, lojaA2, `Loja antiga desligada ${sufixo}`).catch(() => null);
    if (velha) await desligarConexao(a, velha, 'teste');
    await ligar(b, lojaB, `Loja do parceiro B ${sufixo}`);
    const m = await prepararModulo(a, c1, appBi, 'ANALYTICS', 'teste');
    if (!m.ok) throw new Error(m.erro);
    await mudarModulo(a, m.id, 'solicitar', 'teste');
  });

  afterAll(async () => {
    if (!db) return;
    await db.perfilAcesso.deleteMany({ where: { parceiroId: { in: ids } } });
    await limparParceiros(db, perfil, ids);
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`ALTER TABLE "IntegracaoApp" DISABLE TRIGGER "IntegracaoApp_nao_apaga"`);
      await tx.$executeRawUnsafe(`DELETE FROM "IntegracaoApp" WHERE id = $1`, appBi);
      await tx.$executeRawUnsafe(`ALTER TABLE "IntegracaoApp" ENABLE TRIGGER "IntegracaoApp_nao_apaga"`);
    });
    await db.$disconnect();
    await prisma.$disconnect();
  });

  it('sem liberação oferece só a Central informativa e mantém a permissão da pessoa, o escopo da loja e os portões de leitura', async () => {
    como(alcanceDe('DONO', 'rede'));
    const informativa = await html(ErpIntegracoesPage({}));
    for (const texto of ['Integrações aguardando liberação', 'Números de venda', 'Financeiro', 'Status da loja', 'Avaliações',
      'primeira leitura de vendas', 'fontes de repasse', 'horários e pausas', 'homologação do app de Avaliações',
      'fale com a FlowFoods no WhatsApp', 'gerencia a ativação no Barney']) expect(informativa).toContain(texto);
    expect(informativa.match(/>Previsto</g)).toHaveLength(4);
    expect(informativa).not.toMatch(/>Disponível<|\/erp\/integracoes\/(analytics|financial)|<form\b/);
    for (const nome of ['Vila da Penha', 'Valentin Burger Penha', 'Valentin Gourmet Meier', 'Loja do parceiro B']) {
      expect(informativa).not.toContain(nome);
    }
    const filtro = (id: string) => ({ searchParams: Promise.resolve({ loja: id }) });
    for (const id of [lojaB, uuid()]) {
      const recusada = await html(ErpIntegracoesPage(filtro(id)));
      expect(recusada).toContain('Esta loja não está disponível no seu acesso.');
      expect(recusada).not.toContain('Capacidades do iFood');
    }
    await expect(ErpPainelAnalyticsPage({})).rejects.toThrow(/REDIRECT \/erp\?sem-modulo=integracao/);
    await expect(ConferenciaFinancialDoParceiro({ searchParams: Promise.resolve({}) })).rejects.toThrow(/REDIRECT \/erp\?sem-modulo=integracao/);
    como(alcanceDe('GERENTE', [lojaA1], ['integracao.ver']));
    expect(await html(ErpIntegracoesPage(filtro(lojaA1)))).toContain('Capacidades do iFood');
    expect(await html(ErpIntegracoesPage(filtro(lojaA2)))).toContain('Esta loja não está disponível no seu acesso.');
    como(alcanceDe('OPERADOR', [lojaA1]));
    await expect(ErpIntegracoesPage({})).rejects.toThrow('SEM_ACESSO');

    await mudarLiberacao(a, 'integracao', true, 'teste');
    await expect(ErpIntegracoesPage({})).rejects.toThrow('SEM_ACESSO');
    // O Gerente base não tem: só com a permissão extra (decisão 491).
    como(alcanceDe('GERENTE', [lojaA1]));
    await expect(ErpIntegracoesPage({})).rejects.toThrow('SEM_ACESSO');
  });

  it('um cadastro Analytics conserva as outras três capacidades previstas na loja e as quatro na outra loja', async () => {
    como(alcanceDe('DONO', 'rede'));
    const painel = (pagina: string) => pagina.split('Capacidades do iFood por loja')[1]?.split('Lojas do iFood ligadas')[0] ?? '';
    const rede = painel(await html(ErpIntegracoesPage({})));
    expect(rede.match(/>Previsto</g)).toHaveLength(7);
    expect(rede).not.toMatch(/>Disponível<|Tijuca/);

    const penha = painel(await html(ErpIntegracoesPage({ searchParams: Promise.resolve({ loja: lojaA1 }) })));
    expect(penha.match(/>Previsto</g)).toHaveLength(3);
    for (const texto of ['Vila da Penha', 'Financeiro', 'Avaliações', 'Status da loja']) expect(penha).toContain(texto);
    expect(penha).not.toMatch(/Números de venda|Méier|Tijuca/);

    const meier = painel(await html(ErpIntegracoesPage({ searchParams: Promise.resolve({ loja: lojaA2 }) })));
    expect(meier.match(/>Previsto</g)).toHaveLength(4);
    expect(meier).toContain('Números de venda');
    expect(meier).toContain('Méier');
    expect(meier).not.toMatch(/Vila da Penha|Tijuca/);
  });

  it('liberado: o Dono vê as lojas ligadas e o estado em linguagem simples; nada técnico, nada desligado, nada do parceiro B', async () => {
    como(alcanceDe('DONO', 'rede'));
    const pagina = await html(ErpIntegracoesPage({ searchParams: Promise.resolve({ loja: lojaA1 }) }));
    expect(pagina).toContain(`/erp/integracoes/analytics?loja=${encodeURIComponent(lojaA1)}`);
    expect(pagina).toContain(`Valentin Burger Penha ${sufixo}`);
    expect(pagina).toContain(`Valentin Gourmet Meier ${sufixo}`);
    expect(pagina).toContain('Números de venda');
    expect(pagina).toContain('Esperando a loja aprovar');
    expect(pagina).toContain('Portal do Parceiro');
    expect(pagina).toContain('2 lojas do iFood ligadas');
    expect(pagina).not.toContain('Loja de teste do iFood');
    for (const proibido of ['SOLICITADO', 'ANALYTICS', 'PRODUCAO', `bi-par-${sufixo}`, 'IFOOD_BI_CLIENT_SECRET', 'FlowFoods ERP · BI', `Loja antiga desligada ${sufixo}`, `Loja do parceiro B ${sufixo}`])
      expect(pagina, proibido).not.toContain(proibido);
  });

  it('o Gerente de uma loja (com a permissão extra) só vê a ligação da loja dele', async () => {
    como(alcanceDe('GERENTE', [lojaA1], ['integracao.ver']));
    const pagina = await html(ErpIntegracoesPage({}));
    expect(pagina).toContain(`Valentin Burger Penha ${sufixo}`);
    expect(pagina).not.toContain(`Valentin Gourmet Meier ${sufixo}`);
    expect(pagina).toContain('1 loja do iFood ligada');
  });

  it('filtro GET mostra referências desligadas somente na loja alcançada e não aceita ampliar o alcance', async () => {
    como(alcanceDe('DONO', 'rede'));
    const historica = await html(ErpIntegracoesPage({ searchParams: Promise.resolve({ loja: lojaA2, dia: '2026-10-20' }) }));
    expect(historica).toContain(`Loja antiga desligada ${sufixo}`);
    expect(historica).toContain('Vínculo desligado');
    expect(historica).toContain('Ainda sem leitura disponível');
    expect(historica).not.toContain(`Loja do parceiro B ${sufixo}`);
    como(alcanceDe('GERENTE', [lojaA1], ['integracao.ver']));
    const recusada = await html(ErpIntegracoesPage({ searchParams: Promise.resolve({ loja: lojaA2, dia: '2026-10-20' }) }));
    expect(recusada).toContain('Esta loja não está disponível no seu acesso.');
    expect(recusada).not.toContain('Capacidades do iFood por loja');
    expect(recusada).not.toContain(`Loja antiga desligada ${sufixo}`);
    expect(recusada).not.toContain(`Valentin Gourmet Meier ${sufixo}`);
  });

  it('acesso somente à integração mantém a situação operacional sem oferecer indicadores financeiros', async () => {
    como({ nivel: 'LOJA', lojas: [lojaA1], permissoes: new Set(['integracao.ver']) });
    const pagina = await html(ErpIntegracoesPage({ searchParams: Promise.resolve({ loja: lojaA1 }) }));
    expect(pagina).toContain('Situação dos números de venda');
    expect(pagina).not.toContain('/erp/integracoes/analytics');
    expect(pagina).not.toContain('Ver painel iFood por período');
  });

  it('vínculo somente histórico conserva a evidência de desligamento e pausa e as demais capacidades previstas', async () => {
    await mudarLiberacao(b, 'integracao', true, 'teste');
    const dono = alcanceDe('DONO', 'rede');
    como(dono, b);
    const inicial = await html(ErpIntegracoesPage({}));
    expect(inicial.match(/>Previsto</g)).toHaveLength(4);
    expect(inicial).toContain('1 loja do iFood ligada');

    const antiga = await b.integracaoConexao.findFirstOrThrow({ where: { lojaId: lojaB } });
    const modulo = await prepararModulo(b, antiga.id, appBi, 'ANALYTICS', 'teste');
    if (!modulo.ok) throw new Error(modulo.erro);
    expect(await mudarModulo(b, modulo.id, 'solicitar', 'teste')).toMatchObject({ ok: true });
    expect(await mudarModulo(b, modulo.id, 'autorizar', 'teste')).toMatchObject({ ok: true });
    const erroEm = new Date('2026-11-24T12:00:00.000Z');
    expect(await mudarModulo(b, modulo.id, 'erro-permissao', 'teste', {
      erro: 'Recusa sintética do provedor', agora: erroEm,
    })).toMatchObject({ ok: true, estado: 'ERRO_PERMISSAO' });
    expect(await desligarConexao(b, antiga.id, 'teste')).toMatchObject({ ok: true });
    const desligada = await b.integracaoConexao.findUniqueOrThrow({ where: { id: antiga.id } });
    const historico = await html(ErpIntegracoesPage({}));
    expect(historico.match(/>Previsto</g)).toHaveLength(3);
    expect(historico).toContain('Nenhuma loja do iFood está ligada agora.');
    expect(historico).toContain('Vínculo desligado');
    expect(historico).toContain('>Pausado<');
    expect(historico).toContain('Acesso recusado pelo iFood');
    expect(historico).toContain(`dateTime="${erroEm.toISOString()}"`);
    expect(historico).toContain(`dateTime="${desligada.desligadaEm?.toISOString()}"`);
    expect(historico).not.toMatch(/ligada ainda|>Disponível<|Recusa sintética do provedor/);
    expect(await capacidadesIfoodPorLoja(b, dono, 'TEST', lojaB)).toMatchObject([
      { id: lojaB, modulosCadastrados: [], pausas: [], desligadas: [] },
    ]);
  });

  it('a migration do catálogo v4: só o "copiado do Dono" da v3 ganha integracao.ver; o parcial e o de versão antiga parcial não; rodar de novo não muda', async () => {
    const sql = readFileSync(join(process.cwd(), 'prisma', 'migrations', '20261118000000_erp_catalogo_v4', 'migration.sql'), 'utf8');
    const V3 = TODAS_AS_PERMISSOES.filter((p) => p !== 'integracao.ver' && p !== 'consultoria.ver');
    const desfazer = Symbol('desfazer');
    await db
      .$transaction(async (tx) => {
        await tx.perfilAcesso.createMany({
          data: [
            { id: `pv4a-${sufixo}`, parceiroId: A.id, nome: 'Sócio', base: 'DONO', permissoes: V3, catalogoVersao: 3 },
            { id: `pv4b-${sufixo}`, parceiroId: A.id, nome: 'Sócio sem preços', base: 'DONO', permissoes: V3.filter((p) => p !== 'precos.editar'), catalogoVersao: 3 },
            { id: `pv4c-${sufixo}`, parceiroId: A.id, nome: 'Cozinha', base: 'OPERADOR', permissoes: ['producao.ver', 'producao.registrar'], catalogoVersao: 2 },
          ],
        });
        await tx.$executeRawUnsafe(sql);
        await tx.$executeRawUnsafe(sql);
        const depois = await tx.perfilAcesso.findMany({ where: { id: { in: [`pv4a-${sufixo}`, `pv4b-${sufixo}`, `pv4c-${sufixo}`] } }, orderBy: { id: 'asc' } });
        expect(depois.map((p) => [p.catalogoVersao, p.permissoes.includes('integracao.ver'), p.permissoes.filter((x) => x === 'integracao.ver').length])).toEqual([
          [4, true, 1],
          [3, false, 0],
          [2, false, 0],
        ]);
        throw desfazer;
      })
      .catch((e) => {
        if (e !== desfazer) throw e;
      });
  });

  it('a tela: o selo "Loja de teste do iFood" só na loja de teste; cada situação no seu tom; o pedido de ligação abre o WhatsApp', () => {
    const base = { id: 'c', loja: 'Vila da Penha', marca: null, ligadaEm: new Date('2026-10-29T12:00:00Z') };
    const html2 = renderToStaticMarkup(
      createElement(TelaIntegracoes, {
        integracoes: [
          { ...base, id: 'c1', nomeNoIfood: 'Loja real', teste: false, modulos: [{ id: 'm1', rotulo: 'Números de venda', situacao: SITUACAO_PARA_O_PARCEIRO.ERRO_PERMISSAO }] },
          { ...base, id: 'c2', nomeNoIfood: 'Loja teste', teste: true, modulos: [{ id: 'm2', rotulo: 'Números de venda', situacao: SITUACAO_PARA_O_PARCEIRO.ATIVO }] },
        ],
      }),
    );
    const blocoReal = html2.slice(html2.indexOf('Loja real'), html2.indexOf('Loja teste'));
    expect(blocoReal).not.toContain('Loja de teste do iFood');
    expect(html2.slice(html2.indexOf('Loja teste'))).toContain('Loja de teste do iFood');
    expect(SITUACAO_PARA_O_PARCEIRO.ERRO_PERMISSAO.tom).toBe('erro');
    expect(SITUACAO_PARA_O_PARCEIRO.ATIVO.tom).toBe('ok');
    expect(SITUACAO_PARA_O_PARCEIRO.SOLICITADO.tom).toBe('alerta');
    const seloDoErro = renderToStaticMarkup(createElement(Selo, { tom: 'erro', children: 'x' }));
    expect(blocoReal).toContain(seloDoErro.slice(0, seloDoErro.indexOf('>') + 1));
    expect(html2).toContain('https://wa.me/5521996416060');
  });

  it('a migração v5 inclui consultoria no perfil próprio completo e é idempotente', async () => {
    const sql = readFileSync(join(process.cwd(), 'prisma', 'migrations', '20261205000000_erp_catalogo_v5_consultoria', 'migration.sql'), 'utf8');
    const v4 = TODAS_AS_PERMISSOES.filter(p => p !== 'consultoria.ver');
    const desfazer = new Error('Desfazer a massa do teste de migração.');
    await expect(db.$transaction(async tx => {
      const completa = `pv5a-${sufixo}`, parcial = `pv5b-${sufixo}`;
      await tx.perfilAcesso.createMany({ data: [
        { id: completa, parceiroId: A.id, nome: 'Sócio v4', base: 'DONO', permissoes: v4, catalogoVersao: 4 },
        { id: parcial, parceiroId: A.id, nome: 'Sócio v4 parcial', base: 'DONO', permissoes: v4.filter(p => p !== 'integracao.ver'), catalogoVersao: 4 },
      ] });
      await tx.$executeRawUnsafe(sql);
      await tx.$executeRawUnsafe(sql);
      const perfis = await tx.perfilAcesso.findMany({ where: { id: { in: [completa, parcial] } }, orderBy: { id: 'asc' } });
      expect(perfis.map(p => [p.catalogoVersao, p.permissoes.filter(x => x === 'consultoria.ver').length])).toEqual([[5, 1], [4, 0]]);
      throw desfazer;
    })).rejects.toBe(desfazer);
  });

  it('liberar e bloquear mudam o que o menu recebe; a loja de teste (no parceiro de testes) leva o selo; o "revise" só cita módulo liberado', async () => {
    expect([...(await modulosLiberados(a))]).toEqual(['integracao']);
    await mudarLiberacao(a, 'integracao', false, 'teste');
    expect([...(await modulosLiberados(a))]).toEqual([]);
    // Perfil próprio parcial da v3 (sem a permissão nova): sem o módulo liberado, nada a revisar sobre integrações.
    const V3 = TODAS_AS_PERMISSOES.filter((p) => p !== 'integracao.ver' && p !== 'precos.editar' && p !== 'consultoria.ver');
    const parcial = await db.perfilAcesso.create({ data: { parceiroId: A.id, nome: `Parcial v3 ${sufixo}`, base: 'DONO', permissoes: V3, catalogoVersao: 3 } });
    const revisarSem = (await listarPerfis(A.id, undefined, await modulosLiberados(a))).find((p) => p.id === parcial.id)?.revisar;
    expect(revisarSem).toEqual([]);
    await mudarLiberacao(a, 'integracao', true, 'teste');
    const revisarCom = (await listarPerfis(A.id, undefined, await modulosLiberados(a))).find((p) => p.id === parcial.id)?.revisar;
    expect(revisarCom).toEqual(['integracao.ver']);
    expect((await listarPerfis(A.id, undefined, NENHUM_MODULO_LIBERADO)).find((p) => p.id === parcial.id)?.revisar).toEqual([]);

    // Parceiro de testes com a loja de teste ligada: o selo aparece nela.
    const H = await db.parceiroFlow.create({ data: { nome: `Parceiro Int H ${sufixo}`, slug: `pint-h-${sufixo}`, status: 'ATIVO', homologacaoDeIntegracao: true } });
    ids.push(H.id);
    const h = doParceiro(H.id, db);
    const lojaH = await cadastrarLoja(h, { nome: 'Loja de teste' }, 'teste');
    if (!lojaH.ok) throw new Error(JSON.stringify(lojaH));
    const r = await ligarConexao(h, { lojaId: lojaH.id, provedor: 'IFOOD', ambiente: 'TEST', idExterno: uuid(), nomeExterno: `Teste iFood ${sufixo}` }, { nome: 'teste' });
    if (!r.ok) throw new Error(JSON.stringify(r));
    await mudarLiberacao(h, 'integracao', true, 'teste');
    como(alcanceDe('DONO', 'rede'), h, true);
    const pagina = await html(ErpIntegracoesPage({}));
    expect(pagina).toContain(`Teste iFood ${sufixo}`);
    expect(pagina).toContain('Loja de teste do iFood');
  });
});
