/** Opt-in de corpo original com transporte em memória; nunca chama a API ou lê configuração real. */
import { describe, expect, it } from 'vitest';
import { armazemEmMemoria, ServicoDeToken, type AppParaToken } from '@/lib/integracoes/ifood/auth';
import { criarClienteIfood, type RegistroDeChamada } from '@/lib/integracoes/ifood/http';
import { Limitador } from '@/lib/integracoes/ifood/limitador';
import type { RespostaHttp, Transporte } from '@/lib/integracoes/ifood/transporte';

const APP: AppParaToken = { id: 'app-local-corpo', clientId: 'cliente-local', ambiente: 'TEST', nomeDoSegredo: 'IFOOD_TEST_CLIENT_SECRET', homologacao: 'NAO_SE_APLICA' };
const ENV = { INTEGRACAO_IFOOD_ATIVA: 'true', INTEGRACAO_CHAVE_CIFRAGEM: 'b'.repeat(64), IFOOD_TEST_CLIENT_SECRET: 'segredo-ficticio-do-corpo' };
const chamada = { metodo: 'GET' as const, caminho: '/merchant/v1.0/merchants', familia: 'merchant' as const };
function montar(corpo: string, status = 200) {
  const registros: RegistroDeChamada[] = [];
  const transporte: Transporte = async (p): Promise<RespostaHttp> => p.url.endsWith('/oauth/token')
    ? { status: 200, cabecalhos: {}, corpo: JSON.stringify({ accessToken: 'token-ficticio-do-corpo', expiresIn: 3600 }) }
    : { status, cabecalhos: { 'x-request-id': 'request-sintetica' }, corpo };
  const limitador = new Limitador();
  const tokens = new ServicoDeToken({ armazem: armazemEmMemoria(), transporte, limitador, env: ENV });
  return { registros, cliente: criarClienteIfood({ app: APP, tokens, limitador, transporte, env: ENV, maxTentativas: 1, registrar: r => registros.push(r) }) };
}

describe('HTTP iFood · corpo original somente por opt-in', () => {
  it.each([undefined, false])('fluxo existente não devolve corpo quando preservarCorpo=%s', async preservarCorpo => {
    const { cliente } = montar('{ "valor": 1000 }');
    const r = await cliente.chamar({ ...chamada, preservarCorpo });
    expect(r).toEqual({ ok: true, status: 200, dados: { valor: 1000 }, requestId: 'request-sintetica', tentativas: 1 });
    expect(r).not.toHaveProperty('corpoOriginal');
  });

  it('opt-in conserva espaços/representação numérica exatos, sem copiar corpo/token/segredo para registro', async () => {
    const original = '{\n  "valor": 1e3, "nome": "ação"\n}\n';
    const { cliente, registros } = montar(original);
    const r = await cliente.chamar({ ...chamada, preservarCorpo: true });
    expect(r).toMatchObject({ ok: true, dados: { valor: 1000, nome: 'ação' }, corpoOriginal: original });
    expect(r.ok && r.corpoOriginal).not.toBe(JSON.stringify({ valor: 1000, nome: 'ação' }));
    expect(registros).toHaveLength(1);
    expect(JSON.stringify(registros)).not.toMatch(/corpoOriginal|"valor"|token-ficticio|segredo-ficticio/);
  });

  it.each([[403, '{"message":"recusado"}'], [200, '{"error":{"code":"negado"}}'], [200, 'JSON inválido']] as const)('falha HTTP/conteúdo %i não devolve corpo mesmo solicitado', async (status, original) => {
    const { cliente } = montar(original, status);
    const r = await cliente.chamar({ ...chamada, preservarCorpo: true });
    expect(r.ok).toBe(false); expect(r).not.toHaveProperty('corpoOriginal');
    expect(JSON.stringify(r)).not.toContain(original);
  });
});
