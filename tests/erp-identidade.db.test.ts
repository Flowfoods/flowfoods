/** Dados exclusivamente sintéticos no Postgres local descartável do portão. */
import { PrismaClient, type ParceiroFlow } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { gerarToken, hashDoToken } from '@/lib/erp/acesso';
import { trocarFotoPessoalDaSessao, validarSessao, type SessaoValida } from '@/lib/erp/credenciais';
import type { ContextoDoParceiro } from '@/lib/erp/contexto-base';
import { criarParceiro, mudarStatusParceiro } from '@/lib/erp/parceiros';
import { ALCANCE_FLOWFOODS } from '@/lib/erp/permissoes';
import { doParceiro } from '@/lib/erp/tenant';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const banco = vi.hoisted(() => ({ db: null as PrismaClient | null }));
vi.mock('@/lib/db', () => ({ prisma: { user: {
  findUnique: (...args: Parameters<PrismaClient['user']['findUnique']>) => banco.db!.user.findUnique(...args),
  updateMany: (...args: Parameters<PrismaClient['user']['updateMany']>) => banco.db!.user.updateMany(...args),
} } }));
import { listarMarcasComIdentidade, obterFotoPessoalNivel1, recursoDaFotoNivel1, recursoDaLogo } from '@/lib/erp/identidade';

const URL_TESTE = process.env.ERP_DB_TESTE;
describe.skipIf(!URL_TESTE)('Identidade · isolamento e persistência no Postgres', { timeout: 30_000 }, () => {
  let db: PrismaClient, perfil: PerfilDoBanco;
  const sufixo = crypto.randomUUID().slice(0, 8);
  const ids: string[] = [], usuarios: string[] = [], admins: string[] = [];
  const parceiros: ParceiroFlow[] = [];
  let marcaA: string, marcaB: string, tokenA: string, tokenB: string, pessoaId: string;
  const imagem1 = '1'.repeat(32) + '.png', imagem2 = '2'.repeat(32) + '.jpg';
  const contexto = (p: ParceiroFlow): ContextoDoParceiro => ({
    parceiro: p, cliente: doParceiro(p.id, db), alcance: ALCANCE_FLOWFOODS, bloqueio: null, podeEscrever: true,
    sessao: { userId: 'admin-teste', autorNome: 'Teste sintético' },
  });
  const sessao = async (token: string) => {
    const s = await validarSessao(token, { base: db });
    if (!s) throw new Error('Sessão sintética inválida.');
    return s;
  };
  beforeAll(async () => {
    if (!['127.0.0.1', 'localhost'].includes(new URL(URL_TESTE!).hostname)) throw new Error('Banco de teste deve ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    banco.db = db;
    perfil = await perfilDoBanco(db);
    for (const nome of ['a', 'b']) {
      const p = await criarParceiro({ nome: `Identidade ${nome}`, slug: `identidade-${nome}-${sufixo}`, status: 'ATIVO' }, 'Teste', db);
      if (!p.ok) throw new Error('Parceiro sintético inválido.');
      ids.push(p.id);
      parceiros.push((await db.parceiroFlow.findUniqueOrThrow({ where: { id: p.id } })));
    }
    marcaA = (await doParceiro(ids[0], db).marca.create({ data: { parceiroId: ids[0], nome: 'Marca A' } })).id;
    marcaB = (await doParceiro(ids[1], db).marca.create({ data: { parceiroId: ids[1], nome: 'Marca B' } })).id;
    for (const nome of ['dona', 'outra']) usuarios.push((await db.usuarioErp.create({ data: { nome, email: `${nome}.${sufixo}@teste.flow` } })).id);
    pessoaId = usuarios[0];
    for (const parceiroId of ids) await db.acessoParceiro.create({ data: { parceiroId, usuarioId: pessoaId, perfilBase: 'DONO' } });
    [tokenA, tokenB] = [gerarToken(), gerarToken()];
    for (const [i, token] of [tokenA, tokenB].entries()) await db.sessaoErp.create({ data: {
      usuarioId: pessoaId, parceiroId: ids[i], tokenHash: hashDoToken(token), metodo: 'SENHA', expiraEm: new Date(Date.now() + 600_000),
    } });
    admins.push((await db.user.create({ data: { email: `admin.${sufixo}@teste.flow` } })).id);
  });
  afterAll(async () => {
    if (!db || !perfil) { await db?.$disconnect(); return; }
    await db.sessaoErp.deleteMany({ where: { usuarioId: { in: usuarios } } });
    await db.acessoParceiro.deleteMany({ where: { usuarioId: { in: usuarios } } });
    await db.usuarioErp.deleteMany({ where: { id: { in: usuarios } } });
    await db.user.deleteMany({ where: { id: { in: admins } } });
    await limparParceiros(db, perfil, ids);
    await db.$disconnect();
  });

  it('lista e busca de logo só veem a marca do parceiro autorizado', async () => {
    expect((await listarMarcasComIdentidade(doParceiro(ids[0], db))).map((m) => m.id)).toEqual([marcaA]);
    expect(await recursoDaLogo(contexto(parceiros[0]), marcaB)).toBeNull();
    expect(await recursoDaLogo(contexto(parceiros[1]), marcaA)).toBeNull();
    expect((await recursoDaLogo(contexto(parceiros[0]), marcaA))?.arquivo).toBeNull();
  });
  it('grava com histórico e bloqueia atualização concorrente sem sobrescrever', async () => {
    const primeiro = await recursoDaLogo(contexto(parceiros[0]), marcaA);
    const segundo = await recursoDaLogo(contexto(parceiros[0]), marcaA);
    expect(await primeiro!.trocar(imagem1)).toBe('ok');
    expect(await segundo!.trocar(imagem2)).toBe('conflito');
    expect((await recursoDaLogo(contexto(parceiros[0]), marcaA))?.arquivo).toBe(imagem1);
    expect(await doParceiro(ids[0], db).historicoAlteracao.count({ where: { entidade: 'Marca', entidadeId: marcaA, acao: 'ALTEROU' } })).toBe(1);
  });
  it('CHECK impede URL e travessia de diretório mesmo em escrita que contorne HTTP', async () => {
    for (const logoArquivo of ['https://fora.test/logo.png', '../logo.png', 'a'.repeat(32) + '.svg']) {
      await expect(doParceiro(ids[0], db).marca.updateMany({ where: { id: marcaA }, data: { logoArquivo } })).rejects.toThrow();
    }
    await expect(db.usuarioErp.update({ where: { id: pessoaId }, data: { fotoArquivo: 'https://fora.test/foto.jpg' } })).rejects.toThrow();
    await expect(db.user.update({ where: { id: admins[0] }, data: { fotoArquivo: '../foto.png' } })).rejects.toThrow();
  });
  it('suspensão entre leitura e gravação é barrada pelo portão', async () => {
    const recurso = await recursoDaLogo(contexto(parceiros[0]), marcaA);
    expect((await mudarStatusParceiro(ids[0], 'SUSPENSO', 'Teste', 'Teste', db)).ok).toBe(true);
    await expect(recurso!.trocar(imagem2)).rejects.toThrow();
    expect((await mudarStatusParceiro(ids[0], 'ATIVO', 'Teste', 'Teste', db)).ok).toBe(true);
    expect((await recursoDaLogo(contexto(parceiros[0]), marcaA))?.arquivo).toBe(imagem1);
  });
  it('foto pertence à pessoa, persiste em outra sessão/parceiro e não altera outra pessoa', async () => {
    const s = await sessao(tokenA);
    expect(await trocarFotoPessoalDaSessao(s, null, imagem1, { base: db })).toBe('ok');
    expect((await sessao(tokenB)).usuario.fotoArquivo).toBe(imagem1);
    expect((await db.usuarioErp.findUniqueOrThrow({ where: { id: usuarios[1] } })).fotoArquivo).toBeNull();
    expect(await trocarFotoPessoalDaSessao(await sessao(tokenB), null, imagem2, { base: db })).toBe('conflito');
  });
  it('sessão válida não permite alterar a foto de outra pessoa por ID forjado', async () => {
    const s = await sessao(tokenA);
    const forjada: SessaoValida = { ...s, usuario: { ...s.usuario, id: usuarios[1] } };
    expect(await trocarFotoPessoalDaSessao(forjada, null, imagem2, { base: db })).toBe('sessao');
    expect((await db.usuarioErp.findUniqueOrThrow({ where: { id: usuarios[1] } })).fotoArquivo).toBeNull();
  });
  it('foto N1 usa User e fica separada da pessoa ERP e da marca', async () => {
    const s = { userId: admins[0], autorNome: 'Administrador sintético' };
    expect(await obterFotoPessoalNivel1(s)).toBeNull();
    expect(await (await recursoDaFotoNivel1(s))!.trocar(imagem2)).toBe('ok');
    expect(await obterFotoPessoalNivel1(s)).toBe(imagem2);
    expect((await sessao(tokenB)).usuario.fotoArquivo).toBe(imagem1);
    expect((await recursoDaLogo(contexto(parceiros[0]), marcaA))?.arquivo).toBe(imagem1);
    expect(await (await recursoDaFotoNivel1(s))!.trocar(null)).toBe('ok');
    expect(await obterFotoPessoalNivel1(s)).toBeNull();
  });
  it('remoção e substituição continuam próprias; revogação ocorrida durante envio bloqueia gravação', async () => {
    expect(await trocarFotoPessoalDaSessao(await sessao(tokenB), imagem1, null, { base: db })).toBe('ok');
    expect((await sessao(tokenA)).usuario.fotoArquivo).toBeNull();
    const s = await sessao(tokenA);
    await db.usuarioErp.update({ where: { id: pessoaId }, data: { versaoCredencial: { increment: 1 } } });
    expect(await trocarFotoPessoalDaSessao(s, null, imagem2, { base: db })).toBe('sessao');
    expect((await db.usuarioErp.findUniqueOrThrow({ where: { id: pessoaId } })).fotoArquivo).toBeNull();
  });
});
