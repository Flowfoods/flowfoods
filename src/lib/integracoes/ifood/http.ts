/**
 * Cliente iFood (INT-1.3, decisão 485) — toda chamada às APIs do iFood passa por aqui:
 *  - token do app pelo serviço coordenado (`auth.ts`), nunca um por chamada;
 *  - limitador por família de rota; espera crescente com sorteio; Retry-After respeitado;
 *  - 401 → um token novo e uma nova tentativa; 403 e 400 → não repete (quem chamou pausa o módulo ou corrige o pedido);
 *  - cabeçalho de homologação só no TEST, decidido pelo ambiente do app (`core/ambiente.ts`) e conferido antes de enviar;
 *  - o registro de cada chamada leva método, caminho, status, tentativa, duração e requestId — nunca token, segredo ou corpo.
 * Nenhum teste chama o iFood: o transporte é trocado por um servidor simulado. A primeira chamada real é a leitura TEST da
 * INT-1.4, por comando no servidor.
 */

import { cabecalhosDoAmbiente, conferirCabecalhos } from '../core/ambiente';
import { baseDaApiIfood } from '../core/cofre';
import { ErroDeAutenticacao, type AppParaToken, type ServicoDeToken } from './auth';
import type { Familia, Limitador } from './limitador';
import { classificar, esperaDoBackoff, FRASE_DA_CLASSIFICACAO, repetivel, type Classificacao } from './respostas';
import { FalhaDeRede, type Transporte } from './transporte';

export interface ChamadaIfood {
  metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Caminho a partir da raiz da API, começando por "/" (ex.: "/merchant/v1.0/merchants"). Sem domínio, sem credencial. */
  caminho: string;
  familia: Familia;
  consulta?: Record<string, string>;
  corpo?: unknown;
}

export type ResultadoIfood<T> =
  | { ok: true; status: number; dados: T; requestId: string | null; tentativas: number }
  | { ok: false; status: number | null; classificacao: Classificacao; frase: string; requestId: string | null; tentativas: number };

export interface RegistroDeChamada {
  appId: string;
  ambiente: 'TEST' | 'PRODUCAO';
  metodo: string;
  caminho: string;
  status: number | null;
  tipo: Classificacao['tipo'] | 'falha-de-rede';
  tentativa: number;
  duracaoMs: number;
  requestId: string | null;
}

export interface OpcoesDoCliente {
  app: AppParaToken;
  tokens: ServicoDeToken;
  limitador: Limitador;
  transporte: Transporte;
  env?: Readonly<Record<string, string | undefined>>;
  relogio?: () => number;
  dormir?: (ms: number) => Promise<void>;
  aleatorio?: () => number;
  registrar?: (r: RegistroDeChamada) => void;
  maxTentativas?: number;
  tempoMaximoMs?: number;
}

/** Tira de qualquer texto o que parece token ou segredo (para mensagens de erro de terceiros). */
export function semSegredo(texto: string): string {
  return texto
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [oculto]')
    .replace(/(clientSecret|client_secret|accessToken|access_token)=([^&\s"]+)/gi, '$1=[oculto]')
    .replace(/("(?:clientSecret|accessToken|access_token|client_secret)"\s*:\s*")[^"]*"/gi, '$1[oculto]"');
}

const CAMINHO = /^\/[A-Za-z0-9._~\-/:]*$/;

export function criarClienteIfood(o: OpcoesDoCliente) {
  const relogio = o.relogio ?? Date.now;
  const dormir = o.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const max = Math.min(Math.max(o.maxTentativas ?? 4, 1), 6);

  async function chamar<T = unknown>(c: ChamadaIfood): Promise<ResultadoIfood<T>> {
    if (!CAMINHO.test(c.caminho) || c.caminho.includes('//') || c.caminho.includes('..')) throw new Error('Caminho de chamada inválido.');
    const base = baseDaApiIfood(o.env);
    const qs = c.consulta && Object.keys(c.consulta).length ? `?${new URLSearchParams(c.consulta).toString()}` : '';
    const url = `${base}${c.caminho}${qs}`;
    const corpo = c.corpo === undefined ? undefined : JSON.stringify(c.corpo);
    let renovouToken = false;
    let ultimo: { status: number | null; classificacao: Classificacao; requestId: string | null } = { status: null, classificacao: { tipo: 'indisponivel' }, requestId: null };

    let feitas = 0;
    for (let tentativa = 1; tentativa <= max; tentativa++) {
      feitas = tentativa;
      await o.limitador.esperarVez(c.familia);
      let token: string;
      try {
        token = await o.tokens.token(o.app);
      } catch (e) {
        if (e instanceof ErroDeAutenticacao) {
          return { ok: false, status: null, classificacao: { tipo: 'nao-autenticado' }, frase: e.message, requestId: null, tentativas: tentativa };
        }
        throw e;
      }
      const cabecalhos: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...cabecalhosDoAmbiente(o.app.ambiente),
        ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      };
      conferirCabecalhos(o.app.ambiente, cabecalhos);
      const inicio = relogio();
      let r;
      try {
        r = await o.transporte({ url, metodo: c.metodo, cabecalhos, corpo, tempoMaximoMs: o.tempoMaximoMs ?? 20_000 });
      } catch (e) {
        if (!(e instanceof FalhaDeRede)) throw e;
        o.registrar?.({ appId: o.app.id, ambiente: o.app.ambiente, metodo: c.metodo, caminho: c.caminho, status: null, tipo: 'falha-de-rede', tentativa, duracaoMs: relogio() - inicio, requestId: null });
        ultimo = { status: null, classificacao: { tipo: 'indisponivel' }, requestId: null };
        if (tentativa < max) await dormir(esperaDoBackoff(tentativa + 1, o.aleatorio));
        continue;
      }
      const requestId = r.cabecalhos['x-request-id'] ?? r.cabecalhos['x-trace-id'] ?? null;
      const cl = classificar(r.status, r.cabecalhos, r.corpo, relogio());
      o.registrar?.({ appId: o.app.id, ambiente: o.app.ambiente, metodo: c.metodo, caminho: c.caminho, status: r.status, tipo: cl.tipo, tentativa, duracaoMs: relogio() - inicio, requestId });
      if (cl.tipo === 'ok') {
        let dados: T;
        try {
          dados = (r.corpo ? JSON.parse(r.corpo) : null) as T;
        } catch {
          return { ok: false, status: r.status, classificacao: { tipo: 'inesperado' }, frase: 'O iFood respondeu num formato inesperado.', requestId, tentativas: tentativa };
        }
        return { ok: true, status: r.status, dados, requestId, tentativas: tentativa };
      }
      ultimo = { status: r.status, classificacao: cl, requestId };
      if (cl.tipo === 'nao-autenticado' && !renovouToken) {
        // Um token novo, uma vez só (a marca `renovouToken` limita): essa volta não conta como tentativa.
        renovouToken = true;
        await o.tokens.invalidar(o.app);
        tentativa--;
        continue;
      }
      if (!repetivel(cl) || tentativa === max) break;
      const espera = cl.tipo === 'limite' && cl.esperarMs !== null ? cl.esperarMs : esperaDoBackoff(tentativa + 1, o.aleatorio);
      await dormir(espera);
    }
    return { ok: false, status: ultimo.status, classificacao: ultimo.classificacao, frase: FRASE_DA_CLASSIFICACAO[ultimo.classificacao.tipo], requestId: ultimo.requestId, tentativas: feitas };
  }

  return { chamar, app: o.app };
}
