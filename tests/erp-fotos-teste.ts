/**
 * Fotos de teste DE VERDADE (2×2 px, geradas pelo ImageMagick) e as mesmas com
 * metadados de celular (GPS, aparelho, comentário, miniatura depois do fim),
 * para provar que o servidor regrava sem eles (`foto-metadados.ts`).
 */

const b64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));

export const JPG_LIMPO = b64(
  '/9j/4AAQSkZJRgABAQAAAAAAAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAACAAIDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAABv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAHCP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AGaejK//2Q==',
);
export const PNG_LIMPO = b64('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACAQMAAABIeJ9nAAAAA1BMVEXJiTtiTlozAAAADElEQVQI12NgYGAAAAAEAAEnNCcKAAAAAElFTkSuQmCC');
export const WEBP_LIMPO = b64('UklGRh4AAABXRUJQVlA4TBEAAAAvAUAAAAfQxCZ3p/+BiOh/AAA=');

/** O texto que o celular gravaria: a prova é ele NÃO aparecer no arquivo gravado. */
export const GPS = 'GPS -22.906847 -43.172897 Rua do Teste 123 iPhone 15 Pro';

const txt = (s: string) => [...Buffer.from(s, 'latin1')];
const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const le32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];

/** APP1 EXIF (little-endian) com orientação e o "GPS" em texto, como um celular. */
function app1(orientacao: number): number[] {
  const tiff = [...txt('II'), 0x2a, 0, ...le32(8), 2, 0, 0x12, 0x01, 3, 0, ...le32(1), orientacao, 0, 0, 0, 0x25, 0x88, 4, 0, ...le32(1), ...le32(38), ...le32(0), ...txt(GPS)];
  const dados = [...txt('Exif\0\0'), ...tiff];
  return [0xff, 0xe1, ...be16(dados.length + 2), ...dados];
}

/** JPEG com EXIF/GPS (orientação 6 = de pé), APP13, comentário e uma "miniatura" depois do fim. */
export function jpgComGps(base = JPG_LIMPO, orientacao = 6): Uint8Array {
  const app13 = [...txt('Photoshop 3.0\0'), ...txt(GPS)];
  const com = txt(`Tirada em ${GPS}`);
  return new Uint8Array([
    0xff, 0xd8,
    ...app1(orientacao),
    0xff, 0xed, ...be16(app13.length + 2), ...app13,
    0xff, 0xfe, ...be16(com.length + 2), ...com,
    ...base.subarray(2),
    ...txt(`miniatura ${GPS}`),
  ]);
}

function chunkPng(tipo: string, dados: number[]): number[] {
  return [...be32(dados.length), ...txt(tipo), ...dados, 0, 0, 0, 0];
}

/** PNG com eXIf, tEXt e tIME antes do fim. */
export function pngComGps(): Uint8Array {
  const iend = PNG_LIMPO.length - 12;
  return new Uint8Array([
    ...PNG_LIMPO.subarray(0, iend),
    ...chunkPng('eXIf', txt(`MM\0*${GPS}`)),
    ...chunkPng('tEXt', txt(`Location\0${GPS}`)),
    ...chunkPng('tIME', [7, 234, 10, 16, 12, 0, 0]),
    ...PNG_LIMPO.subarray(iend),
  ]);
}

/** WebP com VP8X marcando EXIF+XMP e os dois chunks. */
export function webpComGps(): Uint8Array {
  const corpo = WEBP_LIMPO.subarray(12);
  const gps = txt(GPS.length % 2 ? GPS + ' ' : GPS);
  const vp8x = [...txt('VP8X'), ...le32(10), 0x0c, 0, 0, 0, 1, 0, 0, 1, 0, 0];
  const exif = [...txt('EXIF'), ...le32(gps.length), ...gps];
  const xmp = [...txt('XMP '), ...le32(gps.length), ...gps];
  const resto = [...vp8x, ...corpo, ...exif, ...xmp];
  return new Uint8Array([...txt('RIFF'), ...le32(resto.length + 4), ...txt('WEBP'), ...resto]);
}

/** O texto do GPS aparece em algum lugar dos bytes? */
export function temGps(b: Uint8Array): boolean {
  return Buffer.from(b).includes(Buffer.from('-22.906847', 'latin1'));
}
