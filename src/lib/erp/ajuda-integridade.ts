/**
 * Ajuda contextual (0.6) — a trava de "texto mudou, suba a versão".
 *
 * `ajuda.lock.json` (na raiz de `src/lib/erp/`) guarda, por entrada, a versão e
 * o hash do texto (título, aula e seções, com o `para` de cada bloco). O teste
 * reprova texto alterado sem a versão subir; `npm run ajuda:lock` regrava o
 * lock e SE RECUSA a gravar texto novo sem versão nova. É a decisão consciente:
 * mudou a função, sobe a versão, a caixa volta para quem tinha fechado.
 *
 * Só Node (testes e script). Fora do pacote do navegador.
 */

import { createHash } from 'node:crypto';
import type { EntradaDeAjuda } from './ajuda';

export type Lock = Record<string, { versao: number; hash: string }>;

export function hashDaEntrada(e: EntradaDeAjuda): string {
  const corpo = JSON.stringify({
    titulo: e.titulo,
    aula: e.aula.map((b) => [b.texto, [...(b.para ?? [])].sort()]),
    secoes: (e.secoes ?? []).map((s) => [s.id, s.titulo, s.blocos.map((b) => [b.texto, [...(b.para ?? [])].sort()])]),
  });
  return createHash('sha256').update(corpo).digest('hex').slice(0, 16);
}

/** O que está fora de ordem entre o registro e o lock, em frases. Vazio = tudo certo. */
export function divergenciasDoLock(entradas: readonly EntradaDeAjuda[], lock: Lock): string[] {
  const erros: string[] = [];
  for (const e of entradas) {
    const l = lock[e.chave];
    const hash = hashDaEntrada(e);
    if (!l) erros.push(`[${e.chave}] entrada nova fora do lock: rode npm run ajuda:lock`);
    else if (l.hash !== hash && e.versao <= l.versao) erros.push(`[${e.chave}] o texto mudou e a versao nao subiu (esta em ${e.versao}): suba a versao e rode npm run ajuda:lock`);
    else if (l.hash !== hash || l.versao !== e.versao) erros.push(`[${e.chave}] o lock esta desatualizado: rode npm run ajuda:lock`);
  }
  const chaves = new Set(entradas.map((e) => e.chave));
  for (const k of Object.keys(lock)) if (!chaves.has(k)) erros.push(`[${k}] esta no lock mas nao existe mais no registro: rode npm run ajuda:lock`);
  return erros;
}

/** O lock novo. Texto que mudou sem versão nova é recusado (lança). */
export function lockNovo(entradas: readonly EntradaDeAjuda[], atual: Lock): Lock {
  const novo: Lock = {};
  for (const e of entradas) {
    const hash = hashDaEntrada(e);
    const l = atual[e.chave];
    if (l && l.hash !== hash && e.versao <= l.versao) {
      throw new Error(`[${e.chave}] o texto mudou e a versao nao subiu (esta em ${e.versao}). Suba a versao da entrada em ajuda-textos.ts.`);
    }
    novo[e.chave] = { versao: e.versao, hash };
  }
  return novo;
}
