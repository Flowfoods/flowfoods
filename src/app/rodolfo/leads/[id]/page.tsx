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
import { Cartao, Numero, Selo, Vazio } from '../../ui';
import { AcoesLead } from './acoes';

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

const ICONE_EVENTO: Record<string, string> = {
  import: '↓',
  envio: '→',
  entrega: '✓',
  leitura: '👁',
  resposta: '←',
  resposta_enviada: '→',
  dry_run: '◌',
  classificacao: '·',
  status: '·',
  nota: '·',
  exclusao: '×',
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
    lead.nota != null && lead.avaliacoes != null
      ? gancho(nome, lead.nota, lead.avaliacoes, lead.bairro ?? '')
      : null;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/rodolfo/leads" className="text-xs text-surface/45 hover:text-surface/70">
          ← Leads
        </Link>
        <h1 className="mt-1 font-display text-2xl font-bold">{nome}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-surface/60">
          {[lead.bairro, lead.categoria, lead.bloco && `Bloco ${lead.bloco}`]
            .filter(Boolean)
            .join(' · ') || '—'}
          <Selo tom={STATUS_TOM[lead.status] ?? 'neutro'}>{lead.status}</Selo>
          {lead.tier && <Selo>{lead.tier}</Selo>}
        </p>
      </div>

      {optOut && (
        <Cartao className="border-bright/40 bg-bright/[0.07]">
          <p className="text-sm text-bright">
            <strong>Pediu para sair</strong> em {quando(optOut.criadoEm)}
            {optOut.termo && <> — casou com “{optOut.termo}”</>}. Bloqueado permanentemente, e o
            bloqueio sobrevive a reimportar a planilha.
          </p>
        </Cartao>
      )}

      {lead.status === 'CONFLITO' && (
        <Cartao className="border-bright/40 bg-bright/[0.07]">
          <p className="text-sm text-bright">
            <strong>Conflito de interesse</strong> — categoria e território do Grupo Bibi Sucos.
            Nunca entra em cadência.
          </p>
        </Cartao>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Cartao>
          <Numero
            valor={lead.nota != null ? lead.nota.toFixed(1).replace('.', ',') : '—'}
            rotulo="Nota Google"
            detalhe={lead.avaliacoes != null ? `${lead.avaliacoes} avaliações` : undefined}
          />
        </Cartao>
        <Cartao>
          <Numero
            valor={lead.scoreBase ?? '—'}
            rotulo="Score base"
            detalhe={`cap ${lead.capacidade ?? '—'} · acesso ${lead.acessoDecisor ?? '—'} · terr ${lead.territorio ?? '—'}`}
          />
        </Cartao>
        <Cartao>
          <Numero
            valor={lead.gapDigital ?? '—'}
            rotulo="Gap digital"
            detalhe={lead.gapDigital == null ? 'não apurado' : undefined}
          />
        </Cartao>
        <Cartao>
          <Numero valor={lead.scoreTotal ?? '—'} rotulo="Score total" />
        </Cartao>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao titulo="Contato">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-surface/55">Telefone</dt>
              <dd className="font-mono tabular-nums">{lead.telefoneNormalizado ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-surface/55">Tipo</dt>
              <dd>{lead.tipoTelefone}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-surface/55">Canal</dt>
              <dd>{lead.canal}</dd>
            </div>
            {lead.endereco && (
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-surface/55">Endereço</dt>
                <dd className="text-right text-surface/80">{lead.endereco}</dd>
              </div>
            )}
            {lead.donoNome && (
              <div className="flex justify-between gap-4">
                <dt className="text-surface/55">Dono</dt>
                <dd>{lead.donoNome}</dd>
              </div>
            )}
            {lead.instagram && (
              <div className="flex justify-between gap-4">
                <dt className="text-surface/55">Instagram</dt>
                <dd>{lead.instagram}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-surface/55">Lote</dt>
              <dd className="text-surface/80">{lead.lote ?? '—'}</dd>
            </div>
          </dl>
          {lead.obs && (
            <p className="mt-3 rounded-lg border border-warning/30 bg-warning/[0.07] px-3 py-2 text-xs text-warning">
              Flag da importação: {lead.obs}
            </p>
          )}
        </Cartao>

        <Cartao titulo="Cadência">
          {enrollment ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-surface/55">Situação</dt>
                <dd>
                  <Selo tom={enrollment.status === 'ATIVA' ? 'ok' : 'neutro'}>
                    {enrollment.status}
                  </Selo>
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-surface/55">Último toque</dt>
                <dd className="font-mono">{enrollment.toqueAtual ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-surface/55">Próximo em</dt>
                <dd className="font-mono tabular-nums">
                  {enrollment.proximoEnvioEm ? quando(enrollment.proximoEnvioEm) : '—'}
                </dd>
              </div>
              {enrollment.motivoPausa && (
                <div className="flex justify-between gap-4">
                  <dt className="text-surface/55">Pausa</dt>
                  <dd>{enrollment.motivoPausa}</dd>
                </div>
              )}
            </dl>
          ) : (
            <Vazio>Ainda não entrou em cadência.</Vazio>
          )}
        </Cartao>
      </div>

      {previaGancho && (
        <Cartao titulo="Prévia do gancho">
          <blockquote className="rounded-xl border-l-2 border-bright/50 bg-white/[0.03] px-3 py-2.5 text-sm text-surface/85">
            {previaGancho}
          </blockquote>
          <p className="mt-2 text-xs text-surface/45">
            {angulo(lead.categoria ?? '', lead.bairro)}
          </p>
          <p className="mt-3 text-xs text-surface/40">
            É a primeira linha que o dono lê. Se a leitura estiver errada, ele percebe na hora —
            confira antes de aprovar o lote.
          </p>
        </Cartao>
      )}

      <Cartao titulo="Mensagens">
        {lead.mensagens.length === 0 ? (
          <Vazio>Nenhuma mensagem trocada.</Vazio>
        ) : (
          <ul className="space-y-3">
            {lead.mensagens.map((m) => (
              <li
                key={m.id}
                className={`rounded-xl border px-3 py-2.5 ${
                  m.direction === 'IN'
                    ? 'border-l-2 border-l-bright/50 border-white/10 bg-white/[0.03]'
                    : 'border-white/10 bg-white/[0.05]'
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-3 text-[11px] text-surface/45">
                  <span>
                    {m.direction === 'IN' ? 'recebida' : `enviada${m.toque ? ` · ${m.toque}` : ''}`}
                    {' · '}
                    {quando(m.criadoEm)}
                  </span>
                  <Selo
                    tom={m.status === 'FALHA' ? 'erro' : m.status === 'LIDA' ? 'ok' : 'neutro'}
                  >
                    {m.status === 'AGENDADA' ? 'SIMULADA' : m.status}
                  </Selo>
                </div>
                <p className="whitespace-pre-wrap text-sm text-surface/85">
                  {m.corpoRenderizado ?? '—'}
                </p>
                {m.classificacao && (
                  <p className="mt-2 text-[11px] text-surface/45">
                    Intenção: {m.classificacao.intencao} ({(m.classificacao.confianca * 100).toFixed(0)}%)
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao titulo={`Timeline (${lead.eventos.length})`}>
        {lead.eventos.length === 0 ? (
          <Vazio>Sem eventos.</Vazio>
        ) : (
          <ol className="space-y-2.5">
            {lead.eventos.map((e) => (
              <li key={e.id} className="flex gap-3 text-sm">
                <span className="mt-0.5 w-4 shrink-0 text-center text-surface/35">
                  {ICONE_EVENTO[e.tipo] ?? '·'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-surface/80">{e.descricao}</span>
                  <span className="ml-2 whitespace-nowrap font-mono text-[11px] tabular-nums text-surface/35">
                    {quando(e.criadoEm)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </Cartao>

      <AcoesLead
        leadId={lead.id}
        telefone={lead.telefoneNormalizado}
        bloqueado={Boolean(optOut) || lead.status === 'CONFLITO'}
      />
    </div>
  );
}
