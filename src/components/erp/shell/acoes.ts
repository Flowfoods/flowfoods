'use server';

/**
 * Preferências do shell que são só da pessoa, no aparelho dela: tema e menu
 * recolhido. Cookie de um ano, `SameSite=Lax`, lido no servidor pelo layout do
 * shell (sem flash). Não concede nada e não lê nada do banco: não precisa de
 * permissão. O layout raiz nunca lê estes cookies (o site segue estático).
 */

import { cookies } from 'next/headers';
import { sessaoSegura } from '@/lib/erp/sessao-cookie';
import { COOKIE_MENU, COOKIE_TEMA, lerTema, VALIDADE_DA_PREFERENCIA_S, type Tema } from '@/lib/erp/tema';

const opcoes = {
  path: '/',
  sameSite: 'lax' as const,
  maxAge: VALIDADE_DA_PREFERENCIA_S,
  httpOnly: true,
};

const comSeguranca = () => ({ ...opcoes, secure: sessaoSegura() });

export async function acaoTrocarTema(tema: Tema): Promise<Tema> {
  const valor = lerTema(tema);
  cookies().set(COOKIE_TEMA, valor, comSeguranca());
  return valor;
}

export async function acaoGuardarMenu(recolhido: boolean): Promise<void> {
  cookies().set(COOKIE_MENU, recolhido ? 'recolhido' : 'aberto', comSeguranca());
}
