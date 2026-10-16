/**
 * Inbox — quem respondeu, classificado, com rascunho sugerido.
 *
 * O rascunho aparece dentro de um campo EDITÁVEL, nunca como botão de "enviar
 * isto". A regra é do negócio: a resposta ao lead é sempre humana, e a IA só
 * adianta a digitação.
 */

import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { FiltroEmLinks } from '@/components/erp/ui/filtros';
import { Citacao, Metrica, Painel, Selo, Vazio } from '@/components/erp/ui/superficies';
import { Responder } from './responder';
import { exigirNivel1 } from '@/lib/erp/contexto';

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

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ intencao?: string }> }) {
  // O middleware já exige a sessão; a página confere de novo (o layout não substitui a checagem).
  await exigirNivel1();
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

  const quando = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });

  return (
    <div className="space-y-6">
      <PageHeader
        icone="inbox"
        cor={COR.comercial}
        titulo="Inbox"
        subtitulo="Quem respondeu já teve a cadência pausada automaticamente."
      >
        <FiltroEmLinks
          rotulo="Filtrar por intenção"
          opcoes={FILTROS.map((f) => ({
            href: f ? `/rodolfo/inbox?intencao=${f}` : '/rodolfo/inbox',
            rotulo: f || 'Todas',
            ativo: (params.intencao ?? '') === f,
          }))}
        />
      </PageHeader>

      <div className="grid grid-cols-3 gap-3">
        <Metrica rotulo="Interessados" valor={conta('INTERESSADO')} />
        <Metrica rotulo="Pergunta / depois" valor={conta('PERGUNTA') + conta('DEPOIS')} />
        <Metrica rotulo="Sem classificar" valor={semClassificar} />
      </div>

      {mensagens.length === 0 ? (
        <Painel>
          <Vazio>Nenhuma resposta ainda. Elas chegam pelo webhook da Evolution.</Vazio>
        </Painel>
      ) : (
        <div className="space-y-3">
          {mensagens.map((m) => {
            const optOut = m.classificacao?.intencao === 'OPT_OUT';
            return (
              <Painel key={m.id}>
                <header className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{m.lead?.restaurante ?? m.lead?.nome ?? m.to}</p>
                    <p className="truncate text-[12px] text-suave">
                      {[m.lead?.bairro, m.lead?.categoria].filter(Boolean).join(', ') || '—'},{' '}
                      {quando.format(m.criadoEm)}
                    </p>
                  </div>
                  <Selo tom={INTENCAO_TOM[m.classificacao?.intencao ?? 'OUTRO']}>
                    {m.classificacao?.intencao ?? 'sem classificar'}
                  </Selo>
                </header>

                <Citacao>{m.corpoRenderizado || <em className="text-suave">(sem texto — áudio ou mídia)</em>}</Citacao>

                {optOut ? (
                  <p className="mt-3 rounded-[7px] border border-erro/40 px-3 py-2 text-[13px] text-erro">
                    Pediu para sair. Removido da lista permanentemente — não responda.
                  </p>
                ) : m.lead ? (
                  <Responder leadId={m.lead.id} rascunho={m.classificacao?.rascunhoSugerido ?? ''} />
                ) : (
                  <p className="mt-3 text-[13px] text-suave">Número não bate com nenhum lead da base.</p>
                )}
              </Painel>
            );
          })}
        </div>
      )}
    </div>
  );
}
