import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { CanalVenda, FichaTipo } from '@prisma/client';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import { juntarUsos, ondeOInsumoEUsado, TETO_DE_USOS, type OndeEUsado } from '../src/lib/erp/onde-e-usado';
import { PainelOndeEUsado } from '../src/components/erp/telas/insumos/onde-e-usado';

type Ficha = { id: string; nome: string; ativa: boolean; tipo: FichaTipo };
const ficha = (id: string, alteracoes: Partial<Ficha> = {}): Ficha => ({ id, nome: `Ficha ${id}`, ativa: true, tipo: 'PRATO', ...alteracoes });

function clienteSintetico(dados: {
  fichas: Ficha[];
  total?: number;
  receita?: { fichaId: string; _sum: { quantidadeMilesimos: number | null } }[];
  embalagem?: { fichaId: string; canal: CanalVenda }[];
}) {
  const tx = {
    parceiroId: 'parceiro-sintetico',
    fichaTecnica: { findMany: vi.fn(async () => dados.fichas), count: vi.fn(async () => dados.total ?? dados.fichas.length) },
    fichaItem: { groupBy: vi.fn(async () => dados.receita ?? []) },
    sql: vi.fn(async () => dados.embalagem ?? []),
  };
  const transacao = vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx));
  return { tx, transacao, cliente: { transacao } as unknown as ClienteDoParceiro };
}

describe('Onde é usado · projeção limitada por fichas', () => {
  it('67 fichas com três vínculos de produtos são completas: 201 linhas não significam corte', async () => {
    const fichas = Array.from({ length: 67 }, (_,i) => ficha(`f${i}`));
    const canais: CanalVenda[] = ['DELIVERY_PROPRIO', 'DELIVERY_PROPRIO', 'IFOOD'];
    const c = clienteSintetico({ fichas, embalagem: fichas.flatMap((f) => canais.map((canal) => ({ fichaId: f.id, canal }))) });
    const o = await ondeOInsumoEUsado(c.cliente, 'embalagem', 'UN');
    expect(o).toMatchObject({ total: 67, cortada: false, unidade: 'UN' });
    expect(o.usos).toHaveLength(67);
    for (const u of o.usos) expect(u).toMatchObject({ naReceitaMilesimos: null, embalagemEm: ['DELIVERY_PROPRIO', 'IFOOD'] });
  });

  it('mantém soma integral, canais, tipo e ordem sem expor custos ou outra identidade', async () => {
    const c = clienteSintetico({
      fichas: [ficha('z', { nome: 'Antiga', ativa: false }), ficha('b', { nome: 'Burger' }), ficha('a', { nome: 'Açaí', tipo: 'PRE_PREPARO' })],
      receita: [{ fichaId: 'b', _sum: { quantidadeMilesimos: 250 } }, { fichaId: 'a', _sum: { quantidadeMilesimos: 1000 } }],
      embalagem: [{ fichaId: 'b', canal: 'IFOOD' }, { fichaId: 'b', canal: 'DELIVERY_PROPRIO' }, { fichaId: 'z', canal: 'DELIVERY_PROPRIO' }, { fichaId: 'fora-da-selecao', canal: 'DELIVERY_PROPRIO' }],
    });
    const o = await ondeOInsumoEUsado(c.cliente, 'insumo-atual', 'KG');
    expect(o.usos.map((u) => u.nome)).toEqual(['Açaí', 'Burger', 'Antiga']);
    expect(o.usos[0]).toMatchObject({ tipo: 'PRE_PREPARO', naReceitaMilesimos: 1000, embalagemEm: [] });
    expect(o.usos[1]).toMatchObject({ naReceitaMilesimos: 250, embalagemEm: ['DELIVERY_PROPRIO', 'IFOOD'] });
    expect(o.usos[2]).toMatchObject({ ativa: false, naReceitaMilesimos: null });
    expect(JSON.stringify(o)).not.toMatch(/custo|preco|parceiro|fora-da-selecao/);
  });

  it.each([200, 201, 800])('só há corte quando %i fichas distintas excedem as exibidas', async (total) => {
    const fichas = Array.from({ length: 200 }, (_,i) => ficha(`f${i}`));
    const c = clienteSintetico({ fichas, total, receita: fichas.map((f) => ({ fichaId: f.id, _sum: { quantidadeMilesimos: 10 } })) });
    const o = await ondeOInsumoEUsado(c.cliente, 'insumo-atual', 'KG');
    expect(o.total).toBe(total);
    expect(o.usos).toHaveLength(200);
    expect(o.cortada).toBe(total > 200);
  });

  it('seleção e contagem usam o mesmo insumo; detalhes só recebem IDs limitados e parâmetros', async () => {
    const id = "insumo' sintético";
    const fichas = [ficha('id1'), ficha('id2')];
    const c = clienteSintetico({ fichas });
    await ondeOInsumoEUsado(c.cliente, id, 'UN');
    expect(c.transacao).toHaveBeenCalledWith(expect.any(Function), { repetivel: true });
    const selecao = c.tx.fichaTecnica.findMany.mock.calls[0] as unknown as [{ where: unknown; take: number; orderBy: unknown }];
    expect(selecao[0].take).toBe(TETO_DE_USOS);
    expect(selecao[0].where).toEqual({ OR: [{ itens: { some: { insumoId: id } } }, { produtos: { some: { embalagens: { some: { insumoId: id } } } } }] });
    expect(c.tx.fichaTecnica.count).toHaveBeenCalledWith({ where: selecao[0].where });
    expect(selecao[0].orderBy).toEqual([{ ativa: 'desc' }, { nome: 'asc' }, { id: 'asc' }]);
    expect(c.tx.fichaItem.groupBy).toHaveBeenCalledWith({ by: ['fichaId'], where: { insumoId: id, fichaId: { in: ['id1', 'id2'] } }, _sum: { quantidadeMilesimos: true } });
    const [partes, parceiro, insumo, ids] = c.tx.sql.mock.calls[0] as unknown as [TemplateStringsArray, string, string, string[]];
    expect(partes.join(' ')).toContain('SELECT DISTINCT');
    expect(partes.join(' ')).not.toContain(id);
    expect([parceiro, insumo, ids]).toEqual(['parceiro-sintetico', id, ['id1', 'id2']]);
    expect(c.tx.sql).toHaveBeenCalledTimes(1);
    expect(c.tx.fichaItem.groupBy).toHaveBeenCalledTimes(1);
  });

  it('sem vínculos não consulta detalhes nem inventa uso de uma composição indireta', async () => {
    const c = clienteSintetico({ fichas: [] });
    expect(await ondeOInsumoEUsado(c.cliente, 'sem-uso-direto', 'L')).toEqual({ usos: [], total: 0, cortada: false, unidade: 'L' });
    expect(c.tx.sql).not.toHaveBeenCalled(); expect(c.tx.fichaItem.groupBy).not.toHaveBeenCalled();
  });

  it('falha de uma origem não vira lista incompleta com aparência de sucesso', async () => {
    const c = clienteSintetico({ fichas: [ficha('a')] });
    c.tx.sql.mockRejectedValueOnce(new Error('falha sintética'));
    await expect(ondeOInsumoEUsado(c.cliente, 'a', 'UN')).rejects.toThrow('falha sintética');
  });

  it('a junção preserva soma de duplicatas legadas e canais únicos', () => {
    const f = { fichaId: 'a', nome: 'Ficha', tipo: 'PRATO' as const, ativa: true };
    expect(juntarUsos([{ ...f, quantidadeMilesimos: 100 }, { ...f, quantidadeMilesimos: 250 }], [{ ...f, canal: 'IFOOD' }, { ...f, canal: 'IFOOD' }, { ...f, canal: 'DELIVERY_PROPRIO' }]))
      .toEqual([{ ...f, naReceitaMilesimos: 350, embalagemEm: ['DELIVERY_PROPRIO', 'IFOOD'] }]);
  });
});

describe('Onde é usado · apresentação', () => {
  const dados = (): OndeEUsado => ({ total: 1, cortada: false, unidade: 'KG', usos: [{ fichaId: 'ficha1', nome: '<script>Nome & seguro</script>', tipo: 'PRE_PREPARO', ativa: false, naReceitaMilesimos: 1000, embalagemEm: ['DELIVERY_PROPRIO', 'IFOOD'] }] });
  const html = (onde: OndeEUsado) => renderToStaticMarkup(createElement(PainelOndeEUsado, { onde, fichasBase: '/rodolfo/erp/qa/fichas' }));

  it('uma ficha completa mantém quantidade/canais, tipo, identidade escapada e raiz do link', () => {
    const h = html(dados());
    expect(h).toContain('&lt;script&gt;Nome &amp; seguro&lt;/script&gt;'); expect(h).not.toContain('<script>');
    expect(h).toContain('/rodolfo/erp/qa/fichas/ficha1'); expect(h).toContain('Pré-preparo');
    expect(h).toContain('Mudar este insumo muda esta ficha');
    expect(h).toContain('Desativada'); expect(h).toContain('1 kg na receita'); expect(h).toContain('embalagem: Delivery, iFood');
    expect(h).not.toMatch(/Mostrando|R\$|custo|preço/);
  });

  it('contagem cortada nomeia fichas completas, sem confundir canais com fichas', () => {
    const h = html({ ...dados(), total: 201, cortada: true });
    expect(h).toContain('Mudar este insumo muda estas fichas');
    expect(h).toContain('Mostrando 1 de 201 fichas. Os usos diretos das fichas exibidas estão completos.');
  });

  it('estado vazio e ausência de quantidade não viram quantidade zero', () => {
    const h = html({ ...dados(), total: 0, usos: [] });
    expect(h).toContain('Nenhuma ficha técnica leva este insumo'); expect(h).not.toContain('Mostrando');
    const soEmbalagem = dados(); soEmbalagem.usos[0].naReceitaMilesimos = null;
    expect(html(soEmbalagem)).not.toContain('na receita');
  });
});
