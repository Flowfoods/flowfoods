/**
 * Transporte real da Evolution API.
 *
 * A única implementação que toca a rede. O `WhatsAppService` conversa com a
 * interface `TransporteEvolution`, então trocar por mock (teste) ou por nada
 * (dry-run) não muda uma linha da lógica de tetos.
 */

import type { TransporteEvolution } from './service';

export class EvolutionIndisponivelError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'EvolutionIndisponivelError';
  }
}

interface OpcoesEvolution {
  baseUrl?: string;
  apiKey?: string;
  instancia?: string;
  timeoutMs?: number;
}

export class TransporteEvolutionHttp implements TransporteEvolution {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly instancia: string;
  private readonly timeoutMs: number;

  constructor(opts: OpcoesEvolution = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.EVOLUTION_API_URL ?? '').replace(/\/+$/, '');
    this.apiKey = opts.apiKey ?? process.env.EVOLUTION_API_KEY ?? '';
    this.instancia = opts.instancia ?? process.env.EVOLUTION_INSTANCE ?? 'flowfoods-prospeccao';
    this.timeoutMs = opts.timeoutMs ?? 20_000;
  }

  get configurado(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  async enviarTexto({ to, text }: { to: string; text: string }): Promise<{ messageId: string }> {
    if (!this.configurado) {
      throw new EvolutionIndisponivelError(
        'EVOLUTION_API_URL/EVOLUTION_API_KEY ausentes. Configure no Dokploy.',
      );
    }

    // Timeout explícito: sem ele, uma Evolution pendurada seguraria o worker e a
    // fila do dia inteiro pararia sem nenhum erro aparecer.
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), this.timeoutMs);

    try {
      const r = await fetch(`${this.baseUrl}/message/sendText/${this.instancia}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: this.apiKey },
        body: JSON.stringify({ number: to, text }),
        signal: ac.signal,
      });

      const corpo = await r.text();
      if (!r.ok) {
        throw new EvolutionIndisponivelError(`Evolution ${r.status}: ${corpo.slice(0, 300)}`);
      }

      const json = corpo ? (JSON.parse(corpo) as Record<string, unknown>) : {};
      const chave = json.key as { id?: string } | undefined;
      const messageId = chave?.id ?? (json.id as string | undefined);

      if (!messageId) {
        // Sem id não há como casar o status que volta pelo webhook. Falhar aqui
        // é melhor que gravar ENVIADA e nunca conseguir confirmar entrega.
        throw new EvolutionIndisponivelError(
          `Evolution respondeu 200 sem id de mensagem: ${corpo.slice(0, 200)}`,
        );
      }

      return { messageId };
    } finally {
      clearTimeout(t);
    }
  }

  /**
   * Número pareado na instância (E.164 sem "+"), do `ownerJid`.
   *
   * `null` quando a instância não está pareada ou a Evolution não respondeu —
   * quem chama trata `null` como "não sei", nunca como "são diferentes".
   */
  async numeroDaInstancia(): Promise<string | null> {
    if (!this.configurado) return null;
    try {
      const r = await fetch(
        `${this.baseUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(this.instancia)}`,
        { headers: { apikey: this.apiKey } },
      );
      if (!r.ok) return null;

      // A Evolution devolve ora um array, ora um objeto, dependendo da versão.
      const json = (await r.json()) as unknown;
      const primeiro = Array.isArray(json) ? json[0] : json;
      const registro = (primeiro ?? {}) as Record<string, unknown>;
      const instancia = (registro.instance ?? registro) as Record<string, unknown>;

      const jid = (instancia.ownerJid ?? instancia.owner ?? instancia.wuid) as string | undefined;
      if (!jid) return null;

      const digitos = String(jid).split('@')[0].replace(/\D/g, '');
      return digitos || null;
    } catch {
      return null;
    }
  }

  /** Estado da instância, para o stop-loss e para `/rodolfo/config`. */
  async estadoInstancia(): Promise<string> {
    if (!this.configurado) return 'close';
    try {
      const r = await fetch(`${this.baseUrl}/instance/connectionState/${this.instancia}`, {
        headers: { apikey: this.apiKey },
      });
      if (!r.ok) return 'close';
      const json = (await r.json()) as { instance?: { state?: string }; state?: string };
      return json.instance?.state ?? json.state ?? 'close';
    } catch {
      return 'close';
    }
  }
}
