'use server';

/**
 * Ações do shell para o nível 1 dentro de um parceiro: a busca ⌘K nos
 * insumos DELE e a visão (Rede Completa ↔ loja) daquele parceiro. Toda ação
 * abre com `exigirParceiro(slug)` (sessão do /rodolfo + parceiro resolvido no
 * servidor + cliente do portão) e confere a permissão com a regra única.
 */

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { exigirParceiro, recusaDaAcao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { buscarInsumos } from '@/lib/erp/insumos';
import { sessaoSegura } from '@/lib/erp/sessao-cookie';
import { UNIDADES } from '@/lib/erp/unidades';
import { COOKIE_VISAO, escolhaPermitida, valorDoCookieDeVisao, type OpcaoDeVisao } from '@/lib/erp/visao';
import type { RespostaDaVisao, ResultadoDaBusca } from '@/components/erp/shell/tipos';

export async function acaoBuscarNoParceiro(slug: string, q: string): Promise<ResultadoDaBusca[]> {
  const ctx = await exigirParceiro(String(slug));
  if (recusaDaAcao(ctx, 'insumos.ver')) return [];
  const achados = await buscarInsumos(ctx.cliente, String(q ?? ''));
  return achados.map((i) => ({
    tipo: 'insumo' as const,
    rotulo: i.nome,
    detalhe: `${ctx.parceiro.nome} · ${UNIDADES[i.unidade].nome}`,
    href: `/rodolfo/erp/${ctx.parceiro.slug}/insumos#insumo-${i.id}`,
    desativado: !i.ativo,
  }));
}

export async function acaoVisaoDoParceiro(
  slug: string,
): Promise<{ opcoes: OpcaoDeVisao[]; valor: string | null } | null> {
  const ctx = await exigirParceiro(String(slug));
  const { opcoes, valor } = await visaoDaRequisicao(ctx);
  return { opcoes, valor };
}

export async function acaoEscolherVisaoDoParceiro(slug: string, valor: string): Promise<RespostaDaVisao> {
  const ctx = await exigirParceiro(String(slug));
  const { lojas } = await visaoDaRequisicao(ctx);
  if (!escolhaPermitida(ctx.alcance, lojas, valor)) return { ok: false, mensagem: 'Essa loja não é deste parceiro.' };
  cookies().set(COOKIE_VISAO, valorDoCookieDeVisao(ctx.parceiro.id, valor), {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    secure: sessaoSegura(),
    maxAge: 60 * 60 * 24 * 90,
  });
  revalidatePath(`/rodolfo/erp/${ctx.parceiro.slug}`, 'layout');
  return { ok: true };
}
