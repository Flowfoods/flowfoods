/**
 * Contexto de tenant do ERP, num lugar só. Toda página e toda server action do
 * ERP começa aqui:
 *
 * - `exigirNivel1()`: sessão do /rodolfo (o nível 1, FlowFoods: vê e muda tudo,
 *   em qualquer parceiro — `ALCANCE_FLOWFOODS`);
 * - `exigirParceiro(slug)`: SÓ para o nível 1. Sessão do /rodolfo + parceiro
 *   resolvido pelo slug + o cliente `doParceiro(id)`. O slug só ESCOLHE; quem
 *   libera é a sessão do nível 1. Pessoa do parceiro nunca passa por aqui (o
 *   middleware e `exigirNivel1` só aceitam o JWT do /rodolfo).
 * - `exigirParceiroDaSessao()` (0.3): a pessoa do parceiro em /erp. O parceiro
 *   vem SÓ da sessão dela (cookie próprio, validado no banco a cada
 *   requisição), nunca da URL. Sessão do /rodolfo não serve aqui, e esta não
 *   serve no /rodolfo.
 *
 * Parceiro que não está ATIVO (suspenso ou aguardando liberação) recebe um
 * cliente SOMENTE LEITURA: a escrita é recusada no portão e a transação abre
 * read-only no banco. Não depende de a tela esconder o botão nem de a action
 * lembrar de conferir — `podeEscrever` serve para a mensagem, não para a trava.
 *
 * Permissões (0.4): o contexto traz `alcance`; toda página e action chama
 * `exigirPermissao(ctx, 'modulo.acao', { lojaId? })`. Nas páginas,
 * `exigirPermissaoNaPagina` leva quem não pode para uma tela que pode.
 */

import { cache } from 'react';
import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import type { ParceiroFlow } from '@prisma/client';
import { authOptions } from '@/lib/rodolfo/auth';
import type { SessaoValida } from './credenciais';
import {
  bloqueioDeEscrita,
  contextoDaSessao,
  type ContextoDaPessoa,
  type ContextoDoParceiro,
  type SessaoErp,
} from './contexto-base';
import { sessaoDaRequisicao } from './sessao';
import {
  ALCANCE_FLOWFOODS,
  ErroDePermissao,
  exigirPermissao,
  pode,
  recusaDaAcao,
  type Alcance,
  type Permissao,
} from './permissoes';
import { doParceiro, parceiroPorSlug, type ClienteDoParceiro } from './tenant';

export { bloqueioDeEscrita, contextoDaSessao, ErroDePermissao, exigirPermissao, pode, recusaDaAcao };
export type { ContextoDaPessoa, ContextoDoParceiro, SessaoErp };

export const exigirNivel1 = cache(async (): Promise<SessaoErp> => {
  const sessao = await getServerSession(authOptions);
  const user = sessao?.user as { id?: string; name?: string | null; email?: string | null } | undefined;
  if (!user?.id) redirect('/rodolfo/login');
  return { userId: user.id, autorNome: user.name || user.email || 'FlowFoods' };
});

/** Uma ida ao banco por requisição, mesmo com layout + página + action pedindo. */
const parceiroDaRequisicao = cache((slug: string) => parceiroPorSlug(slug));

export async function exigirParceiro(slug: string): Promise<ContextoDoParceiro> {
  const sessao = await exigirNivel1();
  const parceiro = await parceiroDaRequisicao(slug);
  if (!parceiro) notFound();
  const bloqueio = bloqueioDeEscrita(parceiro.status);
  return {
    sessao,
    parceiro,
    podeEscrever: bloqueio === null,
    bloqueio,
    cliente: doParceiro(parceiro.id, undefined, { somenteLeitura: bloqueio !== null }),
    alcance: ALCANCE_FLOWFOODS,
  };
}

/** Só leitura, sempre: para telas do nível 1 que somam números de vários parceiros. */
export function leituraDoParceiro(parceiroId: string): ClienteDoParceiro {
  return doParceiro(parceiroId, undefined, { somenteLeitura: true });
}

// ------------------------------------------------- pessoa do parceiro (0.3)

/** Sessão da pessoa do parceiro; sem ela, volta para /entrar. */
export async function exigirPessoa(): Promise<SessaoValida> {
  const s = await sessaoDaRequisicao();
  if (!s) redirect('/entrar');
  return s;
}

export async function exigirParceiroDaSessao(): Promise<ContextoDaPessoa> {
  const pessoa = await exigirPessoa();
  if (!pessoa.parceiro || !pessoa.alcance) redirect('/entrar/escolher');
  return contextoDaSessao(pessoa as SessaoValida & { parceiro: ParceiroFlow });
}

/** Abas do /erp na ordem: a primeira que a pessoa pode é a casa dela. */
export const TELAS_DO_ERP: { href: string; rotulo: string; permissao: Permissao | null }[] = [
  { href: '/erp', rotulo: 'Insumos', permissao: 'insumos.ver' },
  { href: '/erp/lojas', rotulo: 'Lojas e marcas', permissao: 'lojas.ver' },
  { href: '/erp/equipe', rotulo: 'Equipe', permissao: 'acessos.gerir' },
  { href: '/erp/historico', rotulo: 'Histórico', permissao: 'historico.ver' },
  { href: '/erp/acesso', rotulo: 'Seu acesso', permissao: null },
];

export function telasPermitidas(alcance: Alcance) {
  return TELAS_DO_ERP.filter((t) => t.permissao === null || pode(alcance, t.permissao));
}

/**
 * Página do /erp: confere com a MESMA regra (`exigirPermissao`). Quem não pode
 * vai para a primeira tela que pode ("Seu acesso" sempre pode), com aviso.
 */
export function exigirPermissaoNaPagina(ctx: { alcance: Alcance }, permissao: Permissao, opcoes: { lojaId?: string } = {}) {
  try {
    exigirPermissao(ctx, permissao, opcoes);
  } catch (e) {
    if (!(e instanceof ErroDePermissao)) throw e;
    redirect(`${telasPermitidas(ctx.alcance)[0].href}?sem-acesso=1`);
  }
}
