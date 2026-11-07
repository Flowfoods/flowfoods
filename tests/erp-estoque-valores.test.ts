import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolverAlcance } from '@/lib/erp/permissoes';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import { resumoDoQueFalta, previaDaClassificacao, filaDeRevisao } from '@/lib/erp/classificar';
import { divergenciasOperacionais } from '@/lib/erp/divergencias-operacionais';
import { divergenciasDoPeriodo } from '@/lib/erp/requisicao-campos';
import { AvisoDaClassificacao } from '@/components/erp/telas/insumos/aviso-classificar';
import { lerFiltroDoPlanejamento } from '@/components/erp/telas/estoque/planejar';

const alcance = (compras: boolean, lojaIds: string[] = ['a']) => resolverAlcance({ perfilBase: null, perfilProprio: ['insumos.ver', 'estoque.ver', ...(compras ? ['compras.ver' as const] : [])], permissoesExtras: [], permissoesRemovidas: [], redeInteira: false, lojaIds });
const cliente = () => ({
  loja: { findMany: vi.fn(async () => [{ id: 'a' }, { id: 'b' }]) },
  insumo: { count: vi.fn(async () => 1), findMany: vi.fn(async () => [{ id: 'i', nome: 'Insumo teste', ativo: true, tipo: 'INGREDIENTE', categoria: null, classificacaoMotivo: null }]) },
  categoriaInsumo: { findMany: vi.fn(async () => []) },
  saldoEstoque: { aggregate: vi.fn(async () => ({ _sum: { valorCentavos: 12345 } })), groupBy: vi.fn(async () => [{ insumoId: 'i', _sum: { valorCentavos: 12345 } }]) },
});

describe('política monetária de estoque', () => {
  it('classificação sem compras não consulta agregados financeiros nem produz zeros artificiais', async () => {
    const db = cliente(), c = db as unknown as ClienteDoParceiro;
    expect(await resumoDoQueFalta(c, alcance(false))).toMatchObject({ total: 2, valorCentavos: null, visibilidadeDoValor: 'indisponivel' });
    const previa = await previaDaClassificacao(c, alcance(false));
    const fila = await filaDeRevisao(c, alcance(false));
    expect(previa.linhas[0].valorCentavos).toBeNull();
    expect(fila.linhas[0].valorCentavos).toBeNull();
    expect(db.saldoEstoque.aggregate).not.toHaveBeenCalled();
    expect(db.saldoEstoque.groupBy).not.toHaveBeenCalled();
  });

  it('o recorte de lojas é aplicado antes de aggregate e groupBy nas três saídas', async () => {
    const db = cliente(), c = db as unknown as ClienteDoParceiro;
    expect((await resumoDoQueFalta(c, alcance(true))).valorCentavos).toBe(12345);
    await previaDaClassificacao(c, alcance(true));
    await filaDeRevisao(c, alcance(true));
    for (const mock of [db.saldoEstoque.aggregate, db.saldoEstoque.groupBy]) {
      for (const args of mock.mock.calls as unknown as [{ where: { lojaId: { in: string[] } } }][]) expect(args[0].where.lojaId.in).toEqual(['a']);
    }
  });

  it('o aviso nomeia o recorte e identifica explicitamente o valor parcial', () => {
    const html = renderToStaticMarkup(createElement(AvisoDaClassificacao, { resumo: { semCategoria: 1, emOutros: 0, total: 1, valorCentavos: 12345, visibilidadeDoValor: 'parcial' } }));
    expect(html).toContain('nas lojas com acesso aos valores (valor parcial)');
  });

  it('parâmetros duplicados não escolhem classe e a seleção manual tem endereço próprio', () => {
    expect(lerFiltroDoPlanejamento({ quais: ['A', 'todos'] }).quais).toBe('vencidos');
    expect(lerFiltroDoPlanejamento({ quais: 'manual' }).quais).toBe('manual');
  });

  it('divergências físicas conservam a fórmula e não recebem custo ou tolerância', () => {
    const janela = { de: new Date('2026-10-01'), ate: new Date('2026-11-01') };
    const itens = ['Zebra', 'Abacate'].map((nome, i) => ({ insumoId: String(i), nome, unidade: 'KG' as const,
      marcos: [{ instante: new Date('2026-10-02'), contadoMilesimos: 10000 }, { instante: new Date('2026-10-10'), contadoMilesimos: 6000 }],
      fluxos: [{ tipo: 'REQUISICAO' as const, quantidadeMilesimos: -3000, ocorridoEm: new Date('2026-10-05'), setor: i ? 'COZINHA' : 'BAR' }],
    }));
    const fisico = divergenciasOperacionais(itens, janela);
    expect(fisico.linhas.map((l) => l.nome)).toEqual(['Abacate', 'Zebra']);
    for (const custo of [null, { num: 2000n, den: 1n }]) {
      const financeiro = divergenciasDoPeriodo(itens.map((i) => ({ ...i, porUnidade: custo })), janela, 100);
      for (const l of fisico.linhas) {
        const f = financeiro.find((x) => x.insumoId === l.insumoId)!;
        for (const campo of ['consumoMilesimos', 'requisitadoMilesimos', 'outrasSaidasMilesimos', 'sumicoMilesimos', 'trechos'] as const) expect(l[campo]).toBe(f[campo]);
        expect(l).toMatchObject({ sumicoCentavos: null, pequenos: null });
      }
    }
    expect(fisico.resumo).toMatchObject({ comSumico: 2, comSobra: 0, semPreco: null, pequenosRepetidos: null });
    expect(fisico.setores.every((s) => s.sumicoNosSeusCentavos === null && s.requisitadoCentavos === null)).toBe(true);
  });
});
