/**
 * Sessão do ERP do parceiro na requisição do Next: ler e gravar o cookie, IP,
 * aparelho e o endereço do site para o link. A validação mora em
 * `credenciais.ts` (`validarSessao`), uma ida ao banco por requisição.
 */

import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { ipDaRequisicao, rotuloDoAparelho } from './acesso';
import { validarSessao, type SessaoValida } from './credenciais';
import { nomeDoCookie, sessaoSegura } from './sessao-cookie';

export function tokenDoCookie(): string | undefined {
  return cookies().get(nomeDoCookie())?.value;
}

export function gravarCookieDeSessao(token: string, expiraEm: Date): void {
  cookies().set(nomeDoCookie(), token, {
    httpOnly: true,
    secure: sessaoSegura(),
    sameSite: 'lax',
    path: '/',
    expires: expiraEm,
  });
}

export function apagarCookieDeSessao(): void {
  cookies().set(nomeDoCookie(), '', { httpOnly: true, secure: sessaoSegura(), sameSite: 'lax', path: '/', maxAge: 0 });
}

/** Sessão desta requisição (uma ida ao banco, mesmo com layout + página + action pedindo). */
export const sessaoDaRequisicao = cache(async (): Promise<SessaoValida | null> => validarSessao(tokenDoCookie()));

export function ipAtual(): string {
  return ipDaRequisicao(headers());
}

export function aparelhoAtual(): string {
  return rotuloDoAparelho(headers().get('user-agent'));
}

/**
 * Endereço do site para montar o link de primeiro acesso: o configurado
 * (NEXTAUTH_URL, o mesmo do login do /rodolfo); sem ele, o da requisição.
 */
export function origemDoSite(): string {
  const conf = process.env.NEXTAUTH_URL?.trim();
  if (conf) {
    try {
      return new URL(conf).origin;
    } catch {
      /* cai para a requisição */
    }
  }
  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export function linkDePrimeiroAcesso(token: string): string {
  return `${origemDoSite()}/entrar/primeiro-acesso/${token}`;
}
