/** Mesmo volume privado do ERP; namespaces separados para marca, pessoa ERP e administrador. */
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { LIMITE_DA_FOTO, NOME_DA_FOTO, type ExtensaoDaFoto } from './foto';

export type DonoDaImagem = { tipo: 'marca'; parceiroId: string; id: string } | { tipo: 'pessoa-erp' | 'pessoa-flowfoods'; id: string };
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function caminhoDaIdentidade(dono: DonoDaImagem, arquivo: string, base = process.env.ERP_ARQUIVOS_DIR || '/data/erp'): string {
  if (!ID.test(dono.id) || (dono.tipo === 'marca' && !ID.test(dono.parceiroId)) || !NOME_DA_FOTO.test(arquivo)) throw new Error('Referência de imagem inválida.');
  const pasta = path.resolve(base, 'identidade', dono.tipo, ...(dono.tipo === 'marca' ? [dono.parceiroId] : []), dono.id);
  const destino = path.resolve(pasta, arquivo);
  if (!destino.startsWith(pasta + path.sep)) throw new Error('Referência fora da pasta privada.');
  return destino;
}

export async function salvarImagemIdentidade(dono: DonoDaImagem, bytes: Uint8Array, extensao: ExtensaoDaFoto): Promise<string> {
  const arquivo = `${randomBytes(16).toString('hex')}.${extensao}`;
  const destino = caminhoDaIdentidade(dono, arquivo);
  await mkdir(path.dirname(destino), { recursive: true, mode: 0o750 });
  await writeFile(destino, bytes, { flag: 'wx', mode: 0o640 });
  return arquivo;
}

export async function lerImagemIdentidade(dono: DonoDaImagem, arquivo: string): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const destino = caminhoDaIdentidade(dono, arquivo);
    const s = await stat(destino);
    if (!s.isFile() || s.size <= 0 || s.size > LIMITE_DA_FOTO) return null;
    const b = await readFile(destino);
    return b.length <= LIMITE_DA_FOTO ? new Uint8Array(b) : null;
  } catch { return null; }
}

export async function apagarImagemIdentidade(dono: DonoDaImagem, arquivo: string | null): Promise<void> {
  if (!arquivo) return;
  try { await unlink(caminhoDaIdentidade(dono, arquivo)); }
  catch (erro) {
    // O banco já aponta o arquivo atual. Falha de limpeza não desfaz uma gravação concluída.
    if ((erro as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[erp] limpeza de imagem de identidade pendente.');
  }
}
