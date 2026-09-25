/**
 * Portal do cliente sobre Prisma e disco.
 *
 * As rotas HTTP ficam finas: validam o formato e chamam daqui. A regra (item
 * existe no questionário? marcação é válida? arquivo cabe?) mora aqui, num
 * lugar só, para a rota pública e o painel não divergirem.
 */

import { mkdir, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DateTime } from 'luxon';
import type { PortalCliente } from '@prisma/client';
import { prisma } from '@/lib/db';
import { acharItem, ehMarcacao, questionario, type Marcacao, type Questionario } from './questionario';
import { calcularProgresso, type Progresso } from './progresso';
import { LIMITE_BYTES, caminhoDoArquivo, pastaBase } from './arquivos';
import { enviarAviso, montarAviso } from './aviso';

/** Texto de uma resposta. Folgado para quem cola um relato longo. */
export const LIMITE_TEXTO = 20_000;

const TOKEN_OK = /^[a-f0-9]{32}$/;

export class ErroPortal extends Error {
  constructor(
    msg: string,
    readonly status: number = 400,
  ) {
    super(msg);
    this.name = 'ErroPortal';
  }
}

export interface ClienteCarregado {
  cliente: PortalCliente;
  q: Questionario;
}

export async function carregarPorToken(token: string): Promise<ClienteCarregado | null> {
  // Formato conferido antes do banco: token torto não custa query.
  if (!TOKEN_OK.test(token)) return null;
  const cliente = await prisma.portalCliente.findUnique({ where: { token } });
  if (!cliente) return null;
  const q = questionario(cliente.questionario);
  if (!q) return null;
  return { cliente, q };
}

export async function exigirCliente(token: string): Promise<ClienteCarregado> {
  const c = await carregarPorToken(token);
  if (!c) throw new ErroPortal('Link não encontrado.', 404);
  return c;
}

export async function progressoDoCliente(clienteId: string, q: Questionario): Promise<Progresso> {
  const [respostas, arquivos] = await Promise.all([
    prisma.portalResposta.findMany({
      where: { clienteId },
      select: { itemId: true, texto: true, marcacao: true },
    }),
    prisma.portalArquivo.findMany({ where: { clienteId }, select: { itemId: true } }),
  ]);
  return calcularProgresso(q.itens, respostas, arquivos);
}

/**
 * Autosave de um item. Só mexe no que veio: mandar só `marcacao` não apaga o
 * texto, e vice-versa. `null` explícito limpa.
 */
export async function salvarResposta(
  { cliente, q }: ClienteCarregado,
  entrada: { itemId?: unknown; texto?: unknown; marcacao?: unknown },
): Promise<void> {
  const itemId = typeof entrada.itemId === 'string' ? entrada.itemId : '';
  if (!acharItem(q, itemId)) throw new ErroPortal('Item desconhecido.');

  const dados: { texto?: string | null; marcacao?: Marcacao | null } = {};

  if (entrada.texto !== undefined) {
    if (entrada.texto !== null && typeof entrada.texto !== 'string') throw new ErroPortal('Texto inválido.');
    if (typeof entrada.texto === 'string' && entrada.texto.length > LIMITE_TEXTO) {
      throw new ErroPortal(`Texto acima de ${LIMITE_TEXTO} caracteres.`);
    }
    dados.texto = entrada.texto;
  }
  if (entrada.marcacao !== undefined) {
    if (entrada.marcacao !== null && !ehMarcacao(entrada.marcacao)) throw new ErroPortal('Marcação inválida.');
    dados.marcacao = entrada.marcacao;
  }
  if (Object.keys(dados).length === 0) return;

  await prisma.$transaction([
    prisma.portalResposta.upsert({
      where: { clienteId_itemId: { clienteId: cliente.id, itemId } },
      create: { clienteId: cliente.id, itemId, ...dados },
      update: dados,
    }),
    prisma.portalCliente.update({
      where: { id: cliente.id },
      data: { ultimaAtividadeEm: new Date() },
    }),
  ]);
}

export interface ArquivoSalvo {
  id: string;
  itemId: string;
  nomeOriginal: string;
  tamanho: number;
}

export async function salvarArquivo(
  { cliente, q }: ClienteCarregado,
  itemId: string,
  arquivo: File,
): Promise<ArquivoSalvo> {
  const item = acharItem(q, itemId);
  if (!item) throw new ErroPortal('Item desconhecido.');
  if (arquivo.size === 0) throw new ErroPortal('Arquivo vazio.');
  if (arquivo.size > LIMITE_BYTES) throw new ErroPortal('Arquivo acima de 50 MB.', 413);

  const caminho = caminhoDoArquivo({
    base: pastaBase(),
    token: cliente.token,
    bloco: item.bloco,
    agora: DateTime.now(),
    nomeOriginal: arquivo.name || 'arquivo',
  });

  // Disco primeiro, banco depois: se o disco falhar, não sobra registro
  // apontando para arquivo que não existe.
  await mkdir(path.dirname(caminho), { recursive: true });
  await writeFile(caminho, Buffer.from(await arquivo.arrayBuffer()), { flag: 'wx' });

  try {
    const [salvo] = await prisma.$transaction([
      prisma.portalArquivo.create({
        data: {
          clienteId: cliente.id,
          itemId,
          bloco: item.bloco,
          nomeOriginal: arquivo.name.slice(0, 255) || 'arquivo',
          caminho,
          tamanho: arquivo.size,
          mime: arquivo.type || null,
        },
        select: { id: true, itemId: true, nomeOriginal: true, tamanho: true },
      }),
      prisma.portalCliente.update({
        where: { id: cliente.id },
        data: { ultimaAtividadeEm: new Date() },
      }),
    ]);
    return salvo;
  } catch (e) {
    await unlink(caminho).catch(() => undefined);
    throw e;
  }
}

export async function removerArquivo({ cliente }: ClienteCarregado, arquivoId: string): Promise<void> {
  const a = await prisma.portalArquivo.findFirst({ where: { id: arquivoId, clienteId: cliente.id } });
  if (!a) throw new ErroPortal('Arquivo não encontrado.', 404);
  await prisma.portalArquivo.delete({ where: { id: a.id } });
  await unlink(a.caminho).catch(() => undefined);
}

/** Intervalo mínimo entre dois avisos do mesmo cliente: duplo clique não vira duas mensagens. */
const AVISO_INTERVALO_MS = 5 * 60 * 1000;

export interface ResultadoFinalizar {
  progresso: Progresso;
  aviso: 'ENVIADO' | 'JA_ENVIADO' | 'FALHOU';
}

export async function finalizar(c: ClienteCarregado, origem: string): Promise<ResultadoFinalizar> {
  const { cliente, q } = c;
  const progresso = await progressoDoCliente(cliente.id, q);
  const agora = new Date();

  await prisma.portalCliente.update({
    where: { id: cliente.id },
    data: { finalizadoEm: agora, ultimaAtividadeEm: agora },
  });

  if (cliente.avisoEnviadoEm && agora.getTime() - cliente.avisoEnviadoEm.getTime() < AVISO_INTERVALO_MS) {
    return { progresso, aviso: 'JA_ENVIADO' };
  }

  const texto = montarAviso({
    cliente: cliente.nome,
    progresso,
    linkPainel: `${origem}/rodolfo/portal/${cliente.id}`,
  });
  const r = await enviarAviso(texto);

  await prisma.$transaction([
    prisma.portalCliente.update({
      where: { id: cliente.id },
      data: r.ok ? { avisoEnviadoEm: agora, avisoErro: null } : { avisoErro: r.motivo ?? 'falhou' },
    }),
    prisma.auditLog.create({
      data: {
        evento: r.ok ? 'portal_aviso_enviado' : 'portal_aviso_falhou',
        dados: { clienteId: cliente.id, motivo: r.motivo ?? null },
      },
    }),
  ]);

  return { progresso, aviso: r.ok ? 'ENVIADO' : 'FALHOU' };
}

/**
 * Apaga respostas e arquivos (banco e disco) e mantém o cadastro e o link.
 * É o "limpar o teste" antes de mandar o link para o cliente.
 */
export async function zerarCliente(clienteId: string): Promise<{ respostas: number; arquivos: number }> {
  const cliente = await prisma.portalCliente.findUnique({ where: { id: clienteId } });
  if (!cliente) throw new ErroPortal('Cliente não encontrado.', 404);

  const [respostas, arquivos] = await prisma.$transaction([
    prisma.portalResposta.deleteMany({ where: { clienteId } }),
    prisma.portalArquivo.deleteMany({ where: { clienteId } }),
    prisma.portalCliente.update({
      where: { id: clienteId },
      data: { finalizadoEm: null, ultimaAtividadeEm: null, avisoEnviadoEm: null, avisoErro: null },
    }),
  ]);

  // A pasta inteira do cliente sai junto. O token é validado por formato, então
  // o caminho nunca escapa da base.
  if (TOKEN_OK.test(cliente.token)) {
    await rm(path.join(pastaBase(), cliente.token), { recursive: true, force: true });
  }

  return { respostas: respostas.count, arquivos: arquivos.count };
}
