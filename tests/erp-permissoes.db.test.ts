/**
 * ERP 0.4 — permissões no Postgres de verdade: o nível 1 cria o dono; o dono
 * cria perfil próprio e pessoas com loja restrita; o operador não cadastra
 * insumo nem chamando a server action direto; gerente da loja X não vê a loja
 * Y; sem escalada; último administrador (inclusive com dois tirando um ao
 * outro ao mesmo tempo); a mesma pessoa em dois parceiros com perfis
 * diferentes; o parceiro vem da sessão; o nível 1 continua vendo tudo; o banco
 * segura as regras (CHECK e FK composta); liberar tentativas.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-permissoes.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ContextoDaPessoa } from '@/lib/erp/contexto-base';

// A action de verdade (src/app/erp/actions.ts), com o contexto da sessão
// apontado para o banco de teste: o que a action decide é o que vale.
const atual = vi.hoisted(() => ({ ctx: null as null | (() => unknown) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
// Sucesso das actions de insumo termina num redirect para o detalhe.
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`REDIRECT ${url}`), { url });
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
// Cookie, cabeçalhos e endereço do site são do Next (fora de requisição não existem).
vi.mock('@/lib/erp/sessao', () => ({
  aparelhoAtual: () => 'Teste',
  linkDePrimeiroAcesso: (t: string) => `http://teste/entrar/primeiro-acesso/${t}`,
}));
vi.mock('@/lib/erp/contexto', async () => {
  const { recusaDaAcao, exigirPermissao, pode } = await import('@/lib/erp/permissoes');
  return {
    exigirParceiroDaSessao: async () => atual.ctx!(),
    exigirPessoa: async () => (atual.ctx!() as ContextoDaPessoa).pessoa,
    recusaDaAcao,
    exigirPermissao,
    pode,
  };
});

import {
  atualizarAcesso,
  concluirRegistroDeRosto,
  consultarLink,
  entrarComRosto,
  iniciarEntradaComRosto,
  iniciarRegistroDeRosto,
  listarRostos,
  criarAcesso,
  ERRO_EMAIL_NEUTRO,
  ERRO_SEM_GESTAO,
  parceirosSemAdministrador,
  definirSenhaPeloLink,
  entrarComSenha,
  ERRO_ACIMA_DE_VOCE,
  ERRO_LINK_OUTRO_PARCEIRO,
  ERRO_ULTIMO_ADMIN,
  escolherParceiro,
  excluirPerfil,
  gerarNovoLink,
  liberarEntrada,
  listarAcessos,
  listarPerfis,
  mudarStatusDoAcesso,
  salvarPerfil,
  validarSessao,
  type Ator,
  type SessaoValida,
} from '@/lib/erp/credenciais';
import { contextoDaSessao } from '@/lib/erp/contexto-base';
import { cadastrarLoja, listarEstrutura, listarLojasDoAlcance } from '@/lib/erp/estrutura';
import { listarHistorico } from '@/lib/erp/historico';
import { cadastrarInsumo } from '@/lib/erp/insumos';
import { criarParceiro } from '@/lib/erp/parceiros';
import { ALCANCE_FLOWFOODS, pode, recusa, TODAS_AS_PERMISSOES, PERFIS_BASE } from '@/lib/erp/permissoes';
import { doParceiro } from '@/lib/erp/tenant';
import { acaoCadastrarLojaDaSessao } from '@/app/erp/actions';
import { acaoCadastrarInsumo as acaoCadastrarInsumoDaSessao } from '@/app/erp/insumos/actions';
import { acaoCriarPessoa } from '@/app/erp/equipe/actions';
import { configDoRosto } from '@/lib/erp/rosto';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';
import { criarAutenticador } from './erp-autenticador-sintetico';

const URL_TESTE = process.env.ERP_DB_TESTE;
const SENHA = 'cozinha limpa 2026';

describe.skipIf(!URL_TESTE)('ERP 0.4 · permissões (Postgres real)', { timeout: 60_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const avisos = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const sufixo = `p${globalThis.crypto.randomUUID().slice(0, 8)}`;
  const email = (n: string) => `${n}.${sufixo}@teste.flow`;
  const ip = () => `10.4.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}-${sufixo}`;
  const o = () => ({ base: db });
  const ids: string[] = [];
  let A: string;
  let B: string;
  let X: string; // loja Penha (A)
  let Y: string; // loja Méier (A)
  let Z: string; // loja de B

  /** Cria o acesso (nível 1 ou um ator), usa o link e devolve a sessão aberta. */
  async function pessoa(
    parceiroId: string,
    apelido: string,
    campos: Record<string, unknown>,
    quem: Ator | string = 'Rodolfo',
  ) {
    const r = await criarAcesso(parceiroId, { nome: `Pessoa ${apelido}`, email: email(apelido), ...campos }, quem, o());
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

  const ator = (s: SessaoValida): Ator => ({ nome: s.usuario.nome, alcance: s.alcance!, acessoId: s.acessoId });
  const ctxDe = (s: SessaoValida) =>
    contextoDaSessao(s as SessaoValida & { parceiro: NonNullable<SessaoValida['parceiro']> }, db);
  const form = (campos: Record<string, string | string[]>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) for (const x of [v].flat()) f.append(k, x);
    return f;
  };

  let dono: { token: string; s: SessaoValida };
  let operador: { token: string; s: SessaoValida };
  let perfilCozinha: string;

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    for (const [nome, slug] of [
      ['Perm A', `perm-a-${sufixo}`],
      ['Perm B', `perm-b-${sufixo}`],
    ]) {
      const p = await criarParceiro({ nome, slug, status: 'ATIVO' }, 'Teste', db);
      if (!p.ok) throw new Error('setup parceiro');
      ids.push(p.id);
    }
    [A, B] = ids;
    const lx = await cadastrarLoja(doParceiro(A, db), { nome: 'Penha' }, 'Teste');
    const ly = await cadastrarLoja(doParceiro(A, db), { nome: 'Méier' }, 'Teste');
    const lz = await cadastrarLoja(doParceiro(B, db), { nome: 'Tijuca' }, 'Teste');
    if (!lx.ok || !ly.ok || !lz.ok) throw new Error('setup lojas');
    [X, Y, Z] = [lx.id, ly.id, lz.id];
    await cadastrarInsumo(doParceiro(A, db), { nome: 'Pão', unidade: 'UN', conteudo: '12', preco: '18,00' });
  });

  afterAll(async () => {
    avisos.mockRestore();
    if (!db) return;
    const usuarios = (
      await db.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM "UsuarioErp" WHERE email LIKE $1`,
        `%.${sufixo}@teste.flow`,
      )
    ).map((u) => u.id);
    await db.$executeRawUnsafe(
      `DELETE FROM "TentativaEntradaErp" WHERE email LIKE $1 OR ip LIKE $2`,
      `%${sufixo}%`,
      `%-${sufixo}`,
    );
    await db.$executeRawUnsafe(`DELETE FROM "SessaoErp" WHERE "usuarioId" = ANY($1)`, usuarios);
    await db.$executeRawUnsafe(`DELETE FROM "ConviteAcesso" WHERE "usuarioId" = ANY($1)`, usuarios);
    await db.$executeRawUnsafe(`DELETE FROM "AcessoParceiro" WHERE "usuarioId" = ANY($1)`, usuarios);
    await db.$executeRawUnsafe(`DELETE FROM "PerfilAcesso" WHERE "parceiroId" = ANY($1)`, ids);
    await db.$executeRawUnsafe(`DELETE FROM "UsuarioErp" WHERE id = ANY($1)`, usuarios);
    await limparParceiros(db, perfil, ids);
    await db.$disconnect();
  });

  // ------------------------------------------------------------ o fluxo

  it('nível 1 cria o acesso do dono: entra com tudo e a rede inteira', async () => {
    dono = await pessoa(A, 'dono', { perfil: 'DONO', setores: ['GERENCIA'] });
    const a = dono.s.alcance!;
    expect(dono.s.perfilRotulo).toBe('Dono');
    expect(a.nivel).toBe('REDE');
    expect(a.lojas).toBe('todas');
    expect(TODAS_AS_PERMISSOES.every((p) => a.permissoes.has(p))).toBe(true);
  });

  it('dono cria perfil próprio (copiando o operador) e a pessoa operadora só da loja Penha', async () => {
    const permissoes = PERFIS_BASE.OPERADOR.permissoes.filter((p) => p !== 'producao.registrar');
    const p = await salvarPerfil(
      A,
      { nome: 'Cozinha', base: 'OPERADOR', permissoes, setores: ['COZINHA'] },
      ator(dono.s),
      o(),
    );
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    perfilCozinha = p.id;

    operador = await pessoa(
      A,
      'operador',
      { perfil: `p:${p.id}`, lojas: 'escolhidas', lojaIds: [X], setores: ['COZINHA'] },
      ator(dono.s),
    );
    const a = operador.s.alcance!;
    expect(operador.s.perfilRotulo).toBe('Cozinha');
    expect(a.nivel).toBe('LOJA');
    expect(a.lojas).toEqual([X]);
    expect(a.permissoes.has('insumos.ver')).toBe(true);
    expect(a.permissoes.has('insumos.editar')).toBe(false);
    expect(a.permissoes.has('producao.registrar')).toBe(false);

    const linhas = await listarAcessos(A, o());
    const op = linhas.find((l) => l.email === email('operador'))!;
    expect(op.setores).toEqual(['COZINHA']);
    expect(op.perfilRotulo).toBe('Cozinha');
    expect((await listarPerfis(A, o()))[0]).toMatchObject({ nome: 'Cozinha', pessoas: 1 });
  });

  it('operador NÃO cadastra insumo pelo servidor, mesmo chamando a action direto (e o dono cadastra)', async () => {
    const antes = await doParceiro(A, db).insumo.count();
    atual.ctx = () => ctxDe(operador.s);
    const r = await acaoCadastrarInsumoDaSessao(
      null,
      form({ nome: 'Furando', unidade: 'KG', conteudo: '1', preco: '1,00' }),
    );
    expect(r?.ok).toBe(false);
    expect(r && !r.ok && r.erros.geral).toMatch(/cadastrar e editar insumos/);
    const loja = await acaoCadastrarLojaDaSessao(null, form({ nome: 'Loja pirata' }));
    expect(loja?.ok).toBe(false);
    const equipe = await acaoCriarPessoa(null, form({ nome: 'Intruso', email: email('intruso'), perfil: 'DONO' }));
    expect(equipe?.ok).toBe(false);
    expect(await doParceiro(A, db).insumo.count()).toBe(antes);
    expect(await doParceiro(A, db).loja.count()).toBe(2);

    atual.ctx = () => ctxDe(dono.s);
    await expect(
      acaoCadastrarInsumoDaSessao(null, form({ nome: 'Pelo dono', unidade: 'KG', conteudo: '1', preco: '1,00' })),
    ).rejects.toThrow(/^REDIRECT \/erp\/insumos\/\w+\?feito=criado$/);
    expect(await doParceiro(A, db).insumo.count()).toBe(antes + 1);
  });

  it('gerente da loja Penha não vê a loja Méier (lista, consulta e checagem por loja)', async () => {
    const g = await pessoa(A, 'gerente', { perfil: 'GERENTE', lojas: 'escolhidas', lojaIds: [X] }, ator(dono.s));
    const ctx = ctxDe(g.s);
    const { lojas } = await listarEstrutura(ctx.cliente, ctx.alcance);
    expect(lojas.map((l) => l.nome)).toEqual(['Penha']);
    expect((await listarLojasDoAlcance(ctx.cliente, ctx.alcance)).map((l) => l.id)).toEqual([X]);
    expect(pode(ctx.alcance, 'estoque.contar', { lojaId: X })).toBe(true);
    expect(recusa(ctx.alcance, 'estoque.contar', { lojaId: Y })).toBe('Essa loja não está no seu acesso.');
    // Cadastrar loja é da rede: gerente de unidade não cadastra.
    expect(pode(ctx.alcance, 'lojas.gerir')).toBe(false);
    // O dono (rede inteira) vê as duas.
    const d = ctxDe(dono.s);
    expect((await listarEstrutura(d.cliente, d.alcance)).lojas.map((l) => l.nome).sort()).toEqual(['Méier', 'Penha']);
  });

  it('sem escalada: quem cuida da equipe só da Penha não dá rede, outra loja, nem o que não tem', async () => {
    const la = await pessoa(
      A,
      'adminloja',
      { perfil: 'GERENTE', extras: ['acessos.gerir'], lojas: 'escolhidas', lojaIds: [X] },
      ator(dono.s),
    );
    const eu = ator(la.s);
    expect(eu.alcance.permissoes.has('acessos.gerir')).toBe(true);

    const base = { nome: 'Nova', email: email('nova') };
    const rede = await criarAcesso(A, { ...base, perfil: 'OPERADOR' }, eu, o());
    expect(rede.ok || rede.erros.geral).toMatch(/rede inteira/);
    const outra = await criarAcesso(A, { ...base, perfil: 'OPERADOR', lojas: 'escolhidas', lojaIds: [Y] }, eu, o());
    expect(outra.ok || outra.erros.geral).toMatch(/loja fora do seu acesso/);
    const acima = await criarAcesso(A, { ...base, perfil: 'DONO', lojas: 'escolhidas', lojaIds: [X] }, eu, o());
    expect(acima.ok || acima.erros.geral).toMatch(/não pode dar o que não tem/);
    const certo = await criarAcesso(A, { ...base, perfil: 'OPERADOR', lojas: 'escolhidas', lojaIds: [X] }, eu, o());
    expect(certo.ok).toBe(true);

    // Não mexe em quem está acima (o dono), nem dá a mais o que não tem.
    expect(await mudarStatusDoAcesso(A, dono.s.acessoId!, 'DESATIVADO', eu, o())).toEqual({
      ok: false,
      erro: ERRO_ACIMA_DE_VOCE,
    });
    const nova = (await listarAcessos(A, o())).find((l) => l.email === email('nova'))!;
    const extra = await atualizarAcesso(
      A,
      nova.acessoId,
      { perfil: 'OPERADOR', lojas: 'escolhidas', lojaIds: [X], extras: ['precos.editar'] },
      eu,
      o(),
    );
    expect(extra.ok).toBe(false);
    // Perfil é coisa da rede.
    const perfilLoja = await salvarPerfil(A, { nome: 'Caixa', base: 'OPERADOR', permissoes: ['insumos.ver'] }, eu, o());
    expect(perfilLoja.ok || perfilLoja.erros.geral).toMatch(/rede inteira/);
    // E link de senha só de quem está só neste parceiro (a nova está).
    expect((await gerarNovoLink(A, nova.acessoId, eu, o())).ok).toBe(true);
  });

  it('último administrador: ninguém deixa o parceiro sem quem cuide da equipe (nem o nível 1)', async () => {
    const id = dono.s.acessoId!;
    expect(await mudarStatusDoAcesso(A, id, 'DESATIVADO', 'Rodolfo', o())).toEqual({
      ok: false,
      erro: ERRO_ULTIMO_ADMIN,
    });
    const rebaixa = await atualizarAcesso(A, id, { perfil: 'GERENTE' }, ator(dono.s), o());
    expect(rebaixa.ok || rebaixa.erros.geral).toBe(ERRO_ULTIMO_ADMIN);
    const tiraLojas = await atualizarAcesso(
      A,
      id,
      { perfil: 'DONO', lojas: 'escolhidas', lojaIds: [X] },
      ator(dono.s),
      o(),
    );
    expect(tiraLojas.ok || tiraLojas.erros.geral).toBe(ERRO_ULTIMO_ADMIN);
    const proprio = await mudarStatusDoAcesso(A, id, 'DESATIVADO', ator(dono.s), o());
    expect(proprio.ok).toBe(false);
    expect((await listarAcessos(A, o())).find((l) => l.acessoId === id)!.administrador).toBe(true);
  });

  it('dois administradores tirando um ao outro ao mesmo tempo: um só consegue', async () => {
    const socio = await pessoa(A, 'socio', { perfil: 'DONO' }, ator(dono.s));
    const [r1, r2] = await Promise.all([
      mudarStatusDoAcesso(A, socio.s.acessoId!, 'DESATIVADO', ator(dono.s), o()),
      mudarStatusDoAcesso(A, dono.s.acessoId!, 'DESATIVADO', ator(socio.s), o()),
    ]);
    expect([r1.ok, r2.ok].filter(Boolean)).toHaveLength(1);
    expect((await listarAcessos(A, o())).filter((l) => l.administrador)).toHaveLength(1);
    // Volta ao estado: quem ficou reativa o outro (pelo nível 1, para o teste seguir com os dois).
    const caiu = r1.ok ? socio.s.acessoId! : dono.s.acessoId!;
    expect((await mudarStatusDoAcesso(A, caiu, 'ATIVO', 'Rodolfo', o())).ok).toBe(true);
    dono = await entrar('dono');
  });

  it('a mesma pessoa em dois parceiros: dona em A, operadora só da Tijuca em B', async () => {
    await pessoa(A, 'consultora', { perfil: 'DONO' });
    const emB = await criarAcesso(
      B,
      { nome: 'Outro nome', email: email('consultora'), perfil: 'OPERADOR', lojas: 'escolhidas', lojaIds: [Z] },
      'Rodolfo',
      o(),
    );
    expect(emB.ok && emB.link).toBe(null); // já tem senha: só ganha o vínculo

    const emA = await entrar('consultora', A);
    expect(emA.s.perfilRotulo).toBe('Dono');
    expect(emA.s.alcance!.permissoes.has('insumos.editar')).toBe(true);
    expect(emA.s.alcance!.lojas).toBe('todas');

    const r = await entrarComSenha({ email: email('consultora'), senha: SENHA, ip: ip() }, o());
    if (!r.ok) throw new Error();
    expect(r.escolher).toBe(true);
    expect(await escolherParceiro(r.token, B, o())).toBe(true);
    const sB = (await validarSessao(r.token, o()))!;
    expect(sB.parceiro!.id).toBe(B);
    expect(sB.perfilRotulo).toBe('Operador');
    expect(sB.alcance!.permissoes.has('insumos.editar')).toBe(false);
    expect(sB.alcance!.lojas).toEqual([Z]);
    const ctxB = ctxDe(sB);
    expect(ctxB.cliente.parceiroId).toBe(B);
    expect((await listarEstrutura(ctxB.cliente, ctxB.alcance)).lojas.map((l) => l.nome)).toEqual(['Tijuca']);

    // A senha vale nos dois: o dono de A não gera link para ela; o nível 1 gera.
    const linhaA = (await listarAcessos(A, o())).find((l) => l.email === email('consultora'))!;
    expect(linhaA.emOutroParceiro).toBe(true);
    expect(await gerarNovoLink(A, linhaA.acessoId, ator(dono.s), o())).toEqual({
      ok: false,
      erro: ERRO_LINK_OUTRO_PARCEIRO,
    });
    expect((await gerarNovoLink(A, linhaA.acessoId, 'Rodolfo', o())).ok).toBe(true);
  });

  it('o parceiro vem da sessão e a pessoa precisa pertencer a ele', async () => {
    // Escolher parceiro sem vínculo: recusado.
    expect(await escolherParceiro(operador.token, B, o())).toBe(false);
    // Sessão adulterada no banco para outro parceiro: morre na próxima requisição.
    const s = await entrar('operador');
    await db.$executeRawUnsafe(`UPDATE "SessaoErp" SET "parceiroId" = $1 WHERE id = $2`, B, s.s.sessaoId);
    expect(await validarSessao(s.token, o())).toBeNull();
    // Mudança de acesso vale na próxima requisição (permissões resolvidas a cada uma).
    const op = (await listarAcessos(A, o())).find((l) => l.email === email('operador'))!;
    const r = await atualizarAcesso(
      A,
      op.acessoId,
      { perfil: `p:${perfilCozinha}`, lojas: 'escolhidas', lojaIds: [X], extras: ['insumos.editar'] },
      ator(dono.s),
      o(),
    );
    expect(r.ok).toBe(true);
    expect((await validarSessao(operador.token, o()))!.alcance!.permissoes.has('insumos.editar')).toBe(true);
  });

  it('nível 1 continua vendo e mudando tudo, em qualquer parceiro', async () => {
    const n1 = { alcance: ALCANCE_FLOWFOODS };
    expect(TODAS_AS_PERMISSOES.every((p) => pode(n1.alcance, p, { lojaId: Y }))).toBe(true);
    expect((await listarEstrutura(doParceiro(A, db), ALCANCE_FLOWFOODS)).lojas).toHaveLength(2);
    expect((await listarEstrutura(doParceiro(B, db), ALCANCE_FLOWFOODS)).lojas).toHaveLength(1);
    const g = (await listarAcessos(A, o())).find((l) => l.email === email('gerente'))!;
    const r = await atualizarAcesso(
      A,
      g.acessoId,
      { perfil: 'GERENTE', lojas: 'escolhidas', lojaIds: [X, Y] },
      'Rodolfo',
      o(),
    );
    expect(r.ok).toBe(true);
    expect((await listarAcessos(A, o())).find((l) => l.email === email('gerente'))!.lojaIds.sort()).toEqual(
      [X, Y].sort(),
    );
  });

  it('toda mudança fica no histórico com antes e depois, em nomes legíveis', async () => {
    const h = await listarHistorico(doParceiro(A, db), { entidades: ['AcessoParceiro', 'PerfilAcesso'], limite: 100, verPrecos: true });
    const perfilCriado = h.find((x) => x.entidade === 'PerfilAcesso' && x.acao === 'CRIOU')!;
    expect(perfilCriado.autorNome).toBe('Pessoa dono');
    expect(perfilCriado.mudancas.find((m) => m.campo === 'nome')?.depois).toBe('Cozinha');
    const alterou = h.find((x) => x.acao === 'ALTEROU' && x.mudancas.some((m) => m.campo === 'lojas'))!;
    expect(alterou.autorNome).toBe('Rodolfo');
    expect(alterou.mudancas.find((m) => m.campo === 'lojas')).toEqual({
      campo: 'lojas',
      antes: 'Penha',
      depois: 'Méier, Penha',
    });
    const criouOperador = h.find((x) => x.acao === 'CRIOU' && x.mudancas.some((m) => m.depois === 'Pessoa operador'))!;
    expect(criouOperador.mudancas.find((m) => m.campo === 'perfil')?.depois).toBe('Cozinha');
  });

  it('o banco também segura: um perfil só, rede × lojas, perfil de outro parceiro', async () => {
    const id = dono.s.acessoId!;
    await expect(
      db.$executeRawUnsafe(`UPDATE "AcessoParceiro" SET "perfilBase" = NULL WHERE id = $1`, id),
    ).rejects.toThrow(/um_perfil/);
    await expect(
      db.$executeRawUnsafe(`UPDATE "AcessoParceiro" SET "lojaIds" = ARRAY[$2] WHERE id = $1`, id, X),
    ).rejects.toThrow(/AcessoParceiro_lojas/);
    await expect(
      db.$executeRawUnsafe(`UPDATE "AcessoParceiro" SET "redeInteira" = false, "lojaIds" = '{}' WHERE id = $1`, id),
    ).rejects.toThrow(/AcessoParceiro_lojas/);
    const deB = await salvarPerfil(
      B,
      { nome: 'Perfil de B', base: 'OPERADOR', permissoes: ['insumos.ver'] },
      'Rodolfo',
      o(),
    );
    if (!deB.ok) throw new Error();
    await expect(
      db.$executeRawUnsafe(
        `UPDATE "AcessoParceiro" SET "perfilBase" = NULL, "perfilId" = $2 WHERE id = $1`,
        id,
        deB.id,
      ),
    ).rejects.toThrow(/foreign key|perfilId_fkey/i);
    // E pela regra: perfil de B escolhido para alguém de A não existe aqui.
    const r = await atualizarAcesso(A, id, { perfil: `p:${deB.id}` }, 'Rodolfo', o());
    expect(r.ok || r.erros.perfil).toMatch(/não existe mais neste parceiro/);
  });

  it('perfil em uso não é excluído; sem uso, sai (com histórico)', async () => {
    const usado = await excluirPerfil(A, perfilCozinha, ator(dono.s), o());
    expect(usado.ok || usado.erro).toMatch(/usa esse perfil|usam esse perfil/);
    const solto = await salvarPerfil(
      A,
      { nome: 'Temporário', base: 'GERENTE', permissoes: ['insumos.ver'] },
      ator(dono.s),
      o(),
    );
    if (!solto.ok) throw new Error();
    expect((await excluirPerfil(A, solto.id, ator(dono.s), o())).ok).toBe(true);
    const h = await listarHistorico(doParceiro(A, db), { entidade: 'PerfilAcesso', verPrecos: true });
    expect(h.some((x) => x.acao === 'EXCLUIU')).toBe(true);
  });

  it('nível 1 libera o e-mail travado pelo limite de tentativas', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await entrarComSenha({ email: email('gerente'), senha: 'senha errada mesmo', ip: ip() }, o());
      expect(r.ok).toBe(false);
    }
    const travado = await entrarComSenha({ email: email('gerente'), senha: SENHA, ip: ip() }, o());
    expect(travado.ok || travado.bloqueado).toBe(true);
    const linha = (await listarAcessos(A, o())).find((l) => l.email === email('gerente'))!;
    expect(linha.bloqueada).toBe(true);
    expect((await liberarEntrada(A, linha.acessoId, 'Rodolfo', o())).ok).toBe(true);
    expect((await entrarComSenha({ email: email('gerente'), senha: SENHA, ip: ip() }, o())).ok).toBe(true);
    const h = await listarHistorico(doParceiro(A, db), { entidade: 'AcessoParceiro', verPrecos: true });
    expect(h.some((x) => x.acao === 'LIBEROU_ENTRADA')).toBe(true);
  });

  // ------------------------------------------- revisão da 0.4 (Guardião)

  it('tomada de conta entre parceiros (sequência do Guardião): o link do dono de A morre quando a vítima ganha B', async () => {
    // Vítima só em A, com senha (link do nível 1).
    await pessoa(A, 'vitima', { perfil: 'OPERADOR' });
    const v = (await listarAcessos(A, o())).find((l) => l.email === email('vitima'))!;
    // (1) dono de A gera link de senha para a vítima (ela só está em A: passa).
    const l = await gerarNovoLink(A, v.acessoId, ator(dono.s), o());
    expect(l.ok).toBe(true);
    if (!l.ok) return;
    expect((await consultarLink(l.token, o())).valido).toBe(true);
    // (2) nível 1 põe a vítima em B como dona (já tem senha: nenhum link novo).
    const emB = await criarAcesso(B, { nome: 'Vítima', email: email('vitima'), perfil: 'DONO' }, 'Rodolfo', o());
    expect(emB.ok && emB.link).toBe(null);
    expect(emB.ok && emB.mensagem).toMatch(/Atenção: esse e-mail já tem senha/);
    // (3) dono de A tenta usar o link: não vale mais (revogado ao ganhar B).
    expect((await consultarLink(l.token, o())).valido).toBe(false);
    const usar = await definirSenhaPeloLink(l.token, 'senha do atacante 99', 'senha do atacante 99', o());
    expect(usar.ok).toBe(false);
    // E mesmo que a revogação falhasse, o uso reconfere: link de parceiro + vínculo em outro = recusado.
    await db.$executeRawUnsafe(`UPDATE "ConviteAcesso" SET "revogadoEm" = NULL WHERE "tokenHash" = encode(sha256($1::bytea), 'hex')`, l.token);
    expect((await consultarLink(l.token, o())).valido).toBe(false);
    expect((await definirSenhaPeloLink(l.token, 'senha do atacante 99', 'senha do atacante 99', o())).ok).toBe(false);
    expect((await entrarComSenha({ email: email('vitima'), senha: 'senha do atacante 99', ip: ip() }, o())).ok).toBe(false);
    expect((await entrarComSenha({ email: email('vitima'), senha: SENHA, ip: ip() }, o())).ok).toBe(true);
  });

  it('senha criada por link do dono de A não atravessa para B: apagada, sessões derrubadas, link novo do nível 1', async () => {
    await pessoa(A, 'alvo', { perfil: 'OPERADOR' });
    const v = (await listarAcessos(A, o())).find((l) => l.email === email('alvo'))!;
    const l = await gerarNovoLink(A, v.acessoId, ator(dono.s), o());
    if (!l.ok) throw new Error();
    // O dono de A usa o link ANTES de a pessoa ganhar B (permitido: ela só estava em A).
    expect((await definirSenhaPeloLink(l.token, 'senha do dono de a', 'senha do dono de a', o())).ok).toBe(true);
    const sessaoDoDono = await entrarComSenha({ email: email('alvo'), senha: 'senha do dono de a', ip: ip() }, o());
    if (!sessaoDoDono.ok) throw new Error();
    // Nível 1 põe a pessoa em B: a senha "do parceiro A" não vale para B.
    const emB = await criarAcesso(B, { nome: 'Alvo', email: email('alvo'), perfil: 'DONO' }, 'Rodolfo', o());
    expect(emB.ok).toBe(true);
    if (!emB.ok) return;
    expect(emB.link).not.toBeNull();
    expect(emB.mensagem).toMatch(/criada por link de outro parceiro/);
    expect(await validarSessao(sessaoDoDono.token, o())).toBeNull();
    expect((await entrarComSenha({ email: email('alvo'), senha: 'senha do dono de a', ip: ip() }, o())).ok).toBe(false);
    // O link do nível 1 vale e a nova senha entra nos dois.
    expect((await definirSenhaPeloLink(emB.link!.token, SENHA, SENHA, o())).ok).toBe(true);
    const r = await entrarComSenha({ email: email('alvo'), senha: SENHA, ip: ip() }, o());
    expect(r.ok && r.escolher).toBe(true);
  });

  it('e-mail que já está em outro parceiro: só o nível 1 vincula; a pessoa do parceiro recebe frase neutra', async () => {
    const outro = await criarAcesso(A, { nome: 'Qualquer', email: email('consultora'), perfil: 'OPERADOR' }, ator(dono.s), o());
    // consultora já está em A; testa com alguém só de B.
    expect(outro.ok).toBe(false);
    await pessoa(B, 'sobdeb', { perfil: 'OPERADOR', lojas: 'escolhidas', lojaIds: [Z] });
    const r = await criarAcesso(A, { nome: 'Fulano', email: email('sobdeb'), perfil: 'OPERADOR' }, ator(dono.s), o());
    expect(r).toEqual({ ok: false, erros: { email: ERRO_EMAIL_NEUTRO } });
    // Nem a pessoa nem o vínculo mudaram.
    expect((await listarAcessos(A, o())).some((l) => l.email === email('sobdeb'))).toBe(false);
  });

  it('as funções de equipe conferem o ator no banco: alcance forjado, vínculo de outro parceiro, sem "cuidar da equipe"', async () => {
    const forjado: Ator = { nome: 'Forjado', alcance: ALCANCE_FLOWFOODS, acessoId: operador.s.acessoId };
    const r1 = await criarAcesso(A, { nome: 'Xis Forjado', email: email('x1'), perfil: 'DONO' }, forjado, o());
    expect(r1).toEqual({ ok: false, erros: { geral: ERRO_SEM_GESTAO } });
    const deB: Ator = { ...ator(dono.s), acessoId: (await listarAcessos(B, o()))[0].acessoId };
    expect((await mudarStatusDoAcesso(A, operador.s.acessoId!, 'DESATIVADO', deB, o())).ok).toBe(false);
    const semVinculo: Ator = { nome: 'Sem', alcance: { ...ALCANCE_FLOWFOODS, nivel: 'REDE' }, acessoId: null };
    const p = await salvarPerfil(A, { nome: 'Forjado', base: 'DONO', permissoes: ['insumos.ver'] }, semVinculo, o());
    expect(p.ok || p.erros.geral).toBe(ERRO_SEM_GESTAO);
    expect((await liberarEntrada(A, operador.s.acessoId!, ator(dono.s), o())).ok).toBe(false);
  });

  it('perfil próprio não rebaixa nem sobe quem está acima de quem edita', async () => {
    const gestor = await pessoa(A, 'gestor', { perfil: 'GERENTE', extras: ['acessos.gerir'] }, ator(dono.s));
    const caixa = await salvarPerfil(A, { nome: 'Caixa', base: 'OPERADOR', permissoes: ['insumos.ver', 'lojas.ver'] }, ator(dono.s), o());
    if (!caixa.ok) throw new Error();
    // Usuária do perfil com um extra que o gestor não tem (dado pelo dono).
    await pessoa(A, 'caixa', { perfil: `p:${caixa.id}`, extras: ['precos.editar'] }, ator(dono.s));
    const mexe = await salvarPerfil(
      A,
      { id: caixa.id, nome: 'Caixa', base: 'OPERADOR', permissoes: ['insumos.ver'] },
      ator(gestor.s),
      o(),
    );
    expect(mexe.ok || mexe.erros.geral).toMatch(/Quem usa esse perfil tem acesso maior que o seu/);
    // O dono (cobre todo mundo) muda.
    const dono2 = await salvarPerfil(A, { id: caixa.id, nome: 'Caixa', base: 'OPERADOR', permissoes: ['insumos.ver'] }, ator(dono.s), o());
    expect(dono2.ok).toBe(true);
  });

  it('nível 1 vê os parceiros com pessoas ativas e ninguém cuidando da equipe', async () => {
    const c = await criarParceiro({ nome: 'Perm C', slug: `perm-c-${sufixo}`, status: 'ATIVO' }, 'Teste', db);
    if (!c.ok) throw new Error();
    ids.push(c.id);
    expect((await parceirosSemAdministrador(o())).has(c.id)).toBe(false); // ninguém ainda
    await criarAcesso(c.id, { nome: 'Só gerente', email: email('sogerente'), perfil: 'GERENTE' }, 'Rodolfo', o());
    const sem = await parceirosSemAdministrador(o());
    expect(sem.has(c.id)).toBe(true);
    expect(sem.has(A)).toBe(false);
  });

  it('Guardião, volta 2: rosto ativado com a senha do link de parceiro também não atravessa para B', async () => {
    const rosto = configDoRosto({ NEXTAUTH_URL: 'http://localhost:3100' });
    const comRosto = () => ({ ...o(), rosto });
    await pessoa(A, 'xis', { perfil: 'OPERADOR' });
    const v = (await listarAcessos(A, o())).find((l) => l.email === email('xis'))!;
    // Dono de A define a senha de xis pelo link de parceiro e entra como xis.
    const l = await gerarNovoLink(A, v.acessoId, ator(dono.s), o());
    if (!l.ok) throw new Error();
    expect((await definirSenhaPeloLink(l.token, 'senha do dono de a', 'senha do dono de a', o())).ok).toBe(true);
    const e = await entrarComSenha({ email: email('xis'), senha: 'senha do dono de a', ip: ip() }, o());
    if (!e.ok) throw new Error();
    const s = (await validarSessao(e.token, o()))!;
    // ...e ativa o rosto (dentro dos 30 min), deixando ainda um desafio de registro pendente.
    const aut = criarAutenticador({ rpID: rosto.rpID, origin: rosto.origin, userHandle: s.usuario.id });
    const reg = await iniciarRegistroDeRosto(s, comRosto());
    expect((await concluirRegistroDeRosto(s, aut.registrar(reg.challenge), 'iPhone', comRosto())).ok).toBe(true);
    await iniciarRegistroDeRosto(s, comRosto());
    const ipRosto = ip();
    const antes = await entrarComRosto(aut.entrar((await iniciarEntradaComRosto(ipRosto, comRosto())).challenge), ipRosto, comRosto());
    expect(antes.ok).toBe(true); // o rosto funcionava
    if (!antes.ok) throw new Error();

    // Nível 1 põe xis em B como dona: senha, rosto, desafios e sessões caem juntos.
    const emB = await criarAcesso(B, { nome: 'Xis', email: email('xis'), perfil: 'DONO' }, 'Rodolfo', o());
    expect(emB.ok && emB.link).not.toBeNull();
    expect(await listarRostos(s.usuario.id, o())).toEqual([]);
    const [d] = await db.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM "DesafioWebauthn" WHERE "usuarioId" = $1`,
      s.usuario.id,
    );
    expect(d.n).toBe(0);
    expect(await validarSessao(antes.token, o())).toBeNull();
    expect(await validarSessao(e.token, o())).toBeNull();

    // Entrar pelo rosto falha; entrar com a senha antiga falha.
    const ip2 = ip();
    const depois = await entrarComRosto(aut.entrar((await iniciarEntradaComRosto(ip2, comRosto())).challenge, { contador: 5 }), ip2, comRosto());
    expect(depois.ok).toBe(false);
    expect((await entrarComSenha({ email: email('xis'), senha: 'senha do dono de a', ip: ip() }, o())).ok).toBe(false);
    // E fica no histórico de B.
    const h = await listarHistorico(doParceiro(B, db), { entidade: 'AcessoParceiro', verPrecos: true });
    const pediu = h.find((x) => x.acao === 'PEDIU_SENHA_NOVA' && x.mudancas.some((m) => m.depois === 'Xis' || m.depois === `Pessoa xis`))!;
    expect(pediu.mudancas.find((m) => m.campo === 'aparelho')?.depois).toBe('1 aparelho com rosto removido');
    // E no histórico de A (o rosto valia lá também).
    const hA = await listarHistorico(doParceiro(A, db), { entidade: 'AcessoParceiro', verPrecos: true });
    expect(hA.some((x) => x.acao === 'PEDIU_SENHA_NOVA' && x.mudancas.some((m) => m.depois === '1 aparelho com rosto removido'))).toBe(true);
  });

  // ------------------------------- Fiscal QA + Guardião, volta 3 (0.4)

  const rostoCfg = () => configDoRosto({ NEXTAUTH_URL: 'http://localhost:3100' });

  /** Dono de A cria a pessoa (só em A), define a senha pelo link de A e entra como ela. */
  async function plantada(apelido: string) {
    const c = await criarAcesso(A, { nome: `Pessoa ${apelido}`, email: email(apelido), perfil: 'OPERADOR' }, ator(dono.s), o());
    if (!c.ok || !c.link) throw new Error('setup plantada');
    expect((await definirSenhaPeloLink(c.link.token, 'senha do dono de a', 'senha do dono de a', o())).ok).toBe(true);
    const e = await entrarComSenha({ email: email(apelido), senha: 'senha do dono de a', ip: ip() }, o());
    if (!e.ok) throw new Error('setup plantada entrar');
    const s = (await validarSessao(e.token, o()))!;
    const acessoId = (await listarAcessos(A, o())).find((l) => l.email === email(apelido))!.acessoId;
    return { token: e.token, s, acessoId };
  }

  /** Espera até `n` transações estarem na fila da trava da pessoa (pg_advisory_xact_lock). */
  async function naFila(usuarioId: string, n: number) {
    for (let i = 0; i < 400; i++) {
      const [r] = await db.$queryRawUnsafe<{ n: number }[]>(
        `WITH k AS (SELECT hashtextextended($1, 0) AS k)
         SELECT count(*)::int AS n FROM pg_locks l, k
         WHERE l.locktype = 'advisory' AND NOT l.granted
           AND l.classid::bigint = ((k.k >> 32) & 4294967295) AND l.objid::bigint = (k.k & 4294967295)`,
        `erp-usuario:${usuarioId}`,
      );
      if (r.n >= n) return;
      await new Promise((ok) => setTimeout(ok, 25));
    }
    throw new Error(`fila da trava não chegou a ${n}`);
  }

  /** Segura a trava da pessoa até `soltar()`: ordena quem chega à fila. */
  function segurarTrava(usuarioId: string) {
    let soltar!: () => void;
    const solta = new Promise<void>((ok) => (soltar = ok));
    let pegou!: () => void;
    const pegouP = new Promise<void>((ok) => (pegou = ok));
    const fim = db.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text`, `erp-usuario:${usuarioId}`);
        pegou();
        await solta;
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
    return { pegou: pegouP, soltar: async () => (soltar(), fim) };
  }

  /** Sessões abertas da pessoa que ainda valem (validarSessao de cada uma não dá para chamar sem token). */
  async function sessoesVivas(usuarioId: string) {
    const [r] = await db.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM "SessaoErp" s JOIN "UsuarioErp" u ON u.id = s."usuarioId"
       WHERE s."usuarioId" = $1 AND s."encerradaEm" IS NULL AND s."versaoCredencial" = u."versaoCredencial"`,
      usuarioId,
    );
    return r.n;
  }

  it('Fiscal QA: rosto plantado pelo dono de A não sobrevive à senha refeita pelo link do nível 1 (passos 1–4)', async () => {
    const rosto = rostoCfg();
    const comRosto = () => ({ ...o(), rosto });
    // (1) Dono de A define a senha da pessoa pelo link de A e ativa o rosto no aparelho DELE.
    const atk = await plantada('qa1');
    const aut = criarAutenticador({ rpID: rosto.rpID, origin: rosto.origin, userHandle: atk.s.usuario.id });
    const reg = await iniciarRegistroDeRosto(atk.s, comRosto());
    expect((await concluirRegistroDeRosto(atk.s, aut.registrar(reg.challenge), 'Celular do dono', comRosto())).ok).toBe(true);
    await iniciarRegistroDeRosto(atk.s, comRosto()); // desafio pendente também
    // (2) A pessoa pede ajuda; o nível 1 gera link novo e ela redefine a senha.
    const n1 = await gerarNovoLink(A, atk.acessoId, 'Rodolfo', o());
    if (!n1.ok) throw new Error();
    const d = await definirSenhaPeloLink(n1.token, SENHA, SENHA, o());
    expect.soft(d.ok && d.rostosRemovidos).toBe(1);
    const u = await db.usuarioErp.findUniqueOrThrow({ where: { id: atk.s.usuario.id } });
    expect.soft(u.senhaPorLinkDoParceiroId).toBeNull();
    // Todos os outros meios de entrar caíram: rostos, desafios, sessões.
    expect.soft(await listarRostos(u.id, o())).toEqual([]);
    const [desafios] = await db.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM "DesafioWebauthn" WHERE "usuarioId" = $1`,
      u.id,
    );
    expect.soft(desafios.n).toBe(0);
    expect.soft(await validarSessao(atk.token, o())).toBeNull();
    expect.soft(u.rostosRemovidosEm).not.toBeNull(); // "Seu acesso" avisa
    const hA = await listarHistorico(doParceiro(A, db), { entidade: 'AcessoParceiro', verPrecos: true });
    expect.soft(
      hA.some((x) => x.acao === 'TROCOU_SENHA' && x.mudancas.some((m) => m.campo === 'aparelho' && m.depois === '1 aparelho com rosto removido')),
    ).toBe(true);
    // (3) Nível 1 vincula a pessoa a B como Dona: a senha é dela (do nível 1), nada a apagar.
    const emB = await criarAcesso(B, { nome: 'QA1', email: email('qa1'), perfil: 'DONO' }, 'Rodolfo', o());
    expect(emB.ok && emB.link).toBe(null);
    // (4) O atacante tenta entrar com o rosto e escolher B: falha (sem a correção, vira Dono em B).
    const ipR = ip();
    const r = await entrarComRosto(aut.entrar((await iniciarEntradaComRosto(ipR, comRosto())).challenge), ipR, comRosto());
    expect(r.ok, 'o rosto do atacante entrou').toBe(false);
    if (r.ok) expect(await escolherParceiro(r.token, B, o()), 'atacante chegou a B').toBe(false);
    // A pessoa entra com a senha dela, nos dois, e pode ativar o rosto de novo (o aviso some).
    const p = await entrarComSenha({ email: email('qa1'), senha: SENHA, ip: ip() }, o());
    expect(p.ok && p.escolher).toBe(true);
    if (!p.ok) return;
    const sP = (await validarSessao(p.token, o()))!;
    const meu = criarAutenticador({ rpID: rosto.rpID, origin: rosto.origin, userHandle: sP.usuario.id });
    const reg2 = await iniciarRegistroDeRosto(sP, comRosto());
    expect((await concluirRegistroDeRosto(sP, meu.registrar(reg2.challenge), 'Meu celular', comRosto())).ok).toBe(true);
    expect((await db.usuarioErp.findUniqueOrThrow({ where: { id: u.id } })).rostosRemovidosEm).toBeNull();
  });

  it('Guardião, volta 3: login em voo com a senha do link de A não cria sessão depois da limpeza (ordem forçada)', async () => {
    const atk = await plantada('voo1');
    const uid = atk.s.usuario.id;
    // Segura a trava da pessoa; a limpeza (vínculo em B apaga a senha "de A") entra na fila primeiro...
    const t = segurarTrava(uid);
    await t.pegou;
    const limpeza = criarAcesso(B, { nome: 'Voo1', email: email('voo1'), perfil: 'DONO' }, 'Rodolfo', o());
    await naFila(uid, 1);
    // ...e o login do atacante, que já leu a senha e a versão (antes do bcrypt), entra atrás.
    const login = entrarComSenha({ email: email('voo1'), senha: 'senha do dono de a', ip: ip() }, o());
    await naFila(uid, 2);
    await t.soltar();
    const [l, r] = await Promise.all([limpeza, login]);
    expect(l.ok && l.mensagem).toMatch(/criada por link de outro parceiro/);
    expect(r.ok).toBe(false);
    expect(await sessoesVivas(uid)).toBe(0);
    if (r.ok) expect(await escolherParceiro(r.token, B, o())).toBe(false);
  });

  it('Guardião, volta 3: logins em rajada durante a limpeza — nenhuma sessão viva depois', async () => {
    for (let rodada = 0; rodada < 3; rodada++) {
      const atk = await plantada(`raj${rodada}`);
      const voos: Promise<Awaited<ReturnType<typeof entrarComSenha>>>[] = [];
      let limpeza: ReturnType<typeof criarAcesso> | null = null;
      for (let i = 0; i < 4; i++) {
        voos.push(entrarComSenha({ email: email(`raj${rodada}`), senha: 'senha do dono de a', ip: ip() }, o()));
        if (i === 1) {
          await new Promise((ok) => setTimeout(ok, 120));
          limpeza = criarAcesso(B, { nome: `Raj${rodada}`, email: email(`raj${rodada}`), perfil: 'DONO' }, 'Rodolfo', o());
        }
        await new Promise((ok) => setTimeout(ok, 60));
      }
      const res = await Promise.all(voos);
      expect((await limpeza!).ok).toBe(true);
      expect(await sessoesVivas(atk.s.usuario.id)).toBe(0);
      for (const r of res) if (r.ok) expect(await validarSessao(r.token, o())).toBeNull();
    }
  });

  it('Guardião, volta 3: ativar rosto em voo durante a senha refeita pelo nível 1 não pendura aparelho (ordem forçada)', async () => {
    const rosto = rostoCfg();
    const comRosto = () => ({ ...o(), rosto });
    const atk = await plantada('voo2');
    const uid = atk.s.usuario.id;
    const aut = criarAutenticador({ rpID: rosto.rpID, origin: rosto.origin, userHandle: uid });
    const reg = await iniciarRegistroDeRosto(atk.s, comRosto());
    const n1 = await gerarNovoLink(A, atk.acessoId, 'Rodolfo', o());
    if (!n1.ok) throw new Error();
    const t = segurarTrava(uid);
    await t.pegou;
    // A pessoa redefine a senha (entra na fila primeiro)...
    const refaz = definirSenhaPeloLink(n1.token, SENHA, SENHA, o());
    await naFila(uid, 1);
    // ...e o atacante conclui a ativação com a sessão que já tinha validado.
    const ativa = concluirRegistroDeRosto(atk.s, aut.registrar(reg.challenge), 'Celular do dono', comRosto());
    await naFila(uid, 2);
    await t.soltar();
    const [d, a] = await Promise.all([refaz, ativa]);
    expect(d.ok).toBe(true);
    expect(a.ok).toBe(false);
    expect(await listarRostos(uid, o())).toEqual([]);
    expect(await sessoesVivas(uid)).toBe(0);
  });
});
