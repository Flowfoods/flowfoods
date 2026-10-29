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
  constructor(public readonly motivo: 'tempo-esgotado' | 'rede' | 'grande-demais') {
    super(motivo === 'tempo-esgotado' ? 'O iFood não respondeu a tempo.' : motivo === 'grande-demais' ? 'A resposta do iFood passou do tamanho aceito.' : 'Falha de rede ao chamar o iFood.');
    this.name = 'FalhaDeRede';
  }
}

/** Tamanho máximo do corpo de uma resposta (decisão 487): uma página de 500 grupos do Analytics fica muito abaixo disto. */
export const CORPO_MAXIMO_BYTES = 10 * 1024 * 1024;

/** Lê o corpo até o teto; passou, para de ler e recusa (nunca guarda uma resposta sem fim na memória). */
async function lerCorpo(r: Response, teto: number): Promise<string> {
  const declarado = Number(r.headers.get('content-length') ?? '');
  if (Number.isFinite(declarado) && declarado > teto) throw new FalhaDeRede('grande-demais');
  if (!r.body) return '';
  const leitor = r.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > teto) {
      await leitor.cancel().catch(() => {});
      throw new FalhaDeRede('grande-demais');
    }
    partes.push(value);
  }
  return Buffer.concat(partes.map((p) => Buffer.from(p))).toString('utf8');
}

export const transporteFetch: Transporte = async (p) => {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), p.tempoMaximoMs);
  try {
    // Redirecionamento é recusado: credencial e token não seguem para outro endereço.
    const r = await fetch(p.url, { method: p.metodo, headers: p.cabecalhos, body: p.corpo, signal: controle.signal, redirect: 'error' });
    const cabecalhos: Record<string, string> = {};
    r.headers.forEach((v, k) => {
      cabecalhos[k.toLowerCase()] = v;
    });
    return { status: r.status, cabecalhos, corpo: await lerCorpo(r, CORPO_MAXIMO_BYTES) };
  } catch (e) {
    if (e instanceof FalhaDeRede) throw e;
    throw new FalhaDeRede(controle.signal.aborted ? 'tempo-esgotado' : 'rede');
  } finally {
    clearTimeout(relogio);
  }
};
