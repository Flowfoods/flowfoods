/**
 * Acesso das pessoas dos parceiros (0.3/0.4) — o ÚNICO módulo que toca nas
 * tabelas de credencial: UsuarioErp, AcessoParceiro, ConviteAcesso, PasskeyErp,
 * DesafioWebauthn, SessaoErp, TentativaEntradaErp e PerfilAcesso
 * (`MODELOS_DE_CREDENCIAL`). Na 0.4 o vínculo ganhou perfil, setores, lojas e
 * ajuste por pessoa; a regra pura está em `permissoes.ts` e `equipe.ts`.
 *
 * Por que fora do tenant: e-mail, senha, link, rosto e sessão são lidos ANTES
 * de saber o parceiro (no login), então não cabem na RLS por parceiro. Em
 * troca: o `prisma` do portal recusa estes modelos em runtime, o teste-guarda
 * reprova uso fora daqui, o papel `erp_tenant` não tem GRANT neles, e o que
 * muda no acesso vai para o `HistoricoAlteracao` DO parceiro na mesma
 * transação (`fecharComHistorico`).
 *
 * Quem chama decide a sessão: as funções de equipe recebem o `parceiroId` já
 * resolvido (`exigirParceiro` no /rodolfo, ou o parceiro DA SESSÃO no /erp) e o
 * `Ator` (nível 1 ou a pessoa com "cuidar da equipe"); as da pessoa recebem a
 * sessão validada aqui mesmo (`validarSessao`), que já devolve o alcance.
 *
 * `opcoes.base` aponta o banco de teste; `opcoes.agora` fixa o relógio.
 */

import bcrypt from 'bcryptjs';
import type { AcessoStatus, ParceiroFlow, Prisma, PrismaClient } from '@prisma/client';
import { baseDoErp } from './base';
import { travar } from './trava';
import { doParceiro, ehErroDeUnicidade, fecharComHistorico, papelDisponivel, type RegistroDeHistorico } from './tenant';
import {
  ALCANCE_FLOWFOODS,
  cobre,
  deixaSemAdministrador,
  ehAdministrador,
  faltaParaCobrir,
  normalizarPermissoes,
  normalizarSetores,
  novasDesdeOPerfil,
  permissoesDoPerfil,
  permissoesNoCatalogoAtual,
  resolverAlcance,
  rotuloDaPermissao,
  rotuloDoPerfil,
  VERSAO_DO_CATALOGO,
  type Alcance,
  type PerfilBase,
  type Permissao,
  type Setor,
  type VinculoDePermissao,
} from './permissoes';
import {
  ajusteMinimo,
  diferencaDePermissoes,
  lerPerfil,
  lerPermissoesDaPessoa,
  retratoDaPessoa,
  retratoDoPerfil,
  type PermissoesDaPessoa,
} from './equipe';
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
import { fechamentoValido, normalizarFechadas, pontoValido } from './ajuda';
import { diaDe, itemDoPonto, normalizarPontos, type PreferenciaDeAjuda } from './ajuda-rota';
import { ERRO_DONO_JA_TEM_ACESSO, fraseJaDecidido, FRASE_PEDIDO_MEXIDO, lerAtivacao, type EtapaDoPedido } from './pedido-campos';
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

// =========================================================== equipe (0.3/0.4)
//
// Quem mexe: o nível 1 (FlowFoods, `atorNivel1`) ou uma pessoa do parceiro com
// "cuidar da equipe" (`acessos.gerir`). A action confere com
// `exigirPermissao`, e AQUI DENTRO de novo, na transação (`conferirAtor`): o
// vínculo do ator é deste parceiro, está ATIVO, o parceiro está ATIVO e o
// alcance (relido do banco, não o que veio de fora) inclui cuidar da equipe.
// Aqui dentro, sempre:
//   - SEM ESCALADA: o ator precisa cobrir o que a pessoa tem antes (não mexe em
//     quem está acima) e o que vai ter depois (não sobe ninguém acima de si) —
//     permissões E lojas (`cobre`, permissoes.ts);
//   - ÚLTIMO ADMINISTRADOR: nenhuma mudança deixa o parceiro sem pessoa ativa
//     com "cuidar da equipe" e rede inteira (se havia pelo menos uma);
//   - uma mudança de equipe por vez no parceiro (`pg_advisory_xact_lock`): duas
//     pessoas tirando o acesso uma da outra ao mesmo tempo não zeram os
//     administradores;
//   - antes/depois no histórico do parceiro, na mesma transação.

/** Quem está mudando a equipe. Nível 1: `acessoId` nulo e alcance total. */
export interface Ator {
  nome: string;
  alcance: Alcance;
  /** Vínculo do próprio ator neste parceiro (null = nível 1). */
  acessoId: string | null;
}

export function atorNivel1(nome: string): Ator {
  return { nome, alcance: ALCANCE_FLOWFOODS, acessoId: null };
}

function atorDe(quem: Ator | string): Ator {
  return typeof quem === 'string' ? atorNivel1(quem) : quem;
}

export const ERRO_ULTIMO_ADMIN =
  'Essa mudança deixaria o parceiro sem ninguém para cuidar da equipe. Dê esse acesso (com a rede inteira) a outra pessoa antes.';
export const ERRO_ACIMA_DE_VOCE =
  'Essa pessoa tem acesso maior que o seu. Só quem tem o mesmo acesso (ou a FlowFoods) muda.';
export const ERRO_SEM_GESTAO = 'Seu acesso a este parceiro não inclui cuidar da equipe.';
/** Mensagem que não diz se o e-mail existe (pessoa do parceiro tentando vincular e-mail de outro parceiro). */
export const ERRO_EMAIL_NEUTRO = 'Não foi possível criar o acesso com esse e-mail. Fale com a FlowFoods.';
export const ERRO_LINK_OUTRO_PARCEIRO =
  'Essa pessoa também entra em outro parceiro, e a senha vale para todos. O link de senha nova sai pela FlowFoods.';

type Erros = Partial<Record<string, string>>;

/** Desfaz a transação de equipe e devolve os erros para a tela. */
class Desfazer extends Error {
  constructor(readonly erros: Erros) {
    super('desfazer');
  }
}

/** Vínculo gravado → regra pura. Colunas de lista podem vir nulas de linha antiga. */
type LinhaDeVinculo = {
  perfilBase: PerfilBase | null;
  perfil: { nome: string; permissoes: string[]; catalogoVersao: number } | null;
  permissoesExtras: string[] | null;
  permissoesRemovidas: string[] | null;
  redeInteira: boolean;
  lojaIds: string[] | null;
};

function vinculoDe(a: LinhaDeVinculo): VinculoDePermissao {
  return {
    perfilBase: a.perfilBase,
    perfilProprio: a.perfil?.permissoes ?? null,
    perfilCatalogoVersao: a.perfil?.catalogoVersao ?? null,
    permissoesExtras: a.permissoesExtras ?? [],
    permissoesRemovidas: a.permissoesRemovidas ?? [],
    redeInteira: a.redeInteira,
    lojaIds: a.lojaIds ?? [],
  };
}

function alcanceDe(a: LinhaDeVinculo): Alcance {
  return resolverAlcance(vinculoDe(a));
}

function perfilRotuloDe(a: LinhaDeVinculo): string {
  return rotuloDoPerfil({ perfilBase: a.perfilBase, perfilNome: a.perfil?.nome });
}

const COM_PERFIL = { perfil: { select: { nome: true, permissoes: true, catalogoVersao: true } } } as const;

/** Alcance de cada pessoa ATIVA do parceiro (para a regra do último administrador). */
async function alcancesAtivos(tx: Prisma.TransactionClient, parceiroId: string): Promise<Alcance[]> {
  const vs = await tx.acessoParceiro.findMany({ where: { parceiroId, status: 'ATIVO' }, include: COM_PERFIL });
  return vs.map(alcanceDe);
}

/**
 * Quem age pertence a este parceiro e cuida da equipe? Relido do banco, dentro
 * da transação: não vale o alcance que veio de fora. Nível 1 (`acessoId` nulo,
 * alcance FLOWFOODS) é a sessão do /rodolfo, conferida por quem chama
 * (`exigirNivel1`).
 */
async function conferirAtor(tx: Prisma.TransactionClient, parceiroId: string, ator: Ator): Promise<Ator> {
  if (ator.acessoId === null) {
    if (ator.alcance.nivel !== 'FLOWFOODS') throw new Desfazer({ geral: ERRO_SEM_GESTAO });
    return ator;
  }
  const v = await tx.acessoParceiro.findFirst({
    where: { id: ator.acessoId, parceiroId, status: 'ATIVO' },
    include: { ...COM_PERFIL, parceiro: { select: { status: true } } },
  });
  if (!v) throw new Desfazer({ geral: ERRO_SEM_GESTAO });
  if (v.parceiro.status !== 'ATIVO') {
    throw new Desfazer({ geral: 'Parceiro suspenso ou aguardando liberação: a equipe fica parada até a FlowFoods reativar.' });
  }
  const alcance = alcanceDe(v);
  if (!alcance.permissoes.has('acessos.gerir')) throw new Desfazer({ geral: ERRO_SEM_GESTAO });
  return { nome: ator.nome, alcance, acessoId: v.id };
}

/**
 * Transação de equipe: trava do parceiro, confere o ator, conta administradores antes e
 * depois, histórico no fim. `fn` desfaz com `Desfazer` (validação) — nada fica.
 */
async function naEquipe<T>(
  db: PrismaClient,
  parceiroId: string,
  quem: Ator,
  fn: (
    tx: Prisma.TransactionClient,
    ator: Ator,
  ) => Promise<{ resultado: T; historico: RegistroDeHistorico[]; outrosParceiros?: HistoricoEmOutroParceiro[] }>,
): Promise<T | { ok: false; erros: Erros }> {
  const papel = await papelDisponivel(db);
  try {
    return await db.$transaction(
      async (tx) => {
        await travar(tx, `erp-equipe:${parceiroId}`);
        const ator = await conferirAtor(tx, parceiroId, quem);
        const antes = await alcancesAtivos(tx, parceiroId);
        const r = await fn(tx, ator);
        if (deixaSemAdministrador(antes, await alcancesAtivos(tx, parceiroId))) throw new Desfazer({ geral: ERRO_ULTIMO_ADMIN });
        await fecharComHistorico(tx, parceiroId, r.historico, papel);
        // Depois do primeiro, a transação já está no tenant: só mais histórico.
        for (const h of r.outrosParceiros ?? []) await fecharComHistorico(tx, h.parceiroId, h.registros, papel);
        return r.resultado;
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
  } catch (e) {
    if (e instanceof Desfazer) return { ok: false, erros: e.erros };
    throw e;
  }
}

function simples(r: ResultadoSimples | { ok: false; erros: Erros }): ResultadoSimples {
  if (r.ok || 'erro' in r) return r;
  return { ok: false, erro: Object.values(r.erros)[0] ?? 'Não deu certo.' };
}

/** Lojas do parceiro, pelo portão (somente leitura): a única fonte para validar `lojaIds`. */
async function lojasDoParceiro(db: PrismaClient, parceiroId: string) {
  return doParceiro(parceiroId, db, { somenteLeitura: true }).loja.findMany({
    select: { id: true, nome: true, ativa: true },
    orderBy: [{ ativa: 'desc' }, { nome: 'asc' }],
  });
}

function fraseDeEscalada(ator: Alcance, alvo: Alcance): string {
  const f = faltaParaCobrir(ator, alvo);
  const partes: string[] = [];
  if (f.permissoes.length) {
    const nomes = f.permissoes.slice(0, 3).map((p) => `“${rotuloDaPermissao(p).toLowerCase()}”`);
    const mais = f.permissoes.length > 3 ? ` e mais ${f.permissoes.length - 3}` : '';
    partes.push(`${nomes.join(', ')}${mais}`);
  }
  if (f.lojas) partes.push(alvo.lojas === 'todas' ? 'a rede inteira' : 'loja fora do seu acesso');
  return `Você não pode dar o que não tem: ${partes.join(' e ')}.`;
}

/**
 * Perfil, setores, lojas e ajuste já conferidos contra o parceiro e contra o
 * ator. Devolve as colunas do vínculo e o alcance resultante.
 */
async function prepararPermissoes(
  tx: Prisma.TransactionClient,
  parceiroId: string,
  dados: PermissoesDaPessoa,
  lojas: { id: string; nome: string }[],
  ator: Ator,
) {
  let perfilProprio: { id: string; nome: string; permissoes: string[]; catalogoVersao: number } | null = null;
  if ('proprioId' in dados.perfil) {
    perfilProprio = await tx.perfilAcesso.findFirst({
      where: { id: dados.perfil.proprioId, parceiroId },
      select: { id: true, nome: true, permissoes: true, catalogoVersao: true },
    });
    if (!perfilProprio) throw new Desfazer({ perfil: 'Esse perfil não existe mais neste parceiro. Recarregue.' });
  }
  const perfilBase = 'base' in dados.perfil ? dados.perfil.base : null;
  const ordem = new Map(lojas.map((l, i) => [l.id, i]));
  if (dados.lojaIds.some((id) => !ordem.has(id))) throw new Desfazer({ lojas: 'Loja não encontrada neste parceiro. Recarregue.' });
  const lojaIds = [...dados.lojaIds].sort((a, b) => ordem.get(a)! - ordem.get(b)!);

  const doPerfil = permissoesDoPerfil({ perfilBase, perfilProprio: perfilProprio?.permissoes ?? null, perfilCatalogoVersao: perfilProprio?.catalogoVersao ?? null });
  const ajuste = ajusteMinimo(doPerfil, dados.extras, dados.removidas);
  const colunas = {
    perfilBase,
    perfilId: perfilProprio?.id ?? null,
    permissoesExtras: ajuste.extras,
    permissoesRemovidas: ajuste.removidas,
    setores: dados.setores,
    redeInteira: dados.redeInteira,
    lojaIds: dados.redeInteira ? [] : lojaIds,
  };
  const linha: LinhaDeVinculo = { ...colunas, perfil: perfilProprio };
  const alcance = alcanceDe(linha);
  if (!cobre(ator.alcance, alcance)) throw new Desfazer({ geral: fraseDeEscalada(ator.alcance, alcance) });
  return { colunas, alcance, perfilRotulo: perfilRotuloDe(linha) };
}

function retratoDoVinculo(a: LinhaDeVinculo & { setores: string[] | null }, nomes: ReadonlyMap<string, string>) {
  return retratoDaPessoa(
    {
      perfilRotulo: perfilRotuloDe(a),
      setores: a.setores ?? [],
      redeInteira: a.redeInteira,
      lojaIds: a.lojaIds ?? [],
      extras: a.permissoesExtras ?? [],
      removidas: a.permissoesRemovidas ?? [],
    },
    nomes,
  );
}

function retratoDePrep(prep: Awaited<ReturnType<typeof prepararPermissoes>>, nomes: ReadonlyMap<string, string>) {
  return retratoDaPessoa(
    {
      perfilRotulo: prep.perfilRotulo,
      setores: prep.colunas.setores,
      redeInteira: prep.colunas.redeInteira,
      lojaIds: prep.colunas.lojaIds,
      extras: prep.colunas.permissoesExtras,
      removidas: prep.colunas.permissoesRemovidas,
    },
    nomes,
  );
}

// ------------------------------------------------------------------ listar

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
  // 0.4
  perfilBase: PerfilBase | null;
  perfilId: string | null;
  perfilRotulo: string;
  setores: Setor[];
  redeInteira: boolean;
  lojaIds: string[];
  permissoesExtras: Permissao[];
  permissoesRemovidas: Permissao[];
  /** Permissões efetivas e lojas (o que a pessoa pode de fato). */
  alcance: Alcance;
  administrador: boolean;
  /** Tem vínculo em outro parceiro (a senha vale lá também). */
  emOutroParceiro: boolean;
  /** Bloqueada pelo limite de tentativas por e-mail (o nível 1 pode liberar). */
  bloqueada: boolean;
}

/** Pessoas com acesso a este parceiro, com perfil, setores, lojas e o que podem. */
export async function listarAcessos(parceiroId: string, o?: Opcoes): Promise<LinhaDeAcesso[]> {
  const { db, agora } = abrir(o);
  const linhas = await db.acessoParceiro.findMany({
    where: { parceiroId },
    include: {
      ...COM_PERFIL,
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
  const ids = linhas.map((a) => a.usuarioId);
  const fora = new Set(
    (
      await db.acessoParceiro.findMany({
        where: { usuarioId: { in: ids }, parceiroId: { not: parceiroId } },
        select: { usuarioId: true },
      })
    ).map((x) => x.usuarioId),
  );
  const bloqueadas = new Set<string>();
  for (const a of linhas) {
    const f = await contarFalhas(db, a.usuario.email, '', agora);
    if (excedeuLimite(f.porEmail, 0)) bloqueadas.add(a.usuarioId);
  }
  return linhas.map((a) => {
    const alcance = alcanceDe(a);
    return {
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
      perfilBase: a.perfilBase,
      perfilId: a.perfilId,
      perfilRotulo: perfilRotuloDe(a),
      setores: normalizarSetores(a.setores ?? []),
      redeInteira: a.redeInteira,
      lojaIds: a.lojaIds ?? [],
      permissoesExtras: normalizarPermissoes(a.permissoesExtras ?? []),
      permissoesRemovidas: normalizarPermissoes(a.permissoesRemovidas ?? []),
      alcance,
      administrador: a.status === 'ATIVO' && ehAdministrador(alcance),
      emOutroParceiro: fora.has(a.usuarioId),
      bloqueada: bloqueadas.has(a.usuarioId),
    };
  });
}

/**
 * 3.3: quem pode receber um lote da gerência ("passar para outra pessoa"): pessoa ATIVA deste parceiro com "registrar
 * produção" NA loja (o alcance resolvido do vínculo, com a versão do catálogo do perfil próprio). Só nome e o id do login:
 * nada de e-mail ou acesso. Ordem alfabética.
 */
export async function pessoasQueProduzem(parceiroId: string, lojaId: string, o?: Opcoes): Promise<{ usuarioId: string; nome: string }[]> {
  const { db } = abrir(o);
  const vs = await db.acessoParceiro.findMany({ where: { parceiroId, status: 'ATIVO' }, include: { ...COM_PERFIL, usuario: { select: { id: true, nome: true } } } });
  return vs
    .filter((v) => resolverAlcance(vinculoDe(v)).permissoes.has('producao.registrar') && (v.redeInteira || (v.lojaIds ?? []).includes(lojaId)))
    .map((v) => ({ usuarioId: v.usuario.id, nome: v.usuario.nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/**
 * Polimento da 3.3 (Guardião M2): relê, na hora de gravar "passar o lote", se a pessoa AINDA pode receber — vínculo ATIVO
 * neste parceiro, com "registrar produção" NA loja (a mesma regra de `pessoasQueProduzem`, para uma pessoa só).
 */
export async function aindaProduzNaLoja(parceiroId: string, lojaId: string, usuarioId: string, o?: Opcoes): Promise<boolean> {
  const { db } = abrir(o);
  const v = await db.acessoParceiro.findFirst({ where: { parceiroId, usuarioId, status: 'ATIVO' }, include: { ...COM_PERFIL } });
  return !!v && resolverAlcance(vinculoDe(v)).permissoes.has('producao.registrar') && (v.redeInteira || (v.lojaIds ?? []).includes(lojaId));
}

/**
 * Polimento da 3.3 (Guardião M1): os logins que TÊM ou TIVERAM vínculo com o parceiro (qualquer situação: quem saiu da
 * equipe continua sendo quem fez o lote dele). Quem fez um lote e não está aqui é a FlowFoods (o nível 1 da 3.1, que
 * gravava o próprio login como responsável): o histórico e os indicadores não o contam como pessoa da equipe.
 */
export async function idsDaEquipe(parceiroId: string, o?: Opcoes): Promise<Set<string>> {
  const { db } = abrir(o);
  return new Set((await db.acessoParceiro.findMany({ where: { parceiroId }, select: { usuarioId: true } })).map((v) => v.usuarioId));
}

/**
 * Para a lista do nível 1: parceiros com pessoas ativas e NINGUÉM cuidando da
 * equipe (ativo + cuidar da equipe + rede inteira). Uma ida ao banco.
 */
export async function parceirosSemAdministrador(o?: Opcoes): Promise<Set<string>> {
  const { db } = abrir(o);
  const vs = await db.acessoParceiro.findMany({ where: { status: 'ATIVO' }, include: COM_PERFIL });
  const comPessoas = new Set<string>();
  const comAdmin = new Set<string>();
  for (const v of vs) {
    comPessoas.add(v.parceiroId);
    if (ehAdministrador(alcanceDe(v))) comAdmin.add(v.parceiroId);
  }
  return new Set(Array.from(comPessoas).filter((id) => !comAdmin.has(id)));
}

export interface LinhaDePerfil {
  id: string;
  nome: string;
  base: PerfilBase;
  permissoes: Permissao[];
  setores: Setor[];
  catalogoVersao: number;
  /** Permissões que entraram no catálogo depois que o perfil foi salvo e que ele não tem: a Equipe pede para revisar. */
  revisar: Permissao[];
  pessoas: number;
  atualizadoEm: Date;
}

export async function listarPerfis(parceiroId: string, o?: Opcoes): Promise<LinhaDePerfil[]> {
  const { db } = abrir(o);
  const perfis = await db.perfilAcesso.findMany({
    where: { parceiroId },
    include: { _count: { select: { acessos: true } } },
    orderBy: { nome: 'asc' },
  });
  return perfis.map((p) => {
    // O que vale de verdade (o "copiado do Dono" de um catálogo antigo já leva o que entrou depois: decisão 219).
    const permissoes = permissoesNoCatalogoAtual(p.permissoes ?? [], p.catalogoVersao);
    return {
      id: p.id,
      nome: p.nome,
      base: p.base,
      permissoes,
      setores: normalizarSetores(p.setores ?? []),
      catalogoVersao: p.catalogoVersao,
      revisar: novasDesdeOPerfil(permissoes, p.catalogoVersao),
      pessoas: p._count.acessos,
      atualizadoEm: p.atualizadoEm,
    };
  });
}

export type ResultadoDeAcesso =
  | { ok: true; mensagem: string; link: { token: string; expiraEm: Date } | null }
  | { ok: false; erros: Partial<Record<'nome' | 'email' | 'perfil' | 'lojas' | 'geral', string>> };

/**
 * Revoga os links pendentes da pessoa e cria um novo. Devolve o token (só
 * existe aqui). `doNivel1`: quem gerou (o link de parceiro é reconferido na
 * hora do uso, decisão 41).
 */
async function novoConvite(tx: Prisma.TransactionClient, usuarioId: string, parceiroId: string, agora: Date, doNivel1: boolean) {
  await tx.conviteAcesso.updateMany({
    where: { usuarioId, usadoEm: null, revogadoEm: null },
    data: { revogadoEm: agora },
  });
  const token = gerarToken();
  const expiraEm = new Date(agora.getTime() + VALIDADE_DO_LINK_MS);
  await tx.conviteAcesso.create({
    data: { usuarioId, parceiroId, tokenHash: hashDoToken(token), expiraEm, criadoEm: agora, doNivel1 },
  });
  return { token, expiraEm };
}

// ============================================== revogar os meios de entrar

/** Histórico de uma mudança da pessoa no tenant de OUTRO parceiro dela. */
interface HistoricoEmOutroParceiro {
  parceiroId: string;
  registros: RegistroDeHistorico[];
}

/**
 * Por que os meios de entrar da pessoa caem:
 *   - SENHA_PELO_LINK: ela definiu/redefiniu a senha pelo link (quem chama já
 *     gravou a senha nova). Recuperar a conta tira tudo o que alguém pode ter
 *     pendurado nela com a senha antiga (Fiscal QA, 0.4).
 *   - SENHA_DE_OUTRO_PARCEIRO: ganhou vínculo em outro parceiro e a senha
 *     tinha sido criada por link de administrador de parceiro: a senha também
 *     sai (decisão 41, Guardião voltas 1 e 2).
 */
export type MotivoDaRevogacao = 'SENHA_PELO_LINK' | 'SENHA_DE_OUTRO_PARCEIRO';

export interface Revogacao {
  rostos: number;
  sessoes: number;
  links: number;
  /** Todos os vínculos da pessoa (ativos ou não), para o histórico de cada parceiro. */
  vinculos: { acessoId: string; parceiroId: string }[];
}

/**
 * O ÚNICO lugar que revoga os meios de entrar de uma pessoa. Inventário das
 * credenciais dela, todas tratadas aqui, na transação de quem chama:
 *   - senha: apagada em SENHA_DE_OUTRO_PARCEIRO (em SENHA_PELO_LINK é a nova);
 *   - sessões: todas encerradas, em qualquer parceiro;
 *   - links pendentes: revogados (o link em uso já foi marcado como usado);
 *   - rostos (passkeys) e desafios WebAuthn pendentes: apagados;
 *   - `versaoCredencial` +1: login, entrada pelo rosto e ativação de rosto que
 *     já tinham lido a versão (antes do bcrypt/da assinatura) não gravam sessão
 *     nem aparelho depois daqui, e sessão de versão velha não vale
 *     (`abrirSessao`, `concluirRegistroDeRosto`, `validarSessao`).
 * Tentativas de entrada não deixam entrar (ficam). Roda sob a trava da pessoa
 * (`erp-usuario:<id>`), a mesma de `abrirSessao` e `concluirRegistroDeRosto`:
 * nada que confere a credencial passa no meio.
 */
async function revogarMeiosDeEntrada(
  tx: Prisma.TransactionClient,
  usuarioId: string,
  motivo: MotivoDaRevogacao,
  agora: Date,
): Promise<Revogacao> {
  await travar(tx, `erp-usuario:${usuarioId}`);
  const sessoes = (await tx.sessaoErp.updateMany({ where: { usuarioId, encerradaEm: null }, data: { encerradaEm: agora } })).count;
  const links = (
    await tx.conviteAcesso.updateMany({ where: { usuarioId, usadoEm: null, revogadoEm: null }, data: { revogadoEm: agora } })
  ).count;
  const rostos = (await tx.passkeyErp.deleteMany({ where: { usuarioId } })).count;
  await tx.desafioWebauthn.deleteMany({ where: { usuarioId } });
  await tx.usuarioErp.update({
    where: { id: usuarioId },
    data: {
      versaoCredencial: { increment: 1 },
      ...(rostos > 0 ? { rostosRemovidosEm: agora } : {}),
      ...(motivo === 'SENHA_DE_OUTRO_PARCEIRO' ? { senhaHash: null, senhaDefinidaEm: null, senhaPorLinkDoParceiroId: null } : {}),
    },
  });
  const vinculos = await tx.acessoParceiro.findMany({ where: { usuarioId }, select: { id: true, parceiroId: true }, orderBy: { criadoEm: 'asc' } });
  return { rostos, sessoes, links, vinculos: vinculos.map((v) => ({ acessoId: v.id, parceiroId: v.parceiroId })) };
}

/** "aparelho" no histórico: quantos rostos saíram. */
export function textoDosRostosRemovidos(n: number): string {
  if (n === 0) return 'nenhum rosto ativado';
  return n === 1 ? '1 aparelho com rosto removido' : `${n} aparelhos com rosto removidos`;
}

export const ERRO_PARCEIRO_NAO_LIBERADO =
  'Este parceiro ainda não foi liberado (rascunho): ninguém dele entra. Ative o parceiro primeiro (aba Cadastro) e depois dê o acesso.';

/** Decisão 92: nem acesso nem link para parceiro em RASCUNHO. */
async function exigirParceiroLiberado(tx: Prisma.TransactionClient, parceiroId: string) {
  const par = await tx.parceiroFlow.findUnique({ where: { id: parceiroId }, select: { status: true } });
  if (par?.status === 'RASCUNHO') throw new Desfazer({ geral: ERRO_PARCEIRO_NAO_LIBERADO });
}

/**
 * A senha é da PESSOA, não do vínculo: vale em todos os parceiros dela. Por
 * isso link de senha (primeiro acesso ou nova) só sai do nível 1 ou de quem
 * cuida da equipe de um parceiro onde a pessoa está SOZINHA (sem vínculo em
 * outro, ativo ou não) — senão o administrador de A poderia tomar a conta e
 * entrar em B (decisão 41). Conferido aqui, na geração, E na hora do uso
 * (`conviteValido`), e todo vínculo novo revoga os links pendentes.
 */
async function podeGerarLink(tx: Prisma.TransactionClient, ator: Ator, usuarioId: string, parceiroId: string) {
  if (ator.alcance.nivel === 'FLOWFOODS') return true;
  const outros = await tx.acessoParceiro.count({ where: { usuarioId, parceiroId: { not: parceiroId } } });
  return outros === 0;
}

/** Entrada já validada do acesso: serve a `criarAcesso` e à ativação do pedido (0.5). */
interface EntradaDoAcesso {
  parceiroId: string;
  nome: string;
  email: string;
  dados: PermissoesDaPessoa;
  lojas: { id: string; nome: string }[];
  nomes: ReadonlyMap<string, string>;
  agora: Date;
  /**
   * A ativação de um pedido (dado vindo do PÚBLICO) só cria pessoa NOVA: e-mail
   * que já existe em `UsuarioErp`, em qualquer estado (com senha, com convite
   * pendente, sem vínculo ativo), é recusado antes de tocar em qualquer credencial.
   * Sem isto, quem manda o e-mail de outra pessoa no formulário tomaria a conta
   * dela (a senha e os rostos caem e o link do nível 1 vai para o WhatsApp do pedido).
   */
  soPessoaNova?: boolean;
}

/** Frase neutra (a mesma que o formulário mostra: `pedido-textos.ts`). */
export { ERRO_DONO_JA_TEM_ACESSO };

/**
 * O miolo de `criarAcesso`, dentro de uma transação que já travou a equipe e
 * conferiu o ator. A ativação do pedido (0.5) o chama na MESMA transação que
 * cria o parceiro: dono, vínculo e link nascem juntos ou não nascem.
 */
async function criarAcessoNaTransacao(
  tx: Prisma.TransactionClient,
  e: EntradaDoAcesso,
  ator: Ator,
): Promise<{ resultado: ResultadoDeAcesso; historico: RegistroDeHistorico[]; outrosParceiros: HistoricoEmOutroParceiro[] }> {
  const { parceiroId, lojas, nomes, agora } = e;
  await exigirParceiroLiberado(tx, parceiroId);
  const nivel1 = ator.alcance.nivel === 'FLOWFOODS';
  let usuario = await tx.usuarioErp.findUnique({ where: { email: e.email } });
  if (usuario && e.soPessoaNova) throw new Desfazer({ email: ERRO_DONO_JA_TEM_ACESSO });
  if (usuario) {
    const ja = await tx.acessoParceiro.findUnique({
      where: { parceiroId_usuarioId: { parceiroId, usuarioId: usuario.id } },
    });
    if (ja) throw new Desfazer({ email: 'Essa pessoa já tem acesso a este parceiro.' });
    // E-mail de quem já está em OUTRO parceiro: só o nível 1 vincula. A
    // pessoa do parceiro recebe a mesma frase de qualquer outra recusa (não
    // fica sabendo que o e-mail existe).
    if (!nivel1) throw new Desfazer({ email: ERRO_EMAIL_NEUTRO });
    // Uma mudança de senha/vínculo por pessoa de cada vez (ver definirSenhaPeloLink).
    await travar(tx, `erp-usuario:${usuario.id}`);
    usuario = await tx.usuarioErp.findUniqueOrThrow({ where: { id: usuario.id } });
  }
  const prep = await prepararPermissoes(tx, parceiroId, e.dados, lojas, ator);
  const novo = !usuario;
  usuario ??= await tx.usuarioErp.create({ data: { email: e.email, nome: e.nome, criadoEm: agora } });
  const acesso = await tx.acessoParceiro.create({
    data: { parceiroId, usuarioId: usuario.id, criadoEm: agora, ...prep.colunas },
  });

  // Vínculo novo em mais um parceiro: link pendente (de qualquer parceiro)
  // morre; e senha criada por link de administrador de OUTRO parceiro não
  // atravessa — apaga e a pessoa cria outra pelo link do nível 1 (decisão 41).
  let revogacao: Revogacao | null = null;
  if (!novo) {
    await tx.conviteAcesso.updateMany({
      where: { usuarioId: usuario.id, usadoEm: null, revogadoEm: null },
      data: { revogadoEm: agora },
    });
    if (usuario.senhaHash && usuario.senhaPorLinkDoParceiroId && usuario.senhaPorLinkDoParceiroId !== parceiroId) {
      // TUDO que deixa entrar sem a senha nova sai junto (Guardião, voltas
      // 2 e 3): quem conhecia a senha do link pode ter ativado o rosto ou
      // ter um login em voo. Inventário em `revogarMeiosDeEntrada`.
      revogacao = await revogarMeiosDeEntrada(tx, usuario.id, 'SENHA_DE_OUTRO_PARCEIRO', agora);
      usuario = await tx.usuarioErp.findUniqueOrThrow({ where: { id: usuario.id } });
    }
  }
  const senhaApagada = revogacao !== null;

  const historico: RegistroDeHistorico[] = [
    {
      entidade: ENTIDADE,
      entidadeId: acesso.id,
      acao: 'CRIOU',
      depois: {
        nome: usuario.nome,
        email: usuario.email,
        status: acesso.status,
        ...retratoDePrep(prep, nomes),
      },
      autorNome: ator.nome,
    },
  ];
  if (senhaApagada) {
    historico.push({
      entidade: ENTIDADE,
      entidadeId: acesso.id,
      acao: 'PEDIU_SENHA_NOVA',
      depois: {
        nome: usuario.nome,
        senha: 'criada por link de outro parceiro: precisa criar de novo',
        aparelho: textoDosRostosRemovidos(revogacao!.rostos),
      },
      autorNome: ator.nome,
    });
  }
  // A senha e os rostos valiam nos outros parceiros dela também: fica lá.
  const outrosParceiros: HistoricoEmOutroParceiro[] = (revogacao?.vinculos ?? [])
    .filter((v) => v.parceiroId !== parceiroId)
    .map((v) => ({
      parceiroId: v.parceiroId,
      registros: [
        {
          entidade: ENTIDADE,
          entidadeId: v.acessoId,
          acao: 'PEDIU_SENHA_NOVA',
          depois: {
            nome: usuario!.nome,
            senha: 'apagada ao ganhar acesso a outro parceiro: precisa criar de novo',
            aparelho: textoDosRostosRemovidos(revogacao!.rostos),
          },
          autorNome: ator.nome,
        },
      ],
    }));
  let link: { token: string; expiraEm: Date } | null = null;
  if (!usuario.senhaHash && (novo || (await podeGerarLink(tx, ator, usuario.id, parceiroId)))) {
    link = await novoConvite(tx, usuario.id, parceiroId, agora, nivel1);
    historico.push({
      entidade: ENTIDADE,
      entidadeId: acesso.id,
      acao: 'GEROU_LINK',
      depois: { linkValeAte: link.expiraEm.toISOString() },
      autorNome: ator.nome,
    });
  }
  const mensagem = senhaApagada
    ? `Acesso de ${usuario.nome} criado. A senha dela tinha sido criada por link de outro parceiro e não vale aqui: a senha e a entrada pelo rosto foram desligadas. Mande o link para ela criar uma senha nova.`
    : link
      ? `Acesso de ${usuario.nome} criado. Copie o link e mande para a pessoa.`
      : `Atenção: esse e-mail já tem senha e entra em outro parceiro. ${usuario.nome} agora vê este também, com a mesma senha.`;
  return { resultado: { ok: true, link, mensagem }, historico, outrosParceiros };
}

/**
 * Cria o acesso de uma pessoa a este parceiro, já com perfil, setores e lojas.
 * E-mail novo: nasce o usuário e o link de primeiro acesso. E-mail que já
 * entra em outro parceiro: só ganha o vínculo (a senha e o rosto são os mesmos).
 * `quem`: texto = nível 1 (compatível com a 0.3); `Ator` = pessoa do parceiro.
 */
export async function criarAcesso(
  parceiroId: string,
  entrada: Record<string, unknown>,
  quem: Ator | string,
  o?: Opcoes,
): Promise<ResultadoDeAcesso> {
  const r = formNovoAcesso.safeParse(entrada);
  const p = lerPermissoesDaPessoa(entrada);
  if (!r.success || !p.ok) {
    const erros: Record<string, string> = { ...(p.ok ? {} : p.erros) } as Record<string, string>;
    if (!r.success) for (const i of r.error.issues) erros[String(i.path[0] ?? 'geral')] ??= i.message;
    return { ok: false, erros };
  }
  const { db, agora } = abrir(o);
  const lojas = await lojasDoParceiro(db, parceiroId);
  const nomes = new Map(lojas.map((l) => [l.id, l.nome]));
  try {
    return await naEquipe<ResultadoDeAcesso>(db, parceiroId, atorDe(quem), (tx, ator) =>
      criarAcessoNaTransacao(tx, { parceiroId, nome: r.data.nome, email: r.data.email, dados: p.dados, lojas, nomes, agora }, ator),
    );
  } catch (e) {
    if (ehErroDeUnicidade(e)) return { ok: false, erros: { email: 'Esse e-mail acabou de ser cadastrado. Recarregue.' } };
    throw e;
  }
}

async function acessoDoParceiro(tx: Prisma.TransactionClient, parceiroId: string, acessoId: string) {
  return tx.acessoParceiro.findFirst({ where: { id: acessoId, parceiroId }, include: { usuario: true, ...COM_PERFIL } });
}

export type ResultadoSimples = { ok: true; mensagem: string } | { ok: false; erro: string };

/**
 * Perfil, setores, lojas e ajuste fino de uma pessoa. O ator precisa cobrir o
 * acesso de antes e o de depois; a mudança vale na próxima requisição da
 * pessoa (a sessão resolve as permissões a cada uma).
 */
export async function atualizarAcesso(
  parceiroId: string,
  acessoId: string,
  entrada: Record<string, unknown>,
  quem: Ator | string,
  o?: Opcoes,
): Promise<{ ok: true; mensagem: string } | { ok: false; erros: Erros }> {
  const p = lerPermissoesDaPessoa(entrada);
  if (!p.ok) return { ok: false, erros: p.erros };
  const { db } = abrir(o);
  const lojas = await lojasDoParceiro(db, parceiroId);
  const nomes = new Map(lojas.map((l) => [l.id, l.nome]));
  return naEquipe(db, parceiroId, atorDe(quem), async (tx, ator) => {
    const a = await acessoDoParceiro(tx, parceiroId, acessoId);
    if (!a) throw new Desfazer({ geral: 'Acesso não encontrado neste parceiro.' });
    if (!cobre(ator.alcance, alcanceDe(a))) throw new Desfazer({ geral: ERRO_ACIMA_DE_VOCE });
    const prep = await prepararPermissoes(tx, parceiroId, p.dados, lojas, ator);
    const antes = retratoDoVinculo(a, nomes);
    const depois = retratoDePrep(prep, nomes);
    if (JSON.stringify(antes) === JSON.stringify(depois)) {
      return { resultado: { ok: true as const, mensagem: 'Nada mudou.' }, historico: [] };
    }
    await tx.acessoParceiro.update({ where: { id: a.id }, data: prep.colunas });
    return {
      resultado: { ok: true as const, mensagem: `Acesso de ${a.usuario.nome} atualizado. Vale a partir da próxima tela que a pessoa abrir.` },
      historico: [
        {
          entidade: ENTIDADE,
          entidadeId: a.id,
          acao: 'ALTEROU',
          antes: { nome: a.usuario.nome, ...antes },
          depois: { nome: a.usuario.nome, ...depois },
          autorNome: ator.nome,
        },
      ],
    };
  });
}

/**
 * Desativar derruba as sessões da pessoa NESTE parceiro (e a validação de
 * sessão confere o vínculo a cada requisição, então nada sobrevive). Reativar
 * volta a deixar entrar com a senha e o rosto que ela já tinha.
 */
export async function mudarStatusDoAcesso(
  parceiroId: string,
  acessoId: string,
  novo: AcessoStatus,
  quem: Ator | string,
  o?: Opcoes,
): Promise<ResultadoSimples> {
  const { db, agora } = abrir(o);
  const r = await naEquipe<ResultadoSimples>(db, parceiroId, atorDe(quem), async (tx, ator) => {
    const a = await acessoDoParceiro(tx, parceiroId, acessoId);
    if (!a) throw new Desfazer({ geral: 'Acesso não encontrado neste parceiro.' });
    if (a.status === novo) return { resultado: { ok: true, mensagem: 'Nada mudou.' }, historico: [] };
    if (novo === 'DESATIVADO' && ator.acessoId === a.id) {
      throw new Desfazer({ geral: 'Você não pode desativar o próprio acesso. Peça a outra pessoa que cuida da equipe.' });
    }
    if (!cobre(ator.alcance, alcanceDe(a))) throw new Desfazer({ geral: ERRO_ACIMA_DE_VOCE });
    await tx.acessoParceiro.update({ where: { id: a.id }, data: { status: novo } });
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
    return {
      resultado: {
        ok: true,
        mensagem: novo === 'DESATIVADO' ? `${a.usuario.nome} não entra mais neste parceiro.` : `${a.usuario.nome} pode entrar de novo.`,
      },
      historico: [
        {
          entidade: ENTIDADE,
          entidadeId: a.id,
          acao: novo === 'DESATIVADO' ? 'DESATIVOU' : 'REATIVOU',
          antes: { nome: a.usuario.nome, status: a.status },
          depois: { nome: a.usuario.nome, status: novo },
          autorNome: ator.nome,
        },
      ],
    };
  });
  return simples(r);
}

/** Novo link (primeiro acesso ou nova senha). O anterior deixa de valer. */
export async function gerarNovoLink(
  parceiroId: string,
  acessoId: string,
  quem: Ator | string,
  o?: Opcoes,
): Promise<{ ok: true; token: string; expiraEm: Date; nome: string } | { ok: false; erro: string }> {
  const { db, agora } = abrir(o);
  const r = await naEquipe<{ ok: true; token: string; expiraEm: Date; nome: string }>(db, parceiroId, atorDe(quem), async (tx, ator) => {
    const a = await acessoDoParceiro(tx, parceiroId, acessoId);
    if (!a) throw new Desfazer({ geral: 'Acesso não encontrado neste parceiro.' });
    await exigirParceiroLiberado(tx, parceiroId);
    if (a.status !== 'ATIVO') throw new Desfazer({ geral: 'Reative o acesso antes de gerar um link.' });
    if (!cobre(ator.alcance, alcanceDe(a))) throw new Desfazer({ geral: ERRO_ACIMA_DE_VOCE });
    await travar(tx, `erp-usuario:${a.usuarioId}`);
    if (!(await podeGerarLink(tx, ator, a.usuarioId, parceiroId))) throw new Desfazer({ geral: ERRO_LINK_OUTRO_PARCEIRO });
    const link = await novoConvite(tx, a.usuarioId, parceiroId, agora, ator.alcance.nivel === 'FLOWFOODS');
    return {
      resultado: { ok: true, ...link, nome: a.usuario.nome },
      historico: [
        {
          entidade: ENTIDADE,
          entidadeId: a.id,
          acao: 'GEROU_LINK',
          depois: { nome: a.usuario.nome, linkValeAte: link.expiraEm.toISOString() },
          autorNome: ator.nome,
        },
      ],
    };
  });
  return r.ok ? r : { ok: false, erro: Object.values(r.erros)[0] ?? 'Não deu certo.' };
}

/**
 * Nível 1 libera o e-mail bloqueado pelo limite de tentativas (alguém pode
 * estar errando a senha dos outros de propósito). Grava uma "tentativa ok"
 * marcada como liberação: o contador por e-mail recomeça dali; o limite por IP
 * continua. Só o nível 1 chama (a action confere a sessão do /rodolfo).
 */
export async function liberarEntrada(
  parceiroId: string,
  acessoId: string,
  quem: Ator | string,
  o?: Opcoes,
): Promise<ResultadoSimples> {
  const ator = atorDe(quem);
  if (ator.alcance.nivel !== 'FLOWFOODS' || ator.acessoId !== null) return { ok: false, erro: 'Só a FlowFoods libera as tentativas.' };
  const autorNome = ator.nome;
  const { db, agora } = abrir(o);
  const papel = await papelDisponivel(db);
  return db.$transaction(async (tx) => {
    const a = await acessoDoParceiro(tx, parceiroId, acessoId);
    if (!a) return { ok: false as const, erro: 'Acesso não encontrado neste parceiro.' };
    await travar(tx, `erp-entrada:email:${a.usuario.email}`);
    const f = await contarFalhas(tx, a.usuario.email, '', agora);
    if (f.porEmail === 0) return { ok: true as const, mensagem: 'Nada a liberar: não há tentativas erradas recentes.' };
    await tx.tentativaEntradaErp.create({
      data: { email: a.usuario.email, ip: 'nivel-1', metodo: 'SENHA', ok: true, motivo: 'LIBERADO_PELO_NIVEL_1', usuarioId: a.usuarioId, criadoEm: agora },
    });
    await fecharComHistorico(
      tx,
      parceiroId,
      [
        {
          entidade: ENTIDADE,
          entidadeId: a.id,
          acao: 'LIBEROU_ENTRADA',
          antes: { nome: a.usuario.nome, tentativas: `${f.porEmail} erradas` },
          depois: { nome: a.usuario.nome, tentativas: 'liberadas' },
          autorNome,
        },
      ],
      papel,
    );
    return { ok: true as const, mensagem: `${a.usuario.nome} pode tentar de novo.` };
  });
}

// ------------------------------------------------------------ perfis próprios

export type ResultadoDePerfil = { ok: true; id: string; mensagem: string } | { ok: false; erros: Erros };

function soRede(ator: Ator): string | null {
  return ator.alcance.lojas === 'todas' ? null : 'Só quem tem acesso à rede inteira cria e muda perfis.';
}

function faltamAoAtor(ator: Ator, permissoes: readonly string[]): Permissao[] {
  if (ator.alcance.nivel === 'FLOWFOODS') return [];
  return normalizarPermissoes(permissoes).filter((p) => !ator.alcance.permissoes.has(p));
}

/**
 * Cria (sem `id`) ou muda (com `id`) um perfil próprio. Sem escalada: o ator
 * precisa ter tudo o que o perfil tinha e tudo o que vai ter. Mudar o perfil
 * muda, na hora, o acesso de quem usa ele (conta para "último administrador").
 */
export async function salvarPerfil(
  parceiroId: string,
  entrada: Record<string, unknown>,
  quem: Ator | string,
  o?: Opcoes,
): Promise<ResultadoDePerfil> {
  const d = lerPerfil(entrada);
  if (!d.ok) return { ok: false, erros: d.erros };
  const id = typeof entrada.id === 'string' && entrada.id ? entrada.id : null;
  const { db } = abrir(o);
  try {
    return await naEquipe<ResultadoDePerfil>(db, parceiroId, atorDe(quem), async (tx, ator) => {
      const rede = soRede(ator);
      if (rede) throw new Desfazer({ geral: rede });
      const faltam = faltamAoAtor(ator, d.dados.permissoes);
      if (faltam.length) {
        throw new Desfazer({
          permissoes: `Você não pode dar o que não tem: ${faltam.map((p) => `“${rotuloDaPermissao(p).toLowerCase()}”`).join(', ')}.`,
        });
      }
      const dados = { ...d.dados, catalogoVersao: VERSAO_DO_CATALOGO };
      if (!id) {
        const novo = await tx.perfilAcesso.create({ data: { parceiroId, ...dados } });
        return {
          resultado: { ok: true, id: novo.id, mensagem: `Perfil “${novo.nome}” criado.` },
          historico: [
            { entidade: 'PerfilAcesso', entidadeId: novo.id, acao: 'CRIOU', depois: retratoDoPerfil(novo), autorNome: ator.nome },
          ],
        };
      }
      const atual = await tx.perfilAcesso.findFirst({ where: { id, parceiroId } });
      if (!atual) throw new Desfazer({ geral: 'Esse perfil não existe mais. Recarregue.' });
      if (faltamAoAtor(ator, atual.permissoes).length) {
        throw new Desfazer({ geral: 'Esse perfil tem coisas que o seu acesso não tem. Só quem tem tudo o que ele dá pode mudar.' });
      }
      // Quem usa o perfil muda junto: o ator precisa cobrir cada pessoa antes e
      // depois (não rebaixa nem sobe ninguém que está acima dele).
      const usam = await tx.acessoParceiro.findMany({ where: { parceiroId, perfilId: atual.id }, include: COM_PERFIL });
      const acima = usam.some(
        (v) =>
          !cobre(ator.alcance, alcanceDe(v)) ||
          !cobre(ator.alcance, alcanceDe({ ...v, perfil: { nome: d.dados.nome, permissoes: d.dados.permissoes, catalogoVersao: VERSAO_DO_CATALOGO } })),
      );
      if (acima) {
        throw new Desfazer({ geral: 'Quem usa esse perfil tem acesso maior que o seu. Só quem tem o mesmo acesso (ou a FlowFoods) muda o perfil.' });
      }
      const depois = await tx.perfilAcesso.update({ where: { id: atual.id }, data: dados });
      return {
        resultado: { ok: true, id, mensagem: `Perfil “${depois.nome}” salvo. Vale para quem usa ele na próxima tela.` },
        historico: [
          {
            entidade: 'PerfilAcesso',
            entidadeId: id,
            acao: 'ALTEROU',
            antes: retratoDoPerfil(atual),
            depois: { ...retratoDoPerfil(depois), ...diferencaDePermissoes(atual.permissoes, depois.permissoes) },
            autorNome: ator.nome,
          },
        ],
      };
    });
  } catch (e) {
    if (ehErroDeUnicidade(e)) return { ok: false, erros: { nome: 'Já existe um perfil com esse nome.' } };
    throw e;
  }
}

/** Exclui perfil próprio que ninguém usa (quem usa precisa trocar antes). */
export async function excluirPerfil(
  parceiroId: string,
  perfilId: string,
  quem: Ator | string,
  o?: Opcoes,
): Promise<ResultadoSimples> {
  const { db } = abrir(o);
  const r = await naEquipe<ResultadoSimples>(db, parceiroId, atorDe(quem), async (tx, ator) => {
    const rede = soRede(ator);
    if (rede) throw new Desfazer({ geral: rede });
    const atual = await tx.perfilAcesso.findFirst({ where: { id: perfilId, parceiroId } });
    if (!atual) throw new Desfazer({ geral: 'Esse perfil não existe mais. Recarregue.' });
    if (faltamAoAtor(ator, atual.permissoes).length) {
      throw new Desfazer({ geral: 'Esse perfil tem coisas que o seu acesso não tem. Só quem tem tudo o que ele dá pode excluir.' });
    }
    const usam = await tx.acessoParceiro.count({ where: { parceiroId, perfilId } });
    if (usam > 0) {
      throw new Desfazer({ geral: `${usam === 1 ? '1 pessoa usa' : `${usam} pessoas usam`} esse perfil. Troque o perfil delas antes de excluir.` });
    }
    await tx.perfilAcesso.delete({ where: { id: atual.id } });
    return {
      resultado: { ok: true, mensagem: `Perfil “${atual.nome}” excluído.` },
      historico: [
        { entidade: 'PerfilAcesso', entidadeId: atual.id, acao: 'EXCLUIU', antes: retratoDoPerfil(atual), autorNome: ator.nome },
      ],
    };
  });
  return simples(r);
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
    include: { parceiro: { select: { status: true } } },
  });
  if (!v || v.status !== 'ATIVO') return null;
  // Decisão 92: link de parceiro que ainda não foi liberado (RASCUNHO) não vale.
  if (v.parceiro.status === 'RASCUNHO') return null;
  // Link gerado por administrador de parceiro só vale se, AGORA, a pessoa não
  // tem vínculo em outro parceiro (a senha vale em todos; decisão 41).
  if (!c.doNivel1) {
    const outros = await db.acessoParceiro.count({ where: { usuarioId: c.usuarioId, parceiroId: { not: c.parceiroId } } });
    if (outros > 0) return null;
  }
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
 * transação consegue. Definir ou redefinir a senha pelo link REVOGA todos os
 * outros meios de entrar da pessoa (`revogarMeiosDeEntrada`): sessões, links
 * pendentes, rostos e desafios de rosto, em todos os parceiros dela. Sem isso,
 * o rosto que um administrador de A ativou com a senha que ele definiu
 * sobreviveria à senha refeita pelo nível 1 e entraria em B (Fiscal QA, 0.4).
 */
export async function definirSenhaPeloLink(
  token: unknown,
  senha: string,
  confirmacao: string,
  o?: Opcoes,
): Promise<{ ok: true; email: string; rostosRemovidos: number } | { ok: false; erro: string; linkInvalido?: boolean }> {
  const { db, agora } = abrir(o);
  const antes = await conviteValido(db, token, agora);
  if (!antes) return { ok: false, erro: 'Este link não vale mais. Peça um novo à FlowFoods.', linkInvalido: true };
  const problema = conferirSenhaNova(senha, confirmacao, antes.convite.usuario.email);
  if (problema) return { ok: false, erro: problema };

  const senhaHash = await bcrypt.hash(senha, CUSTO_BCRYPT);
  const papel = await papelDisponivel(db);
  return db.$transaction(async (tx) => {
    // Sob a trava da pessoa (a mesma de criarAcesso/gerarNovoLink), reconfere o
    // link inteiro: um vínculo novo em outro parceiro, gravado enquanto o bcrypt
    // rodava, já revogou o link ou o torna inválido aqui.
    await travar(tx, `erp-usuario:${antes.convite.usuarioId}`);
    const agoraValido = await conviteValido(tx, token, agora);
    if (!agoraValido || agoraValido.convite.id !== antes.convite.id) {
      return { ok: false as const, erro: 'Este link não vale mais. Peça um novo à FlowFoods.', linkInvalido: true };
    }
    const { count } = await tx.conviteAcesso.updateMany({
      where: { id: antes.convite.id, usadoEm: null, revogadoEm: null, expiraEm: { gt: agora } },
      data: { usadoEm: agora },
    });
    if (count === 0) return { ok: false as const, erro: 'Este link não vale mais. Peça um novo à FlowFoods.', linkInvalido: true };
    const u = await tx.usuarioErp.update({
      where: { id: antes.convite.usuarioId },
      data: {
        senhaHash,
        senhaDefinidaEm: agora,
        // Senha por link de administrador de parceiro fica marcada: não atravessa para outro parceiro.
        senhaPorLinkDoParceiroId: antes.convite.doNivel1 ? null : antes.convite.parceiroId,
      },
    });
    const r = await revogarMeiosDeEntrada(tx, u.id, 'SENHA_PELO_LINK', agora);
    const acao = antes.convite.usuario.senhaHash ? 'TROCOU_SENHA' : 'DEFINIU_SENHA';
    const aparelho = r.rostos > 0 ? { aparelho: textoDosRostosRemovidos(r.rostos) } : {};
    // No parceiro do link e em cada outro parceiro dela (a senha vale em todos).
    await fecharComHistorico(
      tx,
      antes.convite.parceiroId,
      [{ entidade: ENTIDADE, entidadeId: antes.acessoId, acao, depois: { nome: u.nome, senha: 'definida pela pessoa', ...aparelho }, autorNome: u.nome }],
      papel,
    );
    for (const v of r.vinculos.filter((x) => x.parceiroId !== antes.convite.parceiroId)) {
      await fecharComHistorico(
        tx,
        v.parceiroId,
        [{ entidade: ENTIDADE, entidadeId: v.acessoId, acao, depois: { nome: u.nome, senha: 'definida pela pessoa por link', ...aparelho }, autorNome: u.nome }],
        papel,
      );
    }
    return { ok: true as const, email: u.email, rostosRemovidos: r.rostos };
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

// Trava por chave (`./trava`). Ordem fixa: e-mail antes de IP, e ninguém trava
// IP antes de e-mail — sem deadlock.

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

type SessaoAberta = { ok: true; token: string; expiraEm: Date; escolher: boolean };

/**
 * Abre a sessão: parceiro já escolhido se a pessoa só tem um. Grava SÓ se a
 * credencial conferida ainda vale: sob a trava da pessoa (a mesma de
 * `revogarMeiosDeEntrada`), a `versaoCredencial` precisa ser a lida ANTES do
 * bcrypt/da assinatura. Um login em voo enquanto a senha é redefinida ou
 * apagada não cria sessão depois da limpeza (Guardião, volta 3). `naTrava`
 * roda dentro, antes de gravar (o contador do rosto); devolve o motivo da
 * recusa ou null.
 */
async function abrirSessao(
  db: PrismaClient,
  usuarioId: string,
  versaoLida: number,
  metodo: 'SENHA' | 'ROSTO',
  ip: string,
  agora: Date,
  naTrava?: (tx: Prisma.TransactionClient) => Promise<string | null>,
): Promise<SessaoAberta | { ok: false; motivo: string }> {
  const token = gerarToken();
  const expiraEm = new Date(agora.getTime() + VALIDADE_DA_SESSAO_MS);
  return db.$transaction(
    async (tx) => {
      await travar(tx, `erp-usuario:${usuarioId}`);
      const u = await tx.usuarioErp.findUnique({ where: { id: usuarioId }, select: { versaoCredencial: true } });
      if (!u || u.versaoCredencial !== versaoLida) return { ok: false as const, motivo: 'CREDENCIAL_REVOGADA' };
      const recusa = naTrava ? await naTrava(tx) : null;
      if (recusa) return { ok: false as const, motivo: recusa };
      // Decisão 92: parceiro em RASCUNHO (ainda não liberado) não entra. Suspenso entra e só lê.
      const ativos = await tx.acessoParceiro.findMany({
        where: { usuarioId, status: 'ATIVO', parceiro: { status: { not: 'RASCUNHO' } } },
        select: { parceiroId: true },
      });
      if (ativos.length === 0) return { ok: false as const, motivo: 'SEM_ACESSO' };
      await tx.sessaoErp.create({
        data: {
          tokenHash: hashDoToken(token),
          usuarioId,
          parceiroId: ativos.length === 1 ? ativos[0].parceiroId : null,
          metodo,
          ip,
          criadoEm: agora,
          expiraEm,
          versaoCredencial: versaoLida,
        },
      });
      await tx.usuarioErp.update({ where: { id: usuarioId }, data: { ultimoLogin: agora } });
      return { ok: true as const, token, expiraEm, escolher: ativos.length > 1 };
    },
    { maxWait: 10_000, timeout: 10_000 },
  );
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

  // `usuario.versaoCredencial` foi lida junto com o hash, antes do bcrypt.
  const sessao = await abrirSessao(db, usuario.id, usuario.versaoCredencial, 'SENHA', entrada.ip, agora);
  if (!sessao.ok) {
    await concluirTentativa(db, reserva, { ok: false, motivo: sessao.motivo, usuarioId: usuario.id });
    return { ok: false, erro: ERRO_DE_ENTRADA, bloqueado: false };
  }
  await concluirTentativa(db, reserva, { ok: true, motivo: 'OK', usuarioId: usuario.id });
  return { ok: true, token: sessao.token, expiraEm: sessao.expiraEm, escolher: sessao.escolher };
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

  // Sob a trava da pessoa, com a versão lida junto com o rosto (antes da
  // assinatura): rosto apagado por uma revogação no meio não abre sessão. E o
  // contador condicional ao lido: duas entradas com a mesma assinatura não passam.
  const sessao = await abrirSessao(db, passkey.usuarioId, passkey.usuario.versaoCredencial, 'ROSTO', ip, agora, async (tx) => {
    const { count } = await tx.passkeyErp.updateMany({
      where: { id: passkey.id, contador: passkey.contador },
      data: { contador: BigInt(v.novoContador), ultimoUsoEm: agora },
    });
    return count === 0 ? 'ROSTO_CONTADOR' : null;
  });
  if (!sessao.ok) return falha(sessao.motivo, passkey.usuarioId, passkey.usuario.email);
  await concluirTentativa(db, reserva, { ok: true, motivo: 'OK', usuarioId: passkey.usuarioId, email: passkey.usuario.email });
  return { ok: true, token: sessao.token, expiraEm: sessao.expiraEm, escolher: sessao.escolher };
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
    return await db.$transaction(async (tx) => {
      // Sob a trava da pessoa: a sessão que pediu ainda vale (aberta, da versão
      // atual da credencial)? Uma revogação no meio (senha refeita pelo link)
      // não deixa pendurar aparelho depois dela (Guardião, volta 3).
      await travar(tx, `erp-usuario:${sessao.usuario.id}`);
      const viva = await tx.sessaoErp.findUnique({
        where: { id: sessao.sessaoId },
        select: { encerradaEm: true, expiraEm: true, versaoCredencial: true, usuario: { select: { versaoCredencial: true } } },
      });
      if (!viva || viva.encerradaEm || viva.expiraEm <= agora || viva.versaoCredencial !== viva.usuario.versaoCredencial) {
        return { ok: false as const, erro: ERRO_ATIVAR_ROSTO };
      }
      await tx.usuarioErp.update({ where: { id: sessao.usuario.id }, data: { rostosRemovidosEm: null } });
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
      return { ok: true as const, mensagem: 'Pronto. Na próxima vez, toque em “Entrar com o rosto”.' };
    });
  } catch (e) {
    if (ehErroDeUnicidade(e)) return { ok: false, erro: 'Este aparelho já está ativado.' };
    throw e;
  }
}

/** Quando a última revogação tirou aparelhos com rosto (null = nada a avisar). */
export async function rostosRemovidosEm(usuarioId: string, o?: Opcoes): Promise<Date | null> {
  const { db } = abrir(o);
  const u = await db.usuarioErp.findUnique({ where: { id: usuarioId }, select: { rostosRemovidosEm: true } });
  return u?.rostosRemovidosEm ?? null;
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
  /** O que a pessoa pode NESTE parceiro (0.4), resolvido a cada requisição. Null sem parceiro. */
  alcance: Alcance | null;
  /** "Dono", "Gerente", nome do perfil próprio. */
  perfilRotulo: string | null;
  /** 1.8: setores da pessoa NESTE parceiro (pré-escolhem o setor da requisição; não concedem nada). */
  setores: Setor[];
  /** 0.6: o que a pessoa escolheu sobre as caixas de ajuda (por pessoa, vale em todo parceiro). */
  ajuda: PreferenciaDeAjuda;
}

/**
 * Sessão de pé? Confere, a CADA requisição: token, validade, encerramento,
 * versão da credencial (revogou, morreu) e vínculo ATIVO com o parceiro da
 * sessão. Acesso desativado = sessão morta já na próxima requisição.
 */
export async function validarSessao(token: unknown, o?: Opcoes): Promise<SessaoValida | null> {
  if (!tokenTemFormato(token)) return null;
  const { db, agora } = abrir(o);
  const s = await db.sessaoErp.findUnique({
    where: { tokenHash: hashDoToken(token) },
    include: {
      usuario: {
        // Decisão 92: vínculo com parceiro em RASCUNHO não vale (a sessão já aberta morre aqui).
        // 0.6: a preferência de ajuda vem na mesma ida ao banco (sem consulta extra).
        include: { preferencia: true, acessos: { where: { status: 'ATIVO', parceiro: { status: { not: 'RASCUNHO' } } }, include: { parceiro: true, ...COM_PERFIL } } },
      },
    },
  });
  if (!s || s.encerradaEm || s.expiraEm <= agora) return null;
  const vinculos = s.usuario.acessos;
  const atual = s.parceiroId ? vinculos.find((a) => a.parceiroId === s.parceiroId) : null;
  // Sessão nascida antes da última revogação dos meios de entrar: morta, mesmo
  // que tenha escapado do encerramento (segunda trava da volta 3 do Guardião).
  const revogada = s.versaoCredencial !== s.usuario.versaoCredencial;
  if (revogada || vinculos.length === 0 || (s.parceiroId && !atual)) {
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
    alcance: atual ? alcanceDe(atual) : null,
    perfilRotulo: atual ? perfilRotuloDe(atual) : null,
    setores: atual ? normalizarSetores(atual.setores ?? []) : [],
    ajuda: preferenciaDe(s.usuario.preferencia),
  };
}

// ==================================================== ajuda contextual (0.6)
//
// A preferência é da PESSOA (decisão 112) e só muda por aqui. O `usuarioId` vem
// SEMPRE da sessão validada neste mesmo ponto; nenhuma entrada de fora o
// carrega (uma action que receba `usuarioId` forjado não tem onde gravá-lo).
// "Fechar" só aceita `chave@versão` que existe no registro AGORA (lista
// branca), com teto de 300 (o mais velho sai) e gravação atômica: duas abas
// fechando caixas ao mesmo tempo não perdem nenhum fechamento.

function preferenciaDe(
  p: { dicasLigadas: boolean; escolhidaEm: Date | null; fechadas: string[] | null; pontos?: string[] | null } | null | undefined,
): PreferenciaDeAjuda {
  if (!p) return { dicasLigadas: true, escolhida: false, fechadas: [], pontos: [] };
  return { dicasLigadas: p.dicasLigadas, escolhida: p.escolhidaEm !== null, fechadas: normalizarFechadas(p.fechadas), pontos: normalizarPontos(p.pontos) };
}

export type MudancaDeAjuda =
  | { tipo: 'dicas'; ligadas: boolean }
  | { tipo: 'fechar'; caixa: string }
  | { tipo: 'reabrir' }
  /** O card do ponto abriu sozinho agora: guarda o dia (o servidor decide o dia, não o aparelho). */
  | { tipo: 'ponto-visto'; ponto: string }
  /**
   * A sequência guiada começou sozinha (decisão 479): os passos dela, numa ida ao servidor só — vários pedidos seguidos ficariam
   * na fila do navegador e uma navegação no meio descartaria os últimos.
   */
  | { tipo: 'pontos-vistos'; pontos: string[] }
  /** "Não mostrar novamente": o ponto não abre mais sozinho (a ajuda manual continua). */
  | { tipo: 'ponto-nunca'; ponto: string };

/** Teto de passos gravados de uma vez (uma tela tem bem menos pontos que isso). */
export const MAXIMO_DE_PONTOS_POR_SEQUENCIA = 40;

/** `ok: false` = sessão morta ou pedido recusado; nada foi gravado. */
export async function gravarPreferenciaDeAjuda(token: unknown, mudanca: MudancaDeAjuda, o?: Opcoes): Promise<{ ok: boolean }> {
  const sessao = await validarSessao(token, o);
  if (!sessao) return { ok: false };
  const usuarioId = sessao.usuario.id;
  const { db, agora } = abrir(o);
  if (mudanca.tipo === 'dicas') {
    if (typeof mudanca.ligadas !== 'boolean') return { ok: false };
    await db.preferenciaErp.upsert({
      where: { usuarioId },
      create: { usuarioId, dicasLigadas: mudanca.ligadas, escolhidaEm: agora },
      update: { dicasLigadas: mudanca.ligadas, escolhidaEm: agora },
    });
    return { ok: true };
  }
  if (mudanca.tipo === 'reabrir') {
    // "Mostrar as dicas de novo" vale para as caixas e para os pontos (inclusive os "não mostrar novamente").
    await db.preferenciaErp.upsert({
      where: { usuarioId },
      create: { usuarioId, fechadas: [], pontos: [] },
      update: { fechadas: [], pontos: [] },
    });
    return { ok: true };
  }
  if (mudanca.tipo === 'pontos-vistos') {
    const lista = Array.isArray(mudanca.pontos) ? mudanca.pontos : [];
    if (lista.length === 0 || lista.length > MAXIMO_DE_PONTOS_POR_SEQUENCIA) return { ok: false };
    const validos = lista.map((p) => pontoValido(p));
    // Um ponto forjado recusa o pedido inteiro: nada grava pela metade.
    if (validos.some((p) => !p)) return { ok: false };
    const dia = diaDe(agora);
    // Tudo ou nada: uma falha do banco no meio não deixa a sequência marcada pela metade.
    await db.$transaction(async (tx) => {
      for (const ponto of Array.from(new Set(validos as string[]))) {
        // Quem pediu "não mostrar novamente" não volta a "visto".
        if (sessao.ajuda.pontos.includes(itemDoPonto(ponto, 'x'))) continue;
        await gravarItemDoPonto(tx, usuarioId, itemDoPonto(ponto, dia), agora);
      }
    });
    return { ok: true };
  }
  if (mudanca.tipo === 'ponto-visto' || mudanca.tipo === 'ponto-nunca') {
    const ponto = pontoValido(mudanca.ponto);
    if (!ponto) return { ok: false };
    // Quem pediu "não mostrar novamente" não volta a "visto" por causa de uma aba antiga.
    if (mudanca.tipo === 'ponto-visto' && sessao.ajuda.pontos.includes(itemDoPonto(ponto, 'x'))) return { ok: true };
    await gravarItemDoPonto(db, usuarioId, itemDoPonto(ponto, mudanca.tipo === 'ponto-nunca' ? 'x' : diaDe(agora)), agora);
    return { ok: true };
  }
  if (mudanca.tipo !== 'fechar') return { ok: false };
  const caixa = fechamentoValido(mudanca.caixa);
  if (!caixa) return { ok: false };
  await acrescentarCaixaFechada(db, usuarioId, caixa, agora);
  return { ok: true };
}

/**
 * Acrescenta "chave@versão" à lista de quem fechou, numa instrução só (o
 * ON CONFLICT trava a linha): tira a versão antiga da mesma caixa, mantém as
 * 300 mais novas e não perde fechamento de outra aba. Exportada para o teste
 * com banco; quem confere a lista branca é `gravarPreferenciaDeAjuda`.
 */
export async function acrescentarCaixaFechada(db: PrismaClient, usuarioId: string, caixa: string, agora: Date): Promise<void> {
  const chave = caixa.split('@')[0];
  await db.$executeRaw`
    INSERT INTO "PreferenciaErp" ("usuarioId", "fechadas", "atualizadoEm")
    VALUES (${usuarioId}, ARRAY[${caixa}]::text[], ${agora})
    ON CONFLICT ("usuarioId") DO UPDATE SET
      "fechadas" = (
        SELECT coalesce(array_agg(t.x ORDER BY t.n), ARRAY[]::text[])
        FROM (
          SELECT u.x, u.n
          FROM unnest(array_append(array_remove(coalesce("PreferenciaErp"."fechadas", ARRAY[]::text[]), ${caixa}), ${caixa})) WITH ORDINALITY AS u(x, n)
          WHERE u.x = ${caixa} OR split_part(u.x, '@', 1) <> ${chave}
          ORDER BY u.n DESC
          LIMIT 300
        ) t
      ),
      "atualizadoEm" = ${agora}`;
}

/**
 * Grava "chave.ponto=..." numa instrução só (o ON CONFLICT trava a linha): tira
 * o item anterior do MESMO ponto, mantém os 300 mais novos e não perde a
 * gravação de outra aba. Exportada para o teste com banco; quem confere a lista
 * branca é `gravarPreferenciaDeAjuda`.
 */
export async function gravarItemDoPonto(db: Pick<PrismaClient, '$executeRaw'>, usuarioId: string, item: string, agora: Date): Promise<void> {
  const ponto = item.split('=')[0];
  await db.$executeRaw`
    INSERT INTO "PreferenciaErp" ("usuarioId", "pontos", "atualizadoEm")
    VALUES (${usuarioId}, ARRAY[${item}]::text[], ${agora})
    ON CONFLICT ("usuarioId") DO UPDATE SET
      "pontos" = (
        SELECT coalesce(array_agg(t.x ORDER BY t.n), ARRAY[]::text[])
        FROM (
          SELECT u.x, u.n
          FROM unnest(array_append(array_remove(coalesce("PreferenciaErp"."pontos", ARRAY[]::text[]), ${item}), ${item})) WITH ORDINALITY AS u(x, n)
          WHERE u.x = ${item} OR split_part(u.x, '=', 1) <> ${ponto}
          ORDER BY u.n DESC
          LIMIT 300
        ) t
      ),
      "atualizadoEm" = ${agora}`;
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

// ================================================= ativar o pedido (0.5)
//
// O pedido de acesso (`PedidoParceiro`, fora do tenant) vira Parceiro Flow aqui,
// e só aqui: numa transação SÓ nascem o parceiro (já ATIVO), a pessoa dona (perfil
// Dono, rede inteira), o convite de primeiro acesso (72 h, uso único, só o hash
// no banco), a marca ATIVADO no pedido e o histórico do parceiro. Falhou em
// qualquer ponto, não fica nada. A trava `erp-pedido:<id>` serializa quem decide o
// mesmo pedido (ativar × ativar, ativar × recusar) e a gravação do pedido é
// condicional à etapa e à versão lida: o segundo recebe a frase e não cria nada.
// O histórico do parceiro é o ÚLTIMO passo (depois dele a transação está no
// papel do tenant, sem acesso a pedido nem a credencial).

export type ResultadoDaAtivacao =
  | {
      ok: true;
      parceiro: { id: string; slug: string; nome: string };
      dono: { nome: string; email: string };
      whatsapp: string;
      link: { token: string; expiraEm: Date } | null;
      mensagem: string;
    }
  | { ok: false; erros: Partial<Record<'nomeParceiro' | 'slug' | 'donoNome' | 'donoEmail' | 'geral', string>> };

const ETAPAS_ABERTAS: EtapaDoPedido[] = ['NOVO', 'EM_CONVERSA'];

/** O dono nasce com tudo e a rede inteira (inclusive lojas que vierem depois). */
const DONO_DA_REDE = { perfil: 'DONO', lojas: 'rede' } as const;

/**
 * Ativa o pedido: cria o Parceiro Flow ATIVO, o dono e o link de primeiro acesso.
 * Só o nível 1 chama (a action confere a sessão do /rodolfo). O token só existe
 * no retorno: quem chama mostra uma vez e não grava em lugar nenhum.
 */
export async function ativarPedido(
  pedidoId: string,
  entrada: Record<string, unknown>,
  autorNome: string,
  o?: Opcoes,
): Promise<ResultadoDaAtivacao> {
  const lido = lerAtivacao(entrada);
  if (!lido.ok) return { ok: false, erros: lido.erros };
  const f = lido.dados;
  const permissoes = lerPermissoesDaPessoa({ ...DONO_DA_REDE });
  if (!permissoes.ok) throw new Error('perfil Dono inválido');
  const { db, agora } = abrir(o);
  const papel = await papelDisponivel(db);
  const ator = atorNivel1(autorNome);

  try {
    return await db.$transaction(
      async (tx): Promise<ResultadoDaAtivacao> => {
        await travar(tx, `erp-pedido:${pedidoId}`);
        const pedido = await tx.pedidoParceiro.findUnique({ where: { id: pedidoId } });
        if (!pedido) throw new Desfazer({ geral: 'Pedido não encontrado.' });
        if (!ETAPAS_ABERTAS.includes(pedido.status)) {
          const ev = await tx.pedidoParceiroEvento.findFirst({
            where: { pedidoId, acao: { in: ['ATIVOU', 'RECUSOU'] } },
            orderBy: { ocorridoEm: 'desc' },
          });
          throw new Desfazer({ geral: fraseJaDecidido(pedido.status, ev?.autorNome ?? null, ev?.ocorridoEm ?? null) });
        }
        if (pedido.versao !== f.versao) throw new Desfazer({ geral: FRASE_PEDIDO_MEXIDO });

        let parceiro: ParceiroFlow;
        try {
          parceiro = await tx.parceiroFlow.create({ data: { nome: f.nomeParceiro, slug: f.slug, status: 'ATIVO' } });
        } catch (e) {
          if (ehErroDeUnicidade(e)) throw new Desfazer({ slug: 'Esse link já é de outro parceiro. Escolha outro.' });
          throw e;
        }

        await travar(tx, `erp-equipe:${parceiro.id}`);
        const acesso = await criarAcessoNaTransacao(
          tx,
          { parceiroId: parceiro.id, nome: f.donoNome, email: f.donoEmail, dados: permissoes.dados, lojas: [], nomes: new Map(), agora, soPessoaNova: true },
          ator,
        );
        if (!acesso.resultado.ok) throw new Desfazer(acesso.resultado.erros);

        const { count } = await tx.pedidoParceiro.updateMany({
          where: { id: pedidoId, status: { in: ETAPAS_ABERTAS }, versao: pedido.versao },
          data: { status: 'ATIVADO', parceiroCriadoId: parceiro.id, etapaDesde: agora, versao: { increment: 1 }, atualizadoEm: agora },
        });
        if (count === 0) throw new Desfazer({ geral: FRASE_PEDIDO_MEXIDO });
        await tx.pedidoParceiroEvento.create({
          data: {
            pedidoId,
            acao: 'ATIVOU',
            antes: { etapa: pedido.status },
            depois: { etapa: 'ATIVADO' },
            autorNome,
            ocorridoEm: agora,
          },
        });

        // ÚLTIMO passo: o histórico do parceiro novo (e de outros parceiros da pessoa, se a senha caiu).
        await fecharComHistorico(
          tx,
          parceiro.id,
          [
            {
              entidade: 'ParceiroFlow',
              entidadeId: parceiro.id,
              acao: 'CRIOU',
              depois: { nome: parceiro.nome, slug: parceiro.slug, status: parceiro.status, origem: `pedido ${pedidoId}` },
              autorNome,
            },
            ...acesso.historico,
          ],
          papel,
        );
        for (const h of acesso.outrosParceiros) await fecharComHistorico(tx, h.parceiroId, h.registros, papel);

        const r = acesso.resultado;
        return {
          ok: true,
          parceiro: { id: parceiro.id, slug: parceiro.slug, nome: parceiro.nome },
          dono: { nome: f.donoNome, email: f.donoEmail },
          whatsapp: pedido.whatsapp,
          link: r.link,
          mensagem: r.mensagem,
        };
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
  } catch (e) {
    if (e instanceof Desfazer) return { ok: false, erros: erroDaAtivacao(e.erros) };
    // Corrida: alguém criou o MESMO e-mail (na Equipe de outro parceiro) entre a conferência e a
    // criação. O único do e-mail decide; o perdedor desfaz tudo e recebe a mesma frase.
    if (ehErroDeUnicidade(e)) return { ok: false, erros: { donoEmail: ERRO_DONO_JA_TEM_ACESSO } };
    throw e;
  }
}

/** Erros do miolo do acesso (campos de `criarAcesso`) → campos do formulário de ativação. */
function erroDaAtivacao(erros: Erros): Extract<ResultadoDaAtivacao, { ok: false }>['erros'] {
  const r: Extract<ResultadoDaAtivacao, { ok: false }>['erros'] = {};
  for (const [campo, texto] of Object.entries(erros)) {
    if (!texto) continue;
    if (campo === 'slug' || campo === 'geral') r[campo] = texto;
    else if (campo === 'email') r.donoEmail = texto;
    else if (campo === 'nome') r.donoNome = texto;
    else r.geral ??= texto;
  }
  return r;
}

/**
 * Para o cartão do pedido (só nível 1 lê): este e-mail já existe em `UsuarioErp`
 * (com senha, com convite pendente ou sem vínculo ativo)? E em quais parceiros
 * ele entra? A landing nunca vê isto (resposta única).
 */
export async function contaDoEmail(email: string, o?: Opcoes): Promise<{ existe: boolean; parceiros: string[] }> {
  const { db } = abrir(o);
  const u = await db.usuarioErp.findUnique({
    where: { email },
    select: { acessos: { where: { status: 'ATIVO' }, select: { parceiro: { select: { nome: true } } } } },
  });
  return { existe: u !== null, parceiros: u ? u.acessos.map((a) => a.parceiro.nome) : [] };
}

/**
 * Lista do nível 1 (decisão 92): parceiros em RASCUNHO com pessoas ATIVAS. Elas
 * não entram enquanto o parceiro não for ativado: o aviso diz "ative para
 * liberar o acesso". Devolve parceiroId → quantas pessoas.
 */
export async function rascunhosComPessoasAtivas(o?: Opcoes): Promise<Map<string, number>> {
  const { db } = abrir(o);
  const linhas = await db.acessoParceiro.groupBy({
    by: ['parceiroId'],
    where: { status: 'ATIVO', parceiro: { status: 'RASCUNHO' } },
    _count: { _all: true },
  });
  return new Map(linhas.map((l) => [l.parceiroId, l._count._all]));
}
