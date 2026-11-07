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

export async function tokenDoCookie(): Promise<string | undefined> {
  return (await cookies()).get(nomeDoCookie())?.value;
}

export async function gravarCookieDeSessao(token: string, expiraEm: Date): Promise<void> {
  (await cookies()).set(nomeDoCookie(), token, {
    httpOnly: true,
    secure: sessaoSegura(),
    sameSite: 'lax',
    path: '/',
    expires: expiraEm,
  });
}

export async function apagarCookieDeSessao(): Promise<void> {
  (await cookies()).set(nomeDoCookie(), '', { httpOnly: true, secure: sessaoSegura(), sameSite: 'lax', path: '/', maxAge: 0 });
}

/** Sessão desta requisição (uma ida ao banco, mesmo com layout + página + action pedindo). */
export const sessaoDaRequisicao = cache(async (): Promise<SessaoValida | null> => validarSessao(await tokenDoCookie()));

export async function ipAtual(): Promise<string> {
  return ipDaRequisicao(await headers());
}

export async function aparelhoAtual(): Promise<string> {
  return rotuloDoAparelho((await headers()).get('user-agent'));
}

/**
 * Endereço do site para montar o link de primeiro acesso: o configurado
 * (NEXTAUTH_URL, o mesmo do login do /rodolfo); sem ele, o da requisição.
 */
export async function origemDoSite(): Promise<string> {
  const conf = process.env.NEXTAUTH_URL?.trim();
  if (conf) {
    try {
      return new URL(conf).origin;
    } catch {
      /* cai para a requisição */
    }
  }
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export async function linkDePrimeiroAcesso(token: string): Promise<string> {
  return `${await origemDoSite()}/entrar/primeiro-acesso/${token}`;
}
