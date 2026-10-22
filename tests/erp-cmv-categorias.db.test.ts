/**
 * ERP I.2a · metas por categoria e CMV gerencial por categoria (Postgres real). O cenário é o da análise: a Casa Alfa, a Vila da Penha
 * (VP) e a Delivery (DL), outubro de 2026 em curso (hoje = 22/10, compras até ontem) e setembro encerrado.
 *
 *  VP outubro: receita bruta R$ 100.000,00 e compras de R$ 33.300,00 (Proteína 12.000 já com R$ 120,00 de frete, Hortifruti 2.500,
 *  Mercearias 5.200, Laticínios 4.000 com o Bacon de 600, Congelados 1.800, Panificação 2.100, Bebidas 3.300, Descartáveis 1.400,
 *  Limpeza 700, Outros 300); uma nota cancelada e uma de 25/10 ficam de fora. DL outubro: receita R$ 30.000,00, compras R$ 4.500,00.
 *  Setembro: VP abre o estoque em 01/09 (R$ 10.000,00), compra R$ 22.000,00 e fecha em R$ 12.000,00 (real R$ 20.000,00).
 *  O modelo de 32 % foi salvo em 15/09 (vale desde 01/09). Desvio com o sinal do DRE: realizado menos meta.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-cmv-categorias.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { salvarCanaisDaLoja } from '@/lib/erp/faturamento';
import { excluirCategoria, garantirCategoriasPadrao, listarCategorias, criarCategoria } from '@/lib/erp/categorias';
import { aplicarModelo32 } from '@/lib/erp/cmv-categorias-campos';
import { cmvPorCategoria, comprasPorLojaECategoria, type CmvPorCategoria } from '@/lib/erp/cmv-categorias';
import { comprasPorLoja } from '@/lib/erp/cmv';
import { dreDoPeriodo } from '@/lib/erp/dre';
import { fecharPeriodo } from '@/lib/erp/dre-fechamento';
import { listarHistorico } from '@/lib/erp/historico';
import { salvarMetasPorCategoria, situacaoDasMetasPorCategoria, type EntradaDasMetasPorCategoria } from '@/lib/erp/metas-categorias';
import { periodoDe } from '@/lib/erp/periodos';
import { travarMetas } from '@/lib/erp/dre-metas';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import { abertura, BRT, dia, faturamento, fechamentoDeEstoque, nota, periodoRegistrado, R, sp } from './erp-cmv-apoio';
import { cadastrarInsumoDeTeste as cadastrarInsumo, criarPeriodoFechadoDeTeste, cru, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const HOJE = '2026-10-22';
const SETEMBRO = '2026-09-10';
const OUTUBRO = '2026-10-10';

describe.skipIf(!URL_TESTE)('ERP I.2a · metas e CMV por categoria (Postgres real)', { timeout: 300_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `k${globalThis.crypto.randomUUID().slice(0, 8)}`;
  const criados: string[] = [];
  let A: { id: string };
  let a: ClienteDoParceiro;
  const ids: Record<string, string> = {};
  const cat: Record<string, string> = {};
  const insumo: Record<string, string> = {};

  const alcance = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR', lojaIds: string[] | 'rede'): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const DONA = () => alcance('DONO', 'rede');
  const GERENTE_VP = () => alcance('GERENTE', [ids.vp]);
  const OPERADOR = () => alcance('OPERADOR', [ids.vp]);
  const COMPRADOR = () => resolverAlcance({ perfilBase: null, perfilProprio: ['compras.ver', 'compras.lancar', 'lojas.ver'], permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
  const N1 = () => ALCANCE_FLOWFOODS;

  const painel = (al: Alcance, escopo: { tipo: 'rede' } | { tipo: 'loja'; lojaId: string }, data = OUTUBRO, hoje = HOJE, cliente = a) => cmvPorCategoria(cliente, al, escopo, data, hoje);
  const VP = { tipo: 'loja' as const, get lojaId() { return ids.vp; } };
  const DL = { tipo: 'loja' as const, get lojaId() { return ids.dl; } };
  const REDE = { tipo: 'rede' as const };
  const linha = (r: CmvPorCategoria, chave: string) => r.painel!.linhas.find((l) => l.categoriaId === cat[chave])!;

  /** O formulário salvo como a tela o manda: lê a impressão de agora, a menos que a prova queira uma velha. */
  const salvar = async (lojaId: string | null, p: Partial<EntradaDasMetasPorCategoria>, hoje = HOJE, cliente = a, al = DONA()) => {
    const s = (await situacaoDasMetasPorCategoria(cliente, al, lojaId, hoje))!;
    return salvarMetasPorCategoria(cliente, al, { lojaId, versao: s.versao, campos: {}, ...p }, 'Marina', hoje);
  };
  const camposDoModelo = async () => aplicarModelo32(await listarCategorias(a)).campos;
  const contagens = async () => ({ conjuntos: await a.metaCmvConjunto.count(), metas: await a.metaCmvCategoria.count(), usos: await a.categoriaNaLoja.count() });

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Casa Alfa I2a', slug: `i2a-a-${sufixo}`, status: 'ATIVO' } });
    criados.push(A.id);
    a = doParceiro(A.id, db);
    for (const [chave, nome, canal] of [['vp', 'Vila da Penha', 'LOJA'], ['dl', 'Unidade Tijuca', 'DELIVERY_PROPRIO']] as const) {
      const r = await cadastrarLoja(a, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
      await a.loja.update({ where: { id: r.id }, data: { criadoEm: new Date('2026-01-10T12:00:00Z') } });
      expect((await salvarCanaisDaLoja(a, r.id, [canal], ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'], 'Marina')).ok).toBe(true);
    }
    await faturamento(a, ids.vp, 'LOJA', '2026-09-01', '2026-10-31', { '2026-09-10': 100_000, '2026-10-10': 100_000 });
    await faturamento(a, ids.dl, 'DELIVERY_PROPRIO', '2026-09-01', '2026-10-31', { '2026-09-10': 30_000, '2026-10-10': 30_000 });

    await garantirCategoriasPadrao(a);
    for (const c of await listarCategorias(a)) if (c.chave) cat[c.chave] = c.id;
    const novo = async (chave: string, nome: string, tipo = 'INGREDIENTE') => {
      const r = await cadastrarInsumo(a, { tipo, escala: 'base', nome, unidade: 'KG', conteudo: '1', preco: '10,00', conservacao: 'SECO', categoriaId: cat[chave] });
      if (!r.ok) throw new Error(JSON.stringify(r));
      insumo[nome] = r.id;
    };
    await novo('PROTEINA', 'Frango');
    await novo('HORTIFRUTI', 'Tomate');
    await novo('MERCEARIA', 'Farinha');
    await novo('LATICINIOS', 'Queijo');
    await novo('LATICINIOS', 'Bacon');
    await novo('CONGELADOS', 'Pizza congelada');
    await novo('PANIFICACAO', 'Pão');
    await novo('BEBIDAS', 'Suco');
    await novo('DESCARTAVEIS', 'Caixa', 'EMBALAGEM');
    await novo('LIMPEZA', 'Detergente', 'MATERIAL');
    await novo('OUTROS', 'Misterioso');

    // ---- outubro da VP (compras até ontem, 21/10)
    const n = (i: string, numero: string, data: string, reais: number, extra: { frete?: number; status?: 'CANCELADA'; movimenta?: boolean; lojaId?: string } = {}) =>
      nota(a, insumo[i], { lojaId: extra.lojaId ?? ids.vp, numero, data, centavos: R(reais), frete: extra.frete ? R(extra.frete) : undefined, lancadaEm: BRT(data, '12:00'), status: extra.status, movimenta: extra.movimenta });
    await n('Frango', 'O1', '2026-10-05', 11_880, { frete: 120 });
    await n('Tomate', 'O2', '2026-10-06', 2_500);
    await n('Farinha', 'O3', '2026-10-06', 5_200);
    await n('Queijo', 'O4', '2026-10-07', 3_400);
    await n('Bacon', 'O5', '2026-10-07', 600);
    await n('Pizza congelada', 'O6', '2026-10-08', 1_800);
    await n('Pão', 'O7', '2026-10-08', 2_100);
    await n('Suco', 'O8', '2026-10-09', 3_300);
    await n('Caixa', 'O9', '2026-10-09', 1_400);
    await n('Detergente', 'O10', '2026-10-10', 700);
    await n('Misterioso', 'O11', '2026-10-10', 300);
    await n('Frango', 'O12', '2026-10-12', 1_500, { status: 'CANCELADA' });
    await n('Frango', 'O13', '2026-10-25', 777); // depois de ontem: fica de fora
    // ---- outubro da Delivery
    await n('Frango', 'D1', '2026-10-11', 3_000, { lojaId: ids.dl });
    await n('Farinha', 'D2', '2026-10-11', 1_000, { lojaId: ids.dl });
    await n('Suco', 'D3', '2026-10-12', 500, { lojaId: ids.dl });

    // ---- setembro: o estoque da VP abre em 01/09, compra R$ 22.000,00 e fecha em R$ 12.000,00 (real R$ 20.000,00); sem retrato por insumo
    ids.set = await periodoRegistrado(a, SETEMBRO);
    ids.out = await periodoRegistrado(a, OUTUBRO);
    await abertura(a, ids.vp, BRT('2026-09-01', '09:00'), 10_000);
    await n('Frango', 'S1', '2026-09-05', 8_000, { movimenta: true });
    await n('Queijo', 'S2', '2026-09-06', 2_000, { movimenta: true });
    await n('Bacon', 'S3', '2026-09-06', 400, { movimenta: true });
    await n('Farinha', 'S4', '2026-09-07', 5_000, { movimenta: true });
    await n('Tomate', 'S5', '2026-09-08', 2_600, { movimenta: true });
    await n('Suco', 'S6', '2026-09-09', 4_000, { movimenta: true });
    await fechamentoDeEstoque(a, insumo.Frango, ids.vp, ids.set, { fim: '2026-09-30', quando: BRT('2026-09-30', '18:00'), retrato: 12_000 });
    await n('Frango', 'SD1', '2026-09-12', 1_000, { lojaId: ids.dl });

    // ---- o modelo de 32 % salvo em 15/09 (vale desde 01/09): a base de tudo
    const r = await salvar(null, { total: '32', campos: await camposDoModelo() }, '2026-09-15');
    if (!r.ok) throw new Error(JSON.stringify(r));
  });

  afterAll(async () => {
    if (db) {
      await limparParceiros(db, perfil, criados);
      await db.$disconnect();
    }
  });

  // ------------------------------------------------------------ 5. o modelo e o salvar
  it('critério 5: o modelo preenche 10 campos e não grava; o conjunto salvo veio do modelo e a meta total é a linha CMV do DRE', async () => {
    const m = aplicarModelo32(await listarCategorias(a));
    expect(Object.values(m.campos).filter((c) => c !== '')).toHaveLength(10);
    // Salvar é que grava: 1 conjunto da rede, 10 metas, MODELO_32, nenhum uso por loja, e o DreMeta do CMV em 32 %.
    expect(await contagens()).toEqual({ conjuntos: 1, metas: 10, usos: 0 });
    const c = (await a.metaCmvConjunto.findFirst())!;
    expect(c).toMatchObject({ lojaId: null, segueARede: false, aplicouModelo: 'MODELO_32', versao: 1 });
    expect(c.vigenteDesde.toISOString().slice(0, 10)).toBe('2026-09-01');
    const cmv = await a.dreLinha.findFirst({ where: { codigo: 'cmv' } });
    const dm = await a.dreMeta.findFirst({ where: { linhaId: cmv!.id, canal: null } });
    expect(dm).toMatchObject({ percentualBp: 3200, semMeta: false });
    const h = await listarHistorico(a, { entidades: ['MetaCmvConjunto'], verPrecos: false, verDre: true, limite: 5 });
    expect(h).toHaveLength(1);
  });

  // ------------------------------------------------------------ 1 a 3. o painel pelas compras
  it('critério 1: o total do painel é a linha CMV do DRE da loja ao centavo (R$ 33.300,00, 33,30 % contra 32,00 %), amarelo', async () => {
    const r = (await painel(DONA(), VP))!;
    const dre = (await dreDoPeriodo(a, DONA(), VP, OUTUBRO, HOJE))!;
    const cmv = dre.resultado.linhas.find((l) => l.tipo === 'cmv')!;
    expect(cmv.valorCentavos).toBe(R(33_300));
    expect(r.total.linha.valorCentavos).toBe(cmv.valorCentavos);
    expect(r.painel!.somaDasComprasCentavos).toBe(cmv.valorCentavos);
    expect(r.painel!.variacaoCentavos).toBe(0);
    expect(r.painel!.linhas.find((l) => l.tipo === 'variacao')).toBeUndefined();
    expect(r.total.linha.percentualBp).toBe(3330);
    expect(r.total.meta).toMatchObject({ metaBp: 3200, desvioBp: 130 });
    expect(r.total.meta!.metaCentavos).toBe(R(32_000));
    expect(r.total.farol).toMatchObject({ tipo: 'cor', cor: 'AMARELO' });
    expect(r.painel!.semCor).toBeNull();
  });

  it('critério 2: Proteína meta R$ 11.000, realizado 12,00 % (com o frete rateado), desvio +1,00 pp e +R$ 1.000, amarelo, 1ª em maiores desvios; Hortifruti verde', async () => {
    const r = (await painel(DONA(), VP))!;
    const p = linha(r, 'PROTEINA');
    expect(p).toMatchObject({ realizadoCentavos: R(12_000), realizadoBp: 1200, metaBp: 1100, metaCentavos: R(11_000), desvioBp: 100, desvioCentavos: R(1_000), metaVemDe: 'rede' });
    expect(sp(p.desvioTexto)).toBe('+1,00 pp');
    expect(p.farol).toMatchObject({ tipo: 'cor', cor: 'AMARELO' });
    expect(r.painel!.maioresDesvios[0].categoriaId).toBe(cat.PROTEINA);
    expect(linha(r, 'HORTIFRUTI').farol).toMatchObject({ tipo: 'cor', cor: 'VERDE' });
    expect(linha(r, 'LATICINIOS').realizadoCentavos).toBe(R(4_000));
    // A nota cancelada e a de 25/10 não entram em nenhuma categoria.
    expect(r.painel!.linhas.filter((l) => l.tipo === 'categoria').reduce((s, l) => s + (l.realizadoCentavos ?? 0), 0)).toBe(R(33_300));
  });

  it('critério 3: Outros R$ 300,00 (0,90 % do CMV) fica sem farol, a classificar, e as cores seguem; com Outros R$ 900,00 (2,65 %) nenhuma categoria tem cor', async () => {
    const r = (await painel(DONA(), VP))!;
    const o = linha(r, 'OUTROS');
    expect(o).toMatchObject({ aClassificar: true, farol: null, realizadoCentavos: R(300) });
    expect(r.painel!.aClassificarBp).toBe(90);
    expect(r.painel!.semCor).toBeNull();
    expect(r.painel!.insumosAClassificar).toBe(1);

    // +R$ 600,00 em Outros por uma nota que depois é cancelada (o painel volta ao que era).
    const extra = await nota(a, insumo.Misterioso, { lojaId: ids.vp, numero: 'OX', data: '2026-10-15', centavos: R(600), lancadaEm: BRT('2026-10-15', '12:00') });
    const com = (await painel(DONA(), VP))!;
    expect(com.painel!.aClassificarBp).toBe(265);
    expect(sp(com.painel!.semCor)).toBe('R$ 900,00 ainda a classificar (2,65% do CMV)');
    for (const l of com.painel!.linhas.filter((x) => x.tipo === 'categoria' && x.farol)) expect(l.farol?.tipo, l.nome).toBe('sem');
    expect(sp(linha(com, 'PROTEINA').desvioTexto)).toBe('+1,00 pp'); // o desvio segue escrito
    expect(com.painel!.maioresDesvios).toEqual([]);
    expect(com.total.linha.valorCentavos).toBe(R(33_900)); // o total do DRE continua sendo o CMV, sem cor a menos
    await a.notaEntrada.update({ where: { id: extra }, data: { status: 'CANCELADA', canceladaEm: new Date(), motivoCancelamento: 'teste' } });
    expect((await painel(DONA(), VP))!.painel!.semCor).toBeNull();
  });

  it('um item de nota sem insumo (linha importada ainda não casada) cai em "Sem categoria": a soma continua sendo a do DRE', async () => {
    const n = await a.notaEntrada.create({ data: { parceiroId: A.id, lojaId: ids.vp, numero: 'SI', entradaEm: dia('2026-10-16'), totalCentavos: R(200), status: 'LANCADA', lancadaEm: BRT('2026-10-16', '12:00') } });
    await a.notaEntradaItem.create({ data: { parceiroId: A.id, notaId: n.id, insumoId: null, descricaoNota: 'Item solto', embalagensMilesimos: 1000, conteudoMilesimos: 1000, quantidadeMilesimos: 1000, valorTotalCentavos: R(200) } });
    const r = (await painel(DONA(), VP))!;
    const s = r.painel!.linhas.find((l) => l.tipo === 'sem-categoria')!;
    expect(s).toMatchObject({ realizadoCentavos: R(200), aClassificar: true, farol: null });
    expect(r.painel!.somaDasComprasCentavos).toBe(R(33_500));
    expect(r.total.linha.valorCentavos).toBe(R(33_500));
    // Item com insumo sem categoria (nulo no banco, como o insumo antigo): também "Sem categoria".
    await a.insumo.update({ where: { id: insumo.Misterioso }, data: { categoriaId: null, classificadoPor: null, classificadoEm: null, classificacaoMotivo: null, classificacaoLote: null } });
    const sem = (await painel(DONA(), VP))!;
    expect(sem.painel!.linhas.find((l) => l.tipo === 'sem-categoria')!.realizadoCentavos).toBe(R(500));
    expect(linha(sem, 'OUTROS').realizadoCentavos).toBe(0);
    expect(sem.painel!.somaDasComprasCentavos).toBe(R(33_500));
    await a.insumo.update({ where: { id: insumo.Misterioso }, data: { categoriaId: cat.OUTROS } });
    await a.notaEntrada.update({ where: { id: n.id }, data: { status: 'CANCELADA', canceladaEm: new Date(), motivoCancelamento: 'teste' } });
    expect((await painel(DONA(), VP))!.total.linha.valorCentavos).toBe(R(33_300));
  });

  it('a soma por categoria é, loja a loja, a mesma de `comprasPorLoja` (a do DRE): nota cancelada, de outra data e frete rateado incluídos', async () => {
    await a.transacao(async (tx) => {
      const periodo = await periodoDe(tx, OUTUBRO);
      for (const [de, ate] of [[periodo.inicio, '2026-10-21'], [periodo.inicio, periodo.fim], ['2026-10-10', '2026-10-10'], ['2026-09-01', '2026-09-30']] as const) {
        const porCategoria = await comprasPorLojaECategoria(tx, [ids.vp, ids.dl], de, ate);
        const porLoja = await comprasPorLoja(tx, [ids.vp, ids.dl], de, ate);
        for (const lojaId of [ids.vp, ids.dl]) {
          const somaCategorias = Array.from(porCategoria.get(lojaId)?.values() ?? []).reduce((s, v) => s + v, 0);
          expect(somaCategorias, `${lojaId} ${de}..${ate}`).toBe(porLoja.get(lojaId) ?? 0);
        }
      }
    });
  });

  // ------------------------------------------------------------ 4. reclassificar
  it('critério 4: reclassificar o Bacon (R$ 600,00) para Proteína no dia 15 muda o período ao vivo inteiro junto (Proteína 12.600, Laticínios 3.400) e o total fica R$ 33.300,00', async () => {
    const antes = (await painel(DONA(), VP))!;
    await a.insumo.update({ where: { id: insumo.Bacon }, data: { categoriaId: cat.PROTEINA } });
    const depois = (await painel(DONA(), VP))!;
    expect(linha(depois, 'PROTEINA').realizadoCentavos).toBe(R(12_600));
    expect(linha(depois, 'LATICINIOS').realizadoCentavos).toBe(R(3_400));
    expect(depois.total.linha.valorCentavos).toBe(R(33_300));
    expect(depois.painel!.somaDasComprasCentavos).toBe(antes.painel!.somaDasComprasCentavos);
    // A categoria de HOJE vale em todas as compras do período: a nota de 07/10 e a de qualquer outro dia.
    expect(linha(depois, 'PROTEINA').desvioCentavos).toBe(R(1_600));
    await a.insumo.update({ where: { id: insumo.Bacon }, data: { categoriaId: cat.LATICINIOS } });
    expect(linha((await painel(DONA(), VP))!, 'LATICINIOS').realizadoCentavos).toBe(R(4_000));
  });

  // ------------------------------------------------------------ 6. salvar
  it('critério 6: 100,01, −1, 3,155, "1e2" e lixo são recusados no campo e nada é gravado; a soma de 33 % grava e o aviso fica', async () => {
    const antes = await contagens();
    const campos = await camposDoModelo();
    for (const ruim of ['100,01', '-1', '3,155', '1e2', 'abc']) {
      const r = await salvar(null, { total: '32', campos: { ...campos, [cat.PROTEINA]: ruim } });
      expect(r.ok, ruim).toBe(false);
      if (!r.ok) {
        expect(r.erros[`cat_${cat.PROTEINA}`], ruim).toBeTruthy();
        expect(r.erros.geral).toContain('nada foi gravado');
      }
    }
    const total = await salvar(null, { total: '100,01', campos });
    expect(total.ok).toBe(false);
    expect(await contagens()).toEqual(antes);
    expect(await a.historicoAlteracao.count({ where: { entidade: 'MetaCmvConjunto' } })).toBe(1);

    // Soma 33 % contra o total de 32 %: grava e avisa (nada bloqueia). Vale desde o começo de outubro.
    const r = await salvar(null, { total: '32', campos: { ...campos, [cat.PROTEINA]: '12' } });
    expect(r).toMatchObject({ ok: true, mudou: 1, valeDesde: '2026-10-01' });
    if (r.ok) expect(sp(r.aviso)).toBe('Soma 33,00% · total 32,00% · diferença +1,00 pp');
    expect(await contagens()).toEqual({ conjuntos: 2, metas: 20, usos: 0 });
    const s = (await situacaoDasMetasPorCategoria(a, DONA(), null, HOJE))!;
    expect(s.categorias.find((c) => c.id === cat.PROTEINA)!.campo).toBe('12');
    expect(s.modeloAplicado).toBe(false); // os campos já não são exatamente o modelo
    // Sem mudar nada, de novo: nada grava (reenvio).
    const igual = await salvar(null, { total: '32', campos: { ...campos, [cat.PROTEINA]: '12' } });
    expect(igual).toMatchObject({ ok: true, mudou: 0 });
    expect(await contagens()).toEqual({ conjuntos: 2, metas: 20, usos: 0 });
    // Volta ao modelo: o conjunto do período em curso é ATUALIZADO (não nasce um terceiro) e volta a dizer que veio do modelo.
    const volta = await salvar(null, { total: '32', campos });
    expect(volta).toMatchObject({ ok: true, mudou: 1 });
    expect(await contagens()).toEqual({ conjuntos: 2, metas: 20, usos: 0 });
    expect((await a.metaCmvConjunto.findFirst({ where: { vigenteDesde: dia('2026-10-01') } }))).toMatchObject({ aplicouModelo: 'MODELO_32', versao: 2 });
  });

  it('critério 5 (aviso): sem a Bebidas o modelo soma 29,00 % contra 32,00 % e a casa grava assim', async () => {
    const criada = await criarCategoria(a, { nome: 'Sorvetes' }, 'Marina');
    expect(criada.ok).toBe(true);
    const sorvetes = criada.ok ? criada.id : '';
    const campos = await camposDoModelo();
    const antes = await a.metaCmvCategoria.count();
    const r = await salvar(null, { total: '32', campos: { ...campos, [cat.BEBIDAS]: '', [sorvetes]: '' } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(sp(r.aviso)).toBe('Soma 29,00% · total 32,00% · diferença −3,00 pp');
    expect(await a.metaCmvCategoria.count()).toBe(antes - 1);
    // Categoria criada no meio do período: sem meta, sem farol (e sem valor, não aparece).
    const p = (await painel(DONA(), VP))!;
    expect(linha(p, 'BEBIDAS').metaBp).toBeNull();
    expect(linha(p, 'BEBIDAS').farol).toBeNull();
    expect(p.painel!.linhas.find((l) => l.categoriaId === sorvetes)?.metaBp ?? null).toBeNull();
    // De volta ao modelo para os testes seguintes.
    expect((await salvar(null, { total: '32', campos })).ok).toBe(true);
    expect(await excluirCategoria(a, sorvetes, 'Marina')).toMatchObject({ ok: true });
  });

  it('duas abas: a segunda recebe o conflito, nada é gravado e a trava é a das metas do DRE (o total e a divisão entram juntos)', async () => {
    const s = (await situacaoDasMetasPorCategoria(a, DONA(), null, HOJE))!;
    const campos = await camposDoModelo();
    const primeira = await salvarMetasPorCategoria(a, DONA(), { lojaId: null, versao: s.versao, total: '32', campos: { ...campos, [cat.PROTEINA]: '11,5' } }, 'Marina', HOJE);
    expect(primeira).toMatchObject({ ok: true, mudou: 1 });
    const segunda = await salvarMetasPorCategoria(a, DONA(), { lojaId: null, versao: s.versao, total: '31', campos: { ...campos, [cat.PROTEINA]: '10' } }, 'Marina', HOJE);
    expect(segunda).toMatchObject({ ok: false, conflito: true });
    const depois = (await situacaoDasMetasPorCategoria(a, DONA(), null, HOJE))!;
    expect(depois.categorias.find((c) => c.id === cat.PROTEINA)!.campo).toBe('11,5');
    expect(depois.totalCampo).toBe('32');
    // Total e divisão na mesma transação: mudar os dois de uma vez grava as duas coisas (DreMeta do CMV + conjunto), nunca só uma.
    const duas = await salvar(null, { total: '31', campos: { ...campos, [cat.PROTEINA]: '10' } });
    expect(duas).toMatchObject({ ok: true, mudou: 2 });
    expect((await situacaoDasMetasPorCategoria(a, DONA(), null, HOJE))!.totalCampo).toBe('31');
    expect((await salvar(null, { total: '32', campos })).ok).toBe(true);
  });

  it('a trava `erp-metas` é pega: com ela segura por outra transação, salvar ESPERA; solta, termina e grava (teste mutante da trava)', async () => {
    const campos = await camposDoModelo();
    const s = (await situacaoDasMetasPorCategoria(a, DONA(), null, HOJE))!;
    let terminou = false;
    let salvando!: Promise<unknown>;
    await a.transacao(async (tx) => {
      await travarMetas(tx);
      salvando = salvarMetasPorCategoria(a, DONA(), { lojaId: null, versao: s.versao, total: '32', campos: { ...campos, [cat.PROTEINA]: '11,25' } }, 'Marina', HOJE).then((x) => ((terminou = true), x));
      await new Promise((r) => setTimeout(r, 900));
      expect(terminou).toBe(false);
    });
    expect(await salvando).toMatchObject({ ok: true, mudou: 1 });
    expect((await salvar(null, { total: '32', campos })).ok).toBe(true);
  });

  // ------------------------------------------------------------ 7. rede e loja
  it('critério 7: a Delivery personaliza o conjunto (Proteína 9 %), a rede passa Proteína para 12 %: a Penha vai a 12 %, a Delivery fica em 9 %, e setembro mantém 11 %', async () => {
    const campos = await camposDoModelo();
    const rDl = await salvar(ids.dl, { segue: 'nao', campos: { ...campos, [cat.PROTEINA]: '9' }, usa: {} });
    expect(rDl).toMatchObject({ ok: true });
    const antes = (await situacaoDasMetasPorCategoria(a, DONA(), null, HOJE))!;
    expect(antes.seguem.map((l) => l.nome)).toEqual(['Vila da Penha']);
    expect(antes.personalizadas.map((l) => l.nome)).toEqual(['Unidade Tijuca']);

    expect((await salvar(null, { total: '32', campos: { ...campos, [cat.PROTEINA]: '12' } })).ok).toBe(true);
    const vp = (await painel(DONA(), VP))!;
    const dl = (await painel(DONA(), DL))!;
    expect(linha(vp, 'PROTEINA')).toMatchObject({ metaBp: 1200, metaVemDe: 'rede' });
    expect(linha(dl, 'PROTEINA')).toMatchObject({ metaBp: 900, metaVemDe: 'loja' });
    expect(linha(dl, 'HORTIFRUTI').metaBp).toBe(300); // o conjunto próprio é inteiro: a Delivery levou os outros nove junto
    const set = (await painel(DONA(), VP, SETEMBRO))!;
    expect(linha(set, 'PROTEINA').metaBp).toBe(1100);
    // A mudança numa loja não toca a outra, e a rede sozinha mostra as duas metas somadas (R$ e % sobre a receita da rede).
    const rede = (await painel(DONA(), REDE))!;
    expect(linha(rede, 'PROTEINA')).toMatchObject({ metaVemDe: 'mista', metaCentavos: R(12_000) + R(2_700) });
    expect(linha(rede, 'PROTEINA').realizadoCentavos).toBe(R(15_000));
    expect(rede.total.linha.valorCentavos).toBe(R(37_800));
    expect(rede.painel!.somaDasComprasCentavos).toBe(R(37_800));
    expect(rede.painel!.semCor).toBeNull();
    // Mudar a rede de novo não mexe na Delivery; voltar a seguir a rede vale do período em curso.
    expect((await salvar(null, { total: '32', campos: { ...campos, [cat.PROTEINA]: '13' } })).ok).toBe(true);
    expect(linha((await painel(DONA(), DL))!, 'PROTEINA').metaBp).toBe(900);
    expect((await salvar(ids.dl, { segue: 'sim', campos: {}, usa: {} })).ok).toBe(true);
    expect(linha((await painel(DONA(), DL))!, 'PROTEINA')).toMatchObject({ metaBp: 1300, metaVemDe: 'rede' });
    expect(linha((await painel(DONA(), DL, SETEMBRO))!, 'PROTEINA').metaBp).toBe(1100);
    expect((await salvar(null, { total: '32', campos })).ok).toBe(true);
  });

  it('o uso por loja: a categoria que a loja não usa some das metas dela e do painel, salvo se teve valor ("não usada nesta loja, mas teve R$ X")', async () => {
    const campos = await camposDoModelo();
    // A Delivery não usa Limpeza (sem compra lá) nem Bebidas (teve R$ 500,00).
    const r = await salvar(ids.dl, { segue: 'nao', campos, usa: { [cat.LIMPEZA]: false, [cat.BEBIDAS]: false } });
    expect(r).toMatchObject({ ok: true });
    expect(await a.categoriaNaLoja.count({ where: { usa: false } })).toBe(2);
    const dl = (await painel(DONA(), DL))!;
    expect(dl.painel!.linhas.find((l) => l.categoriaId === cat.LIMPEZA)).toBeUndefined();
    expect(linha(dl, 'BEBIDAS')).toMatchObject({ naoUsada: true, realizadoCentavos: R(500), metaBp: null });
    expect(dl.painel!.somaDasComprasCentavos).toBe(R(4_500));
    const s = (await situacaoDasMetasPorCategoria(a, DONA(), ids.dl, HOJE))!;
    expect(s.categorias.find((c) => c.id === cat.LIMPEZA)!.usa).toBe(false);
    expect(s.categorias.find((c) => c.id === cat.PROTEINA)!.usa).toBe(true);
    // A Penha continua com tudo, e o painel da rede soma só as lojas que usam cada categoria na meta.
    expect(linha((await painel(DONA(), VP))!, 'LIMPEZA').metaBp).toBe(50);
    const rede = (await painel(DONA(), REDE))!;
    expect(linha(rede, 'LIMPEZA').metaCentavos).toBe(R(500)); // só a Penha: 0,5 % de 100.000
    // Voltar a usar: a linha existe com `usa` verdadeiro e o histórico guarda tudo.
    expect((await salvar(ids.dl, { segue: 'sim', campos: {}, usa: { [cat.LIMPEZA]: true, [cat.BEBIDAS]: true } })).ok).toBe(true);
    expect(await a.categoriaNaLoja.count({ where: { usa: false } })).toBe(0);
    expect((await listarHistorico(a, { entidades: ['CategoriaNaLoja'], verPrecos: false, verDre: true, limite: 20 })).length).toBeGreaterThanOrEqual(4);
  });

  it('uso por loja forjado (categoria de outro parceiro) é recusado; categoria que não existe também', async () => {
    const r = await salvar(ids.dl, { segue: 'sim', campos: {}, usa: { inexistente: false } });
    expect(r.ok).toBe(false);
    const f = await salvar(null, { total: '32', campos: { inexistente: '5' } });
    expect(f.ok).toBe(false);
  });

  // ------------------------------------------------------------ 12. período anterior e vigência
  it('critério 12 (vigência): a meta trocada hoje não muda o desvio do período anterior, encerrado e ainda aberto', async () => {
    const antes = JSON.stringify((await painel(DONA(), VP, SETEMBRO))!.painel!.linhas.map((l) => [l.chave, l.metaBp, l.desvioBp, l.farol?.tipo]));
    const campos = await camposDoModelo();
    expect((await salvar(null, { total: '25', campos: { ...campos, [cat.PROTEINA]: '5' } })).ok).toBe(true);
    const depois = JSON.stringify((await painel(DONA(), VP, SETEMBRO))!.painel!.linhas.map((l) => [l.chave, l.metaBp, l.desvioBp, l.farol?.tipo]));
    expect(depois).toBe(antes);
    expect(linha((await painel(DONA(), VP))!, 'PROTEINA').metaBp).toBe(500); // outubro, sim
    expect((await salvar(null, { total: '32', campos })).ok).toBe(true);
  });

  // ------------------------------------------------------------ 8. encerrado sem o real por categoria
  it('critério 8: setembro encerrado, sem retrato por insumo: as categorias pelas compras e "Variação do estoque, ainda não aberta por categoria" fecham no CMV real do DRE', async () => {
    const r = (await painel(DONA(), VP, SETEMBRO))!;
    const dre = (await dreDoPeriodo(a, DONA(), VP, SETEMBRO, HOJE))!;
    expect(r.d.encerrado).toBe(true);
    const cmv = dre.resultado.linhas.find((l) => l.tipo === 'cmv')!;
    expect(cmv.valorCentavos).toBe(R(20_000)); // o real: 10.000 + 22.000 − 12.000
    expect(r.total.linha.nota).toBe('real (contagem)');
    expect(r.painel!.somaDasComprasCentavos).toBe(R(22_000));
    const v = r.painel!.linhas.find((l) => l.tipo === 'variacao')!;
    expect(v.nome).toBe('Variação do estoque, ainda não aberta por categoria');
    expect(v.realizadoCentavos).toBe(R(-2_000));
    expect(r.painel!.somaDasComprasCentavos + v.realizadoCentavos!).toBe(cmv.valorCentavos);
    // A rede: o real da Penha + a compra da Delivery; a variação é a da Penha.
    const rede = (await painel(DONA(), REDE, SETEMBRO))!;
    expect(rede.total.linha.valorCentavos).toBe(R(21_000));
    expect(rede.painel!.somaDasComprasCentavos).toBe(R(23_000));
    expect(rede.painel!.linhas.find((l) => l.tipo === 'variacao')!.realizadoCentavos).toBe(R(-2_000));
    // Pré-preparos: a linha própria, sem meta e sem farol.
    const pre = rede.painel!.linhas.find((l) => l.tipo === 'preparos')!;
    expect(pre).toMatchObject({ nome: 'Pré-preparos (variação do estoque)', metaBp: null, farol: null });
  });

  // ------------------------------------------------------------ 10. fotografia v4
  it('critério 10: fechar setembro grava a v4 com `entrada.categorias`; o fechado lê igual ao ao vivo de antes de fechar e reclassificar depois não o muda', async () => {
    const vivo = JSON.stringify((await painel(DONA(), REDE, SETEMBRO))!.painel!.linhas);
    const r = await fecharPeriodo(a, N1(), { inicio: '2026-09-01', ressalvas: [], justificativa: '' }, 'Ana Dona', HOJE);
    expect(r).toMatchObject({ ok: true, versao: 1 });
    const foto = (await a.dreFotografia.findFirst({ where: { periodoId: ids.set, substituidaEm: null }, select: { versaoDaConta: true, entrada: true } }))!;
    expect(foto.versaoDaConta).toBe(4);
    const entrada = foto.entrada as { categorias: { versao: number; lojas: Record<string, { nome: string; origem: string | null; semCategoriaCentavos: number; categorias: { id: string; nome: string; compraCentavos: number; metaBp: number | null }[] }> } };
    expect(entrada.categorias.versao).toBe(1);
    expect(Object.keys(entrada.categorias.lojas).sort()).toEqual([ids.dl, ids.vp].sort());
    const vp = entrada.categorias.lojas[ids.vp];
    expect(vp).toMatchObject({ nome: 'Vila da Penha', origem: 'rede' });
    expect(vp.categorias.find((c) => c.id === cat.PROTEINA)).toMatchObject({ nome: 'Proteína', compraCentavos: R(8_000), metaBp: 1100 });

    const fechado = (await painel(DONA(), REDE, SETEMBRO))!;
    expect(fechado.d.status).toBe('FECHADO');
    expect(fechado.antigo).toBe(false);
    expect(JSON.stringify(fechado.painel!.linhas)).toBe(vivo);
    // Reclassificar, renomear e mudar a meta depois: o fechado fica igual byte a byte.
    await a.insumo.update({ where: { id: insumo.Bacon }, data: { categoriaId: cat.PROTEINA } });
    await a.categoriaInsumo.update({ where: { id: cat.PROTEINA }, data: { nome: 'Carnes (renomeada)' } });
    expect((await salvar(null, { total: '25', campos: { ...(await camposDoModelo()), [cat.PROTEINA]: '5' } })).ok).toBe(true);
    const depois = (await painel(DONA(), REDE, SETEMBRO))!;
    expect(JSON.stringify(depois.painel!.linhas)).toBe(vivo);
    expect(depois.painel!.linhas.find((l) => l.categoriaId === cat.PROTEINA)!.nome).toBe('Proteína'); // o nome da época
    await a.insumo.update({ where: { id: insumo.Bacon }, data: { categoriaId: cat.LATICINIOS } });
    await a.categoriaInsumo.update({ where: { id: cat.PROTEINA }, data: { nome: 'Proteína' } });
    expect((await salvar(null, { total: '32', campos: await camposDoModelo() })).ok).toBe(true);
  });

  it('o fechado antes da I.2 (v1 a v3) diz "não apurado por categoria" e mantém o total do DRE; nunca é recalculado', async () => {
    await a.transacao((tx) => criarPeriodoFechadoDeTeste(tx, { nome: 'Agosto de 2026', inicio: '2026-08-01', fim: '2026-08-31' }));
    const r = (await painel(DONA(), REDE, '2026-08-10'))!;
    expect(r.d.status).toBe('FECHADO');
    expect(r.antigo).toBe(true);
    expect(r.painel).toBeNull();
    expect(r.total.linha).toBeTruthy();
  });

  // ------------------------------------------------------------ 11. quem vê o quê
  it('critério 11: o gerente da Penha recebe só a Penha (a rede e a Delivery dão nada), ao vivo e no fechado, sem id nem nome nem valor de outra loja', async () => {
    expect(await painel(GERENTE_VP(), REDE)).toBeNull();
    expect(await painel(GERENTE_VP(), DL)).toBeNull();
    expect(await painel(GERENTE_VP(), REDE, SETEMBRO)).toBeNull();
    for (const data of [OUTUBRO, SETEMBRO]) {
      const r = (await painel(GERENTE_VP(), VP, data))!;
      expect(r.d.escopo).toMatchObject({ tipo: 'loja', lojaId: ids.vp });
      const j = JSON.stringify(r);
      for (const proibido of [ids.dl, 'Unidade Tijuca', '"entrada"']) expect(j, `${data} não pode ter ${proibido}`).not.toContain(proibido);
      expect(linha(r, 'PROTEINA').realizadoCentavos).toBe(data === OUTUBRO ? R(12_000) : R(8_000));
    }
  });

  it('critério 11: comprador (sem `dre.ver`) e operador não recebem nada; só o Dono salva metas; o Histórico das metas some sem `dre.ver`', async () => {
    for (const quem of [COMPRADOR(), OPERADOR()]) {
      expect(await painel(quem, REDE)).toBeNull();
      expect(await painel(quem, VP)).toBeNull();
      expect(await situacaoDasMetasPorCategoria(a, quem, null, HOJE)).toBeNull();
      const r = await salvarMetasPorCategoria(a, quem, { lojaId: null, versao: 'x', total: '32', campos: {} }, 'Intruso', HOJE);
      expect(r.ok).toBe(false);
    }
    // O gerente de uma loja só: `metas.editar` exige a rede inteira.
    expect(await situacaoDasMetasPorCategoria(a, GERENTE_VP(), ids.vp, HOJE)).toBeNull();
    const g = await salvarMetasPorCategoria(a, GERENTE_VP(), { lojaId: ids.vp, versao: 'x', campos: {}, segue: 'nao' }, 'Gerente', HOJE);
    expect(g.ok).toBe(false);
    expect(await a.metaCmvConjunto.count({ where: { lojaId: ids.vp } })).toBe(0);
    const com = await listarHistorico(a, { entidades: ['MetaCmvConjunto', 'CategoriaNaLoja'], verPrecos: false, verDre: true, limite: 50 });
    expect(com.length).toBeGreaterThan(0);
    const sem = await listarHistorico(a, { entidades: ['MetaCmvConjunto', 'CategoriaNaLoja'], verPrecos: false, verDre: false, limite: 50 });
    expect(sem).toEqual([]);
    const semFiltro = await listarHistorico(a, { verPrecos: false, verDre: false, limite: 500 });
    expect(JSON.stringify(semFiltro)).not.toContain('Metas por categoria');
    // O nível 1 vê e salva.
    expect(await painel(N1(), REDE)).not.toBeNull();
    expect((await salvar(null, { total: '32', campos: await camposDoModelo() }, HOJE, a, N1())).ok).toBe(true);
  });

  // ------------------------------------------------------------ 12. excluir categoria
  it('critério 12: excluir a categoria que tem meta é recusado pela regra e, por SQL cru, pela chave estrangeira; sem meta, exclui (e leva o uso por loja)', async () => {
    const c = await criarCategoria(a, { nome: 'Congelados especiais' }, 'Marina');
    if (!c.ok) throw new Error(JSON.stringify(c));
    expect((await salvar(null, { total: '32', campos: { ...(await camposDoModelo()), [c.id]: '1' } })).ok).toBe(true);
    const recusa = await excluirCategoria(a, c.id, 'Marina');
    expect(recusa.ok).toBe(false);
    if (!recusa.ok) expect(recusa.erros.geral).toContain('tem meta');
    await expect(cru(db, perfil, A.id, `DELETE FROM "CategoriaInsumo" WHERE "id" = $1`, c.id)).rejects.toThrow(/MetaCmvCategoria_parceiroId_categoriaId_fkey|foreign key|violates/i);
    expect(await a.categoriaInsumo.count({ where: { id: c.id } })).toBe(1);
    // Desativar com meta é permitido: a meta segue no painel e no formulário (a categoria "sai do formulário de meta nova" só se não tiver meta).
    expect((await a.categoriaInsumo.update({ where: { id: c.id }, data: { ativa: false, desativadaEm: new Date() } })).ativa).toBe(false);
    const s = (await situacaoDasMetasPorCategoria(a, DONA(), null, HOJE))!;
    expect(s.categorias.find((x) => x.id === c.id)).toMatchObject({ ativa: false, campo: '1' });
    // Tirar a meta do período em curso (nova vigência só se o conjunto de agora não for o do período: aqui é) libera... mas o conjunto de
    // setembro (passado) tem o modelo sem esta categoria; a meta só existe no de outubro, que é o mais novo.
    expect((await salvar(null, { total: '32', campos: await camposDoModelo() })).ok).toBe(true);
    // A meta saiu do conjunto de outubro; nenhum conjunto a guarda mais: a exclusão passa.
    expect(await a.metaCmvCategoria.count({ where: { categoriaId: c.id } })).toBe(0);
    await a.categoriaInsumo.update({ where: { id: c.id }, data: { ativa: true, desativadaEm: null } });
    await a.categoriaNaLoja.create({ data: { parceiroId: A.id, lojaId: ids.dl, categoriaId: c.id, usa: false, atualizadoPorNome: 'Marina' } });
    expect(await excluirCategoria(a, c.id, 'Marina')).toMatchObject({ ok: true });
    expect(await a.categoriaNaLoja.count({ where: { categoriaId: c.id } })).toBe(0);
  });

  it('a categoria que ficou numa meta de um período passado também não se exclui (a meta antiga não se apaga): desativa-se', async () => {
    const c = await criarCategoria(a, { nome: 'Temporária' }, 'Marina');
    if (!c.ok) throw new Error(JSON.stringify(c));
    // Uma loja de teste com conjunto próprio num período passado e outro mais novo: o antigo guarda a meta e é imutável.
    const loja = await cadastrarLoja(a, { nome: 'Loja do passado' }, 'Marina');
    if (!loja.ok) throw new Error(JSON.stringify(loja));
    const antigo = await a.metaCmvConjunto.create({ data: { parceiroId: A.id, lojaId: loja.id, vigenteDesde: dia('2026-07-01'), segueARede: false, criadoPorNome: 'Marina' } });
    await a.metaCmvCategoria.create({ data: { parceiroId: A.id, conjuntoId: antigo.id, categoriaId: c.id, percentualBp: 200 } });
    await a.metaCmvConjunto.create({ data: { parceiroId: A.id, lojaId: loja.id, vigenteDesde: dia('2026-08-01'), segueARede: true, criadoPorNome: 'Marina' } });
    const r = await excluirCategoria(a, c.id, 'Marina');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.geral).toContain('tem meta');
  });

  // ------------------------------------------------------------ o banco: gatilhos e CHECKs
  describe('o banco recusa o que a regra já recusa (SQL cru, até como o papel do tenant)', () => {
    it('o conjunto do passado não muda, não se apaga e não troca de loja ou vigência; só o mais novo se altera', async () => {
      const antigo = (await a.metaCmvConjunto.findFirst({ where: { lojaId: null }, orderBy: { vigenteDesde: 'asc' } }))!;
      const novo = (await a.metaCmvConjunto.findFirst({ where: { lojaId: null }, orderBy: { vigenteDesde: 'desc' } }))!;
      expect(antigo.id).not.toBe(novo.id);
      await expect(cru(db, perfil, A.id, `UPDATE "MetaCmvConjunto" SET "versao" = 99 WHERE "id" = $1`, antigo.id)).rejects.toThrow(/mais novo/);
      const umaMeta = (await a.metaCmvCategoria.findFirst({ where: { conjuntoId: antigo.id } }))!;
      await expect(cru(db, perfil, A.id, `UPDATE "MetaCmvCategoria" SET "percentualBp" = 1 WHERE "id" = $1`, umaMeta.id)).rejects.toThrow(/mais novo/);
      await expect(cru(db, perfil, A.id, `DELETE FROM "MetaCmvCategoria" WHERE "id" = $1`, umaMeta.id)).rejects.toThrow(/mais novo/);
      await expect(cru(db, perfil, A.id, `DELETE FROM "MetaCmvConjunto" WHERE "id" = $1`, novo.id)).rejects.toThrow(/não se apaga|permission denied/);
      await expect(cru(db, perfil, A.id, `UPDATE "MetaCmvConjunto" SET "vigenteDesde" = DATE '2026-05-01' WHERE "id" = $1`, novo.id)).rejects.toThrow(/não muda de loja nem de vigência/);
      // O mais novo muda (é o que a tela faz).
      await expect(cru(db, perfil, A.id, `UPDATE "MetaCmvConjunto" SET "versao" = "versao" WHERE "id" = $1`, novo.id)).resolves.toBeDefined();
    });

    it('a loja que segue a rede não tem meta própria; a meta tem de ser de 0 a 100 %; o grão (escopo, vigência) não repete', async () => {
      const seg = (await a.metaCmvConjunto.findFirst({ where: { lojaId: ids.dl }, orderBy: { vigenteDesde: 'desc' } }))!;
      expect(seg.segueARede).toBe(true);
      await expect(a.metaCmvCategoria.create({ data: { parceiroId: A.id, conjuntoId: seg.id, categoriaId: cat.PROTEINA, percentualBp: 100 } })).rejects.toThrow(/segue a rede|nao tem meta propria|não tem meta própria/i);
      const novo = (await a.metaCmvConjunto.findFirst({ where: { lojaId: null }, orderBy: { vigenteDesde: 'desc' } }))!;
      await expect(cru(db, perfil, A.id, `UPDATE "MetaCmvCategoria" SET "percentualBp" = 10001 WHERE "conjuntoId" = $1 AND "categoriaId" = $2`, novo.id, cat.PROTEINA)).rejects.toThrow(/percentual_faixa|check/i);
      await expect(cru(db, perfil, A.id, `UPDATE "MetaCmvCategoria" SET "percentualBp" = -1 WHERE "conjuntoId" = $1 AND "categoriaId" = $2`, novo.id, cat.PROTEINA)).rejects.toThrow(/percentual_faixa|check/i);
      await expect(a.metaCmvConjunto.create({ data: { parceiroId: A.id, lojaId: null, vigenteDesde: novo.vigenteDesde, criadoPorNome: 'x' } })).rejects.toThrow(/Unique|unique|duplicate/i);
      await expect(a.metaCmvConjunto.create({ data: { parceiroId: A.id, lojaId: null, vigenteDesde: dia('2026-11-01'), segueARede: true, criadoPorNome: 'x' } })).rejects.toThrow(/rede_nao_segue|check/i);
    });

    it('isolamento: a categoria e a loja de outro parceiro não entram (FK composta), por SQL cru também', async () => {
      const B = await db.parceiroFlow.create({ data: { nome: 'Casa Beta I2a', slug: `i2a-b-${sufixo}`, status: 'ATIVO' } });
      criados.push(B.id);
      const b = doParceiro(B.id, db);
      await garantirCategoriasPadrao(b);
      const catB = (await listarCategorias(b)).find((c) => c.chave === 'PROTEINA')!.id;
      const lojaB = await cadastrarLoja(b, { nome: 'Loja Beta' }, 'Beta');
      if (!lojaB.ok) throw new Error(JSON.stringify(lojaB));
      // Pela regra: a categoria de A no formulário de B é forjada.
      const forjada = await salvarMetasPorCategoria(b, DONA(), { lojaId: null, versao: (await situacaoDasMetasPorCategoria(b, DONA(), null, HOJE))!.versao, total: '', campos: { [cat.PROTEINA]: '5' } }, 'Beta', HOJE);
      expect(forjada.ok).toBe(false);
      // Pelo banco: conjunto de B com meta de categoria de A, e uso de loja de A numa categoria de B.
      const conjB = await b.metaCmvConjunto.create({ data: { parceiroId: B.id, lojaId: null, vigenteDesde: dia('2026-10-01'), criadoPorNome: 'Beta' } });
      await expect(cru(db, perfil, B.id, `INSERT INTO "MetaCmvCategoria" ("id","parceiroId","conjuntoId","categoriaId","percentualBp") VALUES ('x1', $1, $2, $3, 100)`, B.id, conjB.id, cat.PROTEINA)).rejects.toThrow(/foreign key|violates/i);
      await expect(cru(db, perfil, B.id, `INSERT INTO "CategoriaNaLoja" ("id","parceiroId","lojaId","categoriaId") VALUES ('x2', $1, $2, $3)`, B.id, ids.vp, catB)).rejects.toThrow(/foreign key|violates/i);
      await expect(cru(db, perfil, B.id, `INSERT INTO "MetaCmvConjunto" ("id","parceiroId","lojaId","vigenteDesde") VALUES ('x3', $1, $2, DATE '2026-10-01')`, B.id, ids.vp)).rejects.toThrow(/foreign key|violates/i);
      // E o painel de A não vê nada de B (o portão e a RLS).
      expect(await a.metaCmvConjunto.count({ where: { id: conjB.id } })).toBe(0);
    });
  });

  // ------------------------------------------------------------ 14. consultas constantes
  it('critério 14: o painel da rede lê o mesmo número de consultas com 1 ou com 50 lojas (um GROUP BY loja × categoria)', async () => {
    const montar = async (nome: string, quantas: number) => {
      const P = await db.parceiroFlow.create({ data: { nome, slug: `i2a-${nome.replace(/\W/g, '').toLowerCase()}-${sufixo}`, status: 'ATIVO' } });
      criados.push(P.id);
      const base = doParceiro(P.id, db);
      await garantirCategoriasPadrao(base);
      const proteina = (await listarCategorias(base)).find((c) => c.chave === 'PROTEINA')!.id;
      const i = await cadastrarInsumo(base, { tipo: 'INGREDIENTE', escala: 'base', nome: 'Insumo muitos', unidade: 'KG', conteudo: '1', preco: '10,00', conservacao: 'SECO', categoriaId: proteina });
      if (!i.ok) throw new Error(JSON.stringify(i));
      const lojasIds: string[] = [];
      for (let n = 0; n < quantas; n++) {
        const l = await base.loja.create({ data: { parceiroId: P.id, nome: `Loja ${String(n).padStart(2, '0')}`, slug: `l${n}-${sufixo}`, criadoEm: new Date('2026-01-10T12:00:00Z'), canaisDeVenda: ['LOJA'] } });
        lojasIds.push(l.id);
        await nota(base, i.id, { lojaId: l.id, numero: `P${n}`, data: '2026-10-05', centavos: R(500), lancadaEm: BRT('2026-10-05', '12:00') });
      }
      await base.faturamentoLancamento.createMany({
        data: lojasIds.flatMap((lojaId) =>
          Array.from({ length: 21 }, (_, k) => {
            const d = `2026-10-${String(k + 1).padStart(2, '0')}`;
            return { parceiroId: P.id, lojaId, canal: 'LOJA' as const, data: dia(d), valorCentavos: k === 9 ? R(10_000) : 0, pedidos: k === 9 ? 10 : 0, clientes: k === 9 ? 10 : 0, origem: 'MANUAL' as const, chaveIdempotencia: `manual:${lojaId}:-:LOJA:${d}`, atualizadoPorNome: 'Marina' };
          }),
        ),
      });
      return P.id;
    };
    const [com1Id, com50Id] = [await montar('Uma loja I2a', 1), await montar('Cinquenta lojas I2a', 50)];
    const contado = new PrismaClient({ datasources: { db: { url: URL_TESTE } }, log: [{ emit: 'event', level: 'query' }] });
    let consultas = 0;
    let ligado = false;
    contado.$on('query', (e) => {
      if (ligado && !/^(BEGIN|COMMIT|ROLLBACK)/i.test(e.query)) consultas++;
    });
    try {
      const contar = async (parceiroId: string) => {
        consultas = 0;
        ligado = true;
        const r = await cmvPorCategoria(doParceiro(parceiroId, contado), DONA(), { tipo: 'rede' }, OUTUBRO, HOJE);
        ligado = false;
        expect(r?.painel).toBeTruthy();
        return { consultas, r: r! };
      };
      await contar(com1Id); // aquece a conexão
      const com1 = await contar(com1Id);
      const com50 = await contar(com50Id);
      expect(com1.consultas).toBeGreaterThan(5);
      expect(com50.consultas).toBe(com1.consultas);
      expect(com1.r.painel!.somaDasComprasCentavos).toBe(R(500));
      expect(com50.r.painel!.somaDasComprasCentavos).toBe(R(500) * 50);
      expect(com50.r.lojasIncluidas).toBe(50);
    } finally {
      await contado.$disconnect();
    }
  });
});
