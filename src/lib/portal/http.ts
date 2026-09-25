/**
 * Miudezas HTTP comuns às rotas públicas do portal.
 */

import { NextResponse } from 'next/server';
import { ErroPortal } from './dados';

/** O link é o segredo: nada de cache compartilhado nem de vazar em Referer. */
export const CABECALHOS_PRIVADOS = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
} as const;

export function json(corpo: unknown, status = 200) {
  return NextResponse.json(corpo, { status, headers: CABECALHOS_PRIVADOS });
}

/** Erro previsto vira mensagem para a tela; o resto vira 500 genérico e log. */
export function falha(e: unknown) {
  if (e instanceof ErroPortal) return json({ ok: false, erro: e.message }, e.status);
  console.error('[portal]', e);
  return json({ ok: false, erro: 'Não salvou. Tente de novo em instantes.' }, 500);
}

/** Endereço público do site, para o link do painel no aviso. */
export function origemPublica(): string {
  return (process.env.NEXTAUTH_URL || 'https://consultoriaflowfoods.com.br').replace(/\/+$/, '');
}
