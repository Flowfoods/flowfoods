/**
 * Arquivos do ERP no disco (1.2: foto da ficha técnica), no mesmo padrão do
 * Portal (`src/lib/portal/arquivos.ts`): um volume nomeado no compose
 * (`erp-arquivos` em /data/erp), pasta criada do usuário do app no
 * Dockerfile.
 *
 *   <ERP_ARQUIVOS_DIR>/<parceiroId>/fichas/<32 hex>.<jpg|png|webp>
 *
 * Isolado por parceiro já no caminho, e nada que veio do navegador entra
 * nele: o id do parceiro vem da sessão/portão e o nome é sorteado aqui. Quem
 * serve a foto confere a ficha pelo portão de tenant antes (rota `foto`).
 */

import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { NOME_DA_FOTO, type ExtensaoDaFoto } from './foto';

export function pastaDoErp(): string {
  return process.env.ERP_ARQUIVOS_DIR || '/data/erp';
}

const ID_OK = /^[A-Za-z0-9_-]{1,64}$/;

/** Caminho da foto; recusa id ou nome fora do formato (nunca um `../`). */
export function caminhoDaFoto(parceiroId: string, arquivo: string, base = pastaDoErp()): string {
  if (!ID_OK.test(parceiroId)) throw new Error('parceiro fora do formato');
  if (!NOME_DA_FOTO.test(arquivo)) throw new Error('nome de foto fora do formato');
  const pasta = path.join(base, parceiroId, 'fichas');
  const final = path.join(pasta, arquivo);
  if (!final.startsWith(pasta + path.sep)) throw new Error('caminho fora da pasta do parceiro');
  return final;
}

/** Grava a foto (já conferida) com nome sorteado; devolve o nome. Nunca sobrescreve. */
export async function salvarFoto(parceiroId: string, bytes: Uint8Array, extensao: ExtensaoDaFoto): Promise<string> {
  const arquivo = `${randomBytes(16).toString('hex')}.${extensao}`;
  const caminho = caminhoDaFoto(parceiroId, arquivo);
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
