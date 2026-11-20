'use server';

import { cookies } from 'next/headers';
import { exigirParceiro, exigirParceiroDaSessao, pode, type ContextoDoParceiro } from '@/lib/erp/contexto';
import { listarMarcasComIdentidade } from '@/lib/erp/identidade';
import { COOKIE_MARCA_CABECALHO, cookieDaMarca, escolherMarcaDoCookie, type IdentidadeDoCabecalho } from '@/lib/erp/marca-cabecalho';
import { sessaoSegura } from '@/lib/erp/sessao-cookie';

async function dados(ctx: ContextoDoParceiro, base: string): Promise<IdentidadeDoCabecalho> {
  const marcas = (await listarMarcasComIdentidade(ctx.cliente)).map((m) => ({
    id: m.id, nome: m.nome,
    logoUrl: m.logoArquivo ? `${base}/identidade/marcas/${encodeURIComponent(m.id)}/logo?v=${encodeURIComponent(m.logoArquivo)}` : null,
  }));
  return {
    parceiroId: ctx.parceiro.id, nomeParceiro: ctx.parceiro.nome, marcas,
    selecionada: escolherMarcaDoCookie((await cookies()).get(COOKIE_MARCA_CABECALHO)?.value, `${ctx.sessao.userId}:${ctx.parceiro.id}`, marcas),
    perfilHref: pode(ctx.alcance, 'lojas.ver') ? `${base}/lojas#identidade-visual` : null,
  };
}

export async function identidadeDaSessao(): Promise<IdentidadeDoCabecalho> {
  return dados(await exigirParceiroDaSessao(), '/erp');
}

export async function identidadeDoParceiro(slug: string): Promise<IdentidadeDoCabecalho> {
  const ctx = await exigirParceiro(String(slug));
  return dados(ctx, `/rodolfo/erp/${ctx.parceiro.slug}`);
}

async function guardar(ctx: ContextoDoParceiro, marcaId: string) {
  const existe = await ctx.cliente.marca.findFirst({ where: { id: marcaId, ativa: true }, select: { id: true } });
  if (!existe) return { ok: false, mensagem: 'Essa marca não está disponível neste parceiro.' };
  (await cookies()).set(COOKIE_MARCA_CABECALHO, cookieDaMarca(`${ctx.sessao.userId}:${ctx.parceiro.id}`, existe.id), {
    path: '/', httpOnly: true, sameSite: 'lax', secure: sessaoSegura(), maxAge: 60 * 60 * 24 * 90,
  });
  return { ok: true };
}

export async function escolherMarcaDaSessao(marcaId: string) {
  return guardar(await exigirParceiroDaSessao(), String(marcaId));
}

export async function escolherMarcaDoParceiro(slug: string, marcaId: string) {
  return guardar(await exigirParceiro(String(slug)), String(marcaId));
}
