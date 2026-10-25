/**
 * Início do painel do nível 1 (E5.1, decisão 469): os números do dia e "O que precisa de você", com o mesmo componente do
 * Início do parceiro (`PainelDoDiaNaTela`). A ordem das pendências é a ordem em que vale resolver: sem WhatsApp e sem
 * disparo nada sai; sem lead não há o que enviar; depois o que espera uma decisão (lote, respostas, pedidos, formulário).
 * `pendenciasDoNivel1` é pura e testada; `painelDoNivel1` só lê o banco.
 */

import { prisma } from '@/lib/db';
import type { IndicadorDoDia, PainelDoDia, PendenciaDoDia } from '@/lib/erp/painel-do-dia';
import { listarQuadro } from '@/lib/erp/pedidos';
import { podeEnviar } from '@/lib/barney/tetos';
import { ENVIOS_MANUAIS_INICIAIS } from '@/lib/barney/regras';
import { agoraSP, diaSP, montarEstadoEnvio } from './estado';
import { contarRespostasSemClassificar } from './notificacoes';

export interface RetratoDoDia {
  estadoInstancia: string;
  disparoAtivo: boolean;
  totalLeads: number;
  lote: { status: string; itens: number } | null;
  semClassificar: number;
  pedidos: { abertos: number; atrasados: number };
  /** Clientes do portal que ainda não abriram o formulário. */
  portaisSemAbrir: { id: string; nome: string }[];
  enviadosHoje: number;
  tetoDoDia: number;
  respostas24h: number;
  totalEnviadoHistorico: number;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function pendenciasDoNivel1(r: RetratoDoDia): PendenciaDoDia[] {
  const p: PendenciaDoDia[] = [];
  if (r.estadoInstancia !== 'open') {
    p.push({ chave: 'whatsapp', titulo: 'WhatsApp da prospecção desconectado', texto: 'Enquanto não estiver conectado, nenhuma mensagem sai e nenhuma resposta chega.', href: '/rodolfo/config', acao: 'Conectar em Regras de envio' });
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
  if (r.lote?.status === 'PROPOSTO' && r.lote.itens > 0) {
    p.push({ chave: 'lote', titulo: 'Lote de hoje aguardando aprovação', texto: `${plural(r.lote.itens, 'lead', 'leads')} no lote. Nada sai antes de você aprovar.`, href: '/rodolfo/barney', acao: 'Abrir a Cadência' });
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
    p.push({ chave: `portal-${c.id}`, titulo: `${c.nome} não abriu o formulário`, texto: 'Mande o link de novo pelo WhatsApp do cliente.', href: `/rodolfo/portal/${c.id}`, acao: 'Copiar o link' });
  }
  return p;
}

export function indicadoresDoNivel1(r: RetratoDoDia): IndicadorDoDia[] {
  return [
    { chave: 'enviados', rotulo: 'Enviados hoje', valor: { tipo: 'fracao', de: r.enviadosHoje, total: r.tetoDoDia }, contexto: 'teto de hoje, já com o aumento gradual', href: '/rodolfo/barney' },
    { chave: 'respostas', rotulo: 'Respostas em 24 horas', valor: { tipo: 'numero', numero: r.respostas24h }, contexto: r.semClassificar > 0 ? `${r.semClassificar} sem classificar` : 'todas classificadas', href: '/rodolfo/inbox' },
    { chave: 'pedidos', rotulo: 'Pedidos aguardando', valor: { tipo: 'numero', numero: r.pedidos.abertos }, contexto: r.pedidos.atrasados > 0 ? `${r.pedidos.atrasados} com atraso` : 'nenhum com atraso', href: '/rodolfo/onboarding' },
  ];
}

export async function painelDoNivel1(agora = agoraSP()): Promise<PainelDoDia> {
  const [estado, totalLeads, lote, semClassificar, quadro, portais, respostas24h] = await Promise.all([
    montarEstadoEnvio(agora),
    prisma.lead.count(),
    prisma.batch.findUnique({ where: { data: diaSP(agora) }, select: { status: true, _count: { select: { itens: true } } } }),
    contarRespostasSemClassificar(),
    listarQuadro(),
    prisma.portalCliente.findMany({ where: { finalizadoEm: null, ultimaAtividadeEm: null }, select: { id: true, nome: true }, orderBy: { criadoEm: 'asc' } }),
    prisma.message.count({ where: { direction: 'IN', criadoEm: { gte: new Date(agora.toMillis() - 86_400_000) } } }),
  ]);
  const abertos = [...quadro.NOVO, ...quadro.EM_CONVERSA];
  const retrato: RetratoDoDia = {
    estadoInstancia: estado.estadoInstancia,
    disparoAtivo: estado.disparoAtivo,
    totalLeads,
    lote: lote ? { status: lote.status, itens: lote._count.itens } : null,
    semClassificar,
    pedidos: { abertos: abertos.length, atrasados: abertos.filter((c) => c.atrasoDias > 0).length },
    portaisSemAbrir: portais,
    enviadosHoje: estado.enviadosHoje,
    tetoDoDia: podeEnviar(estado, agora).tetoDiaVigente,
    respostas24h,
    totalEnviadoHistorico: estado.totalEnviadoHistorico,
  };
  return { indicadores: indicadoresDoNivel1(retrato), pendencias: pendenciasDoNivel1(retrato) };
}
