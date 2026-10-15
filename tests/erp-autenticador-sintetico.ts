/**
 * Autenticador WebAuthn SINTÉTICO para teste: chave EC P-256 de verdade,
 * attestation "none", authenticatorData montado byte a byte e assinatura ECDSA
 * real. Faz o papel do Face ID: o servidor verifica a criptografia de verdade,
 * sem mock da lib. Nada de imagem — como no aparelho real.
 */
import { createHash, createSign, generateKeyPairSync, randomBytes, type KeyObject } from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';

const b64 = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');

const UP = 0x01;
const UV = 0x04;
const AT = 0x40;

export interface Autenticador {
  credencialId: string;
  contador: number;
  registrar(desafio: string, opcoes?: { uv?: boolean; origin?: string }): RegistrationResponseJSON;
  entrar(
    desafio: string,
    opcoes?: { uv?: boolean; origin?: string; contador?: number; userHandle?: string | null; assinaturaErrada?: boolean },
  ): AuthenticationResponseJSON;
}

export function criarAutenticador(cfg: { rpID: string; origin: string; userHandle: string }): Autenticador {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const cose = new Map<number, number | Uint8Array>([
    [1, 2], // kty: EC2
    [3, -7], // alg: ES256
    [-1, 1], // crv: P-256
    [-2, new Uint8Array(Buffer.from(jwk.x, 'base64url'))],
    [-3, new Uint8Array(Buffer.from(jwk.y, 'base64url'))],
  ]);
  const credId = randomBytes(16);
  const rpHash = createHash('sha256').update(cfg.rpID).digest();

  function authData(flags: number, contador: number, comCredencial: boolean): Buffer {
    const c = Buffer.alloc(4);
    c.writeUInt32BE(contador);
    const partes = [rpHash, Buffer.from([flags]), c];
    if (comCredencial) {
      const tam = Buffer.alloc(2);
      tam.writeUInt16BE(credId.length);
      partes.push(Buffer.alloc(16), tam, credId, Buffer.from(isoCBOR.encode(cose)));
    }
    return Buffer.concat(partes);
  }

  function clientData(tipo: string, desafio: string, origin: string) {
    return Buffer.from(JSON.stringify({ type: tipo, challenge: desafio, origin, crossOrigin: false }));
  }

  function assinar(chave: KeyObject, dados: Buffer) {
    return createSign('SHA256').update(dados).sign(chave);
  }

  const a: Autenticador = {
    credencialId: b64(credId),
    contador: 0,
    registrar(desafio, o = {}) {
      const flags = UP | AT | (o.uv === false ? 0 : UV);
      const att = isoCBOR.encode(
        new Map<string, string | Map<string, string> | Uint8Array>([
          ['fmt', 'none'],
          ['attStmt', new Map<string, string>()],
          ['authData', new Uint8Array(authData(flags, 0, true))],
        ]),
      );
      return {
        id: b64(credId),
        rawId: b64(credId),
        type: 'public-key',
        response: {
          clientDataJSON: b64(clientData('webauthn.create', desafio, o.origin ?? cfg.origin)),
          attestationObject: b64(att),
          transports: ['internal'],
        },
        clientExtensionResults: {},
        authenticatorAttachment: 'platform',
      };
    },
    entrar(desafio, o = {}) {
      const contador = o.contador ?? ++a.contador;
      const flags = UP | (o.uv === false ? 0 : UV);
      const ad = authData(flags, contador, false);
      const cd = clientData('webauthn.get', desafio, o.origin ?? cfg.origin);
      const alvo = Buffer.concat([ad, createHash('sha256').update(cd).digest()]);
      const chave = o.assinaturaErrada ? generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey : privateKey;
      const handle = o.userHandle === undefined ? cfg.userHandle : o.userHandle;
      return {
        id: b64(credId),
        rawId: b64(credId),
        type: 'public-key',
        response: {
          clientDataJSON: b64(cd),
          authenticatorData: b64(ad),
          signature: b64(assinar(chave, alvo)),
          ...(handle === null ? {} : { userHandle: b64(Buffer.from(handle, 'utf8')) }),
        },
        clientExtensionResults: {},
        authenticatorAttachment: 'platform',
      };
    },
  };
  return a;
}
