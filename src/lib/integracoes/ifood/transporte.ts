/**
 * Cliente iFood (INT-1.3) — o transporte HTTP, separado para os testes trocarem por um servidor simulado (nenhum teste chama o
 * iFood de verdade). Tempo máximo por chamada; cabeçalhos da resposta em minúsculas.
 */

export interface PedidoHttp {
  url: string;
  metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  cabecalhos: Record<string, string>;
  corpo?: string;
  tempoMaximoMs: number;
}

export interface RespostaHttp {
  status: number;
  cabecalhos: Record<string, string>;
  corpo: string;
}

export type Transporte = (pedido: PedidoHttp) => Promise<RespostaHttp>;

export class FalhaDeRede extends Error {
  constructor(public readonly motivo: 'tempo-esgotado' | 'rede') {
    super(motivo === 'tempo-esgotado' ? 'O iFood não respondeu a tempo.' : 'Falha de rede ao chamar o iFood.');
    this.name = 'FalhaDeRede';
  }
}

export const transporteFetch: Transporte = async (p) => {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), p.tempoMaximoMs);
  try {
    const r = await fetch(p.url, { method: p.metodo, headers: p.cabecalhos, body: p.corpo, signal: controle.signal, redirect: 'error' });
    const cabecalhos: Record<string, string> = {};
    r.headers.forEach((v, k) => {
      cabecalhos[k.toLowerCase()] = v;
    });
    return { status: r.status, cabecalhos, corpo: await r.text() };
  } catch (e) {
    throw new FalhaDeRede(controle.signal.aborted ? 'tempo-esgotado' : 'rede');
  } finally {
    clearTimeout(relogio);
  }
};
