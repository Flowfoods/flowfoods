import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticationResponseJSON } from '@/lib/erp/rosto';
import { ALCANCE_FLOWFOODS } from '@/lib/erp/permissoes';

const m = vi.hoisted(() => ({
  cookies: vi.fn(), headers: vi.fn(), redirect: vi.fn(), revalidatePath: vi.fn(),
  validarSessao: vi.fn(), entrarComSenha: vi.fn(), entrarComRosto: vi.fn(), iniciarEntradaComRosto: vi.fn(),
  definirSenhaPeloLink: vi.fn(), escolherParceiro: vi.fn(), encerrarSessao: vi.fn(),
  criarAcesso: vi.fn(), gerarNovoLink: vi.fn(), ativarPedido: vi.fn(), gravarPreferenciaDeAjuda: vi.fn(),
  concluirRegistroDeRosto: vi.fn(), exigirPessoa: vi.fn(), exigirNivel1: vi.fn(), audit: vi.fn(),
}));
vi.mock('next/headers', () => ({ cookies: m.cookies, headers: m.headers }));
vi.mock('next/navigation', () => ({ redirect: m.redirect }));
vi.mock('next/cache', () => ({ revalidatePath: m.revalidatePath }));
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: m.audit } } }));
vi.mock('@/lib/erp/credenciais', () => ({
  validarSessao: m.validarSessao, entrarComSenha: m.entrarComSenha, entrarComRosto: m.entrarComRosto,
  iniciarEntradaComRosto: m.iniciarEntradaComRosto, definirSenhaPeloLink: m.definirSenhaPeloLink,
  escolherParceiro: m.escolherParceiro, encerrarSessao: m.encerrarSessao,
  criarAcesso: m.criarAcesso, gerarNovoLink: m.gerarNovoLink, ativarPedido: m.ativarPedido,
  gravarPreferenciaDeAjuda: m.gravarPreferenciaDeAjuda, concluirRegistroDeRosto: m.concluirRegistroDeRosto,
  LimiteDoRosto: class extends Error {},
}));
vi.mock('@/lib/erp/contexto', () => ({ exigirPessoa: m.exigirPessoa, exigirNivel1: m.exigirNivel1 }));

import { aparelhoAtual, apagarCookieDeSessao, gravarCookieDeSessao, ipAtual, linkDePrimeiroAcesso, origemDoSite, sessaoDaRequisicao, tokenDoCookie } from '@/lib/erp/sessao';
import { acaoDefinirSenha, acaoEntrar, acaoEntrarComRosto, acaoEscolherParceiro, acaoOpcoesDoRosto, acaoSair } from '@/app/entrar/actions';
import { acaoAjudaDicas, acaoAjudaFechar, acaoAjudaPontoNunca, acaoAjudaPontoVisto, acaoAjudaPontosVistos, acaoAjudaReabrir, acaoConfirmarRosto } from '@/app/erp/actions';
import { executarCriar, executarNovoLink } from '@/components/erp/telas/equipe/executar';
import { acaoAtivarPedido } from '@/app/rodolfo/(painel)/onboarding/actions';

function adiar<T>() {
  let liberar!: (valor: T) => void;
  const promessa = new Promise<T>((resolve) => { liberar = resolve; });
  return { promessa, liberar };
}

const eventos: string[] = [];
const get = vi.fn((nome: string) => nome === 'ff_erp' ? { value: 'token-atual' } : undefined);
const set = vi.fn((_nome: string, _valor: string, _opcoes: Record<string, unknown>) => { eventos.push('cookie'); });
const jar = { get, set };
const expiraEm = new Date('2026-11-14T12:00:00.000Z');
const respostaRosto: AuthenticationResponseJSON = {
  id: 'credencial', rawId: 'credencial', type: 'public-key', clientExtensionResults: {},
  response: { authenticatorData: 'AA', clientDataJSON: 'AA', signature: 'AA' },
};
const ator = { nome: 'Admin', acessoId: null, alcance: ALCANCE_FLOWFOODS };
const formulario = () => {
  const f = new FormData();
  f.set('email', 'pessoa@example.test'); f.set('senha', 'senha-digitada');
  f.set('confirmacao', 'senha-digitada'); f.set('parceiroId', 'parceiro-autorizado');
  return f;
};

beforeEach(() => {
  vi.resetAllMocks();
  eventos.length = 0;
  vi.stubEnv('NEXTAUTH_URL', '');
  vi.stubEnv('ERP_WEBAUTHN_ORIGIN', '');
  get.mockImplementation((nome) => nome === 'ff_erp' ? { value: 'token-atual' } : undefined);
  set.mockImplementation(() => { eventos.push('cookie'); });
  m.cookies.mockResolvedValue(jar);
  m.headers.mockResolvedValue(new Headers({ 'x-real-ip': '192.0.2.8', host: 'erp.example.test', 'x-forwarded-proto': 'https', 'user-agent': 'iPhone' }));
  m.redirect.mockImplementation((destino: string) => { eventos.push(`redirect:${destino}`); throw new Error(`REDIRECT:${destino}`); });
  m.validarSessao.mockResolvedValue(null);
  m.entrarComSenha.mockResolvedValue({ ok: true, token: 'novo-token', expiraEm, escolher: false });
  m.entrarComRosto.mockResolvedValue({ ok: true, token: 'novo-token', expiraEm, escolher: true });
  m.definirSenhaPeloLink.mockResolvedValue({ ok: true });
  m.escolherParceiro.mockResolvedValue(true);
  m.exigirPessoa.mockResolvedValue({ usuario: { id: 'pessoa' } });
  m.exigirNivel1.mockResolvedValue({ userId: 'admin', autorNome: 'Admin' });
});
afterEach(() => vi.unstubAllEnvs());

describe('Sessão com Request APIs assíncronas do Next', () => {
  it('aguarda o cookie antes de validar a sessão; entrega token, nunca Promise, ao domínio', async () => {
    const espera = adiar<typeof jar>();
    m.cookies.mockReturnValue(espera.promessa);
    const lendo = sessaoDaRequisicao();
    expect(m.validarSessao).not.toHaveBeenCalled();
    espera.liberar(jar);
    expect(await lendo).toBeNull();
    expect(m.validarSessao).toHaveBeenCalledWith('token-atual');
  });

  it('usa somente o cookie seguro quando o site é HTTPS', async () => {
    vi.stubEnv('NEXTAUTH_URL', 'https://erp.example.test');
    get.mockImplementation((nome) => ({ value: nome === '__Host-ff_erp' ? 'seguro' : 'outro' }));
    expect(await tokenDoCookie()).toBe('seguro');
    expect(get).toHaveBeenCalledExactlyOnceWith('__Host-ff_erp');
    await gravarCookieDeSessao('seguro', expiraEm);
    expect(set).toHaveBeenCalledWith('__Host-ff_erp', 'seguro', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', expires: expiraEm });
    await apagarCookieDeSessao();
    expect(set).toHaveBeenLastCalledWith('__Host-ff_erp', '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
  });

  it('mantém ausência de token e flags do cookie local HTTP', async () => {
    get.mockReturnValue(undefined);
    expect(await tokenDoCookie()).toBeUndefined();
    await gravarCookieDeSessao('local', expiraEm);
    expect(set).toHaveBeenCalledExactlyOnceWith('ff_erp', 'local', { httpOnly: true, secure: false, sameSite: 'lax', path: '/', expires: expiraEm });
  });

  it('aguarda headers e preserva as regras de IP e aparelho', async () => {
    const espera = adiar<Headers>();
    m.headers.mockReturnValue(espera.promessa);
    const ip = ipAtual(), aparelho = aparelhoAtual();
    espera.liberar(new Headers({ 'x-forwarded-for': '198.51.100.1, 192.0.2.9', 'user-agent': 'Android Mobile' }));
    expect(await ip).toBe('192.0.2.9');
    expect(await aparelho).toBe('Celular Android');
  });

  it('origem configurada não depende de headers e o link resolvido continua string', async () => {
    vi.stubEnv('NEXTAUTH_URL', 'https://erp.example.test/caminho');
    expect(await linkDePrimeiroAcesso('token-do-link')).toBe('https://erp.example.test/entrar/primeiro-acesso/token-do-link');
    expect(m.headers).not.toHaveBeenCalled();
  });

  it.each<{ cabecalhos: Record<string, string>; esperado: string }>([
    { cabecalhos: { 'x-forwarded-host': 'publico.example.test', host: 'interno', 'x-forwarded-proto': 'https' }, esperado: 'https://publico.example.test' },
    { cabecalhos: { host: 'localhost:3106' }, esperado: 'http://localhost:3106' },
    { cabecalhos: {}, esperado: 'http://localhost:3000' },
  ])('preserva fallback de origem após aguardar headers: $esperado', async ({ cabecalhos, esperado }) => {
    vi.stubEnv('NEXTAUTH_URL', 'invalida');
    m.headers.mockResolvedValue(new Headers(cabecalhos));
    expect(await origemDoSite()).toBe(esperado);
  });
});

describe('Actions aguardam a sessão antes do efeito ou confirmação', () => {
  it('senha aguarda gravação do cookie antes de redirecionar', async () => {
    const espera = adiar<typeof jar>();
    m.cookies.mockReturnValue(espera.promessa);
    const resultado = acaoEntrar(null, formulario()).catch((e: unknown) => e);
    await vi.waitFor(() => expect(m.cookies).toHaveBeenCalledOnce());
    expect(m.entrarComSenha).toHaveBeenCalledWith({ email: 'pessoa@example.test', senha: 'senha-digitada', ip: '192.0.2.8' });
    expect(m.redirect).not.toHaveBeenCalled();
    espera.liberar(jar);
    expect(await resultado).toEqual(new Error('REDIRECT:/erp'));
    expect(eventos).toEqual(['cookie', 'redirect:/erp']);
  });

  it('senha recusada preserva erro/e-mail sem gravar cookie nem navegar', async () => {
    m.entrarComSenha.mockResolvedValue({ ok: false, erro: 'Acesso recusado.' });
    expect(await acaoEntrar(null, formulario())).toEqual({ erro: 'Acesso recusado.', email: 'pessoa@example.test', vez: 1 });
    expect(m.cookies).not.toHaveBeenCalled();
    expect(m.redirect).not.toHaveBeenCalled();
  });

  it('entrada por rosto só confirma destino após gravar o cookie', async () => {
    const espera = adiar<typeof jar>();
    m.cookies.mockReturnValue(espera.promessa);
    let terminou = false;
    const resultado = acaoEntrarComRosto(respostaRosto).then((r) => { terminou = true; return r; });
    await vi.waitFor(() => expect(m.cookies).toHaveBeenCalledOnce());
    expect(m.entrarComRosto).toHaveBeenCalledWith(respostaRosto, '192.0.2.8');
    expect(terminou).toBe(false);
    espera.liberar(jar);
    expect(await resultado).toEqual({ ok: true, destino: '/entrar/escolher' });
    expect(eventos).toEqual(['cookie']);
  });

  it('opções de rosto recebem IP resolvido', async () => {
    m.iniciarEntradaComRosto.mockResolvedValue({ challenge: 'desafio' });
    expect(await acaoOpcoesDoRosto()).toEqual({ ok: true, opcoes: { challenge: 'desafio' } });
    expect(m.iniciarEntradaComRosto).toHaveBeenCalledWith('192.0.2.8');
  });

  it('senha definida apaga o cookie antes do redirect', async () => {
    const espera = adiar<typeof jar>();
    m.cookies.mockReturnValue(espera.promessa);
    const resultado = acaoDefinirSenha('link', null, formulario()).catch((e: unknown) => e);
    await vi.waitFor(() => expect(m.cookies).toHaveBeenCalledOnce());
    expect(m.redirect).not.toHaveBeenCalled();
    espera.liberar(jar);
    expect(await resultado).toEqual(new Error('REDIRECT:/entrar?senha=criada'));
    expect(eventos).toEqual(['cookie', 'redirect:/entrar?senha=criada']);
    expect(set).toHaveBeenCalledWith('ff_erp', '', expect.objectContaining({ maxAge: 0 }));
  });

  it('troca de parceiro recebe token resolvido e mantém redirect autorizado', async () => {
    await expect(acaoEscolherParceiro(formulario())).rejects.toThrow('REDIRECT:/erp');
    expect(m.escolherParceiro).toHaveBeenCalledWith('token-atual', 'parceiro-autorizado');
  });

  it('logout espera revogação e exclusão do cookie antes de navegar', async () => {
    const revogacao = adiar<void>();
    m.encerrarSessao.mockReturnValue(revogacao.promessa);
    const resultado = acaoSair().catch((e: unknown) => e);
    await vi.waitFor(() => expect(m.encerrarSessao).toHaveBeenCalledWith('token-atual'));
    expect(set).not.toHaveBeenCalled();
    expect(m.redirect).not.toHaveBeenCalled();
    const exclusao = adiar<typeof jar>();
    m.cookies.mockReturnValue(exclusao.promessa);
    revogacao.liberar();
    await vi.waitFor(() => expect(m.cookies).toHaveBeenCalledTimes(2));
    expect(m.redirect).not.toHaveBeenCalled();
    exclusao.liberar(jar);
    expect(await resultado).toEqual(new Error('REDIRECT:/entrar?saiu=1'));
    expect(eventos).toEqual(['cookie', 'redirect:/entrar?saiu=1']);
  });

  it('todas as preferências de ajuda recebem token, sem mudar a operação', async () => {
    const f = new FormData(); f.set('caixa', 'ficha'); f.set('dicas', 'ligar'); f.set('ponto', 'ficha.impressao');
    await acaoAjudaFechar(f); await acaoAjudaDicas(f); await acaoAjudaPontoVisto('ficha.impressao');
    await acaoAjudaPontosVistos(['ficha.impressao']); await acaoAjudaPontoNunca(f); await acaoAjudaReabrir();
    expect(m.gravarPreferenciaDeAjuda.mock.calls).toEqual([
      ['token-atual', { tipo: 'fechar', caixa: 'ficha' }], ['token-atual', { tipo: 'dicas', ligadas: true }],
      ['token-atual', { tipo: 'ponto-visto', ponto: 'ficha.impressao' }], ['token-atual', { tipo: 'pontos-vistos', pontos: ['ficha.impressao'] }],
      ['token-atual', { tipo: 'ponto-nunca', ponto: 'ficha.impressao' }], ['token-atual', { tipo: 'reabrir' }],
    ]);
  });

  it('registro de rosto recebe o rótulo resolvido do aparelho', async () => {
    m.concluirRegistroDeRosto.mockResolvedValue({ ok: false, erro: 'Resposta incompleta.' });
    const resposta = { id: 'credencial', rawId: 'credencial', type: 'public-key' as const, clientExtensionResults: {}, response: { clientDataJSON: 'AA', attestationObject: 'AA' } };
    await acaoConfirmarRosto(resposta);
    expect(m.concluirRegistroDeRosto).toHaveBeenCalledWith({ usuario: { id: 'pessoa' } }, resposta, 'iPhone');
  });

  it('equipe retorna links serializáveis nos dois caminhos', async () => {
    m.criarAcesso.mockResolvedValue({ ok: true, mensagem: 'Criado.', link: { token: 'primeiro', expiraEm } });
    m.gerarNovoLink.mockResolvedValue({ ok: true, nome: 'Pessoa', token: 'segundo', expiraEm });
    expect(await executarCriar('parceiro', ator, null, new FormData())).toMatchObject({ ok: true, link: 'https://erp.example.test/entrar/primeiro-acesso/primeiro' });
    expect(await executarNovoLink('parceiro', ator, 'acesso', null)).toMatchObject({ ok: true, link: 'https://erp.example.test/entrar/primeiro-acesso/segundo' });
  });

  it('ativação monta resposta e WhatsApp com o link resolvido, sem token no audit', async () => {
    m.ativarPedido.mockResolvedValue({ ok: true, mensagem: 'Ativado.', parceiro: { id: 'parceiro', slug: 'casa', nome: 'Casa' }, dono: { nome: 'Pessoa' }, whatsapp: '+5521999990000', link: { token: 'privado', expiraEm } });
    const r = await acaoAtivarPedido('pedido', null, new FormData());
    expect(r?.ativacao?.link).toBe('https://erp.example.test/entrar/primeiro-acesso/privado');
    expect(decodeURIComponent(r?.ativacao?.whatsapp ?? '')).toContain(r!.ativacao!.link);
    expect(JSON.stringify(m.audit.mock.calls)).not.toContain('privado');
    expect(JSON.stringify(r)).not.toContain('[object Promise]');
  });
});
