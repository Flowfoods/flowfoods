import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

const atual = vi.hoisted(() => ({
  contexto: {
    parceiro: { id: 'parceiro-autenticado', slug: 'casa-autenticada', nome: 'Casa de teste', homologacaoDeIntegracao: false },
    cliente: { parceiroId: 'parceiro-autenticado' },
    alcance: { nivel: 'LOJA' as const, lojas: ['loja-autorizada'], permissoes: new Set<string>() },
  },
  liberado: true,
  leitor: vi.fn(),
  exigirParceiro: vi.fn(),
  modulo: vi.fn(),
}));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
vi.mock('@/lib/erp/contexto', () => ({
  exigirParceiroDaSessao: async () => atual.contexto,
  exigirParceiro: async (slug: string) => { atual.exigirParceiro(slug); return atual.contexto; },
  exigirPermissaoNaPagina: (_ctx: unknown, permissao: string) => { if (!atual.contexto.alcance.permissoes.has(permissao)) throw new Error(`SEM_ACESSO ${permissao}`); },
  exigirPermissao: (_ctx: unknown, permissao: string) => { if (!atual.contexto.alcance.permissoes.has(permissao)) throw new Error(`SEM_ACESSO ${permissao}`); },
}));
vi.mock('@/lib/erp/liberacao', () => ({ moduloLiberado: async (...args: unknown[]) => { atual.modulo(...args); return atual.liberado; } }));
vi.mock('@/lib/integracoes/core/painel-analytics', () => ({ lerPainelAnalytics: (...args: unknown[]) => atual.leitor(...args) }));
vi.mock('@/components/erp/telas/integracoes/painel-analytics', () => ({
  PainelAnalytics: (props: { base: string; baseSituacao: string; teste: boolean }) => createElement('div', { 'data-base': props.base, 'data-situacao': props.baseSituacao, 'data-teste': String(props.teste) }),
}));

import ErpPage from '@/app/erp/integracoes/analytics/page';
import Nivel1Page from '@/app/rodolfo/(painel)/integracoes/[slug]/analytics/page';

beforeEach(() => {
  atual.contexto.alcance.permissoes = new Set(['integracao.ver', 'faturamento.ver']);
  atual.contexto.parceiro.homologacaoDeIntegracao = false;
  atual.liberado = true;
  atual.leitor.mockReset().mockResolvedValue({ ok: false, motivo: 'leitura-indisponivel', mensagem: 'Indisponível no teste.' });
  atual.exigirParceiro.mockClear();
  atual.modulo.mockClear();
});

describe('Painel Analytics: fronteiras de página e contexto do servidor', () => {
  it.each(['integracao.ver', 'faturamento.ver'])('ERP sem %s para antes de consultar indicadores', async permissao => {
    atual.contexto.alcance.permissoes.delete(permissao);
    await expect(ErpPage({})).rejects.toThrow(`SEM_ACESSO ${permissao}`);
    expect(atual.leitor).not.toHaveBeenCalled();
    expect(atual.modulo).not.toHaveBeenCalled();
  });

  it('ERP sem liberação volta ao hub sem chamar o leitor', async () => {
    atual.liberado = false;
    await expect(ErpPage({})).rejects.toThrow('REDIRECT /erp?sem-modulo=integracao');
    expect(atual.leitor).not.toHaveBeenCalled();
  });

  it('GET transmite os filtros, mas não permite escolher parceiro ou ambiente pela URL', async () => {
    const merchant = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
    const pagina = await ErpPage({ searchParams: Promise.resolve({ loja: 'loja-autorizada', inicio: '2026-10-01', fim: '2026-10-31', merchant, parceiroId: 'outro', homologacaoDeIntegracao: 'true' }) });
    expect(atual.leitor).toHaveBeenCalledExactlyOnceWith(atual.contexto.cliente, atual.contexto.alcance,
      { parceiroId: 'parceiro-autenticado', homologacaoDeIntegracao: false },
      { lojaId: 'loja-autorizada', inicio: '2026-10-01', fim: '2026-10-31', merchants: merchant });
    const html = renderToStaticMarkup(pagina);
    expect(html).toContain('data-base="/erp/integracoes/analytics"');
    expect(html).toContain('data-teste="false"');
  });

  it('parâmetros escalares repetidos chegam ao parser como arrays, sem escolher um valor silenciosamente', async () => {
    await ErpPage({ searchParams: Promise.resolve({ loja: ['a', 'b'], inicio: ['2026-10-01', '2026-10-02'] }) });
    expect(atual.leitor.mock.calls[0][3]).toEqual({ lojaId: ['a', 'b'], inicio: ['2026-10-01', '2026-10-02'], fim: undefined, merchants: undefined });
  });

  it('nível 1 resolve o parceiro pela sessão e usa o slug canônico para os links', async () => {
    const pagina = await Nivel1Page({ params: Promise.resolve({ slug: 'slug-da-rota' }), searchParams: Promise.resolve({ loja: 'loja-autorizada', parceiroId: 'outro' }) });
    expect(atual.exigirParceiro).toHaveBeenCalledExactlyOnceWith('slug-da-rota');
    expect(atual.leitor.mock.calls[0][2]).toEqual({ parceiroId: 'parceiro-autenticado', homologacaoDeIntegracao: false });
    const html = renderToStaticMarkup(pagina);
    expect(html).toContain('data-base="/rodolfo/integracoes/casa-autenticada/analytics"');
    expect(html).toContain('data-situacao="/rodolfo/integracoes/casa-autenticada"');
  });

  it('TEST permanece explícito mesmo quando o leitor retorna erro', async () => {
    atual.contexto.parceiro.homologacaoDeIntegracao = true;
    expect(renderToStaticMarkup(await ErpPage({}))).toContain('data-teste="true"');
    expect(renderToStaticMarkup(await Nivel1Page({ params: Promise.resolve({ slug: 'teste' }) }))).toContain('data-teste="true"');
    expect(atual.leitor.mock.calls.every(call => call[2].homologacaoDeIntegracao === true)).toBe(true);
  });
});
