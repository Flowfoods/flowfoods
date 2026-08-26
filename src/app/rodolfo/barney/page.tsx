/**
 * Barney — lote do dia, fila e conferência.
 *
 * A tela onde o Rodolfo aprova. Tudo aqui é pensado para o celular: os botões
 * de decisão ficam acima da lista, porque rolar 30 nomes antes de achar
 * "Aprovar" é o tipo de atrito que faz o lote do dia não sair.
 */

import { prisma } from '@/lib/db';
import { agoraSP, diaSP, montarEstadoEnvio } from '@/lib/rodolfo/estado';
import { podeEnviar } from '@/lib/barney/tetos';
import { lerConfig } from '@/lib/rodolfo/config';
import { ENVIOS_MANUAIS_INICIAIS } from '@/lib/barney/regras';
import { acaoAprovarLote, acaoCancelarLote, acaoDryRun, acaoEnviarAgora, acaoProporLote } from '../actions';
import { BotaoAcao } from '../botoes';
import { Cartao, Numero, Selo, Vazio } from '../ui';

export const dynamic = 'force-dynamic';

const TOM_STATUS = {
  PROPOSTO: 'alerta',
  APROVADO: 'ok',
  EM_ENVIO: 'ok',
  CONCLUIDO: 'neutro',
  CANCELADO: 'erro',
} as const;

export default async function BarneyPage() {
  const agora = agoraSP();
  const [lote, estado, config, enviadasHoje] = await Promise.all([
    prisma.batch.findUnique({
      where: { data: diaSP(agora) },
      include: {
        itens: {
          orderBy: { ordem: 'asc' },
          include: {
            lead: {
              select: {
                id: true,
                restaurante: true,
                nome: true,
                bairro: true,
                categoria: true,
                tier: true,
                scoreBase: true,
                nota: true,
                avaliacoes: true,
                status: true,
              },
            },
          },
        },
      },
    }),
    montarEstadoEnvio(agora),
    lerConfig(),
    prisma.message.findMany({
      where: {
        direction: 'OUT',
        criadoEm: { gte: agora.startOf('day').toJSDate() },
      },
      orderBy: { criadoEm: 'desc' },
      take: 30,
      include: { lead: { select: { restaurante: true, nome: true } } },
    }),
  ]);

  const decisao = podeEnviar(estado, agora);
  const faltamManuais = Math.max(0, ENVIOS_MANUAIS_INICIAIS - estado.totalEnviadoHistorico);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Barney</h1>
        <p className="mt-1 text-sm text-surface/60">
          Lote de {agora.setLocale('pt-BR').toFormat("d 'de' LLLL")} · teto {decisao.tetoDiaVigente}/dia
        </p>
      </div>

      {faltamManuais > 0 && (
        <Cartao className="border-warning/30 bg-warning/[0.06]">
          <p className="text-sm text-surface/85">
            <strong className="text-warning">Número ainda aquecendo.</strong> Faltam{' '}
            {faltamManuais} envio(s) manual(is) antes do automático liberar. Use “Enviar agora”, um
            a um, com intervalo entre eles.
          </p>
        </Cartao>
      )}

      {/* Decisões primeiro. Em 360px isto é o que aparece sem rolar. */}
      <Cartao
        titulo="Decisão"
        acessorio={lote ? <Selo tom={TOM_STATUS[lote.status]}>{lote.status}</Selo> : null}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <BotaoAcao acao={acaoProporLote}>
            {lote ? 'Repropor lote' : 'Montar lote de hoje'}
          </BotaoAcao>

          <BotaoAcao acao={acaoDryRun}>Dry-run (não envia)</BotaoAcao>

          {lote?.status === 'PROPOSTO' && (
            <BotaoAcao acao={acaoAprovarLote} variante="primario">
              Aprovar lote
            </BotaoAcao>
          )}

          <BotaoAcao acao={() => acaoEnviarAgora()} variante="primario">
            Enviar agora (1)
          </BotaoAcao>

          {lote && lote.status !== 'CANCELADO' && (
            <BotaoAcao
              acao={acaoCancelarLote}
              variante="perigo"
              confirmar="Cancelar o lote de hoje? Nada mais sai."
            >
              Cancelar lote
            </BotaoAcao>
          )}
        </div>

        {!decisao.permitido && (
          <p className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-surface/70">
            <strong>Fila parada:</strong> {decisao.explicacao}
          </p>
        )}
      </Cartao>

      <div className="grid grid-cols-3 gap-3">
        <Cartao>
          <Numero valor={lote?.itens.length ?? 0} rotulo="No lote" />
        </Cartao>
        <Cartao>
          <Numero valor={estado.enviadosHoje} rotulo="Enviados" />
        </Cartao>
        <Cartao>
          <Numero
            valor={config.modoAprovacao ? 'Manual' : 'Auto'}
            rotulo="Aprovação"
          />
        </Cartao>
      </div>

      <Cartao titulo={`Fila (${lote?.itens.length ?? 0})`}>
        {!lote || lote.itens.length === 0 ? (
          <Vazio>Nenhum lote montado. Toque em “Montar lote de hoje”.</Vazio>
        ) : (
          <ul className="divide-y divide-white/5">
            {lote.itens.map((item) => (
              <li key={item.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {item.lead.restaurante ?? item.lead.nome}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-surface/50">
                      {[item.lead.bairro, item.lead.categoria].filter(Boolean).join(' · ') || '—'}
                      {item.lead.nota != null && ` · ${item.lead.nota.toFixed(1).replace('.', ',')}`}
                      {item.lead.avaliacoes != null && ` (${item.lead.avaliacoes})`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-[10px] uppercase text-surface/45">
                      {item.toque}
                    </span>
                    {item.lead.tier && <Selo>{item.lead.tier}</Selo>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao titulo="Saíram hoje">
        {enviadasHoje.length === 0 ? (
          <Vazio>Nada enviado hoje ainda.</Vazio>
        ) : (
          <ul className="divide-y divide-white/5">
            {enviadasHoje.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm">{m.lead?.restaurante ?? m.lead?.nome ?? m.to}</p>
                  <p className="text-xs text-surface/45">
                    {m.toque ?? '—'} ·{' '}
                    {new Intl.DateTimeFormat('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'America/Sao_Paulo',
                    }).format(m.criadoEm)}
                  </p>
                </div>
                <Selo
                  tom={
                    m.status === 'FALHA'
                      ? 'erro'
                      : m.status === 'ENTREGUE' || m.status === 'LIDA'
                        ? 'ok'
                        : 'neutro'
                  }
                >
                  {m.status === 'AGENDADA' ? 'SIMULADA' : m.status}
                </Selo>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </div>
  );
}
