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
import { aprovarLote, cancelarLote, dispararProximo, FIM_DO_LOTE, salvarProposta } from '@/lib/rodolfo/lote';
import { resumoDaImportacao, rotuloDoToque, textoDaRecusa } from '@/lib/rodolfo/rotulos';
import { JANELA_PADRAO } from '@/lib/barney/regras';
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
  const { itens, mantido } = await salvarProposta();
  if (mantido) return { ok: false, mensagem: 'O lote de hoje já foi aprovado e não muda. Para montar outro, cancele este antes.' };
  await auditar(userId, 'lote_proposto', { quantidade: itens.length });
  revalidatePath('/rodolfo/barney');
  revalidatePath('/rodolfo/hoje');
  return {
    ok: true,
    mensagem:
      itens.length === 0
        ? 'Nenhum lead elegível hoje. Importe uma planilha ou confira os filtros.'
        : itens.length === 1
          ? '1 lead no lote de hoje.'
          : `${itens.length} leads no lote de hoje.`,
  };
}

export async function acaoAprovarLote(): Promise<Resposta> {
  const userId = await exigirSessao();
  const lote = await aprovarLote();
  await auditar(userId, 'lote_aprovado_ui', { loteId: lote.id });
  revalidatePath('/rodolfo/barney');
  revalidatePath('/rodolfo/hoje');
  return { ok: true, mensagem: 'Lote aprovado. Os envios saem um a um, nos dias e horários da janela de envio.' };
}

export async function acaoCancelarLote(): Promise<Resposta> {
  const userId = await exigirSessao();
  await cancelarLote();
  await auditar(userId, 'lote_cancelado_ui');
  revalidatePath('/rodolfo/barney');
  revalidatePath('/rodolfo/hoje');
  return { ok: true, mensagem: 'Lote cancelado. Nada mais sai hoje.' };
}

/** "Enviar o próximo" (Cadência) e "Enviar" do Lead 360 — os 10 primeiros do número saem assim, um a um. */
export async function acaoEnviarAgora(leadId?: string): Promise<Resposta> {
  const userId = await exigirSessao();
  const r = await dispararProximo({ manual: true, leadId });
  await auditar(userId, 'envio_manual', { leadId, enviou: r.enviou, motivo: r.motivo });
  revalidatePath('/rodolfo/barney');
  revalidatePath('/rodolfo/hoje');

  if (!r.enviou) return { ok: false, mensagem: textoDaRecusa(r.motivo) };
  return {
    ok: true,
    mensagem: r.simulado
      ? `${rotuloDoToque(r.toque)} simulada: o WhatsApp da prospecção não está configurado, nada saiu.`
      : `${rotuloDoToque(r.toque)} enviada.`,
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

  // "Nada elegível" é o fim normal da simulação; outro motivo diz onde ela parou antes do fim.
  const parou = ultimoMotivo && ultimoMotivo !== FIM_DO_LOTE ? ` Parou: ${textoDaRecusa(ultimoMotivo)}` : '';
  return {
    ok: true,
    mensagem: `${n === 0 ? 'Nenhuma mensagem simulada' : n === 1 ? '1 mensagem simulada' : `${n} mensagens simuladas`}. Nada foi enviado.${parou}`,
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

  // Só os dias que a tela oferece (segunda a sexta). Um dia de fora não conta como "marcado": sem esta conferência, um POST com
  // só o sábado passava daqui e a janela voltava para segunda a sexta sem aviso.
  const dias = [...new Set(form.getAll('diaSemana').map(Number))].filter((d) => (JANELA_PADRAO.diasSemana as readonly number[]).includes(d));
  // Nenhum dia marcado era salvo como segunda a sexta, sem aviso: o contrário do que a pessoa pediu (E5.1, decisão 466).
  if (dias.length === 0) return { ok: false, mensagem: 'Escolha ao menos um dia da semana. Para parar os envios, desligue o disparo.' };

  // A chave geral não vem mais neste formulário (tem painel e ação próprios, decisão 469): sem a chave em `pedida`, o
  // disparo fica como está. O intervalo vem em minutos e é gravado em segundos.
  const emSegundos = (chave: string) => {
    const m = num(chave);
    return m === undefined ? undefined : Math.round(m * 60);
  };
  const pedida: Partial<ConfigBarney> = {
    modoAprovacao: form.get('modoAprovacao') === 'on',
    maxPorDia: num('maxPorDia'),
    maxPorHora: num('maxPorHora'),
    intervaloMinS: emSegundos('intervaloMinMinutos'),
    intervaloMaxS: emSegundos('intervaloMaxMinutos'),
    janela: {
      diasSemana: dias,
      horaInicio: num('horaInicio') ?? 10,
      horaFim: num('horaFim') ?? 18,
    },
  };

  // `salvarConfig` aperta contra os tetos rígidos. O que voltar é a verdade —
  // por isso a mensagem devolve os valores efetivos, não os pedidos.
  const efetiva = await salvarConfig(pedida);
  await auditar(userId, 'config_salva', { efetiva: efetiva as unknown as Record<string, unknown> });
  revalidatePath('/rodolfo/config');
  revalidatePath('/rodolfo/hoje');

  return {
    ok: true,
    mensagem:
      `Salvo. Valendo agora: até ${efetiva.maxPorDia} por dia e ${efetiva.maxPorHora} por hora, ` +
      `das ${efetiva.janela.horaInicio}h às ${efetiva.janela.horaFim}h; disparo ${efetiva.disparoAtivo ? 'ligado' : 'desligado'}.`,
  };
}

/**
 * A chave geral do disparo, em painel próprio da Config (decisão 469): antes era uma caixa de marcar dentro do formulário
 * que só valia depois de rolar até "Salvar ajustes". Liga ou desliga só a chave; os limites ficam como estão.
 */
export async function acaoLigarDisparo(): Promise<Resposta> {
  return alternarDisparo(true);
}

export async function acaoDesligarDisparo(): Promise<Resposta> {
  return alternarDisparo(false);
}

async function alternarDisparo(ligar: boolean): Promise<Resposta> {
  const userId = await exigirSessao();
  const efetiva = await salvarConfig({ disparoAtivo: ligar });
  await auditar(userId, ligar ? 'disparo_ligado' : 'disparo_desligado', {});
  revalidatePath('/rodolfo/config');
  revalidatePath('/rodolfo/hoje');
  revalidatePath('/rodolfo/barney');
  revalidatePath('/rodolfo');
  return {
    ok: true,
    mensagem: efetiva.disparoAtivo
      ? 'Disparo ligado. Os envios saem do lote aprovado, um a um, dentro dos limites.'
      : 'Disparo desligado. Nada sai, nem à mão, até você ligar de novo.',
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
  if (!lead?.telefoneNormalizado) return { ok: false, mensagem: 'Este lead não tem telefone válido.' };

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

  if (!r.ok) return { ok: false, mensagem: textoDaRecusa(r.motivo) };

  await prisma.leadEvent.create({
    data: { leadId, tipo: 'resposta_enviada', descricao: corpo.slice(0, 400) },
  });

  revalidatePath('/rodolfo/inbox');
  return {
    ok: true,
    mensagem: r.simulado ? 'Resposta simulada: o WhatsApp da prospecção não está configurado, nada saiu.' : 'Resposta enviada.',
  };
}

export async function acaoImportarJson(_anterior: unknown, form: FormData): Promise<Resposta> {
  const userId = await exigirSessao();

  const lote = String(form.get('lote') ?? '').trim();
  const bruto = String(form.get('linhas') ?? '').trim();
  if (!lote) return { ok: false, mensagem: 'Dê um nome ao lote.' };
  if (!bruto) return { ok: false, mensagem: 'Cole o conteúdo exportado pelo ledsflowfoods.' };

  let linhas: LinhaPlanilha[];
  try {
    const j = JSON.parse(bruto);
    linhas = Array.isArray(j) ? j : (j.linhas ?? []);
    if (!Array.isArray(linhas) || linhas.length === 0) throw new Error('vazio');
  } catch {
    return { ok: false, mensagem: 'Não deu para ler o conteúdo colado. Cole exatamente o que o ledsflowfoods exportou (começa com “[”).' };
  }

  const rel = await importarLote(linhas, { lote, somenteCelular: true });
  await auditar(userId, 'import_ui', { lote, total: rel.total });
  revalidatePath('/rodolfo/leads');
  revalidatePath('/rodolfo/hoje');

  return {
    ok: true,
    mensagem: resumoDaImportacao(rel),
  };
}

// --------------------------------------------------------------- Lead 360

/**
 * Registra opt-out à mão.
 *
 * Serve para quando o pedido de saída chega por fora do WhatsApp — ligação,
 * Instagram, um "não me manda mais isso" dito pessoalmente. A trava é a mesma
 * do automático, porque a chave é o TELEFONE.
 */
export async function acaoMarcarOptOut(leadId: string): Promise<Resposta> {
  const userId = await exigirSessao();

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead?.telefoneNormalizado) return { ok: false, mensagem: 'Este lead não tem telefone válido.' };

  await prisma.$transaction([
    prisma.optOut.upsert({
      where: { telefoneNormalizado: lead.telefoneNormalizado },
      create: { telefoneNormalizado: lead.telefoneNormalizado, termo: 'manual', origem: 'MANUAL' },
      update: { origem: 'MANUAL' },
    }),
    prisma.lead.update({ where: { id: leadId }, data: { status: 'OPT_OUT' } }),
    prisma.enrollment.updateMany({
      where: { leadId },
      data: { status: 'OPT_OUT', proximoEnvioEm: null, motivoPausa: 'OPT_OUT manual' },
    }),
    prisma.leadEvent.create({
      data: { leadId, tipo: 'status', descricao: 'Pediu para sair (registrado à mão).' },
    }),
  ]);

  await auditar(userId, 'opt_out_manual', { leadId });
  revalidatePath(`/rodolfo/leads/${leadId}`);
  return { ok: true, mensagem: 'Registrado: pediu para sair. Não entra mais em cadência.' };
}

/**
 * Exclusão por LGPD.
 *
 * Apaga o lead e tudo que pende dele. O que NÃO some é o `OptOut`: ele é
 * chaveado por telefone justamente para sobreviver a isto. Apagar a pessoa e
 * junto o pedido de saída dela faria a próxima importação abordá-la de novo —
 * o oposto de atender ao direito que ela exerceu.
 */
export async function acaoExcluirLead(leadId: string): Promise<Resposta> {
  const userId = await exigirSessao();

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { ok: false, mensagem: 'Lead não encontrado.' };

  // O audit guarda só o telefone e o nome — o suficiente para provar que a
  // exclusão aconteceu, sem recriar o cadastro por dentro do log.
  await auditar(userId, 'lead_excluido_lgpd', {
    telefone: lead.telefoneNormalizado,
    nome: lead.nome,
  });

  await prisma.lead.delete({ where: { id: leadId } });

  revalidatePath('/rodolfo/leads');
  return {
    ok: true,
    mensagem: 'Lead excluído. Se ele pediu para sair, o bloqueio do número continua valendo.',
  };
}

/** Move para a lista de visita presencial / Instagram. */
export async function acaoMarcarVisita(leadId: string): Promise<Resposta> {
  const userId = await exigirSessao();

  await prisma.$transaction([
    prisma.lead.update({ where: { id: leadId }, data: { canal: 'VISITA' } }),
    prisma.enrollment.updateMany({
      where: { leadId, status: 'ATIVA' },
      data: { status: 'PAUSADA_MANUAL', proximoEnvioEm: null, motivoPausa: 'Movido para visita' },
    }),
    prisma.leadEvent.create({
      data: { leadId, tipo: 'status', descricao: 'Movido para Visita e Instagram.' },
    }),
  ]);

  await auditar(userId, 'lead_para_visita', { leadId });
  revalidatePath(`/rodolfo/leads/${leadId}`);
  revalidatePath('/rodolfo/visitas');
  return { ok: true, mensagem: 'Movido para Visita e Instagram. Sai da cadência de WhatsApp.' };
}
