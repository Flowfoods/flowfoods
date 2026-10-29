/**
 * INT-1.2 (decisão 484) — cofre e configuração, sem banco e sem rede:
 *  - o segredo é lido pelo nome; a mensagem de falta diz o nome e nunca o valor;
 *  - o token cifrado (AES-256-GCM) volta igual com a mesma chave e o mesmo app; outra chave, outro app ou texto mexido falham;
 *  - a chave de cifragem: 64 hex (o que o compose gera) ou base64 de 32 bytes; o resto é recusado com frase clara;
 *  - chave geral: só "true" liga;
 *  - a API do iFood só em HTTPS num domínio do iFood;
 *  - a conferência lista o que falta; ligada com problema, quem inicia o serviço falha com a lista;
 *  - guarda de ambiente: o cabeçalho de homologação só no TEST, nunca em PRODUCAO.
 */
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { API_IFOOD_PADRAO, baseDaApiIfood, chaveDeCifragem, cifrar, conferirConfiguracao, decifrar, ErroDeCofre, exigirConfiguracao, integracaoIfoodAtiva, lerSegredo, temSegredo } from '@/lib/integracoes/core/cofre';
import { CABECALHO_DE_HOMOLOGACAO, cabecalhosDoAmbiente, conferirCabecalhos } from '@/lib/integracoes/core/ambiente';

const SEGREDO = 'valor-secreto-que-nunca-aparece-1234567890';
const CHAVE_HEX = randomBytes(32).toString('hex');

describe('INT-1.2 · o segredo pelo nome', () => {
  it('lê pelo nome; sem a variável, a mensagem diz o nome e nunca um valor', () => {
    expect(lerSegredo('IFOOD_TEST_CLIENT_SECRET', { IFOOD_TEST_CLIENT_SECRET: ` ${SEGREDO} ` })).toBe(SEGREDO);
    expect(() => lerSegredo('IFOOD_TEST_CLIENT_SECRET', {})).toThrow(/Falta a variável IFOOD_TEST_CLIENT_SECRET no cofre/);
    expect(() => lerSegredo('IFOOD_TEST_CLIENT_SECRET', { IFOOD_TEST_CLIENT_SECRET: '   ' })).toThrow(ErroDeCofre);
    expect(() => lerSegredo('ifood minúsculo', { 'ifood minúsculo': SEGREDO })).toThrow(/Nome de variável do cofre inválido/);
    // Decisão 487: só nome de segredo de app (IFOOD_<NOME>_CLIENT_SECRET). Outras variáveis do servidor nunca saem como segredo.
    const servidor = { INTEGRACAO_CHAVE_CIFRAGEM: 'chave', DATABASE_URL: 'postgresql://x', NEXTAUTH_SECRET: 'n', ANTHROPIC_API_KEY: 'a', IFOOD_TEST: 't' };
    for (const nome of Object.keys(servidor)) {
      expect(() => lerSegredo(nome, servidor), nome).toThrow(/só IFOOD_<NOME>_CLIENT_SECRET/);
      expect(temSegredo(nome, servidor), nome).toBe(false);
    }
    expect(lerSegredo('IFOOD_BI_PRODUCAO_CLIENT_SECRET', { IFOOD_BI_PRODUCAO_CLIENT_SECRET: 's' })).toBe('s');
    expect(() => lerSegredo(`IFOOD_${'A'.repeat(60)}_CLIENT_SECRET`, {})).toThrow(/inválido/);
    expect(temSegredo('IFOOD_TEST_CLIENT_SECRET', { IFOOD_TEST_CLIENT_SECRET: SEGREDO })).toBe(true);
    expect(temSegredo('IFOOD_TEST_CLIENT_SECRET', {})).toBe(false);
  });
});

describe('INT-1.2 · o token cifrado', () => {
  const chave = chaveDeCifragem({ INTEGRACAO_CHAVE_CIFRAGEM: CHAVE_HEX });

  it('volta igual com a mesma chave e o mesmo app; o texto cifrado não contém o token e muda a cada vez (IV novo)', () => {
    const token = `eyJ${'a'.repeat(7900)}`; // o iFood fala em até 8.000 caracteres
    const c1 = cifrar(token, 'integracao-token:app-1', chave);
    const c2 = cifrar(token, 'integracao-token:app-1', chave);
    expect(c1).not.toBe(c2);
    expect(c1).not.toContain('aaaaaaaa');
    expect(c1.startsWith('v1.')).toBe(true);
    expect(decifrar(c1, 'integracao-token:app-1', chave)).toBe(token);
  });

  it('outra chave, outro app ou texto mexido: erro, nunca lixo', () => {
    const c = cifrar('token-de-teste', 'integracao-token:app-1', chave);
    const outra = chaveDeCifragem({ INTEGRACAO_CHAVE_CIFRAGEM: randomBytes(32).toString('hex') });
    expect(() => decifrar(c, 'integracao-token:app-1', outra)).toThrow(/Peça um token novo/);
    expect(() => decifrar(c, 'integracao-token:app-2', chave)).toThrow(/Peça um token novo/);
    const partes = c.split('.');
    const corpo = Buffer.from(partes[3], 'base64url');
    corpo[0] ^= 1;
    expect(() => decifrar([partes[0], partes[1], partes[2], corpo.toString('base64url')].join('.'), 'integracao-token:app-1', chave)).toThrow(ErroDeCofre);
    expect(() => decifrar('texto-solto', 'integracao-token:app-1', chave)).toThrow('Token cifrado em formato desconhecido.');
    // Tag encurtada (12 bytes em vez de 16): recusada (decisão 488: decifrar exige a tag inteira).
    const tagCurta = Buffer.from(partes[2], 'base64url').subarray(0, 12).toString('base64url');
    expect(() => decifrar([partes[0], partes[1], tagCurta, partes[3]].join('.'), 'integracao-token:app-1', chave)).toThrow(ErroDeCofre);
  });

  it('a chave: 64 hex (o que o compose gera) ou base64 de 32 bytes; o resto com frase clara', () => {
    expect(chaveDeCifragem({ INTEGRACAO_CHAVE_CIFRAGEM: CHAVE_HEX }).length).toBe(32);
    expect(chaveDeCifragem({ INTEGRACAO_CHAVE_CIFRAGEM: randomBytes(32).toString('base64') }).length).toBe(32);
    expect(() => chaveDeCifragem({})).toThrow(/Falta a variável INTEGRACAO_CHAVE_CIFRAGEM/);
    expect(() => chaveDeCifragem({ INTEGRACAO_CHAVE_CIFRAGEM: 'curta' })).toThrow(/32 bytes/);
    expect(() => chaveDeCifragem({ INTEGRACAO_CHAVE_CIFRAGEM: randomBytes(16).toString('hex') })).toThrow(/32 bytes/);
  });
});

describe('INT-1.2 · chave geral e endereço da API', () => {
  it('só "true" liga', () => {
    expect(integracaoIfoodAtiva({ INTEGRACAO_IFOOD_ATIVA: 'true' })).toBe(true);
    for (const v of [undefined, '', 'TRUE', '1', 'sim', 'yes', 'false', ' true1']) expect(integracaoIfoodAtiva({ INTEGRACAO_IFOOD_ATIVA: v }), String(v)).toBe(false);
  });

  it('só o host oficial da API, em HTTPS, sem caminho, usuário ou parâmetro; vazio = o oficial', () => {
    expect(baseDaApiIfood({})).toBe(API_IFOOD_PADRAO);
    expect(baseDaApiIfood({ IFOOD_API_BASE: 'https://merchant-api.ifood.com.br/' })).toBe(API_IFOOD_PADRAO);
    for (const ruim of ['http://merchant-api.ifood.com.br', 'https://merchant-api.ifood.com.br.ataque.com', 'https://ifood.com.br@ataque.com', 'https://evil.com', 'https://merchant-api.ifood.com.br/v1', 'https://merchant-api.ifood.com.br?x=1', 'nada', 'https://ifood.com.br', 'https://outro.ifood.com.br']) {
      expect(() => baseDaApiIfood({ IFOOD_API_BASE: ruim }), ruim).toThrow(ErroDeCofre);
    }
  });
});

describe('INT-1.2 · conferência e início do serviço', () => {
  const pronto = { INTEGRACAO_IFOOD_ATIVA: 'true', INTEGRACAO_CHAVE_CIFRAGEM: CHAVE_HEX, IFOOD_TEST_CLIENT_SECRET: SEGREDO };

  it('pronto: sem problema; desligada mas incompleta: lista o que falta e não roda', () => {
    expect(conferirConfiguracao(['IFOOD_TEST_CLIENT_SECRET'], pronto)).toEqual({ ativa: true, problemas: [] });
    expect(exigirConfiguracao(['IFOOD_TEST_CLIENT_SECRET'], pronto)).toBe(true);
    const desligada = conferirConfiguracao(['IFOOD_TEST_CLIENT_SECRET'], {});
    expect(desligada.ativa).toBe(false);
    expect(desligada.problemas.join(' ')).toMatch(/INTEGRACAO_CHAVE_CIFRAGEM.*IFOOD_TEST_CLIENT_SECRET/);
    expect(exigirConfiguracao(['IFOOD_TEST_CLIENT_SECRET'], {})).toBe(false);
  });

  it('ligada com problema: o início falha com a lista, e nenhuma frase carrega o valor de um segredo', () => {
    const env = { ...pronto, IFOOD_TEST_CLIENT_SECRET: '', IFOOD_API_BASE: 'http://inseguro' };
    let mensagem = '';
    try {
      exigirConfiguracao(['IFOOD_TEST_CLIENT_SECRET'], env);
    } catch (e) {
      mensagem = (e as Error).message;
    }
    expect(mensagem).toMatch(/ligada, mas a configuração não está pronta/);
    expect(mensagem).toMatch(/IFOOD_API_BASE/);
    expect(mensagem).toMatch(/Falta a variável IFOOD_TEST_CLIENT_SECRET/);
    expect(mensagem).not.toContain(CHAVE_HEX);
    expect(conferirConfiguracao([], pronto).problemas).toEqual(['Nenhum app cadastrado na Central de Integrações.']);
  });
});

describe('INT-1.2 · guarda de ambiente', () => {
  it('TEST manda o cabeçalho de homologação; PRODUCAO nunca', () => {
    expect(cabecalhosDoAmbiente('TEST')).toEqual({ [CABECALHO_DE_HOMOLOGACAO]: 'true' });
    expect(cabecalhosDoAmbiente('PRODUCAO')).toEqual({});
    expect(() => cabecalhosDoAmbiente('HOMOLOG' as never)).toThrow();
  });

  it('a conferência recusa produção com o cabeçalho (qualquer caixa) e teste sem ele', () => {
    expect(() => conferirCabecalhos('PRODUCAO', { 'X-Request-Homologation': 'true' })).toThrow(/produção com o cabeçalho/);
    expect(() => conferirCabecalhos('TEST', {})).toThrow(/teste sem o cabeçalho/);
    expect(() => conferirCabecalhos('PRODUCAO', { authorization: 'Bearer x' })).not.toThrow();
    expect(() => conferirCabecalhos('TEST', cabecalhosDoAmbiente('TEST'))).not.toThrow();
  });
});
