/**
 * Cliente iFood (INT-1.3, decisão 485) — o token do app (OAuth2 client_credentials, app centralizado).
 *
 * Contrato (skill iFood v3, referência Authentication, e plano de execução): POST /authentication/v1.0/oauth/token com
 * `Content-Type: application/x-www-form-urlencoded` e campos camelCase `grantType=client_credentials`, `clientId`,
 * `clientSecret`; resposta `accessToken`, `type`, `expiresIn` (segundos); app centralizado não recebe refresh token; token de
 * até 8.000 caracteres; a rota aceita 100 pedidos por minuto.
 *
 * Regras:
 *  - um token por app, guardado cifrado (cofre da INT-1.2) e em memória; renova 10 minutos antes de vencer;
 *  - renovação coordenada: uma por vez no processo (mesma promessa para quem pedir junto) e entre processos (trava do banco no
 *    armazém), relendo o guardado depois de pegar a trava — nunca um token por chamada;
 *  - credencial recusada (400/401 na rota do token) para com erro claro, sem tentar de novo nem trocar de app;
 *  - nada de segredo ou token em erro, log ou retorno além do token para quem chama.
 */

import { baseDaApiIfood, chaveDeCifragem, cifrar, decifrar, ErroDeCofre, lerSegredo } from '../core/cofre';
import type { Limitador } from './limitador';
import { classificar, esperaDoBackoff, lerRetryAfter } from './respostas';
import { FalhaDeRede, type Transporte } from './transporte';

export interface AppParaToken {
  id: string;
  ambiente: 'TEST' | 'PRODUCAO';
  clientId: string;
  nomeDoSegredo: string;
}

export interface TokenGuardado {
  tokenCifrado: string;
  emitidoEm: Date;
  expiraEm: Date;
}

/** Onde o token cifrado mora (o banco, em produção) e a trava entre processos. */
export interface ArmazemDeToken {
  ler(appId: string): Promise<TokenGuardado | null>;
  gravar(appId: string, t: TokenGuardado): Promise<void>;
  apagar(appId: string): Promise<void>;
  comTrava<T>(appId: string, f: () => Promise<T>): Promise<T>;
}

export class ErroDeAutenticacao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroDeAutenticacao';
  }
}

export const MARGEM_DE_RENOVACAO_MS = 10 * 60 * 1000;
const TOKEN_MAXIMO = 8000;
const TENTATIVAS_DO_TOKEN = 3;

const contextoDoToken = (appId: string) => `integracao-token:${appId}`;

export interface OpcoesDoServicoDeToken {
  armazem: ArmazemDeToken;
  transporte: Transporte;
  limitador: Limitador;
  env?: Readonly<Record<string, string | undefined>>;
  relogio?: () => number;
  dormir?: (ms: number) => Promise<void>;
  aleatorio?: () => number;
  tempoMaximoMs?: number;
}

export class ServicoDeToken {
  private memoria = new Map<string, { token: string; expiraEm: number }>();
  private emAndamento = new Map<string, Promise<string>>();
  private readonly relogio: () => number;
  private readonly dormir: (ms: number) => Promise<void>;

  constructor(private readonly o: OpcoesDoServicoDeToken) {
    this.relogio = o.relogio ?? Date.now;
    this.dormir = o.dormir ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private valido(expiraEm: number): boolean {
    return expiraEm - MARGEM_DE_RENOVACAO_MS > this.relogio();
  }

  /** O token válido do app: da memória, do armazém ou um novo (coordenado). */
  token(app: AppParaToken): Promise<string> {
    const m = this.memoria.get(app.id);
    if (m && this.valido(m.expiraEm)) return Promise.resolve(m.token);
    const ja = this.emAndamento.get(app.id);
    if (ja) return ja;
    const p = this.obter(app).finally(() => this.emAndamento.delete(app.id));
    this.emAndamento.set(app.id, p);
    return p;
  }

  /** Esquece o token (ex.: o iFood respondeu 401): o próximo pedido busca outro, uma vez. */
  async invalidar(app: AppParaToken): Promise<void> {
    this.memoria.delete(app.id);
    await this.o.armazem.apagar(app.id);
  }

  private lerGuardado(app: AppParaToken, g: TokenGuardado | null): string | null {
    if (!g || !this.valido(g.expiraEm.getTime())) return null;
    try {
      const token = decifrar(g.tokenCifrado, contextoDoToken(app.id), chaveDeCifragem(this.o.env));
      this.memoria.set(app.id, { token, expiraEm: g.expiraEm.getTime() });
      return token;
    } catch (e) {
      if (e instanceof ErroDeCofre && /INTEGRACAO_CHAVE_CIFRAGEM/.test(e.message)) throw e;
      // Chave trocada ou texto mexido: o guardado não serve; busca outro.
      return null;
    }
  }

  private async obter(app: AppParaToken): Promise<string> {
    const doArmazem = this.lerGuardado(app, await this.o.armazem.ler(app.id));
    if (doArmazem) return doArmazem;
    return this.o.armazem.comTrava(app.id, async () => {
      // Outro processo pode ter renovado enquanto esperávamos a trava.
      const relido = this.lerGuardado(app, await this.o.armazem.ler(app.id));
      if (relido) return relido;
      const novo = await this.pedirAoIfood(app);
      const emitidoEm = new Date(this.relogio());
      const expiraEm = new Date(emitidoEm.getTime() + novo.expiresIn * 1000);
      await this.o.armazem.gravar(app.id, { tokenCifrado: cifrar(novo.accessToken, contextoDoToken(app.id), chaveDeCifragem(this.o.env)), emitidoEm, expiraEm });
      this.memoria.set(app.id, { token: novo.accessToken, expiraEm: expiraEm.getTime() });
      return novo.accessToken;
    });
  }

  private async pedirAoIfood(app: AppParaToken): Promise<{ accessToken: string; expiresIn: number }> {
    const segredo = lerSegredo(app.nomeDoSegredo, this.o.env);
    const corpo = new URLSearchParams({ grantType: 'client_credentials', clientId: app.clientId, clientSecret: segredo }).toString();
    const url = `${baseDaApiIfood(this.o.env)}/authentication/v1.0/oauth/token`;
    for (let tentativa = 1; tentativa <= TENTATIVAS_DO_TOKEN; tentativa++) {
      await this.o.limitador.esperarVez('autenticacao');
      let r;
      try {
        r = await this.o.transporte({
          url,
          metodo: 'POST',
          cabecalhos: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          corpo,
          tempoMaximoMs: this.o.tempoMaximoMs ?? 20_000,
        });
      } catch (e) {
        if (!(e instanceof FalhaDeRede) || tentativa === TENTATIVAS_DO_TOKEN) throw new ErroDeAutenticacao('Não consegui falar com o iFood para pedir o token.');
        await this.dormir(esperaDoBackoff(tentativa + 1, this.o.aleatorio));
        continue;
      }
      const c = classificar(r.status, r.cabecalhos, r.corpo, this.relogio());
      if (c.tipo === 'ok') {
        let j: unknown;
        try {
          j = JSON.parse(r.corpo);
        } catch {
          throw new ErroDeAutenticacao('O iFood respondeu o token num formato inesperado.');
        }
        const t = j as { accessToken?: unknown; expiresIn?: unknown };
        if (typeof t.accessToken !== 'string' || t.accessToken.length === 0 || t.accessToken.length > TOKEN_MAXIMO) throw new ErroDeAutenticacao('O iFood respondeu sem um token válido.');
        if (typeof t.expiresIn !== 'number' || !Number.isFinite(t.expiresIn) || t.expiresIn <= 0) throw new ErroDeAutenticacao('O iFood respondeu sem a validade do token.');
        return { accessToken: t.accessToken, expiresIn: t.expiresIn };
      }
      if (c.tipo === 'nao-autenticado' || c.tipo === 'requisicao-invalida' || c.tipo === 'sem-permissao') {
        throw new ErroDeAutenticacao(`O iFood recusou a credencial do app (HTTP ${r.status}). Confira o Client ID do app e o segredo em ${app.nomeDoSegredo}; nada foi repetido.`);
      }
      if ((c.tipo === 'limite' || c.tipo === 'indisponivel') && tentativa < TENTATIVAS_DO_TOKEN) {
        const espera = c.tipo === 'limite' ? (lerRetryAfter(r.cabecalhos['retry-after'], this.relogio()) ?? esperaDoBackoff(tentativa + 1, this.o.aleatorio)) : esperaDoBackoff(tentativa + 1, this.o.aleatorio);
        await this.dormir(espera);
        continue;
      }
      throw new ErroDeAutenticacao(`O iFood não entregou o token (HTTP ${r.status}).`);
    }
    throw new ErroDeAutenticacao('O iFood não entregou o token.');
  }
}

/** Armazém em memória (testes e comandos de um processo só): trava por app numa fila de promessas. */
export function armazemEmMemoria(): ArmazemDeToken & { dados: Map<string, TokenGuardado> } {
  const dados = new Map<string, TokenGuardado>();
  const travas = new Map<string, Promise<unknown>>();
  return {
    dados,
    async ler(appId) {
      return dados.get(appId) ?? null;
    },
    async gravar(appId, t) {
      dados.set(appId, t);
    },
    async apagar(appId) {
      dados.delete(appId);
    },
    comTrava(appId, f) {
      const anterior = travas.get(appId) ?? Promise.resolve();
      const minha = anterior.then(f, f);
      travas.set(appId, minha.catch(() => {}));
      return minha;
    },
  };
}
