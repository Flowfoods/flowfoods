/**
 * Zebra Browser Print (3.4, decisão 409): o aplicativo da Zebra instalado no COMPUTADOR ligado à impressora abre um endereço
 * local (http://localhost:9100, ou https://localhost:9101 quando a página é https). O navegador fala com ele direto; nada
 * passa pelo nosso site. Sem o aplicativo (ou sem impressora nele), a tela diz e oferece o arquivo .zpl e o papel.
 *
 * Os caminhos são os do próprio aplicativo (os mesmos da biblioteca da Zebra, sem copiá-la para o repositório):
 * - GET  {base}/default?type=printer → a impressora padrão (JSON) ou vazio;
 * - GET  {base}/available            → { printer: [...] };
 * - POST {base}/write                → { device, data } em texto (sem pré-consulta de CORS).
 *
 * "Enviada" quer dizer que o aplicativo aceitou o trabalho, não que saiu no papel: a tela pede para conferir. Na primeira vez em
 * https, o Chrome pede licença para o site falar com a rede local e o certificado de https://localhost:9101 precisa ser aceito
 * (a aba Impressora explica).
 */

export interface DispositivoZebra {
  uid: string;
  name: string;
  connection?: string;
  deviceType?: string;
  provider?: string;
  manufacturer?: string;
  version?: number;
}

export type Deteccao =
  | { estado: 'sem-aplicativo' }
  | { estado: 'sem-impressora' }
  | { estado: 'pronta'; impressora: DispositivoZebra; fonte: 'escolhida' | 'padrao' };

export function baseDoBrowserPrint(protocolo: string): string {
  return protocolo === 'https:' ? 'https://localhost:9101' : 'http://localhost:9100';
}

/** O que este computador guarda (só nele): a impressora escolhida e a resolução. */
export interface PreferenciaDaImpressora {
  uid: string | null;
  nome: string | null;
  resolucao: 203 | 300;
}

const CHAVE = 'ff-etiquetas-impressora';

export function lerPreferencia(): PreferenciaDaImpressora {
  try {
    const bruto = globalThis.localStorage?.getItem(CHAVE);
    if (!bruto) return { uid: null, nome: null, resolucao: 203 };
    const v = JSON.parse(bruto) as Partial<PreferenciaDaImpressora>;
    return {
      uid: typeof v.uid === 'string' && v.uid.length <= 300 ? v.uid : null,
      nome: typeof v.nome === 'string' && v.nome.length <= 200 ? v.nome : null,
      resolucao: v.resolucao === 300 ? 300 : 203,
    };
  } catch {
    return { uid: null, nome: null, resolucao: 203 };
  }
}

export function gravarPreferencia(p: PreferenciaDaImpressora): boolean {
  try {
    globalThis.localStorage?.setItem(CHAVE, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

async function pedir(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controle.signal, cache: 'no-store' });
  } finally {
    clearTimeout(relogio);
  }
}

function dispositivo(v: unknown): DispositivoZebra | null {
  if (!v || typeof v !== 'object') return null;
  const d = v as Record<string, unknown>;
  if (typeof d.uid !== 'string' || !d.uid || typeof d.name !== 'string') return null;
  return {
    uid: d.uid,
    name: d.name,
    connection: typeof d.connection === 'string' ? d.connection : undefined,
    deviceType: typeof d.deviceType === 'string' ? d.deviceType : undefined,
    provider: typeof d.provider === 'string' ? d.provider : undefined,
    manufacturer: typeof d.manufacturer === 'string' ? d.manufacturer : undefined,
    version: typeof d.version === 'number' ? d.version : undefined,
  };
}

/** As impressoras que o aplicativo enxerga; null = o aplicativo não respondeu. */
export async function impressorasDisponiveis(base: string, ms = 4000): Promise<DispositivoZebra[] | null> {
  try {
    const r = await pedir(`${base}/available`, { method: 'GET' }, ms);
    if (!r.ok) return null;
    const texto = await r.text();
    if (!texto.trim()) return [];
    const v = JSON.parse(texto) as { printer?: unknown };
    return Array.isArray(v.printer) ? v.printer.map(dispositivo).filter((d): d is DispositivoZebra => d !== null) : [];
  } catch {
    return null;
  }
}

/** Acha a impressora: a escolhida neste computador (se o aplicativo ainda a vê) ou a padrão do aplicativo. */
export async function detectar(base: string, uidEscolhido: string | null, ms = 3000): Promise<Deteccao> {
  let padrao: DispositivoZebra | null;
  try {
    const r = await pedir(`${base}/default?type=printer`, { method: 'GET' }, ms);
    if (!r.ok) return { estado: 'sem-aplicativo' };
    const texto = await r.text();
    padrao = texto.trim() ? dispositivo(JSON.parse(texto)) : null;
  } catch {
    return { estado: 'sem-aplicativo' };
  }
  if (uidEscolhido) {
    const lista = await impressorasDisponiveis(base, ms);
    const escolhida = lista?.find((d) => d.uid === uidEscolhido);
    if (escolhida) return { estado: 'pronta', impressora: escolhida, fonte: 'escolhida' };
  }
  return padrao ? { estado: 'pronta', impressora: padrao, fonte: 'padrao' } : { estado: 'sem-impressora' };
}

/**
 * O erro que a Zebra devolve (em inglês, cru) em palavras de cozinha (rodada 1, UX 5): sem papel, tampa aberta, fita, pausada,
 * desligada. O que não se reconhece aparece como veio, com "A impressora respondeu:".
 */
export function traduzirErroDaZebra(texto: string): string {
  const t = texto.toLowerCase();
  if (/paper out|media out|out of (paper|media)|no (paper|media)|media empty|paper empty/.test(t)) return 'Acabou o rolo de etiquetas: coloque um rolo novo e mande de novo.';
  if (/head (is )?open|cover open|lid open|printhead open|door open/.test(t)) return 'A tampa da Zebra está aberta: feche até ouvir o clique e mande de novo.';
  if (/ribbon/.test(t)) return 'Problema na fita (ribbon): confira se a fita está colocada e se não acabou.';
  if (/paused|pause/.test(t)) return 'A Zebra está pausada: aperte o botão de pausa (ou desligue e ligue) e mande de novo.';
  if (/head (too )?(hot|cold)|over ?temp|under ?temp|temperature/.test(t)) return 'A cabeça de impressão está quente demais: espere uns minutos e mande de novo.';
  if (/offline|not connected|disconnected|unable to connect|could not connect|not found|no printer/.test(t)) return 'A Zebra não está ligada ou não está conectada a este computador: confira o cabo e a energia.';
  return `A impressora respondeu: ${texto}`;
}

export type ResultadoDoEnvio = { ok: true } | { ok: false; erro: string; semResposta: boolean };

/**
 * Manda o ZPL para a impressora pelo aplicativo. Sem resposta em 15 s NÃO é falha: pode ter saído (rodada 1, UX 6). A tela diz
 * "Sem resposta", o pedido fica "sem resultado" e a pessoa confere o papel ("Já imprimi" ou mandar de novo).
 */
export async function enviarZpl(base: string, impressora: DispositivoZebra, zpl: string, ms = 15000): Promise<ResultadoDoEnvio> {
  try {
    const r = await pedir(
      `${base}/write`,
      { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ device: impressora, data: zpl }) },
      ms,
    );
    if (r.ok) return { ok: true };
    const texto = (await r.text().catch(() => '')).trim().slice(0, 200);
    return { ok: false, semResposta: false, erro: texto ? traduzirErroDaZebra(texto) : `O aplicativo da Zebra recusou o envio (código ${r.status}).` };
  } catch (e) {
    const abortou = e instanceof DOMException && e.name === 'AbortError';
    return abortou
      ? { ok: false, semResposta: true, erro: 'A Zebra não respondeu em 15 segundos. Pode ter saído: confira o papel antes de mandar de novo.' }
      : { ok: false, semResposta: false, erro: 'O aplicativo da Zebra parou de responder: nada foi enviado. Confira se o Browser Print está aberto.' };
  }
}

/** Baixa um texto como arquivo (o .zpl), sem passar pelo site de novo. */
export function baixarArquivo(nome: string, conteudo: string): boolean {
  try {
    const blob = new Blob([conteudo], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    return false;
  }
}
