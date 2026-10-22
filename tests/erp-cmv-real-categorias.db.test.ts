/**
 * ERP I.2b · CMV real por categoria, compra × real, evolução, matriz e meta total por loja (Postgres real).
 *
 * Casa Beta, setembro de 2026 (encerrado, hoje = 22/10) com três lojas, uma para cada caminho do real por categoria:
 *
 *  Vila da Penha (VP, receita R$ 100.000,00) — estoque inicial e final COM retrato por insumo.
 *    Abertura 01/09 R$ 10.000,00: Frango 4.000, Queijo 3.000, Caixa 1.000, Molho (pré-preparo) 500, Tomate 1.500.
 *    Notas de setembro (movem o livro): Frango 8.000 + 600 (lançada só em 02/10, de 29/09: o corte soma), Queijo 2.000, Tomate 2.600,
 *    Caixa 400, "Sem categoria" 200 = R$ 13.800,00. Uma nota de Queijo R$ 200,00 de 03/10 entrou no livro em 30/09 (o corte tira).
 *    Fechamento 30/09 R$ 11.350,00 (retrato): Frango 5.000, Queijo 2.700, Caixa 900, Molho 800, Tomate 1.800, sem categoria 150.
 *    Estoque final com o corte R$ 11.750,00. Real = 10.000 + 13.800 − 11.750 = R$ 12.050,00:
 *    Proteína 7.000, Laticínios 2.500, Hortifruti 2.300, Descartáveis 500, Sem categoria 50, Pré-preparos −300.
 *    Compra × real: compras R$ 13.800,00, diferença −R$ 1.750,00 (o estoque subiu de 10.000 para 11.750).
 *  Unidade Tijuca (DL, R$ 30.000,00) — a abertura é de ANTES do retrato (só os movimentos ABERTURA) e o fechamento tem retrato.
 *    Abertura R$ 2.000,00 (Frango 1.200, Queijo 800), nota de Frango 1.000, fechamento R$ 2.400,00 (Frango 1.700, Queijo 700): real R$ 600,00.
 *  Centro (CE, R$ 20.000,00) — fechamento SEM retrato: o DRE usa o real (R$ 300,00) e as categorias ficam pelas compras (R$ 500,00).
 *  Rede: real misto R$ 12.950,00; Proteína 8.000, Laticínios 2.600; variação do estoque −R$ 200,00 (Centro).
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-cmv-real-categorias.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { salvarCanaisDaLoja } from '@/lib/erp/faturamento';
import { garantirCategoriasPadrao, listarCategorias } from '@/lib/erp/categorias';
import { aplicarModelo32, realDoMontante } from '@/lib/erp/cmv-categorias-campos';
import { cmvPorCategoria, evolucaoDeCategorias, type CmvPorCategoria } from '@/lib/erp/cmv-categorias';
import { realPorCategoria } from '@/lib/erp/cmv-categorias-real';
import { dreDoPeriodo } from '@/lib/erp/dre';
import { fecharPeriodo } from '@/lib/erp/dre-fechamento';
import { salvarMetasPorCategoria, situacaoDasMetasPorCategoria, type EntradaDasMetasPorCategoria } from '@/lib/erp/metas-categorias';
import { orcamentoDeCompra, type VistaCompleta } from '@/lib/erp/orcamento';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import { BRT, abertura, dia, faturamento, fechamentoDeEstoque, nota, periodoRegistrado, R, sp, aberturaComItens, fechamentoComRetrato } from './erp-cmv-apoio';
import { cadastrarInsumoDeTeste as cadastrarInsumo, cru, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const HOJE = '2026-10-22';
const SETEMBRO = '2026-09-10';
const OUTUBRO = '2026-10-10';

describe.skipIf(!URL_TESTE)('ERP I.2b · CMV real por categoria (Postgres real)', { timeout: 300_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `r${globalThis.crypto.randomUUID().slice(0, 8)}`;
  const criados: string[] = [];
  let a: ClienteDoParceiro;
  const ids: Record<string, string> = {};
  const cat: Record<string, string> = {};
  const insumo: Record<string, string> = {};

  const alcance = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR', lojaIds: string[] | 'rede'): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const DONA = () => alcance('DONO', 'rede');
  const GERENTE_VP = () => alcance('GERENTE', [ids.vp]);
  const N1 = () => ALCANCE_FLOWFOODS;
  const REDE = { tipo: 'rede' as const };
  const loja = (c: 'vp' | 'dl' | 'ce') => ({ tipo: 'loja' as const, lojaId: ids[c] });
  const painel = (al: Alcance, escopo: { tipo: 'rede' } | { tipo: 'loja'; lojaId: string }, data = SETEMBRO, cliente = a) => cmvPorCategoria(cliente, al, escopo, data, HOJE);
  const linha = (r: CmvPorCategoria, chave: string) => r.painel!.linhas.find((l) => l.categoriaId === cat[chave])!;
  const reais = (r: CmvPorCategoria) => Object.fromEntries(r.painel!.linhas.map((l) => [l.categoriaId ? Object.entries(cat).find(([, id]) => id === l.categoriaId)![0] : l.chave, l.realizadoCentavos]));

  const salvar = async (lojaId: string | null, p: Partial<EntradaDasMetasPorCategoria>, hoje = HOJE) => {
    const s = (await situacaoDasMetasPorCategoria(a, DONA(), lojaId, hoje))!;
    return salvarMetasPorCategoria(a, DONA(), { lojaId, versao: s.versao, campos: {}, ...p }, 'Marina', hoje);
  };

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    const A = await db.parceiroFlow.create({ data: { nome: 'Casa Beta I2b', slug: `i2b-a-${sufixo}`, status: 'ATIVO' } });
    criados.push(A.id);
    a = doParceiro(A.id, db);
    for (const [chave, nome, canal] of [['vp', 'Vila da Penha', 'LOJA'], ['dl', 'Unidade Tijuca', 'DELIVERY_PROPRIO'], ['ce', 'Centro', 'LOJA']] as const) {
      const r = await cadastrarLoja(a, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
      await a.loja.update({ where: { id: r.id }, data: { criadoEm: new Date('2026-01-10T12:00:00Z') } });
      expect((await salvarCanaisDaLoja(a, r.id, [canal], ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'], 'Marina')).ok).toBe(true);
    }
    // Faturamento: maio a outubro (a evolução de 6 períodos); VP vende em todos, DL e CE só em setembro e outubro.
    const meses = [['2026-05-01', '2026-05-31', '2026-05-10'], ['2026-06-01', '2026-06-30', '2026-06-10'], ['2026-07-01', '2026-07-31', '2026-07-10'], ['2026-08-01', '2026-08-31', '2026-08-10'], ['2026-09-01', '2026-09-30', SETEMBRO], ['2026-10-01', '2026-10-31', OUTUBRO]] as const;
    for (const [de, ate, venda] of meses) {
      await faturamento(a, ids.vp, 'LOJA', de, ate, { [venda]: 100_000 });
      if (de >= '2026-09-01') {
        await faturamento(a, ids.dl, 'DELIVERY_PROPRIO', de, ate, { [venda]: 30_000 });
        await faturamento(a, ids.ce, 'LOJA', de, ate, { [venda]: 20_000 });
      }
    }

    await garantirCategoriasPadrao(a);
    for (const c of await listarCategorias(a)) if (c.chave) cat[c.chave] = c.id;
    const novo = async (chave: string, nome: string, tipo = 'INGREDIENTE') => {
      const r = await cadastrarInsumo(a, { tipo, escala: 'base', nome, unidade: 'KG', conteudo: '1', preco: '10,00', conservacao: 'SECO', categoriaId: cat[chave] });
      if (!r.ok) throw new Error(JSON.stringify(r));
      insumo[nome] = r.id;
    };
    await novo('PROTEINA', 'Frango');
    await novo('LATICINIOS', 'Queijo');
    await novo('HORTIFRUTI', 'Tomate');
    await novo('DESCARTAVEIS', 'Caixa', 'EMBALAGEM');
    await novo('MERCEARIA', 'Molho');
    await novo('OUTROS', 'Avulso');
    // O molho é pré-preparo (estoque dele vai à linha própria, qualquer que seja a categoria); o avulso fica sem categoria.
    await a.insumo.update({ where: { id: insumo.Molho }, data: { tipo: 'PRE_PREPARO' } });
    await a.insumo.update({ where: { id: insumo.Avulso }, data: { categoriaId: null, classificadoPor: null, classificacaoMotivo: null, classificacaoLote: null, classificadoEm: null } });

    const n = (i: string, numero: string, data: string, reais: number, extra: { lancadaEm?: Date; lojaId?: string; movimenta?: boolean } = {}) =>
      nota(a, insumo[i], { lojaId: extra.lojaId ?? ids.vp, numero, data, centavos: R(reais), lancadaEm: extra.lancadaEm ?? BRT(data, '12:00'), movimenta: extra.movimenta ?? true });
    ids.set = await periodoRegistrado(a, SETEMBRO);
    ids.out = await periodoRegistrado(a, OUTUBRO);
    const item = (i: string, reais: number) => ({ insumoId: insumo[i], centavos: R(reais) });

    // ---- VP
    await aberturaComItens(a, ids.vp, BRT('2026-09-01', '09:00'), [item('Frango', 4_000), item('Queijo', 3_000), item('Caixa', 1_000), item('Molho', 500), item('Tomate', 1_500)]);
    await n('Frango', 'S1', '2026-09-05', 8_000);
    await n('Queijo', 'S2', '2026-09-06', 2_000);
    await n('Tomate', 'S3', '2026-09-08', 2_600);
    await n('Caixa', 'S4', '2026-09-09', 400);
    await n('Avulso', 'S5', '2026-09-09', 200);
    await fechamentoComRetrato(a, ids.vp, ids.set, {
      fim: '2026-09-30',
      quando: BRT('2026-09-30', '18:00'),
      itens: [item('Frango', 5_000), item('Queijo', 2_700), item('Caixa', 900), item('Molho', 800), item('Tomate', 1_800), item('Avulso', 150)],
    });
    await n('Frango', 'S6', '2026-09-29', 600, { lancadaEm: BRT('2026-10-02', '10:00') }); // depois do retrato, de setembro: o corte soma
    await n('Queijo', 'S7', '2026-10-03', 200, { lancadaEm: BRT('2026-09-30', '10:00') }); // até o retrato, de outubro: o corte tira

    // ---- DL: abertura de antes do retrato (só os movimentos ABERTURA) e fechamento com retrato
    await aberturaComItens(a, ids.dl, BRT('2026-09-01', '09:00'), [item('Frango', 1_200), item('Queijo', 800)], { antiga: true });
    await n('Frango', 'D1', '2026-09-12', 1_000, { lojaId: ids.dl });
    await fechamentoComRetrato(a, ids.dl, ids.set, { fim: '2026-09-30', quando: BRT('2026-09-30', '18:00'), itens: [item('Frango', 1_700), item('Queijo', 700)] });

    // ---- CE: o fechamento é de antes do retrato por insumo
    await abertura(a, ids.ce, BRT('2026-09-01', '09:00'), 1_000);
    await n('Frango', 'C1', '2026-09-10', 500, { lojaId: ids.ce });
    await fechamentoDeEstoque(a, insumo.Frango, ids.ce, ids.set, { fim: '2026-09-30', quando: BRT('2026-09-30', '18:00'), retrato: 1_200 });

    // ---- maio a agosto da VP: só compras (sem estoque apurado)
    for (const [mes, valor] of [['05', 4_000], ['06', 4_500], ['07', 5_000], ['08', 5_500]] as const) {
      await n('Frango', `M${mes}`, `2026-${mes}-05`, valor, { movimenta: false });
    }
    // ---- outubro
    await n('Frango', 'O1', '2026-10-05', 3_000, { movimenta: false });
    await n('Frango', 'O2', '2026-10-06', 1_000, { lojaId: ids.dl, movimenta: false });

    // ---- o modelo de 32 % (vale desde 01/09) com a Delivery personalizada só em outubro
    const modelo = aplicarModelo32(await listarCategorias(a));
    const r1 = await salvar(null, { total: '32', campos: modelo.campos }, '2026-09-15');
    if (!r1.ok) throw new Error(JSON.stringify(r1));
  });

  afterAll(async () => {
    if (db) {
      await limparParceiros(db, perfil, criados);
      await db.$disconnect();
    }
  });

  // ------------------------------------------------------------ 1. o real por categoria
  it('VP: o real por categoria soma o real do DRE ao centavo (R$ 12.050,00), com o corte, o pré-preparo à parte e o sem categoria', async () => {
    const r = (await painel(DONA(), loja('vp')))!;
    const dre = (await dreDoPeriodo(a, DONA(), loja('vp'), SETEMBRO, HOJE))!;
    const cmv = dre.resultado.linhas.find((l) => l.tipo === 'cmv')!;
    expect(cmv.valorCentavos).toBe(R(12_050));
    expect(r.total.linha.valorCentavos).toBe(R(12_050));
    expect(reais(r)).toMatchObject({ PROTEINA: R(7_000), LATICINIOS: R(2_500), HORTIFRUTI: R(2_300), DESCARTAVEIS: R(500), 'sem-categoria': R(50), preparos: -R(300) });
    // A soma de tudo é o CMV do DRE e a linha de variação do estoque some: o real abriu inteiro.
    expect(r.painel!.somaDasComprasCentavos).toBe(R(12_050));
    expect(r.painel!.variacaoCentavos).toBe(0);
    expect(r.painel!.linhas.find((l) => l.tipo === 'variacao')).toBeUndefined();
    expect(linha(r, 'PROTEINA').fonte).toBe('real');
    expect(r.painel!.lojasSemRealAberto).toEqual([]);
    expect(sp(r.painel!.linhas.find((l) => l.tipo === 'preparos')!.nota)).toContain('estoque de pré-preparo');
  });

  it('DL: a abertura de antes do retrato é lida pelos movimentos ABERTURA (a soma bate) e o real abre: R$ 600,00', async () => {
    const r = (await painel(DONA(), loja('dl')))!;
    expect(r.total.linha.valorCentavos).toBe(R(600));
    expect(reais(r)).toMatchObject({ PROTEINA: R(500), LATICINIOS: R(100) });
    expect(r.painel!.variacaoCentavos).toBe(0);
  });

  it('CE: fechamento sem retrato — as categorias ficam pelas compras e a variação do estoque explica a diferença, com o motivo', async () => {
    const r = (await painel(DONA(), loja('ce')))!;
    expect(r.total.linha.valorCentavos).toBe(R(300));
    expect(linha(r, 'PROTEINA')).toMatchObject({ realizadoCentavos: R(500), fonte: 'compras' });
    const v = r.painel!.linhas.find((l) => l.tipo === 'variacao')!;
    expect(v.realizadoCentavos).toBe(-R(200));
    expect(sp(v.nota)).toContain('Vale para Centro');
    expect(r.painel!.lojasSemRealAberto).toEqual([{ nome: 'Centro', motivo: 'o fechamento de estoque é de antes do retrato por insumo' }]);
    expect(r.painel!.compraReal).toBeNull();
  });

  it('rede: a soma continua sendo o CMV do DRE (R$ 12.950,00); Centro explica a variação de −R$ 200,00; só VP e Tijuca entram em compra × real', async () => {
    const r = (await painel(DONA(), REDE))!;
    expect(r.total.linha.valorCentavos).toBe(R(12_950));
    expect(r.total.linha.nota).toBe('real (contagem)');
    expect(reais(r)).toMatchObject({ PROTEINA: R(8_000), LATICINIOS: R(2_600), HORTIFRUTI: R(2_300), preparos: -R(300), variacao: -R(200) });
    const soma = r.painel!.linhas.reduce((s, l) => s + (l.realizadoCentavos ?? 0), 0);
    expect(soma).toBe(R(12_950));
    expect(linha(r, 'PROTEINA').fonte).toBe('mista');
    expect(r.painel!.compraReal!.lojasComparadas.sort()).toEqual(['Unidade Tijuca', 'Vila da Penha']);
    expect(r.painel!.compraReal!.lojasDeFora.map((l) => l.nome)).toEqual(['Centro']);
  });

  // ------------------------------------------------------------ 2. compra × real
  it('compra × real por categoria (VP): real menos compra, o sinal do R$ é o do pp, e o estoque subiu R$ 1.750,00', async () => {
    const r = (await painel(DONA(), loja('vp')))!;
    const c = r.painel!.compraReal!;
    const por = Object.fromEntries(c.linhas.map((l) => [l.nome, l]));
    expect(por.Proteína).toMatchObject({ compraCentavos: R(8_600), realCentavos: R(7_000), diferencaCentavos: -R(1_600), inicialCentavos: R(4_000), finalCentavos: R(5_600) });
    expect(sp(por.Proteína.frase)).toBe('o estoque subiu R$ 1.600,00 (de R$ 4.000,00 para R$ 5.600,00)');
    expect(por['Laticínios, frios e embutidos']).toMatchObject({ compraCentavos: R(2_000), realCentavos: R(2_500), diferencaCentavos: R(500) });
    expect(sp(por['Laticínios, frios e embutidos'].frase)).toContain('o estoque desceu R$ 500,00');
    expect(c.totalCompraCentavos).toBe(R(13_800));
    expect(c.totalRealCentavos).toBe(R(12_050));
    expect(c.totalDiferencaCentavos).toBe(-R(1_750));
    // Igual ao painel da 2.3, que compara a loja inteira.
    const antigo = r.d.cmv.painel!.comparacoes[0];
    expect(antigo.diferencaCentavos).toBe(c.totalDiferencaCentavos);
    // Propriedade: o sinal do pp é o sinal do R$ (zero quando arredonda a 0,00) e a soma das diferenças por linha fecha no total.
    for (const l of c.linhas) {
      if (l.diferencaCentavos === null || l.diferencaBp === null) continue;
      expect(Math.sign(l.diferencaBp) === 0 || Math.sign(l.diferencaBp) === Math.sign(l.diferencaCentavos)).toBe(true);
    }
    expect(c.linhas.reduce((s, l) => s + (l.diferencaCentavos ?? 0), 0)).toBe(c.totalDiferencaCentavos);
  });

  // ------------------------------------------------------------ 3. matriz
  it('matriz categoria × loja: a coluna de cada loja fecha no CMV do DRE dela e a rede é a soma', async () => {
    const r = (await painel(DONA(), REDE))!;
    const m = r.painel!.matriz!;
    expect(m.lojas.map((l) => l.nome)).toEqual(['Centro', 'Unidade Tijuca', 'Vila da Penha']);
    m.lojas.forEach((l, i) => {
      const soma = m.linhas.reduce((s, x) => s + (x.celulas[i]?.centavos ?? 0), 0);
      expect(soma).toBe(l.cmvCentavos);
    });
    expect(m.lojas.map((l) => l.cmvCentavos)).toEqual([R(300), R(600), R(12_050)]);
    expect(m.linhas.reduce((s, x) => s + x.rede.centavos, 0)).toBe(R(12_950));
    const prot = m.linhas.find((x) => x.nome === 'Proteína')!;
    expect(prot.celulas.map((c) => c?.centavos)).toEqual([R(500), R(500), R(7_000)]);
    expect(prot.celulas[2]).toMatchObject({ bp: 700, metaBp: 1100, desvioBp: -400 });
  });

  it('o gerente da VP não recebe a matriz nem nada das outras lojas, nem por ?rede=1 nem por ?loja=<outra>', async () => {
    const g = GERENTE_VP();
    expect(await painel(g, REDE)).toBeNull();
    expect(await painel(g, loja('dl'))).toBeNull();
    const meu = (await painel(g, loja('vp')))!;
    expect(meu.painel!.matriz).toBeNull();
    expect(JSON.stringify(meu)).not.toContain('Tijuca');
    expect(JSON.stringify(meu)).not.toContain('Centro');
  });

  // ------------------------------------------------------------ 4. reclassificar e o fechado
  it('reclassificar o Queijo para Proteína move o real entre categorias e o total não muda; o fechado (v5) não muda', async () => {
    const antes = (await painel(DONA(), loja('vp')))!;
    const r = await fecharPeriodo(a, N1(), { inicio: '2026-09-01', ressalvas: [], justificativa: '' }, 'Ana Dona', HOJE);
    expect(r).toMatchObject({ ok: true, versao: 1 });
    const foto = (await a.dreFotografia.findFirst({ where: { periodoId: ids.set, substituidaEm: null }, select: { versaoDaConta: true, entrada: true } }))!;
    expect(foto.versaoDaConta).toBe(5);
    const entrada = foto.entrada as { categorias: { versao: number; lojas: Record<string, { real: unknown; categorias: { id: string; inicialCentavos?: number; entradasCentavos?: number; finalCentavos?: number }[] }> } };
    expect(entrada.categorias.versao).toBe(2);
    expect(entrada.categorias.lojas[ids.vp].real).toBeTruthy();
    expect(entrada.categorias.lojas[ids.ce].real).toBeNull();
    expect(entrada.categorias.lojas[ids.vp].categorias.find((c) => c.id === cat.PROTEINA)).toMatchObject({ inicialCentavos: R(4_000), entradasCentavos: R(8_600), finalCentavos: R(5_600) });

    const fechado = (await painel(DONA(), loja('vp')))!;
    expect(fechado.d.status).toBe('FECHADO');
    expect(JSON.stringify(fechado.painel!.linhas)).toBe(JSON.stringify(antes.painel!.linhas));
    expect(JSON.stringify(fechado.painel!.compraReal)).toBe(JSON.stringify(antes.painel!.compraReal));
    const redeFechada = (await painel(DONA(), REDE))!;
    expect(reais(redeFechada)).toMatchObject({ PROTEINA: R(8_000), preparos: -R(300), variacao: -R(200) });
    expect(redeFechada.painel!.matriz!.lojas.map((l) => l.cmvCentavos)).toEqual([R(300), R(600), R(12_050)]);

    await a.insumo.update({ where: { id: insumo.Queijo }, data: { categoriaId: cat.PROTEINA } });
    try {
      const depois = (await painel(DONA(), loja('vp')))!;
      expect(JSON.stringify(depois.painel!.linhas)).toBe(JSON.stringify(antes.painel!.linhas)); // fechado: só a fotografia
      // Outro período encerrado ao vivo (maio) muda com a categoria de hoje: o total não.
      const ao = (await painel(DONA(), loja('vp'), '2026-10-10'))!;
      expect(ao.painel!.somaDasComprasCentavos).toBe(ao.total.linha.valorCentavos);
    } finally {
      await a.insumo.update({ where: { id: insumo.Queijo }, data: { categoriaId: cat.LATICINIOS } });
    }
  });

  // ------------------------------------------------------------ 5. real ao vivo (antes de fechar)
  it('o real por categoria ao vivo soma o real do DRE em qualquer reclassificação (categoria de hoje, total fixo)', async () => {
    // Período encerrado e ainda aberto: agosto não tem estoque; a VP de setembro já está fechada, então prova-se por um pedido direto.
    const fechamento = (await a.contagem.findFirst({ where: { lojaId: ids.vp, tipo: 'FECHAMENTO' }, select: { id: true } }))!;
    const abertura = (await a.contagem.findFirst({ where: { lojaId: ids.vp, tipo: 'ABERTURA' }, select: { id: true } }))!;
    const pedido = { lojaId: ids.vp, inicio: '2026-09-01', fim: '2026-09-30', realCentavos: R(12_050), fechamentoId: fechamento.id, fechamentoAnteriorId: null, aberturaId: abertura.id, inicialDe: 'abertura' as const };
    const total = async () => {
      const m = await a.transacao((tx) => realPorCategoria(tx, [pedido]));
      const r = m.get('' + ids.vp + '|2026-09-01')!;
      expect(r.aberto).toBe(true);
      if (!r.aberto) return 0;
      return Array.from(r.real.categorias.values()).reduce((s, x) => s + realDoMontante(x), 0) + realDoMontante(r.real.preparos);
    };
    expect(await total()).toBe(R(12_050));
    await a.insumo.update({ where: { id: insumo.Frango }, data: { categoriaId: cat.OUTROS } });
    try {
      expect(await total()).toBe(R(12_050));
      // Uma soma que não fecha com o real do DRE não abre (nunca um número que não fecha).
      const errado = await a.transacao((tx) => realPorCategoria(tx, [{ ...pedido, realCentavos: R(12_051) }]));
      expect(errado.get(`${ids.vp}|2026-09-01`)).toMatchObject({ aberto: false });
    } finally {
      await a.insumo.update({ where: { id: insumo.Frango }, data: { categoriaId: cat.PROTEINA } });
    }
  });

  // ------------------------------------------------------------ 6. evolução
  it('evolução dos 6 períodos: do mais antigo ao mais novo, meta × realizado de cada um, sem inventar período sem dado', async () => {
    const e = (await evolucaoDeCategorias(a, DONA(), loja('vp'), OUTUBRO, HOJE))!;
    expect(e.periodos.map((p) => p.nome)).toHaveLength(6);
    expect(e.periodos.map((p) => p.inicio)).toEqual(['2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01']);
    expect(e.periodos.map((p) => p.situacao)).toEqual(['encerrado', 'encerrado', 'encerrado', 'encerrado', 'fechado', 'em-curso']);
    const prot = e.linhas.find((l) => l.nome === 'Proteína')!;
    expect(prot.celulas[0]).toMatchObject({ realizadoCentavos: R(4_000), realizadoBp: 400, fonte: 'compras' });
    expect(prot.celulas[3]).toMatchObject({ realizadoCentavos: R(5_500) });
    // Setembro (fechado, v5): o real da fotografia, e a meta da época (11 %, vigente desde 01/09); maio a agosto não havia meta.
    expect(prot.celulas[4]).toMatchObject({ realizadoCentavos: R(7_000), fonte: 'real', metaBp: 1100, desvioBp: -400 });
    expect(prot.celulas[0]!.metaBp).toBeNull();
    // O total de cada período é o CMV do DRE dele.
    const total = e.linhas.find((l) => l.tipo === 'total')!;
    expect(total.celulas[4]!.realizadoCentavos).toBe(R(12_050));
    expect(total.celulas[0]!.realizadoCentavos).toBe(R(4_000));
    // Mesmos números do painel de cada período (uma fonte só).
    const setembro = (await painel(DONA(), loja('vp')))!;
    expect(prot.celulas[4]!.realizadoCentavos).toBe(linha(setembro, 'PROTEINA').realizadoCentavos);
  });

  it('a evolução para na primeira data do ERP e uma loja fora do alcance não recebe nada', async () => {
    expect(await evolucaoDeCategorias(a, GERENTE_VP(), loja('dl'), OUTUBRO, HOJE)).toBeNull();
    expect(await evolucaoDeCategorias(a, GERENTE_VP(), REDE, OUTUBRO, HOJE)).toBeNull();
    const curta = (await evolucaoDeCategorias(a, DONA(), loja('vp'), '2020-02-10', HOJE))!;
    expect(curta.periodos.map((p) => p.inicio)).toEqual(['2020-01-01', '2020-02-01']);
  });

  // ------------------------------------------------------------ 7. meta total por loja
  it('loja personalizada com meta de CMV 30 % (rede 32 %): vale no DRE e no orçamento dela, só a partir de outubro, e a rede segue a da rede', async () => {
    const dl = await situacaoDasMetasPorCategoria(a, DONA(), ids.dl, HOJE);
    expect(dl!.totalCampo).toBe('');
    expect(dl!.totalDaRedeBp).toBe(3200);
    const modelo = aplicarModelo32(await listarCategorias(a));
    const r = await salvar(ids.dl, { segue: 'nao', total: '30', campos: modelo.campos, usa: {} });
    expect(r).toMatchObject({ ok: true });
    const depois = (await situacaoDasMetasPorCategoria(a, DONA(), ids.dl, HOJE))!;
    expect(depois.totalCampo).toBe('30');
    expect(depois.totalBp).toBe(3000);

    const metaDo = async (al: Alcance, esc: { tipo: 'rede' } | { tipo: 'loja'; lojaId: string }, data: string) => (await dreDoPeriodo(a, al, esc, data, HOJE))!;
    const out = await metaDo(DONA(), loja('dl'), OUTUBRO);
    expect(out.metas.cmv.metaBp).toBe(3000);
    expect(out.metaDoCmvDaLoja).toBe('loja');
    expect((await metaDo(DONA(), loja('vp'), OUTUBRO)).metas.cmv.metaBp).toBe(3200);
    const rede = await metaDo(DONA(), REDE, OUTUBRO);
    expect(rede.metas.cmv.metaBp).toBe(3200);
    expect(rede.lojasComMetaPropria).toEqual([{ nome: 'Unidade Tijuca', bp: 3000 }]);
    // Setembro (encerrado, ainda aberto na DRE ao vivo ou fechado): a meta da época era 32 % para todas.
    expect((await metaDo(DONA(), loja('dl'), SETEMBRO)).metas.cmv.metaBp).toBe(3200);

    // O orçamento de compra (2.5) usa a meta da loja: Tijuca 30 %, Vila da Penha 32 %, a rede tem as duas.
    const o = (await orcamentoDeCompra(a, DONA(), { hoje: HOJE }))!;
    const vista = (nome: string) => o.lojas.find((l) => l.nome === nome)!.vista as VistaCompleta;
    expect(vista('Unidade Tijuca').conta!.metaBp).toBe(3000);
    expect(vista('Vila da Penha').conta!.metaBp).toBe(3200);
    const rv = o.rede as VistaCompleta;
    expect(rv.metaMista).toBe(true);
    expect(rv.comMetaPropria).toEqual(['Unidade Tijuca']);
    expect(rv.conta!.tetoCentavos).toBe(vista('Unidade Tijuca').conta!.tetoCentavos + vista('Vila da Penha').conta!.tetoCentavos + vista('Centro').conta!.tetoCentavos);
    // Voltar a seguir a rede devolve os 32 %.
    const volta = await salvar(ids.dl, { segue: 'sim', campos: {}, usa: {} });
    expect(volta).toMatchObject({ ok: true });
    expect((await metaDo(DONA(), loja('dl'), OUTUBRO)).metas.cmv.metaBp).toBe(3200);
    expect((await a.metaCmvConjunto.findFirst({ where: { lojaId: ids.dl } }))!.metaTotalBp).toBeNull();
  });

  it('salvar metas quando já existe conjunto com vigência futura diz uma frase (não o erro do banco) e não grava nada', async () => {
    const antes = await a.metaCmvConjunto.count();
    const r = await salvar(ids.dl, { segue: 'nao', total: '31', campos: aplicarModelo32(await listarCategorias(a)).campos, usa: {} }, '2026-09-20');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erros.geral).toContain('depois de');
      expect(r.erros.geral).not.toMatch(/MetaCmvConjunto_sem_retroativo|Invalid|prisma/i);
    }
    expect(await a.metaCmvConjunto.count()).toBe(antes);
  });

  it('o banco recusa meta total na loja que segue a rede e na rede (CHECK), por SQL cru', async () => {
    const c = (await a.metaCmvConjunto.findFirst({ where: { lojaId: null } }))!;
    await expect(cru(db, perfil, a.parceiroId, `UPDATE "MetaCmvConjunto" SET "metaTotalBp" = 3000 WHERE "id" = '${c.id}'`)).rejects.toThrow();
    await expect(cru(db, perfil, a.parceiroId, `UPDATE "MetaCmvConjunto" SET "metaTotalBp" = 3000 WHERE "lojaId" = '${ids.dl}' AND "segueARede"`)).rejects.toThrow();
  });

  // ------------------------------------------------------------ 8. isolamento
  it('outro parceiro não lê o retrato nem o livro deste: o pedido com ids alheios não abre', async () => {
    const B = await db.parceiroFlow.create({ data: { nome: 'Casa Gama I2b', slug: `i2b-b-${sufixo}`, status: 'ATIVO' } });
    criados.push(B.id);
    const b = doParceiro(B.id, db);
    const fechamento = (await a.contagem.findFirst({ where: { lojaId: ids.vp, tipo: 'FECHAMENTO' }, select: { id: true } }))!;
    const abertura = (await a.contagem.findFirst({ where: { lojaId: ids.vp, tipo: 'ABERTURA' }, select: { id: true } }))!;
    const m = await b.transacao((tx) => realPorCategoria(tx, [{ lojaId: ids.vp, inicio: '2026-09-01', fim: '2026-09-30', realCentavos: R(12_050), fechamentoId: fechamento.id, fechamentoAnteriorId: null, aberturaId: abertura.id, inicialDe: 'abertura' }]));
    expect(m.get(`${ids.vp}|2026-09-01`)).toMatchObject({ aberto: false });
    expect(await cmvPorCategoria(b, DONA(), { tipo: 'loja', lojaId: ids.vp }, SETEMBRO, HOJE)).toBeNull();
  });

  // ------------------------------------------------------------ 9. consultas constantes
  it('o painel real e a evolução leem o mesmo número de consultas com 1 ou com 50 lojas (e com 6 períodos)', async () => {
    const montar = async (nome: string, quantas: number) => {
      const P = await db.parceiroFlow.create({ data: { nome, slug: `i2b-${nome.replace(/\W/g, '').toLowerCase()}-${sufixo}`, status: 'ATIVO' } });
      criados.push(P.id);
      const base = doParceiro(P.id, db);
      await garantirCategoriasPadrao(base);
      const proteina = (await listarCategorias(base)).find((c) => c.chave === 'PROTEINA')!.id;
      const i = await cadastrarInsumo(base, { tipo: 'INGREDIENTE', escala: 'base', nome: 'Insumo muitos', unidade: 'KG', conteudo: '1', preco: '10,00', conservacao: 'SECO', categoriaId: proteina });
      if (!i.ok) throw new Error(JSON.stringify(i));
      const setembro = await periodoRegistrado(base, SETEMBRO);
      for (let k = 0; k < quantas; k++) {
        const l = await base.loja.create({ data: { parceiroId: P.id, nome: `Loja ${String(k).padStart(2, '0')}`, slug: `l${k}-${sufixo}`, criadoEm: new Date('2026-01-10T12:00:00Z'), canaisDeVenda: ['LOJA'] } });
        await faturamento(base, l.id, 'LOJA', '2026-08-01', '2026-09-30', { [SETEMBRO]: 10_000 });
        await aberturaComItens(base, l.id, BRT('2026-09-01', '09:00'), [{ insumoId: i.id, centavos: R(1_000) }]);
        await nota(base, i.id, { lojaId: l.id, numero: `P${k}`, data: '2026-09-05', centavos: R(500), lancadaEm: BRT('2026-09-05', '12:00'), movimenta: true });
        await fechamentoComRetrato(base, l.id, setembro, { fim: '2026-09-30', quando: BRT('2026-09-30', '18:00'), itens: [{ insumoId: i.id, centavos: R(1_200) }] });
      }
      return P.id;
    };
    const [com1Id, com50Id] = [await montar('Uma loja I2b', 1), await montar('Cinquenta lojas I2b', 50)];
    const contado = new PrismaClient({ datasources: { db: { url: URL_TESTE } }, log: [{ emit: 'event', level: 'query' }] });
    let consultas = 0;
    let ligado = false;
    contado.$on('query', (e) => {
      if (ligado && !/^(BEGIN|COMMIT|ROLLBACK)/i.test(e.query)) consultas++;
    });
    try {
      const contar = async <T,>(f: () => Promise<T>) => {
        consultas = 0;
        ligado = true;
        const r = await f();
        ligado = false;
        return { consultas, r };
      };
      const painelDe = (id: string) => () => cmvPorCategoria(doParceiro(id, contado), DONA(), REDE, SETEMBRO, HOJE);
      const evolucaoDe = (id: string) => () => evolucaoDeCategorias(doParceiro(id, contado), DONA(), REDE, SETEMBRO, HOJE);
      await contar(painelDe(com1Id)); // aquece a conexão
      const p1 = await contar(painelDe(com1Id));
      const p50 = await contar(painelDe(com50Id));
      expect(p1.consultas).toBeGreaterThan(8);
      expect(p50.consultas).toBe(p1.consultas);
      expect(p1.r!.painel!.somaDasComprasCentavos).toBe(R(300));
      expect(p50.r!.painel!.somaDasComprasCentavos).toBe(R(300) * 50);
      expect(p50.r!.painel!.lojasSemRealAberto).toEqual([]);
      expect(p50.r!.painel!.linhas.find((l) => l.categoriaId && l.fonte)?.fonte).toBe('real');
      const e1 = await contar(evolucaoDe(com1Id));
      const e50 = await contar(evolucaoDe(com50Id));
      expect(e50.consultas).toBe(e1.consultas);
      expect(e1.r!.periodos.length).toBeGreaterThanOrEqual(2);
    } finally {
      await contado.$disconnect();
    }
  });
});
