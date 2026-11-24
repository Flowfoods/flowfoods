/**
 * Decisão 536 · "Editar barra": os atalhos da barra de Módulos no Postgres de verdade.
 *
 * - pessoa nova: nenhum atalho salvo (a barra usa o padrão) e nenhuma linha no banco;
 * - salvar vale para a pessoa NESTE parceiro, em outro aparelho dela; outra pessoa do mesmo parceiro e a mesma pessoa em outro
 *   parceiro continuam com a barra deles;
 * - quem é a pessoa e o vínculo vêm só do token; do navegador vem só a lista;
 * - chave fora do menu, repetida, malformada, lista grande demais ou que não é lista: recusa tudo, nada grava pela metade;
 * - lista vazia volta ao padrão; sem sessão ou com a sessão encerrada, nada grava;
 * - o CHECK do banco segura o teto (4 chaves de até 40 caracteres) mesmo sem passar pelo servidor;
 * - apagar o vínculo apaga os atalhos; o `prisma` do portal recusa a tabela e o papel `erp_tenant` não a alcança.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-atalhos-barra.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/erp/sessao', () => ({
  aparelhoAtual: () => 'Teste',
  tokenDoCookie: () => undefined,
  linkDePrimeiroAcesso: (t: string) => `http://teste/entrar/primeiro-acesso/${t}`,
}));

import {
  criarAcesso,
  definirSenhaPeloLink,
  encerrarSessao,
  entrarComSenha,
  escolherParceiro,
  gravarAtalhosDaBarra,
  validarSessao,
  type SessaoValida,
} from '@/lib/erp/credenciais';
import { criarParceiro } from '@/lib/erp/parceiros';
import { travarTenant } from '@/lib/db';
import { ErroDeTenant } from '@/lib/erp/tenant';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const SENHA = 'barra de modulos 2026';
/** O que o servidor deixaria pôr na barra (as áreas com tela do menu da pessoa e o Início). */
const MENU = new Set(['inicio', 'cadastros', 'compras', 'estoque', 'producao', 'faturamento']);

describe.skipIf(!URL_TESTE)('Decisão 536 · atalhos da barra de Módulos (Postgres real)', { timeout: 60_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const avisos = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const sufixo = `b${globalThis.crypto.randomUUID().slice(0, 8)}`;
  const email = (n: string) => `${n}.${sufixo}@teste.flow`;
  const ip = () => `10.36.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}-${sufixo}`;
  const o = () => ({ base: db });
  const ids: string[] = [];
  let A: string;
  let B: string;

  async function pessoa(parceiroId: string, apelido: string) {
    const r = await criarAcesso(parceiroId, { nome: `Pessoa ${apelido}`, email: email(apelido), perfil: 'OPERADOR', lojas: 'rede' }, 'Rodolfo', o());
    if (!r.ok) throw new Error(`setup ${apelido}: ${JSON.stringify(r.erros)}`);
    if (r.link) {
      const d = await definirSenhaPeloLink(r.link.token, SENHA, SENHA, o());
      if (!d.ok) throw new Error('setup senha');
    }
  }
  async function entrar(apelido: string, parceiroId?: string): Promise<{ token: string; s: SessaoValida }> {
    const r = await entrarComSenha({ email: email(apelido), senha: SENHA, ip: ip() }, o());
    if (!r.ok) throw new Error(`setup entrar ${apelido}: ${r.erro}`);
    if (parceiroId) expect(await escolherParceiro(r.token, parceiroId, o())).toBe(true);
    const s = await validarSessao(r.token, o());
    if (!s) throw new Error('setup sessão');
    return { token: r.token, s };
  }
  const barra = async (token: string) => (await validarSessao(token, o()))!.atalhosDaBarra;
  const linhas = (acessoId: string) => db.$queryRaw<{ chaves: string[] | null }[]>`SELECT "chaves" FROM "AtalhosDaBarraErp" WHERE "acessoId" = ${acessoId}`;

  let ana: { token: string; s: SessaoValida };
  let anaOutroAparelho: { token: string; s: SessaoValida };
  let anaEmB: { token: string; s: SessaoValida };
  let bia: { token: string; s: SessaoValida };

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    (globalThis as unknown as { prismaDoTenant?: PrismaClient }).prismaDoTenant = db;
    perfil = await perfilDoBanco(db);
    for (const [nome, slug] of [
      ['Barra A', `barra-a-${sufixo}`],
      ['Barra B', `barra-b-${sufixo}`],
    ]) {
      const p = await criarParceiro({ nome, slug, status: 'ATIVO' }, 'Teste', db);
      if (!p.ok) throw new Error('setup parceiro');
      ids.push(p.id);
    }
    [A, B] = ids;
    await pessoa(A, 'ana');
    await pessoa(B, 'ana');
    await pessoa(A, 'bia');
    ana = await entrar('ana', A);
    anaOutroAparelho = await entrar('ana', A);
    anaEmB = await entrar('ana', B);
    bia = await entrar('bia');
  });

  afterAll(async () => {
    avisos.mockRestore();
    (globalThis as unknown as { prismaDoTenant?: PrismaClient }).prismaDoTenant = undefined;
    if (!db) return;
    const usuarios = (await db.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM "UsuarioErp" WHERE email LIKE $1`, `%.${sufixo}@teste.flow`)).map((u) => u.id);
    await db.$executeRawUnsafe(`DELETE FROM "TentativaEntradaErp" WHERE email LIKE $1 OR ip LIKE $2`, `%${sufixo}%`, `%-${sufixo}`);
    await db.$executeRawUnsafe(`DELETE FROM "SessaoErp" WHERE "usuarioId" = ANY($1)`, usuarios);
    await db.$executeRawUnsafe(`DELETE FROM "ConviteAcesso" WHERE "usuarioId" = ANY($1)`, usuarios);
    await db.$executeRawUnsafe(`DELETE FROM "AcessoParceiro" WHERE "usuarioId" = ANY($1)`, usuarios);
    await db.$executeRawUnsafe(`DELETE FROM "UsuarioErp" WHERE id = ANY($1)`, usuarios);
    await limparParceiros(db, perfil, ids);
    await db.$disconnect();
  });

  it('pessoa nova: nenhum atalho salvo (a barra usa o padrão) e nenhuma linha no banco', async () => {
    expect(ana.s.atalhosDaBarra).toEqual([]);
    expect(await linhas(ana.s.acessoId!)).toHaveLength(0);
  });

  it('salvar vale para a pessoa neste parceiro, em outro aparelho dela; não muda a de outra pessoa nem a dela em outro parceiro', async () => {
    expect(await gravarAtalhosDaBarra(ana.token, ['faturamento', 'inicio', 'compras', 'estoque'], MENU, o())).toEqual({ ok: true, chaves: ['faturamento', 'inicio', 'compras', 'estoque'] });
    expect(await barra(ana.token)).toEqual(['faturamento', 'inicio', 'compras', 'estoque']);
    expect(await barra(anaOutroAparelho.token)).toEqual(['faturamento', 'inicio', 'compras', 'estoque']);
    expect(await barra(bia.token)).toEqual([]);
    expect(await barra(anaEmB.token)).toEqual([]);
    // Reordenar e trocar: a lista nova substitui a velha inteira.
    expect((await gravarAtalhosDaBarra(ana.token, ['estoque', 'producao'], MENU, o())).ok).toBe(true);
    expect(await barra(ana.token)).toEqual(['estoque', 'producao']);
    // Na sessão de B, a barra de B; a de A fica.
    expect((await gravarAtalhosDaBarra(anaEmB.token, ['cadastros'], MENU, o())).ok).toBe(true);
    expect(await barra(anaEmB.token)).toEqual(['cadastros']);
    expect(await barra(ana.token)).toEqual(['estoque', 'producao']);
  });

  it('recusa o pedido inteiro (nada grava pela metade): fora do menu, repetida, malformada, grande demais ou que não é lista', async () => {
    const antes = await barra(ana.token);
    const casos: unknown[] = [
      ['compras', 'rede'],
      ['compras', 'compras'],
      ['compras', "x'; DELETE FROM \"AtalhosDaBarraErp\"; --"],
      ['COMPRAS'],
      ['inicio', 'cadastros', 'compras', 'estoque', 'producao'],
      'compras',
      [42],
      null,
    ];
    for (const c of casos) {
      const r = await gravarAtalhosDaBarra(ana.token, c, MENU, o());
      expect(r.ok, JSON.stringify(c)).toBe(false);
    }
    expect(await barra(ana.token)).toEqual(antes);
  });

  it('outra aba trocou de parceiro entre o menu conferido e a gravação: nada grava', async () => {
    const antes = await barra(ana.token);
    const r = await gravarAtalhosDaBarra(ana.token, ['compras'], MENU, o(), anaEmB.s.acessoId);
    expect(r.ok).toBe(false);
    expect(await barra(ana.token)).toEqual(antes);
    expect((await gravarAtalhosDaBarra(ana.token, antes, MENU, o(), ana.s.acessoId)).ok).toBe(true);
  });

  it('lista vazia volta ao padrão', async () => {
    expect((await gravarAtalhosDaBarra(bia.token, ['compras'], MENU, o())).ok).toBe(true);
    expect((await gravarAtalhosDaBarra(bia.token, [], MENU, o())).ok).toBe(true);
    expect(await barra(bia.token)).toEqual([]);
  });

  it('sem sessão, com token forjado ou com a sessão encerrada: nada grava', async () => {
    expect((await gravarAtalhosDaBarra(undefined, ['compras'], MENU, o())).ok).toBe(false);
    expect((await gravarAtalhosDaBarra('x'.repeat(43), ['compras'], MENU, o())).ok).toBe(false);
    const sai = await entrar('ana', A);
    await encerrarSessao(sai.token, o());
    expect((await gravarAtalhosDaBarra(sai.token, ['cadastros'], MENU, o())).ok).toBe(false);
    expect(await barra(ana.token)).toEqual(['estoque', 'producao']);
  });

  it('o CHECK do banco segura o teto sem passar pelo servidor: até 4 chaves, cada uma com até 40 caracteres', async () => {
    const id = ana.s.acessoId!;
    await expect(db.$executeRaw`UPDATE "AtalhosDaBarraErp" SET "chaves" = ARRAY['a','b','c','d','e'] WHERE "acessoId" = ${id}`).rejects.toThrow(/AtalhosDaBarraErp_chaves_limite/);
    await expect(db.$executeRaw`UPDATE "AtalhosDaBarraErp" SET "chaves" = ARRAY[repeat('a', 41)] WHERE "acessoId" = ${id}`).rejects.toThrow(/AtalhosDaBarraErp_chaves_limite/);
    await expect(db.$executeRaw`UPDATE "AtalhosDaBarraErp" SET "chaves" = ARRAY[NULL::text] WHERE "acessoId" = ${id}`).rejects.toThrow(/AtalhosDaBarraErp_chaves_limite/);
    expect(await barra(ana.token)).toEqual(['estoque', 'producao']);
  });

  it('apagar o vínculo apaga os atalhos (ON DELETE CASCADE)', async () => {
    await pessoa(A, 'cascata');
    const x = await entrar('cascata');
    expect((await gravarAtalhosDaBarra(x.token, ['compras'], MENU, o())).ok).toBe(true);
    expect(await linhas(x.s.acessoId!)).toHaveLength(1);
    await db.$executeRawUnsafe(`DELETE FROM "SessaoErp" WHERE "usuarioId" = $1`, x.s.usuario.id);
    await db.$executeRawUnsafe(`DELETE FROM "AcessoParceiro" WHERE id = $1`, x.s.acessoId);
    expect(await linhas(x.s.acessoId!)).toHaveLength(0);
  });

  it('o prisma do portal recusa a tabela; o papel erp_tenant não tem acesso a ela', async () => {
    const portal = travarTenant(new PrismaClient({ datasources: { db: { url: URL_TESTE } } }));
    await expect(portal.atalhosDaBarraErp.findMany()).rejects.toBeInstanceOf(ErroDeTenant);
    await expect(portal.atalhosDaBarraErp.create({ data: { acessoId: 'x' } })).rejects.toBeInstanceOf(ErroDeTenant);
    if (perfil.rls) {
      const [g] = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM information_schema.role_table_grants WHERE grantee = 'erp_tenant' AND table_name = 'AtalhosDaBarraErp'`;
      expect(g.n).toBe(0);
    }
  });
});
