/**
 * Central de Integrações (INT-1.1, decisões 481 a 483) — a loja do provedor ligada a uma Loja do parceiro e o estado de cada
 * módulo nela. Tudo pelo portão do tenant (`doParceiro`): o parceiro A não enxerga nem grava conexão do B, nem por SQL cru (RLS).
 *
 * Quem chama é o nível 1 (Central) e, depois, o serviço da integração (worker). Rota do parceiro não chama estas funções (o
 * teste-guarda reprova): a tela do parceiro chega na INT-1.8, com permissão própria.
 *
 * O banco confere de novo o que importa: uma loja do provedor ativa num parceiro só (em toda a base), TEST só no parceiro de
 * homologação, app do mesmo provedor e ambiente com o módulo, identidade da conexão imutável.
 */

import type { Prisma } from '@prisma/client';
import { ehErroDeUnicidade, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { appPorId } from './apps';
import { ehModulo, lerConexao, ROTULO_DO_MODULO, type CampoDaConexao, type Modulo } from './campos';
import { ehAcaoDoModulo, porQueNao, ROTULO_DO_ESTADO, transicao, type AcaoDoModulo, type EstadoDoModulo } from './estados';

export const MENSAGEM_LOJA_EXTERNA_EM_USO = 'Esta loja do iFood já está ligada a um parceiro. Desligue a ligação antiga antes de ligar aqui.';
export const MENSAGEM_CONFLITO = 'Alguém mudou esta integração agora há pouco. Recarregue a página para ver como ficou; nada foi gravado.';

const autorDe = (nome: unknown) => String(nome ?? '').trim().slice(0, 120);

/** A frase que o gatilho do banco disse (o `[erp] ...` do RAISE), ou null se o erro é outro. */
export function fraseDoBanco(e: unknown): string | null {
  const msg = e instanceof Error ? e.message : '';
  const m = /\[erp\] ([^\n"\\]+)/.exec(msg);
  return m ? m[1].trim() : null;
}

export type ResultadoDaConexao = { ok: true; id: string } | { ok: false; erros: Partial<Record<CampoDaConexao | 'geral', string>> };

/** Liga uma loja do provedor a uma Loja (e marca) do parceiro. Grava o histórico do parceiro na mesma transação. */
export async function ligarConexao(
  cliente: ClienteDoParceiro,
  entrada: Record<string, unknown>,
  autor: { nome: string; usuarioId?: string | null },
): Promise<ResultadoDaConexao> {
  const lido = lerConexao(entrada);
  if (!lido.ok) return { ok: false, erros: lido.erros };
  const nome = autorDe(autor.nome);
  if (!nome) return { ok: false, erros: { geral: 'Falta quem fez a ligação.' } };
  const d = lido.dados;
  try {
    return await cliente.transacao(async (tx): Promise<ResultadoDaConexao> => {
      const loja = await tx.loja.findUnique({ where: { id: d.lojaId }, select: { id: true, nome: true } });
      if (!loja) return { ok: false, erros: { lojaId: 'Loja não encontrada neste parceiro.' } };
      const marca = d.marcaId ? await tx.marca.findUnique({ where: { id: d.marcaId }, select: { id: true, nome: true } }) : null;
      if (d.marcaId && !marca) return { ok: false, erros: { marcaId: 'Marca não encontrada neste parceiro.' } };
      const criada = await tx.integracaoConexao.create({
        data: {
          parceiroId: tx.parceiroId,
          lojaId: d.lojaId,
          marcaId: d.marcaId,
          provedor: d.provedor,
          ambiente: d.ambiente,
          idExterno: d.idExterno,
          idCurto: d.idCurto,
          nomeExterno: d.nomeExterno,
          criadoPorNome: nome,
          criadoPorUsuarioId: autor.usuarioId ?? null,
        },
        select: { id: true },
      });
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'IntegracaoConexao',
          entidadeId: criada.id,
          acao: 'LIGOU',
          depois: { loja: loja.nome, marca: marca?.nome ?? null, provedor: 'iFood', ambiente: d.ambiente === 'TEST' ? 'Teste' : 'Produção', nomeNoIfood: d.nomeExterno, idNoIfood: d.idExterno },
          autorNome: nome,
        },
      });
      return { ok: true, id: criada.id };
    });
  } catch (e) {
    if (ehErroDeUnicidade(e)) return { ok: false, erros: { idExterno: MENSAGEM_LOJA_EXTERNA_EM_USO } };
    const frase = fraseDoBanco(e);
    if (frase && /TEST|PRODUCAO|homologa/.test(frase)) return { ok: false, erros: { ambiente: 'Loja de teste só no parceiro de homologação; loja de produção nunca nele.' } };
    if (frase) return { ok: false, erros: { geral: frase } };
    throw e;
  }
}

export type ResultadoSimples = { ok: true; mudou: boolean } | { ok: false; erro: string; conflito?: boolean };

/** Desliga a conexão (fica como histórico; ligar de novo é linha nova). Repetir não grava nada. */
export async function desligarConexao(cliente: ClienteDoParceiro, conexaoId: string, autorNome: string): Promise<ResultadoSimples> {
  const nome = autorDe(autorNome);
  if (!nome) return { ok: false, erro: 'Falta quem desligou.' };
  if (typeof conexaoId !== 'string' || !conexaoId || conexaoId.length > 60) return { ok: false, erro: 'Integração não encontrada.' };
  return cliente.transacao(async (tx): Promise<ResultadoSimples> => {
    const c = await tx.integracaoConexao.findUnique({ where: { id: conexaoId }, select: { id: true, estado: true, nomeExterno: true } });
    if (!c) return { ok: false, erro: 'Integração não encontrada.' };
    if (c.estado === 'DESLIGADA') return { ok: true, mudou: false };
    const agora = new Date();
    const r = await tx.integracaoConexao.updateMany({ where: { id: c.id, estado: 'ATIVA' }, data: { estado: 'DESLIGADA', desligadaEm: agora, desligadaPorNome: nome } });
    if (r.count !== 1) return { ok: false, erro: MENSAGEM_CONFLITO, conflito: true };
    // Decisão 487: nenhum módulo fica ativo numa conexão desligada (a ativação ao mesmo tempo espera a trava da linha no banco).
    const pausados = await tx.integracaoConexaoModulo.updateMany({ where: { conexaoId: c.id, estado: 'ATIVO' }, data: { estado: 'PAUSADO', pausadoEm: agora } });
    await tx.historicoAlteracao.create({
      data: {
        parceiroId: tx.parceiroId,
        entidade: 'IntegracaoConexao',
        entidadeId: c.id,
        acao: 'DESLIGOU',
        antes: { nomeNoIfood: c.nomeExterno, situacao: 'Ligada' },
        depois: { nomeNoIfood: c.nomeExterno, situacao: 'Desligada', ...(pausados.count > 0 ? { modulosPausados: pausados.count } : {}) },
        autorNome: nome,
      },
    });
    return { ok: true, mudou: true };
  });
}

export type ResultadoDoModulo = { ok: true; id: string; estado: EstadoDoModulo; mudou: boolean } | { ok: false; erro: string; conflito?: boolean };

/**
 * Prepara um módulo numa conexão, pelo app que o usa (estado inicial: não solicitado). Idempotente: o mesmo módulo na mesma
 * conexão devolve o que já existe. O banco recusa app de outro provedor ou ambiente, ou sem o módulo.
 */
export async function prepararModulo(cliente: ClienteDoParceiro, conexaoId: string, appId: string, modulo: unknown, autorNome: string): Promise<ResultadoDoModulo> {
  const nome = autorDe(autorNome);
  if (!nome) return { ok: false, erro: 'Falta quem preparou.' };
  if (!ehModulo(modulo)) return { ok: false, erro: 'Módulo desconhecido.' };
  const app = await appPorId(appId);
  if (!app) return { ok: false, erro: 'App não encontrado.' };
  try {
    return await cliente.transacao(async (tx): Promise<ResultadoDoModulo> => {
      const c = await tx.integracaoConexao.findUnique({ where: { id: conexaoId }, select: { id: true, estado: true, ambiente: true, provedor: true } });
      if (!c) return { ok: false, erro: 'Integração não encontrada.' };
      if (c.estado !== 'ATIVA') return { ok: false, erro: 'Esta integração está desligada.' };
      if (app.provedor !== c.provedor || app.ambiente !== c.ambiente || !app.modulos.includes(modulo)) {
        return { ok: false, erro: `O app ${app.nome} não serve a esta loja: outro ambiente ou sem o módulo ${ROTULO_DO_MODULO[modulo]}.` };
      }
      await tx.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`erp-integracao-modulo:${tx.parceiroId}:${c.id}:${modulo}`}, 0))::text AS "trava"`;
      const ja = await tx.integracaoConexaoModulo.findUnique({ where: { parceiroId_conexaoId_modulo: { parceiroId: tx.parceiroId, conexaoId: c.id, modulo } }, select: { id: true, estado: true } });
      if (ja) return { ok: true, id: ja.id, estado: ja.estado, mudou: false };
      const criado = await tx.integracaoConexaoModulo.create({ data: { parceiroId: tx.parceiroId, conexaoId: c.id, appId: app.id, modulo, criadoPorNome: nome }, select: { id: true, estado: true } });
      await tx.historicoAlteracao.create({
        data: { parceiroId: tx.parceiroId, entidade: 'IntegracaoConexaoModulo', entidadeId: criado.id, acao: 'PREPAROU', depois: { modulo: ROTULO_DO_MODULO[modulo], app: app.nome, situacao: ROTULO_DO_ESTADO.NAO_SOLICITADO }, autorNome: nome },
      });
      return { ok: true, id: criado.id, estado: criado.estado, mudou: true };
    });
  } catch (e) {
    const frase = fraseDoBanco(e);
    if (frase) return { ok: false, erro: frase };
    throw e;
  }
}

const ACAO_DO_HISTORICO: Record<AcaoDoModulo, string> = {
  solicitar: 'PEDIU',
  'cancelar-pedido': 'CANCELOU',
  autorizar: 'ALTEROU',
  ativar: 'ATIVOU',
  pausar: 'SUSPENDEU',
  retomar: 'REATIVOU',
  'erro-permissao': 'ALTEROU',
};

/**
 * Muda o estado de um módulo pela tabela de transições (`estados.ts`). Ação que não vale a partir do estado de agora não grava
 * nada e diz por quê. Duas mudanças ao mesmo tempo: a segunda vê o conflito (a gravação confere o estado que leu).
 * `erro-permissao` exige a frase do erro (sem segredo: quem chama resume, ex. "403 do iFood: a loja não autorizou o app").
 */
export async function mudarModulo(
  cliente: ClienteDoParceiro,
  moduloId: string,
  acao: unknown,
  autorNome: string,
  o: { erro?: string; agora?: Date } = {},
): Promise<ResultadoDoModulo> {
  const nome = autorDe(autorNome);
  if (!nome) return { ok: false, erro: 'Falta quem fez a mudança.' };
  if (!ehAcaoDoModulo(acao)) return { ok: false, erro: 'Ação desconhecida.' };
  if (typeof moduloId !== 'string' || !moduloId || moduloId.length > 60) return { ok: false, erro: 'Módulo não encontrado.' };
  const erro = typeof o.erro === 'string' ? o.erro.replace(/\s+/g, ' ').trim().slice(0, 500) : '';
  if (acao === 'erro-permissao' && !erro) return { ok: false, erro: 'Diga qual foi o erro de permissão.' };
  const agora = o.agora ?? new Date();
  try {
    return await mudarModuloNaTransacao(cliente, moduloId, acao, nome, erro, agora);
  } catch (e) {
    // O banco recusou (corrida com o desligar, app que perdeu a homologação): a frase dele, sem estourar (decisão 488).
    const frase = fraseDoBanco(e);
    if (frase) return { ok: false, erro: frase };
    throw e;
  }
}

function mudarModuloNaTransacao(cliente: ClienteDoParceiro, moduloId: string, acao: AcaoDoModulo, nome: string, erro: string, agora: Date): Promise<ResultadoDoModulo> {
  return cliente.transacao(async (tx): Promise<ResultadoDoModulo> => {
    const m = await tx.integracaoConexaoModulo.findUnique({
      where: { id: moduloId },
      select: { id: true, estado: true, modulo: true, appId: true, conexao: { select: { estado: true, ambiente: true } } },
    });
    if (!m) return { ok: false, erro: 'Módulo não encontrado.' };
    if (m.conexao.estado !== 'ATIVA' && acao !== 'erro-permissao' && acao !== 'pausar') return { ok: false, erro: 'Esta integração está desligada.' };
    const para = transicao(m.estado, acao, m.conexao.ambiente);
    if (!para) return { ok: false, erro: porQueNao(m.estado, acao, m.conexao.ambiente) };
    // Decisão 487: em produção, ativar (ou retomar) só com o app homologado pelo provedor; o banco confere de novo.
    if (para === 'ATIVO' && m.conexao.ambiente === 'PRODUCAO') {
      const app = await appPorId(m.appId);
      if (app?.estadoHomologacao !== 'HOMOLOGADO') return { ok: false, erro: 'Em produção, o módulo só ativa depois que o app for homologado pelo iFood.' };
    }
    const data: Prisma.IntegracaoConexaoModuloUpdateManyMutationInput = { estado: para };
    if (acao === 'solicitar') data.solicitadoEm = agora;
    if (acao === 'autorizar') Object.assign(data, { autorizadoEm: agora, verificadoEm: agora });
    if (acao === 'ativar') Object.assign(data, { ativadoEm: agora, ativadoPorNome: nome, pausadoEm: null });
    if (acao === 'retomar') data.pausadoEm = null;
    if (acao === 'pausar') data.pausadoEm = agora;
    if (acao === 'erro-permissao') Object.assign(data, { ultimoErro: erro, ultimoErroEm: agora, verificadoEm: agora });
    const r = await tx.integracaoConexaoModulo.updateMany({ where: { id: m.id, estado: m.estado }, data });
    if (r.count !== 1) return { ok: false, erro: MENSAGEM_CONFLITO, conflito: true };
    await tx.historicoAlteracao.create({
      data: {
        parceiroId: tx.parceiroId,
        entidade: 'IntegracaoConexaoModulo',
        entidadeId: m.id,
        acao: ACAO_DO_HISTORICO[acao],
        antes: { modulo: ROTULO_DO_MODULO[m.modulo as Modulo], situacao: ROTULO_DO_ESTADO[m.estado] },
        depois: { modulo: ROTULO_DO_MODULO[m.modulo as Modulo], situacao: ROTULO_DO_ESTADO[para], ...(acao === 'erro-permissao' ? { erro } : {}) },
        autorNome: nome,
      },
    });
    return { ok: true, id: m.id, estado: para, mudou: true };
  });
}

export interface ConexaoNaTela {
  id: string;
  loja: { id: string; nome: string };
  marca: { id: string; nome: string } | null;
  provedor: string;
  ambiente: 'TEST' | 'PRODUCAO';
  idExterno: string;
  idCurto: string | null;
  nomeExterno: string;
  estado: 'ATIVA' | 'DESLIGADA';
  criadoEm: Date;
  criadoPorNome: string;
  modulos: { id: string; modulo: Modulo; estado: EstadoDoModulo; appId: string; ultimoErro: string | null; verificadoEm: Date | null; ativadoEm: Date | null }[];
}

/** As conexões deste parceiro (ativas primeiro), com loja, marca e módulos. Só lê. */
export async function conexoesDoParceiro(cliente: ClienteDoParceiro): Promise<ConexaoNaTela[]> {
  const linhas = await cliente.integracaoConexao.findMany({
    select: {
      id: true,
      provedor: true,
      ambiente: true,
      idExterno: true,
      idCurto: true,
      nomeExterno: true,
      estado: true,
      criadoEm: true,
      criadoPorNome: true,
      loja: { select: { id: true, nome: true } },
      marca: { select: { id: true, nome: true } },
      modulos: { select: { id: true, modulo: true, estado: true, appId: true, ultimoErro: true, verificadoEm: true, ativadoEm: true }, orderBy: { modulo: 'asc' } },
    },
    orderBy: [{ estado: 'asc' }, { criadoEm: 'desc' }],
  });
  return linhas as ConexaoNaTela[];
}
