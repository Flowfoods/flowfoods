/**
 * Acesso das pessoas dos parceiros (0.3) — o ÚNICO módulo que toca nas tabelas
 * de credencial: UsuarioErp, AcessoParceiro, ConviteAcesso, PasskeyErp,
 * DesafioWebauthn, SessaoErp e TentativaEntradaErp (`MODELOS_DE_CREDENCIAL`).
 *
 * Por que fora do tenant: e-mail, senha, link, rosto e sessão são lidos ANTES
 * de saber o parceiro (no login), então não cabem na RLS por parceiro. Em
 * troca: o `prisma` do portal recusa estes modelos em runtime, o teste-guarda
 * reprova uso fora daqui, o papel `erp_tenant` não tem GRANT neles, e o que
 * muda no acesso vai para o `HistoricoAlteracao` DO parceiro na mesma
 * transação (`fecharComHistorico`).
 *
 * Quem chama decide a sessão: as funções de nível 1 recebem o `parceiroId` já
 * resolvido por `exigirParceiro` (sessão do /rodolfo); as da pessoa recebem a
 * sessão validada aqui mesmo (`validarSessao`).
 *
 * `opcoes.base` aponta o banco de teste; `opcoes.agora` fixa o relógio.
 */

import bcrypt from 'bcryptjs';
import type { AcessoStatus, ParceiroFlow, Prisma, PrismaClient } from '@prisma/client';
import { baseDoErp } from './base';
import { ehErroDeUnicidade, fecharComHistorico, papelDisponivel, type RegistroDeHistorico } from './tenant';
import {
  CUSTO_BCRYPT,
  ERRO_DE_BLOQUEIO,
  ERRO_DE_ENTRADA,
  ERRO_DE_ROSTO,
  LIMITE_DE_TENTATIVAS,
  VALIDADE_DA_SESSAO_MS,
  VALIDADE_DO_DESAFIO_MS,
  VALIDADE_DO_LINK_MS,
  conferirSenhaNova,
  excedeuLimite,
  formNovoAcesso,
  gerarToken,
  hashDoToken,
  normalizarEmail,
  tokenTemFormato,
} from './acesso';
import {
  configDoRosto,
  desafioDaResposta,
  opcoesDeEntrada,
  opcoesDeRegistro,
  usuarioDaResposta,
  verificarEntrada,
  verificarRegistro,
  type AuthenticationResponseJSON,
  type ConfigDoRosto,
  type RegistrationResponseJSON,
} from './rosto';

export interface Opcoes {
  base?: PrismaClient;
  agora?: Date;
  rosto?: ConfigDoRosto;
}

function abrir(o: Opcoes = {}) {
  return { db: o.base ?? baseDoErp(), agora: o.agora ?? new Date() };
}

const ENTIDADE = 'AcessoParceiro';

// =================================================================== nível 1

export interface LinhaDeAcesso {
  acessoId: string;
  usuarioId: string;
  nome: string;
  email: string;
  status: AcessoStatus;
  senhaDefinida: boolean;
  ultimoLogin: Date | null;
  rostos: number;
  /** Link ainda válido e não usado (o token em si não existe mais aqui). */
  linkValeAte: Date | null;
  criadoEm: Date;
}

/** Pessoas com acesso a este parceiro (tela "Acessos" do nível 1). */
export async function listarAcessos(parceiroId: string, o?: Opcoes): Promise<LinhaDeAcesso[]> {
  const { db, agora } = abrir(o);
  const linhas = await db.acessoParceiro.findMany({
    where: { parceiroId },
    include: {
      usuario: {
        include: {
          _count: { select: { passkeys: true } },
          convites: {
            where: { parceiroId, usadoEm: null, revogadoEm: null, expiraEm: { gt: agora } },
            orderBy: { criadoEm: 'desc' },
            take: 1,
            select: { expiraEm: true },
          },
        },
      },
    },
    orderBy: [{ status: 'asc' }, { criadoEm: 'asc' }],
  });
  return linhas.map((a) => ({
    acessoId: a.id,
    usuarioId: a.usuarioId,
    nome: a.usuario.nome,
    email: a.usuario.email,
    status: a.status,
    senhaDefinida: !!a.usuario.senhaHash,
    ultimoLogin: a.usuario.ultimoLogin,
    rostos: a.usuario._count.passkeys,
    linkValeAte: a.usuario.convites[0]?.expiraEm ?? null,
    criadoEm: a.criadoEm,
  }));
}

export type ResultadoDeAcesso =
  | { ok: true; mensagem: string; link: { token: string; expiraEm: Date } | null }
  | { ok: false; erros: Partial<Record<'nome' | 'email' | 'geral', string>> };

/** Revoga os links pendentes da pessoa e cria um novo. Devolve o token (só existe aqui). */
async function novoConvite(tx: Prisma.TransactionClient, usuarioId: string, parceiroId: string, agora: Date) {
  await tx.conviteAcesso.updateMany({
    where: { usuarioId, usadoEm: null, revogadoEm: null },
    data: { revogadoEm: agora },
  });
  const token = gerarToken();
  const expiraEm = new Date(agora.getTime() + VALIDADE_DO_LINK_MS);
  await tx.conviteAcesso.create({
    data: { usuarioId, parceiroId, tokenHash: hashDoToken(token), expiraEm, criadoEm: agora },
  });
  return { token, expiraEm };
}

/**
 * Nível 1 cria o acesso de uma pessoa a este parceiro. E-mail novo: nasce o
 * usuário e o link de primeiro acesso. E-mail que já entra em outro parceiro:
 * só ganha o vínculo (a senha e o rosto são os mesmos).
 */
export async function criarAcesso(
  parceiroId: string,
  entrada: Record<string, unknown>,
  autorNome: string,
  o?: Opcoes,
): Promise<ResultadoDeAcesso> {
  const r = formNovoAcesso.safeParse(entrada);
  if (!r.success) {
    const erros: Record<string, string> = {};
    for (const i of r.error.issues) erros[String(i.path[0] ?? 'geral')] ??= i.message;
    return { ok: false, erros };
  }
  const { db, agora } = abrir(o);
  const papel = await papelDisponivel(db);
  try {
    return await db.$transaction(async (tx) => {
      let usuario = await tx.usuarioErp.findUnique({ where: { email: r.data.email } });
      if (usuario) {
        const ja = await tx.acessoParceiro.findUnique({
          where: { parceiroId_usuarioId: { parceiroId, usuarioId: usuario.id } },
        });
        if (ja) return { ok: false as const, erros: { email: 'Essa pessoa já tem acesso a este parceiro.' } };
      } else {
        usuario = await tx.usuarioErp.create({ data: { email: r.data.email, nome: r.data.nome, criadoEm: agora } });
      }
      const acesso = await tx.acessoParceiro.create({ data: { parceiroId, usuarioId: usuario.id, criadoEm: agora } });

      const historico: RegistroDeHistorico[] = [
        {
          entidade: ENTIDADE,
          entidadeId: acesso.id,
          acao: 'CRIOU',
          depois: { nome: usuario.nome, email: usuario.email, status: acesso.status },
          autorNome,
        },
      ];
      let link: { token: string; expiraEm: Date } | null = null;
      if (!usuario.senhaHash) {
        link = await novoConvite(tx, usuario.id, parceiroId, agora);
        historico.push({
          entidade: ENTIDADE,
          entidadeId: acesso.id,
          acao: 'GEROU_LINK',
          depois: { linkValeAte: link.expiraEm.toISOString() },
          autorNome,
        });
      }
      await fecharComHistorico(tx, parceiroId, historico, papel);
      return {
        ok: true as const,
        link,
        mensagem: link
          ? `Acesso de ${usuario.nome} criado. Copie o link e mande para a pessoa.`
          : `${usuario.nome} já tinha senha (entra em outro parceiro) e agora vê este também.`,
      };
    });
  } catch (e) {
    if (ehErroDeUnicidade(e)) return { ok: false, erros: { email: 'Esse e-mail acabou de ser cadastrado. Recarregue.' } };
    throw e;
  }
}

async function acessoDoParceiro(tx: Prisma.TransactionClient, parceiroId: string, acessoId: string) {
  return tx.acessoParceiro.findFirst({ where: { id: acessoId, parceiroId }, include: { usuario: true } });
}

export type ResultadoSimples = { ok: true; mensagem: string } | { ok: false; erro: string };

/**
 * Desativar derruba as sessões da pessoa NESTE parceiro (e a validação de
 * sessão confere o vínculo a cada requisição, então nada sobrevive). Reativar
 * volta a deixar entrar com a senha e o rosto que ela já tinha.
 */
export async function mudarStatusDoAcesso(
  parceiroId: string,
  acessoId: string,
  novo: AcessoStatus,
  autorNome: string,
  o?: Opcoes,
): Promise<ResultadoSimples> {
  const { db, agora } = abrir(o);
  const papel = await papelDisponivel(db);
  return db.$transaction(async (tx) => {
    const a = await acessoDoParceiro(tx, parceiroId, acessoId);
    if (!a) return { ok: false as const, erro: 'Acesso não encontrado neste parceiro.' };
    if (a.status === novo) return { ok: true as const, mensagem: 'Nada mudou.' };
    const { count } = await tx.acessoParceiro.updateMany({
      where: { id: a.id, parceiroId, status: a.status },
      data: { status: novo },
    });
    if (count === 0) return { ok: false as const, erro: 'O acesso mudou enquanto você decidia. Recarregue.' };
    if (novo === 'DESATIVADO') {
      await tx.sessaoErp.updateMany({
        where: { usuarioId: a.usuarioId, parceiroId, encerradaEm: null },
        data: { encerradaEm: agora },
      });
      // Link pendente também morre: quem foi desativado não define senha.
      await tx.conviteAcesso.updateMany({
        where: { usuarioId: a.usuarioId, parceiroId, usadoEm: null, revogadoEm: null },
        data: { revogadoEm: agora },
      });
    }
    await fecharComHistorico(
      tx,
      parceiroId,
      [
        {
          entidade: ENTIDADE,
          entidadeId: a.id,
          acao: novo === 'DESATIVADO' ? 'DESATIVOU' : 'REATIVOU',
          antes: { nome: a.usuario.nome, status: a.status },
          depois: { nome: a.usuario.nome, status: novo },
          autorNome,
        },
      ],
      papel,
    );
    return {
      ok: true as const,
      mensagem: novo === 'DESATIVADO' ? `${a.usuario.nome} não entra mais neste parceiro.` : `${a.usuario.nome} pode entrar de novo.`,
    };
  });
}

/** Novo link (primeiro acesso ou nova senha). O anterior deixa de valer. */
export async function gerarNovoLink(
  parceiroId: string,
  acessoId: string,
  autorNome: string,
  o?: Opcoes,
): Promise<{ ok: true; token: string; expiraEm: Date; nome: string } | { ok: false; erro: string }> {
  const { db, agora } = abrir(o);
  const papel = await papelDisponivel(db);
  return db.$transaction(async (tx) => {
    const a = await acessoDoParceiro(tx, parceiroId, acessoId);
    if (!a) return { ok: false as const, erro: 'Acesso não encontrado neste parceiro.' };
    if (a.status !== 'ATIVO') return { ok: false as const, erro: 'Reative o acesso antes de gerar um link.' };
    const link = await novoConvite(tx, a.usuarioId, parceiroId, agora);
    await fecharComHistorico(
      tx,
      parceiroId,
      [
        {
          entidade: ENTIDADE,
          entidadeId: a.id,
          acao: 'GEROU_LINK',
          depois: { nome: a.usuario.nome, linkValeAte: link.expiraEm.toISOString() },
          autorNome,
        },
      ],
      papel,
    );
    return { ok: true as const, ...link, nome: a.usuario.nome };
  });
}

// ===================================================== link de primeiro acesso

export type EstadoDoLink =
  | { valido: true; nome: string; email: string; primeiraVez: boolean }
  | { valido: false };

async function conviteValido(db: PrismaClient | Prisma.TransactionClient, token: unknown, agora: Date) {
  if (!tokenTemFormato(token)) return null;
  const c = await db.conviteAcesso.findUnique({ where: { tokenHash: hashDoToken(token) }, include: { usuario: true } });
  if (!c || c.usadoEm || c.revogadoEm || c.expiraEm <= agora) return null;
  // Link de um parceiro em que a pessoa foi desativada não vale.
  const v = await db.acessoParceiro.findUnique({
    where: { parceiroId_usuarioId: { parceiroId: c.parceiroId, usuarioId: c.usuarioId } },
  });
  if (!v || v.status !== 'ATIVO') return null;
  return { convite: c, acessoId: v.id };
}

/** Para a tela do link: vale? de quem é? (Usado, vencido e inexistente dão a mesma resposta.) */
export async function consultarLink(token: unknown, o?: Opcoes): Promise<EstadoDoLink> {
  const { db, agora } = abrir(o);
  const c = await conviteValido(db, token, agora);
  if (!c) return { valido: false };
  return { valido: true, nome: c.convite.usuario.nome, email: c.convite.usuario.email, primeiraVez: !c.convite.usuario.senhaHash };
}

/**
 * A pessoa define a senha pelo link. O banco segura o uso único: a marcação
 * de "usado" é condicional (não usado, não revogado, não vencido) e só uma
 * transação consegue. Trocar a senha derruba as sessões abertas da pessoa.
 */
export async function definirSenhaPeloLink(
  token: unknown,
  senha: string,
  confirmacao: string,
  o?: Opcoes,
): Promise<{ ok: true; email: string } | { ok: false; erro: string; linkInvalido?: boolean }> {
  const { db, agora } = abrir(o);
  const antes = await conviteValido(db, token, agora);
  if (!antes) return { ok: false, erro: 'Este link não vale mais. Peça um novo à FlowFoods.', linkInvalido: true };
  const problema = conferirSenhaNova(senha, confirmacao, antes.convite.usuario.email);
  if (problema) return { ok: false, erro: problema };

  const senhaHash = await bcrypt.hash(senha, CUSTO_BCRYPT);
  const papel = await papelDisponivel(db);
  return db.$transaction(async (tx) => {
    const { count } = await tx.conviteAcesso.updateMany({
      where: { id: antes.convite.id, usadoEm: null, revogadoEm: null, expiraEm: { gt: agora } },
      data: { usadoEm: agora },
    });
    if (count === 0) return { ok: false as const, erro: 'Este link não vale mais. Peça um novo à FlowFoods.', linkInvalido: true };
    const u = await tx.usuarioErp.update({
      where: { id: antes.convite.usuarioId },
      data: { senhaHash, senhaDefinidaEm: agora },
    });
    await tx.sessaoErp.updateMany({ where: { usuarioId: u.id, encerradaEm: null }, data: { encerradaEm: agora } });
    await fecharComHistorico(
      tx,
      antes.convite.parceiroId,
      [
        {
          entidade: ENTIDADE,
          entidadeId: antes.acessoId,
          acao: antes.convite.usuario.senhaHash ? 'TROCOU_SENHA' : 'DEFINIU_SENHA',
          depois: { nome: u.nome, senha: 'definida pela pessoa' },
          autorNome: u.nome,
        },
      ],
      papel,
    );
    return { ok: true as const, email: u.email };
  });
}

// ===================================================================== entrar

export type ResultadoDeEntrada =
  | { ok: true; token: string; expiraEm: Date; escolher: boolean }
  | { ok: false; erro: string; bloqueado: boolean };

/** Hash de mentira: compara mesmo sem usuário, para o tempo não denunciar quem existe. */
let hashDeMentira: Promise<string> | null = null;
function compararSempre(senha: string, hash: string | null | undefined) {
  hashDeMentira ??= bcrypt.hash('flowfoods-nao-e-senha', CUSTO_BCRYPT);
  return hash ? bcrypt.compare(senha, hash) : hashDeMentira.then((h) => bcrypt.compare(senha, h)).then(() => false);
}

type Db = PrismaClient | Prisma.TransactionClient;

async function contarFalhas(db: Db, email: string | null, ip: string, agora: Date) {
  const desde = new Date(agora.getTime() - LIMITE_DE_TENTATIVAS.janelaMs);
  let desdeEmail = desde;
  if (email) {
    const ok = await db.tentativaEntradaErp.findFirst({
      where: { email, ok: true, criadoEm: { gte: desde } },
      orderBy: { criadoEm: 'desc' },
      select: { criadoEm: true },
    });
    if (ok) desdeEmail = ok.criadoEm;
  }
  const porEmail = email
    ? await db.tentativaEntradaErp.count({ where: { email, ok: false, criadoEm: { gt: desdeEmail } } })
    : 0;
  const porIp = await db.tentativaEntradaErp.count({ where: { ip, ok: false, criadoEm: { gte: desde } } });
  return { porEmail, porIp };
}

/** Falhas recentes: por e-mail desde o último acerto (na janela) e por IP na janela toda. */
export async function falhasRecentes(email: string | null, ip: string, o?: Opcoes) {
  const { db, agora } = abrir(o);
  return contarFalhas(db, email, ip, agora);
}

/**
 * Trava por chave até o fim da transação (pg_advisory_xact_lock). Ordem fixa:
 * e-mail antes de IP, e ninguém trava IP antes de e-mail — sem deadlock.
 */
async function travar(tx: Prisma.TransactionClient, chave: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${chave}, 0))::text AS "trava"`;
}

type Tentativa = { email: string | null; ip: string; metodo: 'SENHA' | 'ROSTO' };

/**
 * CONTA E RESERVA numa transação só, sob trava do e-mail e do IP: a tentativa
 * entra no banco como falha ("EM_ANDAMENTO") ANTES do bcrypt/verificação. Com
 * 60 pedidos simultâneos, cada um espera a trava, vê as reservas dos
 * anteriores e, passado o limite, é recusado sem testar a senha. Devolve o id
 * da reserva, ou null se bloqueado (registrado como BLOQUEADO).
 */
async function reservarTentativa(db: PrismaClient, t: Tentativa, agora: Date): Promise<string | null> {
  return db.$transaction(async (tx) => {
    if (t.email) await travar(tx, `erp-entrada:email:${t.email}`);
    await travar(tx, `erp-entrada:ip:${t.ip}`);
    const f = await contarFalhas(tx, t.email, t.ip, agora);
    const bloqueado = excedeuLimite(f.porEmail, f.porIp);
    const r = await tx.tentativaEntradaErp.create({
      data: { ...t, ok: false, motivo: bloqueado ? 'BLOQUEADO' : 'EM_ANDAMENTO', criadoEm: agora },
      select: { id: true },
    });
    return bloqueado ? null : r.id;
  }, { maxWait: 10_000, timeout: 10_000 });
}

/** Resultado da tentativa reservada (a reserva já contava como falha). */
async function concluirTentativa(
  db: PrismaClient,
  id: string,
  r: { ok: boolean; motivo: string; usuarioId?: string; email?: string },
) {
  await db.tentativaEntradaErp.update({
    where: { id },
    data: { ok: r.ok, motivo: r.motivo.slice(0, 200), usuarioId: r.usuarioId ?? null, ...(r.email ? { email: r.email } : {}) },
  });
}

/** Abre a sessão: parceiro já escolhido se a pessoa só tem um. */
async function abrirSessao(
  db: PrismaClient,
  usuarioId: string,
  metodo: 'SENHA' | 'ROSTO',
  ip: string,
  agora: Date,
): Promise<{ token: string; expiraEm: Date; escolher: boolean } | null> {
  const ativos = await db.acessoParceiro.findMany({ where: { usuarioId, status: 'ATIVO' }, select: { parceiroId: true } });
  if (ativos.length === 0) return null;
  const token = gerarToken();
  const expiraEm = new Date(agora.getTime() + VALIDADE_DA_SESSAO_MS);
  await db.$transaction([
    db.sessaoErp.create({
      data: {
        tokenHash: hashDoToken(token),
        usuarioId,
        parceiroId: ativos.length === 1 ? ativos[0].parceiroId : null,
        metodo,
        ip,
        criadoEm: agora,
        expiraEm,
      },
    }),
    db.usuarioErp.update({ where: { id: usuarioId }, data: { ultimoLogin: agora } }),
  ]);
  return { token, expiraEm, escolher: ativos.length > 1 };
}

/**
 * E-mail e senha. Mensagem única para e-mail inexistente, senha errada,
 * senha ainda não definida e acesso desativado. Limite por e-mail E por IP,
 * conferido ANTES do bcrypt. Toda tentativa fica registrada.
 */
export async function entrarComSenha(
  entrada: { email: unknown; senha: unknown; ip: string },
  o?: Opcoes,
): Promise<ResultadoDeEntrada> {
  const { db, agora } = abrir(o);
  const email = normalizarEmail(entrada.email);
  const emailRegistro = email ?? (typeof entrada.email === 'string' ? entrada.email.trim().toLowerCase().slice(0, 160) : null);
  const senha = typeof entrada.senha === 'string' ? entrada.senha : '';

  // Limite conferido e tentativa reservada ANTES do bcrypt, atomicamente.
  const reserva = await reservarTentativa(db, { email: emailRegistro || null, ip: entrada.ip, metodo: 'SENHA' }, agora);
  if (!reserva) return { ok: false, erro: ERRO_DE_BLOQUEIO, bloqueado: true };

  const usuario = email ? await db.usuarioErp.findUnique({ where: { email } }) : null;
  const confere = await compararSempre(senha.slice(0, 200), usuario?.senhaHash);
  if (!usuario || !usuario.senhaHash || !confere) {
    const motivo = !usuario ? 'SEM_USUARIO' : !usuario.senhaHash ? 'SEM_SENHA' : 'SENHA_ERRADA';
    await concluirTentativa(db, reserva, { ok: false, motivo, usuarioId: usuario?.id });
    return { ok: false, erro: ERRO_DE_ENTRADA, bloqueado: false };
  }

  const sessao = await abrirSessao(db, usuario.id, 'SENHA', entrada.ip, agora);
  if (!sessao) {
    await concluirTentativa(db, reserva, { ok: false, motivo: 'SEM_ACESSO', usuarioId: usuario.id });
    return { ok: false, erro: ERRO_DE_ENTRADA, bloqueado: false };
  }
  await concluirTentativa(db, reserva, { ok: true, motivo: 'OK', usuarioId: usuario.id });
  return { ok: true, ...sessao };
}

// ====================================================================== rosto

/** Desafios abertos ao mesmo tempo: por IP (entrar) e por pessoa (ativar). */
export const DESAFIOS_ABERTOS_POR_IP = 10;
export const DESAFIOS_ABERTOS_POR_PESSOA = 3;

/** Pedido de desafio recusado: muitos abertos, ou IP já bloqueado por falhas. */
export class LimiteDoRosto extends Error {
  constructor() {
    super(ERRO_DE_BLOQUEIO);
    this.name = 'LimiteDoRosto';
  }
}

/**
 * Guarda o desafio com teto de abertos (trava por IP ou pessoa): ninguém
 * inunda a tabela pedindo desafio sem parar. Faxina dos vencidos junto.
 */
async function guardarDesafio(
  db: PrismaClient,
  desafio: string,
  tipo: 'REGISTRO' | 'ENTRADA',
  dono: { usuarioId: string } | { ip: string },
  agora: Date,
) {
  await db.$transaction(async (tx) => {
    const porPessoa = 'usuarioId' in dono;
    await travar(tx, porPessoa ? `erp-desafio:usuario:${dono.usuarioId}` : `erp-desafio:ip:${dono.ip}`);
    await tx.desafioWebauthn.deleteMany({ where: { expiraEm: { lt: agora } } });
    if (porPessoa) {
      const abertos = await tx.desafioWebauthn.count({ where: { usuarioId: dono.usuarioId, expiraEm: { gt: agora } } });
      if (abertos >= DESAFIOS_ABERTOS_POR_PESSOA) throw new LimiteDoRosto();
    } else {
      const abertos = await tx.desafioWebauthn.count({ where: { ip: dono.ip, expiraEm: { gt: agora } } });
      const falhas = await contarFalhas(tx, null, dono.ip, agora);
      if (abertos >= DESAFIOS_ABERTOS_POR_IP || excedeuLimite(0, falhas.porIp)) throw new LimiteDoRosto();
    }
    await tx.desafioWebauthn.create({
      data: {
        desafio,
        tipo,
        usuarioId: porPessoa ? dono.usuarioId : null,
        ip: porPessoa ? null : dono.ip,
        criadoEm: agora,
        expiraEm: new Date(agora.getTime() + VALIDADE_DO_DESAFIO_MS),
      },
    });
  });
}

/**
 * Uso único: apaga o desafio SE ele existe, é do tipo e da pessoa certos e não
 * venceu. Duas respostas com o mesmo desafio: só uma consegue apagar.
 */
export async function consumirDesafio(
  desafio: string | null,
  tipo: 'REGISTRO' | 'ENTRADA',
  usuarioId: string | null,
  o?: Opcoes,
): Promise<boolean> {
  if (!desafio) return false;
  const { db, agora } = abrir(o);
  const { count } = await db.desafioWebauthn.deleteMany({
    where: { desafio, tipo, usuarioId, expiraEm: { gt: agora } },
  });
  return count === 1;
}

/** Opções para a tela de login ("Entrar com o rosto"). Estoura `LimiteDoRosto` se o IP passou do teto. */
export async function iniciarEntradaComRosto(ip: string, o?: Opcoes) {
  const { db, agora } = abrir(o);
  const cfg = o?.rosto ?? configDoRosto();
  const opcoes = await opcoesDeEntrada(cfg);
  await guardarDesafio(db, opcoes.challenge, 'ENTRADA', { ip }, agora);
  return opcoes;
}

/**
 * Entrada pelo rosto. O aparelho já conferiu a pessoa (verificação
 * obrigatória); aqui conferimos desafio (uma vez só), assinatura com a chave
 * pública guardada, origem, domínio e contador — e se ela ainda tem acesso.
 * Limite por IP (não há e-mail digitado).
 */
export async function entrarComRosto(
  resposta: AuthenticationResponseJSON,
  ip: string,
  o?: Opcoes,
): Promise<ResultadoDeEntrada> {
  const { db, agora } = abrir(o);
  const cfg = o?.rosto ?? configDoRosto();
  const reserva = await reservarTentativa(db, { email: null, ip, metodo: 'ROSTO' }, agora);
  if (!reserva) return { ok: false, erro: ERRO_DE_BLOQUEIO, bloqueado: true };
  const falha = async (motivo: string, usuarioId?: string, email?: string) => {
    await concluirTentativa(db, reserva, { ok: false, motivo, usuarioId, email });
    return { ok: false as const, erro: ERRO_DE_ROSTO, bloqueado: false };
  };

  const desafio = desafioDaResposta(resposta);
  if (!(await consumirDesafio(desafio, 'ENTRADA', null, { base: db, agora }))) return falha('ROSTO_DESAFIO');

  const id = typeof resposta?.id === 'string' ? resposta.id.slice(0, 1024) : '';
  const passkey = id ? await db.passkeyErp.findUnique({ where: { credencialId: id }, include: { usuario: true } }) : null;
  if (!passkey) return falha('ROSTO_DESCONHECIDO');
  const dono = usuarioDaResposta(resposta);
  if (dono !== null && dono !== passkey.usuarioId) return falha('ROSTO_OUTRA_PESSOA', passkey.usuarioId, passkey.usuario.email);

  const v = await verificarEntrada(cfg, resposta, desafio!, {
    credencialId: passkey.credencialId,
    chavePublica: passkey.chavePublica,
    contador: Number(passkey.contador),
    transportes: passkey.transportes,
  });
  if (!v.ok) return falha(`ROSTO_INVALIDO: ${v.motivo}`.slice(0, 200), passkey.usuarioId, passkey.usuario.email);

  // Contador condicional ao lido: duas entradas com a mesma assinatura não passam.
  const { count } = await db.passkeyErp.updateMany({
    where: { id: passkey.id, contador: passkey.contador },
    data: { contador: BigInt(v.novoContador), ultimoUsoEm: agora },
  });
  if (count === 0) return falha('ROSTO_CONTADOR', passkey.usuarioId, passkey.usuario.email);

  const sessao = await abrirSessao(db, passkey.usuarioId, 'ROSTO', ip, agora);
  if (!sessao) return falha('SEM_ACESSO', passkey.usuarioId, passkey.usuario.email);
  await concluirTentativa(db, reserva, { ok: true, motivo: 'OK', usuarioId: passkey.usuarioId, email: passkey.usuario.email });
  return { ok: true, ...sessao };
}

/**
 * Ativar o rosto pede sessão aberta COM SENHA há pouco tempo: um cookie
 * roubado (ou um celular emprestado dias depois) não consegue pendurar um
 * aparelho novo na conta. Passou do prazo: entra de novo com a senha.
 */
export const JANELA_PARA_ATIVAR_ROSTO_MS = 30 * 60 * 1000;

export function podeAtivarRosto(sessao: Pick<SessaoValida, 'metodo' | 'criadaEm'>, agora = new Date()): boolean {
  return sessao.metodo === 'SENHA' && agora.getTime() - sessao.criadaEm.getTime() <= JANELA_PARA_ATIVAR_ROSTO_MS;
}

export const ERRO_ATIVAR_ROSTO = 'Por segurança, entre de novo com a senha para ativar o rosto.';

/** Opções para "Ativar entrada por rosto neste aparelho" (pessoa já logada). */
export async function iniciarRegistroDeRosto(sessao: SessaoValida, o?: Opcoes) {
  const { db, agora } = abrir(o);
  if (!podeAtivarRosto(sessao, agora)) throw new Error(ERRO_ATIVAR_ROSTO);
  const cfg = o?.rosto ?? configDoRosto();
  const existentes = await db.passkeyErp.findMany({
    where: { usuarioId: sessao.usuario.id },
    select: { credencialId: true, transportes: true },
  });
  const opcoes = await opcoesDeRegistro(cfg, sessao.usuario, existentes);
  await guardarDesafio(db, opcoes.challenge, 'REGISTRO', { usuarioId: sessao.usuario.id }, agora);
  return opcoes;
}

export async function concluirRegistroDeRosto(
  sessao: SessaoValida,
  resposta: RegistrationResponseJSON,
  aparelho: string,
  o?: Opcoes,
): Promise<ResultadoSimples> {
  const { db, agora } = abrir(o);
  const cfg = o?.rosto ?? configDoRosto();
  if (!podeAtivarRosto(sessao, agora)) return { ok: false, erro: ERRO_ATIVAR_ROSTO };
  const desafio = desafioDaResposta(resposta);
  if (!(await consumirDesafio(desafio, 'REGISTRO', sessao.usuario.id, { base: db, agora }))) {
    return { ok: false, erro: 'O pedido venceu. Toque em ativar de novo.' };
  }
  const v = await verificarRegistro(cfg, resposta, desafio!);
  if (!v.ok) return { ok: false, erro: 'O aparelho não confirmou. Tente de novo.' };

  const papel = await papelDisponivel(db);
  try {
    await db.$transaction(async (tx) => {
      await tx.passkeyErp.create({
        data: {
          usuarioId: sessao.usuario.id,
          credencialId: v.credencialId,
          chavePublica: Buffer.from(v.chavePublica),
          contador: BigInt(v.contador),
          transportes: v.transportes,
          aparelho: aparelho.slice(0, 60),
          sincronizada: v.sincronizada,
          criadoEm: agora,
        },
      });
      if (sessao.parceiro && sessao.acessoId) {
        await fecharComHistorico(
          tx,
          sessao.parceiro.id,
          [
            {
              entidade: ENTIDADE,
              entidadeId: sessao.acessoId,
              acao: 'ATIVOU_ROSTO',
              depois: { nome: sessao.usuario.nome, aparelho },
              autorNome: sessao.usuario.nome,
            },
          ],
          papel,
        );
      }
    });
  } catch (e) {
    if (ehErroDeUnicidade(e)) return { ok: false, erro: 'Este aparelho já está ativado.' };
    throw e;
  }
  return { ok: true, mensagem: 'Pronto. Na próxima vez, toque em “Entrar com o rosto”.' };
}

export async function listarRostos(usuarioId: string, o?: Opcoes) {
  const { db } = abrir(o);
  return db.passkeyErp.findMany({
    where: { usuarioId },
    select: { id: true, aparelho: true, criadoEm: true, ultimoUsoEm: true, sincronizada: true },
    orderBy: { criadoEm: 'asc' },
  });
}

export async function removerRosto(sessao: SessaoValida, passkeyId: string, o?: Opcoes): Promise<ResultadoSimples> {
  const { db } = abrir(o);
  const papel = await papelDisponivel(db);
  return db.$transaction(async (tx) => {
    const p = await tx.passkeyErp.findFirst({ where: { id: passkeyId, usuarioId: sessao.usuario.id } });
    if (!p) return { ok: false as const, erro: 'Aparelho não encontrado.' };
    await tx.passkeyErp.delete({ where: { id: p.id } });
    if (sessao.parceiro && sessao.acessoId) {
      await fecharComHistorico(
        tx,
        sessao.parceiro.id,
        [
          {
            entidade: ENTIDADE,
            entidadeId: sessao.acessoId,
            acao: 'REMOVEU_ROSTO',
            antes: { nome: sessao.usuario.nome, aparelho: p.aparelho },
            autorNome: sessao.usuario.nome,
          },
        ],
        papel,
      );
    }
    return { ok: true as const, mensagem: `${p.aparelho} não entra mais pelo rosto.` };
  });
}

// ===================================================================== sessão

export interface SessaoValida {
  sessaoId: string;
  metodo: 'SENHA' | 'ROSTO';
  criadaEm: Date;
  usuario: { id: string; nome: string; email: string };
  /** Parceiro da sessão; null = a pessoa tem mais de um e ainda vai escolher. */
  parceiro: ParceiroFlow | null;
  /** Vínculo com o parceiro da sessão (para o histórico). */
  acessoId: string | null;
  /** Parceiros em que a pessoa tem acesso ATIVO. */
  parceiros: Pick<ParceiroFlow, 'id' | 'nome' | 'slug' | 'status'>[];
}

/**
 * Sessão de pé? Confere, a CADA requisição: token, validade, encerramento e
 * vínculo ATIVO com o parceiro da sessão. Acesso desativado = sessão morta já
 * na próxima requisição.
 */
export async function validarSessao(token: unknown, o?: Opcoes): Promise<SessaoValida | null> {
  if (!tokenTemFormato(token)) return null;
  const { db, agora } = abrir(o);
  const s = await db.sessaoErp.findUnique({
    where: { tokenHash: hashDoToken(token) },
    include: {
      usuario: {
        include: { acessos: { where: { status: 'ATIVO' }, include: { parceiro: true } } },
      },
    },
  });
  if (!s || s.encerradaEm || s.expiraEm <= agora) return null;
  const vinculos = s.usuario.acessos;
  const atual = s.parceiroId ? vinculos.find((a) => a.parceiroId === s.parceiroId) : null;
  if (vinculos.length === 0 || (s.parceiroId && !atual)) {
    await db.sessaoErp.updateMany({ where: { id: s.id, encerradaEm: null }, data: { encerradaEm: agora } });
    return null;
  }
  return {
    sessaoId: s.id,
    metodo: s.metodo,
    criadaEm: s.criadoEm,
    usuario: { id: s.usuario.id, nome: s.usuario.nome, email: s.usuario.email },
    parceiro: atual?.parceiro ?? null,
    acessoId: atual?.id ?? null,
    parceiros: vinculos
      .map((a) => ({ id: a.parceiro.id, nome: a.parceiro.nome, slug: a.parceiro.slug, status: a.parceiro.status }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  };
}

/** Quem tem mais de um parceiro escolhe; o servidor confere o vínculo. */
export async function escolherParceiro(token: unknown, parceiroId: unknown, o?: Opcoes): Promise<boolean> {
  const s = await validarSessao(token, o);
  if (!s || typeof parceiroId !== 'string' || !s.parceiros.some((p) => p.id === parceiroId)) return false;
  const { db } = abrir(o);
  const { count } = await db.sessaoErp.updateMany({
    where: { id: s.sessaoId, encerradaEm: null },
    data: { parceiroId },
  });
  return count === 1;
}

export async function encerrarSessao(token: unknown, o?: Opcoes): Promise<void> {
  if (!tokenTemFormato(token)) return;
  const { db, agora } = abrir(o);
  await db.sessaoErp.updateMany({ where: { tokenHash: hashDoToken(token), encerradaEm: null }, data: { encerradaEm: agora } });
}
