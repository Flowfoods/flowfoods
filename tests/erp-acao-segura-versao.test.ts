/**
 * INS-SALVAR-CONFIRMACAO (17/11/2026): o ERP atualizado com a tela aberta. A ação da tela não existe no servidor novo (o Next 16
 * lança `UnrecognizedActionError`): o resultado é CERTO (nada foi salvo) e só recarregar resolve. Sem banco e sem navegador.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
// A classe e o detector OFICIAIS do Next (o módulo real, sem mock): o nosso detector precisa concordar com eles.
import { UnrecognizedActionError, unstable_isUnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error';
import { ehVersaoNova, FRASE_SEM_CONEXAO, FRASE_VERSAO_NOVA, FRASE_VERSAO_NOVA_COM_RASCUNHO, useAcaoSegura } from '@/components/erp/telas/cadastro/anuncio';
import { ErroGeral } from '@/components/erp/telas/cadastro/erros';
import type { EstadoCadastro } from '@/components/erp/telas/cadastro/estado';

// O hook só embrulha a action num `useCallback`: fora de um componente, a própria função.
vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()), useCallback: (fn: unknown) => fn }));

const versaoVelha = () => new UnrecognizedActionError('Server Action "abc123" was not found on the server.');
const form = () => {
  const f = new FormData();
  f.set('nome', 'KRAFT 01');
  return f;
};

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

describe('useAcaoSegura: resultado certo (versão nova) é diferente de resultado incerto (rede ou servidor)', () => {
  it('versão nova com o rascunho guardado: diz que nada foi salvo e que o que foi digitado volta', async () => {
    const guardar = vi.fn(() => true);
    const f = form();
    const r = await useAcaoSegura(async () => { throw versaoVelha(); }, { aoVersaoNova: guardar })({ ok: false, erros: {}, vez: 2 }, f);
    expect(r).toEqual({ ok: false, erros: { geral: FRASE_VERSAO_NOVA_COM_RASCUNHO }, versaoNova: true, rascunhoGuardado: true, vez: 3 });
    expect(guardar).toHaveBeenCalledTimes(1);
    expect(guardar).toHaveBeenCalledWith(f);
  });
  it('versão nova sem rascunho (não guardou, guardar falhou ou o formulário não guarda): manda preencher de novo', async () => {
    const acao = async () => { throw versaoVelha(); };
    for (const opcoes of [undefined, { aoVersaoNova: () => false }, { aoVersaoNova: () => { throw new Error('armazenamento cheio'); } }]) {
      const r = await useAcaoSegura(acao, opcoes)(null, form());
      expect(r).toEqual({ ok: false, erros: { geral: FRASE_VERSAO_NOVA }, versaoNova: true, rascunhoGuardado: false, vez: 1 });
    }
  });
  it('falha de rede ou do servidor: continua incerto (a frase de sempre), sem pedir para recarregar nem guardar', async () => {
    for (const e of [new TypeError('Failed to fetch'), Object.assign(new Error('An error occurred in the Server Components render.'), { digest: '2938471' })]) {
      const guardar = vi.fn(() => true);
      const r = await useAcaoSegura(async () => { throw e; }, { aoVersaoNova: guardar })(null, form());
      expect(r).toEqual({ ok: false, erros: { geral: FRASE_SEM_CONEXAO }, vez: 1 });
      expect(guardar).not.toHaveBeenCalled();
    }
  });
  it('redirecionamento do Next segue adiante; resposta da action volta como veio; nada é guardado', async () => {
    const guardar = vi.fn(() => true);
    const redirecionar = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/erp/insumos;307;' });
    await expect(useAcaoSegura(async () => { throw redirecionar; }, { aoVersaoNova: guardar })(null, form())).rejects.toBe(redirecionar);
    const resposta: EstadoCadastro = { ok: false, erros: { nome: 'Diga o nome.' }, vez: 1 };
    expect(await useAcaoSegura(async () => resposta, { aoVersaoNova: guardar })(null, form())).toBe(resposta);
    expect(guardar).not.toHaveBeenCalled();
  });
  it('as frases não atribuem à conexão o que é certo: nada foi salvo e é preciso recarregar', () => {
    for (const frase of [FRASE_VERSAO_NOVA, FRASE_VERSAO_NOVA_COM_RASCUNHO]) {
      expect(frase).toContain('nada foi salvo');
      expect(frase).toMatch(/recarregue a página/i);
      expect(frase).not.toMatch(/conexão|salvar de novo|reconhece/i);
    }
  });
});

describe('ErroGeral: versão nova recarrega a página; conflito continua com o link de sempre', () => {
  const html = (estado: EstadoCadastro) => renderToStaticMarkup(createElement(ErroGeral, { estado, recarregar: '/erp/insumos/novo' }));
  it('versão nova: botão "Recarregar a página" (não um link, que só navegaria), dentro do alerta', () => {
    const h = html({ ok: false, erros: { geral: FRASE_VERSAO_NOVA_COM_RASCUNHO }, versaoNova: true, rascunhoGuardado: true, vez: 1 });
    expect(h).toContain('role="alert"');
    expect(h).toMatch(/<button type="button"[^>]*>Recarregar a página<\/button>/);
    expect(h).not.toContain('href=');
  });
  it('conflito de versão lida: o link "Recarregar" de antes; erro comum: sem botão', () => {
    expect(html({ ok: false, erros: { geral: 'Outra pessoa salvou.' }, conflito: true, vez: 1 })).toMatch(/<a href="\/erp\/insumos\/novo"[^>]*>Recarregar<\/a>/);
    const comum = html({ ok: false, erros: { geral: FRASE_SEM_CONEXAO }, vez: 1 });
    expect(comum).not.toMatch(/Recarregar|<button|href=/);
  });
});
