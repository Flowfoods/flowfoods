/**
 * ERP 0.3 — login das pessoas dos parceiros no Postgres de verdade: acesso
 * criado pelo nível 1 com histórico, link de primeiro acesso (uso único,
 * vencido, só o hash no banco), senha certa/errada, limite por e-mail e por
 * IP, desativar derruba a sessão, a sessão só mostra o parceiro dela (dois
 * parceiros), parceiro suspenso só lê, e o rosto (WebAuthn) de ponta a ponta
 * com autenticador sintético: desafio único e com validade, contador.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-acesso.db.test.ts
 */
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ERRO_DE_BLOQUEIO, ERRO_DE_ENTRADA, LIMITE_DE_TENTATIVAS, VALIDADE_DO_DESAFIO_MS, hashDoToken } from '@/lib/erp/acesso';
import {
  concluirRegistroDeRosto,
  consultarLink,
  consumirDesafio,
  criarAcesso,
  definirSenhaPeloLink,
  encerrarSessao,
  entrarComRosto,
  entrarComSenha,
  escolherParceiro,
  gerarNovoLink,
  iniciarEntradaComRosto,
  iniciarRegistroDeRosto,
  listarAcessos,
  listarRostos,
  DESAFIOS_ABERTOS_POR_IP,
  LimiteDoRosto,
  mudarStatusDoAcesso,
  removerRosto,
  validarSessao,
  type SessaoValida,
} from '@/lib/erp/credenciais';
import { contextoDaSessao } from '@/lib/erp/contexto-base';
import { listarInsumos } from '@/lib/erp/insumos';
import { cadastrarInsumoDeTeste as cadastrarInsumo } from './erp-db-apoio';
import { criarParceiro, mudarStatusParceiro } from '@/lib/erp/parceiros';
import { configDoRosto } from '@/lib/erp/rosto';
import { doParceiro, ErroDeTenant } from '@/lib/erp/tenant';
import type { ParceiroFlow } from '@prisma/client';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';
import { criarAutenticador } from './erp-autenticador-sintetico';

const URL_TESTE = process.env.ERP_DB_TESTE;
const SENHA = 'cozinha limpa 2026';
const HORA = 60 * 60 * 1000;

// bcrypt custo 12 de verdade (~0,25 s por senha): os testes de limite fazem dezenas.
describe.skipIf(!URL_TESTE)('ERP 0.3 · login das pessoas dos parceiros (Postgres real)', { timeout: 60_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const avisos = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const sufixo = globalThis.crypto.randomUUID().slice(0, 8);
  const email = (n: string) => `${n}.${sufixo}@teste.flow`;
  const ip = (n: number) => `10.${n}.0.${Math.floor(Math.random() * 250)}-${sufixo}`;
  const ids: string[] = [];
  let A: string;
  let B: string;
  let C: string; // suspenso
  const o = () => ({ base: db });
  const rosto = configDoRosto({ NEXTAUTH_URL: 'http://localhost:3100' });

  /** Cria o acesso, usa o link e devolve o e-mail pronto para entrar. */
  async function pessoaComSenha(parceiroId: string, nome: string, apelido: string) {
    const r = await criarAcesso(parceiroId, { nome, email: email(apelido) }, 'Rodolfo', o());
    if (!r.ok || !r.link) throw new Error('setup acesso');
    const d = await definirSenhaPeloLink(r.link.token, SENHA, SENHA, o());
    if (!d.ok) throw new Error('setup senha');
    return email(apelido);
  }

  async function sessaoDe(emailDe: string, n = 99): Promise<{ token: string; sessao: SessaoValida }> {
    const r = await entrarComSenha({ email: emailDe, senha: SENHA, ip: ip(n) }, o());
    if (!r.ok) throw new Error(`setup entrar: ${r.erro}`);
    const s = await validarSessao(r.token, o());
    if (!s) throw new Error('setup sessão');
    return { token: r.token, sessao: s };
  }

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    for (const [nome, slug] of [
      ['Login A', `login-a-${sufixo}`],
      ['Login B', `login-b-${sufixo}`],
      ['Login C', `login-c-${sufixo}`],
    ]) {
      const p = await criarParceiro({ nome, slug, status: 'ATIVO' }, 'Teste', db);
      if (!p.ok) throw new Error('setup parceiro');
      ids.push(p.id);
    }
    [A, B, C] = ids;
    await cadastrarInsumo(doParceiro(A, db), { nome: 'Segredo de A', unidade: 'KG', conteudo: '1', preco: '10,00' });
    await cadastrarInsumo(doParceiro(B, db), { nome: 'Coisa de B', unidade: 'UN', conteudo: '1', preco: '1,00' });
    await cadastrarInsumo(doParceiro(C, db), { nome: 'Coisa de C', unidade: 'UN', conteudo: '1', preco: '1,00' });
    const s = await mudarStatusParceiro(C, 'SUSPENSO', 'teste de leitura', 'Teste', db);
    if (!s.ok) throw new Error('setup suspender');
  });

  afterAll(async () => {
    avisos.mockRestore();
    if (!db) return;
    const usuarios = (
      await db.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM "UsuarioErp" WHERE email LIKE $1`, `%.${sufixo}@teste.flow`)
    ).map((u) => u.id);
    await db.$executeRawUnsafe(`DELETE FROM "TentativaEntradaErp" WHERE email LIKE $1 OR ip LIKE $2`, `%${sufixo}%`, `%-${sufixo}`);
    await db.$executeRawUnsafe(`DELETE FROM "DesafioWebauthn" WHERE ip LIKE $1`, `%-${sufixo}`);
    await db.$executeRawUnsafe(`DELETE FROM "SessaoErp" WHERE "usuarioId" = ANY($1)`, usuarios);
    await db.$executeRawUnsafe(`DELETE FROM "ConviteAcesso" WHERE "usuarioId" = ANY($1)`, usuarios);
    await db.$executeRawUnsafe(`DELETE FROM "AcessoParceiro" WHERE "usuarioId" = ANY($1)`, usuarios);
    await db.$executeRawUnsafe(`DELETE FROM "UsuarioErp" WHERE id = ANY($1)`, usuarios);
    await limparParceiros(db, perfil, ids);
    await db.$disconnect();
  });

  // ------------------------------------------------------- nível 1 + link

  it('nível 1 cria o acesso: usuário, vínculo, link (só o hash no banco) e histórico CRIOU + GEROU_LINK', async () => {
    const r = await criarAcesso(A, { nome: 'Maria Souza', email: email('maria').toUpperCase() }, 'Rodolfo', o());
    expect(r.ok).toBe(true);
    if (!r.ok || !r.link) throw new Error();
    const { token } = r.link;
    expect(r.link.expiraEm.getTime() - Date.now()).toBeGreaterThan(71 * HORA);

    const [linha] = await db.$queryRawUnsafe<{ tokenHash: string }[]>(
      `SELECT c."tokenHash" FROM "ConviteAcesso" c JOIN "UsuarioErp" u ON u.id = c."usuarioId" WHERE u.email = $1`,
      email('maria'),
    );
    expect(linha.tokenHash).toBe(hashDoToken(token));
    // O token em si não está em lugar nenhum do banco.
    const [achou] = await db.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM "ConviteAcesso" WHERE "tokenHash" = $1`,
      token,
    );
    expect(achou.n).toBe(0);

    const hist = await doParceiro(A, db).historicoAlteracao.findMany({ where: { entidade: 'AcessoParceiro' }, orderBy: { ocorridoEm: 'asc' } });
    // Os dois eventos nascem na mesma transação: now() pode ser idêntico.
    // O contrato exige os dois registros, sem uma ordem artificial no empate.
    expect(hist.map((h) => h.acao).sort()).toEqual(['CRIOU', 'GEROU_LINK']);
    expect(hist.find((h) => h.acao === 'CRIOU')?.depois).toMatchObject({ nome: 'Maria Souza', email: email('maria'), status: 'ATIVO' });
    expect(JSON.stringify(hist)).not.toContain(token);

    const repetido = await criarAcesso(A, { nome: 'Maria', email: email('maria') }, 'Rodolfo', o());
    expect(repetido.ok).toBe(false);

    // Link: vale, define a senha UMA vez; a segunda tentativa com o mesmo link falha.
    expect(await consultarLink(token, o())).toMatchObject({ valido: true, nome: 'Maria Souza', primeiraVez: true });
    expect((await definirSenhaPeloLink(token, 'curta', 'curta', o())).ok).toBe(false); // senha fraca não queima o link
    expect((await definirSenhaPeloLink(token, SENHA, SENHA, o())).ok).toBe(true);
    expect(await consultarLink(token, o())).toEqual({ valido: false });
    const de_novo = await definirSenhaPeloLink(token, 'outra senha boa 1', 'outra senha boa 1', o());
    expect(de_novo).toMatchObject({ ok: false, linkInvalido: true });

    const [u] = await db.$queryRawUnsafe<{ senhaHash: string }[]>(`SELECT "senhaHash" FROM "UsuarioErp" WHERE email = $1`, email('maria'));
    expect(u.senhaHash).toMatch(/^\$2[aby]\$12\$/);
    const acoes = (await doParceiro(A, db).historicoAlteracao.findMany({ where: { entidade: 'AcessoParceiro' } })).map((h) => h.acao);
    expect(acoes).toContain('DEFINIU_SENHA');
  });

  it('link vencido (72 h) não vale; link novo revoga o anterior', async () => {
    const r = await criarAcesso(A, { nome: 'Joana', email: email('joana') }, 'Rodolfo', o());
    if (!r.ok || !r.link) throw new Error();
    const depois = { base: db, agora: new Date(Date.now() + 73 * HORA) };
    expect(await consultarLink(r.link.token, depois)).toEqual({ valido: false });
    expect((await definirSenhaPeloLink(r.link.token, SENHA, SENHA, depois)).ok).toBe(false);

    const [acesso] = (await listarAcessos(A, o())).filter((a) => a.email === email('joana'));
    expect(acesso.linkValeAte).not.toBeNull();
    const novo = await gerarNovoLink(A, acesso.acessoId, 'Rodolfo', o());
    if (!novo.ok) throw new Error();
    expect(await consultarLink(r.link.token, o())).toEqual({ valido: false });
    expect(await consultarLink(novo.token, o())).toMatchObject({ valido: true });
    // Outro parceiro não mexe no acesso de A.
    expect((await gerarNovoLink(B, acesso.acessoId, 'Rodolfo', o())).ok).toBe(false);
    expect((await mudarStatusDoAcesso(B, acesso.acessoId, 'DESATIVADO', 'Rodolfo', o())).ok).toBe(false);
  });

  // ---------------------------------------------------------------- senha

  it('senha certa abre sessão; senha errada, e-mail inexistente e senha não definida dão a MESMA mensagem; tudo registrado', async () => {
    const e = await pessoaComSenha(A, 'Carlos', 'carlos');
    const certo = await entrarComSenha({ email: e, senha: SENHA, ip: ip(1) }, o());
    expect(certo.ok).toBe(true);
    const errado = await entrarComSenha({ email: e, senha: 'senha errada aqui', ip: ip(1) }, o());
    const ninguem = await entrarComSenha({ email: email('ninguem'), senha: SENHA, ip: ip(1) }, o());
    await criarAcesso(A, { nome: 'Sem Senha', email: email('semsenha') }, 'Rodolfo', o());
    const semSenha = await entrarComSenha({ email: email('semsenha'), senha: SENHA, ip: ip(1) }, o());
    for (const r of [errado, ninguem, semSenha]) expect(r).toEqual({ ok: false, erro: ERRO_DE_ENTRADA, bloqueado: false });

    const t = await db.$queryRawUnsafe<{ ok: boolean; motivo: string }[]>(
      `SELECT ok, motivo FROM "TentativaEntradaErp" WHERE email = ANY($1) ORDER BY "criadoEm"`,
      [e, email('ninguem'), email('semsenha')],
    );
    expect(t.map((x) => `${x.ok}:${x.motivo}`)).toEqual(['true:OK', 'false:SENHA_ERRADA', 'false:SEM_USUARIO', 'false:SEM_SENHA']);
  });

  it('limite por e-mail: na 6ª tentativa bloqueia, mesmo com a senha certa', async () => {
    const e = await pessoaComSenha(A, 'Bia', 'bia');
    for (let i = 0; i < LIMITE_DE_TENTATIVAS.porEmail; i++) {
      expect(await entrarComSenha({ email: e, senha: 'errada demais', ip: ip(2) }, o())).toMatchObject({ erro: ERRO_DE_ENTRADA });
    }
    const r = await entrarComSenha({ email: e, senha: SENHA, ip: ip(3) }, o());
    expect(r).toEqual({ ok: false, erro: ERRO_DE_BLOQUEIO, bloqueado: true });
    // Passada a janela, volta a entrar.
    const depois = await entrarComSenha({ email: e, senha: SENHA, ip: ip(3) }, { base: db, agora: new Date(Date.now() + 16 * 60_000) });
    expect(depois.ok).toBe(true);
  });

  it('limite por IP: 20 falhas com e-mails diferentes bloqueiam aquele IP (outro IP segue)', async () => {
    const e = await pessoaComSenha(A, 'Davi', 'davi');
    const meuIp = ip(4);
    for (let i = 0; i < LIMITE_DE_TENTATIVAS.porIp; i++) {
      await entrarComSenha({ email: email(`chute${i}`), senha: 'x', ip: meuIp }, o());
    }
    expect(await entrarComSenha({ email: e, senha: SENHA, ip: meuIp }, o())).toMatchObject({ ok: false, bloqueado: true });
    expect((await entrarComSenha({ email: e, senha: SENHA, ip: ip(5) }, o())).ok).toBe(true);
  });

  it('pedidos SIMULTÂNEOS no mesmo e-mail: só 5 chegam ao bcrypt (contar e reservar é atômico)', async () => {
    const e = await pessoaComSenha(A, 'Nina', 'nina');
    const compare = vi.spyOn(bcrypt, 'compare');
    try {
      const rs = await Promise.all(
        Array.from({ length: 20 }, (_, i) => entrarComSenha({ email: e, senha: `chute ${i} errado`, ip: ip(10) }, o())),
      );
      expect(compare).toHaveBeenCalledTimes(LIMITE_DE_TENTATIVAS.porEmail);
      expect(rs.filter((r) => !r.ok && r.bloqueado)).toHaveLength(20 - LIMITE_DE_TENTATIVAS.porEmail);
    } finally {
      compare.mockRestore();
    }
    const t = await db.$queryRawUnsafe<{ motivo: string; n: number }[]>(
      `SELECT motivo, count(*)::int AS n FROM "TentativaEntradaErp" WHERE email = $1 GROUP BY motivo ORDER BY motivo`,
      e,
    );
    expect(t).toEqual([
      { motivo: 'BLOQUEADO', n: 15 },
      { motivo: 'SENHA_ERRADA', n: 5 },
    ]);
    // Bloqueado também com a senha certa.
    expect(await entrarComSenha({ email: e, senha: SENHA, ip: ip(11) }, o())).toMatchObject({ ok: false, bloqueado: true });
  });

  it('pedidos SIMULTÂNEOS do mesmo IP com e-mails diferentes: só 20 chegam ao bcrypt', async () => {
    const meuIp = ip(12);
    const compare = vi.spyOn(bcrypt, 'compare');
    try {
      const rs = await Promise.all(
        Array.from({ length: 30 }, (_, i) => entrarComSenha({ email: email(`par${i}`), senha: 'x', ip: meuIp }, o())),
      );
      // Sem usuário, o bcrypt roda contra o hash de mentira (tempo igual): conta também.
      expect(compare).toHaveBeenCalledTimes(LIMITE_DE_TENTATIVAS.porIp);
      expect(rs.filter((r) => !r.ok && r.bloqueado)).toHaveLength(30 - LIMITE_DE_TENTATIVAS.porIp);
    } finally {
      compare.mockRestore();
    }
  });

  it('desafio do rosto tem teto por IP (não dá para inundar o banco)', async () => {
    const meuIp = ip(13);
    const pedidos = await Promise.allSettled(
      Array.from({ length: DESAFIOS_ABERTOS_POR_IP + 5 }, () => iniciarEntradaComRosto(meuIp, { ...o(), rosto })),
    );
    expect(pedidos.filter((p) => p.status === 'fulfilled')).toHaveLength(DESAFIOS_ABERTOS_POR_IP);
    const recusados = pedidos.filter((p): p is PromiseRejectedResult => p.status === 'rejected');
    expect(recusados).toHaveLength(5);
    expect(recusados.every((p) => p.reason instanceof LimiteDoRosto)).toBe(true);
    // Vencidos não contam: depois de 5 min, abre de novo.
    await expect(
      iniciarEntradaComRosto(meuIp, { ...o(), rosto, agora: new Date(Date.now() + VALIDADE_DO_DESAFIO_MS + 1000) }),
    ).resolves.toHaveProperty('challenge');
  });

  // ---------------------------------------------------------------- sessão

  it('desativar derruba a sessão na próxima validação; reativar volta a deixar entrar; tudo no histórico', async () => {
    const e = await pessoaComSenha(A, 'Edu', 'edu');
    const { token, sessao } = await sessaoDe(e);
    expect(sessao.parceiro?.id).toBe(A);
    const desativou = await mudarStatusDoAcesso(A, sessao.acessoId!, 'DESATIVADO', 'Rodolfo', o());
    expect(desativou.ok).toBe(true);
    expect(await validarSessao(token, o())).toBeNull();
    expect((await entrarComSenha({ email: e, senha: SENHA, ip: ip(6) }, o())).ok).toBe(false);

    expect((await mudarStatusDoAcesso(A, sessao.acessoId!, 'ATIVO', 'Rodolfo', o())).ok).toBe(true);
    expect(await validarSessao(token, o())).toBeNull(); // a sessão antiga não ressuscita
    expect((await entrarComSenha({ email: e, senha: SENHA, ip: ip(6) }, o())).ok).toBe(true);

    const h = await doParceiro(A, db).historicoAlteracao.findMany({ where: { entidadeId: sessao.acessoId! }, orderBy: { ocorridoEm: 'asc' } });
    const st = h.filter((x) => x.acao === 'DESATIVOU' || x.acao === 'REATIVOU');
    expect(st.map((x) => [x.acao, x.antes, x.depois])).toEqual([
      ['DESATIVOU', { nome: 'Edu', status: 'ATIVO' }, { nome: 'Edu', status: 'DESATIVADO' }],
      ['REATIVOU', { nome: 'Edu', status: 'DESATIVADO' }, { nome: 'Edu', status: 'ATIVO' }],
    ]);
  });

  it('sair encerra a sessão; sessão vencida não vale; token inválido não vale', async () => {
    const e = await pessoaComSenha(B, 'Fábio', 'fabio');
    const { token } = await sessaoDe(e);
    expect(await validarSessao(token, { base: db, agora: new Date(Date.now() + 8 * 24 * HORA) })).toBeNull();
    await encerrarSessao(token, o());
    expect(await validarSessao(token, o())).toBeNull();
    expect(await validarSessao('eyJhbGciOiJIUzI1NiJ9.jwt-do-next-auth', o())).toBeNull();
  });

  it('/erp mostra SÓ o parceiro da sessão (dois parceiros), e quem tem dois escolhe com vínculo conferido', async () => {
    const deA = await sessaoDe(await pessoaComSenha(A, 'Gil', 'gil'));
    const ctxA = contextoDaSessao(deA.sessao as SessaoValida & { parceiro: ParceiroFlow }, db);
    expect(ctxA.parceiro.id).toBe(A);
    expect((await listarInsumos(ctxA.cliente)).linhas.map((i) => i.nome)).toEqual(['Segredo de A']);

    const deB = await sessaoDe(await pessoaComSenha(B, 'Hana', 'hana'));
    const ctxB = contextoDaSessao(deB.sessao as SessaoValida & { parceiro: ParceiroFlow }, db);
    expect((await listarInsumos(ctxB.cliente)).linhas.map((i) => i.nome)).toEqual(['Coisa de B']);
    // A pessoa de B não consegue escolher A.
    expect(await escolherParceiro(deB.token, A, o())).toBe(false);

    // Consultora em A e B: entra sem parceiro e escolhe.
    const e = await pessoaComSenha(A, 'Íris Consultora', 'iris');
    const vinculo = await criarAcesso(B, { nome: 'Outro nome', email: e }, 'Rodolfo', o());
    expect(vinculo).toMatchObject({ ok: true, link: null }); // já tem senha: só ganha o vínculo
    const r = await entrarComSenha({ email: e, senha: SENHA, ip: ip(7) }, o());
    if (!r.ok) throw new Error();
    expect(r.escolher).toBe(true);
    expect((await validarSessao(r.token, o()))?.parceiro).toBeNull();
    expect(await escolherParceiro(r.token, C, o())).toBe(false);
    expect(await escolherParceiro(r.token, B, o())).toBe(true);
    const s = (await validarSessao(r.token, o()))!;
    expect(s.parceiros.map((p) => p.id).sort()).toEqual([A, B].sort());
    expect((await listarInsumos(contextoDaSessao(s as SessaoValida & { parceiro: ParceiroFlow }, db).cliente)).linhas.map((i) => i.nome)).toEqual([
      'Coisa de B',
    ]);
    // Desativada em B, a sessão em B cai; o vínculo com A segue.
    const acessoB = (await listarAcessos(B, o())).find((a) => a.email === e)!;
    await mudarStatusDoAcesso(B, acessoB.acessoId, 'DESATIVADO', 'Rodolfo', o());
    expect(await validarSessao(r.token, o())).toBeNull();
    const de_novo = await entrarComSenha({ email: e, senha: SENHA, ip: ip(7) }, o());
    expect(de_novo.ok && de_novo.escolher).toBe(false);
  });

  it('parceiro suspenso: entra, mas só lê (portão recusa a escrita)', async () => {
    const { sessao } = await sessaoDe(await pessoaComSenha(C, 'João', 'joao'));
    const ctx = contextoDaSessao(sessao as SessaoValida & { parceiro: ParceiroFlow }, db);
    expect(ctx.bloqueio).toMatch(/suspenso/i);
    expect((await listarInsumos(ctx.cliente)).linhas.map((i) => i.nome)).toEqual(['Coisa de C']);
    await expect(
      ctx.cliente.insumo.create({ data: { parceiroId: C, nome: 'X', unidade: 'UN', conteudoMilesimos: 1000, precoEmbalagemCentavos: 1 } }),
    ).rejects.toThrow(ErroDeTenant);
  });

  // ------------------------------------------------------------------ rosto

  it('rosto de ponta a ponta: ativar (só chave pública), entrar sem senha, contador, remover — com histórico', async () => {
    const e = await pessoaComSenha(A, 'Kátia', 'katia');
    const { sessao } = await sessaoDe(e);
    const aut = criarAutenticador({ rpID: rosto.rpID, origin: rosto.origin, userHandle: sessao.usuario.id });

    const reg = await iniciarRegistroDeRosto(sessao, { ...o(), rosto });
    expect(reg.authenticatorSelection?.userVerification).toBe('required');
    const ok = await concluirRegistroDeRosto(sessao, aut.registrar(reg.challenge), 'iPhone', { ...o(), rosto });
    expect(ok.ok).toBe(true);
    // O mesmo desafio não serve duas vezes.
    expect((await concluirRegistroDeRosto(sessao, aut.registrar(reg.challenge), 'iPhone', { ...o(), rosto })).ok).toBe(false);

    const guardado = await db.$queryRawUnsafe<{ cols: string[] }[]>(
      `SELECT array_agg(column_name::text) AS cols FROM information_schema.columns WHERE table_name = 'PasskeyErp'`,
    );
    expect(guardado[0].cols.sort()).toEqual(
      ['aparelho', 'chavePublica', 'contador', 'credencialId', 'criadoEm', 'id', 'sincronizada', 'transportes', 'ultimoUsoEm', 'usuarioId'].sort(),
    );

    const ent = await iniciarEntradaComRosto(ip(8), { ...o(), rosto });
    const r = await entrarComRosto(aut.entrar(ent.challenge), ip(8), { ...o(), rosto });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    const s = await validarSessao(r.token, o());
    expect(s).toMatchObject({ metodo: 'ROSTO', usuario: { email: e }, parceiro: { id: A } });

    // Resposta repetida (mesmo desafio): recusada.
    expect((await entrarComRosto(aut.entrar(ent.challenge), ip(8), { ...o(), rosto })).ok).toBe(false);
    // Contador que não sobe (aparelho clonado): recusado.
    const ent2 = await iniciarEntradaComRosto(ip(8), { ...o(), rosto });
    expect((await entrarComRosto(aut.entrar(ent2.challenge, { contador: 1 }), ip(8), { ...o(), rosto })).ok).toBe(false);
    // userHandle de outra pessoa: recusado.
    const ent3 = await iniciarEntradaComRosto(ip(8), { ...o(), rosto });
    expect((await entrarComRosto(aut.entrar(ent3.challenge, { userHandle: 'outra-pessoa' }), ip(8), { ...o(), rosto })).ok).toBe(false);
    // Entrar com o rosto NÃO serve para ativar outro aparelho (pede senha recente).
    await expect(iniciarRegistroDeRosto(s!, { ...o(), rosto })).rejects.toThrow(/senha/);

    const [p] = await listarRostos(sessao.usuario.id, o());
    expect(p.aparelho).toBe('iPhone');
    expect((await removerRosto(sessao, p.id, o())).ok).toBe(true);
    const ent4 = await iniciarEntradaComRosto(ip(8), { ...o(), rosto });
    expect((await entrarComRosto(aut.entrar(ent4.challenge), ip(8), { ...o(), rosto })).ok).toBe(false);

    const acoes = (await doParceiro(A, db).historicoAlteracao.findMany({ where: { entidadeId: sessao.acessoId! } })).map((h) => h.acao);
    expect(acoes).toEqual(expect.arrayContaining(['ATIVOU_ROSTO', 'REMOVEU_ROSTO']));
  });

  it('desafio: uso único, com validade curta, preso ao tipo e à pessoa', async () => {
    const ent = await iniciarEntradaComRosto(ip(8), { ...o(), rosto });
    const depois = { base: db, agora: new Date(Date.now() + VALIDADE_DO_DESAFIO_MS + 1000) };
    expect(await consumirDesafio(ent.challenge, 'ENTRADA', null, depois)).toBe(false); // vencido
    expect(await consumirDesafio(ent.challenge, 'REGISTRO', null, o())).toBe(false); // outro tipo
    expect(await consumirDesafio(ent.challenge, 'ENTRADA', null, o())).toBe(true);
    expect(await consumirDesafio(ent.challenge, 'ENTRADA', null, o())).toBe(false); // segunda vez

    const { sessao } = await sessaoDe(await pessoaComSenha(B, 'Léo', 'leo'));
    const reg = await iniciarRegistroDeRosto(sessao, { ...o(), rosto });
    expect(await consumirDesafio(reg.challenge, 'REGISTRO', 'outra-pessoa', o())).toBe(false);
    expect(await consumirDesafio(reg.challenge, 'REGISTRO', sessao.usuario.id, o())).toBe(true);
  });

  it('desativado não entra nem pelo rosto', async () => {
    const e = await pessoaComSenha(B, 'Mel', 'mel');
    const { sessao } = await sessaoDe(e);
    const aut = criarAutenticador({ rpID: rosto.rpID, origin: rosto.origin, userHandle: sessao.usuario.id });
    const reg = await iniciarRegistroDeRosto(sessao, { ...o(), rosto });
    expect((await concluirRegistroDeRosto(sessao, aut.registrar(reg.challenge), 'Android', { ...o(), rosto })).ok).toBe(true);
    await mudarStatusDoAcesso(B, sessao.acessoId!, 'DESATIVADO', 'Rodolfo', o());
    const ent = await iniciarEntradaComRosto(ip(8), { ...o(), rosto });
    expect((await entrarComRosto(aut.entrar(ent.challenge), ip(9), { ...o(), rosto })).ok).toBe(false);
  });
});
