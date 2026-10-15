/**
 * "Entrar com o rosto" — WebAuthn (passkey) com verificação do usuário
 * OBRIGATÓRIA. No celular isso é o Face ID, o reconhecimento facial ou a
 * digital do próprio aparelho: quem confere o rosto é o aparelho. O servidor
 * nunca recebe, nunca guarda e nunca pede imagem de rosto (LGPD: dado
 * biométrico sensível); recebe só uma assinatura e guarda só a chave pública.
 *
 * Funções puras sobre `@simplewebauthn/server`: config, opções e verificação.
 * O desafio (guardar, usar uma vez, expirar) e a gravação ficam em
 * `credenciais.ts`.
 */

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';

export type { AuthenticationResponseJSON, RegistrationResponseJSON };

export interface ConfigDoRosto {
  /** Domínio a que a chave fica presa (ex.: consultoriaflowfoods.com.br). */
  rpID: string;
  /** Endereço exato de onde a página roda (ex.: https://consultoriaflowfoods.com.br). */
  origin: string;
  rpName: string;
}

type Ambiente = Record<string, string | undefined>;

/**
 * `ERP_WEBAUTHN_ORIGIN` e `ERP_WEBAUTHN_RP_ID`; sem elas, o NEXTAUTH_URL (o
 * mesmo endereço do site). O domínio tem que ser o do endereço ou um "pai"
 * dele, senão nenhum aparelho aceita: erro de configuração estoura aqui.
 */
export function configDoRosto(env: Ambiente = process.env): ConfigDoRosto {
  const bruto = env.ERP_WEBAUTHN_ORIGIN?.trim() || env.NEXTAUTH_URL?.trim() || 'http://localhost:3000';
  let url: URL;
  try {
    url = new URL(bruto);
  } catch {
    throw new Error(`ERP_WEBAUTHN_ORIGIN/NEXTAUTH_URL inválido: ${bruto}`);
  }
  const origin = url.origin;
  const rpID = (env.ERP_WEBAUTHN_RP_ID?.trim() || url.hostname).toLowerCase();
  const host = url.hostname.toLowerCase();
  if (host !== rpID && !host.endsWith(`.${rpID}`)) {
    throw new Error(`ERP_WEBAUTHN_RP_ID (${rpID}) precisa ser o domínio de ${origin} ou um domínio acima dele.`);
  }
  return { rpID, origin, rpName: 'FlowFoods ERP' };
}

/** O rosto só funciona em página segura (https) ou no localhost. */
export function rostoPossivel(cfg: ConfigDoRosto): boolean {
  return cfg.origin.startsWith('https://') || /^http:\/\/localhost(:\d+)?$/.test(cfg.origin);
}

const TEMPO_MS = 60_000;

export interface PasskeyGuardada {
  credencialId: string;
  chavePublica: Uint8Array;
  contador: number;
  transportes: string[];
}

/** Opções para "Ativar entrada por rosto neste aparelho". */
export function opcoesDeRegistro(
  cfg: ConfigDoRosto,
  usuario: { id: string; email: string; nome: string },
  existentes: { credencialId: string; transportes: string[] }[],
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  return generateRegistrationOptions({
    rpName: cfg.rpName,
    rpID: cfg.rpID,
    userName: usuario.email,
    userDisplayName: usuario.nome,
    // O aparelho devolve isto no login (userHandle): é como sabemos quem é.
    userID: new TextEncoder().encode(usuario.id),
    timeout: TEMPO_MS,
    attestationType: 'none',
    excludeCredentials: existentes.map((p) => ({
      id: p.credencialId,
      transports: p.transportes as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: {
      // Chave guardada no aparelho (dá para entrar sem digitar o e-mail) e
      // verificação da pessoa sempre (rosto, digital ou senha do aparelho).
      residentKey: 'required',
      requireResidentKey: true,
      userVerification: 'required',
    },
    preferredAuthenticatorType: 'localDevice',
  });
}

/** Opções para "Entrar com o rosto": sem e-mail, o aparelho oferece a chave dele. */
export function opcoesDeEntrada(cfg: ConfigDoRosto): Promise<PublicKeyCredentialRequestOptionsJSON> {
  return generateAuthenticationOptions({
    rpID: cfg.rpID,
    userVerification: 'required',
    allowCredentials: [],
    timeout: TEMPO_MS,
  });
}

function base64urlParaTexto(v: string): string | null {
  try {
    return Buffer.from(v, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

/** O desafio que o navegador assinou (para achar e consumir o guardado). */
export function desafioDaResposta(resposta: { response?: { clientDataJSON?: unknown } } | null | undefined): string | null {
  const bruto = resposta?.response?.clientDataJSON;
  if (typeof bruto !== 'string' || bruto.length > 4096) return null;
  const texto = base64urlParaTexto(bruto);
  if (!texto) return null;
  try {
    const c = JSON.parse(texto) as { challenge?: unknown };
    return typeof c.challenge === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(c.challenge) ? c.challenge : null;
  } catch {
    return null;
  }
}

/** Id do usuário que o aparelho devolveu no login (o `userID` do registro). */
export function usuarioDaResposta(resposta: AuthenticationResponseJSON): string | null {
  const h = resposta.response?.userHandle;
  if (!h) return null;
  return base64urlParaTexto(h);
}

export type RegistroVerificado =
  | {
      ok: true;
      credencialId: string;
      chavePublica: Uint8Array;
      contador: number;
      transportes: string[];
      sincronizada: boolean;
    }
  | { ok: false; motivo: string };

export async function verificarRegistro(
  cfg: ConfigDoRosto,
  resposta: RegistrationResponseJSON,
  desafioEsperado: string,
): Promise<RegistroVerificado> {
  try {
    const v = await verifyRegistrationResponse({
      response: resposta,
      expectedChallenge: desafioEsperado,
      expectedOrigin: cfg.origin,
      expectedRPID: cfg.rpID,
      requireUserVerification: true,
    });
    if (!v.verified) return { ok: false, motivo: 'nao_verificado' };
    const { credential, credentialBackedUp, userVerified } = v.registrationInfo;
    if (!userVerified) return { ok: false, motivo: 'sem_verificacao_do_usuario' };
    return {
      ok: true,
      credencialId: credential.id,
      chavePublica: credential.publicKey,
      contador: credential.counter,
      transportes: (credential.transports ?? resposta.response.transports ?? []).map(String),
      sincronizada: credentialBackedUp,
    };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message.slice(0, 160) : 'erro' };
  }
}

export type EntradaVerificada = { ok: true; novoContador: number } | { ok: false; motivo: string };

/**
 * Confere assinatura, desafio, origem, domínio, verificação do usuário e o
 * contador (a lib recusa contador que não sobe, quando o aparelho usa contador).
 */
export async function verificarEntrada(
  cfg: ConfigDoRosto,
  resposta: AuthenticationResponseJSON,
  desafioEsperado: string,
  passkey: PasskeyGuardada,
): Promise<EntradaVerificada> {
  try {
    const v = await verifyAuthenticationResponse({
      response: resposta,
      expectedChallenge: desafioEsperado,
      expectedOrigin: cfg.origin,
      expectedRPID: cfg.rpID,
      requireUserVerification: true,
      credential: {
        id: passkey.credencialId,
        publicKey: new Uint8Array(passkey.chavePublica),
        counter: passkey.contador,
        transports: passkey.transportes as AuthenticatorTransportFuture[],
      },
    });
    if (!v.verified || !v.authenticationInfo.userVerified) return { ok: false, motivo: 'nao_verificado' };
    return { ok: true, novoContador: v.authenticationInfo.newCounter };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message.slice(0, 160) : 'erro' };
  }
}
