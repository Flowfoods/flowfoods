/**
 * Decisão 536 · a ação do "Editar barra" (`acaoSalvarAtalhosDaBarra`), sem banco: ela recalcula o menu da pessoa no servidor
 * (permissões e módulos liberados, como o layout) e só deixa gravar o Início e as áreas com tela dele. Quem é a pessoa vem só
 * do cookie da sessão; o que vem do navegador é só a lista.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  ctx: null as unknown,
  liberados: new Set<string>(),
  gravar: vi.fn(),
  revalidar: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: m.revalidar }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {} }) }));
vi.mock('@/lib/erp/sessao', () => ({ tokenDoCookie: async () => 'token-da-sessao', aparelhoAtual: async () => 'Teste' }));
vi.mock('@/lib/erp/liberacao', async (original) => ({ ...(await original<object>()), modulosLiberados: async () => m.liberados }));
vi.mock('@/lib/erp/contexto', async () => {
  const { recusaDaAcao, exigirPermissao, pode } = await import('@/lib/erp/permissoes');
  return { exigirParceiroDaSessao: async () => m.ctx, exigirPessoa: async () => m.ctx, visaoDaRequisicao: async () => ({}), recusaDaAcao, exigirPermissao, pode };
});
vi.mock('@/lib/erp/credenciais', async (original) => ({ ...(await original<object>()), gravarAtalhosDaBarra: m.gravar }));

import { acaoSalvarAtalhosDaBarra } from '@/app/erp/actions';
import { ALCANCE_FLOWFOODS, resolverAlcance } from '@/lib/erp/permissoes';
import { navegacaoDoParceiro } from '@/lib/erp/modulos';
import { NENHUM_MODULO_LIBERADO } from '@/lib/erp/liberacao';

const so = (permissoes: string[]) =>
  resolverAlcance({ perfilBase: null, perfilProprio: permissoes as never, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });

describe('Decisão 536 · ação "Salvar barra"', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.liberados = NENHUM_MODULO_LIBERADO as Set<string>;
    m.gravar.mockResolvedValue({ ok: true, chaves: [] });
  });

  it('o permitido é o menu da pessoa: o Início e as áreas com tela dela, nunca as de outra permissão', async () => {
    m.ctx = { alcance: so(['faturamento.ver']), cliente: {}, pessoa: { acessoId: 'vinculo-1' } };
    await acaoSalvarAtalhosDaBarra(['faturamento']);
    const [token, chaves, permitidas, , acesso] = m.gravar.mock.calls[0];
    expect(token).toBe('token-da-sessao');
    // O vínculo da sessão que calculou o menu vai junto (a lista não pode cair no vínculo de outro parceiro).
    expect(acesso).toBe('vinculo-1');
    expect(chaves).toEqual(['faturamento']);
    const esperado = navegacaoDoParceiro(so(['faturamento.ver']), NENHUM_MODULO_LIBERADO).modulos.filter((x) => x.href).map((x) => x.chave);
    expect([...permitidas].sort()).toEqual(['inicio', ...esperado].sort());
    expect(permitidas.has('cadastros')).toBe(false);
  });

  it('decisão 539: a área Integração só entra na barra com "ver integrações" E o módulo liberado', async () => {
    const permitidasCom = async (permissoes: string[], liberados: Set<string>) => {
      m.gravar.mockClear();
      m.liberados = liberados;
      m.ctx = { alcance: so(permissoes), cliente: {}, pessoa: { acessoId: 'vinculo-1' } };
      await acaoSalvarAtalhosDaBarra(['integracao']);
      return m.gravar.mock.calls[0][2] as Set<string>;
    };
    const liberado = new Set(['integracao']);
    expect((await permitidasCom(['integracao.ver', 'lojas.ver'], liberado)).has('integracao')).toBe(true);
    // Sem o módulo liberado para o parceiro, ou sem a permissão, a chave não é aceita (a escolha salva não abre destino).
    expect((await permitidasCom(['integracao.ver', 'lojas.ver'], NENHUM_MODULO_LIBERADO as Set<string>)).has('integracao')).toBe(false);
    expect((await permitidasCom(['lojas.ver'], liberado)).has('integracao')).toBe(false);
    // A Ficha Técnica continua com a chave antiga: quem a tinha na barra não perde o atalho.
    expect((await permitidasCom(['fichas.ver'], NENHUM_MODULO_LIBERADO as Set<string>)).has('cadastros')).toBe(true);
  });

  it('o catálogo "Em breve" (sem tela) nunca é permitido, nem para o nível 1', async () => {
    m.ctx = { alcance: ALCANCE_FLOWFOODS, cliente: {}, pessoa: { acessoId: 'vinculo-1' } };
    await acaoSalvarAtalhosDaBarra([]);
    const permitidas: Set<string> = m.gravar.mock.calls[0][2];
    const futuros = navegacaoDoParceiro(ALCANCE_FLOWFOODS, NENHUM_MODULO_LIBERADO).modulos.filter((x) => !x.href).map((x) => x.chave);
    expect(futuros.length).toBeGreaterThan(0);
    for (const f of futuros) expect(permitidas.has(f), f).toBe(false);
  });

  it('salvou: revalida o layout (a barra lê a escolha da sessão); recusou: devolve o motivo e não revalida', async () => {
    m.ctx = { alcance: ALCANCE_FLOWFOODS, cliente: {}, pessoa: { acessoId: 'vinculo-1' } };
    expect(await acaoSalvarAtalhosDaBarra(['compras'])).toEqual({ ok: true });
    expect(m.revalidar).toHaveBeenCalledWith('/erp', 'layout');
    m.revalidar.mockClear();
    m.gravar.mockResolvedValue({ ok: false, erro: 'Cada área entra na barra uma vez só.' });
    expect(await acaoSalvarAtalhosDaBarra(['compras', 'compras'])).toEqual({ ok: false, mensagem: 'Cada área entra na barra uma vez só.' });
    expect(m.revalidar).not.toHaveBeenCalled();
  });
});
