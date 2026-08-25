/**
 * Inbox — quem respondeu, classificado, com rascunho sugerido.
 *
 * O rascunho aparece dentro de um campo EDITÁVEL, nunca como botão de "enviar
 * isto". A regra é do negócio: a resposta ao lead é sempre humana, e a IA só
 * adianta a digitação.
 */

import Link from 'next/link';
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { Cartao, Numero, Selo, Vazio } from '../ui';
import { Responder } from './responder';

export const dynamic = 'force-dynamic';

const INTENCAO_TOM: Record<string, 'ok' | 'alerta' | 'erro' | 'neutro'> = {
  INTERESSADO: 'ok',
  PERGUNTA: 'alerta',
  DEPOIS: 'alerta',
  RECUSA: 'neutro',
  OPT_OUT: 'erro',
  OUTRO: 'neutro',
};

const FILTROS = ['', 'INTERESSADO', 'PERGUNTA', 'DEPOIS', 'RECUSA', 'OPT_OUT'];

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ intencao?: string }>;
}) {
  const params = await searchParams;

  const where: Prisma.MessageWhereInput = { direction: 'IN' };
  if (params.intencao) {
    where.classificacao = {
      is: { intencao: params.intencao as Prisma.InboundClassificationWhereInput['intencao'] },
    };
  }

  const [mensagens, porIntencao, semClassificar] = await Promise.all([
    prisma.message.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      take: 40,
      include: {
        classificacao: true,
        lead: {
          select: { id: true, restaurante: true, nome: true, bairro: true, categoria: true, status: true },
        },
      },
    }),
    prisma.inboundClassification.groupBy({ by: ['intencao'], _count: true }),
    prisma.message.count({ where: { direction: 'IN', classificacao: { is: null } } }),
  ]);

  const conta = (i: string) => porIntencao.find((p) => p.intencao === i)?._count ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Inbox</h1>
        <p className="mt-1 text-sm text-surface/60">
          Quem respondeu já teve a cadência pausada automaticamente.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Cartao>
          <Numero valor={conta('INTERESSADO')} rotulo="Interessados" />
        </Cartao>
        <Cartao>
          <Numero valor={conta('PERGUNTA') + conta('DEPOIS')} rotulo="Pergunta / depois" />
        </Cartao>
        <Cartao>
          <Numero valor={semClassificar} rotulo="Sem classificar" />
        </Cartao>
      </div>

      <Cartao titulo="Filtrar">
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => {
            const ativo = (params.intencao ?? '') === f;
            return (
              <Link
                key={f || 'todos'}
                href={f ? `/rodolfo/inbox?intencao=${f}` : '/rodolfo/inbox'}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  ativo
                    ? 'border-bright bg-bright/15 text-bright'
                    : 'border-white/15 text-surface/65 hover:border-white/30 hover:text-surface'
                }`}
              >
                {f || 'Todas'}
              </Link>
            );
          })}
        </div>
      </Cartao>

      {mensagens.length === 0 ? (
        <Cartao>
          <Vazio>Nenhuma resposta ainda. Elas chegam pelo webhook da Evolution.</Vazio>
        </Cartao>
      ) : (
        <div className="space-y-3">
          {mensagens.map((m) => {
            const optOut = m.classificacao?.intencao === 'OPT_OUT';
            return (
              <Cartao key={m.id}>
                <header className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {m.lead?.restaurante ?? m.lead?.nome ?? m.to}
                    </p>
                    <p className="truncate text-xs text-surface/50">
                      {[m.lead?.bairro, m.lead?.categoria].filter(Boolean).join(' · ') || '—'} ·{' '}
                      {new Intl.DateTimeFormat('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'America/Sao_Paulo',
                      }).format(m.criadoEm)}
                    </p>
                  </div>
                  <Selo tom={INTENCAO_TOM[m.classificacao?.intencao ?? 'OUTRO']}>
                    {m.classificacao?.intencao ?? 'sem classificar'}
                  </Selo>
                </header>

                <blockquote className="rounded-xl border-l-2 border-bright/50 bg-white/[0.03] px-3 py-2.5 text-sm text-surface/85">
                  {m.corpoRenderizado || <em className="text-surface/40">(sem texto — áudio ou mídia)</em>}
                </blockquote>

                {optOut ? (
                  <p className="mt-3 rounded-lg border border-bright/40 bg-bright/10 px-3 py-2 text-xs text-bright">
                    Pediu para sair. Removido da lista permanentemente — não responda.
                  </p>
                ) : m.lead ? (
                  <Responder
                    leadId={m.lead.id}
                    rascunho={m.classificacao?.rascunhoSugerido ?? ''}
                  />
                ) : (
                  <p className="mt-3 text-xs text-surface/45">
                    Número não bate com nenhum lead da base.
                  </p>
                )}
              </Cartao>
            );
          })}
        </div>
      )}
    </div>
  );
}
