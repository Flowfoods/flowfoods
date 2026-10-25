/**
 * Inbox — quem respondeu, classificado, com rascunho sugerido.
 *
 * O rascunho aparece dentro de um campo EDITÁVEL, nunca como botão de "enviar
 * isto". A regra é do negócio: a resposta ao lead é sempre humana, e a IA só
 * adianta a digitação.
 */

import Link from 'next/link';
import { prisma } from '@/lib/db';
import { LINK_DE_TEXTO } from '@/components/erp/ui/estilos';
import type { Prisma } from '@prisma/client';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { FiltroEmLinks } from '@/components/erp/ui/filtros';
import { Aviso, Citacao, Metrica, Painel, Selo, Vazio } from '@/components/erp/ui/superficies';
import { ROTULO_DA_INTENCAO, rotulo } from '@/lib/rodolfo/rotulos';
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

/** '' = todas; SEM = as que a IA ainda não classificou (um dos três números do topo, agora com filtro). */
const FILTROS = ['', 'SEM', 'INTERESSADO', 'PERGUNTA', 'DEPOIS', 'RECUSA', 'OPT_OUT'];

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ intencao?: string }> }) {
  // O middleware já exige a sessão; a página confere de novo (o layout não substitui a checagem).
  await exigirNivel1();
  const lidos = await searchParams;
  // Só um filtro conhecido vira consulta (um valor torto na URL não chega ao banco como enum inválido).
  const params = { intencao: FILTROS.includes(lidos.intencao ?? '') ? lidos.intencao : undefined };

  const where: Prisma.MessageWhereInput = { direction: 'IN' };
  if (params.intencao === 'SEM') {
    where.classificacao = { is: null };
  } else if (params.intencao) {
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
            rotulo: f === '' ? 'Todas' : f === 'SEM' ? 'Sem classificar' : rotulo(ROTULO_DA_INTENCAO, f),
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
          {params.intencao ? (
            // Com filtro, o vazio é do filtro, não da Inbox: diz qual e volta para todas.
            <Vazio
              titulo={`Nenhuma resposta em “${params.intencao === 'SEM' ? 'Sem classificar' : rotulo(ROTULO_DA_INTENCAO, params.intencao)}”.`}
              acao={
                <Link href="/rodolfo/inbox" className={`${LINK_DE_TEXTO} ff-toque`}>
                  Ver todas as respostas
                </Link>
              }
            />
          ) : (
            <Vazio titulo="Nenhuma resposta ainda.">Quando alguém responder uma mensagem da cadência, ela aparece aqui, já classificada.</Vazio>
          )}
        </Painel>
      ) : (
        <div className="space-y-3">
          {mensagens.map((m) => {
            const optOut = m.classificacao?.intencao === 'OPT_OUT';
            return (
              <Painel key={m.id}>
                <header className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {/* O nome abre o Lead 360: a conversa inteira e o histórico estão lá. */}
                    {m.lead ? (
                      <Link
                        href={`/rodolfo/leads/${m.lead.id}`}
                        className="block truncate rounded-[5px] text-sm font-semibold underline decoration-linha-forte underline-offset-4 hover:decoration-texto [@media(pointer:coarse)]:flex [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center"
                      >
                        {m.lead.restaurante ?? m.lead.nome}
                      </Link>
                    ) : (
                      <p className="truncate text-sm font-semibold">{m.to}</p>
                    )}
                    <p className="truncate text-[12px] text-suave">
                      {[m.lead?.bairro, m.lead?.categoria].filter(Boolean).join(', ') || '—'},{' '}
                      {quando.format(m.criadoEm)}
                    </p>
                  </div>
                  <Selo tom={INTENCAO_TOM[m.classificacao?.intencao ?? 'OUTRO']}>
                    {rotulo(ROTULO_DA_INTENCAO, m.classificacao?.intencao, 'Sem classificar')}
                  </Selo>
                </header>

                <Citacao>{m.corpoRenderizado || <em className="text-suave">(sem texto — áudio ou mídia)</em>}</Citacao>

                {optOut ? (
                  <div className="mt-3">
                    <Aviso tom="erro" titulo="Pediu para sair.">
                      Saiu da lista para sempre. Não responda.
                    </Aviso>
                  </div>
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
