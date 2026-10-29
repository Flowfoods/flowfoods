/**
 * Cliente iFood (INT-1.3, decisões 485 e 487) — o token do app (OAuth2 client_credentials, app centralizado).
 *
 * Contrato (skill iFood v3, referência Authentication, e plano de execução): POST /authentication/v1.0/oauth/token com
 * `Content-Type: application/x-www-form-urlencoded` e campos camelCase `grantType=client_credentials`, `clientId`,
 * `clientSecret`; resposta `accessToken`, `type`, `expiresIn` (segundos); app centralizado não recebe refresh token; token de
 * até 8.000 caracteres; a rota aceita 100 pedidos por minuto.
 *
 * Regras:
 *  - nada sai com a chave geral desligada, nem para app de produção sem homologação (`porQueNaoChamar`, conferido aqui e em
 *    cada chamada do cliente);
 *  - um token por app, guardado cifrado (cofre da INT-1.2) e em memória; renova antes de vencer, com margem de 10 minutos ou
 *    metade da validade, o que for menor (validade curta não vira um pedido por chamada); validade aceita até 24 h;
 *  - renovação coordenada: uma por vez no processo (mesma promessa para quem pedir junto) e entre processos (trava do banco no
 *    armazém, com a leitura e a gravação DENTRO da trava), relendo o guardado depois de pegar a trava — nunca um token por
 *    chamada. O pedido inteiro (tentativas e esperas) cabe num prazo menor que o da trava: o iFood pedir para esperar mais do
 *    que isso para com erro claro, sem segurar a trava;
 *  - um 401 descarta só o token que levou o 401 (se outro processo já renovou, o novo fica): nunca uma tempestade de tokens;
 *  - credencial recusada (400/401/403 na rota do token) para com erro claro, sem tentar de novo nem trocar de app;
 *  - nada de segredo ou token em erro, log ou retorno além do token para quem chama.
 */

import { segredoCombinaComAmbiente } from '../core/campos';
import { baseDaApiIfood, chaveDeCifragem, cifrar, decifrar, ErroDeCofre, integracaoIfoodAtiva, lerSegredo } from '../core/cofre';
import type { Limitador } from './limitador';
import { classificar, esperaDoBackoff, lerRetryAfter } from './respostas';
import { FalhaDeRede, type Transporte } from './transporte';

export type EstadoDeHomologacao = 'NAO_SE_APLICA' | 'PENDENTE' | 'EM_ANDAMENTO' | 'HOMOLOGADO' | 'RECUSADO';

export interface AppParaToken {
  id: string;
  ambiente: 'TEST' | 'PRODUCAO';
  clientId: string;
  nomeDoSegredo: string;
  /** Em PRODUCAO, só o app HOMOLOGADO chama o iFood. */
  homologacao: EstadoDeHomologacao;
}

/** Por que nenhuma chamada pode sair para este app agora (null = pode). */
export function porQueNaoChamar(app: Pick<AppParaToken, 'ambiente' | 'homologacao' | 'nomeDoSegredo'>, env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  if (!integracaoIfoodAtiva(env)) return 'A integração do iFood está desligada (INTEGRACAO_IFOOD_ATIVA): nenhuma chamada sai.';
  // Decisão 489: o segredo combina com o ambiente. Um app de teste cadastrado com o segredo de um app de produção (ou o
  // contrário) não pede token: senão a credencial de produção sairia pelo caminho do TEST, sem o portão da homologação.
  if (!segredoCombinaComAmbiente(app.ambiente, app.nomeDoSegredo)) {
    return `O segredo ${app.nomeDoSegredo} não é de app ${app.ambiente === 'TEST' ? 'de teste' : 'de produção'}: nenhuma chamada sai. Corrija o cadastro do app.`;
  }
  if (app.ambiente === 'PRODUCAO' && app.homologacao !== 'HOMOLOGADO') return 'App de produção ainda não homologado pelo iFood: nenhuma chamada sai.';
  return null;
}

export interface TokenGuardado {
  tokenCifrado: string;
  emitidoEm: Date;
  expiraEm: Date;
}

export interface OperacoesDoArmazem {
  ler(appId: string): Promise<TokenGuardado | null>;
  gravar(appId: string, t: TokenGuardado): Promise<void>;
  apagar(appId: string): Promise<void>;
}

/** Onde o token cifrado mora (o banco, em produção) e a trava entre processos. */
export interface ArmazemDeToken extends OperacoesDoArmazem {
  /** Roda `f` com a trava do app; as operações que `f` recebe ficam dentro dela (no banco, na mesma transação). */
  comTrava<T>(appId: string, f: (a: OperacoesDoArmazem) => Promise<T>): Promise<T>;
}

export class ErroDeAutenticacao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroDeAutenticacao';
  }
}

export const MARGEM_DE_RENOVACAO_MS = 10 * 60 * 1000;
export const VALIDADE_MAXIMA_S = 24 * 60 * 60;
/** O pedido do token inteiro (tentativas e esperas) cabe aqui; a trava no banco dura mais (`armazem-token.ts`). */
export const PRAZO_DO_PEDIDO_DE_TOKEN_MS = 40_000;
const TEMPO_POR_TENTATIVA_MS = 15_000;
const TOKEN_MAXIMO = 8000;
const TENTATIVAS_DO_TOKEN = 3;

const contextoDoToken = (appId: string) => `integracao-token:${appId}`;

/** A margem de renovação: 10 minutos ou metade da validade, o que for menor. */
export function margemDeRenovacao(emitidoEm: number, expiraEm: number): number {
  return Math.min(MARGEM_DE_RENOVACAO_MS, Math.max(0, (expiraEm - emitidoEm) / 2));
}

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

interface TokenNaMemoria {
  token: string;
  emitidoEm: number;
  expiraEm: number;
}

export class ServicoDeToken {
  private memoria = new Map<string, TokenNaMemoria>();
  private emAndamento = new Map<string, Promise<string>>();
  private readonly relogio: () => number;
  private readonly dormir: (ms: number) => Promise<void>;

  constructor(private readonly o: OpcoesDoServicoDeToken) {
    this.relogio = o.relogio ?? Date.now;
    this.dormir = o.dormir ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private valido(emitidoEm: number, expiraEm: number): boolean {
    return expiraEm - margemDeRenovacao(emitidoEm, expiraEm) > this.relogio();
  }

  /** O token válido do app: da memória, do armazém ou um novo (coordenado). */
  token(app: AppParaToken): Promise<string> {
    const recusa = porQueNaoChamar(app, this.o.env ?? process.env);
    if (recusa) return Promise.reject(new ErroDeAutenticacao(recusa));
    const m = this.memoria.get(app.id);
    if (m && this.valido(m.emitidoEm, m.expiraEm)) return Promise.resolve(m.token);
    const ja = this.emAndamento.get(app.id);
    if (ja) return ja;
    const p = this.obter(app).finally(() => this.emAndamento.delete(app.id));
    this.emAndamento.set(app.id, p);
    return p;
  }

  /**
   * Esquece o token. Com `tokenUsado` (o iFood respondeu 401 a ele), só descarta se o guardado ainda for esse: se outro processo
   * ou outra chamada já renovou, o token novo fica. Sem `tokenUsado`, descarta o que houver.
   */
  async invalidar(app: AppParaToken, tokenUsado?: string): Promise<void> {
    if (tokenUsado === undefined) {
      this.memoria.delete(app.id);
      await this.o.armazem.apagar(app.id);
      return;
    }
    if (this.memoria.get(app.id)?.token === tokenUsado) this.memoria.delete(app.id);
    await this.o.armazem.comTrava(app.id, async (a) => {
      const g = await a.ler(app.id);
      if (!g) return;
      let guardado: string | null;
      try {
        guardado = decifrar(g.tokenCifrado, contextoDoToken(app.id), chaveDeCifragem(this.o.env));
      } catch {
        guardado = null;
      }
      if (guardado === null || guardado === tokenUsado) await a.apagar(app.id);
    });
  }

  private lerGuardado(app: AppParaToken, g: TokenGuardado | null): TokenNaMemoria | null {
    if (!g || !this.valido(g.emitidoEm.getTime(), g.expiraEm.getTime())) return null;
    try {
      const token = decifrar(g.tokenCifrado, contextoDoToken(app.id), chaveDeCifragem(this.o.env));
      return { token, emitidoEm: g.emitidoEm.getTime(), expiraEm: g.expiraEm.getTime() };
    } catch (e) {
      if (e instanceof ErroDeCofre && /INTEGRACAO_CHAVE_CIFRAGEM/.test(e.message)) throw e;
      // Chave trocada ou texto mexido: o guardado não serve; busca outro.
      return null;
    }
  }

  private async obter(app: AppParaToken): Promise<string> {
    const doArmazem = this.lerGuardado(app, await this.o.armazem.ler(app.id));
    if (doArmazem) {
      this.memoria.set(app.id, doArmazem);
      return doArmazem.token;
    }
    const novo = await this.o.armazem.comTrava(app.id, async (a) => {
      // Outro processo pode ter renovado enquanto esperávamos a trava.
      const relido = this.lerGuardado(app, await a.ler(app.id));
      if (relido) return relido;
      const r = await this.pedirAoIfood(app);
      const emitidoEm = this.relogio();
      const expiraEm = emitidoEm + Math.min(r.expiresIn, VALIDADE_MAXIMA_S) * 1000;
      await a.gravar(app.id, { tokenCifrado: cifrar(r.accessToken, contextoDoToken(app.id), chaveDeCifragem(this.o.env)), emitidoEm: new Date(emitidoEm), expiraEm: new Date(expiraEm) });
      return { token: r.accessToken, emitidoEm, expiraEm };
    });
    this.memoria.set(app.id, novo);
    return novo.token;
  }

  private async pedirAoIfood(app: AppParaToken): Promise<{ accessToken: string; expiresIn: number }> {
    const recusa = porQueNaoChamar(app, this.o.env ?? process.env);
    if (recusa) throw new ErroDeAutenticacao(recusa);
    const segredo = lerSegredo(app.nomeDoSegredo, this.o.env);
    const corpo = new URLSearchParams({ grantType: 'client_credentials', clientId: app.clientId, clientSecret: segredo }).toString();
    const url = `${baseDaApiIfood(this.o.env)}/authentication/v1.0/oauth/token`;
    const prazo = this.relogio() + PRAZO_DO_PEDIDO_DE_TOKEN_MS;
    for (let tentativa = 1; tentativa <= TENTATIVAS_DO_TOKEN; tentativa++) {
      await this.o.limitador.esperarVez('autenticacao');
      const restante = prazo - this.relogio();
      if (restante < 1000) throw new ErroDeAutenticacao('O iFood não entregou o token dentro do prazo. Tente de novo.');
      let r;
      try {
        r = await this.o.transporte({
          url,
          metodo: 'POST',
          cabecalhos: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          corpo,
          tempoMaximoMs: Math.min(this.o.tempoMaximoMs ?? TEMPO_POR_TENTATIVA_MS, restante),
        });
      } catch (e) {
        if (!(e instanceof FalhaDeRede) || e.motivo === 'grande-demais' || tentativa === TENTATIVAS_DO_TOKEN) throw new ErroDeAutenticacao('Não consegui falar com o iFood para pedir o token.');
        await this.esperarDentroDoPrazo(esperaDoBackoff(tentativa + 1, this.o.aleatorio), prazo, 'O iFood não respondeu ao pedido de token dentro do prazo. Tente de novo.');
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
        const pedida = c.tipo === 'limite' ? lerRetryAfter(r.cabecalhos['retry-after'], this.relogio()) : null;
        const espera = pedida ?? esperaDoBackoff(tentativa + 1, this.o.aleatorio);
        await this.esperarDentroDoPrazo(
          espera,
          prazo,
          c.tipo === 'limite' ? `O iFood pediu para esperar ${Math.ceil(espera / 1000)} s antes de outro token. Nada foi repetido agora; tente de novo depois.` : 'O iFood não respondeu ao pedido de token dentro do prazo. Tente de novo.',
        );
        continue;
      }
      throw new ErroDeAutenticacao(`O iFood não entregou o token (HTTP ${r.status}).`);
    }
    throw new ErroDeAutenticacao('O iFood não entregou o token.');
  }

  /** Espera só se couber no prazo (com a trava presa, não se espera além dele). */
  private async esperarDentroDoPrazo(ms: number, prazo: number, frase: string): Promise<void> {
    if (this.relogio() + ms + 1000 > prazo) throw new ErroDeAutenticacao(frase);
    await this.dormir(ms);
  }
}

/** Armazém em memória (testes e comandos de um processo só): trava por app numa fila de promessas. */
export function armazemEmMemoria(): ArmazemDeToken & { dados: Map<string, TokenGuardado> } {
  const dados = new Map<string, TokenGuardado>();
  const travas = new Map<string, Promise<unknown>>();
  const operacoes: OperacoesDoArmazem = {
    async ler(appId) {
      return dados.get(appId) ?? null;
    },
    async gravar(appId, t) {
      dados.set(appId, t);
    },
    async apagar(appId) {
      dados.delete(appId);
    },
  };
  return {
    dados,
    ...operacoes,
    comTrava(appId, f) {
      const anterior = travas.get(appId) ?? Promise.resolve();
      const minha = anterior.then(
        () => f(operacoes),
        () => f(operacoes),
      );
      travas.set(appId, minha.catch(() => {}));
      return minha;
    },
  };
}
