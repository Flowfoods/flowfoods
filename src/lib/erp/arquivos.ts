/**
 * Arquivos do ERP no disco (1.2: foto da ficha técnica), no mesmo padrão do
 * Portal (`src/lib/portal/arquivos.ts`): um volume nomeado no compose
 * (`erp-arquivos` em /data/erp), pasta criada do usuário do app no
 * Dockerfile.
 *
 *   <ERP_ARQUIVOS_DIR>/<parceiroId>/fichas/<32 hex>.<jpg|png|webp>
 *   <ERP_ARQUIVOS_DIR>/<parceiroId>/fichas/pendentes/<32 hex>.<ext>
 *
 * Pendente (1.3): a foto chega pela rota de envio (`foto-envio.ts`), já sem
 * metadados, e espera ali até o formulário ser salvo — a action só leva o
 * nome e a MOVE para o lugar (rename, mesmo disco). Se a gravação não fechar,
 * ela volta para pendentes (dá para salvar de novo sem reenviar). Pendente
 * esquecida sai depois de 24 h, na faxina feita a cada envio e também ao
 * abrir a lista de fichas (1.4: no máximo a cada 10 min por parceiro, com
 * limite de arquivos por vez).
 *
 * Isolado por parceiro já no caminho, e nada que veio do navegador entra
 * nele: o id do parceiro vem da sessão/portão e o nome é sorteado aqui. Quem
 * serve a foto confere a ficha pelo portão de tenant antes (rota `foto`).
 */

import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, opendir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { NOME_DA_FOTO, TIPOS_DE_FOTO, type ExtensaoDaFoto } from './foto';

function pastaDoErp(): string {
  return process.env.ERP_ARQUIVOS_DIR || '/data/erp';
}

const ID_OK = /^[A-Za-z0-9_-]{1,64}$/;

/** Caminho da foto; recusa id ou nome fora do formato (nunca um `../`). */
export function caminhoDaFoto(parceiroId: string, arquivo: string, base = pastaDoErp(), pendente = false): string {
  if (!ID_OK.test(parceiroId)) throw new Error('parceiro fora do formato');
  if (!NOME_DA_FOTO.test(arquivo)) throw new Error('nome de foto fora do formato');
  const pasta = pendente ? path.join(base, parceiroId, 'fichas', 'pendentes') : path.join(base, parceiroId, 'fichas');
  const final = path.join(pasta, arquivo);
  if (!final.startsWith(pasta + path.sep)) throw new Error('caminho fora da pasta do parceiro');
  return final;
}

/** Grava a foto (já conferida e limpa) com nome sorteado; devolve o nome. Nunca sobrescreve. */
export async function salvarFoto(parceiroId: string, bytes: Uint8Array, extensao: ExtensaoDaFoto, pendente = false): Promise<string> {
  const arquivo = `${randomBytes(16).toString('hex')}.${extensao}`;
  const caminho = caminhoDaFoto(parceiroId, arquivo, pastaDoErp(), pendente);
  await mkdir(path.dirname(caminho), { recursive: true, mode: 0o750 });
  await writeFile(caminho, bytes, { flag: 'wx', mode: 0o640 });
  return arquivo;
}

/** Apaga sem estourar: arquivo que já não está lá não é erro (o banco é a verdade). */
export async function apagarFoto(parceiroId: string, arquivo: string | null | undefined): Promise<void> {
  if (!arquivo) return;
  try {
    await unlink(caminhoDaFoto(parceiroId, arquivo));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[erp] foto não apagada:', (e as Error).message);
  }
}

/** Fluxo e tamanho para responder; null se o arquivo não está no disco. */
export async function abrirFoto(parceiroId: string, arquivo: string): Promise<{ corpo: ReadableStream; tamanho: number } | null> {
  const caminho = caminhoDaFoto(parceiroId, arquivo);
  try {
    const s = await stat(caminho);
    return { corpo: Readable.toWeb(createReadStream(caminho)) as ReadableStream, tamanho: s.size };
  } catch {
    return null;
  }
}

const UM_DIA = 24 * 60 * 60 * 1000;

/**
 * Leva a foto pendente (enviada pela rota, deste parceiro) para o lugar
 * definitivo. null = não existe (outro parceiro, já usada, faxinada).
 */
export async function assumirFotoPendente(parceiroId: string, arquivo: string): Promise<{ arquivo: string; mime: string; bytes: number } | null> {
  if (!NOME_DA_FOTO.test(arquivo)) return null;
  const de = caminhoDaFoto(parceiroId, arquivo, pastaDoErp(), true);
  try {
    const s = await stat(de);
    await rename(de, caminhoDaFoto(parceiroId, arquivo));
    const extensao = arquivo.slice(arquivo.lastIndexOf('.') + 1) as ExtensaoDaFoto;
    return { arquivo, mime: TIPOS_DE_FOTO[extensao], bytes: s.size };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

/** A gravação não fechou: a foto volta a ser pendente (salvar de novo não pede reenviar). */
export async function devolverFotoPendente(parceiroId: string, arquivo: string): Promise<void> {
  try {
    await rename(caminhoDaFoto(parceiroId, arquivo), caminhoDaFoto(parceiroId, arquivo, pastaDoErp(), true));
  } catch (e) {
    console.warn('[erp] foto pendente não devolvida:', (e as Error).message);
  }
}

/** Teto de uma faxina: arquivos olhados e apagados por vez (a próxima continua). */
export const FAXINA = { olhar: 500, apagar: 50, intervaloMs: 10 * 60 * 1000 } as const;

/**
 * Apaga as pendentes deste parceiro com mais de 24 h (feito a cada envio e ao
 * abrir a lista de fichas; melhor esforço). Barata e com teto: olha no máximo
 * `FAXINA.olhar` nomes e apaga no máximo `FAXINA.apagar`.
 */
export async function faxinarPendentes(parceiroId: string, agora = Date.now()): Promise<number> {
  const pasta = path.dirname(caminhoDaFoto(parceiroId, `${'0'.repeat(32)}.jpg`, pastaDoErp(), true));
  let apagadas = 0;
  let olhadas = 0;
  try {
    const dir = await opendir(pasta);
    for await (const e of dir) {
      if (++olhadas > FAXINA.olhar || apagadas >= FAXINA.apagar) break;
      if (!e.isFile() || !NOME_DA_FOTO.test(e.name)) continue;
      const c = path.join(pasta, e.name);
      const s = await stat(c);
      if (agora - s.mtimeMs > UM_DIA) {
        await unlink(c);
        apagadas++;
      }
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[erp] faxina de fotos pendentes:', (e as Error).message);
  }
  return apagadas;
}

/** Última faxina por parceiro neste processo (o intervalo é por processo; o teto vale sempre). */
const ultimaFaxina = new Map<string, number>();

/**
 * Faxina de pendentes ao abrir a lista de fichas (herança d da 1.3): a pendente
 * esquecida não depende de alguém enviar outra foto. No máximo uma a cada
 * `FAXINA.intervaloMs` por parceiro; nunca derruba a tela.
 */
export async function faxinarPendentesDeVezEmQuando(parceiroId: string, agora = Date.now()): Promise<number | null> {
  const ultima = ultimaFaxina.get(parceiroId);
  if (ultima !== undefined && agora - ultima < FAXINA.intervaloMs) return null;
  ultimaFaxina.set(parceiroId, agora);
  if (ultimaFaxina.size > 5000) ultimaFaxina.delete(ultimaFaxina.keys().next().value!);
  try {
    return await faxinarPendentes(parceiroId, agora);
  } catch {
    return 0;
  }
}
