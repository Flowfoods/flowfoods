/**
 * Painel — "o que está acontecendo agora".
 *
 * A pergunta que esta tela responde é sempre a mesma: o Barney está enviando?
 * Se não, POR QUÊ? Por isso o motivo da recusa é o item mais destacado da
 * página — fila parada sem causa visível é o que faz alguém desligar a trava.
 */

import Link from 'next/link';
import { prisma } from '@/lib/db';
import { montarEstadoEnvio, agoraSP, diaSP, INSTANCIA } from '@/lib/rodolfo/estado';
import { podeEnviar } from '@/lib/barney/tetos';
import { ENVIOS_MANUAIS_INICIAIS, STOP_LOSS } from '@/lib/barney/regras';
import { Barra, Cartao, Numero, Selo, Vazio } from './ui';

export const dynamic = 'force-dynamic';

/** Cada motivo vira uma frase de ação, não um código. */
const ACAO: Record<string, { tom: 'alerta' | 'erro' | 'neutro'; oQueFazer: string }> = {
  DISPARO_DESLIGADO: {
    tom: 'neutro',
    oQueFazer: 'Ligue em Config, depois dos 10 envios manuais.',
  },
  INSTANCIA_FORA_DO_AR: {
    tom: 'erro',
    oQueFazer: 'Reconecte a instância (QR em Config) antes de retomar.',
  },
  STOP_LOSS_FALHAS: {
    tom: 'erro',
    oQueFazer: 'Veja as últimas falhas antes de retomar — não force a fila.',
  },
  STOP_LOSS_ENTREGA: {
    tom: 'erro',
    oQueFazer: 'Entrega baixa é sinal de bloqueio silencioso. Pare o dia.',
  },
  EXIGE_ENVIO_MANUAL: { tom: 'alerta', oQueFazer: 'Use "Enviar agora" no Barney, um a um.' },
  FORA_DA_JANELA: { tom: 'neutro', oQueFazer: 'A fila volta sozinha na próxima janela útil.' },
  TETO_DIARIO: { tom: 'neutro', oQueFazer: 'Teto do dia cumprido. Volta amanhã.' },
  TETO_HORARIO: { tom: 'neutro', oQueFazer: 'Aguardando a próxima hora.' },
  INTERVALO_MINIMO: { tom: 'neutro', oQueFazer: 'Respirando entre um envio e outro.' },
};

/**
 * Horário sempre em São Paulo, nunca no fuso do navegador: o Rodolfo pode abrir
 * isto viajando, e "18:00" precisa significar o fim da janela, não a hora dele.
 */
const formatarQuando = (d: Date) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(d);

export default async function PainelPage() {
  const agora = agoraSP();
  const hoje = diaSP(agora);

  const [estado, lote, respostasNovas, semClassificar, proximos, totalLeads, emCadencia] =
    await Promise.all([
      montarEstadoEnvio(agora),
      prisma.batch.findUnique({ where: { data: hoje }, include: { _count: { select: { itens: true } } } }),
      prisma.message.count({
        where: { direction: 'IN', criadoEm: { gte: new Date(agora.toMillis() - 86_400_000) } },
      }),
      prisma.message.count({ where: { direction: 'IN', classificacao: { is: null } } }),
      prisma.enrollment.findMany({
        where: { status: 'ATIVA', proximoEnvioEm: { not: null } },
        orderBy: { proximoEnvioEm: 'asc' },
        take: 5,
        include: { lead: { select: { restaurante: true, nome: true, bairro: true } } },
      }),
      prisma.lead.count(),
      prisma.enrollment.count({ where: { status: 'ATIVA' } }),
    ]);

  const decisao = podeEnviar(estado, agora);
  const acao = decisao.motivo ? ACAO[decisao.motivo] : undefined;
  const taxaEntrega =
    estado.enviadosHoje > 0 ? Math.round((estado.entreguesHoje / estado.enviadosHoje) * 100) : null;
  const faltamManuais = Math.max(0, ENVIOS_MANUAIS_INICIAIS - estado.totalEnviadoHistorico);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Hoje</h1>
        <p className="mt-1 text-sm text-surface/60">
          {agora.setLocale('pt-BR').toFormat("cccc, d 'de' LLLL · HH:mm")} · São Paulo
        </p>
      </div>

      {/* Estado do disparo — o item mais importante da tela. */}
      <Cartao
        titulo="Disparo"
        acessorio={
          decisao.permitido ? (
            <Selo tom="ok">Enviando</Selo>
          ) : (
            <Selo tom={acao?.tom ?? 'neutro'}>Parado</Selo>
          )
        }
      >
        {decisao.permitido ? (
          <p className="text-sm text-surface/80">
            Fila liberada. Próximo envio respeita o intervalo mínimo e o teto da hora.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium text-surface">{decisao.explicacao}</p>
            {acao && <p className="text-sm text-surface/60">{acao.oQueFazer}</p>}
          </div>
        )}
      </Cartao>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Cartao>
          <Numero
            valor={`${estado.enviadosHoje}/${decisao.tetoDiaVigente}`}
            rotulo="Enviados hoje"
          />
          <div className="mt-3">
            <Barra
              valor={estado.enviadosHoje}
              total={decisao.tetoDiaVigente}
              tom={estado.enviadosHoje >= decisao.tetoDiaVigente ? 'neutro' : 'ok'}
            />
          </div>
        </Cartao>

        <Cartao>
          <Numero
            valor={taxaEntrega === null ? '—' : `${taxaEntrega}%`}
            rotulo="Entrega"
            detalhe={
              estado.enviadosHoje < STOP_LOSS.amostraMinimaEntrega
                ? `amostra < ${STOP_LOSS.amostraMinimaEntrega}`
                : `piso ${STOP_LOSS.taxaEntregaMinima * 100}%`
            }
          />
        </Cartao>

        <Cartao>
          <Numero
            valor={estado.estadoInstancia === 'open' ? 'No ar' : 'Fora'}
            rotulo="Instância"
            detalhe={INSTANCIA}
          />
        </Cartao>

        <Cartao>
          <Numero
            valor={faltamManuais > 0 ? faltamManuais : '✓'}
            rotulo="Manuais restantes"
            detalhe={faltamManuais > 0 ? 'antes do automático' : 'número aquecido'}
          />
        </Cartao>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao
          titulo="Lote do dia"
          acessorio={
            <Link href="/rodolfo/barney" className="text-xs font-medium text-bright hover:underline">
              abrir →
            </Link>
          }
        >
          {lote ? (
            <div className="flex items-center justify-between gap-3">
              <Numero valor={lote._count.itens} rotulo={`Leads · ${lote.status}`} />
              {lote.status === 'PROPOSTO' && <Selo tom="alerta">Aguarda aprovação</Selo>}
              {lote.status === 'APROVADO' && <Selo tom="ok">Aprovado</Selo>}
            </div>
          ) : (
            <Vazio>Nenhum lote montado hoje. Monte em Barney.</Vazio>
          )}
        </Cartao>

        <Cartao
          titulo="Respostas"
          acessorio={
            <Link href="/rodolfo/inbox" className="text-xs font-medium text-bright hover:underline">
              abrir →
            </Link>
          }
        >
          <div className="flex gap-8">
            <Numero valor={respostasNovas} rotulo="Últimas 24h" />
            <Numero valor={semClassificar} rotulo="Sem classificar" />
          </div>
        </Cartao>
      </div>

      <Cartao titulo="Próximos envios">
        {proximos.length === 0 ? (
          <Vazio>Nada agendado. Importe leads e monte o lote do dia.</Vazio>
        ) : (
          <ul className="divide-y divide-white/5">
            {proximos.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {e.lead.restaurante ?? e.lead.nome}
                  </p>
                  <p className="truncate text-xs text-surface/50">
                    {e.lead.bairro ?? '—'} · {e.toqueAtual ?? 'D0'}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-xs tabular-nums text-surface/60">
                  {e.proximoEnvioEm ? formatarQuando(e.proximoEnvioEm) : '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao titulo="Base">
        <div className="flex gap-8">
          <Numero valor={totalLeads} rotulo="Leads" />
          <Numero valor={emCadencia} rotulo="Em cadência" />
        </div>
      </Cartao>
    </div>
  );
}
