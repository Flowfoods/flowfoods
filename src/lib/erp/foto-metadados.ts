/**
 * Foto da ficha técnica regravada SEM metadados (herança da 1.2): o celular
 * grava no arquivo onde a foto foi tirada (GPS), o aparelho, a data e às vezes
 * uma miniatura. Nada disso pode ir para o disco do parceiro.
 *
 * Sem biblioteca de imagem (decisão 60): a limpeza é feita nos BYTES, sem
 * reencodar — nenhuma perda de qualidade, nenhum binário nativo no Alpine.
 * Em vez de procurar o que tirar, guarda-se só o que a imagem precisa para
 * ser desenhada (lista do que FICA); o resto sai:
 *
 * - JPEG: SOI, APP0 JFIF, APP2 ICC (cor), APP14 Adobe (cor do CMYK) e só os
 *   marcadores que desenham a imagem (C0–CF, DB, DD, DA, D0–D7, DC, DF) até o
 *   EOI. Sai APP1 (EXIF/GPS/XMP), APP2 MPF (outras imagens), APP3–APP13,
 *   APP15, comentários e tudo depois do EOI. Qualquer outro marcador (TEM,
 *   reservados, extensões JPGn) RECUSA a foto: não se guarda o desconhecido.
 *   A orientação do EXIF (de pé/deitada) volta num APP1 mínimo, só com ela.
 * - PNG: só os chunks de imagem e de cor (IHDR, PLTE, IDAT, IEND, tRNS, cHRM,
 *   gAMA, iCCP, sBIT, sRGB, pHYs, bKGD e os da animação). Sai eXIf, tEXt,
 *   zTXt, iTXt, tIME e o desconhecido.
 * - WebP: sai EXIF, XMP e o desconhecido; as marcas de EXIF/XMP do VP8X são
 *   zeradas e o tamanho do RIFF, refeito.
 *
 * Arquivo que não segue a estrutura (cortado, forjado) é recusado.
 */

import type { ExtensaoDaFoto } from './foto';

export type Limpeza = { ok: true; bytes: Uint8Array } | { ok: false; erro: string };

const DANIFICADA: Limpeza = { ok: false, erro: 'A foto está danificada ou incompleta. Tire outra ou escolha de novo.' };

const comeca = (b: Uint8Array, de: number, texto: string) => [...texto].every((c, i) => b[de + i] === c.charCodeAt(0));

function juntar(partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let i = 0;
  for (const p of partes) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

// ------------------------------------------------------------------- JPEG

/** Orientação (1–8) gravada no EXIF de um APP1; null se não houver. */
function orientacaoDoExif(dados: Uint8Array): number | null {
  if (!comeca(dados, 0, 'Exif\0\0') || dados.length < 14) return null;
  const t = 6;
  const le = comeca(dados, t, 'II');
  if (!le && !comeca(dados, t, 'MM')) return null;
  const u16 = (i: number) => (i + 2 <= dados.length ? (le ? dados[i] | (dados[i + 1] << 8) : (dados[i] << 8) | dados[i + 1]) : -1);
  const u32 = (i: number) => (i + 4 <= dados.length ? (le ? u16(i) + u16(i + 2) * 65536 : u16(i) * 65536 + u16(i + 2)) : -1);
  const ifd = u32(t + 4);
  if (ifd < 0) return null;
  const n = u16(t + ifd);
  for (let k = 0; k < n && k < 512; k++) {
    const e = t + ifd + 2 + k * 12;
    if (e + 12 > dados.length) return null;
    if (u16(e) === 0x0112 && u16(e + 2) === 3) {
      const v = u16(e + 8);
      return v >= 1 && v <= 8 ? v : null;
    }
  }
  return null;
}

/** APP1 com um EXIF mínimo: só a tag de orientação (big-endian, 34 bytes). */
function app1SoComOrientacao(v: number): Uint8Array<ArrayBufferLike> {
  return new Uint8Array([
    0xff, 0xe1, 0x00, 0x22,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // Exif\0\0
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // MM, 42, IFD0 em 8
    0x00, 0x01, // 1 entrada
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, v, 0x00, 0x00, // orientação, SHORT, 1, v
    0x00, 0x00, 0x00, 0x00, // sem próximo IFD
  ]);
}

/**
 * Marcadores que DESENHAM a imagem (lista fechada, herança da 1.3): quadros e
 * tabelas C0–CF (SOFn, DHT, DAC) MENOS o C8 (JPG, reservado para extensões:
 * não desenha nada que um decodificador comum leia — herança b da 1.4), DQT
 * (DB), DRI (DD), varredura (DA), DNL (DC) e EXP (DF). RST0–7 (D0–D7) não têm
 * tamanho e são tratados à parte.
 */
const DESENHA_A_IMAGEM = (m: number) => (m >= 0xc0 && m <= 0xcf && m !== 0xc8) || m === 0xdb || m === 0xdd || m === 0xda || m === 0xdc || m === 0xdf;

/**
 * O que fazer com cada segmento: fica (desenha a imagem ou a cor), sai
 * (metadado conhecido: APPn e comentário) ou recusa (qualquer outro marcador:
 * não se guarda o que não se conhece).
 */
function destinoNoJpeg(marcador: number, dados: Uint8Array): 'fica' | 'sai' | 'recusa' {
  if (marcador === 0xe0) return comeca(dados, 0, 'JFIF\0') || comeca(dados, 0, 'JFXX\0') ? 'fica' : 'sai';
  if (marcador === 0xe2) return comeca(dados, 0, 'ICC_PROFILE\0') ? 'fica' : 'sai';
  if (marcador === 0xee) return comeca(dados, 0, 'Adobe') ? 'fica' : 'sai';
  if (marcador >= 0xe0 && marcador <= 0xef) return 'sai'; // APP1 (EXIF/XMP) e os outros
  if (marcador === 0xfe) return 'sai'; // comentário
  return DESENHA_A_IMAGEM(marcador) ? 'fica' : 'recusa';
}

export const MENSAGEM_JPEG_ESTRANHO = 'A foto tem uma parte que o sistema não reconhece. Tire outra ou salve como JPEG ou PNG comum e escolha de novo.';
const JPEG_ESTRANHO: Limpeza = { ok: false, erro: MENSAGEM_JPEG_ESTRANHO };

function limparJpeg(b: Uint8Array): Limpeza {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return DANIFICADA;
  const partes: Uint8Array[] = [];
  let orientacao: number | null = null;
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) return DANIFICADA;
    while (i < b.length && b[i] === 0xff) i++; // bytes de preenchimento
    if (i >= b.length) return DANIFICADA;
    const m = b[i++];
    if (m === 0xd9) {
      // EOI: fim da imagem principal. O que vier depois (outra imagem, lixo) sai.
      const cabeca: Uint8Array[] = [new Uint8Array([0xff, 0xd8])];
      if (orientacao && orientacao !== 1) cabeca.push(app1SoComOrientacao(orientacao));
      return { ok: true, bytes: juntar([...cabeca, ...partes, new Uint8Array([0xff, 0xd9])]) };
    }
    if (m === 0x01) return JPEG_ESTRANHO; // TEM: fora da lista
    if (m >= 0xd0 && m <= 0xd7) {
      partes.push(new Uint8Array([0xff, m]));
      continue;
    }
    if (m === 0xd8 || i + 2 > b.length) return DANIFICADA;
    const tamanho = (b[i] << 8) | b[i + 1];
    if (tamanho < 2 || i + tamanho > b.length) return DANIFICADA;
    const dados = b.subarray(i + 2, i + tamanho);
    if (m === 0xe1 && orientacao === null) orientacao = orientacaoDoExif(dados);
    const destino = destinoNoJpeg(m, dados);
    if (destino === 'recusa') return JPEG_ESTRANHO;
    if (destino === 'fica') partes.push(b.subarray(i - 2, i + tamanho));
    i += tamanho;
    if (m === 0xda) {
      // Dados da varredura até o próximo marcador (FF00 e RSTn fazem parte deles).
      const inicio = i;
      while (i < b.length) {
        if (b[i] === 0xff && i + 1 < b.length) {
          const x = b[i + 1];
          if (x === 0x00 || (x >= 0xd0 && x <= 0xd7)) {
            i += 2;
            continue;
          }
          if (x === 0xff) {
            i++;
            continue;
          }
          break;
        }
        i++;
      }
      if (i >= b.length) return DANIFICADA;
      partes.push(b.subarray(inicio, i));
    }
  }
  return DANIFICADA;
}

// -------------------------------------------------------------------- PNG

const FICA_NO_PNG = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'cHRM', 'gAMA', 'iCCP', 'sBIT', 'sRGB', 'pHYs', 'bKGD', 'acTL', 'fcTL', 'fdAT']);

function limparPng(b: Uint8Array): Limpeza {
  const partes: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const tamanho = ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
    const tipo = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    const fim = i + 12 + tamanho;
    if (fim > b.length) return DANIFICADA;
    if (FICA_NO_PNG.has(tipo)) partes.push(b.subarray(i, fim));
    if (tipo === 'IEND') return { ok: true, bytes: juntar(partes) };
    i = fim;
  }
  return DANIFICADA;
}

// ------------------------------------------------------------------- WebP

const FICA_NO_WEBP = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF', 'ICCP']);

function limparWebp(b: Uint8Array): Limpeza {
  if (b.length < 20 || !comeca(b, 0, 'RIFF') || !comeca(b, 8, 'WEBP')) return DANIFICADA;
  const partes: Uint8Array[] = [];
  let i = 12;
  let imagem = false;
  while (i < b.length) {
    if (i + 8 > b.length) return DANIFICADA;
    const tipo = String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
    const tamanho = b[i + 4] + (b[i + 5] << 8) + (b[i + 6] << 16) + ((b[i + 7] << 24) >>> 0);
    const fim = i + 8 + tamanho + (tamanho % 2);
    if (i + 8 + tamanho > b.length) return DANIFICADA;
    if (FICA_NO_WEBP.has(tipo)) {
      const chunk = b.slice(i, Math.min(fim, b.length));
      // VP8X: tira as marcas "tem EXIF" (0x08) e "tem XMP" (0x04).
      if (tipo === 'VP8X' && tamanho >= 1) chunk[8] &= ~0x0c;
      if (tipo === 'VP8 ' || tipo === 'VP8L' || tipo === 'ANMF') imagem = true;
      partes.push(chunk);
    }
    i = fim;
  }
  if (!imagem) return DANIFICADA;
  const corpo = juntar(partes);
  const total = 4 + corpo.length;
  const cabeca = new Uint8Array([0x52, 0x49, 0x46, 0x46, total & 0xff, (total >> 8) & 0xff, (total >> 16) & 0xff, (total >>> 24) & 0xff, 0x57, 0x45, 0x42, 0x50]);
  return { ok: true, bytes: juntar([cabeca, corpo]) };
}

/** Bytes da foto (tipo já conferido) → os mesmos pixels, sem metadados. */
export function limparMetadados(bytes: Uint8Array, extensao: ExtensaoDaFoto): Limpeza {
  if (extensao === 'jpg') return limparJpeg(bytes);
  if (extensao === 'png') return limparPng(bytes);
  return limparWebp(bytes);
}
