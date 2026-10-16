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
import { COR } from '@/lib/erp/modulos';
import { BotaoAcao } from '@/components/erp/ui/botoes';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { Aviso, Contagem, Metrica, Painel, Selo, Vazio } from '@/components/erp/ui/superficies';
import { exigirNivel1 } from '@/lib/erp/contexto';

export const dynamic = 'force-dynamic';

const TOM_STATUS = {
  PROPOSTO: 'alerta',
  APROVADO: 'ok',
  EM_ENVIO: 'ok',
  CONCLUIDO: 'neutro',
  CANCELADO: 'erro',
} as const;

export default async function BarneyPage() {
  // O middleware já exige a sessão; a página confere de novo (o layout não substitui a checagem).
  await exigirNivel1();
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

  const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

  return (
    <div className="space-y-6">
      <PageHeader
        icone="cadencia"
        cor={COR.comercial}
        titulo="Cadência"
        subtitulo={`Lote de ${agora.setLocale('pt-BR').toFormat("d 'de' LLLL")}, teto de ${decisao.tetoDiaVigente} por dia`}
      />

      {faltamManuais > 0 && (
        <Aviso tom="alerta" titulo="Número ainda aquecendo.">
          Faltam {faltamManuais} envio(s) manual(is) antes do automático liberar. Use “Enviar agora”, um a um, com
          intervalo entre eles.
        </Aviso>
      )}

      {/* Decisões primeiro. Em 360px isto é o que aparece sem rolar. */}
      <Painel titulo="Decisão" acessorio={lote ? <Selo tom={TOM_STATUS[lote.status]}>{lote.status}</Selo> : null}>
        <div className="grid gap-2 sm:grid-cols-2">
          <BotaoAcao acao={acaoProporLote}>{lote ? 'Repropor lote' : 'Montar lote de hoje'}</BotaoAcao>

          <BotaoAcao acao={acaoDryRun}>Dry-run (não envia)</BotaoAcao>

          {lote?.status === 'PROPOSTO' && (
            <BotaoAcao acao={acaoAprovarLote} variante="primario">
              Aprovar lote
            </BotaoAcao>
          )}

          <BotaoAcao acao={acaoEnviarAgora} variante={lote?.status === 'PROPOSTO' ? 'secundario' : 'primario'}>
            Enviar agora (1)
          </BotaoAcao>

          {lote && lote.status !== 'CANCELADO' && (
            <BotaoAcao acao={acaoCancelarLote} variante="perigo" confirmar="Cancelar o lote de hoje? Nada mais sai.">
              Cancelar lote
            </BotaoAcao>
          )}
        </div>

        {!decisao.permitido && (
          <p className="mt-3 rounded-[7px] border border-linha bg-texto/[0.03] px-3 py-2 text-[13px] text-suave">
            <strong className="text-texto">Fila parada:</strong> {decisao.explicacao}
          </p>
        )}
      </Painel>

      <div className="grid grid-cols-3 gap-3">
        <Metrica rotulo="No lote" valor={lote?.itens.length ?? 0} />
        <Metrica rotulo="Enviados" valor={estado.enviadosHoje} />
        <Metrica rotulo="Aprovação" valor={config.modoAprovacao ? 'Manual' : 'Auto'} />
      </div>

      <Painel titulo="Fila" acessorio={<Contagem>{lote?.itens.length ?? 0}</Contagem>} semRespiro>
        {!lote || lote.itens.length === 0 ? (
          <Vazio>Nenhum lote montado. Toque em “Montar lote de hoje”.</Vazio>
        ) : (
          <ul>
            {lote.itens.map((item) => (
              <li key={item.id} className="border-t border-linha px-4 py-3 first:border-t-0 sm:px-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.lead.restaurante ?? item.lead.nome}</p>
                    <p className="mt-0.5 truncate text-[12px] text-suave">
                      {[item.lead.bairro, item.lead.categoria].filter(Boolean).join(', ') || '—'}
                      {item.lead.nota != null && `, nota ${item.lead.nota.toFixed(1).replace('.', ',')}`}
                      {item.lead.avaliacoes != null && ` (${item.lead.avaliacoes})`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-[12px] tabular-nums text-suave">{item.toque}</span>
                    {item.lead.tier && <Selo>{item.lead.tier}</Selo>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Painel>

      <Painel titulo="Saíram hoje" acessorio={<Contagem>{enviadasHoje.length}</Contagem>} semRespiro>
        {enviadasHoje.length === 0 ? (
          <Vazio>Nada enviado hoje ainda.</Vazio>
        ) : (
          <ul>
            {enviadasHoje.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 border-t border-linha px-4 py-2.5 first:border-t-0 sm:px-5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">{m.lead?.restaurante ?? m.lead?.nome ?? m.to}</p>
                  <p className="text-[12px] text-suave">
                    {m.toque ?? '—'}, às {hora.format(m.criadoEm)}
                  </p>
                </div>
                <Selo
                  tom={m.status === 'FALHA' ? 'erro' : m.status === 'ENTREGUE' || m.status === 'LIDA' ? 'ok' : 'neutro'}
                >
                  {m.status === 'AGENDADA' ? 'SIMULADA' : m.status}
                </Selo>
              </li>
            ))}
          </ul>
        )}
      </Painel>
    </div>
  );
}
