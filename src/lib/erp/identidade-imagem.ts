/** Imagens de identidade: bytes e metadados pelo fluxo existente; dimensões pelo conteúdo, nunca pelo cliente. */
import { prepararFoto, tipoPelosBytes, type ExtensaoDaFoto, type FotoPronta } from './foto';

export const LIMITE_DIMENSAO_IDENTIDADE = 4096;
export const LIMITE_PIXELS_IDENTIDADE = 16_000_000;
type Dimensoes = { largura: number; altura: number };
const texto = (b: Uint8Array, inicio: number, n: number) => String.fromCharCode(...b.subarray(inicio, inicio + n));
const be16 = (b: Uint8Array, i: number) => b[i] * 256 + b[i + 1];
const be32 = (b: Uint8Array, i: number) => b[i] * 0x1000000 + b[i + 1] * 0x10000 + b[i + 2] * 256 + b[i + 3];
const le24 = (b: Uint8Array, i: number) => b[i] + b[i + 1] * 256 + b[i + 2] * 65536;
const le32 = (b: Uint8Array, i: number) => le24(b, i) + b[i + 3] * 0x1000000;
const tabelaCrc = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crcPng(b: Uint8Array, inicio: number, fim: number): number {
  let crc = 0xffffffff;
  for (let i = inicio; i < fim; i++) crc = tabelaCrc[(crc ^ b[i]) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dimensoesPng(b: Uint8Array): Dimensoes | null {
  if (b.length < 45 || be32(b, 8) !== 13 || texto(b, 12, 4) !== 'IHDR') return null;
  if (crcPng(b, 12, 29) !== be32(b, 29)) return null;
  const cores: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
  if (!cores[b[25]]?.includes(b[24]) || b[26] !== 0 || b[27] !== 0 || b[28] > 1) return null;
  let dados = false;
  for (let i = 33; i + 12 <= b.length;) {
    const n = be32(b, i), tipo = texto(b, i + 4, 4);
    if (i + n + 12 > b.length || tipo === 'IHDR' || ['acTL', 'fcTL', 'fdAT'].includes(tipo)) return null;
    if (crcPng(b, i + 4, i + 8 + n) !== be32(b, i + 8 + n)) return null;
    if (tipo === 'IDAT' && n > 0) dados = true;
    if (tipo === 'IEND') return dados && n === 0 && i + 12 === b.length ? { largura: be32(b, 16), altura: be32(b, 20) } : null;
    i += n + 12;
  }
  return null;
}

function dimensoesJpeg(b: Uint8Array): Dimensoes | null {
  let medidas: Dimensoes | null = null;
  for (let i = 2; i < b.length;) {
    if (b[i++] !== 0xff) return null;
    while (b[i] === 0xff) i++;
    const marcador = b[i++];
    if (marcador === 0xda) return medidas; // a limpeza já conferiu varredura/EOI completos
    if (marcador === 0xd9 || i + 2 > b.length) return null;
    const n = be16(b, i);
    if (n < 2 || i + n > b.length) return null;
    if ([0xc0, 0xc1, 0xc2].includes(marcador)) {
      if (medidas || n < 11 || b[i + 2] !== 8 || ![1, 3, 4].includes(b[i + 7]) || n !== 8 + 3 * b[i + 7]) return null;
      medidas = { largura: be16(b, i + 5), altura: be16(b, i + 3) };
    }
    i += n;
  }
  return null;
}

function dimensoesWebp(b: Uint8Array): Dimensoes | null {
  if (b.length < 25 || le32(b, 4) + 8 !== b.length) return null;
  let tela: Dimensoes | null = null, imagem: Dimensoes | null = null;
  for (let i = 12; i + 8 <= b.length;) {
    const tipo = texto(b, i, 4), n = le32(b, i + 4), p = i + 8;
    if (p + n + n % 2 > b.length || tipo === 'ANIM' || tipo === 'ANMF') return null;
    if (tipo === 'VP8X') {
      if (tela || n !== 10 || (b[p] & 0x02)) return null;
      tela = { largura: le24(b, p + 4) + 1, altura: le24(b, p + 7) + 1 };
    }
    if (tipo === 'VP8 ') {
      if (imagem || n < 10 || (b[p] & 1) || texto(b, p + 3, 3) !== '\x9d\x01\x2a') return null;
      imagem = { largura: (b[p + 6] + b[p + 7] * 256) & 0x3fff, altura: (b[p + 8] + b[p + 9] * 256) & 0x3fff };
    }
    if (tipo === 'VP8L') {
      if (imagem || n < 5 || b[p] !== 0x2f || (b[p + 4] >> 5) !== 0) return null;
      imagem = { largura: 1 + b[p + 1] + ((b[p + 2] & 0x3f) << 8), altura: 1 + (b[p + 2] >> 6) + (b[p + 3] << 2) + ((b[p + 4] & 0x0f) << 10) };
    }
    i = p + n + n % 2;
  }
  if (tela && imagem && (tela.largura !== imagem.largura || tela.altura !== imagem.altura)) return null;
  return imagem;
}

export function dimensoesDaIdentidade(bytes: Uint8Array, extensao: ExtensaoDaFoto): Dimensoes | null {
  return extensao === 'png' ? dimensoesPng(bytes) : extensao === 'jpg' ? dimensoesJpeg(bytes) : dimensoesWebp(bytes);
}

export function prepararImagemIdentidade(bytes: Uint8Array): FotoPronta {
  // A limpeza refaz o RIFF; confira o tamanho original para não consertar arquivo cortado/forjado.
  if (tipoPelosBytes(bytes) === 'webp' && (bytes.length < 12 || le32(bytes, 4) + 8 !== bytes.length)) {
    return { ok: false, erro: 'A imagem WebP está danificada ou incompleta.' };
  }
  const foto = prepararFoto(bytes);
  if (!foto.ok) return foto;
  const d = dimensoesDaIdentidade(foto.bytes, foto.extensao);
  if (!d || !d.largura || !d.altura) return { ok: false, erro: 'Use uma imagem JPG, PNG ou WebP estática, completa e válida.' };
  if (d.largura > LIMITE_DIMENSAO_IDENTIDADE || d.altura > LIMITE_DIMENSAO_IDENTIDADE || d.largura * d.altura > LIMITE_PIXELS_IDENTIDADE) {
    return { ok: false, erro: 'Reduza a imagem para até 4096 px por lado e 16 megapixels.' };
  }
  return foto;
}
