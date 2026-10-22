/**
 * ERP 2.3 · os dois CMVs (Postgres real). O cenário é o da análise: a Casa Alfa, três lojas, setembro e outubro de 2026.
 *
 *  Vila da Penha (VP) abre o estoque em 01/09 09:00 (R$ 10.000,00); setembro compra R$ 22.500,00 (a nota N0 de R$ 500,00 foi
 *  lançada às 08:30, ANTES de concluir a abertura); fechamento de setembro aplicado em 30/09 18:00 (retrato R$ 12.000,00) e uma
 *  requisição de R$ 300,00 às 20:00. Outubro: N1 05/10 R$ 20.000,00 (19.880 + frete 120), N2 20/10 R$ 5.000,00, N3 cancelada, N4 de
 *  31/10 R$ 800,00 lançada em 01/11 10:00; fechamento de outubro aplicado em 02/11 15:00 (retrato R$ 14.100,00); antes dele, em 01/11,
 *  N5 (data 01/11) +R$ 1.000,00, requisição −R$ 400,00 e cíclica −R$ 50,00. Receita VP outubro R$ 120.000,00.
 *  Delivery (DL): estoque nunca aberto, nota de 10/10 R$ 4.000,00, receita R$ 30.000,00. Centro (CT): sem nota e sem estoque,
 *  receita R$ 10.000,00. Meta do CMV: 21,00 %.
 *
 * Os dados de tenant entram pelo portão (`doParceiro`). Cobre os critérios 1 a 15 e 17 (migração e ajuda estão em outros arquivos):
 *   1  parcial em 17/10 · 2-3 corte · 4 real que entra · 5 comparação · 6 rede "misto" · 7 nota tardia · 8 cíclica tardia
 *   9  setembro com a nota na abertura · 10 encadeia · 11 sem fechamento / estoque no meio · 12 itens sem preço
 *   13 fechar com a fotografia v2 · 14 corrida · 15 constante em consultas · 16 gerente e operador (a lib)
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-cmv.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { salvarCanaisDaLoja } from '@/lib/erp/faturamento';
import { cadastrarInsumoDeTeste as cadastrarInsumo } from './erp-db-apoio';
import { estornoDe } from '@/lib/erp/estoque-campos';
import { concluirAbertura, contarItem, gravarMovimentos, iniciarAbertura, obterContagemDeAbertura } from '@/lib/erp/estoque';
import { concluirContagem, iniciarFechamento } from '@/lib/erp/contagem';
import { lancarDespesa } from '@/lib/erp/despesas';
import type { TextosDaDespesa } from '@/lib/erp/despesa-campos';
import { dreDoPeriodo, type DreDoPeriodo } from '@/lib/erp/dre';
import { entradaDoDre } from '@/lib/erp/dre-entrada';
import { fecharPeriodo, reabrirPeriodo } from '@/lib/erp/dre-fechamento';
import { gravarFotografia } from '@/lib/erp/dre-fotografia';
import { montarDre } from '@/lib/erp/dre-campos';
import { linhasParaGravar } from '@/lib/erp/dre-fechamento-campos';
import { planoEfetivo } from '@/lib/erp/dre-plano';
import { salvarMetas, situacaoDasMetas } from '@/lib/erp/dre-metas';
import { cmvDasLojas } from '@/lib/erp/cmv';
import { SEM_CMV, FRASE_DO_CMV_ANTIGO } from '@/lib/erp/cmv-campos';
import { periodoDe } from '@/lib/erp/periodos';
import { travarParaEscrever } from '@/lib/erp/periodo-trava';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import { abertura, BRT, ciclica, dia, faturamento, fechamentoDeEstoque, movimento, nota, periodoRegistrado, R, sp } from './erp-cmv-apoio';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;

describe.skipIf(!URL_TESTE)('ERP 2.3 · os dois CMVs (Postgres real)', { timeout: 300_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `c${globalThis.crypto.randomUUID().slice(0, 8)}`;
  const criados: string[] = [];
  let A: { id: string };
  let a: ClienteDoParceiro;
  const ids: Record<string, string> = {};

  const alcance = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR', lojaIds: string[] | 'rede'): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const DONA = () => alcance('DONO', 'rede');
  const GERENTE_VP = () => alcance('GERENTE', [ids.vp]);
  const OPERADOR = () => alcance('OPERADOR', [ids.vp]);
  const N1 = () => ALCANCE_FLOWFOODS;

  const dre = (al: Alcance, escopo: { tipo: 'rede' } | { tipo: 'loja'; lojaId: string }, data: string, hoje: string, cliente = a): Promise<DreDoPeriodo | null> => dreDoPeriodo(cliente, al, escopo, data, hoje);
  const linha = (d: DreDoPeriodo, chave: string) => d.resultado.linhas.find((l) => l.chave === chave)!;
  const periodoReg = (inicio: string, cliente = a) => cliente.periodoApuracao.findFirst({ where: { inicio: dia(inicio) } });

  const textosDespesa = (p: Partial<TextosDaDespesa>): TextosDaDespesa => ({ envio: globalThis.crypto.randomUUID().replace(/-/g, ''), lojaId: '', linha: 'contabilidade', descricao: 'Contador do grupo', valor: '1.000,00', tipo: 'mes', dia: '', mes: '2026-10', de: '', ate: '', recorrente: false, vencimento: '', ...p });

  const lojasDe = (cliente: ClienteDoParceiro) => cliente.loja.findMany({ select: { id: true, nome: true }, orderBy: { nome: 'asc' } });
  const cmvAoVivo = (cliente: ClienteDoParceiro, inicio: string, hoje: string, lojasIds?: string[]) =>
    cliente.transacao(async (tx) => {
      const periodo = await periodoDe(tx, inicio);
      const anterior = await periodoDe(tx, new Date(dia(periodo.inicio).getTime() - 86_400_000).toISOString().slice(0, 10));
      const todas = await lojasDe(tx);
      return cmvDasLojas(tx, lojasIds ? todas.filter((l) => lojasIds.includes(l.id)) : todas, periodo, periodo.fim < hoje ? periodo.fim : null, hoje, anterior);
    });

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Casa Alfa CMV', slug: `cmv-a-${sufixo}`, status: 'ATIVO' } });
    criados.push(A.id);
    a = doParceiro(A.id, db);
    for (const [chave, nome] of [['vp', 'Vila da Penha'], ['dl', 'Delivery'], ['ct', 'Centro']] as const) {
      const r = await cadastrarLoja(a, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
      await a.loja.update({ where: { id: r.id }, data: { criadoEm: new Date('2026-01-10T12:00:00Z') } });
    }
    // Cada loja vende em UM canal, para o faturamento (que não é o assunto) ficar completo com poucas linhas.
    expect((await salvarCanaisDaLoja(a, ids.vp, ['LOJA'], ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'], 'Marina')).ok).toBe(true);
    expect((await salvarCanaisDaLoja(a, ids.dl, ['DELIVERY_PROPRIO'], ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'], 'Marina')).ok).toBe(true);
    expect((await salvarCanaisDaLoja(a, ids.ct, ['LOJA'], ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'], 'Marina')).ok).toBe(true);
    await faturamento(a, ids.vp, 'LOJA', '2026-09-01', '2026-10-31', { '2026-09-10': 100_000, '2026-10-10': 120_000 });
    await faturamento(a, ids.dl, 'DELIVERY_PROPRIO', '2026-09-01', '2026-10-31', { '2026-10-10': 30_000 });
    await faturamento(a, ids.ct, 'LOJA', '2026-09-01', '2026-10-31', { '2026-10-10': 10_000 });

    const i = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', nome: 'Insumo CMV', unidade: 'KG', conteudo: '1', preco: '10,00', conservacao: 'SECO' });
    if (!i.ok) throw new Error(JSON.stringify(i));
    ids.insumo = i.id;
    ids.set = await periodoRegistrado(a, '2026-09-10');
    ids.out = await periodoRegistrado(a, '2026-10-10');

    // ---- setembro da VP
    await abertura(a, ids.vp, BRT('2026-09-01', '09:00'), 10_000);
    await nota(a, ids.insumo, { lojaId: ids.vp, numero: 'N0', data: '2026-09-01', centavos: R(500), lancadaEm: BRT('2026-09-01', '08:30') }); // antes de concluir: já está na abertura
    await nota(a, ids.insumo, { lojaId: ids.vp, numero: 'S1', data: '2026-09-10', centavos: R(12_000), lancadaEm: BRT('2026-09-10', '12:00'), movimenta: true });
    await nota(a, ids.insumo, { lojaId: ids.vp, numero: 'S2', data: '2026-09-20', centavos: R(10_000), lancadaEm: BRT('2026-09-20', '12:00'), movimenta: true });
    await fechamentoDeEstoque(a, ids.insumo, ids.vp, ids.set, { fim: '2026-09-30', quando: BRT('2026-09-30', '18:00'), retrato: 12_000 });
    await movimento(a, ids.insumo, ids.vp, R(-300), BRT('2026-09-30', '20:00'), 'Requisição de 30/09');

    // ---- outubro da VP
    await nota(a, ids.insumo, { lojaId: ids.vp, numero: 'N1', data: '2026-10-05', centavos: R(19_880), frete: R(120), lancadaEm: BRT('2026-10-05', '12:00'), movimenta: true });
    await nota(a, ids.insumo, { lojaId: ids.vp, numero: 'N2', data: '2026-10-20', centavos: R(5_000), lancadaEm: BRT('2026-10-20', '12:00'), movimenta: true });
    await nota(a, ids.insumo, { lojaId: ids.vp, numero: 'N3', data: '2026-10-22', centavos: R(1_500), lancadaEm: BRT('2026-10-22', '12:00'), status: 'CANCELADA' });
    await nota(a, ids.insumo, { lojaId: ids.vp, numero: 'N4', data: '2026-10-31', centavos: R(800), lancadaEm: BRT('2026-11-01', '10:00'), movimenta: true });
    await nota(a, ids.insumo, { lojaId: ids.vp, numero: 'N5', data: '2026-11-01', centavos: R(1_000), lancadaEm: BRT('2026-11-01', '11:00'), movimenta: true });
    await movimento(a, ids.insumo, ids.vp, R(-400), BRT('2026-11-01', '14:00'), 'Requisição de 01/11');
    await movimento(a, ids.insumo, ids.vp, R(-50), BRT('2026-11-01', '16:00'), 'Cíclica de 01/11');
    ids.fechOut = await fechamentoDeEstoque(a, ids.insumo, ids.vp, ids.out, { fim: '2026-10-31', quando: BRT('2026-11-02', '15:00'), retrato: 14_100, proprioAjuste: R(-120) });

    // ---- a Delivery só compra; o Centro não tem nota nem estoque
    await nota(a, ids.insumo, { lojaId: ids.dl, numero: 'D1', data: '2026-10-10', centavos: R(4_000), lancadaEm: BRT('2026-10-10', '12:00') });
    // Uma despesa da rede (o contador do grupo), para a conta da rede fechar com ela.
    const d = await lancarDespesa(a, DONA(), textosDespesa({}), 'Marina', '2026-11-05');
    if (!d.ok) throw new Error(JSON.stringify(d));
    // A meta do CMV de 21,00 % vale a partir de 01/10.
    const versao = (await situacaoDasMetas(a, DONA(), '2026-10-17'))!.versao;
    const m = await salvarMetas(a, DONA(), { valores: { cmv: '21' }, versao }, 'Marina', '2026-10-17');
    if (!m.ok) throw new Error(JSON.stringify(m));
  });

  afterAll(async () => {
    if (db) {
      await limparParceiros(db, perfil, criados);
      await db.$disconnect();
    }
  });

  // ------------------------------------------------------------ 1. o período em curso: só a compra
  it('critério 1: em 17/10 o CMV da VP é a compra até ontem (R$ 20.000,00), "pelas compras · parcial"; o real fecha na contagem (abre em 29/10); N2 (20/10) fica fora', async () => {
    const d = (await dre(DONA(), { tipo: 'loja', lojaId: ids.vp }, '2026-10-10', '2026-10-17'))!;
    expect(d.emCurso).toBe(true);
    expect(d.ate).toBe('2026-10-16');
    expect(linha(d, 'cmv')).toMatchObject({ valorCentavos: R(20_000), nota: 'pelas compras · parcial', percentualBp: 1667 });
    expect(linha(d, 'cmv:compra')).toMatchObject({ valorCentavos: R(20_000), nivel: 1, tipo: 'linha', codigo: null, linhaId: null });
    expect(linha(d, 'cmv:real')).toMatchObject({ valorCentavos: null, nota: 'fecha na contagem de fechamento (abre em 29/10)' });
    // Sem o "Em breve", e o CMV conta no resultado (a VP tem nota): a margem sai sem o aviso.
    expect(d.resultado.linhas.some((l) => l.nota === 'Em breve')).toBe(false);
    expect(linha(d, 'margem-contribuicao')).toMatchObject({ semContar: [], valorCentavos: R(100_000) }); // R$ 120.000,00 − o CMV de R$ 20.000,00
    expect(linha(d, 'resultado-do-periodo')).toMatchObject({ semContar: [], valorCentavos: R(100_000) });
    expect(d.cmv.painel).toBeNull(); // o painel compra × real é do período encerrado
    // Realizado × meta: o CMV da casa agora tem valor e a meta compara (R$ 20.000,00 de R$ 120.000,00 = 16,7 % contra 21,00 %).
    expect(d.metas.cmv).toMatchObject({ metaBp: 2100, desvioBp: 1667 - 2100 });
    expect(d.metas.cmv.faixa).toMatchObject({ cor: 'AZUL', palavra: 'bem melhor que a meta' });
  });

  // ------------------------------------------------------------ 2 e 3. o corte
  it('critérios 2 e 3: estoque final de setembro R$ 11.700,00 (a requisição das 20:00 desce) e de outubro R$ 13.550,00 (o que entrou em novembro antes do retrato sai; N4 e o ajuste do próprio fechamento não mexem)', async () => {
    const hoje = '2026-11-05';
    const set = await cmvAoVivo(a, '2026-09-10', hoje);
    const out = await cmvAoVivo(a, '2026-10-10', hoje);
    const vpSet = set.lojas.find((l) => l.lojaId === ids.vp)!.real!;
    const vpOut = out.lojas.find((l) => l.lojaId === ids.vp)!.real!;
    expect(vpSet.finalCentavos).toBe(R(11_700));
    expect(vpOut.inicialCentavos).toBe(R(11_700)); // EI(out) = EF(set), derivado, nunca reavaliado
    expect(vpOut.finalCentavos).toBe(R(13_550));
    expect(vpOut.inicialDe).toBe('fechamento');
    expect(vpOut.fechamentoId).toBe(ids.fechOut);
  });

  // ------------------------------------------------------------ 4. o real que entra
  it('critério 4: DRE de outubro em 05/11 — compra R$ 25.800,00 (21,5 %), real R$ 23.950,00 (20,0 %) é o que entra, "real (contagem)", −1,0 pp da meta; Centro nulo "sem o CMV"', async () => {
    const d = (await dre(DONA(), { tipo: 'loja', lojaId: ids.vp }, '2026-10-10', '2026-11-05'))!;
    expect(d.encerrado).toBe(true);
    expect(linha(d, 'cmv')).toMatchObject({ valorCentavos: R(23_950), percentualBp: 1996, nota: 'real (contagem)' });
    expect(linha(d, 'cmv:compra')).toMatchObject({ valorCentavos: R(25_800), percentualBp: 2150 });
    expect(linha(d, 'cmv:real')).toMatchObject({ valorCentavos: R(23_950) });
    expect(d.metas.cmv).toMatchObject({ metaBp: 2100, desvioBp: -104, desvioTexto: '−1,0\u00a0pp' });
    expect(d.metas.cmv.faixa).toMatchObject({ cor: 'VERDE', palavra: 'na meta' });
    for (const c of ['margem-contribuicao', 'resultado-operacional', 'resultado-do-periodo']) expect(linha(d, c).semContar).toEqual([]);
    // O CMV que vale (o real) é subtraído da receita líquida: 120.000,00 − 23.950,00 = 96.050,00, e o resultado herda.
    expect(linha(d, 'receita-liquida').valorCentavos).toBe(R(120_000));
    expect(linha(d, 'margem-contribuicao').valorCentavos).toBe(R(96_050));
    expect(linha(d, 'resultado-do-periodo').valorCentavos).toBe(R(96_050));
    // A meta é só da linha CMV: as duas de detalhe não têm.
    expect(d.metas['cmv:compra']).toBeUndefined();
    expect(d.metas['cmv:real']).toBeUndefined();

    const ct = (await dre(DONA(), { tipo: 'loja', lojaId: ids.ct }, '2026-10-10', '2026-11-05'))!;
    expect(linha(ct, 'cmv')).toMatchObject({ valorCentavos: null, nota: 'sem nota de compra no período' });
    expect(linha(ct, 'cmv:compra').valorCentavos).toBeNull();
    for (const c of ['margem-contribuicao', 'resultado-operacional', 'resultado-do-periodo']) expect(linha(ct, c).semContar).toEqual(['o CMV']);
  });

  // ------------------------------------------------------------ 5. comparação
  it('critério 5: o painel compra × real de outubro — −R$ 1.850,00 e −1,5 pp, "o estoque subiu R$ 1.850,00 (de R$ 11.700,00 para R$ 13.550,00)"', async () => {
    const d = (await dre(DONA(), { tipo: 'loja', lojaId: ids.vp }, '2026-10-10', '2026-11-05'))!;
    const [c] = d.cmv.painel!.comparacoes;
    expect(c).toMatchObject({ lojaId: ids.vp, compraCentavos: R(25_800), realCentavos: R(23_950), diferencaCentavos: R(-1_850), diferencaBp: -154, inicialCentavos: R(11_700), finalCentavos: R(13_550), notasNaAberturaCentavos: 0 });
    expect(sp(c.frase)).toContain('o estoque subiu R$ 1.850,00 (de R$ 11.700,00 para R$ 13.550,00)');
    expect(d.cmv.painel!.semReal).toEqual([]);
  });

  // ------------------------------------------------------------ 6. a rede
  it('critério 6: a rede soma o que vale em cada loja (R$ 27.950,00 = 17,5 % de R$ 160.000,00), selo "misto"; a soma do "Por loja" mais a despesa da rede é o resultado da rede, ao centavo', async () => {
    const d = (await dre(DONA(), { tipo: 'rede' }, '2026-10-10', '2026-11-05'))!;
    expect(d.resultado.receitaBrutaCentavos).toBe(R(160_000));
    expect(linha(d, 'cmv')).toMatchObject({ valorCentavos: R(27_950), percentualBp: 1747 });
    expect(linha(d, 'cmv').nota).toBe('misto: real em Vila da Penha; pelas compras em Delivery (estoque não aberto); sem o CMV de Centro');
    expect(linha(d, 'cmv:compra').valorCentavos).toBe(R(25_800 + 4_000));
    expect(linha(d, 'cmv:real')).toMatchObject({ valorCentavos: R(23_950), nota: 'apurado em 1 de 3 lojas' });
    // Alguém ficou sem CMV: os resultados avisam QUAL loja.
    expect(linha(d, 'resultado-do-periodo').semContar).toEqual(['o CMV de Centro']);
    // O CMV da rede sai da margem: 160.000,00 − 27.950,00 = 132.050,00; com o contador do grupo (R$ 1.000,00), o resultado é R$ 131.050,00.
    expect(linha(d, 'margem-contribuicao').valorCentavos).toBe(R(132_050));
    expect(linha(d, 'resultado-do-periodo').valorCentavos).toBe(R(131_050));
    // Rede = Σ lojas − o que é da rede.
    const somaDasLojas = d.porLoja!.reduce((s, l) => s + l.resultadoCentavos, 0);
    expect(linha(d, 'resultado-do-periodo').valorCentavos).toBe(somaDasLojas - R(1_000));
    // O painel: a VP compara; a Delivery e o Centro dizem por que ficaram só pelas compras.
    expect(d.cmv.painel!.comparacoes.map((c) => c.lojaNome)).toEqual(['Vila da Penha']);
    expect(d.cmv.painel!.semReal.map((l) => [l.lojaNome, l.motivo])).toEqual([
      ['Centro', 'estoque não aberto'],
      ['Delivery', 'estoque não aberto'],
    ]);
  });

  // ------------------------------------------------------------ 9, 10. setembro e o encadeamento
  it('critério 9: setembro (a nota N0 já estava na contagem de abertura) — compra R$ 22.500,00, entradas do livro R$ 22.000,00, real R$ 20.300,00, −R$ 2.200,00', async () => {
    const d = (await dre(DONA(), { tipo: 'loja', lojaId: ids.vp }, '2026-09-10', '2026-11-05'))!;
    expect(linha(d, 'cmv:compra').valorCentavos).toBe(R(22_500));
    expect(linha(d, 'cmv')).toMatchObject({ valorCentavos: R(20_300), nota: 'real (contagem)' });
    const [c] = d.cmv.painel!.comparacoes;
    expect(c).toMatchObject({ diferencaCentavos: R(-2_200), inicialCentavos: R(10_000), finalCentavos: R(11_700), notasNaAberturaCentavos: R(500) });
    expect(sp(c.frase)).toContain('o estoque subiu R$ 1.700,00');
    expect(sp(c.frase)).toContain('R$ 500,00 de notas já estavam na contagem de abertura');
    const set = (await cmvAoVivo(a, '2026-09-10', '2026-11-05')).lojas.find((l) => l.lojaId === ids.vp)!.real!;
    expect(set.inicialDe).toBe('abertura');
    expect(set.comprasReaisCentavos).toBe(R(22_000));
  });

  it('critério 10: encadeia — real(set) + real(out) = 10.000 + 22.000 + 25.800 − 13.550 = R$ 44.250,00', async () => {
    const [set, out] = [await cmvAoVivo(a, '2026-09-10', '2026-11-05'), await cmvAoVivo(a, '2026-10-10', '2026-11-05')].map((c) => c.lojas.find((l) => l.lojaId === ids.vp)!.real!);
    expect(set.centavos + out.centavos).toBe(R(44_250));
    expect(set.centavos + out.centavos).toBe(set.inicialCentavos + set.comprasReaisCentavos + out.comprasReaisCentavos - out.finalCentavos);
    expect(out.inicialCentavos).toBe(set.finalCentavos);
  });

  // ------------------------------------------------------------ 16 (a lib): gerente e operador
  it('critério 16 (a lib): o gerente da VP só tem a VP; a rede e a outra loja não abrem; o operador não tem nada; o painel dele só traz a VP', async () => {
    expect(await dre(GERENTE_VP(), { tipo: 'rede' }, '2026-10-10', '2026-11-05')).toBeNull();
    expect(await dre(GERENTE_VP(), { tipo: 'loja', lojaId: ids.dl }, '2026-10-10', '2026-11-05')).toBeNull();
    expect(await dre(OPERADOR(), { tipo: 'loja', lojaId: ids.vp }, '2026-10-10', '2026-11-05')).toBeNull();
    const g = (await dre(GERENTE_VP(), { tipo: 'loja', lojaId: ids.vp }, '2026-10-10', '2026-11-05'))!;
    expect(linha(g, 'cmv').valorCentavos).toBe(R(23_950));
    expect(g.cmv.painel!.comparacoes.map((c) => c.lojaId)).toEqual([ids.vp]);
    expect(JSON.stringify(g)).not.toContain(ids.dl);
  });

  // ------------------------------------------------------------ 11 e 12. variantes, num parceiro à parte
  describe('critérios 11 e 12: sem fechamento, estoque que abre no meio, itens sem preço (parceiro à parte)', () => {
    let G: { id: string };
    let g: ClienteDoParceiro;
    const lojas: Record<string, string> = {};
    const hoje = '2026-11-05';

    beforeAll(async () => {
      G = await db.parceiroFlow.create({ data: { nome: 'Variantes CMV', slug: `cmv-g-${sufixo}`, status: 'ATIVO' } });
      criados.push(G.id);
      g = doParceiro(G.id, db);
      for (const [chave, nome] of [['semSet', 'Sem setembro'], ['semOut', 'Sem outubro'], ['meio', 'Abriu no meio'], ['depois', 'Abriu depois']] as const) {
        const r = await cadastrarLoja(g, { nome }, 'Marina');
        if (!r.ok) throw new Error(JSON.stringify(r));
        lojas[chave] = r.id;
      }
      const i = await cadastrarInsumo(g, { tipo: 'INGREDIENTE', escala: 'base', nome: 'Insumo CMV', unidade: 'KG', conteudo: '1', preco: '10,00', conservacao: 'SECO' });
      if (!i.ok) throw new Error(JSON.stringify(i));
      const insumo = i.id;
      const set = await periodoRegistrado(g, '2026-09-10');
      const out = await periodoRegistrado(g, '2026-10-10');
      await abertura(g, lojas.semSet, BRT('2026-09-01', '09:00'), 1_000);
      await fechamentoDeEstoque(g, insumo, lojas.semSet, out, { fim: '2026-10-31', quando: BRT('2026-11-01', '12:00'), retrato: 1_200 });
      await abertura(g, lojas.semOut, BRT('2026-09-01', '09:00'), 1_000);
      await fechamentoDeEstoque(g, insumo, lojas.semOut, set, { fim: '2026-09-30', quando: BRT('2026-09-30', '18:00'), retrato: 1_100 });
      await abertura(g, lojas.meio, BRT('2026-10-15', '10:00'), 3_000);
      await fechamentoDeEstoque(g, insumo, lojas.meio, out, { fim: '2026-10-31', quando: BRT('2026-11-01', '12:00'), retrato: 3_500 });
      await abertura(g, lojas.depois, BRT('2026-11-03', '10:00'), 3_000);
    });

    it('critério 11: cada motivo é dito com as palavras da casa, e a compra segue valendo', async () => {
      const out = await cmvAoVivo(g, '2026-10-10', hoje);
      const por = (id: string) => out.lojas.find((l) => l.lojaId === id)!;
      expect(por(lojas.semSet).real).toBeNull();
      expect(por(lojas.semSet).motivoSemReal).toBe('falta o fechamento de estoque de setembro de 2026 (estoque inicial)');
      expect(por(lojas.semOut).motivoSemReal).toBe('falta o fechamento de estoque de outubro de 2026');
      expect(por(lojas.meio).motivoSemReal).toBe('o estoque abriu em 15/10; o real começa em novembro de 2026');
      expect(por(lojas.depois).motivoSemReal).toBe('o estoque só abriu em 03/11');
    });

    it('critério 12: o fechamento de verdade grava quantos insumos ficaram sem preço, no mesmo UPDATE que fecha; a contagem de antes da 2.3 fica nula ("não registrado")', async () => {
      const h = await db.parceiroFlow.create({ data: { nome: 'Sem preço CMV', slug: `cmv-h-${sufixo}`, status: 'ATIVO' } });
      criados.push(h.id);
      const c = doParceiro(h.id, db);
      const l = await cadastrarLoja(c, { nome: 'Loja H' }, 'Marina');
      if (!l.ok) throw new Error(JSON.stringify(l));
      await c.loja.update({ where: { id: l.id }, data: { criadoEm: new Date('2026-01-10T12:00:00Z') } });
      for (const [nome, semPreco] of [['Pão', false], ['Molho A', true], ['Molho B', true], ['Molho C', true]] as const) {
        const r = await cadastrarInsumo(c, { tipo: 'INGREDIENTE', escala: 'base', nome, unidade: 'KG', conteudo: '1', ...(semPreco ? { semPreco: 'on' } : { preco: '10,00' }), conservacao: 'SECO' });
        if (!r.ok) throw new Error(JSON.stringify(r));
      }
      const agoraAbertura = new Date('2026-09-01T13:00:00Z');
      expect((await iniciarAbertura(c, DONA(), l.id, 'Marina', agoraAbertura)).ok).toBe(true);
      const ab = (await obterContagemDeAbertura(c, DONA(), l.id))!;
      for (const item of ab.itens) expect((await contarItem(c, DONA(), l.id, { itemId: item.id, embalagens: '', solto: '4', escala: 'base', versao: item.versao }, 'Marina', { agora: agoraAbertura })).ok).toBe(true);
      const v = (await c.contagem.findFirst({ where: { lojaId: l.id, tipo: 'ABERTURA' }, select: { versao: true } }))!.versao;
      expect((await concluirAbertura(c, DONA(), l.id, { versao: v, confirmarNaoContados: false }, 'Marina', agoraAbertura)).ok).toBe(true);
      expect((await c.contagem.findFirst({ where: { lojaId: l.id, tipo: 'ABERTURA' } }))!.itensSemPreco).toBe(3);

      const agoraFecha = new Date('2026-09-30T15:00:00Z');
      const ini = await iniciarFechamento(c, DONA(), l.id, { inicio: '2026-09-01' }, 'Marina', agoraFecha);
      if (!ini.ok) throw new Error(JSON.stringify(ini));
      const fe = await c.contagem.findUnique({ where: { id: ini.id }, select: { versao: true } });
      const conc = await concluirContagem(c, DONA(), l.id, ini.id, { versao: fe!.versao, confirmarNaoContados: true }, 'Marina', agoraFecha);
      expect(conc.ok).toBe(true);
      expect((await c.contagem.findUnique({ where: { id: ini.id } }))).toMatchObject({ status: 'FECHADA', itensSemPreco: 3 });

      const cmv = await cmvAoVivo(c, '2026-09-10', hoje);
      expect(cmv.lojas[0].real).toMatchObject({ semPrecoInicial: 3, semPrecoFinal: 3, inicialDe: 'abertura' });
      // Contagem de antes da 2.3: nula, e o CHECK recusa número negativo.
      const antiga = await abertura(c, (await c.loja.create({ data: { parceiroId: h.id, nome: 'Loja antiga', slug: `antiga-${sufixo}` } })).id, new Date('2026-09-01T13:00:00Z'), 100, null as unknown as number);
      expect(antiga.itensSemPreco).toBeNull();
      await expect(c.contagem.update({ where: { id: ini.id }, data: { itensSemPreco: -1 } })).rejects.toThrow();
    });
  });

  // ------------------------------------------------------------ 13. fechar com a fotografia v2
  it('critério 13: fechar outubro grava a fotografia v2 com as linhas do CMV (rede e lojas) iguais ao ao vivo; Histórico com o CMV; a v1 de setembro diz "não apurado neste fechamento" e o nível 1 refaz em v2', async () => {
    const hoje = '2026-11-05';
    const aoVivo = (await dre(DONA(), { tipo: 'rede' }, '2026-10-10', hoje))!;
    const aoVivoVp = (await dre(DONA(), { tipo: 'loja', lojaId: ids.vp }, '2026-10-10', hoje))!;
    // Gerente de DUAS lojas (Vila da Penha e Delivery) olhando a Vila da Penha: o painel é só da loja pedida, ao vivo e depois de fechado.
    const GERENTE_DUAS = () => alcance('GERENTE', [ids.vp, ids.dl]);
    const aoVivoDuas = (await dre(GERENTE_DUAS(), { tipo: 'loja', lojaId: ids.vp }, '2026-10-10', hoje))!;
    expect(aoVivoDuas.cmv.painel!.comparacoes.map((c) => c.lojaId)).toEqual([ids.vp]);
    expect(aoVivoDuas.cmv.painel!.semReal).toEqual([]);
    const r = await fecharPeriodo(a, N1(), { inicio: '2026-10-01', ressalvas: [], justificativa: '' }, 'Ana Dona', hoje);
    expect(r).toEqual({ ok: true, versao: 1, jaFechado: false, ressalvas: 0 });

    const foto = await a.dreFotografia.findFirst({ where: { periodoId: ids.out, substituidaEm: null }, select: { id: true, versaoDaConta: true, entrada: true } });
    expect(foto!.versaoDaConta).toBe(4); // I.2a: o fechamento grava a versão 4 (a v2 trazia o CMV; a v3, o ano passado e as faixas; a v4, o CMV por categoria)
    const entrada = foto!.entrada as { versaoDaConta: number; cmv: { lojas: Record<string, { compraCentavos: number | null; real: { finalCentavos: number; inicialCentavos: number; comprasReaisCentavos: number } | null; motivoSemReal: string | null }> } };
    expect(entrada.versaoDaConta).toBe(4);
    expect(entrada.cmv.lojas[ids.vp].real!.finalCentavos).toBe(1_355_000);
    expect(entrada.cmv.lojas[ids.vp].real!.inicialCentavos).toBe(1_170_000);
    expect(entrada.cmv.lojas[ids.dl]).toMatchObject({ compraCentavos: R(4_000), real: null, motivoSemReal: 'estoque não aberto' });
    expect(entrada.cmv.lojas[ids.ct].compraCentavos).toBeNull();

    const fechado = (await dre(DONA(), { tipo: 'rede' }, '2026-10-10', hoje))!;
    const fechadoVp = (await dre(DONA(), { tipo: 'loja', lojaId: ids.vp }, '2026-10-10', hoje))!;
    expect(fechado.status).toBe('FECHADO');
    for (const [antes, depois] of [[aoVivo, fechado], [aoVivoVp, fechadoVp]] as const) {
      for (const chave of ['cmv', 'cmv:compra', 'cmv:real', 'margem-contribuicao', 'resultado-do-periodo']) {
        const x = linha(antes, chave);
        expect({ chave, v: linha(depois, chave).valorCentavos, n: linha(depois, chave).nota, s: linha(depois, chave).semContar }).toEqual({ chave, v: x.valorCentavos, n: x.nota, s: x.semContar });
      }
    }
    // O CMV abatido vale também na fotografia (e no que o Histórico guarda).
    expect(linha(fechado, 'margem-contribuicao').valorCentavos).toBe(R(132_050));
    expect(linha(fechado, 'resultado-do-periodo').valorCentavos).toBe(R(131_050));
    expect(linha(fechadoVp, 'resultado-do-periodo').valorCentavos).toBe(R(96_050));
    expect(fechadoVp.cmv.antigo).toBe(false);
    const fechadoDuas = (await dre(GERENTE_DUAS(), { tipo: 'loja', lojaId: ids.vp }, '2026-10-10', hoje))!;
    expect(fechadoDuas.cmv.painel).toEqual(aoVivoDuas.cmv.painel); // ao vivo = fechado, e nada da Delivery
    expect(JSON.stringify(fechadoDuas.cmv)).not.toContain(ids.dl);
    expect(fechadoVp.cmv.painel!.comparacoes[0]).toMatchObject({ diferencaCentavos: R(-1_850), finalCentavos: R(13_550) });
    expect(fechado.cmv.painel!.semReal.map((l) => l.lojaNome)).toEqual(['Centro', 'Delivery']);
    // O gerente lê a fotografia filtrada: só a VP no painel, nada da base da conta das outras lojas.
    const doGerente = (await dre(GERENTE_VP(), { tipo: 'loja', lojaId: ids.vp }, '2026-10-10', hoje))!;
    expect(doGerente.cmv.painel!.comparacoes.map((c) => c.lojaId)).toEqual([ids.vp]);
    expect(JSON.stringify(doGerente)).not.toContain(ids.dl);

    // O Histórico do fechamento ganha o CMV da rede e a fonte.
    const h = await a.historicoAlteracao.findFirst({ where: { entidade: 'PeriodoApuracao', entidadeId: ids.out, acao: 'FECHOU' } });
    expect(sp((h!.depois as Record<string, string>).cmv)).toBe('R$ 27.950,00 (misto)');
    expect(sp((h!.depois as Record<string, string>).resultado)).toBe('R$ 131.050,00');

    // O estoque inicial de novembro, derivado: o final de outubro (R$ 13.550,00), sem reavaliar.
    const novembro = await periodoRegistrado(a, '2026-11-10');
    await fechamentoDeEstoque(a, ids.insumo, ids.vp, novembro, { fim: '2026-11-30', quando: BRT('2026-12-01', '12:00'), retrato: 15_000 });
    const nov = await cmvAoVivo(a, '2026-11-10', '2026-12-05');
    expect(nov.lojas.find((l) => l.lojaId === ids.vp)!.real).toMatchObject({ inicialCentavos: R(13_550), inicialDe: 'fechamento' });

    // Setembro "fechado na 2.2b": a fotografia v1 não tem CMV. A tela diz a verdade, sem inventar número.
    await a.transacao(async (tx) => {
      const vazio = montarDre({ escopo: { tipo: 'rede' }, plano: planoEfetivo([]), receitas: [], taxaIfood: null, despesas: [], cmv: SEM_CMV });
      const v1 = linhasParaGravar(vazio, null, null, () => null)
        .filter((l) => !l.chave.startsWith('cmv:'))
        .map((l) => (l.chave === 'cmv' ? { ...l, valorCentavos: null, nota: 'Em breve' } : l));
      await gravarFotografia(tx, { periodoId: ids.set, inicio: '2026-09-01', fim: '2026-09-30', nomeDoPeriodo: 'Setembro de 2026', fechadoPorNome: 'Antes da 2.3', taxa: null, versaoDaConta: 1, entrada: {}, ressalvas: [], justificativa: null, linhas: v1 }, 1);
      await tx.periodoApuracao.update({ where: { id: ids.set }, data: { status: 'FECHADO', fechadoEm: new Date(), fechadoPorNome: 'Antes da 2.3' } });
    });
    const setV1 = (await dre(DONA(), { tipo: 'rede' }, '2026-09-10', hoje))!;
    expect(setV1.cmv).toEqual({ antigo: true, painel: null });
    expect(linha(setV1, 'cmv')).toMatchObject({ valorCentavos: null, nota: FRASE_DO_CMV_ANTIGO });
    // O nível 1 reabre e a dona fecha de novo: a v2 traz o real de setembro (R$ 20.300,00).
    const fotoV1 = (await a.dreFotografia.findFirst({ where: { periodoId: ids.set, substituidaEm: null } }))!;
    expect(await reabrirPeriodo(a, N1(), { inicio: '2026-09-01', motivo: 'Refazer com o CMV', fotografia: fotoV1.id }, 'Rodolfo')).toMatchObject({ ok: true });
    const v2 = await fecharPeriodo(a, N1(), { inicio: '2026-09-01', ressalvas: [], justificativa: '' }, 'Ana Dona', hoje);
    expect(v2).toMatchObject({ ok: true, versao: 2 });
    const setV2 = (await dre(DONA(), { tipo: 'loja', lojaId: ids.vp }, '2026-09-10', hoje))!;
    expect(setV2.cmv.antigo).toBe(false);
    expect(linha(setV2, 'cmv').valorCentavos).toBe(R(20_300));
  });

  // ------------------------------------------------------------ 7 e 8. depois do fechamento do DRE, direto pela leitura
  it('critério 7: nota de 30/10 (R$ 600,00) lançada em 03/11 — a compra sobe para R$ 26.400,00 e o estoque final para R$ 14.150,00; o real continua R$ 23.950,00 e a diferença vai a −R$ 2.450,00', async () => {
    await nota(a, ids.insumo, { lojaId: ids.vp, numero: 'N6', data: '2026-10-30', centavos: R(600), lancadaEm: BRT('2026-11-03', '10:00'), movimenta: true });
    const vp = (await cmvAoVivo(a, '2026-10-10', '2026-11-05')).lojas.find((l) => l.lojaId === ids.vp)!;
    expect(vp.compraCentavos).toBe(R(26_400));
    expect(vp.real).toMatchObject({ centavos: R(23_950), finalCentavos: R(14_150), comprasReaisCentavos: R(26_400) });
    expect(vp.real!.centavos - vp.compraCentavos!).toBe(R(-2_450));
  });

  it('critério 8: cíclica de −R$ 80,00 aplicada em 03/11 não mexe no estoque final nem no real de outubro; ela entra no corte de novembro', async () => {
    await ciclica(a, ids.insumo, ids.vp, R(-80), BRT('2026-11-03', '16:00'));
    const out = (await cmvAoVivo(a, '2026-10-10', '2026-11-05')).lojas.find((l) => l.lojaId === ids.vp)!.real!;
    expect(out).toMatchObject({ centavos: R(23_950), finalCentavos: R(14_150) });
    // Novembro parte de R$ 14.150,00 (o final de outubro, com a N6) e o −80 de 03/11 é consumo DE novembro: aparece no real dele
    // (14.150 + a N5 de R$ 1.000,00 − os R$ 15.000,00 do retrato = R$ 150,00), nunca no de outubro.
    const nov = (await cmvAoVivo(a, '2026-11-10', '2026-12-05')).lojas.find((l) => l.lojaId === ids.vp)!.real!;
    expect(nov).toMatchObject({ inicialCentavos: R(14_150), finalCentavos: R(15_000), comprasReaisCentavos: R(1_000), centavos: R(150) });
  });

  // ------------------------------------------------------------ a data da nota trocada de mês depois do retrato (veto do Guardião)
  describe('nota com a data trocada de mês depois do retrato (DRE ainda aberto)', () => {
    /**
     * Cada loja é um caso. A verdade física é o consumo: R$ 1.600,00 em setembro e R$ 500,00 em outubro, e os retratos (setembro em 29/09
     * 18:00, outubro em 02/11 15:00) são o estoque de verdade naquele instante. A nota M (R$ 600,00) muda de mês em 17/10, com ou sem mudança
     * de valor (R$ 700,00: estorno do que valia e entrada do novo). O CMV real tem de voltar a achar o consumo, e o estoque final de setembro
     * é a conta de cabeça: abertura + compras de setembro (pela data de AGORA da nota) − consumo.
     */
    const casos = [
      { chave: 'sepOut', de: '2026-09-10', para: '2026-10-01', valor: 600 },
      { chave: 'sepOutItens', de: '2026-09-10', para: '2026-10-01', valor: 700 },
      { chave: 'outSep', de: '2026-10-05', para: '2026-09-20', valor: 600 },
      { chave: 'outSepItens', de: '2026-10-05', para: '2026-09-20', valor: 700 },
    ] as const;
    let D: { id: string };
    let d: ClienteDoParceiro;
    const lojas: Record<string, string> = {};

    beforeAll(async () => {
      D = await db.parceiroFlow.create({ data: { nome: 'Data da nota CMV', slug: `cmv-d-${sufixo}`, status: 'ATIVO' } });
      criados.push(D.id);
      d = doParceiro(D.id, db);
      const i = await cadastrarInsumo(d, { tipo: 'INGREDIENTE', escala: 'base', nome: 'Insumo CMV', unidade: 'KG', conteudo: '1', preco: '10,00', conservacao: 'SECO' });
      if (!i.ok) throw new Error(JSON.stringify(i));
      const set = await periodoRegistrado(d, '2026-09-10');
      const out = await periodoRegistrado(d, '2026-10-10');
      for (const c of casos) {
        const l = await d.loja.create({ data: { parceiroId: D.id, nome: c.chave, slug: c.chave } });
        lojas[c.chave] = l.id;
        const naSetembro = c.de.startsWith('2026-09'); // a nota M já estava no estoque no retrato de setembro?
        await abertura(d, l.id, BRT('2026-09-01', '09:00'), 5_000);
        await nota(d, i.id, { lojaId: l.id, numero: 'S2', data: '2026-09-15', centavos: R(2_000), lancadaEm: BRT('2026-09-15', '12:00'), movimenta: true });
        const m = await nota(d, i.id, { lojaId: l.id, numero: 'M', data: c.de, centavos: R(600), lancadaEm: BRT(c.de, '12:00'), movimenta: true });
        const retratoSet = 5_000 + 2_000 + (naSetembro ? 600 : 0) - 1_600;
        await fechamentoDeEstoque(d, i.id, l.id, set, { fim: '2026-09-30', quando: BRT('2026-09-29', '18:00'), retrato: retratoSet });
        await nota(d, i.id, { lojaId: l.id, numero: 'O1', data: '2026-10-05', centavos: R(1_000), lancadaEm: BRT('2026-10-05', '13:00'), movimenta: true });
        // A edição de 17/10: a data troca de mês e, nos casos "Itens", o valor vai a R$ 700,00 (estorno do que valia + entrada do novo, pelo livro).
        await d.transacao(async (tx) => {
          await tx.notaEntrada.update({ where: { id: m }, data: { entradaEm: dia(c.para), ...(c.valor !== 600 ? { totalCentavos: R(c.valor) } : {}) } });
          if (c.valor !== 600) {
            await tx.notaEntradaItem.updateMany({ where: { notaId: m }, data: { valorTotalCentavos: R(c.valor), quantidadeMilesimos: R(c.valor) * 10 } });
            const original = (await tx.movimentoEstoque.findFirst({ where: { notaId: m, estornoDeId: null } }))!;
            await gravarMovimentos(
              tx,
              [
                estornoDe({ ...original, tipo: 'ENTRADA_COMPRA', unidadeSnapshot: original.unidadeSnapshot as 'KG' }, 'Nota editada'),
                { lojaId: l.id, insumoId: i.id, tipo: 'ENTRADA_COMPRA', quantidadeMilesimos: R(c.valor) * 10, valorCentavos: R(c.valor), insumoNome: 'Insumo CMV', unidade: 'KG', motivo: 'Nota M editada', chave: `nota:${m}:2`, notaId: m },
              ],
              { ocorridoEm: BRT('2026-10-17', '10:00') },
            );
          }
        });
        // Outubro: o estoque de verdade em 02/11 = o de 30/09 (de verdade) + o que entrou em outubro − o consumo de R$ 500,00.
        const estoqueSetDeVerdade = 5_000 + 2_000 + (c.para.startsWith('2026-09') ? c.valor : 0) - 1_600;
        const entrouEmOutubro = 1_000 + (c.para.startsWith('2026-10') ? c.valor : 0);
        // (a nota M, nos casos "Out→Set", entrou no livro em 05/10: o estoque de verdade de 30/09 é o que a conta de cabeça diz, e M já estava no físico)
        await fechamentoDeEstoque(d, i.id, l.id, out, { fim: '2026-10-31', quando: BRT('2026-11-02', '15:00'), retrato: estoqueSetDeVerdade + entrouEmOutubro - 500 });
      }
    });

    for (const c of casos) {
      it(`${c.chave}: a data da nota vai de ${c.de.slice(5)} para ${c.para.slice(5)}${c.valor !== 600 ? ' e o valor muda' : ''} — o real de cada mês volta ao consumo (R$ 1.600,00 e R$ 500,00) e o estoque final de setembro é o de cabeça`, async () => {
        const cmv = await cmvAoVivo(d, '2026-09-10', '2026-11-05', [lojas[c.chave]]);
        const out = await cmvAoVivo(d, '2026-10-10', '2026-11-05', [lojas[c.chave]]);
        const s = cmv.lojas[0].real!;
        const o = out.lojas[0].real!;
        const moveuParaOutubro = c.para.startsWith('2026-10');
        const finalSet = 5_000 + 2_000 + (moveuParaOutubro ? 0 : c.valor) - 1_600;
        expect(s.finalCentavos).toBe(R(finalSet));
        expect(s.comprasReaisCentavos).toBe(R(2_000 + (moveuParaOutubro ? 0 : c.valor)));
        expect(s.centavos).toBe(R(1_600));
        expect(o.inicialCentavos).toBe(R(finalSet));
        expect(o.comprasReaisCentavos).toBe(R(1_000 + (moveuParaOutubro ? c.valor : 0)));
        expect(o.centavos).toBe(R(500));
        // A compra (pela data de AGORA da nota) acompanha.
        expect(cmv.lojas[0].compraCentavos).toBe(R(2_000 + (moveuParaOutubro ? 0 : c.valor)));
        expect(out.lojas[0].compraCentavos).toBe(R(1_000 + (moveuParaOutubro ? c.valor : 0)));
      });
    }
  });

  // ------------------------------------------------------------ 15. consultas constantes
  it('critério 15: o CMV lê o mesmo número de consultas com 1 ou com 50 lojas', async () => {
    const P = await db.parceiroFlow.create({ data: { nome: 'Muitas lojas CMV', slug: `cmv-p-${sufixo}`, status: 'ATIVO' } });
    criados.push(P.id);
    const base = doParceiro(P.id, db);
    const i = await cadastrarInsumo(base, { tipo: 'INGREDIENTE', escala: 'base', nome: 'Insumo CMV', unidade: 'KG', conteudo: '1', preco: '10,00', conservacao: 'SECO' });
    if (!i.ok) throw new Error(JSON.stringify(i));
    const set = await periodoRegistrado(base, '2026-09-10');
    const out = await periodoRegistrado(base, '2026-10-10');
    const lojasIds: string[] = [];
    for (let n = 0; n < 50; n++) {
      const l = await base.loja.create({ data: { parceiroId: P.id, nome: `Loja ${String(n).padStart(2, '0')}`, slug: `l${n}-${sufixo}` } });
      lojasIds.push(l.id);
      await abertura(base, l.id, BRT('2026-09-01', '09:00'), 1_000);
      await fechamentoDeEstoque(base, i.id, l.id, set, { fim: '2026-09-30', quando: BRT('2026-09-30', '18:00'), retrato: 1_100 });
      await fechamentoDeEstoque(base, i.id, l.id, out, { fim: '2026-10-31', quando: BRT('2026-11-01', '18:00'), retrato: 1_300 });
      await nota(base, i.id, { lojaId: l.id, numero: `P${n}`, data: '2026-10-05', centavos: R(500), lancadaEm: BRT('2026-10-05', '12:00'), movimenta: true });
    }
    const contado = new PrismaClient({ datasources: { db: { url: URL_TESTE } }, log: [{ emit: 'event', level: 'query' }] });
    let consultas = 0;
    let ligado = false;
    contado.$on('query', (e) => {
      if (ligado && !/^(BEGIN|COMMIT|ROLLBACK)/i.test(e.query)) consultas++;
    });
    try {
      const cliente = doParceiro(P.id, contado);
      const contar = async (quantas: number) => {
        consultas = 0;
        ligado = true;
        const r = await cliente.transacao(async (tx) => {
          const periodo = await periodoDe(tx, '2026-10-10');
          const anterior = await periodoDe(tx, '2026-09-10');
          return cmvDasLojas(tx, lojasIds.slice(0, quantas).map((id, k) => ({ id, nome: `Loja ${k}` })), periodo, periodo.fim, '2026-11-05', anterior);
        });
        ligado = false;
        expect(r.lojas.filter((l) => l.real).length).toBe(quantas); // todas apuradas: o caminho inteiro foi percorrido
        return consultas;
      };
      await contar(2); // aquece a conexão: a primeira leitura traz consultas de abertura que não são do CMV
      const com1 = await contar(1);
      const com50 = await contar(50);
      expect(com1).toBeGreaterThan(3);
      expect(com50).toBe(com1);
    } finally {
      await contado.$disconnect();
    }
  });

  // ------------------------------------------------------------ 14. corrida
  it('critério 14: fechar outubro × uma nota de 25/10 sendo lançada — o fechamento ESPERA a trava e a fotografia tem a nota em compra e em compras do real (nunca metade)', async () => {
    const Rr = await db.parceiroFlow.create({ data: { nome: 'Corrida CMV', slug: `cmv-r-${sufixo}`, status: 'ATIVO' } });
    criados.push(Rr.id);
    const c = doParceiro(Rr.id, db);
    const l = await cadastrarLoja(c, { nome: 'Loja da corrida' }, 'Marina');
    if (!l.ok) throw new Error(JSON.stringify(l));
    await c.loja.update({ where: { id: l.id }, data: { criadoEm: new Date('2026-01-10T12:00:00Z') } });
    expect((await salvarCanaisDaLoja(c, l.id, ['LOJA'], ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'], 'Marina')).ok).toBe(true);
    await faturamento(c, l.id, 'LOJA', '2026-10-01', '2026-10-31', { '2026-10-10': 50_000 });
    const i = await cadastrarInsumo(c, { tipo: 'INGREDIENTE', escala: 'base', nome: 'Insumo CMV', unidade: 'KG', conteudo: '1', preco: '10,00', conservacao: 'SECO' });
    if (!i.ok) throw new Error(JSON.stringify(i));
    const out = await periodoRegistrado(c, '2026-10-10');
    await abertura(c, l.id, BRT('2026-10-01', '09:00'), 1_000);
    await nota(c, i.id, { lojaId: l.id, numero: 'R1', data: '2026-10-05', centavos: R(2_000), lancadaEm: BRT('2026-10-05', '12:00'), movimenta: true });
    await fechamentoDeEstoque(c, i.id, l.id, out, { fim: '2026-10-31', quando: BRT('2026-11-02', '12:00'), retrato: 1_500 });

    let terminou = false;
    let fechando!: Promise<unknown>;
    await c.transacao(async (tx) => {
      await travarParaEscrever(tx); // quem lança nota pega esta trava ANTES de ler o status do período
      await nota(tx as unknown as ClienteDoParceiro, i.id, { lojaId: l.id, numero: 'R2', data: '2026-10-25', centavos: R(700), lancadaEm: BRT('2026-11-03', '09:00'), movimenta: true });
      fechando = fecharPeriodo(c, N1(), { inicio: '2026-10-01', ressalvas: [], justificativa: '' }, 'Ana Dona', '2026-11-05').then((x) => ((terminou = true), x));
      await new Promise((r) => setTimeout(r, 900));
      expect(terminou).toBe(false); // sem a trava exclusiva o fechamento já teria lido o mundo sem a nota
    });
    expect(await fechando).toMatchObject({ ok: true });
    const foto = (await c.dreFotografia.findFirst({ where: { periodoId: out, substituidaEm: null }, select: { entrada: true } }))!;
    const loja = (foto.entrada as { cmv: { lojas: Record<string, { compraCentavos: number; real: { comprasReaisCentavos: number } }> } }).cmv.lojas[l.id];
    // A nota de 25/10 entrou nos dois lados ou em nenhum: aqui, nos dois.
    expect(loja.compraCentavos).toBe(R(2_700));
    expect(loja.real.comprasReaisCentavos).toBe(R(2_700));
  });

  // ------------------------------------------------------------ a leitura única
  it('a leitura única do DRE (`entradaDoDre`) é quem traz o CMV — o ao vivo e o fechamento leem o mesmo', async () => {
    const leitura = await a.transacao(async (tx) => entradaDoDre(tx, N1(), await periodoDe(tx, '2026-11-10'), '2026-11-04', { hoje: '2026-11-05' }));
    expect(leitura.cmv.parcial).toBe(true);
    expect(leitura.cmv.lojas.map((l) => l.lojaNome).sort()).toEqual(['Centro', 'Delivery', 'Vila da Penha']);
    // Em novembro (em curso) a VP já tem a N5 (01/11) e a N6 não (30/10 é de outubro).
    expect(leitura.cmv.lojas.find((l) => l.lojaId === ids.vp)!.compraCentavos).toBe(R(1_000));
  });
});
