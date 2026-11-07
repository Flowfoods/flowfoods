import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { carregarPorToken } from '@/lib/portal/dados';
import Portal, { type EstadoInicial } from './Portal';

export const dynamic = 'force-dynamic';

export async function generateMetadata(props: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const params = await props.params;
  const c = await carregarPorToken(params.token);
  return { title: c ? `${c.cliente.nome} · Formulário inicial · FlowFoods` : 'FlowFoods' };
}

/**
 * Formulário inicial do cliente.
 *
 * O estado vem do banco a cada abertura — é isso que faz "fechar o navegador e
 * reabrir" devolver o texto: não depende de nada guardado no aparelho.
 */
export default async function PortalPage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const c = await carregarPorToken(params.token);
  if (!c) notFound();

  const [respostas, arquivos] = await Promise.all([
    prisma.portalResposta.findMany({
      where: { clienteId: c.cliente.id },
      select: { itemId: true, texto: true, marcacao: true, atualizadoEm: true },
    }),
    prisma.portalArquivo.findMany({
      where: { clienteId: c.cliente.id },
      orderBy: { criadoEm: 'asc' },
      select: { id: true, itemId: true, nomeOriginal: true, tamanho: true },
    }),
  ]);

  const inicial: EstadoInicial = {
    respostas: Object.fromEntries(
      // A hora da resposta: o rascunho do aparelho só volta se for mais novo (decisão 471).
      respostas.map((r) => [r.itemId, { texto: r.texto ?? '', marcacao: r.marcacao, em: r.atualizadoEm.toISOString() }]),
    ),
    arquivos,
    finalizadoEm: c.cliente.finalizadoEm?.toISOString() ?? null,
  };

  return <Portal token={c.cliente.token} cliente={c.cliente.nome} q={c.q} inicial={inicial} />;
}
