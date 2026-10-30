/** Rodada 9: preparar somente. O root executa com ERP_DB_TESTE local e três perfis. */
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { resolverAlcance } from '@/lib/erp/permissoes';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { cadastrarFornecedor, cancelarNota, lancarNota } from '@/lib/erp/compras';
import * as relatorios from '@/lib/erp/compras-relatorio';
import { comprasAnaliticas, filtrosDeComprasHome, lerComprasDaHome, type DadosComprasHome } from '@/lib/erp/home-compras';
import { cadastrarInsumoDeTeste, cru, limparParceiros, perfilDoBanco, SEM_NOTA_FISCAL, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const HOJE = '2026-10-29';
const acesso = (lojas: string[] | 'rede' = 'rede', perfilBase: 'DONO' | 'OPERADOR' = 'DONO') => resolverAlcance({
  perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [],
  redeInteira: lojas === 'rede', lojaIds: lojas === 'rede' ? [] : lojas,
});
const exigirTotais = (d: DadosComprasHome | null): Extract<DadosComprasHome, { tipo: 'totais' }> => {
  if (d?.tipo !== 'totais') throw new Error('Era esperada uma leitura autorizada de totais.');
  return d;
};

describe.skipIf(!URL_TESTE)('Home · composição por categoria atual no Postgres local', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  let A: { id: string };
  let B: { id: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  let lojaA: string;
  let outraLoja: string;
  let lojaVazia: string;
  let lojaB: string;
  let fornecedorA: string;
  let notaPrincipal: string;
  const insumos: string[] = [];
  const categorias: string[] = [];
  const sufixo = globalThis.crypto.randomUUID().slice(0, 8);

  async function loja(cliente: ClienteDoParceiro, nome: string) {
    const r = await cadastrarLoja(cliente, { nome }, 'Teste categorias Home');
    if (!r.ok) throw new Error(JSON.stringify(r));
    return r.id;
  }
  async function fornecedor(cliente: ClienteDoParceiro) {
    const r = await cadastrarFornecedor(cliente, { nome: 'Fornecedor categorias Home', ...SEM_NOTA_FISCAL }, 'Teste categorias Home');
    if (!r.ok) throw new Error(JSON.stringify(r));
    return r.id;
  }
  async function insumo(cliente: ClienteDoParceiro, nome: string, categoriaId: string) {
    const r = await cadastrarInsumoDeTeste(cliente, { nome, tipo: 'INGREDIENTE', unidade: 'KG', escala: 'base', conteudo: '1', preco: '10,00', categoriaId });
    if (!r.ok) throw new Error(JSON.stringify(r));
    return r.id;
  }
  async function pequena(cliente: ClienteDoParceiro, fornecedorId: string, insumoId: string, lojaId: string, numero: string, data: string, valor: string) {
    const r = await lancarNota(cliente, acesso(), { fornecedorId, lojaId, numero, serie: '', data, total: valor, frete: '', itens: [{ insumoId, embalagem: 'padrao', quantidade: '1', valor }] }, 'Teste categorias Home');
    if (!r.ok) throw new Error(JSON.stringify(r));
    return r.id;
  }
  const ler = () => lerComprasDaHome(a, acesso([lojaA]), lojaA, HOJE);
  const widget = (dados: DadosComprasHome | null) => comprasAnaliticas({ estado: 'lido', dados }, { alcance: acesso([lojaA]), loja: { id: lojaA, nome: 'Loja A' }, raiz: '/erp', hoje: HOJE, consultadoEm: '2026-10-29T15:00:00.000Z' })!;

  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } }); perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Categorias Home A', slug: 'home-categorias-a-' + sufixo, status: 'ATIVO' } });
    B = await db.parceiroFlow.create({ data: { nome: 'Categorias Home B', slug: 'home-categorias-b-' + sufixo, status: 'ATIVO' } });
    a = doParceiro(A.id, db); b = doParceiro(B.id, db);
    lojaA = await loja(a, 'Loja A'); outraLoja = await loja(a, 'Outra loja A'); lojaVazia = await loja(a, 'Sem compras'); lojaB = await loja(b, 'Loja B');
    fornecedorA = await fornecedor(a);
    // Categorias próprias da fixture, todas válidas, sem semear metas/custeio.
    for (let i = 0; i < 9; i++) {
      const cat = await a.categoriaInsumo.create({ data: { parceiroId: A.id, nome: 'Categoria Home ' + i, ordem: 200 + i * 10 } });
      categorias.push(cat.id); insumos.push(await insumo(a, 'Ingrediente Home ' + i, cat.id));
    }
    const principal = await lancarNota(a, acesso(), {
      lojaId: lojaA, fornecedorId: fornecedorA, numero: 'CAT-1', serie: '', data: '2026-10-28', total: '459,00', frete: '9,00',
      itens: insumos.map((insumoId, i) => ({ insumoId, embalagem: 'padrao', quantidade: '1', valor: String(90 - i * 10) + ',00' })),
    }, 'Teste categorias Home');
    if (!principal.ok) throw new Error(JSON.stringify(principal)); notaPrincipal = principal.id;
    // Legado válido: insumo atual sem categoria. A compra continua com seus snapshots de valor/frete.
    await a.insumo.update({ where: { id: insumos[0] }, data: { categoriaId: null, classificadoPor: null, classificadoEm: null, classificacaoMotivo: null, classificacaoLote: null } });
    const cancelada = await pequena(a, fornecedorA, insumos[1], lojaA, 'CAT-CANCELADA', '2026-10-28', '9.000,00');
    const r = await cancelarNota(a, acesso(), cancelada, 'Cancelamento sintético das categorias Home', 'Teste categorias Home');
    if (!r.ok) throw new Error(JSON.stringify(r));
    await pequena(a, fornecedorA, insumos[1], outraLoja, 'CAT-OUTRA-LOJA', '2026-10-28', '2.000,00');
    await pequena(a, fornecedorA, insumos[1], lojaA, 'CAT-MES-ANTERIOR', '2026-09-30', '600,00');
    await pequena(a, fornecedorA, insumos[1], lojaA, 'CAT-FUTURO', '2026-10-30', '700,00');
    const catB = await b.categoriaInsumo.create({ data: { parceiroId: B.id, nome: 'Categoria exclusiva parceiro B', ordem: 200 } });
    const insB = await insumo(b, 'Ingrediente exclusivo B', catB.id);
    await pequena(b, await fornecedor(b), insB, lojaB, 'CAT-B', '2026-10-28', '999,00');
    // Data de emissão/lançamento fora do mês prova que a seleção é pela ENTRADA.
    await cru(db, perfil, A.id, 'UPDATE "NotaEntrada" SET "emitidaEm" = \'2026-09-30\', "lancadaEm" = \'2026-09-30 12:00:00\' WHERE id = $1', notaPrincipal);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    if (db && perfil) await limparParceiros(db, perfil, [A?.id, B?.id].filter((id): id is string => !!id));
    await db?.$disconnect();
  });

  it('mesmo recorte/transação da Home confere com fonte e relatório: itens45000 + frete900, sem cancelada/outro contexto', async () => {
    const d = exigirTotais(await ler());
    const filtros = filtrosDeComprasHome(lojaA, HOJE);
    const direto = await a.transacao(async tx => {
      const { recorte, motivo } = await relatorios.resolverRecorte(tx, acesso([lojaA]), filtros);
      expect(motivo).toBeNull(); if (!recorte) throw new Error('Recorte ausente.');
      return { totais: await relatorios.totaisDoRecorte(tx, recorte), composicao: await relatorios.distribuicaoDoRecorte(tx, recorte, 'categoria', 6) };
    }, { repetivel: true, relatorio: {} });
    const r = await relatorios.relatorioDaTela(a, acesso([lojaA]), filtros, 'periodo');
    expect(d.totais).toEqual(direto.totais); expect(d.totais).toEqual(r.totais);
    expect(d.totais).toMatchObject({ notas: 1, linhas: 9, valorCentavos: 45000, freteCentavos: 900, totalCentavos: 45900 });
    expect(d.composicaoPorCategoria).toEqual({ estado: 'lido', distribuicao: direto.composicao });
    expect(direto.composicao).toEqual(r.distribuicao?.categoria);
    const w = widget(d); const p = w.composicaoPorCategoria!;
    expect(w.valor.valor).toBe(45900); expect(p).toMatchObject({ estado: 'ok', totalCentavos: 45900, quantos: 9, outros: { quantos: 3 } });
    expect(p.fatias).toHaveLength(6); expect(p.fatias[0]).toMatchObject({ chave: '-', rotulo: 'Sem categoria' });
    expect(p.fatias.reduce((s, f) => s + f.centavos, 0) + p.outros!.centavos).toBe(45900);
    expect(p.detalhe.href).toBe(w.detalhe.href); expect(p.detalhe.href).not.toContain('agrupar=categoria');
    expect(JSON.stringify(w)).not.toMatch(/Categoria exclusiva parceiro B|Ingrediente exclusivo B|99900|900000|200000/);
  });

  it('categoria atual muda a composição de compra antiga, conservando os mesmos valores gravados e total', async () => {
    const antes = widget(await ler()).composicaoPorCategoria!;
    try {
      await a.insumo.update({ where: { id: insumos[0] }, data: { categoriaId: categorias[1] } });
      const depois = widget(await ler()).composicaoPorCategoria!;
      expect(depois.estado).toBe('ok'); expect(depois.totalCentavos).toBe(antes.totalCentavos); expect(depois.quantos).toBe(8);
      expect(depois.fatias.some(f => f.chave === '-')).toBe(false);
      expect(depois.fatias[0].chave).toBe(categorias[1]); expect(depois.aviso).toMatch(/atuais.*não é uma fotografia histórica/);
    } finally {
      await a.insumo.update({ where: { id: insumos[0] }, data: { categoriaId: null, classificadoPor: null, classificadoEm: null, classificacaoMotivo: null, classificacaoLote: null } });
    }
  });

  it('aborto SQL real na composição preserva KPI já lido após rollback, sem segunda consulta ou retry', async () => {
    let erroSql: unknown;
    const totalSpy = vi.spyOn(relatorios, 'totaisDoRecorte');
    const distribuicaoSpy = vi.spyOn(relatorios, 'distribuicaoDoRecorte').mockImplementationOnce(async tx => {
      // Erro real de Postgres dentro da mesma transação READ ONLY; nenhum hook de produção.
      try {
        await tx.sql`SELECT (1 / 0)::int AS "falha" FROM "CategoriaInsumo" WHERE "parceiroId" = ${tx.parceiroId}`;
      } catch (e) {
        erroSql = e;
        throw e;
      }
      throw new Error('A divisão por zero deveria ter abortado a transação.');
    });
    const d = exigirTotais(await ler()); const w = widget(d);
    // A sentinela acima sozinha não prova aborto. Exige a rejeição real do SQL.
    expect(erroSql).toMatchObject({ code: 'P2010', meta: { code: '22012' } });
    expect(totalSpy).toHaveBeenCalledTimes(1); expect(distribuicaoSpy).toHaveBeenCalledTimes(1);
    expect(d.totais.totalCentavos).toBe(45900); expect(d.composicaoPorCategoria).toEqual({ estado: 'erro' });
    expect(w).toMatchObject({ estado: 'ok', valor: { valor: 45900 }, composicaoPorCategoria: { estado: 'erro', totalCentavos: null, fatias: [], outros: null } });
    expect(JSON.stringify(w)).not.toMatch(/Prisma|SELECT|CategoriaInsumo|division|divisão|stack|P2010/);
    totalSpy.mockRestore(); distribuicaoSpy.mockRestore();
    expect(widget(await ler()).composicaoPorCategoria?.estado).toBe('ok');
  });

  it('sem compras é ausência e restrições/tenant não consultam nem serializam composição alheia', async () => {
    const d = exigirTotais(await lerComprasDaHome(a, acesso([lojaVazia]), lojaVazia, HOJE));
    expect(d.totais.notas).toBe(0); expect(d.composicaoPorCategoria).toEqual({ estado: 'sem_dados' });
    expect(await lerComprasDaHome(a, acesso([outraLoja]), lojaA, HOJE)).toBeNull();
    expect(await lerComprasDaHome(a, acesso([lojaA], 'OPERADOR'), lojaA, HOJE)).toBeNull();
    const cruzado = await lerComprasDaHome(b, acesso(), lojaA, HOJE);
    expect(cruzado?.tipo).not.toBe('totais'); expect(JSON.stringify(cruzado)).not.toContain('45900');
    const deB = exigirTotais(await lerComprasDaHome(b, acesso([lojaB]), lojaB, HOJE));
    expect(deB.totais.totalCentavos).toBe(99900);
    expect(deB.composicaoPorCategoria).toMatchObject({ estado: 'lido', distribuicao: { quantos: 1, totalCentavos: 99900, fatias: [{ rotulo: 'Categoria exclusiva parceiro B' }] } });
  });

  it('o banco atual recusa valores negativos; teste puro cobre projeção assinada sem enfraquecer estas constraints', async () => {
    const item = await a.notaEntradaItem.findFirstOrThrow({ where: { notaId: notaPrincipal }, select: { id: true, valorTotalCentavos: true, freteRateadoCentavos: true } });
    await expect(a.notaEntradaItem.update({ where: { id: item.id }, data: { valorTotalCentavos: -1 } })).rejects.toThrow();
    await expect(a.notaEntradaItem.update({ where: { id: item.id }, data: { freteRateadoCentavos: -1 } })).rejects.toThrow();
    expect(await a.notaEntradaItem.findUniqueOrThrow({ where: { id: item.id }, select: { id: true, valorTotalCentavos: true, freteRateadoCentavos: true } })).toEqual(item);
    expect(widget(await ler()).valor.valor).toBe(45900);
  });
});
