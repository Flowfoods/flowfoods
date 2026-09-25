/**
 * Aviso no WhatsApp do Rodolfo quando o cliente clica em "Enviar".
 *
 * Diferente da notificação do Barney, este aviso NÃO é suprimido quando a
 * instância é o próprio número do Rodolfo: lá o aviso repetia uma resposta que
 * já estava no aparelho; aqui ele é a única forma de saber que o formulário
 * chegou. Mensagem para si mesmo aparece no chat "Você" do WhatsApp.
 *
 * Também não passa pelos tetos da prospecção: é uma mensagem por envio de
 * formulário, para o próprio dono do número — não é disparo.
 */

import { normalizarTelefone } from '@/lib/barney/telefone';
import { ROTULO_MARCACAO, MARCACOES } from './questionario';
import type { Progresso } from './progresso';

export function montarAviso(params: {
  cliente: string;
  progresso: Progresso;
  linkPainel: string;
}): string {
  const { cliente, progresso: p, linkPainel } = params;
  const marcacoes = MARCACOES.filter((m) => p.porMarcacao[m] > 0)
    .map((m) => `${ROTULO_MARCACAO[m]}: ${p.porMarcacao[m]}`)
    .join(' · ');

  return [
    `Portal FlowFoods: ${cliente} enviou o formulário.`,
    '',
    `Recebidos: ${p.recebidos} de ${p.total}`,
    `Marcados: ${p.marcados}${marcacoes ? ` (${marcacoes})` : ''}`,
    `Pendentes: ${p.pendentes}`,
    '',
    `Painel: ${linkPainel}`,
  ].join('\n');
}

export interface ResultadoAviso {
  ok: boolean;
  motivo?: string;
}

export async function enviarAviso(texto: string): Promise<ResultadoAviso> {
  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  const instancia = process.env.EVOLUTION_NOTIFY_INSTANCE || process.env.EVOLUTION_INSTANCE;
  const destino = normalizarTelefone(process.env.RODOLFO_WHATSAPP).e164;

  if (!url || !key) return { ok: false, motivo: 'EVOLUTION_API_URL/EVOLUTION_API_KEY ausentes no Dokploy.' };
  if (!instancia) return { ok: false, motivo: 'EVOLUTION_INSTANCE ausente no Dokploy.' };
  if (!destino) return { ok: false, motivo: 'RODOLFO_WHATSAPP ausente ou inválido.' };

  // Sem timeout, uma Evolution pendurada seguraria o "Enviar" da cliente.
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 15_000);
  try {
    const r = await fetch(`${url.replace(/\/+$/, '')}/message/sendText/${instancia}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify({ number: destino, text: texto }),
      signal: ac.signal,
    });
    if (!r.ok) {
      const corpo = await r.text().catch(() => '');
      return { ok: false, motivo: `Evolution ${r.status}: ${corpo.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
}
