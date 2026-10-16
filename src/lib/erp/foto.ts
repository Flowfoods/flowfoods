/**
 * Foto da ficha técnica — a parte PURA (serve à tela e ao servidor): limite de
 * tamanho e o tipo conferido pelos BYTES do arquivo, nunca pelo nome nem pelo
 * tipo que o navegador declara. Só JPEG, PNG e WebP: SVG (pode levar script),
 * GIF, HEIC e o resto são recusados. O navegador reduz a foto antes de
 * enviar (conforto); quem decide é aqui.
 */

/** 8 MB: foto de celular cabe; a tela reduz para ~1600 px antes de enviar. */
export const LIMITE_DA_FOTO = 8 * 1024 * 1024;

export const TIPOS_DE_FOTO = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const;
export type ExtensaoDaFoto = keyof typeof TIPOS_DE_FOTO;

/** Nome que o servidor dá ao arquivo: 32 hex sorteados + extensão (o banco tem CHECK igual). */
export const NOME_DA_FOTO = /^[0-9a-f]{32}\.(jpg|png|webp)$/;

export type FotoConferida = { ok: true; extensao: ExtensaoDaFoto; mime: string; bytes: number } | { ok: false; erro: string };

const comeca = (b: Uint8Array, assinatura: number[], de = 0) => assinatura.every((x, i) => b[de + i] === x);

/** Tipo de imagem pelos primeiros bytes; null = não é JPEG, PNG nem WebP. */
export function tipoPelosBytes(b: Uint8Array): ExtensaoDaFoto | null {
  if (b.length >= 3 && comeca(b, [0xff, 0xd8, 0xff])) return 'jpg';
  if (b.length >= 8 && comeca(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  // RIFF....WEBP
  if (b.length >= 12 && comeca(b, [0x52, 0x49, 0x46, 0x46]) && comeca(b, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp';
  return null;
}

export function conferirFoto(b: Uint8Array): FotoConferida {
  if (b.length === 0) return { ok: false, erro: 'A foto chegou vazia. Escolha de novo.' };
  if (b.length > LIMITE_DA_FOTO) return { ok: false, erro: 'Foto acima de 8 MB. Tire outra ou reduza antes de enviar.' };
  const extensao = tipoPelosBytes(b);
  if (!extensao) return { ok: false, erro: 'Use uma foto em JPG, PNG ou WebP.' };
  return { ok: true, extensao, mime: TIPOS_DE_FOTO[extensao], bytes: b.length };
}
