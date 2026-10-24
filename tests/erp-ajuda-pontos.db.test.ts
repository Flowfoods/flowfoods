/**
 * Pontos de ajuda (prioridade nº 1 de 23/10/2026) no Postgres de verdade:
 *
 * - o card abriu sozinho: grava o dia (o servidor decide o dia); "não mostrar
 *   novamente" grava x e uma aba antiga não o desfaz com um "visto";
 * - um item por ponto; ponto forjado/inexistente: recusado, nada grava;
 * - duas abas gravando pontos diferentes ao mesmo tempo: nenhum se perde;
 * - "Mostrar as dicas de novo" zera também os pontos; teto de 300 e CHECK no banco;
 * - a action não recebe quem é a pessoa; sem sessão, nada grava.
 *
 * (Cabeçalho e preparo iguais aos de tests/erp-ajuda.db.test.ts.)
 *
 * Antes — 0.6, a preferência de ajuda no Postgres de verdade:
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
  gravarItemDoPonto,
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
import { acaoAjudaDicas, acaoAjudaPontoNunca, acaoAjudaPontoVisto, acaoAjudaReabrir } from '@/app/erp/actions';
import { diaDe } from '@/lib/erp/ajuda-rota';
import { travarTenant } from '@/lib/db';
import { ErroDeTenant } from '@/lib/erp/tenant';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const SENHA = 'cozinha limpa 2026';

import { ENTRADAS as ENTRADAS_DA_AJUDA } from '@/lib/erp/ajuda-textos';
/** A versão de hoje do texto de Insumos: os testes não fixam um número (ele sobe quando o texto muda). */
const VI = ENTRADAS_DA_AJUDA.find((e) => e.chave === 'insumos')!.versao;
const CX = `insumos@${VI}`;

describe.skipIf(!URL_TESTE)('ERP · pontos de ajuda (Postgres real)', { timeout: 60_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const avisos = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const sufixo = `p${globalThis.crypto.randomUUID().slice(0, 8)}`;
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
      ['Pontos A', `pontos-a-${sufixo}`],
      ['Pontos B', `pontos-b-${sufixo}`],
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

  const pontosNoBanco = async (usuarioId: string) =>
    (await db.$queryRaw<{ pontos: string[] | null }[]>`SELECT "pontos" FROM "PreferenciaErp" WHERE "usuarioId" = ${usuarioId}`)[0]?.pontos ?? null;
  const hoje = () => diaDe(new Date());

  it('pessoa nova: nenhum ponto gravado (todos elegíveis)', async () => {
    expect(ana.s.ajuda.pontos).toEqual([]);
  });

  it('o card abriu sozinho: grava o dia de hoje (Brasília); de novo no mesmo dia não duplica', async () => {
    como(ana.token);
    await acaoAjudaPontoVisto('insumo-novo.marca');
    await acaoAjudaPontoVisto('insumo-novo.marca');
    expect(await pontosNoBanco(ana.s.usuario.id)).toEqual([`insumo-novo.marca=${hoje()}`]);
    expect((await ver(anaOutroAparelho.token)).pontos).toEqual([`insumo-novo.marca=${hoje()}`]);
    // a colega do mesmo parceiro não é afetada
    expect((await ver(bia.token)).pontos).toEqual([]);
  });

  it('"Não mostrar novamente" grava x; um "visto" de aba antiga não desfaz', async () => {
    como(ana.token);
    await acaoAjudaPontoNunca(form({ ponto: 'insumo-novo.marca' }));
    expect(await pontosNoBanco(ana.s.usuario.id)).toEqual(['insumo-novo.marca=x']);
    await acaoAjudaPontoVisto('insumo-novo.marca');
    expect(await pontosNoBanco(ana.s.usuario.id)).toEqual(['insumo-novo.marca=x']);
  });

  it('ponto forjado, inexistente, gigante ou com SQL: recusado e nada grava', async () => {
    como(bia.token);
    for (const p of ['insumo-novo.nao-existe', 'nada.marca', "insumo-novo.marca'; DROP TABLE \"PreferenciaErp\";--", 'x'.repeat(5000), '', 'insumo-novo.marca=x']) {
      expect(await gravarPreferenciaDeAjuda(bia.token, { tipo: 'ponto-visto', ponto: p }, o())).toEqual({ ok: false });
      expect(await gravarPreferenciaDeAjuda(bia.token, { tipo: 'ponto-nunca', ponto: p }, o())).toEqual({ ok: false });
    }
    expect(await pontosNoBanco(bia.s.usuario.id)).toBeNull();
  });

  it('usuarioId forjado no formulário é ignorado: só a pessoa da sessão muda', async () => {
    como(bia.token);
    await acaoAjudaPontoNunca(form({ ponto: 'ficha-nova.foto', usuarioId: ana.s.usuario.id }));
    expect(await pontosNoBanco(bia.s.usuario.id)).toEqual(['ficha-nova.foto=x']);
    expect(await pontosNoBanco(ana.s.usuario.id)).toEqual(['insumo-novo.marca=x']);
  });

  it('duas abas gravando pontos diferentes ao mesmo tempo: nenhum se perde', async () => {
    const pontos = ['insumo-novo.tipo', 'insumo-novo.conservacao', 'insumo-novo.prazo-abertura', 'insumo-novo.unidade', 'ficha-nova.tipo', 'ficha-nova.descricao', 'ficha-nova.rendimento', 'ficha-nova.etapas'];
    await Promise.all(pontos.map((p) => gravarPreferenciaDeAjuda(ana.token, { tipo: 'ponto-visto', ponto: p }, o())));
    const gravados = await pontosNoBanco(ana.s.usuario.id);
    for (const p of pontos) expect(gravados).toContain(`${p}=${hoje()}`);
    expect(gravados).toContain('insumo-novo.marca=x');
  });

  it('"Mostrar as dicas de novo" zera os pontos (inclusive os "não mostrar"), só da pessoa da sessão', async () => {
    como(ana.token);
    await acaoAjudaReabrir();
    expect(await pontosNoBanco(ana.s.usuario.id)).toEqual([]);
    expect(await pontosNoBanco(bia.s.usuario.id)).toEqual(['ficha-nova.foto=x']);
  });

  it('teto de 300 (o mais velho sai) e o CHECK do banco segura o resto', async () => {
    const id = ana.s.usuario.id;
    for (let i = 0; i < 305; i++) await gravarItemDoPonto(db, id, `t.p${i}=1`, new Date());
    const r = (await pontosNoBanco(id))!;
    expect(r).toHaveLength(300);
    expect(r[0]).toBe('t.p5=1');
    expect(r.at(-1)).toBe('t.p304=1');
    await expect(db.$executeRaw`UPDATE "PreferenciaErp" SET "pontos" = array_fill('a.b=1'::text, ARRAY[301]) WHERE "usuarioId" = ${id}`).rejects.toThrow(/PreferenciaErp_pontos_limite/);
    await expect(db.$executeRaw`UPDATE "PreferenciaErp" SET "pontos" = ARRAY[repeat('a', 121)] WHERE "usuarioId" = ${id}`).rejects.toThrow(/PreferenciaErp_pontos_limite/);
    // lixo no banco não chega à tela: a leitura saneia
    await db.$executeRaw`UPDATE "PreferenciaErp" SET "pontos" = ARRAY['lixo', 'insumo-novo.marca=3', 'insumo-novo.marca=x'] WHERE "usuarioId" = ${id}`;
    expect((await ver(ana.token)).pontos).toEqual(['insumo-novo.marca=x']);
  });

  it('dicas desligadas não impedem gravar "não mostrar" (a ajuda manual segue)', async () => {
    como(bia.token);
    await acaoAjudaDicas(form({ dicas: 'desligar' }));
    await acaoAjudaPontoNunca(form({ ponto: 'insumo-novo.tipo' }));
    expect(await pontosNoBanco(bia.s.usuario.id)).toContain('insumo-novo.tipo=x');
  });

  it('sem cookie, com lixo ou com sessão encerrada: nada grava', async () => {
    const antes = await pontosNoBanco(bia.s.usuario.id);
    for (const t of [undefined, 'lixo', 'a'.repeat(64)]) {
      como(t);
      await acaoAjudaPontoNunca(form({ ponto: 'insumo-novo.unidade' }));
      await acaoAjudaPontoVisto('insumo-novo.unidade');
    }
    const fim = await entrar('bia');
    await encerrarSessao(fim.token, o());
    como(fim.token);
    await acaoAjudaPontoNunca(form({ ponto: 'insumo-novo.unidade' }));
    expect(await pontosNoBanco(bia.s.usuario.id)).toEqual(antes);
  });

  it('o papel erp_tenant continua sem acesso à tabela (coluna nova inclusa)', async () => {
    const [r] = await db.$queryRaw<{ existe: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') AS existe`;
    if (r.existe) {
      const [g] = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM information_schema.role_column_grants WHERE grantee = 'erp_tenant' AND table_name = 'PreferenciaErp'`;
      expect(g.n).toBe(0);
    }
  });
});
