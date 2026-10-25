/**
 * E5.1 · decisão 470 — o Portal do cliente renderiza igual no servidor e no navegador.
 * O gravador de áudio decidia "o navegador grava?" na renderização: no servidor (sem `window`) saía o aviso "Este navegador
 * não grava áudio", no navegador o botão "Gravar áudio", e o React acusava a diferença (erro #418) em todo carregamento.
 * Agora a decisão é feita depois de montar: o servidor não desenha nenhum dos dois, e o navegador desenha o certo.
 */
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { Gravador } from '@/app/portal/[token]/Portal';

describe('E5.1 · Portal sem diferença entre servidor e navegador', () => {
  it('no servidor, o gravador não decide nada (nem aviso, nem botão)', () => {
    const html = renderToStaticMarkup(createElement(Gravador, { token: 't', item: { id: 'a1' } as never, aoSubir: () => {} }));
    expect(html).toBe('');
    expect(typeof window).toBe('undefined');
  });
});
