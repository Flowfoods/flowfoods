import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import { resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import { obterMes } from '@/lib/erp/faturamento';
import { situacaoDoEstoque } from '@/lib/erp/estoque';
import { lojasDaListaDoDia } from '@/lib/erp/producao-lista';
import { saudeDoCardapio } from '@/lib/erp/saude-do-cardapio';
import { dreDoPeriodo } from '@/lib/erp/dre';
import { lerComprasDaHome } from '@/lib/erp/home-compras';
import { painelDoDia } from '@/lib/erp/painel-do-dia';
import { PainelDoDiaNaTela } from '@/components/erp/telas/painel-do-dia';

vi.mock('@/lib/erp/faturamento', () => ({ obterMes: vi.fn() }));
vi.mock('@/lib/erp/estoque', () => ({ situacaoDoEstoque: vi.fn() }));
vi.mock('@/lib/erp/producao-lista', () => ({ lojasDaListaDoDia: vi.fn() }));
vi.mock('@/lib/erp/saude-do-cardapio', () => ({ saudeDoCardapio: vi.fn() }));
vi.mock('@/lib/erp/dre', () => ({ dreDoPeriodo: vi.fn() }));
vi.mock('@/lib/erp/compras-relatorio', () => ({ resolverRecorte: vi.fn(), totaisDoRecorte: vi.fn() }));
vi.mock('@/lib/erp/home-compras', async (original) => ({ ...await original<typeof import('@/lib/erp/home-compras')>(), lerComprasDaHome: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

const HOJE = '2026-10-29';
const cliente = {} as ClienteDoParceiro;
const perfil = (base: 'DONO' | 'GERENTE' | 'OPERADOR', lojas?: string[]) => resolverAlcance({
  perfilBase: base, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [],
  redeInteira: !lojas, lojaIds: lojas ?? [],
});
const dados = {
  lojaa: { nome: 'Loja A', centavos: 100_000, estado: 'NAO_ABERTO' as const },
  lojab: { nome: 'Loja B', centavos: 700_000, estado: 'ABERTO' as const },
};
const idsDoAlcance = (a: Alcance) => Object.keys(dados).filter((id) => a.lojas === 'todas' || a.lojas.includes(id)) as (keyof typeof dados)[];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(dreDoPeriodo).mockResolvedValue(null);
  vi.mocked(lerComprasDaHome).mockResolvedValue(null);
  vi.mocked(lojasDaListaDoDia).mockResolvedValue([]);
  vi.mocked(obterMes).mockImplementation(async (_c, alcance, filtro) => {
    const ids = idsDoAlcance(alcance).filter((id) => !filtro.lojaId || filtro.lojaId === id);
    return {
      lojas: ids.map((id) => ({ loja: { id, nome: dados[id].nome }, dias: [{ data: '2026-10-28', total: { valorCentavos: dados[id].centavos } }] })),
      total: { valorCentavos: ids.reduce((n, id) => n + dados[id].centavos, 0), pedidos: ids.length * 10 },
      faltas: ids.includes('lojaa') ? 3 : 0,
    } as unknown as Awaited<ReturnType<typeof obterMes>>;
  });
  vi.mocked(situacaoDoEstoque).mockImplementation(async (_c, alcance) => idsDoAlcance(alcance).map((id) => ({
    id, nome: dados[id].nome, ativa: true, estado: dados[id].estado,
    contagem: null, aberto: null, verValores: false,
  })));
  vi.mocked(saudeDoCardapio).mockResolvedValue({
    pratos: 2, prontos: 1, custoIncompleto: 0,
  } as Awaited<ReturnType<typeof saudeDoCardapio>>);
});

describe('Resumo da Home respeita visão autorizada antes de ler os módulos', () => {
  it('visão B não soma A, não mostra pendência A e usa links da mesma loja/mês', async () => {
    const p = await painelDoDia(cliente, perfil('DONO'), '/erp', HOJE, { tipo: 'loja', lojaId: 'lojab', nome: 'Loja B' });
    expect(p.indicadores.find((i) => i.chave === 'faturamento')).toMatchObject({
      valor: { tipo: 'dinheiro', centavos: 700_000 }, escopo: 'Loja B', href: '/erp/faturamento?mes=2026-10&loja=lojab',
    });
    expect(p.indicadores.find((i) => i.chave === 'estoque')).toMatchObject({
      valor: { tipo: 'fracao', de: 1, total: 1 }, escopo: 'Loja B', href: '/erp/estoque/lojab',
    });
    expect(p.pendencias.map((p) => p.chave)).not.toContain('faturamento-faltas');
    expect(p.pendencias.map((p) => p.chave)).not.toContain('estoque-abrir');
    expect(JSON.stringify(p)).not.toContain('Loja A');
    expect(vi.mocked(obterMes).mock.calls[0][1].lojas).toEqual(['lojab']);
    expect(vi.mocked(situacaoDoEstoque).mock.calls[0][1].lojas).toEqual(['lojab']);
  });

  it('rede soma A+B e mantém base de rede no aprofundamento', async () => {
    const p = await painelDoDia(cliente, perfil('DONO'), '/erp', HOJE, { tipo: 'rede' });
    expect(p.indicadores.find((i) => i.chave === 'faturamento')).toMatchObject({
      valor: { tipo: 'dinheiro', centavos: 800_000 }, escopo: 'Rede Completa', href: '/erp/faturamento?mes=2026-10&rede=1',
    });
    expect(p.indicadores.find((i) => i.chave === 'estoque')).toMatchObject({ valor: { tipo: 'fracao', de: 1, total: 2 } });
    expect(p.pendencias.find((p) => p.chave === 'estoque-abrir')).toMatchObject({ escopo: 'Rede Completa' });
  });

  it('perfil restrito a B não consegue pedir A nem Rede Completa; não consulta fonte alguma', async () => {
    const b = perfil('GERENTE', ['lojab']);
    for (const visao of [{ tipo: 'loja', lojaId: 'lojaa', nome: 'Loja A' }, { tipo: 'rede' }] as const) {
      expect(await painelDoDia(cliente, b, '/erp', HOJE, visao)).toEqual({ indicadores: [], pendencias: [] });
    }
    expect(obterMes).not.toHaveBeenCalled();
    expect(situacaoDoEstoque).not.toHaveBeenCalled();
    expect(saudeDoCardapio).not.toHaveBeenCalled();
    const p = await painelDoDia(cliente, b, '/erp', HOJE, { tipo: 'loja', lojaId: 'lojab', nome: 'Loja B' });
    expect(p.indicadores.find((i) => i.chave === 'faturamento')?.valor).toEqual({ tipo: 'dinheiro', centavos: 700_000 });
  });

  it('visão vazia/malformada nunca cai silenciosamente na rede', async () => {
    for (const lojaId of ['', '../lojaa', 'lojaa/fora']) {
      expect(await painelDoDia(cliente, perfil('DONO'), '/erp', HOJE, { tipo: 'loja', lojaId, nome: 'Inválida' }))
        .toEqual({ indicadores: [], pendencias: [] });
    }
    expect(await painelDoDia(cliente, perfil('DONO'), '/erp', HOJE, { tipo: 'nenhuma' })).toEqual({ indicadores: [], pendencias: [] });
    expect(obterMes).not.toHaveBeenCalled();
  });

  it('operador permanece sem faturamento, preços e saúde financeira do cardápio', async () => {
    const p = await painelDoDia(cliente, perfil('OPERADOR', ['lojab']), '/erp', HOJE, { tipo: 'loja', lojaId: 'lojab', nome: 'Loja B' });
    expect(p.indicadores.map((i) => i.chave)).toEqual(['estoque']);
    expect(obterMes).not.toHaveBeenCalled();
    expect(saudeDoCardapio).not.toHaveBeenCalled();
    expect(JSON.stringify(p)).not.toMatch(/centavos|custo|preço|margem/i);
  });

  it('cardápio continua da rede e assim aparece no HTML; base N1 continua no mesmo parceiro', async () => {
    const base = '/rodolfo/erp/alfa';
    const p = await painelDoDia(cliente, perfil('DONO'), base, HOJE, { tipo: 'loja', lojaId: 'lojab', nome: 'Loja B' });
    expect(p.indicadores.find((i) => i.chave === 'cardapio')).toMatchObject({ escopo: 'Da rede', href: base + '/fichas' });
    expect(p.pendencias.find((p) => p.chave === 'cardapio-preco')).toMatchObject({ escopo: 'Da rede' });
    expect(p.indicadores.every((i) => i.href.startsWith(base + '/'))).toBe(true);
    const html = renderToStaticMarkup(createElement(PainelDoDiaNaTela, { painel: p }));
    expect(html).toContain('Loja B');
    expect(html).toContain('Da rede');
    expect(html).not.toContain('Loja A');
  });
});
