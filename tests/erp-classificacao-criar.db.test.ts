/** Criação avulsa: actions reais, identidade/concorrência e transações no Postgres. */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const atual = vi.hoisted(() => ({ ctx: null as null | (() => unknown), acessos: [] as string[], audit: vi.fn(async () => ({})), revalidar: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: atual.revalidar }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); }, notFound: () => { throw new Error('NOT_FOUND'); } }));
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: atual.audit } } }));
vi.mock('@/lib/erp/contexto', async () => ({
  ...await import('@/lib/erp/permissoes'),
  exigirParceiroDaSessao: async () => { atual.acessos.push('ERP'); return atual.ctx!(); },
  exigirParceiro: async (slug: string) => { atual.acessos.push(`N1:${slug}`); return atual.ctx!(); },
}));

import { criarClassificacao } from '@/lib/erp/ficha-secoes';
import type { RegistroDeClassificacao, ResultadoGestaoClassificacao } from '@/lib/erp/ficha-secoes-campos';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { resolverAlcance } from '@/lib/erp/permissoes';
import * as erp from '@/app/erp/fichas/actions';
import * as n1 from '@/app/rodolfo/(painel)/erp/[slug]/fichas/actions';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
function registro(r: ResultadoGestaoClassificacao | null): RegistroDeClassificacao {
  if (!r?.ok || !r.alterado) throw new Error(JSON.stringify(r));
  return r.alterado;
}
function formulario(nivel: string, nome: string, secaoId?: string) {
  const form = new FormData();
  for (const [campo, valor] of Object.entries({ intencao: 'criar', nivel, nome, ...(secaoId ? { secaoId } : {}), parceiroId: 'tenant-forjado-ignorado' })) form.set(campo, valor);
  return form;
}

describe.skipIf(!URL_TESTE)('Classificação · criação avulsa (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient, perfil: PerfilDoBanco, a: ClienteDoParceiro, b: ClienteDoParceiro;
  const parceiros: Array<{ id: string; slug: string }> = [];
  let permissoes: string[] = [], bloqueio: string | null = null;
  const contexto = () => ({
    cliente: bloqueio ? doParceiro(parceiros[0].id, db, { somenteLeitura: true }) : a,
    alcance: resolverAlcance({ perfilBase: null, perfilProprio: permissoes, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] }),
    parceiro: parceiros[0], bloqueio, sessao: { userId: 'classificacao-avulsa', autorNome: 'Autor da action' }, pessoa: { setores: [] },
  });
  const secao = async (nome: string, cliente = a) => registro(await criarClassificacao(cliente, { nivel: 'secao', nome }, 'Autor sintético')).registro;

  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    for (const nome of ['A', 'B']) parceiros.push(await db.parceiroFlow.create({ data: { nome: `Criação avulsa ${nome}`, slug: `classificacao-criar-${crypto.randomUUID()}`, status: 'ATIVO' } }));
    a = doParceiro(parceiros[0].id, db); b = doParceiro(parceiros[1].id, db);
    atual.ctx = contexto;
  }, 120_000);
  beforeEach(() => { permissoes = ['fichas.editar']; bloqueio = null; atual.audit.mockClear(); atual.revalidar.mockClear(); atual.acessos.length = 0; });
  afterAll(async () => {
    if (db) { await limparParceiros(db, perfil, parceiros.map(p => p.id)); await db.$disconnect(); }
  }, 120_000);

  it('cria seção e filha sem ficha, produto ou DTO financeiro; histórico pertence à mesma transação', async () => {
    const pai = await secao('Pratos quentes avulsos');
    const filha = registro(await criarClassificacao(a, { nivel: 'subsecao', nome: 'Peixes avulsos', secaoId: pai.id }, 'Autor da filha'));
    expect(filha).toEqual({ nivel: 'subsecao', registro: { id: expect.any(String), nome: 'Peixes avulsos', ativa: true, versao: expect.any(String), secaoId: pai.id, secaoAtiva: true } });
    expect(await a.fichaTecnica.count()).toBe(0);
    expect(await a.produtoVenda.count()).toBe(0);
    expect(await b.secaoFicha.findUnique({ where: { id: pai.id } })).toBeNull();
    const eventos = await a.historicoAlteracao.findMany({ where: { entidadeId: { in: [pai.id, filha.registro.id] } }, orderBy: { entidade: 'asc' } });
    expect(eventos).toHaveLength(2);
    expect(eventos[0]).toMatchObject({ entidade: 'SecaoFicha', entidadeId: pai.id, acao: 'CRIOU', autorNome: 'Autor sintético', depois: { nome: pai.nome, ativa: true } });
    expect(eventos[1]).toMatchObject({ entidade: 'SubsecaoFicha', entidadeId: filha.registro.id, acao: 'CRIOU', autorNome: 'Autor da filha', depois: { secaoId: pai.id, secao: pai.nome, nome: 'Peixes avulsos' } });
    expect(JSON.stringify(filha)).not.toMatch(/parceiroId|custo|preco|cmv|centavos/i);
  });

  it('reusa nomes ativos normalizados e não renomeia, avança versão ou repete histórico', async () => {
    const pai = await secao('  Sec\u0327a\u0303o\t de avulsos  ');
    const filho = registro(await criarClassificacao(a, { nivel: 'subsecao', secaoId: pai.id, nome: 'Frios avulsos' }));
    expect(await secao('SECAO DE AVULSOS')).toEqual(pai);
    expect(registro(await criarClassificacao(a, { nivel: 'subsecao', secaoId: pai.id, nome: 'FRÍOS AVULSOS' }))).toEqual(filho);
    expect(await a.historicoAlteracao.count({ where: { entidadeId: { in: [pai.id, filho.registro.id] }, acao: 'CRIOU' } })).toBe(2);
  });

  it('nome de subseção pode se repetir em outra seção; nome de seção pertence ao parceiro', async () => {
    const um = await secao('Pai de mesma filha um'), dois = await secao('Pai de mesma filha dois');
    const filhos = await Promise.all([um, dois].map(p => criarClassificacao(a, { nivel: 'subsecao', nome: 'Filha repetida por pai', secaoId: p.id })));
    expect(new Set(filhos.map(r => registro(r).registro.id)).size).toBe(2);
    const alheia = await secao(um.nome, b);
    expect(alheia.id).not.toBe(um.id);
  });

  it('duas criações concorrentes de seção e filha convergem para uma identidade e um histórico por nome', async () => {
    const pais = await Promise.all(['Avulsa concorrente', 'AVULSA CONCORRENTE'].map(nome => secao(nome)));
    expect(pais[0]).toEqual(pais[1]);
    const filhos = await Promise.all(['Filha concorrente', 'FILHA CONCORRENTE'].map(nome => criarClassificacao(a, { nivel: 'subsecao', nome, secaoId: pais[0].id })));
    expect(registro(filhos[0])).toEqual(registro(filhos[1]));
    expect(await a.historicoAlteracao.count({ where: { entidadeId: { in: [pais[0].id, registro(filhos[0]).registro.id] }, acao: 'CRIOU' } })).toBe(2);
  });

  it('erro posterior na transação desfaz nome e histórico juntos', async () => {
    const eventos = await a.historicoAlteracao.count();
    await expect(a.transacao(async tx => {
      expect((await criarClassificacao(tx, { nivel: 'secao', nome: 'Avulsa revertida' })).ok).toBe(true);
      throw new Error('Falha sintética posterior');
    })).rejects.toThrow('Falha sintética posterior');
    expect(await a.secaoFicha.count({ where: { nome: 'Avulsa revertida' } })).toBe(0);
    expect(await a.historicoAlteracao.count()).toBe(eventos);
  });

  it.each([
    { pedido: { nivel: 'outro', nome: 'Nome válido' }, campo: 'geral' },
    { pedido: { nivel: 'secao', nome: '' }, campo: 'nome' },
    { pedido: { nivel: 'secao', nome: 'a' }, campo: 'nome' },
    { pedido: { nivel: 'secao', nome: 'a'.repeat(81) }, campo: 'nome' },
    { pedido: { nivel: 'secao', nome: 123 }, campo: 'nome' },
    { pedido: { nivel: 'subsecao', nome: 'Filha sem pai' }, campo: 'secaoId' },
    { pedido: { nivel: 'subsecao', nome: 'Filha com pai inválido', secaoId: '../invalido' }, campo: 'secaoId' },
  ])('recusa entrada inválida sem gravar: $campo / $pedido.nome', async ({ pedido, campo }) => {
    const antes = [await a.secaoFicha.count(), await a.subsecaoFicha.count(), await a.historicoAlteracao.count()];
    expect(await criarClassificacao(a, pedido)).toMatchObject({ ok: false, erros: { [campo]: expect.any(String) } });
    expect([await a.secaoFicha.count(), await a.subsecaoFicha.count(), await a.historicoAlteracao.count()]).toEqual(antes);
  });

  it('recusa pai inexistente, de outro parceiro ou arquivado sem criar filha nem revelar o nome alheio', async () => {
    const alheio = await secao('Pai confidencial B', b), arquivado = await secao('Pai avulso arquivado');
    await a.secaoFicha.update({ where: { id: arquivado.id }, data: { ativa: false } });
    const eventos = await a.historicoAlteracao.count();
    for (const secaoId of ['inexistente', alheio.id, arquivado.id]) {
      const r = await criarClassificacao(a, { nivel: 'subsecao', nome: 'Filha recusada', secaoId });
      expect(r).toMatchObject({ ok: false, erros: { secaoId: expect.any(String) } });
      expect(JSON.stringify(r)).not.toContain(alheio.nome);
    }
    expect(await a.subsecaoFicha.count({ where: { nome: 'Filha recusada' } })).toBe(0);
    expect(await a.historicoAlteracao.count()).toBe(eventos);
  });

  it('nomes arquivados não são recriados nem restaurados implicitamente', async () => {
    const pai = await secao('Avulsa arquivo do pai'), ativo = await secao('Pai ativo de arquivo');
    const filho = registro(await criarClassificacao(a, { nivel: 'subsecao', nome: 'Avulsa arquivo da filha', secaoId: ativo.id }));
    await a.secaoFicha.update({ where: { id: pai.id }, data: { ativa: false } });
    await a.subsecaoFicha.update({ where: { id: filho.registro.id }, data: { ativa: false } });
    const eventos = await a.historicoAlteracao.count();
    for (const pedido of [{ nivel: 'secao', nome: pai.nome }, { nivel: 'subsecao', nome: filho.registro.nome, secaoId: ativo.id }]) expect(await criarClassificacao(a, pedido)).toMatchObject({ ok: false, erros: { nome: expect.stringMatching(/arquivada/) } });
    expect(await a.secaoFicha.findUnique({ where: { id: pai.id } })).toMatchObject({ ativa: false });
    expect(await a.subsecaoFicha.findUnique({ where: { id: filho.registro.id } })).toMatchObject({ ativa: false });
    expect(await a.historicoAlteracao.count()).toBe(eventos);
  });

  it('action ERP cria sem ver fichas/preços, ignora tenant forjado e revalida sem redirecionar', async () => {
    const r = await erp.acaoGerirClassificacao(null, formulario('secao', 'Criada pela action ERP'));
    const nova = registro(r);
    expect(r).toMatchObject({ vez: 1, ok: true, excluido: null, mensagem: 'Seção pronta para usar.' });
    expect(await a.secaoFicha.findUnique({ where: { id: nova.registro.id } })).toMatchObject({ parceiroId: a.parceiroId });
    expect(await b.secaoFicha.findUnique({ where: { id: nova.registro.id } })).toBeNull();
    expect(atual.revalidar).toHaveBeenCalledWith('/erp/fichas', 'layout');
    expect(JSON.stringify(r)).not.toMatch(/parceiroId|custo|preco|cmv|centavos/i);
    expect(await erp.acaoGerirClassificacao(r, formulario('secao', 'Criada pela action ERP'))).toMatchObject({ vez: 2, alterado: nova });
    expect(await a.historicoAlteracao.count({ where: { entidadeId: nova.registro.id } })).toBe(1);
  });

  it('action reavalia edição e bloqueio em ERP e N1; ler ou precificar não concede criação', async () => {
    const eventos = await a.historicoAlteracao.count();
    for (const autorizadas of [['fichas.ver'], ['precos.ver', 'precos.editar']]) {
      permissoes = autorizadas;
      expect(await erp.acaoGerirClassificacao(null, formulario('secao', 'Não autorizada ERP'))).toMatchObject({ ok: false });
      expect(await n1.acaoGerirClassificacao(parceiros[0].slug, null, formulario('secao', 'Não autorizada N1'))).toMatchObject({ ok: false });
    }
    permissoes = ['fichas.editar']; bloqueio = 'Parceiro suspenso no teste';
    expect(await erp.acaoGerirClassificacao(null, formulario('secao', 'Não autorizada ERP'))).toMatchObject({ ok: false });
    expect(await n1.acaoGerirClassificacao(parceiros[0].slug, null, formulario('secao', 'Não autorizada N1'))).toMatchObject({ ok: false });
    expect(await a.secaoFicha.count({ where: { nome: { startsWith: 'Não autorizada' } } })).toBe(0);
    expect(await a.historicoAlteracao.count()).toBe(eventos);
    expect(atual.revalidar).not.toHaveBeenCalled();
    expect(atual.audit).not.toHaveBeenCalled();
  });

  it('N1 cria filha do parceiro resolvido pelo slug e audita confirmação, sem navegação', async () => {
    const pai = await secao('Pai da action N1');
    const r = await n1.acaoGerirClassificacao(parceiros[0].slug, null, formulario('subsecao', 'Filha da action N1', pai.id));
    const filha = registro(r);
    expect(filha).toMatchObject({ nivel: 'subsecao', registro: { secaoId: pai.id, secaoAtiva: true } });
    expect(atual.acessos).toEqual([`N1:${parceiros[0].slug}`]);
    expect(atual.audit).toHaveBeenCalledExactlyOnceWith({ data: { userId: 'classificacao-avulsa', evento: 'erp_ficha_classificacao_alterada', dados: { parceiroId: a.parceiroId, id: filha.registro.id, nivel: 'subsecao', intencao: 'criar' } } });
    expect(atual.revalidar).toHaveBeenCalledWith(`/rodolfo/erp/${parceiros[0].slug}/fichas`, 'layout');
  });

  it('action recusa nível e pai inválidos sem revalidar ou auditar', async () => {
    expect(await erp.acaoGerirClassificacao(null, formulario('outro', 'Nome da action'))).toMatchObject({ vez: 1, ok: false, erros: { geral: expect.any(String) } });
    expect(await n1.acaoGerirClassificacao(parceiros[0].slug, null, formulario('subsecao', 'Filha sem seleção'))).toMatchObject({ vez: 1, ok: false, erros: { secaoId: expect.any(String) } });
    expect(atual.revalidar).not.toHaveBeenCalled();
    expect(atual.audit).not.toHaveBeenCalled();
  });
});
