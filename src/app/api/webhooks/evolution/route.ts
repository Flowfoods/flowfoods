/**
 * POST /api/webhooks/evolution
 *
 * Três eventos:
 *   MESSAGES_UPSERT   → resposta recebida (pausa o enrollment antes de tudo)
 *   MESSAGES_UPDATE   → status de entrega/leitura
 *   CONNECTION_UPDATE → estado da instância; ≠ open dispara stop-loss
 *
 * Sempre responde 200 quando a assinatura confere, mesmo em erro interno: a
 * Evolution reenfileira e reenvia em cima de não-200, e um erro nosso viraria
 * uma tempestade de retentativas em cima de um sistema já com problema. O erro
 * vai para o audit log, não para o status HTTP.
 */

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { DateTime } from 'luxon';
import { prisma } from '@/lib/db';
import { TIMEZONE } from '@/lib/barney/regras';
import { processarResposta } from '@/lib/barney/inbound';
import { acharLeadPorTelefone, portasInbound } from '@/lib/rodolfo/inbound-portas';
import { normalizarTelefone } from '@/lib/barney/telefone';
import { INSTANCIA, agoraSP, registrarEntrega, registrarFalha } from '@/lib/rodolfo/estado';
import { classificarResposta } from '@/lib/rodolfo/ia';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function segredoConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface PayloadEvolution {
  event?: string;
  instance?: string;
  data?: Record<string, unknown>;
}

/** `5521999998888@s.whatsapp.net` → `5521999998888`. */
function telefoneDoRemoteJid(jid: unknown): string {
  return String(jid ?? '').split('@')[0].replace(/\D/g, '');
}

function textoDaMensagem(mensagem: Record<string, unknown> | undefined): string {
  if (!mensagem) return '';
  const conv = mensagem.conversation;
  if (typeof conv === 'string') return conv;
  const estendida = mensagem.extendedTextMessage as { text?: string } | undefined;
  if (estendida?.text) return estendida.text;
  // Áudio, imagem e figurinha chegam sem texto. A resposta ainda conta como
  // resposta (e pausa a cadência) — só não dá para classificar.
  return '';
}

export async function POST(req: Request) {
  const esperado = process.env.EVOLUTION_WEBHOOK_SECRET ?? '';
  if (!esperado) {
    return NextResponse.json({ erro: 'Webhook sem segredo configurado.' }, { status: 503 });
  }

  const recebido =
    req.headers.get('x-webhook-secret') ??
    req.headers.get('apikey') ??
    new URL(req.url).searchParams.get('secret') ??
    '';

  if (!recebido || !segredoConfere(recebido, esperado)) {
    return NextResponse.json({ erro: 'Assinatura inválida.' }, { status: 401 });
  }

  let payload: PayloadEvolution;
  try {
    payload = (await req.json()) as PayloadEvolution;
  } catch {
    return NextResponse.json({ erro: 'JSON inválido.' }, { status: 400 });
  }

  try {
    switch (payload.event) {
      case 'messages.upsert':
      case 'MESSAGES_UPSERT':
        await tratarUpsert(payload);
        break;
      case 'messages.update':
      case 'MESSAGES_UPDATE':
        await tratarUpdate(payload);
        break;
      case 'connection.update':
      case 'CONNECTION_UPDATE':
        await tratarConexao(payload);
        break;
      default:
        // Evento que não interessa não é erro.
        break;
    }
  } catch (e) {
    await prisma.auditLog.create({
      data: {
        evento: 'webhook_evolution_falhou',
        dados: { event: payload.event, erro: e instanceof Error ? e.message : String(e) },
      },
    });
  }

  return NextResponse.json({ ok: true });
}

async function tratarUpsert(payload: PayloadEvolution) {
  const data = payload.data ?? {};
  const chave = data.key as { id?: string; remoteJid?: string; fromMe?: boolean } | undefined;

  // Eco das nossas próprias mensagens: ignorar. Sem isto, cada envio do Barney
  // pausaria a cadência que ele mesmo acabou de executar.
  if (!chave?.id || chave.fromMe) return;

  const digitos = telefoneDoRemoteJid(chave.remoteJid);
  const tel = normalizarTelefone(digitos);
  const telefone = tel.e164 || digitos;
  if (!telefone) return;

  const { leadId, enrollmentId } = await acharLeadPorTelefone(telefone);

  await processarResposta(
    {
      evolutionMessageId: chave.id,
      de: String(chave.remoteJid ?? ''),
      telefoneNormalizado: telefone,
      texto: textoDaMensagem(data.message as Record<string, unknown> | undefined),
      recebidaEm: agoraSP(),
      leadId,
      enrollmentId,
    },
    { ...portasInbound, classificar: classificarResposta },
  );
}

async function tratarUpdate(payload: PayloadEvolution) {
  const data = payload.data ?? {};
  const chave = data.key as { id?: string } | undefined;
  const id = chave?.id ?? (data.id as string | undefined);
  if (!id) return;

  const status = String(data.status ?? '').toUpperCase();

  // `direction: OUT` não é filtro decorativo. As mensagens RECEBIDAS também
  // gravam `evolutionMessageId`, e um MESSAGES_UPDATE de uma delas marcaria a
  // resposta do lead como "entregue" e somaria no contador de entregas do dia —
  // inflando a taxa e cegando justamente o stop-loss que existe para perceber
  // bloqueio silencioso.
  const msg = await prisma.message.findFirst({
    where: { evolutionMessageId: id, direction: 'OUT' },
  });
  if (!msg) return;

  const agora = agoraSP();

  if (status === 'DELIVERY_ACK' || status === 'DELIVERED') {
    // Só conta a primeira confirmação: a Evolution reenvia DELIVERY_ACK e sem
    // esta guarda a taxa de entrega passaria de 100% e o stop-loss ficaria cego.
    if (!msg.entregueEm) {
      await prisma.message.update({
        where: { id: msg.id },
        data: { status: 'ENTREGUE', entregueEm: agora.toJSDate() },
      });
      await registrarEntrega(agora);
    }
    return;
  }

  if (status === 'READ' || status === 'PLAYED') {
    await prisma.message.update({
      where: { id: msg.id },
      data: { status: 'LIDA', lidaEm: msg.lidaEm ?? agora.toJSDate() },
    });
    return;
  }

  if (status === 'ERROR' || status === 'FAILED') {
    await prisma.message.update({
      where: { id: msg.id },
      data: { status: 'FALHA', erro: `Evolution reportou ${status}` },
    });
    await registrarFalha(agora);
  }
}

async function tratarConexao(payload: PayloadEvolution) {
  const estado = String((payload.data ?? {}).state ?? 'close');
  const nome = payload.instance ?? INSTANCIA;

  await prisma.instanceState.upsert({
    where: { nome },
    create: { nome, estado, ultimoCheck: new Date() },
    update: { estado, ultimoCheck: new Date() },
  });

  if (estado !== 'open') {
    await prisma.auditLog.create({
      data: { evento: 'stop_loss_instancia', dados: { nome, estado } },
    });
    await portasInbound.notificar?.(
      `⚠️ Instância ${nome} caiu para "${estado}". Barney pausado até reconectar.`,
    );
  }
}

/** GET só para conferir que a rota está de pé. Não revela nada. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    rota: 'webhooks/evolution',
    aguardando: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
    ts: DateTime.now().setZone(TIMEZONE).toISO(),
  });
}
