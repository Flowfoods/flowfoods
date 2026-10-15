/**
 * ERP 0.3 — login das pessoas dos parceiros, sem banco: senha, token do link,
 * limite de tentativas, IP, WebAuthn (opções e cerimônia completa com
 * autenticador sintético, criptografia de verdade) e a separação das sessões
 * no middleware.
 */
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  CUSTO_BCRYPT,
  LIMITE_DE_TENTATIVAS,
  conferirSenhaNova,
  excedeuLimite,
  formNovoAcesso,
  gerarToken,
  hashDoToken,
  ipDaRequisicao,
  normalizarEmail,
  rotuloDoAparelho,
  tokenTemFormato,
} from '@/lib/erp/acesso';
import {
  configDoRosto,
  desafioDaResposta,
  opcoesDeEntrada,
  opcoesDeRegistro,
  rostoPossivel,
  usuarioDaResposta,
  verificarEntrada,
  verificarRegistro,
} from '@/lib/erp/rosto';
import { COOKIE_DO_ERP, COOKIE_DO_ERP_SEGURO, nomeDoCookie } from '@/lib/erp/sessao-cookie';
import { podeAtivarRosto } from '@/lib/erp/credenciais';
import { ErroDeTenant } from '@/lib/erp/modelos';
import { prisma } from '@/lib/db';
import middleware from '@/middleware';
import { criarAutenticador } from './erp-autenticador-sintetico';

const cabecalhos = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });

describe('ERP 0.3 · senha, token e limite (puro)', () => {
  it('senha: mínimo, máximo do bcrypt, repetição, e-mail e confirmação', () => {
    expect(conferirSenhaNova('curta', 'curta')).toMatch(/pelo menos 10/);
    expect(conferirSenhaNova('a'.repeat(73), 'a'.repeat(73))).toMatch(/longa demais/);
    expect(conferirSenhaNova('aaaaaaaaaaaa', 'aaaaaaaaaaaa')).toMatch(/fácil demais/);
    expect(conferirSenhaNova('maria@casa.com', 'maria@casa.com', 'maria@casa.com')).toMatch(/e-mail/);
    expect(conferirSenhaNova('cozinha limpa 10', 'cozinha limpa 11')).toMatch(/iguais/);
    expect(conferirSenhaNova('cozinha limpa 10', 'cozinha limpa 10', 'maria@casa.com')).toBeNull();
  });

  it('bcrypt com custo >= 10 e comparação certa/errada', async () => {
    expect(CUSTO_BCRYPT).toBeGreaterThanOrEqual(10);
    const h = await bcrypt.hash('cozinha limpa 10', CUSTO_BCRYPT);
    expect(bcrypt.getRounds(h)).toBe(CUSTO_BCRYPT);
    expect(await bcrypt.compare('cozinha limpa 10', h)).toBe(true);
    expect(await bcrypt.compare('cozinha limpa 11', h)).toBe(false);
  });

  it('token: 32 bytes aleatórios em base64url; o banco guarda só o SHA-256', () => {
    const a = gerarToken();
    const b = gerarToken();
    expect(a).not.toBe(b);
    expect(Buffer.from(a, 'base64url')).toHaveLength(32);
    expect(tokenTemFormato(a)).toBe(true);
    expect(tokenTemFormato(a.slice(1))).toBe(false);
    expect(tokenTemFormato('../../etc')).toBe(false);
    expect(hashDoToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDoToken(a)).toBe(hashDoToken(a));
    expect(hashDoToken(a)).not.toContain(a);
  });

  it('e-mail normalizado e formulário de acesso', () => {
    expect(normalizarEmail('  Maria@Casa.COM ')).toBe('maria@casa.com');
    expect(normalizarEmail('sem-arroba')).toBeNull();
    const r = formNovoAcesso.safeParse({ nome: '  Maria   Souza ', email: 'MARIA@casa.com' });
    expect(r.success && r.data).toEqual({ nome: 'Maria Souza', email: 'maria@casa.com' });
    expect(formNovoAcesso.safeParse({ nome: 'M', email: 'x' }).success).toBe(false);
  });

  it('limite: 5 falhas por e-mail OU 20 por IP bloqueiam', () => {
    expect(excedeuLimite(LIMITE_DE_TENTATIVAS.porEmail - 1, 0)).toBe(false);
    expect(excedeuLimite(LIMITE_DE_TENTATIVAS.porEmail, 0)).toBe(true);
    expect(excedeuLimite(0, LIMITE_DE_TENTATIVAS.porIp - 1)).toBe(false);
    expect(excedeuLimite(0, LIMITE_DE_TENTATIVAS.porIp)).toBe(true);
  });

  it('IP: X-Real-Ip do proxy; senão o ÚLTIMO do X-Forwarded-For (o primeiro o cliente inventa)', () => {
    expect(ipDaRequisicao(cabecalhos({ 'x-real-ip': '200.1.1.1', 'x-forwarded-for': '1.1.1.1' }))).toBe('200.1.1.1');
    expect(ipDaRequisicao(cabecalhos({ 'x-forwarded-for': '6.6.6.6, 200.2.2.2' }))).toBe('200.2.2.2');
    expect(ipDaRequisicao(cabecalhos({}))).toBe('desconhecido');
  });

  it('rótulo do aparelho pelo user-agent', () => {
    expect(rotuloDoAparelho('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('iPhone');
    expect(rotuloDoAparelho('Mozilla/5.0 (Linux; Android 15; Pixel) Mobile')).toBe('Celular Android');
    expect(rotuloDoAparelho(null)).toBe('Aparelho');
  });

  it('ativar o rosto só logo depois de entrar com a senha', () => {
    const agora = new Date('2026-10-15T12:00:00Z');
    expect(podeAtivarRosto({ metodo: 'SENHA', criadaEm: new Date(agora.getTime() - 5 * 60_000) }, agora)).toBe(true);
    expect(podeAtivarRosto({ metodo: 'SENHA', criadaEm: new Date(agora.getTime() - 31 * 60_000) }, agora)).toBe(false);
    expect(podeAtivarRosto({ metodo: 'ROSTO', criadaEm: agora }, agora)).toBe(false);
  });
});

describe('ERP 0.3 · rosto (WebAuthn) — config e opções', () => {
  it('config: env próprio, senão NEXTAUTH_URL; domínio tem que casar com o endereço', () => {
    expect(configDoRosto({ NEXTAUTH_URL: 'https://consultoriaflowfoods.com.br/' })).toMatchObject({
      rpID: 'consultoriaflowfoods.com.br',
      origin: 'https://consultoriaflowfoods.com.br',
    });
    expect(
      configDoRosto({
        ERP_WEBAUTHN_ORIGIN: 'https://portal.consultoriaflowfoods.com.br',
        ERP_WEBAUTHN_RP_ID: 'consultoriaflowfoods.com.br',
        NEXTAUTH_URL: 'http://outro',
      }),
    ).toMatchObject({ rpID: 'consultoriaflowfoods.com.br', origin: 'https://portal.consultoriaflowfoods.com.br' });
    expect(() => configDoRosto({ ERP_WEBAUTHN_ORIGIN: 'https://a.com', ERP_WEBAUTHN_RP_ID: 'b.com' })).toThrow(/domínio/);
    expect(rostoPossivel(configDoRosto({ NEXTAUTH_URL: 'http://localhost:3100' }))).toBe(true);
    expect(rostoPossivel(configDoRosto({ NEXTAUTH_URL: 'http://76.13.230.78:3000' }))).toBe(false);
  });

  const cfg = configDoRosto({ NEXTAUTH_URL: 'http://localhost:3100' });

  it('registro: verificação do usuário e chave residente OBRIGATÓRIAS, sem atestado, sem repetir aparelho', async () => {
    const o = await opcoesDeRegistro(cfg, { id: 'usr_1', email: 'maria@casa.com', nome: 'Maria' }, [
      { credencialId: 'AAAA', transportes: ['internal'] },
    ]);
    expect(o.rp).toEqual({ id: 'localhost', name: 'FlowFoods ERP' });
    expect(o.user.name).toBe('maria@casa.com');
    expect(Buffer.from(o.user.id, 'base64url').toString()).toBe('usr_1');
    expect(o.authenticatorSelection).toMatchObject({ userVerification: 'required', residentKey: 'required', requireResidentKey: true });
    expect(o.attestation).toBe('none');
    expect(o.excludeCredentials?.map((c) => c.id)).toEqual(['AAAA']);
    expect(Buffer.from(o.challenge, 'base64url').length).toBeGreaterThanOrEqual(32);
  });

  it('entrada: sem lista de chaves (o aparelho oferece a dele) e verificação obrigatória; desafio novo a cada vez', async () => {
    const a = await opcoesDeEntrada(cfg);
    const b = await opcoesDeEntrada(cfg);
    expect(a.userVerification).toBe('required');
    expect(a.allowCredentials ?? []).toEqual([]);
    expect(a.rpId).toBe('localhost');
    expect(a.challenge).not.toBe(b.challenge);
  });

  it('desafio lido da resposta; lixo vira null', () => {
    const cd = Buffer.from(JSON.stringify({ challenge: 'abcdefghijklmnopqrstuvwxyz012345' })).toString('base64url');
    expect(desafioDaResposta({ response: { clientDataJSON: cd } })).toBe('abcdefghijklmnopqrstuvwxyz012345');
    expect(desafioDaResposta({ response: { clientDataJSON: 'nao-e-json' } })).toBeNull();
    expect(desafioDaResposta(null)).toBeNull();
  });
});

describe('ERP 0.3 · rosto — cerimônia completa com autenticador sintético (criptografia real)', () => {
  const cfg = configDoRosto({ NEXTAUTH_URL: 'http://localhost:3100' });

  async function registrado() {
    const aut = criarAutenticador({ rpID: cfg.rpID, origin: cfg.origin, userHandle: 'usr_1' });
    const o = await opcoesDeRegistro(cfg, { id: 'usr_1', email: 'm@c.com', nome: 'M' }, []);
    const r = await verificarRegistro(cfg, aut.registrar(o.challenge), o.challenge);
    if (!r.ok) throw new Error(r.motivo);
    return { aut, guardada: { credencialId: r.credencialId, chavePublica: r.chavePublica, contador: r.contador, transportes: r.transportes } };
  }

  it('registra e entra; o servidor guarda só a chave pública', async () => {
    const { aut, guardada } = await registrado();
    expect(guardada.credencialId).toBe(aut.credencialId);
    expect(guardada.chavePublica.length).toBeGreaterThan(60);
    const o = await opcoesDeEntrada(cfg);
    const resp = aut.entrar(o.challenge);
    expect(usuarioDaResposta(resp)).toBe('usr_1');
    expect(await verificarEntrada(cfg, resp, o.challenge, guardada)).toEqual({ ok: true, novoContador: 1 });
  });

  it('recusa registro sem verificação do usuário, com outro desafio ou de outra origem', async () => {
    const aut = criarAutenticador({ rpID: cfg.rpID, origin: cfg.origin, userHandle: 'u' });
    const o = await opcoesDeRegistro(cfg, { id: 'u', email: 'm@c.com', nome: 'M' }, []);
    expect((await verificarRegistro(cfg, aut.registrar(o.challenge, { uv: false }), o.challenge)).ok).toBe(false);
    expect((await verificarRegistro(cfg, aut.registrar('outro-desafio-qualquer-1234'), o.challenge)).ok).toBe(false);
    expect((await verificarRegistro(cfg, aut.registrar(o.challenge, { origin: 'https://golpe.com' }), o.challenge)).ok).toBe(false);
  });

  it('recusa entrada sem verificação, com desafio trocado, assinatura de outra chave, outra origem ou contador que não sobe', async () => {
    const { aut, guardada } = await registrado();
    const d = (await opcoesDeEntrada(cfg)).challenge;
    expect((await verificarEntrada(cfg, aut.entrar(d, { uv: false }), d, guardada)).ok).toBe(false);
    expect((await verificarEntrada(cfg, aut.entrar(d), 'desafio-que-nao-foi-assinado-xx', guardada)).ok).toBe(false);
    expect((await verificarEntrada(cfg, aut.entrar(d, { assinaturaErrada: true }), d, guardada)).ok).toBe(false);
    expect((await verificarEntrada(cfg, aut.entrar(d, { origin: 'https://golpe.com' }), d, guardada)).ok).toBe(false);
    // Contador guardado em 7: resposta com 7 (repetida/clonada) é recusada; 8 passa.
    const com7 = { ...guardada, contador: 7 };
    expect((await verificarEntrada(cfg, aut.entrar(d, { contador: 7 }), d, com7)).ok).toBe(false);
    expect(await verificarEntrada(cfg, aut.entrar(d, { contador: 8 }), d, com7)).toEqual({ ok: true, novoContador: 8 });
  });
});

describe('ERP 0.3 · sessões separadas (middleware) e portal travado', () => {
  process.env.NEXTAUTH_SECRET ||= 'segredo-de-teste-do-middleware';
  const evento = {} as Parameters<typeof middleware>[1];
  const pedir = async (caminho: string, cookie?: string) => {
    const req = new NextRequest(new URL(caminho, 'http://localhost:3100'), {
      headers: cookie ? { cookie } : undefined,
    });
    return (await middleware(req, evento)) as Response;
  };
  const destino = (r: Response) => new URL(r.headers.get('location') ?? 'http://x/', 'http://localhost:3100').pathname;

  it('cookie da sessão do parceiro NÃO abre o /rodolfo', async () => {
    const r = await pedir('/rodolfo/erp', `${COOKIE_DO_ERP}=${gerarToken()}`);
    expect(r.status).toBeGreaterThanOrEqual(300);
    expect(r.status).toBeLessThan(400);
    expect(r.headers.get('x-middleware-next')).toBeNull();
    // O next-auth manda para o login dele (/api/auth/signin → /rodolfo/login).
    expect(['/api/auth/signin', '/rodolfo/login']).toContain(destino(r));
  });

  it('/erp sem o cookie próprio volta para /entrar — o cookie do next-auth (/rodolfo) não serve', async () => {
    expect(destino(await pedir('/erp'))).toBe('/entrar');
    expect(destino(await pedir('/erp/acesso', 'next-auth.session-token=qualquer-jwt'))).toBe('/entrar');
  });

  it('/erp com o cookie próprio segue para a página (que valida no banco); /entrar é público', async () => {
    expect((await pedir('/erp', `${COOKIE_DO_ERP}=${gerarToken()}`)).headers.get('x-middleware-next')).toBe('1');
    expect((await pedir('/erp', `${COOKIE_DO_ERP_SEGURO}=${gerarToken()}`)).headers.get('x-middleware-next')).toBe('1');
    expect((await pedir('/entrar')).headers.get('x-middleware-next')).toBe('1');
    expect((await pedir('/entrar/primeiro-acesso/abc')).headers.get('x-middleware-next')).toBe('1');
  });

  it('nome do cookie: __Host- em https', () => {
    expect(nomeDoCookie({ NEXTAUTH_URL: 'https://consultoriaflowfoods.com.br' })).toBe(COOKIE_DO_ERP_SEGURO);
    expect(nomeDoCookie({ NEXTAUTH_URL: 'http://localhost:3100' })).toBe(COOKIE_DO_ERP);
  });

  it('o prisma do portal recusa as credenciais antes de ir ao banco', async () => {
    await expect(prisma.usuarioErp.findMany()).rejects.toThrow(ErroDeTenant);
    await expect(prisma.sessaoErp.findFirst()).rejects.toThrow(ErroDeTenant);
    await expect(prisma.passkeyErp.count()).rejects.toThrow(ErroDeTenant);
    await expect(prisma.parceiroFlow.findMany({ include: { erpAcessos: true } })).rejects.toThrow(ErroDeTenant);
  });
});
