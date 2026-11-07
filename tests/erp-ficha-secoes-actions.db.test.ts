/** Actions reais + domínio/banco reais; apenas a resolução de sessão/redirect/cache é simulada. */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const atual = vi.hoisted(() => ({ ctx: null as null | (() => unknown), acessos: [] as string[], audit: vi.fn(async () => ({})) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); }, notFound: () => { throw new Error('NOT_FOUND'); } }));
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: atual.audit } } }));
vi.mock('@/lib/erp/contexto', async () => {
  const regras = await import('@/lib/erp/permissoes');
  return {
    ...regras,
    exigirParceiroDaSessao: async () => { atual.acessos.push('ERP'); return atual.ctx!(); },
    exigirParceiro: async (slug: string) => { atual.acessos.push(`N1:${slug}`); return atual.ctx!(); },
  };
});

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { resolverAlcance } from '@/lib/erp/permissoes';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';
import * as erp from '@/app/erp/fichas/actions';
import * as n1 from '@/app/rodolfo/(painel)/erp/[slug]/fichas/actions';

const URL_TESTE = process.env.ERP_DB_TESTE;

describe.skipIf(!URL_TESTE)('3A · gates atuais nas actions (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient, perfil: PerfilDoBanco, a: ClienteDoParceiro;
  let parceiro: { id: string; slug: string }, secaoId: string;
  let permissoes: string[] = [], bloqueio: string | null = null;
  const contexto = () => ({
    cliente: bloqueio ? doParceiro(parceiro.id, db, { somenteLeitura: true }) : a,
    alcance: resolverAlcance({ perfilBase: null, perfilProprio: permissoes, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] }),
    parceiro, bloqueio, sessao: { userId: 'sintetico-3a', autorNome: 'Teste de acesso' }, pessoa: { setores: [] },
  });
  async function formulario(nome: string) {
    const secao = await a.secaoFicha.findUniqueOrThrow({ where: { id: secaoId } });
    const f = new FormData();
    for (const [k, v] of Object.entries({ intencao: 'renomear', nivel: 'secao', id: secaoId, versao: secao.atualizadoEm.toISOString(), nome, parceiroId: 'outro-parceiro-forjado' })) f.set(k, v);
    return f;
  }
  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    parceiro = await db.parceiroFlow.create({ data: { nome: 'Actions sintéticas 3A', slug: `secao-actions-${crypto.randomUUID()}`, status: 'ATIVO' } });
    a = doParceiro(parceiro.id, db);
    secaoId = (await a.secaoFicha.create({ data: { parceiroId: parceiro.id, nome: 'Seção de teste' } })).id;
    atual.ctx = contexto;
  });
  afterAll(async () => {
    if (db) { if (parceiro) await limparParceiros(db, perfil, [parceiro.id]); await db.$disconnect(); }
  });

  it('fichas.editar sem preços permite gestão; formulário não troca tenant e sucesso não redireciona a receita', async () => {
    permissoes = ['fichas.editar']; bloqueio = null;
    const r = await erp.acaoGerirClassificacao(null, await formulario('Editada sem preço'));
    expect(r).toMatchObject({ ok: true, alterado: { nivel: 'secao', registro: { id: secaoId, nome: 'Editada sem preço' } } });
    expect(await a.secaoFicha.findUnique({ where: { id: secaoId } })).toMatchObject({ parceiroId: parceiro.id, nome: 'Editada sem preço' });
    expect(JSON.stringify(r)).not.toMatch(/preco|cmv|parceiroId|custo/i);
  });

  it('busca de filtro exige ver; busca de formulário/gestão exige editar sem presumir uma permissão pela outra', async () => {
    permissoes = ['fichas.ver']; bloqueio = null;
    expect((await erp.acaoBuscarClassificacao({ contexto: 'filtro', nivel: 'secao' })).ok).toBe(true);
    for (const contexto of ['formulario', 'gestao'] as const) expect((await erp.acaoBuscarClassificacao({ contexto, nivel: 'secao' })).ok).toBe(false);
    permissoes = ['fichas.editar'];
    expect((await erp.acaoBuscarClassificacao({ contexto: 'filtro', nivel: 'secao' })).ok).toBe(false);
    expect((await erp.acaoBuscarClassificacao({ contexto: 'formulario', nivel: 'secao' })).ok).toBe(true);
    permissoes = ['precos.ver', 'precos.editar', 'insumos.categorias'];
    expect((await erp.acaoGerirClassificacao(null, await formulario('Não autorizado')))?.ok).toBe(false);
  });

  it('revogação entre abrir e salvar é reavaliada; falha não altera classificação nem histórico', async () => {
    permissoes = ['fichas.editar']; bloqueio = null;
    expect((await erp.acaoBuscarClassificacao({ contexto: 'gestao', nivel: 'secao' })).ok).toBe(true);
    const form = await formulario('Revogada');
    const antes = await a.secaoFicha.findUnique({ where: { id: secaoId } });
    const historico = await a.historicoAlteracao.count();
    permissoes = ['fichas.ver'];
    const acessos = atual.acessos.length;
    expect((await erp.acaoGerirClassificacao(null, form))?.ok).toBe(false);
    expect(atual.acessos.length).toBe(acessos + 1);
    expect(await a.secaoFicha.findUnique({ where: { id: secaoId } })).toEqual(antes);
    expect(await a.historicoAlteracao.count()).toBe(historico);
  });

  it('bloqueio após abrir recusa gestão e criação contextual também pelo caminho N1', async () => {
    permissoes = ['fichas.editar']; bloqueio = 'Parceiro suspenso no teste.';
    const historico = await a.historicoAlteracao.count();
    const form = await formulario('Suspensa');
    expect((await erp.acaoGerirClassificacao(null, form))?.ok).toBe(false);
    expect((await n1.acaoGerirClassificacao(parceiro.slug, null, form))?.ok).toBe(false);
    expect(atual.acessos.at(-1)).toBe(`N1:${parceiro.slug}`);
    const ficha = new FormData();
    for (const [k, v] of Object.entries({ nome: 'Não deve nascer', tipo: 'PRATO', classificacaoNoFormulario: 'sim', secaoModo: 'nova', secaoNome: 'Órfã proibida', subsecaoModo: 'nenhuma' })) ficha.set(k, v);
    expect(await erp.acaoCadastrarFicha(null, ficha)).toMatchObject({ ok: false });
    expect(await n1.acaoCadastrarFicha(parceiro.slug, null, ficha)).toMatchObject({ ok: false });
    expect(await a.secaoFicha.count({ where: { nome: 'Órfã proibida' } })).toBe(0);
    expect(await a.historicoAlteracao.count()).toBe(historico);
    bloqueio = null;
  });

  it('N1 resolve slug a cada chamada e audita gestão confirmada sem navegar', async () => {
    permissoes = ['fichas.editar']; bloqueio = null; atual.audit.mockClear();
    expect((await n1.acaoBuscarClassificacao(parceiro.slug, { contexto: 'gestao', nivel: 'secao' })).ok).toBe(true);
    expect(await n1.acaoGerirClassificacao(parceiro.slug, null, await formulario('N1 confirmado'))).toMatchObject({ ok: true });
    expect(atual.acessos.slice(-2)).toEqual([`N1:${parceiro.slug}`, `N1:${parceiro.slug}`]);
    expect(atual.audit).toHaveBeenCalledTimes(1);
    expect(atual.audit.mock.calls[0]).toMatchObject([{ data: { dados: { parceiroId: parceiro.id } } }]);
  });
});
