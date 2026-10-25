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
import { telaDaCadencia } from '@/lib/rodolfo/cadencia-tela';
import { AtualizarSozinho } from '@/components/erp/telas/producao/atualizar-sozinho';
import { acaoAprovarLote, acaoCancelarLote, acaoDryRun, acaoEnviarAgora, acaoProporLote } from '../actions';
import { COR } from '@/lib/erp/modulos';
import { BotaoAcao } from '@/components/erp/ui/botoes';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { Aviso, Contagem, Metrica, Painel, Selo, Vazio } from '@/components/erp/ui/superficies';
import { exigirNivel1 } from '@/lib/erp/contexto';
import Link from 'next/link';
import { LINK_DE_TEXTO } from '@/components/erp/ui/estilos';
import { ROTULO_DA_MENSAGEM, ROTULO_DO_LOTE, rotulo, rotuloDoToque } from '@/lib/rodolfo/rotulos';

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
  // O que o "Enviar o próximo" passaria (manual: pula a exigência de manual e a janela, não o resto).
  const manual = podeEnviar(estado, agora, { manual: true });
  // Os botões de cada situação saem de uma função pura e testada (E5.1, decisões 466 e 467).
  const tela = telaDaCadencia({
    lote: lote ? { status: lote.status, itens: lote.itens.length } : null,
    manual,
    automatico: decisao,
    totalEnviadoHistorico: estado.totalEnviadoHistorico,
    modoAprovacao: config.modoAprovacao,
  });
  const { faltamManuais, principal } = tela;
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

  const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

  return (
    <div className="space-y-6">
      <PageHeader
        icone="cadencia"
        cor={COR.comercial}
        titulo="Cadência"
        subtitulo={`Lote de ${agora.setLocale('pt-BR').toFormat("d 'de' LLLL")}, teto de ${decisao.tetoDiaVigente} por dia, aprovação ${config.modoAprovacao ? 'manual' : 'automática'}`}
      />

      {faltamManuais > 0 && (
        <Aviso tom="alerta" titulo="Número ainda aquecendo.">
          {faltamManuais === 1 ? 'Falta 1 envio manual' : `Faltam ${plural(faltamManuais, 'envio manual', 'envios manuais')}`} antes do automático liberar. Envie um a um, com
          intervalo entre eles.
        </Aviso>
      )}

      {/* Decisões primeiro. Em 360px isto é o que aparece sem rolar. */}
      <Painel titulo="Lote de hoje" acessorio={lote ? <Selo tom={TOM_STATUS[lote.status]}>{rotulo(ROTULO_DO_LOTE, lote.status)}</Selo> : null}>
        <div className="grid gap-2 sm:grid-cols-2">
          {tela.montar && (
            <BotaoAcao acao={acaoProporLote} variante={principal === 'montar' ? 'primario' : 'secundario'}>
              {lote ? 'Montar de novo' : 'Montar lote de hoje'}
            </BotaoAcao>
          )}

          <BotaoAcao acao={acaoDryRun}>Simular o lote (não envia)</BotaoAcao>

          {tela.aprovar && (
            <BotaoAcao acao={acaoAprovarLote} variante={principal === 'aprovar' ? 'primario' : 'secundario'}>
              Aprovar lote
            </BotaoAcao>
          )}

          {/* Espera que passa sozinha (intervalo, teto da hora): o botão fica, desabilitado, e a confirmação do envio anterior
              continua embaixo dele. Recusa que pede ação: sem botão, com o motivo embaixo. */}
          {tela.envio && (
            <BotaoAcao acao={acaoEnviarAgora} variante={faltamManuais > 0 ? 'primario' : 'secundario'} desabilitado={!tela.envio.habilitado}>
              {tela.envio.texto}
            </BotaoAcao>
          )}

          {tela.cancelar && (
            <BotaoAcao acao={acaoCancelarLote} variante="perigo" confirmar="Cancelar o lote de hoje? Nada mais sai.">
              Cancelar lote
            </BotaoAcao>
          )}
        </div>

        {tela.parado && (
          <p className="mt-3 rounded-[7px] border border-linha bg-texto/[0.03] px-3 py-2 text-[13px] text-suave">
            <strong className="text-texto">{tela.parado.titulo}</strong> {tela.parado.texto}
            {tela.parado.config && (
              <>
                {' '}
                <Link href="/rodolfo/config" className={LINK_DE_TEXTO}>
                  {tela.parado.config === 'ligar' ? 'Ligar em Regras de envio' : 'Conectar em Regras de envio'}
                </Link>
              </>
            )}
          </p>
        )}
        {/* Quando a espera acabar, a tela se atualiza sozinha e o botão volta a valer. */}
        {tela.envio && !tela.envio.habilitado && <AtualizarSozinho intervaloMs={Math.max(5, (tela.envio.liberaEmSegundos ?? 60) + 2) * 1000} />}
      </Painel>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
        <Metrica rotulo="No lote" valor={lote?.itens.length ?? 0} />
        <Metrica rotulo="Enviados" valor={estado.enviadosHoje} />
        <Metrica rotulo="Manuais restantes" valor={faltamManuais > 0 ? faltamManuais : 'Feito'} detalhe={faltamManuais > 0 ? 'antes do automático' : 'número aquecido'} />
      </div>

      <Painel titulo="Fila" acessorio={<Contagem>{lote?.itens.length ?? 0}</Contagem>} semRespiro>
        {!lote || lote.itens.length === 0 ? (
          <Vazio>{lote ? 'O lote de hoje ficou vazio: nenhum lead elegível. Importe leads ou monte de novo.' : 'Nenhum lote montado. Toque em “Montar lote de hoje”.'}</Vazio>
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
                    <span className="text-[12px] tabular-nums text-suave">{rotuloDoToque(item.toque)}</span>
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
                    {rotuloDoToque(m.toque)}, às {hora.format(m.criadoEm)}
                  </p>
                </div>
                <Selo
                  tom={m.status === 'FALHA' ? 'erro' : m.status === 'ENTREGUE' || m.status === 'LIDA' ? 'ok' : 'neutro'}
                >
                  {m.status === 'AGENDADA' ? 'Simulada' : rotulo(ROTULO_DA_MENSAGEM, m.status)}
                </Selo>
              </li>
            ))}
          </ul>
        )}
      </Painel>
    </div>
  );
}
