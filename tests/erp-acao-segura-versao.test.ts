/**
 * INS-SALVAR-CONFIRMACAO (17/11/2026): o ERP atualizado com a tela aberta. A ação da tela não existe no servidor novo (o Next 16
 * lança `UnrecognizedActionError`): o resultado DESTE envio é certo (não foi processado) e só recarregar resolve. Um envio anterior
 * que ficou sem confirmação pode ter sido salvo: a frase não diz "nada". Sem banco e sem navegador (o caminho real tem QA à parte).
 */
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
// A classe e o detector OFICIAIS do Next (o módulo real, sem mock): o nosso detector precisa concordar com eles.
import { UnrecognizedActionError, unstable_isUnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error';
import {
  ehVersaoNova, FRASE_ENVIO_ANTERIOR_INCERTO, FRASE_ENVIO_ANTERIOR_RECONHECIDO, FRASE_SEM_CONEXAO, FRASE_VERSAO_NOVA, FRASE_VERSAO_NOVA_COM_RASCUNHO, useAcaoSegura,
} from '@/components/erp/telas/cadastro/anuncio';
import { deveAvisarAoSair, ErroGeral, recarregarDepoisDeGuardar, recarregarSemPerguntar, RELIGAR_O_AVISO_MS } from '@/components/erp/telas/cadastro/erros';
import type { EstadoCadastro } from '@/components/erp/telas/cadastro/estado';

// Fora de um componente: o hook só embrulha a action (`useCallback`) e lembra, na vida da tela, se algum envio ficou incerto (`useRef`);
// o efeito do foco do `ErroGeral` não roda (a função do componente é chamada direto para tocar o botão).
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useCallback: (fn: unknown) => fn,
  useRef: (current: unknown) => ({ current }),
  useEffect: () => {},
}));

/** O primeiro elemento da árvore que satisfaz o teste (a árvore que a função do componente devolve, sem renderizar). */
function achar(no: ReactNode, teste: (el: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(no)) { for (const f of no) { const r = achar(f, teste); if (r) return r; } return null; }
  if (!isValidElement<Record<string, unknown>>(no)) return null;
  if (teste(no)) return no;
  return achar(no.props.children as ReactNode, teste);
}

const versaoVelha = () => new UnrecognizedActionError('Server Action "abc123" was not found on the server.');
const form = () => {
  const f = new FormData();
  f.set('nome', 'KRAFT 01');
  return f;
};
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('o erro de versão do Next é reconhecido como o próprio Next o reconhece', () => {
  it('a classe real do Next: os dois detectores dizem sim', () => {
    const e = versaoVelha();
    expect(unstable_isUnrecognizedActionError(e)).toBe(true);
    expect(ehVersaoNova(e)).toBe(true);
  });
  it('qualquer outro erro, inclusive o redirecionamento e a falha de rede: os dois dizem não', () => {
    const redirecionar = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/erp/insumos;307;' });
    for (const e of [new Error('Failed to fetch'), new TypeError('Load failed'), redirecionar, { name: 'UnrecognizedActionError' }, null, 'texto']) {
      expect(unstable_isUnrecognizedActionError(e), String(e)).toBe(false);
      expect(ehVersaoNova(e), String(e)).toBe(false);
    }
  });
});

describe('useAcaoSegura: o certo (este envio não foi processado) separado do incerto (pode ter chegado)', () => {
  it('versão nova com o rascunho guardado: este envio não foi processado; o que foi digitado volta', async () => {
    const guardar = vi.fn(() => true);
    const f = form();
    const r = await useAcaoSegura(async () => { throw versaoVelha(); }, { aoVersaoNova: guardar })({ ok: false, erros: {}, vez: 2 }, f);
    expect(r).toEqual({ ok: false, erros: { geral: FRASE_VERSAO_NOVA_COM_RASCUNHO }, versaoNova: true, rascunhoGuardado: true, vez: 3 });
    expect(guardar).toHaveBeenCalledExactlyOnceWith(f, { incerto: false });
  });
  it('versão nova sem rascunho (não guardou, guardar falhou ou o formulário não guarda): recarregar e tentar de novo', async () => {
    const acao = async () => { throw versaoVelha(); };
    for (const opcoes of [undefined, { aoVersaoNova: () => false }, { aoVersaoNova: () => { throw new Error('armazenamento cheio'); } }]) {
      const r = await useAcaoSegura(acao, opcoes)(null, form());
      expect(r).toEqual({ ok: false, erros: { geral: FRASE_VERSAO_NOVA }, versaoNova: true, rascunhoGuardado: false, vez: 1 });
    }
  });
  it('falha de rede ou do servidor: incerto (a frase de sempre), sem recarregar nem guardar', async () => {
    for (const e of [new TypeError('Failed to fetch'), Object.assign(new Error('An error occurred in the Server Components render.'), { digest: '2938471' })]) {
      const guardar = vi.fn(() => true);
      const r = await useAcaoSegura(async () => { throw e; }, { aoVersaoNova: guardar })(null, form());
      expect(r).toEqual({ ok: false, erros: { geral: FRASE_SEM_CONEXAO }, incerto: true, vez: 1 });
      expect(guardar).not.toHaveBeenCalled();
    }
  });
  it('depois de um envio incerto, a versão nova não diz que nada chegou; com o rascunho, o reenvio é reconhecido', async () => {
    let falha: unknown = new TypeError('Failed to fetch');
    const guardar = vi.fn(() => true);
    const enviar = useAcaoSegura(async () => { throw falha; }, { aoVersaoNova: guardar });
    expect(await enviar(null, form())).toMatchObject({ erros: { geral: FRASE_SEM_CONEXAO }, incerto: true });
    falha = versaoVelha();
    const r = await enviar({ ok: false, erros: { nome: 'Diga o nome.' }, vez: 1 }, form());
    expect(r).toEqual({ ok: false, erros: { geral: `${FRASE_VERSAO_NOVA_COM_RASCUNHO} ${FRASE_ENVIO_ANTERIOR_RECONHECIDO}` }, versaoNova: true, rascunhoGuardado: true, incerto: true, vez: 2 });
    expect(guardar).toHaveBeenLastCalledWith(expect.any(FormData), { incerto: true });
    // Sem rascunho (a chave do envio não volta), só dá para pedir que confira.
    const semRascunho = useAcaoSegura(async () => { throw falha; });
    falha = new TypeError('Load failed'); await semRascunho(null, form());
    falha = versaoVelha();
    expect(await semRascunho(null, form())).toMatchObject({ erros: { geral: `${FRASE_VERSAO_NOVA} ${FRASE_ENVIO_ANTERIOR_INCERTO}` }, incerto: true });
    // Outra tela (outro uso do hook) começa sem incerteza.
    expect(await useAcaoSegura(async () => { throw falha; })(null, form())).toMatchObject({ erros: { geral: FRASE_VERSAO_NOVA } });
  });
  it('redirecionamento do Next segue adiante; resposta da action volta como veio; nada é guardado', async () => {
    const guardar = vi.fn(() => true);
    const redirecionar = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/erp/insumos;307;' });
    await expect(useAcaoSegura(async () => { throw redirecionar; }, { aoVersaoNova: guardar })(null, form())).rejects.toBe(redirecionar);
    const resposta: EstadoCadastro = { ok: false, erros: { nome: 'Diga o nome.' }, vez: 1 };
    expect(await useAcaoSegura(async () => resposta, { aoVersaoNova: guardar })(null, form())).toBe(resposta);
    expect(guardar).not.toHaveBeenCalled();
  });
  it('as frases falam só deste envio, servem também para excluir, e nunca dizem que nada foi salvo', () => {
    for (const frase of [FRASE_VERSAO_NOVA, FRASE_VERSAO_NOVA_COM_RASCUNHO]) {
      expect(frase).toContain('este envio não foi processado');
      expect(frase).toMatch(/recarregue a página/i);
      expect(frase).not.toMatch(/conexão|nada foi salvo/i);
    }
    expect(FRASE_VERSAO_NOVA).not.toMatch(/salv|preench/i); // vale para "Excluir de vez"
    expect(FRASE_VERSAO_NOVA_COM_RASCUNHO).toContain('volta preenchido');
  });
});

describe('Recarregar a página: só sem a pergunta de sair quando o que está na tela acabou de ser guardado', () => {
  it('guardou: recarrega sem perguntar; não guardou, falhou ou o formulário não guarda: recarrega com a pergunta', () => {
    const caminhos = () => ({ semPerguntar: vi.fn(), comPergunta: vi.fn() });
    const sim = caminhos();
    expect(recarregarDepoisDeGuardar(() => true, sim)).toBe('sem-perguntar');
    expect(sim.semPerguntar).toHaveBeenCalledOnce(); expect(sim.comPergunta).not.toHaveBeenCalled();
    for (const guardar of [() => false, () => { throw new Error('cheio'); }, undefined]) {
      const nao = caminhos();
      expect(recarregarDepoisDeGuardar(guardar, nao)).toBe('com-pergunta');
      expect(nao.comPergunta).toHaveBeenCalledOnce(); expect(nao.semPerguntar).not.toHaveBeenCalled();
    }
  });
  it('a pergunta fica desligada só no instante da recarga; se ela for interrompida, volta sozinha', () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    vi.stubGlobal('window', { location: { reload } });
    expect(deveAvisarAoSair(true)).toBe(true);
    recarregarSemPerguntar();
    expect(reload).toHaveBeenCalledOnce();
    expect(deveAvisarAoSair(true)).toBe(false);
    vi.advanceTimersByTime(RELIGAR_O_AVISO_MS);
    expect(deveAvisarAoSair(true)).toBe(true);
    expect(deveAvisarAoSair(false)).toBe(false);
  });
});

describe('o toque no botão do ErroGeral: guarda o que está no formulário e só então dispensa a pergunta', () => {
  const versaoNova: EstadoCadastro = { ok: false, erros: { geral: FRASE_VERSAO_NOVA_COM_RASCUNHO }, versaoNova: true, rascunhoGuardado: true, vez: 1 };
  const tocar = (aoGuardarAntesDeRecarregar: ((f: FormData) => boolean) | undefined, form: unknown) => {
    const arvore = ErroGeral({ estado: versaoNova, recarregar: '/erp/insumos/novo', aoGuardarAntesDeRecarregar }) as ReactElement;
    const botao = achar(arvore, (el) => el.type === 'button');
    expect(botao?.props.children).toBe('Recarregar a página');
    (botao!.props.onClick as (e: unknown) => void)({ currentTarget: { form } });
  };
  it('com formulário e rascunho guardado: guarda os valores de agora e recarrega sem a pergunta', () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    vi.stubGlobal('window', { location: { reload } });
    // O FormData do navegador lê o <form>; aqui, um no lugar dele que só carrega a referência.
    vi.stubGlobal('FormData', class { constructor(readonly de: unknown) {} });
    const formulario = { nome: 'o form da tela' };
    const guardar = vi.fn((f: FormData) => (f as unknown as { de: unknown }).de === formulario);
    tocar(guardar, formulario);
    expect(guardar).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
    expect(deveAvisarAoSair(true)).toBe(false);
    vi.advanceTimersByTime(RELIGAR_O_AVISO_MS);
  });
  it('sem guardar (formulário que não guarda, guardar falhou, ou sem formulário): recarrega e a pergunta continua valendo', () => {
    for (const [guardar, form] of [[undefined, {}], [() => false, {}], [() => true, null]] as const) {
      const reload = vi.fn();
      vi.stubGlobal('window', { location: { reload } });
      vi.stubGlobal('FormData', class { constructor(readonly de: unknown) {} });
      tocar(guardar, form);
      expect(reload).toHaveBeenCalledOnce();
      expect(deveAvisarAoSair(true)).toBe(true);
    }
  });
});

describe('ErroGeral: versão nova recarrega a página; conflito continua com o link de sempre', () => {
  const html = (estado: EstadoCadastro) => renderToStaticMarkup(createElement(ErroGeral, { estado, recarregar: '/erp/insumos/novo', aoGuardarAntesDeRecarregar: () => true }));
  it('versão nova: botão "Recarregar a página" (não um link, que só navegaria), dentro do alerta', () => {
    const h = html({ ok: false, erros: { geral: FRASE_VERSAO_NOVA_COM_RASCUNHO }, versaoNova: true, rascunhoGuardado: true, vez: 1 });
    expect(h).toContain('role="alert"');
    expect(h).toMatch(/<button type="button"[^>]*>Recarregar a página<\/button>/);
    expect(h).not.toContain('href=');
  });
  it('conflito de versão lida: o link "Recarregar" de antes; erro comum: sem botão', () => {
    expect(html({ ok: false, erros: { geral: 'Outra pessoa salvou.' }, conflito: true, vez: 1 })).toMatch(/<a href="\/erp\/insumos\/novo"[^>]*>Recarregar<\/a>/);
    const comum = html({ ok: false, erros: { geral: FRASE_SEM_CONEXAO }, incerto: true, vez: 1 });
    expect(comum).not.toMatch(/Recarregar|<button|href=/);
  });
});
