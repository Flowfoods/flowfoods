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
  criarAcesso,
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
import { acaoCadastrarInsumoDaSessao, acaoCadastrarLojaDaSessao } from '@/app/erp/actions';
import { acaoCriarPessoa } from '@/app/erp/equipe/actions';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const SENHA = 'cozinha limpa 2026';

describe.skipIf(!URL_TESTE)('ERP 0.4 · permissões (Postgres real)', { timeout: 60_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const avisos = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const sufixo = `p${Date.now().toString(36)}`;
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
    const ok = await acaoCadastrarInsumoDaSessao(
      null,
      form({ nome: 'Pelo dono', unidade: 'KG', conteudo: '1', preco: '1,00' }),
    );
    expect(ok?.ok).toBe(true);
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
    const h = await listarHistorico(doParceiro(A, db), { entidades: ['AcessoParceiro', 'PerfilAcesso'], limite: 100 });
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
    const h = await listarHistorico(doParceiro(A, db), { entidade: 'PerfilAcesso' });
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
    const h = await listarHistorico(doParceiro(A, db), { entidade: 'AcessoParceiro' });
    expect(h.some((x) => x.acao === 'LIBEROU_ENTRADA')).toBe(true);
  });
});
