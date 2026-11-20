import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIMITE_DA_FOTO } from '@/lib/erp/foto';
import { EditorImagem } from '@/components/erp/telas/identidade/editor-imagem';
import { erroDaEscolha, gravarImagem } from '@/components/erp/telas/identidade/envio-imagem';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => vi.unstubAllGlobals());

describe('identidade visual · escolha e confirmação do envio', () => {
  it('recusa vazio, tamanho acima do limite e formatos não suportados antes de enviar', () => {
    expect(erroDaEscolha({ size: 0, type: 'image/png' })).toContain('vazio');
    expect(erroDaEscolha({ size: LIMITE_DA_FOTO + 1, type: 'image/jpeg' })).toContain('8 MB');
    expect(erroDaEscolha({ size: 20, type: 'image/svg+xml' })).toContain('JPG, PNG ou WebP');
    expect(erroDaEscolha({ size: LIMITE_DA_FOTO, type: 'image/webp' })).toBeNull();
  });

  it('envia o arquivo original sem converter a logo nem criar multipart', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetch);
    const foto = new File(['bytes'], 'logo.png', { type: 'image/png' });
    const signal = new AbortController().signal;
    await expect(gravarImagem('/erp/identidade/marcas/marca/logo', foto, signal)).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith('/erp/identidade/marcas/marca/logo', {
      method: 'POST', body: foto, headers: { 'Content-Type': 'image/png' }, signal, credentials: 'same-origin',
    });
  });

  it('remoção tem contrato próprio e não envia um usuário ou marca no corpo', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetch);
    const signal = new AbortController().signal;
    await expect(gravarImagem('/erp/perfil/foto', null, signal)).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith('/erp/perfil/foto', { method: 'DELETE', signal, credentials: 'same-origin' });
  });

  it('não anuncia sucesso com sessão expirada, resposta não JSON ou falha de rede', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ ok: false, erro: 'Entre novamente.' }, { status: 401 }))
      .mockResolvedValueOnce(new Response('<html>Entrar</html>'))
      .mockRejectedValueOnce(new Error('offline'));
    vi.stubGlobal('fetch', fetch);
    const signal = new AbortController().signal;
    await expect(gravarImagem('/erp/perfil/foto', null, signal)).resolves.toEqual({ ok: false, erro: 'Entre novamente.' });
    expect((await gravarImagem('/erp/perfil/foto', null, signal)).ok).toBe(false);
    expect((await gravarImagem('/erp/perfil/foto', null, signal)).ok).toBe(false);
  });
});

describe('identidade visual · acesso e estado inicial', () => {
  it('sem imagem usa iniciais e não provoca GET de arquivo inexistente', () => {
    const html = renderToStaticMarkup(createElement(EditorImagem, { url: '/erp/perfil/foto', atual: null, nome: 'Pessoa Sintética', tipo: 'foto' }));
    expect(html).toContain('Iniciais de Pessoa Sintética');
    expect(html).not.toContain('<img');
    expect(html).toContain('Escolher foto');
    expect(html).not.toContain('Remover foto');
    expect(html).toContain('permanece ao trocar de marca');
  });

  it('acesso de leitura exibe logo com proporção preservada, sem controles de alteração', () => {
    const html = renderToStaticMarkup(createElement(EditorImagem, { url: '/erp/identidade/marcas/m1/logo', atual: '/erp/identidade/marcas/m1/logo?v=1', nome: 'Marca Sintética', tipo: 'logo', podeEditar: false }));
    expect(html).toContain('Logo de Marca Sintética');
    expect(html).toContain('object-contain');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('type="file"');
  });
});
