'use server';

/**
 * Ações do Espaço do Rodolfo.
 *
 * Toda ação confere a sessão antes de tocar em qualquer coisa. O middleware já
 * protege as PÁGINAS, mas server action é um endpoint POST como outro qualquer:
 * quem souber o id da ação pode chamá-la direto, sem passar por página nenhuma.
 */

import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/rodolfo/auth';
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { aprovarLote, cancelarLote, dispararProximo, salvarProposta } from '@/lib/rodolfo/lote';
import { salvarConfig, type ConfigBarney } from '@/lib/rodolfo/config';
import { importarLote } from '@/lib/rodolfo/importar-lote';
import { criarWhatsAppService } from '@/lib/rodolfo/outbox';
import { agoraSP } from '@/lib/rodolfo/estado';
import { PREFIXO_DRY_RUN } from '@/lib/barney/dedup';
import type { LinhaPlanilha } from '@/lib/leds/importar';

export interface Resposta {
  ok: boolean;
  mensagem: string;
}

async function exigirSessao(): Promise<string> {
  const sessao = await getServerSession(authOptions);
  const id = (sessao?.user as { id?: string } | undefined)?.id;
  if (!id) throw new Error('Sem sessão.');
  return id;
}

async function auditar(userId: string, evento: string, dados: Record<string, unknown> = {}) {
  // `dados` é Json no schema; o Prisma quer o tipo dele, não um Record solto.
  await prisma.auditLog.create({
    data: { userId, evento, dados: dados as Prisma.InputJsonValue },
  });
}

export async function acaoProporLote(): Promise<Resposta> {
  const userId = await exigirSessao();
  const { itens } = await salvarProposta();
  await auditar(userId, 'lote_proposto', { quantidade: itens.length });
  revalidatePath('/rodolfo/barney');
  revalidatePath('/rodolfo');
  return {
    ok: true,
    mensagem:
      itens.length === 0
        ? 'Nenhum lead elegível hoje. Importe uma planilha ou confira os filtros.'
        : `${itens.length} lead(s) no lote de hoje.`,
  };
}

export async function acaoAprovarLote(): Promise<Resposta> {
  const userId = await exigirSessao();
  const lote = await aprovarLote();
  await auditar(userId, 'lote_aprovado_ui', { loteId: lote.id });
  revalidatePath('/rodolfo/barney');
  revalidatePath('/rodolfo');
  return { ok: true, mensagem: 'Lote aprovado. O worker começa a drenar na próxima janela.' };
}

export async function acaoCancelarLote(): Promise<Resposta> {
  const userId = await exigirSessao();
  await cancelarLote();
  await auditar(userId, 'lote_cancelado_ui');
  revalidatePath('/rodolfo/barney');
  revalidatePath('/rodolfo');
  return { ok: true, mensagem: 'Lote cancelado. Nada mais sai hoje.' };
}

/** "Enviar agora" — os 10 primeiros do número, um a um. */
export async function acaoEnviarAgora(leadId?: string): Promise<Resposta> {
  const userId = await exigirSessao();
  const r = await dispararProximo({ manual: true, leadId });
  await auditar(userId, 'envio_manual', { leadId, enviou: r.enviou, motivo: r.motivo });
  revalidatePath('/rodolfo/barney');
  revalidatePath('/rodolfo');

  if (!r.enviou) return { ok: false, mensagem: r.motivo ?? 'Não enviou.' };
  return {
    ok: true,
    mensagem: r.simulado
      ? `${r.toque} SIMULADO (dry-run: Evolution não configurada). Nada foi para a rede.`
      : `${r.toque} enviado.`,
  };
}

/**
 * Dry-run do lote inteiro: percorre tudo e não toca na Evolution.
 *
 * Grava no outbox como AGENDADA para o Rodolfo poder ler cada mensagem exatamente
 * como sairia — conferir o texto renderizado é o objetivo, não só contar quantos.
 */
export async function acaoDryRun(): Promise<Resposta> {
  const userId = await exigirSessao();

  // Limpa a simulação anterior antes de refazer. Sem isto, o segundo dry-run do
  // dia devolveria "0 simuladas" — as chaves `dry:` já existiriam — e pareceria
  // que o lote esvaziou. Apaga só simulação: a chave real nunca tem o prefixo.
  await prisma.message.deleteMany({
    where: { dedupKey: { startsWith: PREFIXO_DRY_RUN }, status: 'AGENDADA' },
  });

  let n = 0;
  let ultimoMotivo = '';
  // Teto de 30 é o máximo absoluto do dia; o laço para sozinho antes disso
  // quando não houver mais elegível.
  for (let i = 0; i < 30; i += 1) {
    const r = await dispararProximo({ manual: true, dryRun: true });
    if (!r.enviou) {
      ultimoMotivo = r.motivo ?? '';
      break;
    }
    n += 1;
  }

  await auditar(userId, 'dry_run', { simulados: n, parou: ultimoMotivo });
  revalidatePath('/rodolfo/barney');

  return {
    ok: true,
    mensagem:
      `${n} mensagem(ns) simulada(s). Zero chamadas à Evolution.` +
      (ultimoMotivo ? ` Parou em: ${ultimoMotivo}` : ''),
  };
}

export async function acaoSalvarConfig(_anterior: unknown, form: FormData): Promise<Resposta> {
  const userId = await exigirSessao();

  const num = (chave: string): number | undefined => {
    const v = form.get(chave);
    if (v == null || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const dias = form.getAll('diaSemana').map(Number).filter(Number.isFinite);

  const pedida: Partial<ConfigBarney> = {
    disparoAtivo: form.get('disparoAtivo') === 'on',
    modoAprovacao: form.get('modoAprovacao') === 'on',
    maxPorDia: num('maxPorDia'),
    maxPorHora: num('maxPorHora'),
    intervaloMinS: num('intervaloMinS'),
    intervaloMaxS: num('intervaloMaxS'),
    janela: {
      diasSemana: dias.length ? dias : [1, 2, 3, 4, 5],
      horaInicio: num('horaInicio') ?? 10,
      horaFim: num('horaFim') ?? 18,
    },
  };

  // `salvarConfig` aperta contra os tetos rígidos. O que voltar é a verdade —
  // por isso a mensagem devolve os valores efetivos, não os pedidos.
  const efetiva = await salvarConfig(pedida);
  await auditar(userId, 'config_salva', { efetiva: efetiva as unknown as Record<string, unknown> });
  revalidatePath('/rodolfo/config');
  revalidatePath('/rodolfo');

  return {
    ok: true,
    mensagem:
      `Salvo. Em vigor: ${efetiva.maxPorDia}/dia · ${efetiva.maxPorHora}/hora · ` +
      `${efetiva.janela.horaInicio}h–${efetiva.janela.horaFim}h · ` +
      `disparo ${efetiva.disparoAtivo ? 'LIGADO' : 'desligado'}.`,
  };
}

/**
 * Responder um lead pelo Inbox.
 *
 * A resposta ao lead é SEMPRE humana — o portal só sugere o rascunho. Por isso
 * esta ação recebe o texto que o Rodolfo leu e (se quis) editou, e nunca envia
 * o rascunho sozinha.
 *
 * Passa pelo `WhatsAppService` como qualquer outra saída: mesmo sendo resposta a
 * quem escreveu primeiro, ela conta contra os tetos do número.
 */
export async function acaoResponder(leadId: string, texto: string): Promise<Resposta> {
  const userId = await exigirSessao();

  const corpo = texto.trim();
  if (!corpo) return { ok: false, mensagem: 'Escreva a resposta antes de enviar.' };

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead?.telefoneNormalizado) return { ok: false, mensagem: 'Lead sem telefone.' };

  const saiu = await prisma.optOut.findUnique({
    where: { telefoneNormalizado: lead.telefoneNormalizado },
  });
  if (saiu) return { ok: false, mensagem: 'Este contato pediu para sair. Não dá para responder.' };

  const service = criarWhatsAppService();
  const r = await service.sendText({
    to: lead.telefoneNormalizado,
    text: corpo,
    // Chave por lead + minuto: permite várias respostas ao longo do dia sem
    // deixar o duplo clique mandar a mesma mensagem duas vezes.
    dedupKey: `resposta:${leadId}:${agoraSP().toFormat('yyyy-LL-dd-HH-mm')}`,
    kind: 'RESPOSTA_MANUAL',
    leadId,
    manual: true,
    // Sem `toque`: o validador de template não se aplica a texto que o Rodolfo
    // escreveu e leu. As regras de template existem para o disparo em série.
  });

  await auditar(userId, 'resposta_manual', { leadId, enviou: r.ok });

  if (!r.ok) return { ok: false, mensagem: r.motivo ?? 'Não enviou.' };

  await prisma.leadEvent.create({
    data: { leadId, tipo: 'resposta_enviada', descricao: corpo.slice(0, 400) },
  });

  revalidatePath('/rodolfo/inbox');
  return {
    ok: true,
    mensagem: r.simulado ? 'SIMULADO (Evolution não configurada).' : 'Resposta enviada.',
  };
}

export async function acaoImportarJson(_anterior: unknown, form: FormData): Promise<Resposta> {
  const userId = await exigirSessao();

  const lote = String(form.get('lote') ?? '').trim();
  const bruto = String(form.get('linhas') ?? '').trim();
  if (!lote) return { ok: false, mensagem: 'Dê um nome ao lote.' };
  if (!bruto) return { ok: false, mensagem: 'Cole o JSON exportado pelo ledsflowfoods.' };

  let linhas: LinhaPlanilha[];
  try {
    const j = JSON.parse(bruto);
    linhas = Array.isArray(j) ? j : (j.linhas ?? []);
    if (!Array.isArray(linhas) || linhas.length === 0) throw new Error('vazio');
  } catch {
    return { ok: false, mensagem: 'JSON inválido. Esperado um array de linhas da planilha.' };
  }

  const rel = await importarLote(linhas, { lote, somenteCelular: true });
  await auditar(userId, 'import_ui', { lote, total: rel.total });
  revalidatePath('/rodolfo/leads');
  revalidatePath('/rodolfo');

  return {
    ok: true,
    mensagem:
      `${rel.total} linha(s): ${rel.novos} novo(s), ${rel.atualizados} atualizado(s), ` +
      `${rel.bloqueadosConflito} conflito(s) Bibi, ${rel.bloqueadosOptOut} opt-out, ` +
      `${rel.semTelefone} sem celular, ${rel.invalidos} inválida(s).`,
  };
}
