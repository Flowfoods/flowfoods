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
import { COR } from '@/lib/erp/modulos';
import { contarRespostasSemClassificar } from '@/lib/rodolfo/notificacoes';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { LINK_DE_TEXTO } from '@/components/erp/ui/estilos';
import { Barra, Metrica, Numero, Painel, Selo, Vazio } from '@/components/erp/ui/superficies';
import { exigirNivel1 } from '@/lib/erp/contexto';

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
  EXIGE_ENVIO_MANUAL: { tom: 'alerta', oQueFazer: 'Use "Enviar agora" em Cadência, um a um.' },
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
  // O middleware já exige a sessão; a página confere de novo (o layout não substitui a checagem).
  await exigirNivel1();
  const agora = agoraSP();
  const hoje = diaSP(agora);

  const [estado, lote, respostasNovas, semClassificar, proximos, totalLeads, emCadencia] = await Promise.all([
    montarEstadoEnvio(agora),
    prisma.batch.findUnique({ where: { data: hoje }, include: { _count: { select: { itens: true } } } }),
    prisma.message.count({
      where: { direction: 'IN', criadoEm: { gte: new Date(agora.toMillis() - 86_400_000) } },
    }),
    contarRespostasSemClassificar(),
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
  const taxaEntrega = estado.enviadosHoje > 0 ? Math.round((estado.entreguesHoje / estado.enviadosHoje) * 100) : null;
  const faltamManuais = Math.max(0, ENVIOS_MANUAIS_INICIAIS - estado.totalEnviadoHistorico);

  return (
    <div className="space-y-6">
      <PageHeader
        icone="hoje"
        cor={COR.comercial}
        titulo="Hoje"
        subtitulo={`${agora.setLocale('pt-BR').toFormat("cccc, d 'de' LLLL, HH:mm")} em São Paulo`}
      />

      {/* Estado do disparo — o item mais importante da tela. */}
      <Painel
        titulo="Disparo"
        acessorio={decisao.permitido ? <Selo tom="ok">Enviando</Selo> : <Selo tom={acao?.tom ?? 'neutro'}>Parado</Selo>}
      >
        {decisao.permitido ? (
          <p className="text-sm text-texto">
            Fila liberada. Próximo envio respeita o intervalo mínimo e o teto da hora.
          </p>
        ) : (
          <div className="space-y-1.5">
            <p className="font-display text-xl font-bold leading-snug">{decisao.explicacao}</p>
            {acao && <p className="text-sm text-suave">{acao.oQueFazer}</p>}
          </div>
        )}
      </Painel>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metrica rotulo="Enviados hoje" valor={`${estado.enviadosHoje}/${decisao.tetoDiaVigente}`}>
          <div className="mt-3">
            <Barra
              valor={estado.enviadosHoje}
              total={decisao.tetoDiaVigente}
              tom={estado.enviadosHoje >= decisao.tetoDiaVigente ? 'neutro' : 'ok'}
              rotulo={`${estado.enviadosHoje} de ${decisao.tetoDiaVigente} envios do dia`}
            />
          </div>
        </Metrica>
        <Metrica
          rotulo="Entrega"
          valor={taxaEntrega === null ? '—' : `${taxaEntrega}%`}
          detalhe={
            estado.enviadosHoje < STOP_LOSS.amostraMinimaEntrega
              ? `amostra < ${STOP_LOSS.amostraMinimaEntrega}`
              : `piso ${STOP_LOSS.taxaEntregaMinima * 100}%`
          }
        />
        <Metrica rotulo="Instância" valor={estado.estadoInstancia === 'open' ? 'No ar' : 'Fora'} detalhe={INSTANCIA} />
        <Metrica
          rotulo="Manuais restantes"
          valor={faltamManuais > 0 ? faltamManuais : 'Feito'}
          detalhe={faltamManuais > 0 ? 'antes do automático' : 'número aquecido'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Painel
          titulo="Lote do dia"
          acessorio={
            <Link href="/rodolfo/barney" className={LINK_DE_TEXTO}>
              Abrir a cadência
            </Link>
          }
        >
          {lote ? (
            <div className="flex items-center justify-between gap-3">
              <Numero valor={lote._count.itens} rotulo={`Leads no lote · ${lote.status}`} />
              {lote.status === 'PROPOSTO' && <Selo tom="alerta">Aguarda aprovação</Selo>}
              {lote.status === 'APROVADO' && <Selo tom="ok">Aprovado</Selo>}
            </div>
          ) : (
            <Vazio>Nenhum lote montado hoje. Monte em Cadência.</Vazio>
          )}
        </Painel>

        <Painel
          titulo="Respostas"
          acessorio={
            <Link href="/rodolfo/inbox" className={LINK_DE_TEXTO}>
              Abrir o Inbox
            </Link>
          }
        >
          <div className="flex gap-8">
            <Numero valor={respostasNovas} rotulo="Últimas 24h" />
            <Numero valor={semClassificar} rotulo="Sem classificar" />
          </div>
        </Painel>
      </div>

      <Painel titulo="Próximos envios" semRespiro>
        {proximos.length === 0 ? (
          <Vazio>Nada agendado. Importe leads e monte o lote do dia.</Vazio>
        ) : (
          <ul>
            {proximos.map((e) => (
              <li
                key={e.id}
                className="flex min-h-11 items-center justify-between gap-3 border-t border-linha px-4 py-2.5 first:border-t-0 sm:px-5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{e.lead.restaurante ?? e.lead.nome}</p>
                  <p className="truncate text-[12px] text-suave">
                    {e.lead.bairro ?? '—'}, toque {e.toqueAtual ?? 'D0'}
                  </p>
                </div>
                <span className="shrink-0 text-[13px] tabular-nums text-suave">
                  {e.proximoEnvioEm ? formatarQuando(e.proximoEnvioEm) : '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Painel>

      <Painel titulo="Base">
        <div className="flex gap-8">
          <Numero valor={totalLeads} rotulo="Leads" />
          <Numero valor={emCadencia} rotulo="Em cadência" />
        </div>
      </Painel>
    </div>
  );
}
