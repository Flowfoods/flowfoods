import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COOKIE_MARCA_CABECALHO, cookieDaMarca, escolherMarcaDoCookie } from '@/lib/erp/marca-cabecalho';

const mocks = vi.hoisted(() => ({
  ctx: { sessao: { userId: 'pessoa1' }, parceiro: { id: 'parceiro1', slug: 'casa-alfa', nome: 'Casa Alfa' }, alcance: {}, cliente: { marca: { findFirst: vi.fn() } } },
  cookies: { get: vi.fn(), set: vi.fn() }, listar: vi.fn(), exigir: vi.fn(), exigirN1: vi.fn(), pode: vi.fn(),
}));
vi.mock('next/headers', () => ({ cookies: async () => mocks.cookies }));
vi.mock('@/lib/erp/contexto', () => ({ exigirParceiroDaSessao: mocks.exigir, exigirParceiro: mocks.exigirN1, pode: mocks.pode }));
vi.mock('@/lib/erp/identidade', () => ({ listarMarcasComIdentidade: mocks.listar }));
vi.mock('@/lib/erp/sessao-cookie', () => ({ sessaoSegura: () => false }));

import { escolherMarcaDaSessao, escolherMarcaDoParceiro, identidadeDaSessao, identidadeDoParceiro } from '@/components/erp/shell/identidade-acoes';

const marcas = [{ id: 'a', nome: 'Marca Alfa', logoUrl: null }, { id: 'b', nome: 'Marca Beta', logoUrl: '/logo-b' }];

describe('marca no cabeçalho: preferência visual com escopo de pessoa e parceiro', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.exigir.mockResolvedValue(mocks.ctx);
    mocks.exigirN1.mockResolvedValue(mocks.ctx);
    mocks.pode.mockReturnValue(true);
    mocks.listar.mockResolvedValue([{ id: 'a', nome: 'Marca Alfa', logoArquivo: null }, { id: 'b', nome: 'Marca Beta', logoArquivo: 'imagem.webp' }]);
  });

  it('recarrega a escolha, mas ignora cookie de outra pessoa, parceiro ou marca removida', () => {
    const salvo = cookieDaMarca('pessoa1:parceiro1', 'b');
    expect(escolherMarcaDoCookie(salvo, 'pessoa1:parceiro1', marcas)).toBe('b');
    expect(escolherMarcaDoCookie(salvo, 'pessoa2:parceiro1', marcas)).toBe('a');
    expect(escolherMarcaDoCookie(salvo, 'pessoa1:parceiro2', marcas)).toBe('a');
    expect(escolherMarcaDoCookie(salvo, 'pessoa1:parceiro1', marcas.slice(0, 1))).toBe('a');
    expect(escolherMarcaDoCookie('lixo', 'pessoa1:parceiro1', [])).toBeNull();
  });

  it('monta nome e imagem da mesma marca autorizada, sem conceder perfil de edição', async () => {
    mocks.cookies.get.mockReturnValue({ value: cookieDaMarca('pessoa1:parceiro1', 'b') });
    mocks.pode.mockReturnValue(false);
    const d = await identidadeDaSessao();
    expect(d.selecionada).toBe('b');
    expect(d.marcas[1]).toEqual({ id: 'b', nome: 'Marca Beta', logoUrl: '/erp/identidade/marcas/b/logo?v=imagem.webp' });
    expect(d.perfilHref).toBeNull();
    // Sem `lojas.gerir`, o atalho "Trocar logo da marca" nem aparece (decisão 536).
    expect(d.logoBase).toBeNull();
    expect(mocks.listar).toHaveBeenCalledWith(mocks.ctx.cliente);
  });

  it('"Trocar logo da marca" só para quem pode alterar a logo (`lojas.gerir`) e com o parceiro desbloqueado; a rota é a da Identidade visual', async () => {
    mocks.pode.mockImplementation((_alcance: unknown, permissao: string) => permissao === 'lojas.gerir' || permissao === 'lojas.ver');
    expect((await identidadeDaSessao()).logoBase).toBe('/erp/identidade/marcas');
    mocks.pode.mockImplementation((_alcance: unknown, permissao: string) => permissao === 'lojas.ver');
    expect((await identidadeDaSessao()).logoBase).toBeNull();
    mocks.pode.mockReturnValue(true);
    mocks.exigir.mockResolvedValue({ ...mocks.ctx, bloqueio: 'Parceiro suspenso: só leitura.' });
    expect((await identidadeDaSessao()).logoBase).toBeNull();
  });

  it('resolve o nível 1 no servidor e usa o slug canônico nas URLs', async () => {
    const d = await identidadeDoParceiro('entrada');
    expect(mocks.exigirN1).toHaveBeenCalledWith('entrada');
    expect(d.marcas[1].logoUrl).toContain('/rodolfo/erp/casa-alfa/identidade/');
    expect(d.perfilHref).toBe('/rodolfo/erp/casa-alfa/lojas#identidade-visual');
    expect(d.logoBase).toBe('/rodolfo/erp/casa-alfa/identidade/marcas');
  });

  it('recusa marca inexistente/inativa ou de outro parceiro antes de gravar preferência', async () => {
    mocks.ctx.cliente.marca.findFirst.mockResolvedValue(null);
    expect((await escolherMarcaDaSessao('outra')).ok).toBe(false);
    expect(mocks.ctx.cliente.marca.findFirst).toHaveBeenCalledWith({ where: { id: 'outra', ativa: true }, select: { id: true } });
    expect(mocks.cookies.set).not.toHaveBeenCalled();
  });

  it('guarda só o cookie visual validado; não altera visão/filtros nem cadastro de marca', async () => {
    mocks.ctx.cliente.marca.findFirst.mockResolvedValue({ id: 'b' });
    expect(await escolherMarcaDoParceiro('casa-alfa', 'b')).toEqual({ ok: true });
    expect(mocks.cookies.set).toHaveBeenCalledExactlyOnceWith(COOKIE_MARCA_CABECALHO, cookieDaMarca('pessoa1:parceiro1', 'b'), expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }));
  });

  it('sem sessão não lista marcas nem grava cookie', async () => {
    mocks.exigir.mockRejectedValue(new Error('sem sessão'));
    await expect(identidadeDaSessao()).rejects.toThrow('sem sessão');
    await expect(escolherMarcaDaSessao('b')).rejects.toThrow('sem sessão');
    expect(mocks.listar).not.toHaveBeenCalled();
    expect(mocks.cookies.set).not.toHaveBeenCalled();
  });
});
