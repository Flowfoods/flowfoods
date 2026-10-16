/**
 * Pedido de acesso do onboarding (0.5) — o banco. Dois módulos tocam nas
 * tabelas do pedido (teste-guarda): este e a ativação em `credenciais.ts`.
 *
 * O que entra por aqui:
 *   - o formulário PÚBLICO da landing (`receberPedidoDaLanding`): limite por IP
 *     e teto global em tabela própria, armadilha, reenvio no mesmo cartão e UMA
 *     resposta só, exista ou não o contato;
 *   - o quadro do nível 1 (listar, mover de etapa, recusar, cadastrar pedido
 *     manual, excluir dados do recusado). A ativação é `ativarPedido`.
 *
 * Nada aqui cria Parceiro Flow, usuário ou link: antes da ativação não existe
 * tenant nem credencial, então o pedido não alcança nada por construção.
 */

import type { Prisma, PrismaClient, PedidoParceiroStatus, TentativaPedidoResultado } from '@prisma/client';
import { prisma } from '@/lib/db';
import { baseDoErp } from './base';
import {
  caiuNaArmadilha,
  CONSENTIMENTO,
  DIAS_NO_QUADRO,
  diasDeAtrasoDoPedido,
  fraseJaDecidido,
  FRASE_PEDIDO_MEXIDO,
  lerMotivo,
  lerPedido,
  valoresParaOFormulario,
  type DadosDoPedido,
  type ErrosDoPedido,
  type EtapaDoPedido,
} from './pedido-campos';
import { travar } from './trava';

export interface LimitesDoFormulario {
  /** Pedidos aceitos (novos, reenviados ou na armadilha) por IP na hora e no dia. */
  porHora: number;
  porDia: number;
  /** Cartões novos por dia, somando todos os IPs. */
  globalPorDia: number;
  /** Teto de linhas de qualquer resultado por IP na hora: passou, nem anota. */
  ruidoPorHora: number;
}

export const LIMITES_DO_FORMULARIO: LimitesDoFormulario = { porHora: 3, porDia: 10, globalPorDia: 100, ruidoPorHora: 40 };

export interface Opcoes {
  base?: PrismaClient;
  agora?: Date;
  limites?: Partial<LimitesDoFormulario>;
}

function abrir(o: Opcoes = {}) {
  return { db: o.base ?? baseDoErp(), agora: o.agora ?? new Date(), lim: { ...LIMITES_DO_FORMULARIO, ...o.limites } };
}

const HORA_MS = 3_600_000;
const DIA_MS = 24 * HORA_MS;
const ABERTAS: PedidoParceiroStatus[] = ['NOVO', 'EM_CONVERSA'];
/** Resultados que contam para o limite por IP. */
const CONTAM_NO_IP: TentativaPedidoResultado[] = ['ACEITO', 'REENVIO', 'ARMADILHA'];
const AUTOR_DO_SITE = 'Formulário do site';

/** Desfaz a transação e devolve a frase para a tela. */
class Desfazer extends Error {
  constructor(readonly frase: string) {
    super('desfazer');
  }
}

async function registrar(
  tx: Prisma.TransactionClient,
  pedidoId: string,
  acao: string,
  e: { antes?: Prisma.InputJsonValue; depois?: Prisma.InputJsonValue; motivo?: string | null; autorNome: string; agora: Date },
) {
  await tx.pedidoParceiroEvento.create({
    data: { pedidoId, acao, antes: e.antes, depois: e.depois, motivo: e.motivo ?? null, autorNome: e.autorNome, ocorridoEm: e.agora },
  });
}

/** Trava o contato (e-mail e depois WhatsApp, ordem fixa) e acha o pedido aberto dele. */
async function pedidoAbertoDoContato(tx: Prisma.TransactionClient, d: Pick<DadosDoPedido, 'email' | 'whatsapp'>) {
  await travar(tx, `erp-pedido-contato:email:${d.email}`);
  await travar(tx, `erp-pedido-contato:whats:${d.whatsapp}`);
  return tx.pedidoParceiro.findFirst({
    where: { status: { in: ABERTAS }, OR: [{ email: d.email }, { whatsapp: d.whatsapp }] },
    orderBy: { criadoEm: 'asc' },
  });
}

// ========================================================= formulário público

export type RespostaDoFormulario =
  | { tipo: 'recebido' }
  | { tipo: 'bloqueado' }
  | { tipo: 'erros'; erros: ErrosDoPedido; valores: Record<string, string> };

/**
 * A landing manda o pedido. UMA transação sob a trava do IP (e, nesta ordem, a
 * do teto global e as do contato): conta, anota a tentativa e grava. Com 20
 * pedidos juntos do mesmo IP, só 3 passam: cada um espera a trava e vê as
 * linhas dos anteriores.
 *
 * "Recebido" é a resposta de todo caminho que não é erro de preenchimento nem
 * bloqueio: pedido novo, reenvio do mesmo contato (entra no cartão que já
 * existe) e armadilha preenchida. O formulário nunca consulta `UsuarioErp`.
 */
export async function receberPedidoDaLanding(entrada: Record<string, unknown>, ipBruto: string, o?: Opcoes): Promise<RespostaDoFormulario> {
  const { db, agora, lim } = abrir(o);
  const ip = (ipBruto || 'desconhecido').slice(0, 64);
  const notar = (tx: Prisma.TransactionClient, resultado: TentativaPedidoResultado) =>
    tx.tentativaPedidoParceiro.create({ data: { ip, resultado, criadoEm: agora } });

  return db.$transaction(
    async (tx): Promise<RespostaDoFormulario> => {
      await travar(tx, `erp-pedido-ip:${ip}`);
      const desdeHora = new Date(agora.getTime() - HORA_MS);
      const desdeDia = new Date(agora.getTime() - DIA_MS);

      // Passou do ruído: nem anota (a tabela não cresce com quem insiste).
      if ((await tx.tentativaPedidoParceiro.count({ where: { ip, criadoEm: { gte: desdeHora } } })) >= lim.ruidoPorHora) {
        return { tipo: 'bloqueado' };
      }
      const naHora = await tx.tentativaPedidoParceiro.count({ where: { ip, resultado: { in: CONTAM_NO_IP }, criadoEm: { gte: desdeHora } } });
      const noDia = await tx.tentativaPedidoParceiro.count({ where: { ip, resultado: { in: CONTAM_NO_IP }, criadoEm: { gte: desdeDia } } });
      if (naHora >= lim.porHora || noDia >= lim.porDia) {
        await notar(tx, 'BLOQUEADO');
        return { tipo: 'bloqueado' };
      }

      if (caiuNaArmadilha(entrada)) {
        await notar(tx, 'ARMADILHA');
        return { tipo: 'recebido' };
      }

      const lido = lerPedido(entrada, { exigirConsentimento: true });
      if (!lido.ok) {
        await notar(tx, 'INVALIDO');
        return { tipo: 'erros', erros: lido.erros, valores: valoresParaOFormulario(entrada) };
      }
      const d = lido.dados;

      // Teto global de cartões novos por dia (todos os IPs): exato, sob a trava global.
      await travar(tx, 'erp-pedido-global');
      const existente = await pedidoAbertoDoContato(tx, d);
      if (existente) {
        await tx.pedidoParceiro.update({ where: { id: existente.id }, data: { reenvios: { increment: 1 } } });
        await registrar(tx, existente.id, 'REENVIOU', { depois: { reenvios: existente.reenvios + 1 }, autorNome: AUTOR_DO_SITE, agora });
        await notar(tx, 'REENVIO');
        return { tipo: 'recebido' };
      }
      if ((await tx.tentativaPedidoParceiro.count({ where: { resultado: 'ACEITO', criadoEm: { gte: desdeDia } } })) >= lim.globalPorDia) {
        await notar(tx, 'BLOQUEADO');
        return { tipo: 'bloqueado' };
      }
      const pedido = await tx.pedidoParceiro.create({
        data: {
          origem: 'LANDING',
          ...d,
          consentimentoEm: agora,
          consentimentoVersao: CONSENTIMENTO.versao,
          etapaDesde: agora,
          criadoEm: agora,
        },
      });
      await registrar(tx, pedido.id, 'CRIOU', { depois: { etapa: 'NOVO', origem: 'LANDING' }, autorNome: AUTOR_DO_SITE, agora });
      await notar(tx, 'ACEITO');
      return { tipo: 'recebido' };
    },
    { maxWait: 10_000, timeout: 10_000 },
  );
}

// ================================================================== o quadro

export interface CartaoDoPedido {
  id: string;
  status: EtapaDoPedido;
  origem: 'LANDING' | 'MANUAL';
  nomeGrupo: string;
  responsavel: string;
  cidade: string;
  lojas: number;
  marcas: number;
  reenvios: number;
  etapaDesde: Date;
  criadoEm: Date;
  atrasoDias: number;
  excluido: boolean;
}

export type QuadroDePedidos = Record<EtapaDoPedido, CartaoDoPedido[]>;

const LIMITE_POR_COLUNA = 200;

/** Novo e Em conversa inteiros (mais antigo primeiro); Ativado e Recusado, dos últimos 30 dias. */
export async function listarQuadro(o?: Opcoes): Promise<QuadroDePedidos> {
  const { db, agora } = abrir(o);
  const recentes = new Date(agora.getTime() - DIAS_NO_QUADRO * DIA_MS);
  const linhas = await db.pedidoParceiro.findMany({
    where: { OR: [{ status: { in: ABERTAS } }, { status: { in: ['ATIVADO', 'RECUSADO'] }, etapaDesde: { gte: recentes } }] },
    orderBy: { etapaDesde: 'asc' },
    take: LIMITE_POR_COLUNA * 4,
  });
  const quadro: QuadroDePedidos = { NOVO: [], EM_CONVERSA: [], ATIVADO: [], RECUSADO: [] };
  for (const p of linhas) {
    const c: CartaoDoPedido = {
      id: p.id,
      status: p.status,
      origem: p.origem,
      nomeGrupo: p.nomeGrupo,
      responsavel: p.responsavel,
      cidade: p.cidade,
      lojas: p.lojas,
      marcas: p.marcas,
      reenvios: p.reenvios,
      etapaDesde: p.etapaDesde,
      criadoEm: p.criadoEm,
      atrasoDias: diasDeAtrasoDoPedido(p, agora),
      excluido: p.anonimizadoEm !== null,
    };
    quadro[p.status].push(c);
  }
  // Fechados: o mais recente primeiro.
  quadro.ATIVADO.reverse();
  quadro.RECUSADO.reverse();
  return quadro;
}

/** Para o sino e a métrica do nível 1: pedidos abertos e quantos passaram do prazo. */
export async function contarPedidosAbertos(o?: Opcoes): Promise<{ abertos: number; atrasados: number }> {
  const { db, agora } = abrir(o);
  const abertos = await db.pedidoParceiro.findMany({ where: { status: { in: ABERTAS } }, select: { status: true, etapaDesde: true } });
  return { abertos: abertos.length, atrasados: abertos.filter((p) => diasDeAtrasoDoPedido(p, agora) > 0).length };
}

export interface EventoDoPedido {
  id: string;
  acao: string;
  antes: unknown;
  depois: unknown;
  motivo: string | null;
  autorNome: string;
  ocorridoEm: Date;
}

export interface DetalheDoPedido extends CartaoDoPedido {
  whatsapp: string;
  email: string;
  consentimentoEm: Date | null;
  consentimentoVersao: string | null;
  motivoRecusa: string | null;
  versao: number;
  parceiro: { id: string; slug: string; nome: string } | null;
  eventos: EventoDoPedido[];
  /** Ligação com o Barney (só leitura): status do lead com este WhatsApp, se houver. */
  leadDoBarney: string | null;
}

export async function obterPedido(id: string, o?: Opcoes): Promise<DetalheDoPedido | null> {
  const { db, agora } = abrir(o);
  const p = await db.pedidoParceiro.findUnique({
    where: { id },
    include: { parceiroCriado: { select: { id: true, slug: true, nome: true } }, eventos: { orderBy: { ocorridoEm: 'desc' }, take: 100 } },
  });
  if (!p) return null;
  const lead = p.whatsapp.length >= 10 ? await prisma.lead.findFirst({ where: { telefoneNormalizado: p.whatsapp }, select: { status: true } }) : null;
  return {
    id: p.id,
    status: p.status,
    origem: p.origem,
    nomeGrupo: p.nomeGrupo,
    responsavel: p.responsavel,
    cidade: p.cidade,
    lojas: p.lojas,
    marcas: p.marcas,
    reenvios: p.reenvios,
    etapaDesde: p.etapaDesde,
    criadoEm: p.criadoEm,
    atrasoDias: diasDeAtrasoDoPedido(p, agora),
    excluido: p.anonimizadoEm !== null,
    whatsapp: p.whatsapp,
    email: p.email,
    consentimentoEm: p.consentimentoEm,
    consentimentoVersao: p.consentimentoVersao,
    motivoRecusa: p.motivoRecusa,
    versao: p.versao,
    parceiro: p.parceiroCriado,
    eventos: p.eventos.map((e) => ({ id: e.id, acao: e.acao, antes: e.antes, depois: e.depois, motivo: e.motivo, autorNome: e.autorNome, ocorridoEm: e.ocorridoEm })),
    leadDoBarney: lead?.status ?? null,
  };
}

// ============================================================ decisões do nível 1

export type ResultadoDaDecisao = { ok: true; mensagem: string } | { ok: false; erro: string };

/** Trava o pedido, lê, confere se ainda está aberto e na versão que a pessoa viu. */
async function pedidoParaDecidir(tx: Prisma.TransactionClient, id: string, versaoLida: number) {
  await travar(tx, `erp-pedido:${id}`);
  const p = await tx.pedidoParceiro.findUnique({ where: { id } });
  if (!p) throw new Desfazer('Pedido não encontrado.');
  if (!ABERTAS.includes(p.status)) {
    const ev = await tx.pedidoParceiroEvento.findFirst({
      where: { pedidoId: id, acao: { in: ['ATIVOU', 'RECUSOU'] } },
      orderBy: { ocorridoEm: 'desc' },
    });
    throw new Desfazer(fraseJaDecidido(p.status, ev?.autorNome ?? null, ev?.ocorridoEm ?? null));
  }
  if (p.versao !== versaoLida) throw new Desfazer(FRASE_PEDIDO_MEXIDO);
  return p;
}

async function decidir(db: PrismaClient, fn: (tx: Prisma.TransactionClient) => Promise<string>): Promise<ResultadoDaDecisao> {
  try {
    return { ok: true, mensagem: await db.$transaction(fn, { maxWait: 10_000, timeout: 10_000 }) };
  } catch (e) {
    if (e instanceof Desfazer) return { ok: false, erro: e.frase };
    throw e;
  }
}

/** Novo ⇄ Em conversa. A etapa nova recomeça a contar o atraso. */
export async function moverPedido(id: string, para: 'NOVO' | 'EM_CONVERSA', versaoLida: number, autorNome: string, o?: Opcoes) {
  const { db, agora } = abrir(o);
  return decidir(db, async (tx) => {
    const p = await pedidoParaDecidir(tx, id, versaoLida);
    if (p.status === para) return 'Nada mudou.';
    const { count } = await tx.pedidoParceiro.updateMany({
      where: { id, status: p.status, versao: p.versao },
      data: { status: para, etapaDesde: agora, versao: { increment: 1 }, atualizadoEm: agora },
    });
    if (count === 0) throw new Desfazer(FRASE_PEDIDO_MEXIDO);
    await registrar(tx, id, 'MOVEU', { antes: { etapa: p.status }, depois: { etapa: para }, autorNome, agora });
    return para === 'EM_CONVERSA' ? 'Pedido em conversa.' : 'Pedido voltou para Novo.';
  });
}

/** Recusa com motivo obrigatório. Nenhum parceiro, usuário ou link nasce. */
export async function recusarPedido(id: string, motivoBruto: unknown, versaoLida: number, autorNome: string, o?: Opcoes) {
  const m = lerMotivo(motivoBruto);
  if (!m.ok) return { ok: false as const, erro: m.erro };
  const { db, agora } = abrir(o);
  return decidir(db, async (tx) => {
    const p = await pedidoParaDecidir(tx, id, versaoLida);
    const { count } = await tx.pedidoParceiro.updateMany({
      where: { id, status: { in: ABERTAS }, versao: p.versao },
      data: { status: 'RECUSADO', motivoRecusa: m.motivo, etapaDesde: agora, versao: { increment: 1 }, atualizadoEm: agora },
    });
    if (count === 0) throw new Desfazer(FRASE_PEDIDO_MEXIDO);
    await registrar(tx, id, 'RECUSOU', { antes: { etapa: p.status }, depois: { etapa: 'RECUSADO' }, motivo: m.motivo, autorNome, agora });
    return 'Pedido recusado.';
  });
}

/**
 * LGPD: apaga os dados pessoais de um pedido RECUSADO (a pessoa pediu, ou os
 * 180 dias passaram). O cartão e o histórico ficam, sem dado pessoal.
 */
export async function excluirDadosDoPedido(id: string, autorNome: string, o?: Opcoes): Promise<ResultadoDaDecisao> {
  const { db, agora } = abrir(o);
  return decidir(db, async (tx) => {
    await travar(tx, `erp-pedido:${id}`);
    const p = await tx.pedidoParceiro.findUnique({ where: { id } });
    if (!p) throw new Desfazer('Pedido não encontrado.');
    if (p.status !== 'RECUSADO') throw new Desfazer('Só se excluem os dados de um pedido recusado.');
    if (p.anonimizadoEm) return 'Os dados já tinham sido excluídos.';
    await tx.pedidoParceiro.update({
      where: { id },
      data: {
        nomeGrupo: '(dados excluídos)',
        responsavel: '(dados excluídos)',
        whatsapp: '',
        email: '',
        cidade: '',
        anonimizadoEm: agora,
        versao: { increment: 1 },
      },
    });
    await registrar(tx, id, 'EXCLUIU_DADOS', { autorNome, agora });
    return 'Dados pessoais excluídos. O cartão e o histórico ficam, sem nome nem contato.';
  });
}

/** "Cadastrar pedido manual": o Rodolfo digita quem chegou por outro caminho. */
export async function cadastrarPedidoManual(
  entrada: Record<string, unknown>,
  autorNome: string,
  o?: Opcoes,
): Promise<{ ok: true; id: string } | { ok: false; erros: ErrosDoPedido }> {
  const lido = lerPedido(entrada, { exigirConsentimento: false });
  if (!lido.ok) return { ok: false, erros: lido.erros };
  const status: PedidoParceiroStatus = entrada.etapa === 'EM_CONVERSA' ? 'EM_CONVERSA' : 'NOVO';
  const { db, agora } = abrir(o);
  try {
    const id = await db.$transaction(
      async (tx) => {
        const igual = await pedidoAbertoDoContato(tx, lido.dados);
        if (igual) throw new Desfazer(`Já existe um pedido aberto com esse contato: “${igual.nomeGrupo}”.`);
        const p = await tx.pedidoParceiro.create({
          data: { origem: 'MANUAL', ...lido.dados, status, etapaDesde: agora, criadoEm: agora },
        });
        await registrar(tx, p.id, 'CRIOU', { depois: { etapa: status, origem: 'MANUAL' }, autorNome, agora });
        return p.id;
      },
      { maxWait: 10_000, timeout: 10_000 },
    );
    return { ok: true, id };
  } catch (e) {
    if (e instanceof Desfazer) return { ok: false, erros: { geral: e.frase } };
    throw e;
  }
}
