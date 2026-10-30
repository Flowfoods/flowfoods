/** H2: adaptador estreito comparado ao relatório canônico, com Postgres real local.
 * Execução centralizada pelo root: ERP_DB_TESTE=... vitest run tests/erp-home-compras.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { resolverAlcance } from '@/lib/erp/permissoes';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { cadastrarFornecedor, cancelarNota, lancarNota } from '@/lib/erp/compras';
import { resolverRecorte, totaisDoRecorte, relatorioDaTela } from '@/lib/erp/compras-relatorio';
import { comprasAnaliticas, filtrosDeComprasHome, lerComprasDaHome } from '@/lib/erp/home-compras';
import { cadastrarInsumoDeTeste, cru, limparParceiros, perfilDoBanco, SEM_NOTA_FISCAL, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const HOJE = '2026-10-29';
const acesso = (lojas: string[] | 'rede' = 'rede', perfilBase: 'DONO' | 'OPERADOR' = 'DONO') => resolverAlcance({
  perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [],
  redeInteira: lojas === 'rede', lojaIds: lojas === 'rede' ? [] : lojas,
});

describe.skipIf(!URL_TESTE)('Home H2 · Compras e relatório canônico no Postgres local', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  let A: { id: string };
  let B: { id: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  let lojaA: string;
  let outraLoja: string;
  let lojaB: string;
  const sufixo = globalThis.crypto.randomUUID().slice(0, 8);

  async function loja(cliente: ClienteDoParceiro, nome: string) {
    const r = await cadastrarLoja(cliente, { nome }, 'Teste H2');
    if (!r.ok) throw new Error(JSON.stringify(r));
    return r.id;
  }

  async function fornecedorEInsumo(cliente: ClienteDoParceiro) {
    const fornecedor = await cadastrarFornecedor(cliente, { nome: 'Fornecedor H2', ...SEM_NOTA_FISCAL }, 'Teste H2');
    const insumo = await cadastrarInsumoDeTeste(cliente, { nome: 'Muçarela H2', tipo: 'INGREDIENTE', unidade: 'KG', escala: 'base', conteudo: '1', preco: '10,00' });
    if (!fornecedor.ok || !insumo.ok) throw new Error('Não foi possível montar a compra sintética H2.');
    return { fornecedorId: fornecedor.id, insumoId: insumo.id };
  }

  async function nota(cliente: ClienteDoParceiro, ids: { fornecedorId: string; insumoId: string }, lojaId: string, numero: string, data: string, valor: string, frete = '', total = valor) {
    const r = await lancarNota(cliente, acesso(), {
      lojaId, fornecedorId: ids.fornecedorId, numero, serie: '', data, frete, total,
      itens: [{ insumoId: ids.insumoId, embalagem: 'padrao', quantidade: '1', valor }],
    }, 'Teste H2');
    if (!r.ok) throw new Error(JSON.stringify(r));
    return r.id;
  }

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Home compras A', slug: 'home-compras-a-' + sufixo, status: 'ATIVO' } });
    B = await db.parceiroFlow.create({ data: { nome: 'Home compras B', slug: 'home-compras-b-' + sufixo, status: 'ATIVO' } });
    a = doParceiro(A.id, db); b = doParceiro(B.id, db);
    lojaA = await loja(a, 'Loja A'); outraLoja = await loja(a, 'Outra loja'); lojaB = await loja(b, 'Loja B');
    const idsA = await fornecedorEInsumo(a); const idsB = await fornecedorEInsumo(b);
    const valida = await nota(a, idsA, lojaA, 'H2-1', '2026-10-28', '1.700,00', '50,00', '1.750,00');
    const cancelada = await nota(a, idsA, lojaA, 'H2-2', '2026-10-28', '9.000,00');
    const cancelou = await cancelarNota(a, acesso(), cancelada, 'Cancelamento sintético do teste H2', 'Teste H2');
    if (!cancelou.ok) throw new Error(JSON.stringify(cancelou));
    const foraDoMes = await nota(a, idsA, lojaA, 'H2-3', '2026-09-30', '600,00');
    await nota(a, idsA, lojaA, 'H2-4', '2026-10-30', '700,00');
    await nota(a, idsA, outraLoja, 'H2-5', '2026-10-28', '2.000,00');
    await nota(b, idsB, lojaB, 'H2-1', '2026-10-28', '999,00');
    // Entrada, emissão e instante de lançamento divergem de propósito: a Home usa ENTRADA.
    await cru(db, perfil, A.id, 'UPDATE "NotaEntrada" SET "emitidaEm" = \'2026-09-30\', "lancadaEm" = \'2026-09-30 12:00:00\' WHERE id = $1', valida);
    await cru(db, perfil, A.id, 'UPDATE "NotaEntrada" SET "emitidaEm" = \'2026-10-15\', "lancadaEm" = \'2026-10-15 12:00:00\' WHERE id = $1', foraDoMes);
  });

  afterAll(async () => {
    if (db && perfil) await limparParceiros(db, perfil, [A?.id, B?.id].filter((id): id is string => !!id));
    await db?.$disconnect();
  });

  it('copia exatamente os totais canônicos e o relatório: R$ 1.700 + R$ 50 de frete, uma única vez', async () => {
    const filtros = filtrosDeComprasHome(lojaA, HOJE);
    expect(filtros).toMatchObject({ lojaIds: [lojaA], base: 'entrada', situacao: 'lancadas', de: '2026-10-01', ate: HOJE });
    const dados = await lerComprasDaHome(a, acesso(), lojaA, HOJE);
    expect(dados?.tipo).toBe('totais');
    if (dados?.tipo !== 'totais') throw new Error('Era esperado um recorte real de compras.');
    const totalDireto = await a.transacao(async (tx) => {
      const { recorte, motivo } = await resolverRecorte(tx, acesso([lojaA]), filtros);
      expect(motivo).toBeNull();
      if (!recorte) throw new Error('Recorte canônico ausente.');
      return totaisDoRecorte(tx, recorte);
    }, { repetivel: true, relatorio: {} });
    const relatorio = await relatorioDaTela(a, acesso([lojaA]), filtros, 'periodo');
    expect(dados.totais).toEqual(totalDireto);
    expect(dados.totais).toEqual(relatorio.totais);
    expect(dados.totais).toMatchObject({ notas: 1, linhas: 1, valorCentavos: 170_000, freteCentavos: 5_000, totalCentavos: 175_000 });
    const widget = comprasAnaliticas({ estado: 'lido', dados }, { alcance: acesso([lojaA]), loja: { id: lojaA, nome: 'Loja A' }, raiz: '/erp', hoje: HOJE, consultadoEm: '2026-10-29T15:00:00.000Z' });
    expect(widget).toMatchObject({ estado: 'ok', valor: { unidade: 'centavos', valor: 175_000 }, notas: 1, itensCentavos: 170_000, freteCentavos: 5_000 });
    expect(widget?.detalhe.href).toContain('base=entrada');
  });

  it('outra loja e outro parceiro têm seus próprios totais, sem consolidado implícito', async () => {
    const outra = await lerComprasDaHome(a, acesso([outraLoja]), outraLoja, HOJE);
    const deB = await lerComprasDaHome(b, acesso([lojaB]), lojaB, HOJE);
    expect(outra).toMatchObject({ tipo: 'totais', totais: { notas: 1, totalCentavos: 200_000 } });
    expect(deB).toMatchObject({ tipo: 'totais', totais: { notas: 1, totalCentavos: 99_900 } });
  });

  it('recusa alcance forjado e operador; o cliente B também não resolve a loja de A', async () => {
    expect(await lerComprasDaHome(a, acesso([outraLoja]), lojaA, HOJE)).toBeNull();
    expect(await lerComprasDaHome(a, acesso([lojaA], 'OPERADOR'), lojaA, HOJE)).toBeNull();
    const cruzado = await lerComprasDaHome(b, acesso(), lojaA, HOJE);
    expect(cruzado?.tipo).not.toBe('totais');
    expect(JSON.stringify(cruzado)).not.toMatch(/175000|170000|5000/);
  });
});
