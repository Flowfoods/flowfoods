/**
 * Onde os arquivos do cliente caem no disco.
 *
 *   <PORTAL_UPLOAD_DIR>/<token>/<bloco>/<AAAAMMDD-HHmmss>-<nome>
 *
 * O padrão é `/data/portal`, que no compose é um volume nomeado: sem volume, o
 * arquivo some no próximo deploy.
 *
 * O nome que vem do navegador é dado do cliente, não confiável. Tudo que
 * chega no caminho passa por `nomeSeguro`: sem barra, sem `..`, sem caractere
 * de controle — um `../../etc/passwd` vira um nome de arquivo inofensivo, e não
 * um arquivo fora da pasta dela.
 */

import path from 'node:path';
import type { DateTime } from 'luxon';

export { LIMITE_BYTES, formatarTamanho } from './limites';

export function pastaBase(): string {
  return process.env.PORTAL_UPLOAD_DIR || '/data/portal';
}

export function nomeSeguro(original: string): string {
  const base = (original.split(/[\\/]/).pop() ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // acento some, a letra fica
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+/, '') // nada de arquivo oculto nem "..": o ponto inicial cai
    .slice(-120); // corta pelo começo: a extensão é o que importa manter

  return base.replace(/^[.-]+/, '') || 'arquivo';
}

/** Token e bloco também vão para o caminho: só aceitam o formato esperado. */
const TOKEN_OK = /^[a-f0-9]{16,64}$/;
const BLOCO_OK = /^[A-Z0-9]{1,4}$/;

export function caminhoDoArquivo(params: {
  base: string;
  token: string;
  bloco: string;
  agora: DateTime;
  nomeOriginal: string;
}): string {
  const { base, token, bloco, agora, nomeOriginal } = params;
  if (!TOKEN_OK.test(token)) throw new Error('token fora do formato');
  if (!BLOCO_OK.test(bloco)) throw new Error('bloco fora do formato');

  const carimbo = agora.setZone('America/Sao_Paulo').toFormat('yyyyLLdd-HHmmss');
  const final = path.join(base, token, bloco, `${carimbo}-${nomeSeguro(nomeOriginal)}`);

  // Cinto e suspensório: mesmo com tudo saneado, o caminho final tem de estar
  // dentro da pasta do cliente.
  const pastaCliente = path.join(base, token) + path.sep;
  if (!final.startsWith(pastaCliente)) throw new Error('caminho fora da pasta do cliente');
  return final;
}
