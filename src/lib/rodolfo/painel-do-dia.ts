/**
 * Início do painel do nível 1 (E5.1, decisão 469): os números do dia e "O que precisa de você", com o mesmo componente do
 * Início do parceiro (`PainelDoDiaNaTela`). A ordem das pendências é a ordem em que vale resolver: sem WhatsApp e sem
 * disparo nada sai; sem lead não há o que enviar; depois o que espera uma decisão (lote, respostas, pedidos, formulário).
 * `pendenciasDoNivel1` é pura e testada; `painelDoNivel1` só lê o banco.
 */

import { prisma } from '@/lib/db';
import type { IndicadorDoDia, PainelDoDia, PendenciaDoDia } from '@/lib/erp/painel-do-dia';
import { contarPedidosAbertos } from '@/lib/erp/pedidos';
import { lerConfig } from './config';
import { podeEnviar } from '@/lib/barney/tetos';
import { ENVIOS_MANUAIS_INICIAIS } from '@/lib/barney/regras';
import { agoraSP, diaSP, montarEstadoEnvio } from './estado';
import { contarRespostasSemClassificar } from './notificacoes';

export interface RetratoDoDia {
  estadoInstancia: string;
  disparoAtivo: boolean;
  modoAprovacao: boolean;
  /** Pausa automática (falhas seguidas ou entrega baixa): o texto de `podeEnviar`, ou null. */
  pausaAutomatica: string | null;
  totalLeads: number;
  lote: { status: string; itens: number } | null;
  semClassificar: number;
  pedidos: { abertos: number; atrasados: number };
  /** Clientes do portal que ainda não começaram a responder o formulário. */
  portaisSemAbrir: { id: string; nome: string }[];
  enviadosHoje: number;
  tetoDoDia: number;
  respostas24h: number;
  totalEnviadoHistorico: number;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function pendenciasDoNivel1(r: RetratoDoDia): PendenciaDoDia[] {
  const p: PendenciaDoDia[] = [];
  // A pausa automática é o estado que mais pede gente: o número pode estar sendo bloqueado.
  if (r.pausaAutomatica) {
    p.push({ chave: 'pausa', titulo: 'Envio em pausa automática', texto: `${r.pausaAutomatica} Veja a saúde do número antes de retomar.`, href: '/rodolfo/metricas', acao: 'Ver a saúde do número' });
  }
  if (r.estadoInstancia !== 'open') {
    p.push({ chave: 'whatsapp', titulo: 'WhatsApp da prospecção desconectado', texto: 'Enquanto não estiver conectado, nenhuma mensagem sai e nenhuma resposta chega.', href: '/rodolfo/config', acao: 'Ver como conectar' });
  }
  if (!r.disparoAtivo) {
    const faltam = Math.max(0, ENVIOS_MANUAIS_INICIAIS - r.totalEnviadoHistorico);
    p.push({
      chave: 'disparo',
      titulo: 'Disparo desligado',
      texto: `Nada sai, nem à mão. Ligue em Regras de envio quando for começar${faltam > 0 ? `; os ${faltam} primeiros envios são um a um, em Cadência` : ''}.`,
      href: '/rodolfo/config',
      acao: 'Abrir Regras de envio',
    });
  }
  if (r.totalLeads === 0) {
    p.push({ chave: 'leads', titulo: 'Nenhum lead na base', texto: 'Importe a planilha do ledsflowfoods para montar o primeiro lote.', href: '/rodolfo/leads/importar', acao: 'Importar leads' });
  }
  // Com aprovação automática, o lote proposto já sai: não é pendência.
  if (r.modoAprovacao && r.lote?.status === 'PROPOSTO' && r.lote.itens > 0) {
    p.push({ chave: 'lote', titulo: 'Lote de hoje aguardando aprovação', texto: `${plural(r.lote.itens, 'lead', 'leads')} no lote. Nada sai antes de você aprovar.`, href: '/rodolfo/barney', acao: 'Abrir a Cadência' });
  }
  // O primeiro passo da rotina: tudo pronto e ainda não há lote hoje.
  if (!r.lote && r.totalLeads > 0 && r.disparoAtivo && r.estadoInstancia === 'open' && !r.pausaAutomatica) {
    p.push({ chave: 'montar', titulo: 'Nenhum lote hoje', texto: 'Monte o lote do dia, simule e aprove em Cadência.', href: '/rodolfo/barney', acao: 'Montar o lote de hoje' });
  }
  if (r.semClassificar > 0) {
    p.push({
      chave: 'respostas',
      titulo: `${plural(r.semClassificar, 'resposta sem classificar', 'respostas sem classificar')}`,
      texto: 'Leia e responda pelo Inbox; quem pediu para sair já fica de fora sozinho.',
      href: '/rodolfo/inbox?intencao=SEM',
      acao: 'Abrir o Inbox',
    });
  }
  if (r.pedidos.abertos > 0) {
    p.push({
      chave: 'pedidos',
      titulo: `${plural(r.pedidos.abertos, 'pedido aguardando', 'pedidos aguardando')}${r.pedidos.atrasados > 0 ? ` (${r.pedidos.atrasados} com atraso)` : ''}`,
      texto: 'Quem pediu para começar no site ou foi cadastrado por você. Ative ou recuse.',
      href: '/rodolfo/onboarding',
      acao: 'Abrir Aguardando liberação',
    });
  }
  for (const c of r.portaisSemAbrir) {
    p.push({ chave: `portal-${c.id}`, titulo: `${c.nome} ainda não começou o formulário`, texto: 'Nenhuma resposta até agora. Mande o link de novo pelo WhatsApp do cliente.', href: `/rodolfo/portal/${c.id}`, acao: 'Abrir o link do cliente' });
  }
  return p;
}

export function indicadoresDoNivel1(r: RetratoDoDia): IndicadorDoDia[] {
  return [
    { chave: 'enviados', rotulo: 'Enviados hoje', valor: { tipo: 'fracao', de: r.enviadosHoje, total: r.tetoDoDia }, contexto: 'teto de hoje, já com o aumento gradual', href: '/rodolfo/barney' },
    // Sem WhatsApp conectado não chega resposta: "—", não um zero que parece medido.
    r.estadoInstancia === 'open'
      ? { chave: 'respostas', rotulo: 'Respostas em 24 horas', valor: { tipo: 'numero', numero: r.respostas24h }, contexto: r.semClassificar > 0 ? `${r.semClassificar} sem classificar` : r.respostas24h === 0 ? 'nenhuma resposta' : 'todas classificadas', href: '/rodolfo/inbox' }
      : { chave: 'respostas', rotulo: 'Respostas em 24 horas', valor: { tipo: 'numero', numero: null }, contexto: 'WhatsApp desconectado', href: '/rodolfo/inbox' },
    { chave: 'pedidos', rotulo: 'Pedidos aguardando', valor: { tipo: 'numero', numero: r.pedidos.abertos }, contexto: r.pedidos.atrasados > 0 ? `${r.pedidos.atrasados} com atraso` : 'nenhum com atraso', href: '/rodolfo/onboarding' },
  ];
}

export async function painelDoNivel1(agora = agoraSP()): Promise<PainelDoDia> {
  const [estado, config, totalLeads, lote, semClassificar, pedidos, portais, respostas24h] = await Promise.all([
    montarEstadoEnvio(agora),
    lerConfig(),
    prisma.lead.count(),
    prisma.batch.findUnique({ where: { data: diaSP(agora) }, select: { status: true, _count: { select: { itens: true } } } }),
    contarRespostasSemClassificar(),
    // A mesma contagem do sino: o Início e as notificações nunca divergem.
    contarPedidosAbertos(),
    prisma.portalCliente.findMany({ where: { finalizadoEm: null, ultimaAtividadeEm: null }, select: { id: true, nome: true }, orderBy: { criadoEm: 'asc' } }),
    prisma.message.count({ where: { direction: 'IN', criadoEm: { gte: new Date(agora.toMillis() - 86_400_000) } } }),
  ]);
  const decisao = podeEnviar(estado, agora);
  const retrato: RetratoDoDia = {
    estadoInstancia: estado.estadoInstancia,
    disparoAtivo: estado.disparoAtivo,
    modoAprovacao: config.modoAprovacao,
    pausaAutomatica: decisao.motivo === 'STOP_LOSS_FALHAS' || decisao.motivo === 'STOP_LOSS_ENTREGA' ? (decisao.explicacao ?? 'Pausa automática.') : null,
    totalLeads,
    lote: lote ? { status: lote.status, itens: lote._count.itens } : null,
    semClassificar,
    pedidos,
    portaisSemAbrir: portais,
    enviadosHoje: estado.enviadosHoje,
    tetoDoDia: decisao.tetoDiaVigente,
    respostas24h,
    totalEnviadoHistorico: estado.totalEnviadoHistorico,
  };
  return { indicadores: indicadoresDoNivel1(retrato), pendencias: pendenciasDoNivel1(retrato) };
}
