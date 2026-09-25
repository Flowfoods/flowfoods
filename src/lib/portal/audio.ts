/**
 * Áudio gravado na hora, dentro do formulário.
 *
 * Puro e sem dependência de Node: roda no navegador (nome do arquivo, formato
 * escolhido) e no servidor (tipo para tocar no painel). O que cada navegador
 * grava varia — Chrome e Android dão WebM/Opus, iPhone dá MP4/AAC — e o painel
 * do Rodolfo precisa tocar os dois.
 */

/** Teto de uma gravação. 10 min de Opus ou AAC ficam bem abaixo dos 50 MB. */
export const LIMITE_GRAVACAO_S = 10 * 60;

/** Formatos na ordem de preferência; o navegador pega o primeiro que souber. */
export const MIMES_GRAVACAO = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

const EXTENSAO_POR_MIME: [RegExp, string][] = [
  [/audio\/webm/, 'webm'],
  [/audio\/mp4/, 'm4a'],
  [/audio\/ogg/, 'ogg'],
  [/audio\/mpeg/, 'mp3'],
  [/audio\/wav|audio\/x-wav/, 'wav'],
  [/audio\/aac/, 'aac'],
];

const MIME_POR_EXTENSAO: Record<string, string> = {
  webm: 'audio/webm',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  aac: 'audio/aac',
};

export function extensaoDoMime(mime: string): string {
  const m = mime.toLowerCase();
  return EXTENSAO_POR_MIME.find(([re]) => re.test(m))?.[1] ?? 'webm';
}

function extensao(nome: string): string {
  return (nome.split('.').pop() ?? '').toLowerCase();
}

/** O arquivo é áudio? Decide se o painel mostra um player em vez de só o link. */
export function ehAudio(nome: string): boolean {
  return extensao(nome) in MIME_POR_EXTENSAO;
}

/** Content-Type para tocar no painel; `null` para o que não é áudio. */
export function mimeDoNome(nome: string): string | null {
  return MIME_POR_EXTENSAO[extensao(nome)] ?? null;
}

const dois = (n: number) => String(n).padStart(2, '0');

/**
 * Nome legível no painel e no disco: "Audio p1.1 25-09 14h32.webm". Sem
 * acento de propósito: `nomeSeguro` tiraria de qualquer jeito.
 */
export function nomeDaGravacao(itemId: string, agora: Date, mime: string): string {
  const data = `${dois(agora.getDate())}-${dois(agora.getMonth() + 1)}`;
  const hora = `${dois(agora.getHours())}h${dois(agora.getMinutes())}`;
  return `Audio ${itemId} ${data} ${hora}.${extensaoDoMime(mime)}`;
}

/** 0:07 · 1:42 · 12:05 */
export function formatarDuracao(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  return `${Math.floor(s / 60)}:${dois(s % 60)}`;
}
