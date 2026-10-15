'use server';

/**
 * Entrar no ERP do parceiro: e-mail e senha, rosto, link de primeiro acesso,
 * escolher parceiro e sair. A regra está em `src/lib/erp/credenciais.ts`; aqui
 * só entram cookie, IP e redirecionamento.
 */

import { redirect } from 'next/navigation';
import {
  definirSenhaPeloLink,
  encerrarSessao,
  entrarComRosto,
  entrarComSenha,
  escolherParceiro,
  iniciarEntradaComRosto,
  LimiteDoRosto,
} from '@/lib/erp/credenciais';
import { ERRO_DE_ROSTO } from '@/lib/erp/acesso';
import type { AuthenticationResponseJSON } from '@/lib/erp/rosto';
import { apagarCookieDeSessao, gravarCookieDeSessao, ipAtual, tokenDoCookie } from '@/lib/erp/sessao';

export type EstadoEntrar = { erro: string; email: string; vez: number } | null;

export async function acaoEntrar(anterior: EstadoEntrar, form: FormData): Promise<EstadoEntrar> {
  const email = String(form.get('email') ?? '');
  const r = await entrarComSenha({ email, senha: form.get('senha'), ip: ipAtual() });
  if (!r.ok) return { erro: r.erro, email, vez: (anterior?.vez ?? 0) + 1 };
  gravarCookieDeSessao(r.token, r.expiraEm);
  redirect(r.escolher ? '/entrar/escolher' : '/erp');
}

/**
 * Opções para o navegador pedir o rosto ao aparelho (desafio guardado no
 * servidor, com teto de abertos por IP).
 */
export async function acaoOpcoesDoRosto() {
  try {
    return { ok: true as const, opcoes: await iniciarEntradaComRosto(ipAtual()) };
  } catch (e) {
    if (e instanceof LimiteDoRosto) return { ok: false as const, erro: e.message };
    throw e;
  }
}

export async function acaoEntrarComRosto(
  resposta: AuthenticationResponseJSON,
): Promise<{ ok: true; destino: string } | { ok: false; erro: string }> {
  if (!resposta || typeof resposta !== 'object') return { ok: false, erro: ERRO_DE_ROSTO };
  const r = await entrarComRosto(resposta, ipAtual());
  if (!r.ok) return { ok: false, erro: r.erro };
  gravarCookieDeSessao(r.token, r.expiraEm);
  return { ok: true, destino: r.escolher ? '/entrar/escolher' : '/erp' };
}

export type EstadoSenha = { erro: string; vez: number } | null;

export async function acaoDefinirSenha(token: string, anterior: EstadoSenha, form: FormData): Promise<EstadoSenha> {
  const r = await definirSenhaPeloLink(token, String(form.get('senha') ?? ''), String(form.get('confirmacao') ?? ''));
  if (!r.ok) return { erro: r.erro, vez: (anterior?.vez ?? 0) + 1 };
  // Sessões antigas caíram junto com a troca de senha; o cookie deste aparelho também sai.
  apagarCookieDeSessao();
  redirect('/entrar?senha=criada');
}

export async function acaoEscolherParceiro(form: FormData): Promise<void> {
  const ok = await escolherParceiro(tokenDoCookie(), form.get('parceiroId'));
  redirect(ok ? '/erp' : '/entrar');
}

export async function acaoSair(): Promise<void> {
  await encerrarSessao(tokenDoCookie());
  apagarCookieDeSessao();
  redirect('/entrar?saiu=1');
}
