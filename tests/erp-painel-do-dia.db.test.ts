/**
 * Início de trabalho (24/10/2026) no Postgres de verdade:
 * - a dona vê faturamento do mês, pratos prontos e lojas com estoque aberto, e as pendências na ordem;
 * - o operador (sem ver faturamento nem preços) recebe só o estoque, em contagem, sem nenhum valor em R$;
 * - a saúde do cardápio usa as mesmas contas da lista (prato sem preço não é pronto);
 * - isolamento: outro parceiro não vê nada disso.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff npx vitest run tests/erp-painel-do-dia.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { lancarDia } from '@/lib/erp/faturamento';
import { cadastrarFicha } from '@/lib/erp/fichas';
import { painelDoDia } from '@/lib/erp/painel-do-dia';
import { saudeDoCardapio } from '@/lib/erp/saude-do-cardapio';
import { iniciarAbertura } from '@/lib/erp/estoque';
import { salvarListaDoDia } from '@/lib/erp/producao-lista';
import { cadastrarInsumoDeTeste as cadastrarInsumo, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const alcance = (perfilBase: 'DONO' | 'OPERADOR') => resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
const HOJE = '2026-10-24';

describe.skipIf(!URL_TESTE)('Início de trabalho · Postgres real', { timeout: 90_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `p${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string };
  let B: { id: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  let lojaAId: string;

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Painel A', slug: `painel-a-${sufixo}`, status: 'ATIVO' } });
    B = await db.parceiroFlow.create({ data: { nome: 'Painel B', slug: `painel-b-${sufixo}`, status: 'ATIVO' } });
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    const loja = await cadastrarLoja(a, { nome: 'Centro' }, 'Marina');
    if (!loja.ok) throw new Error(JSON.stringify(loja));
    const lojaId = (loja as unknown as { id: string }).id;
    lojaAId = lojaId;
    // 3 dias lançados só na Loja; os outros canais que a loja vende ficam em falta.
    for (const d of ['2026-10-21', '2026-10-22', '2026-10-23']) {
      const r = await lancarDia(a, alcance('DONO'), { lojaId, data: d, canais: [{ canal: 'LOJA', valor: '1.000,00', pedidos: '20', clientes: '20', naoVendeu: false, versao: '' }] }, 'Marina', HOJE);
      if (!(r as { ok: boolean }).ok) throw new Error(JSON.stringify(r));
    }
    const ins = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', nome: 'Carne', unidade: 'KG', conservacao: 'CONGELADO', conteudo: '1', escala: 'base', preco: '40,00' });
    if (!ins.ok) throw new Error(JSON.stringify(ins));
    const f = await cadastrarFicha(a, { nome: 'Burger', tipo: 'PRATO', rendimento: '1', itens: [{ insumoId: ins.id, quantidade: '150', unidade: 'g' }] }, { tipo: 'manter' }, 'Marina');
    if (!f.ok) throw new Error(JSON.stringify(f));
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
  });

  it('saúde do cardápio: um prato ativo, custo completo, sem meta nem preço: não está pronto', async () => {
    const s = await saudeDoCardapio(a);
    expect(s).toMatchObject({ pratos: 1, prontos: 0, custoIncompleto: 0 });
    expect(s.canais.find((c) => c.canal === 'LOJA')).toMatchObject({ ofertados: 1, semMeta: 1 });
  });

  it('a dona vê faturamento, cardápio e estoque, e as pendências', async () => {
    const p = await painelDoDia(a, alcance('DONO'), '/erp', HOJE);
    expect(p.indicadores.map((i) => i.chave)).toEqual(['faturamento', 'cardapio', 'estoque']);
    expect(p.indicadores[0]).toMatchObject({ valor: { tipo: 'dinheiro', centavos: 300_000 }, href: '/erp/faturamento?mes=2026-10' });
    expect(p.indicadores[0].contexto).toContain('3 dias lançados');
    expect(p.indicadores[1]).toMatchObject({ valor: { tipo: 'fracao', de: 0, total: 1 } });
    expect(p.indicadores[2]).toMatchObject({ valor: { tipo: 'fracao', de: 0, total: 1 } });
    expect(p.pendencias.map((x) => x.chave)).toEqual(['faturamento-faltas', 'cardapio-preco', 'estoque-abrir']);
  });

  it('o operador recebe só o estoque, sem nenhum valor em reais', async () => {
    const p = await painelDoDia(a, alcance('OPERADOR'), '/erp', HOJE);
    expect(p.indicadores.map((i) => i.chave)).toEqual(['estoque']);
    expect(p.indicadores.every((i) => i.valor.tipo !== 'dinheiro')).toBe(true);
    expect(JSON.stringify(p)).not.toMatch(/R\$|centavos/);
    expect(p.pendencias.map((x) => x.chave)).toEqual(['estoque-abrir']);
  });

  it('isolamento: outro parceiro não vê o faturamento, as fichas nem as lojas de A', async () => {
    const p = await painelDoDia(b, alcance('DONO'), '/erp', HOJE);
    expect(p.indicadores).toEqual([]);
    expect(p.pendencias).toEqual([]);
    expect(p.estados?.map(({ chave, estado }) => ({ chave, estado }))).toEqual([
      { chave: 'faturamento', estado: 'sem_dados' },
      { chave: 'cardapio', estado: 'sem_dados' },
      { chave: 'estoque', estado: 'sem_dados' },
    ]);
    expect(JSON.stringify(p)).not.toMatch(/Centro|Burger|Carne|300000/);
  });

  it('sem lançamentos não informa zero; um dia marcado Não vendeu comprova zero', async () => {
    const loja = await cadastrarLoja(b, { nome: 'Loja sem lançamentos' }, 'Marina');
    if (!loja.ok) throw new Error(JSON.stringify(loja));
    const sem = await painelDoDia(b, alcance('DONO'), '/erp', HOJE);
    expect(sem.indicadores.find((i) => i.chave === 'faturamento')).toMatchObject({
      valor: { tipo: 'dinheiro', centavos: null }, contexto: 'nenhum dia lançado ainda',
    });
    const zero = await lancarDia(b, alcance('DONO'), {
      lojaId: loja.id, data: '2026-10-23',
      canais: [{ canal: 'LOJA', valor: '', pedidos: '', clientes: '', naoVendeu: true, versao: '' }],
    }, 'Marina', HOJE);
    expect(zero.ok).toBe(true);
    const informado = await painelDoDia(b, alcance('DONO'), '/erp', HOJE);
    expect(informado.indicadores.find((i) => i.chave === 'faturamento')).toMatchObject({
      valor: { tipo: 'dinheiro', centavos: 0 },
    });
  });

  it('visão da loja B separa seus valores/pendências de A; rede e alcance restrito continuam corretos', async () => {
    const nova = await cadastrarLoja(a, { nome: 'Loja B da visão' }, 'Marina');
    if (!nova.ok) throw new Error(JSON.stringify(nova));
    const lojaBId = nova.id;
    const lancamento = await lancarDia(a, alcance('DONO'), {
      lojaId: lojaBId, data: '2026-10-23',
      canais: [{ canal: 'LOJA', valor: '7.000,00', pedidos: '70', clientes: '70', naoVendeu: false, versao: '' }],
    }, 'Marina', HOJE);
    expect(lancamento.ok).toBe(true);
    expect((await iniciarAbertura(a, alcance('DONO'), lojaBId, 'Marina')).ok).toBe(true);
    const pa = await painelDoDia(a, alcance('DONO'), '/erp', HOJE, { tipo: 'loja', lojaId: lojaAId, nome: 'Centro' });
    const pb = await painelDoDia(a, alcance('DONO'), '/erp', HOJE, { tipo: 'loja', lojaId: lojaBId, nome: 'Loja B da visão' });
    const rede = await painelDoDia(a, alcance('DONO'), '/erp', HOJE, { tipo: 'rede' });
    expect(pa.indicadores.find((i) => i.chave === 'faturamento')?.valor).toEqual({ tipo: 'dinheiro', centavos: 300_000 });
    expect(pb.indicadores.find((i) => i.chave === 'faturamento')).toMatchObject({
      valor: { tipo: 'dinheiro', centavos: 700_000 }, escopo: 'Loja B da visão',
      href: '/erp/faturamento?mes=2026-10&loja=' + lojaBId,
    });
    expect(rede.indicadores.find((i) => i.chave === 'faturamento')?.valor).toEqual({ tipo: 'dinheiro', centavos: 1_000_000 });
    expect(pb.indicadores.find((i) => i.chave === 'estoque')?.valor).toEqual({ tipo: 'fracao', de: 0, total: 1 });
    expect(rede.indicadores.find((i) => i.chave === 'estoque')?.valor).toEqual({ tipo: 'fracao', de: 0, total: 2 });
    expect(pa.pendencias.map((p) => p.chave)).toContain('estoque-abrir');
    expect(pb.pendencias.map((p) => p.chave)).toContain('estoque-contagem');
    expect(pb.pendencias.map((p) => p.chave)).not.toContain('estoque-abrir');
    expect(JSON.stringify(pb)).not.toContain('Centro');
    const restrito = resolverAlcance({
      perfilBase: 'GERENTE', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [],
      redeInteira: false, lojaIds: [lojaBId],
    });
    expect(await painelDoDia(a, restrito, '/erp', HOJE, { tipo: 'loja', lojaId: lojaAId, nome: 'Centro' }))
      .toEqual({ indicadores: [], pendencias: [] });
    expect(await painelDoDia(a, restrito, '/erp', HOJE, { tipo: 'rede' })).toEqual({ indicadores: [], pendencias: [] });
    const permitido = await painelDoDia(a, restrito, '/erp', HOJE, { tipo: 'loja', lojaId: lojaBId, nome: 'Loja B da visão' });
    expect(permitido.indicadores.find((i) => i.chave === 'faturamento')?.valor).toEqual({ tipo: 'dinheiro', centavos: 700_000 });
    expect(pb.indicadores.find((i) => i.chave === 'cardapio')?.escopo).toBe('Da rede');
  });

  it('produção usa a lista real da loja selecionada, sem custos ou efeitos ao consultar; outro parceiro não a recebe', async () => {
    const nova = await cadastrarLoja(a, { nome: 'Produção B sintética' }, 'Marina');
    if (!nova.ok) throw new Error(JSON.stringify(nova));
    const lojaB = nova.id;
    const ingrediente = await a.insumo.findFirst({ where: { nome: 'Carne' }, select: { id: true } });
    if (!ingrediente) throw new Error('Ingrediente sintético ausente.');
    const fichas: string[] = [];
    for (const nome of ['Pré-preparo QA um', 'Pré-preparo QA dois']) {
      const ficha = await cadastrarFicha(a, {
        nome, tipo: 'PRE_PREPARO', rendimento: '1', rendimentoUnidade: 'kg',
        itens: [{ insumoId: ingrediente.id, quantidade: '1', unidade: 'kg' }],
        validade: { principal: 'REFRIGERADO', linhas: { REFRIGERADO: { marcada: true, quantidade: '3', em: 'dias' } } },
      } as never, { tipo: 'manter' }, 'Marina');
      if (!ficha.ok) throw new Error(JSON.stringify(ficha));
      fichas.push(ficha.id);
    }
    const agora = new Date(`${HOJE}T16:00:00.000Z`);
    for (const [lojaId, escolhidas] of [[lojaAId, fichas.slice(0, 1)], [lojaB, fichas]] as const) {
      const r = await salvarListaDoDia(a, alcance('DONO'), lojaId, {
        dia: HOJE, versao: '', linhaIds: escolhidas.map(() => ''), fichaIds: escolhidas, quantidades: escolhidas.map(() => '1'),
      }, { nome: 'Marina' }, agora);
      expect(r.ok).toBe(true);
    }
    const operacao: Alcance = { nivel: 'LOJA', lojas: [lojaB], permissoes: new Set(['producao.ver']) };
    const visao = { tipo: 'loja', lojaId: lojaB, nome: 'Produção B sintética' } as const;
    const antes = await Promise.all([a.listaProducao.count(), a.listaProducaoItem.count(), a.ordemProducao.count(), a.movimentoEstoque.count()]);
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const p = await painelDoDia(a, operacao, '/erp', agora, visao);
      expect(p.indicadores).toEqual([expect.objectContaining({
        chave: 'producao', valor: { tipo: 'numero', numero: 2 },
        contexto: '2 pré-preparos ainda sem lote ativo. A lista inclui os que já viraram lote.',
        href: `/erp/producao/lista/${lojaB}?dia=${HOJE}`,
      })]);
      expect(p.estados?.[0]).toMatchObject({ chave: 'producao', estado: 'ok' });
      expect(JSON.stringify(p)).not.toMatch(/centavos|custo|Carne|Centro/);
    }
    expect(await Promise.all([a.listaProducao.count(), a.listaProducaoItem.count(), a.ordemProducao.count(), a.movimentoEstoque.count()])).toEqual(antes);
    const outroParceiro = await painelDoDia(b, operacao, '/erp', agora, visao);
    expect(outroParceiro.indicadores).toEqual([]);
    expect(outroParceiro.pendencias).toEqual([]);
    expect(outroParceiro.estados?.[0]).toMatchObject({ chave: 'producao', estado: 'sem_dados' });
    expect(await painelDoDia(a, operacao, '/erp', agora, { tipo: 'loja', lojaId: lojaAId, nome: 'Centro' })).toEqual({ indicadores: [], pendencias: [] });
    const rede = await painelDoDia(a, alcance('DONO'), '/erp', agora, { tipo: 'rede' });
    expect(rede.estados?.some((e) => e.chave === 'producao')).toBe(false);
  });
});
