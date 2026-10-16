/**
 * Lead 360 — tudo sobre uma casa, numa tela.
 *
 * A timeline é o coração: ela responde "o que já aconteceu com esse
 * restaurante" sem precisar cruzar tabela. Cada evento já vinha sendo gravado
 * desde a importação; aqui ele finalmente aparece.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { gancho, angulo } from '@/lib/barney/render';
import { agoraSP } from '@/lib/rodolfo/estado';
// avoid-ai-design-ignore: I3 — Check marca estado (opção escolhida, mensagem entregue), não é enfeite.
import {
  CircleDashed,
  Check,
  Dot,
  Download,
  Eye,
  Flag,
  MessageSquareReply,
  Send,
  StickyNote,
  Tag,
  X,
  type LucideIcon,
} from 'lucide-react';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { LINK_DE_TEXTO } from '@/components/erp/ui/estilos';
import { Aviso, Citacao, Linha, Metrica, Painel, Selo, Vazio } from '@/components/erp/ui/superficies';
import { AcoesLead } from './acoes';
import { exigirNivel1 } from '@/lib/erp/contexto';

export const dynamic = 'force-dynamic';

const STATUS_TOM: Record<string, 'ok' | 'alerta' | 'erro' | 'neutro'> = {
  NOVO: 'neutro',
  EM_CADENCIA: 'alerta',
  RESPONDEU: 'ok',
  DIAGNOSTICO_AGENDADO: 'ok',
  CLIENTE: 'ok',
  OPT_OUT: 'erro',
  CONFLITO: 'erro',
  PERDIDO: 'neutro',
};

/** Ícone de cada tipo de evento da timeline (funcional: dá para varrer a lista pelo tipo). */
const ICONE_EVENTO: Record<string, LucideIcon> = {
  import: Download,
  envio: Send,
  entrega: Check,
  leitura: Eye,
  resposta: MessageSquareReply,
  resposta_enviada: Send,
  dry_run: CircleDashed,
  classificacao: Tag,
  status: Flag,
  nota: StickyNote,
  exclusao: X,
};

const quando = (d: Date) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(d);

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  // O middleware já exige a sessão; a página confere de novo (o layout não substitui a checagem).
  await exigirNivel1();
  const { id } = await params;

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      eventos: { orderBy: { criadoEm: 'desc' }, take: 60 },
      enrollments: { include: { sequence: true } },
      mensagens: {
        orderBy: { criadoEm: 'desc' },
        take: 20,
        include: { classificacao: true },
      },
    },
  });

  if (!lead) notFound();

  const optOut = lead.telefoneNormalizado
    ? await prisma.optOut.findUnique({ where: { telefoneNormalizado: lead.telefoneNormalizado } })
    : null;

  const enrollment = lead.enrollments[0];
  const nome = lead.restaurante ?? lead.nome;

  // Prévia do gancho: é a primeira linha que o dono lê. Mostrar aqui deixa
  // conferir a leitura ANTES de o lead entrar num lote.
  const previaGancho =
    lead.nota != null && lead.avaliacoes != null ? gancho(nome, lead.nota, lead.avaliacoes, lead.bairro ?? '') : null;

  return (
    <div className="space-y-6">
      <Link href="/rodolfo/leads" className={LINK_DE_TEXTO}>
        Voltar para Leads
      </Link>
      <PageHeader
        icone="leads"
        cor={COR.comercial}
        titulo={nome}
        subtitulo={
          <span className="flex flex-wrap items-center gap-2">
            {[lead.bairro, lead.categoria, lead.bloco && `Bloco ${lead.bloco}`].filter(Boolean).join(', ') || '—'}
            <Selo tom={STATUS_TOM[lead.status] ?? 'neutro'}>{lead.status}</Selo>
            {lead.tier && <Selo>{lead.tier}</Selo>}
          </span>
        }
      />

      {optOut && (
        <Aviso tom="erro" titulo={`Pediu para sair em ${quando(optOut.criadoEm)}.`}>
          {optOut.termo && <>Casou com “{optOut.termo}”. </>}Bloqueado permanentemente, e o bloqueio sobrevive a
          reimportar a planilha.
        </Aviso>
      )}

      {lead.status === 'CONFLITO' && (
        <Aviso tom="erro" titulo="Conflito de interesse.">
          Categoria e território do Grupo Bibi Sucos. Nunca entra em cadência.
        </Aviso>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metrica
          rotulo="Nota Google"
          valor={lead.nota != null ? lead.nota.toFixed(1).replace('.', ',') : '—'}
          detalhe={lead.avaliacoes != null ? `${lead.avaliacoes} avaliações` : undefined}
        />
        <Metrica
          rotulo="Score base"
          valor={lead.scoreBase ?? '—'}
          detalhe={`cap ${lead.capacidade ?? '—'}, acesso ${lead.acessoDecisor ?? '—'}, terr ${lead.territorio ?? '—'}`}
        />
        <Metrica
          rotulo="Gap digital"
          valor={lead.gapDigital ?? '—'}
          detalhe={lead.gapDigital == null ? 'não apurado' : undefined}
        />
        <Metrica rotulo="Score total" valor={lead.scoreTotal ?? '—'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Painel titulo="Contato">
          <dl className="space-y-2 text-sm">
            <Linha rotulo="Telefone">
              <span className="tabular-nums">{lead.telefoneNormalizado ?? '—'}</span>
            </Linha>
            <Linha rotulo="Tipo">{lead.tipoTelefone}</Linha>
            <Linha rotulo="Canal">{lead.canal}</Linha>
            {lead.endereco && <Linha rotulo="Endereço">{lead.endereco}</Linha>}
            {lead.donoNome && <Linha rotulo="Dono">{lead.donoNome}</Linha>}
            {lead.instagram && <Linha rotulo="Instagram">{lead.instagram}</Linha>}
            <Linha rotulo="Lote">{lead.lote ?? '—'}</Linha>
          </dl>
          {lead.obs && (
            <p className="mt-3 rounded-[7px] border border-atencao/40 px-3 py-2 text-[13px] text-atencao">
              Flag da importação: {lead.obs}
            </p>
          )}
        </Painel>

        <Painel titulo="Cadência">
          {enrollment ? (
            <dl className="space-y-2 text-sm">
              <Linha rotulo="Situação">
                <Selo tom={enrollment.status === 'ATIVA' ? 'ok' : 'neutro'}>{enrollment.status}</Selo>
              </Linha>
              <Linha rotulo="Último toque">{enrollment.toqueAtual ?? '—'}</Linha>
              <Linha rotulo="Próximo em">
                <span className="tabular-nums">
                  {enrollment.proximoEnvioEm ? quando(enrollment.proximoEnvioEm) : '—'}
                </span>
              </Linha>
              {enrollment.motivoPausa && <Linha rotulo="Pausa">{enrollment.motivoPausa}</Linha>}
            </dl>
          ) : (
            <Vazio>Ainda não entrou em cadência.</Vazio>
          )}
        </Painel>
      </div>

      {previaGancho && (
        <Painel titulo="Prévia do gancho">
          <Citacao>{previaGancho}</Citacao>
          <p className="mt-2 text-[13px] text-suave">{angulo(lead.categoria ?? '', lead.bairro)}</p>
          <p className="mt-3 text-[13px] text-suave">
            É a primeira linha que o dono lê. Se a leitura estiver errada, ele percebe na hora — confira antes de
            aprovar o lote.
          </p>
        </Painel>
      )}

      <Painel titulo="Mensagens">
        {lead.mensagens.length === 0 ? (
          <Vazio>Nenhuma mensagem trocada.</Vazio>
        ) : (
          <ul className="space-y-3">
            {lead.mensagens.map((m) => (
              <li
                key={m.id}
                className={`rounded-[10px] border border-linha px-3 py-2.5 ${m.direction === 'IN' ? 'bg-texto/[0.03]' : 'bg-forte'}`}
              >
                <div className="mb-1 flex items-center justify-between gap-3 text-[12px] text-suave">
                  <span>
                    {m.direction === 'IN' ? 'Recebida' : `Enviada${m.toque ? `, ${m.toque}` : ''}`},{' '}
                    {quando(m.criadoEm)}
                  </span>
                  <Selo tom={m.status === 'FALHA' ? 'erro' : m.status === 'LIDA' ? 'ok' : 'neutro'}>
                    {m.status === 'AGENDADA' ? 'SIMULADA' : m.status}
                  </Selo>
                </div>
                <p className="whitespace-pre-wrap text-sm text-texto">{m.corpoRenderizado ?? '—'}</p>
                {m.classificacao && (
                  <p className="mt-2 text-[12px] text-suave">
                    Intenção: {m.classificacao.intencao} ({(m.classificacao.confianca * 100).toFixed(0)}%)
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Painel>

      <Painel titulo={`Timeline (${lead.eventos.length})`}>
        {lead.eventos.length === 0 ? (
          <Vazio>Sem eventos.</Vazio>
        ) : (
          <ol className="space-y-2.5">
            {lead.eventos.map((e) => {
              const I = ICONE_EVENTO[e.tipo] ?? Dot;
              return (
                <li key={e.id} className="flex gap-3 text-sm">
                  <I size={16} aria-hidden className="mt-0.5 shrink-0 text-suave" />
                  <span className="min-w-0 flex-1">
                    <span className="text-texto">{e.descricao}</span>
                    <span className="ml-2 whitespace-nowrap text-[12px] tabular-nums text-suave">
                      {quando(e.criadoEm)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </Painel>

      <AcoesLead
        leadId={lead.id}
        telefone={lead.telefoneNormalizado}
        bloqueado={Boolean(optOut) || lead.status === 'CONFLITO'}
      />
    </div>
  );
}
