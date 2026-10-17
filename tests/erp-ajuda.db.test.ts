/**
 * 0.6 — a preferência de ajuda no Postgres de verdade:
 *
 * - nasce ligada e sem resposta; "manter" e "desligar" ficam gravados e valem em
 *   outro aparelho (outra sessão da mesma pessoa) e em outro parceiro;
 * - "fechar" some só aquela caixa, para a pessoa nas duas sessões; outra pessoa
 *   do mesmo parceiro continua vendo;
 * - a action NÃO recebe quem é a pessoa: campo `usuarioId` forjado é ignorado;
 * - chave forjada, gigante ou de versão que não existe: recusada, nada grava;
 * - duas abas fechando caixas ao mesmo tempo não perdem nenhuma;
 * - teto de 300 (o mais velho sai) e o CHECK do banco;
 * - sem sessão, com sessão encerrada ou com o cookie do nível 1: nada grava;
 * - parceiro suspenso não impede de ajustar a própria preferência;
 * - apagar a pessoa apaga a preferência; o `prisma` do portal recusa a tabela.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-ajuda.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const atual = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`REDIRECT ${url}`), { url });
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('@/lib/erp/sessao', () => ({
  aparelhoAtual: () => 'Teste',
  tokenDoCookie: () => atual.token,
  linkDePrimeiroAcesso: (t: string) => `http://teste/entrar/primeiro-acesso/${t}`,
}));
vi.mock('@/lib/erp/contexto', async () => {
  const { recusaDaAcao, exigirPermissao, pode } = await import('@/lib/erp/permissoes');
  return { exigirParceiroDaSessao: async () => { throw new Error('não usado'); }, exigirPessoa: async () => { throw new Error('não usado'); }, recusaDaAcao, exigirPermissao, pode };
});

import {
  acrescentarCaixaFechada,
  criarAcesso,
  definirSenhaPeloLink,
  encerrarSessao,
  entrarComSenha,
  escolherParceiro,
  gravarPreferenciaDeAjuda,
  validarSessao,
  type SessaoValida,
} from '@/lib/erp/credenciais';
import { ENTRADAS } from '@/lib/erp/ajuda';
import { criarParceiro, mudarStatusParceiro } from '@/lib/erp/parceiros';
import { acaoAjudaDicas, acaoAjudaFechar, acaoAjudaReabrir } from '@/app/erp/actions';
import { travarTenant } from '@/lib/db';
import { ErroDeTenant } from '@/lib/erp/tenant';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const SENHA = 'cozinha limpa 2026';

describe.skipIf(!URL_TESTE)('ERP 0.6 · preferência de ajuda (Postgres real)', { timeout: 60_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const avisos = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const sufixo = `a${globalThis.crypto.randomUUID().slice(0, 8)}`;
  const email = (n: string) => `${n}.${sufixo}@teste.flow`;
  const ip = () => `10.6.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}-${sufixo}`;
  const o = () => ({ base: db });
  const ids: string[] = [];
  let A: string;
  let B: string;

  async function pessoa(parceiroId: string, apelido: string, campos: Record<string, unknown> = { perfil: 'OPERADOR', lojas: 'rede' }) {
    const r = await criarAcesso(parceiroId, { nome: `Pessoa ${apelido}`, email: email(apelido), ...campos }, 'Rodolfo', o());
    if (!r.ok) throw new Error(`setup ${apelido}: ${JSON.stringify(r.erros)}`);
    if (r.link) {
      const d = await definirSenhaPeloLink(r.link.token, SENHA, SENHA, o());
      if (!d.ok) throw new Error('setup senha');
    }
    return entrar(apelido);
  }
  async function entrar(apelido: string, parceiroId?: string): Promise<{ token: string; s: SessaoValida }> {
    const r = await entrarComSenha({ email: email(apelido), senha: SENHA, ip: ip() }, o());
    if (!r.ok) throw new Error(`setup entrar ${apelido}: ${r.erro}`);
    if (parceiroId) expect(await escolherParceiro(r.token, parceiroId, o())).toBe(true);
    const s = await validarSessao(r.token, o());
    if (!s) throw new Error('setup sessão');
    return { token: r.token, s };
  }
  const ver = async (token: string) => (await validarSessao(token, o()))!.ajuda;
  const form = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.append(k, v);
    return f;
  };
  const linhas = (usuarioId: string) => db.$queryRaw<{ fechadas: string[] | null; dicasLigadas: boolean; escolhidaEm: Date | null }[]>`SELECT "fechadas", "dicasLigadas", "escolhidaEm" FROM "PreferenciaErp" WHERE "usuarioId" = ${usuarioId}`;
  /** Como a action vê o mundo: o cookie é o token da pessoa (ou nenhum). */
  const como = (token: string | undefined) => {
    atual.token = token;
  };

  let ana: { token: string; s: SessaoValida };
  let anaOutroAparelho: { token: string; s: SessaoValida };
  let bia: { token: string; s: SessaoValida };

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    // As actions chamam a credencial sem `base`: elas usam o cliente do processo, que aqui é o do teste.
    (globalThis as unknown as { prismaDoTenant?: PrismaClient }).prismaDoTenant = db;
    perfil = await perfilDoBanco(db);
    for (const [nome, slug] of [
      ['Ajuda A', `ajuda-a-${sufixo}`],
      ['Ajuda B', `ajuda-b-${sufixo}`],
    ]) {
      const p = await criarParceiro({ nome, slug, status: 'ATIVO' }, 'Teste', db);
      if (!p.ok) throw new Error('setup parceiro');
      ids.push(p.id);
    }
    [A, B] = ids;
    ana = await pessoa(A, 'ana');
    anaOutroAparelho = await entrar('ana');
    bia = await pessoa(A, 'bia');
  });

  afterAll(async () => {
    avisos.mockRestore();
    (globalThis as unknown as { prismaDoTenant?: PrismaClient }).prismaDoTenant = undefined;
    if (!db) return;
    const usuarios = (
      await db.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM "UsuarioErp" WHERE email LIKE $1`, `%.${sufixo}@teste.flow`)
    ).map((u) => u.id);
    await db.$executeRawUnsafe(`DELETE FROM "TentativaEntradaErp" WHERE email LIKE $1 OR ip LIKE $2`, `%${sufixo}%`, `%-${sufixo}`);
    await db.$executeRawUnsafe(`DELETE FROM "SessaoErp" WHERE "usuarioId" = ANY($1)`, usuarios);
    await db.$executeRawUnsafe(`DELETE FROM "ConviteAcesso" WHERE "usuarioId" = ANY($1)`, usuarios);
    await db.$executeRawUnsafe(`DELETE FROM "AcessoParceiro" WHERE "usuarioId" = ANY($1)`, usuarios);
    await db.$executeRawUnsafe(`DELETE FROM "UsuarioErp" WHERE id = ANY($1)`, usuarios);
    await limparParceiros(db, perfil, ids);
    await db.$disconnect();
  });

  it('pessoa nova: dicas ligadas, sem resposta, nenhuma caixa fechada (e nenhuma linha no banco)', async () => {
    expect(ana.s.ajuda).toEqual({ dicasLigadas: true, escolhida: false, fechadas: [] });
    expect(await linhas(ana.s.usuario.id)).toEqual([]);
  });

  it('"Manter" grava a resposta; vale na outra sessão da pessoa e some a pergunta', async () => {
    como(ana.token);
    await acaoAjudaDicas(form({ dicas: 'manter' }));
    expect(await ver(ana.token)).toEqual({ dicasLigadas: true, escolhida: true, fechadas: [] });
    expect(await ver(anaOutroAparelho.token)).toEqual({ dicasLigadas: true, escolhida: true, fechadas: [] });
    // quem não respondeu continua sendo perguntado
    expect((await ver(bia.token)).escolhida).toBe(false);
  });

  it('"Desligar" grava e vale em outro aparelho, sem mexer na colega do mesmo parceiro', async () => {
    como(bia.token);
    await acaoAjudaDicas(form({ dicas: 'desligar' }));
    expect(await ver(bia.token)).toEqual({ dicasLigadas: false, escolhida: true, fechadas: [] });
    const outroAparelho = await entrar('bia');
    expect((await ver(outroAparelho.token)).dicasLigadas).toBe(false);
    expect((await ver(ana.token)).dicasLigadas).toBe(true);
    // religar em "Seu acesso"
    await acaoAjudaDicas(form({ dicas: 'ligar' }));
    expect((await ver(bia.token)).dicasLigadas).toBe(true);
    await acaoAjudaDicas(form({ dicas: 'desligar' }));
    // valor fora da lista: não grava
    await acaoAjudaDicas(form({ dicas: 'talvez' }));
    expect((await ver(bia.token)).dicasLigadas).toBe(false);
  });

  it('"Entendi" fecha só aquela caixa, nas duas sessões da pessoa; a colega continua vendo; fechar de novo não duplica', async () => {
    como(ana.token);
    await acaoAjudaFechar(form({ caixa: 'insumos@1' }));
    await acaoAjudaFechar(form({ caixa: 'insumos@1' }));
    expect((await ver(ana.token)).fechadas).toEqual(['insumos@1']);
    expect((await ver(anaOutroAparelho.token)).fechadas).toEqual(['insumos@1']);
    expect((await ver(bia.token)).fechadas).toEqual([]);
    await acaoAjudaFechar(form({ caixa: 'fichas@1' }));
    expect((await ver(ana.token)).fechadas).toEqual(['insumos@1', 'fichas@1']);
  });

  it('usuarioId forjado no formulário é ignorado: só a pessoa da sessão muda', async () => {
    como(ana.token);
    const antesDaBia = await linhas(bia.s.usuario.id);
    await acaoAjudaFechar(form({ caixa: 'lojas@2', usuarioId: bia.s.usuario.id, usuario: bia.s.usuario.id, id: bia.s.usuario.id }));
    await acaoAjudaDicas(form({ dicas: 'desligar', usuarioId: bia.s.usuario.id }));
    expect(await linhas(bia.s.usuario.id)).toEqual(antesDaBia);
    expect((await ver(ana.token)).fechadas).toContain('lojas@2');
    expect((await ver(ana.token)).dicasLigadas).toBe(false);
    // volta ao normal
    await acaoAjudaDicas(form({ dicas: 'ligar' }));
  });

  it('chave forjada, gigante, de versão inexistente ou com SQL: recusada e nada grava', async () => {
    como(ana.token);
    const antes = await linhas(ana.s.usuario.id);
    const ruins = [
      'nao-existe@1',
      'insumos@2',
      'insumos@99',
      'insumos',
      '@1',
      "insumos@1'; DELETE FROM \"PreferenciaErp\"; --",
      `${'a'.repeat(5000)}@1`,
      'INSUMOS@1',
      '',
      '<script>@1',
    ];
    for (const caixa of ruins) {
      await acaoAjudaFechar(form({ caixa }));
      expect((await gravarPreferenciaDeAjuda(ana.token, { tipo: 'fechar', caixa }, o())).ok, caixa.slice(0, 30)).toBe(false);
    }
    expect((await gravarPreferenciaDeAjuda(ana.token, { tipo: 'fechar', caixa: ['insumos@1'] as never }, o())).ok).toBe(false);
    expect((await gravarPreferenciaDeAjuda(ana.token, { tipo: 'dicas', ligadas: 'sim' as never }, o())).ok).toBe(false);
    expect((await gravarPreferenciaDeAjuda(ana.token, { tipo: 'apagar' } as never, o())).ok).toBe(false);
    expect(await linhas(ana.s.usuario.id)).toEqual(antes);
  });

  it('duas abas fechando caixas ao mesmo tempo: nenhum fechamento se perde', async () => {
    como(bia.token);
    await acaoAjudaReabrir();
    const todas = ENTRADAS.map((e) => `${e.chave}@${e.versao}`);
    const abas = [bia.token, (await entrar('bia')).token];
    const r = await Promise.all(todas.map((caixa, n) => gravarPreferenciaDeAjuda(abas[n % 2], { tipo: 'fechar', caixa }, o())));
    expect(r.every((x) => x.ok)).toBe(true);
    const guardadas = (await ver(bia.token)).fechadas;
    expect([...guardadas].sort()).toEqual([...todas].sort());
  });

  it('teto de 300: o mais velho sai e o banco segura o resto; a versão antiga da mesma caixa sai ao fechar a nova', async () => {
    const u = bia.s.usuario.id;
    await db.$executeRaw`UPDATE "PreferenciaErp" SET "fechadas" = ARRAY[]::text[] WHERE "usuarioId" = ${u}`;
    for (let n = 1; n <= 305; n++) await acrescentarCaixaFechada(db, u, `caixa-${n}@1`, new Date());
    const [l] = await linhas(u);
    expect(l.fechadas).toHaveLength(300);
    expect(l.fechadas![0]).toBe('caixa-6@1');
    expect(l.fechadas!.at(-1)).toBe('caixa-305@1');
    // versão nova da mesma caixa tira a velha
    await acrescentarCaixaFechada(db, u, 'caixa-300@2', new Date());
    const [m] = await linhas(u);
    expect(m.fechadas).toContain('caixa-300@2');
    expect(m.fechadas).not.toContain('caixa-300@1');
    expect(m.fechadas).toHaveLength(300);
    // o CHECK do banco: 301 itens ou item com mais de 120 caracteres não entram por fora
    await expect(db.$executeRaw`UPDATE "PreferenciaErp" SET "fechadas" = ARRAY(SELECT 'x' || g FROM generate_series(1, 301) g) WHERE "usuarioId" = ${u}`).rejects.toThrow(/PreferenciaErp_fechadas_limite/);
    await expect(db.$executeRaw`UPDATE "PreferenciaErp" SET "fechadas" = ARRAY[repeat('a', 121)] WHERE "usuarioId" = ${u}`).rejects.toThrow(/PreferenciaErp_fechadas_limite/);
  });

  it('"Mostrar de novo as que fechei" zera a lista (e só a da pessoa da sessão)', async () => {
    como(ana.token);
    expect((await ver(ana.token)).fechadas.length).toBeGreaterThan(0);
    const antesDaBia = await linhas(bia.s.usuario.id);
    await acaoAjudaReabrir();
    expect((await ver(ana.token)).fechadas).toEqual([]);
    expect(await linhas(bia.s.usuario.id)).toEqual(antesDaBia);
  });

  it('sem cookie, com lixo, com sessão encerrada ou com token do nível 1: nada grava', async () => {
    const antes = await linhas(ana.s.usuario.id);
    como(undefined);
    await acaoAjudaFechar(form({ caixa: 'insumos@1' }));
    await acaoAjudaDicas(form({ dicas: 'desligar' }));
    await acaoAjudaReabrir();
    como('nao-e-um-token');
    await acaoAjudaFechar(form({ caixa: 'insumos@1' }));
    // O Rodolfo no /rodolfo tem JWT do next-auth, não o cookie ff_erp: a action não acha sessão.
    como('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJyb2RvbGZvIn0.assinatura');
    await acaoAjudaFechar(form({ caixa: 'insumos@1', usuarioId: ana.s.usuario.id }));
    const morta = await entrar('ana');
    await encerrarSessao(morta.token, o());
    como(morta.token);
    await acaoAjudaFechar(form({ caixa: 'insumos@1' }));
    expect((await gravarPreferenciaDeAjuda(morta.token, { tipo: 'reabrir' }, o())).ok).toBe(false);
    expect(await linhas(ana.s.usuario.id)).toEqual(antes);
  });

  it('a preferência é da pessoa: vale nos dois parceiros; parceiro suspenso não impede de ajustar', async () => {
    const dois = await pessoa(A, 'dois');
    // vincula a mesma pessoa ao parceiro B (nível 1)
    const v = await criarAcesso(B, { nome: 'Pessoa dois', email: email('dois'), perfil: 'GERENTE', lojas: 'rede' }, 'Rodolfo', o());
    expect(v.ok).toBe(true);
    como(dois.token);
    await acaoAjudaDicas(form({ dicas: 'desligar' }));
    const noB = await entrar('dois', B);
    expect(noB.s.parceiro!.id).toBe(B);
    expect(noB.s.ajuda.dicasLigadas).toBe(false);
    const naA = await entrar('dois', A);
    expect(naA.s.ajuda.dicasLigadas).toBe(false);
    // suspende A: a pessoa ainda entra (só lê) e ainda ajusta a própria preferência
    const susp = await mudarStatusParceiro(A, 'SUSPENSO', 'prova da ajuda', 'Teste', db);
    expect(susp.ok).toBe(true);
    como(naA.token);
    await acaoAjudaDicas(form({ dicas: 'ligar' }));
    expect((await ver(naA.token)).dicasLigadas).toBe(true);
    await mudarStatusParceiro(A, 'ATIVO', '', 'Teste', db);
  });

  it('apagar a pessoa apaga a preferência (ON DELETE CASCADE)', async () => {
    const x = await pessoa(A, 'cascata');
    como(x.token);
    await acaoAjudaFechar(form({ caixa: 'lojas@2' }));
    expect(await linhas(x.s.usuario.id)).toHaveLength(1);
    await db.$executeRawUnsafe(`DELETE FROM "SessaoErp" WHERE "usuarioId" = $1`, x.s.usuario.id);
    await db.$executeRawUnsafe(`DELETE FROM "ConviteAcesso" WHERE "usuarioId" = $1`, x.s.usuario.id);
    await db.$executeRawUnsafe(`DELETE FROM "AcessoParceiro" WHERE "usuarioId" = $1`, x.s.usuario.id);
    await db.$executeRawUnsafe(`DELETE FROM "UsuarioErp" WHERE id = $1`, x.s.usuario.id);
    expect(await linhas(x.s.usuario.id)).toHaveLength(0);
  });

  it('o prisma do portal recusa a tabela; o papel erp_tenant não tem acesso a ela', async () => {
    const portal = travarTenant(new PrismaClient({ datasources: { db: { url: URL_TESTE } } }));
    await expect(portal.preferenciaErp.findMany()).rejects.toBeInstanceOf(ErroDeTenant);
    await expect(portal.preferenciaErp.create({ data: { usuarioId: 'x' } })).rejects.toBeInstanceOf(ErroDeTenant);
    if (perfil.rls) {
      const [g] = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM information_schema.role_table_grants WHERE grantee = 'erp_tenant' AND table_name = 'PreferenciaErp'`;
      expect(g.n).toBe(0);
    }
  });
});
