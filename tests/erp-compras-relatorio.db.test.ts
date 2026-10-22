/**
 * ERP L.2 · relatórios de compras no Postgres de verdade (o motor: `compras-relatorio.ts`).
 *
 * O cenário tem números conferíveis à mão (os valores esperados abaixo NÃO saem do código testado):
 *   Muçarela (kg): Laticínios Rio vende a Peça de 2 kg; Frios do Zé vende o quilo solto (embalagens diferentes do MESMO insumo).
 *   L1  Lat · Penha  · 29/09 · nº 100  · 5 peças = 10 kg · R$ 400,00 + frete R$ 20,00
 *   Z1  Zé  · Penha  · 30/09 · nº 200  · 3 kg R$ 150,00 + Leite 12 L R$ 60,00 · frete R$ 10,00 (rateio 714 + 286)
 *   L2  Lat · Penha  · 01/10 · nº 101  · 3 peças = 6 kg · R$ 276,00 (R$ 46/kg); emitida em 30/09; lançada às 23:30 de 30/09 no Rio
 *   L3  Lat · Centro · 05/10 · nº 102  · 5 peças = 10 kg · R$ 470,00 (R$ 47/kg) + frete R$ 5,00; emitida em 04/10
 *   C   Lat · Penha  · 10/10 · nº 103  · 6 kg R$ 250,00, CANCELADA; L4 é a mesma nota 103 lançada de novo certa: R$ 240,00 (R$ 40/kg)
 *   Z2  Zé  · Penha  · 12/10 · nº 201  · Guardanapo 1.000 un R$ 80,00 + Bacon 4 kg R$ 100,00 (a unidade do bacon some no banco: sem base)
 *   Z3  Zé  · Penha  · 14/10 · nº 202  · Leite 5 L R$ 10,00 (o valor vira 0 no banco: bonificação, sem base); lançada às 23:59:59 de 10/10 no Rio
 *   Z4  Zé  · Penha  · 15/10 · nº 4570 · Muçarela 4 kg R$ 200,00 (R$ 50/kg); emitida em 15/10; ligada ao XML da nota 4570
 * Outubro (entrada): Muçarela 26 kg, R$ 1.186,00 → preço médio PONDERADO R$ 45,62/kg (a média simples dos preços daria R$ 45,75).
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-compras-relatorio.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarFornecedor, cancelarNota, lancarNota } from '@/lib/erp/compras';
import { ligarDocumento, obterDocumento, receberXml } from '@/lib/erp/documentos-fiscais';
import { resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import { relatorioCompleto, relatorioDaTela, linhasDoRecorte, gruposDoRecorte, totaisDoRecorte, resolverRecorte } from '@/lib/erp/compras-relatorio';
import {
  abreComoFormula,
  custoMedioEntregue,
  lerFiltrosDoRelatorio,
  precoMedioPonderado,
  type BaseDeData,
  type FiltrosDoRelatorio,
  type TotalPorUnidade,
} from '@/lib/erp/compras-relatorio-campos';
import { formatarCusto } from '@/lib/erp/unidades';
import { COLUNAS_DAS_LINHAS, planilhaDoRelatorio, responderPlanilha } from '@/lib/erp/compras-relatorio-planilha';
import { cadastrarInsumoDeTeste as cadastrarInsumo, cru, limparParceiros, perfilDoBanco, SEM_NOTA_FISCAL, type PerfilDoBanco } from './erp-db-apoio';
import { bytes, montarCenario, xmlDe } from './erp-documento-fiscal-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const HOJE = '2026-10-22';
const sp = (t: string) => t.replace(/\u00a0/g, ' ');

describe.skipIf(!URL_TESTE)('ERP L.2 · relatórios de compras (Postgres real)', { timeout: 180_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `r${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string };
  let B: { id: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const ids: Record<string, string> = {};
  const notas: Record<string, string> = {};

  const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR', lojaIds: string[] | 'rede'): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const DONA = () => alcanceDe('DONO', 'rede');
  const filtros = (params: Record<string, string | string[]> = {}, padrao: Partial<FiltrosDoRelatorio> = {}) =>
    lerFiltrosDoRelatorio({ de: '2026-10-01', ate: '2026-10-31', ...params }, HOJE, padrao);

  /** Lança uma nota pela regra de verdade. `itens`: [insumo, embalagem, quantidade, valor]. */
  async function lanca(chave: string, lojaId: string, fornecedorId: string, numero: string, data: string, total: string, itens: [string, string, string, string][], frete = '', serie = '') {
    const r = await lancarNota(a, DONA(), { lojaId, fornecedorId, numero, serie, data, frete, total, itens: itens.map(([insumoId, embalagem, quantidade, valor]) => ({ insumoId, embalagem, quantidade, valor })) }, 'Marina');
    if (!r.ok) throw new Error(`${chave}: ${JSON.stringify(r)}`);
    notas[chave] = r.id;
  }
  const sql = (texto: string, ...v: unknown[]) => cru(db, perfil, A.id, texto, ...v);

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    const c = await montarCenario(db, 'rel', sufixo);
    A = c.A;
    B = c.B;
    a = c.a;
    b = c.b;
    Object.assign(ids, c.ids);
    const leite = await cadastrarInsumo(a, { nome: 'Leite integral', tipo: 'INGREDIENTE', unidade: 'L', escala: 'base', conteudo: '1', preco: '5,00' });
    if (!leite.ok) throw new Error(JSON.stringify(leite));
    ids.leite = leite.id;
    const lat = await cadastrarFornecedor(a, { nome: 'Laticínios Rio', razaoSocial: 'Laticínios Rio Ltda', documento: '11.222.333/0001-81', email: 'v@lat.com.br', whatsapp: '(21) 99999-0000' }, 'Marina');
    const ze = await cadastrarFornecedor(a, { nome: 'Frios do Zé', ...SEM_NOTA_FISCAL }, 'Marina');
    if (!lat.ok || !ze.ok) throw new Error('fornecedores');
    ids.lat = lat.id;
    ids.ze = ze.id;
    const peca = `v:${ids.peca}`;
    const { vp, centro, lat: L, ze: Z, mucarela, bacon, guardanapo, leite: leiteId } = ids;
    await lanca('L1', vp, L, '100', '2026-09-29', '420,00', [[mucarela, peca, '5', '400,00']], '20,00');
    await lanca('Z1', vp, Z, '200', '2026-09-30', '220,00', [[mucarela, 'padrao', '3', '150,00'], [leiteId, 'granel', '12', '60,00']], '10,00');
    await lanca('L2', vp, L, '101', '2026-10-01', '276,00', [[mucarela, peca, '3', '276,00']]);
    await lanca('L3', centro, L, '102', '2026-10-05', '475,00', [[mucarela, peca, '5', '470,00']], '5,00');
    await lanca('C', vp, L, '103', '2026-10-10', '250,00', [[mucarela, peca, '3', '250,00']]);
    const cancelou = await cancelarNota(a, DONA(), notas.C, 'Preço errado', 'Marina');
    if (!cancelou.ok) throw new Error(JSON.stringify(cancelou));
    await lanca('L4', vp, L, '103', '2026-10-10', '240,00', [[mucarela, peca, '3', '240,00']]);
    await lanca('Z2', vp, Z, '201', '2026-10-12', '180,00', [[guardanapo, 'granel', '1000', '80,00'], [bacon, 'granel', '4', '100,00']]);
    await lanca('Z3', vp, Z, '202', '2026-10-14', '10,00', [[leiteId, 'granel', '5', '10,00']]);
    await lanca('Z4', vp, Z, '4570', '2026-10-15', '200,00', [[mucarela, 'padrao', '4', '200,00']], '', '1');
    // O que o lançamento comum não faz: a unidade que some, o valor zerado, os instantes e as emissões.
    await sql(`UPDATE "NotaEntradaItem" SET "unidadeSnapshot" = NULL WHERE "notaId" = $1 AND "insumoId" = $2`, notas.Z2, ids.bacon);
    await sql(`UPDATE "NotaEntradaItem" SET "valorTotalCentavos" = 0 WHERE "notaId" = $1`, notas.Z3);
    await sql(`UPDATE "NotaEntrada" SET "lancadaEm" = "entradaEm"::timestamp + interval '15 hours' WHERE "parceiroId" = $1`, A.id);
    await sql(`UPDATE "NotaEntrada" SET "lancadaEm" = '2026-10-01 02:30:00' WHERE id = $1`, notas.L2);
    await sql(`UPDATE "NotaEntrada" SET "lancadaEm" = '2026-10-11 02:59:59' WHERE id = $1`, notas.Z3);
    await sql(`UPDATE "NotaEntrada" SET "lancadaEm" = '2026-10-11 03:00:00' WHERE id = $1`, notas.Z2);
    await sql(`UPDATE "NotaEntrada" SET "emitidaEm" = '2026-09-30' WHERE id = $1`, notas.L2);
    await sql(`UPDATE "NotaEntrada" SET "emitidaEm" = '2026-10-04' WHERE id = $1`, notas.L3);
    await sql(`UPDATE "NotaEntrada" SET "emitidaEm" = '2026-10-15' WHERE id = $1`, notas.Z4);
    // Um parceiro B com compras próprias (nada dele pode aparecer em A).
    const lb = await b.loja.findFirst();
    const forB = await cadastrarFornecedor(b, { nome: 'Fornecedor B', ...SEM_NOTA_FISCAL }, 'Bia');
    const insB = await cadastrarInsumo(b, { nome: 'Muçarela', tipo: 'INGREDIENTE', unidade: 'KG', escala: 'base', conteudo: '1', preco: '10,00' });
    if (!lb || !forB.ok || !insB.ok) throw new Error('B');
    const rb = await lancarNota(b, alcanceDe('DONO', 'rede'), { lojaId: lb.id, fornecedorId: forB.id, numero: '1', serie: '', data: '2026-10-02', frete: '', total: '999,00', itens: [{ insumoId: insB.id, embalagem: 'padrao', quantidade: '3', valor: '999,00' }] }, 'Bia');
    if (!rb.ok) throw new Error('nota B');
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
  });

  const unidade = (t: { unidades: TotalPorUnidade[] }, u: string | null) => t.unidades.find((x) => x.unidade === u)!;

  // ------------------------------------------------------------------ totais

  it('outubro pela entrada: dinheiro soma, cada unidade tem a sua linha e o que não tem base é contado', async () => {
    const r = await relatorioDaTela(a, DONA(), filtros(), 'periodo');
    const t = r.totais!;
    expect(r.motivoVazio).toBeNull();
    expect(t).toMatchObject({ linhas: 7, notas: 6, valorCentavos: 136600, freteCentavos: 500, totalCentavos: 137100 });
    // kg: L2 + L3 + L4 + Z4. Quantidade em milésimos.
    expect(unidade(t, 'KG')).toMatchObject({ linhas: 4, quantidadeMilesimos: 26000, valorCentavos: 118600, freteCentavos: 500 });
    expect(unidade(t, 'UN')).toMatchObject({ linhas: 1, quantidadeMilesimos: 1_000_000, valorCentavos: 8000 });
    expect(unidade(t, 'L')).toMatchObject({ linhas: 1, quantidadeMilesimos: 5000, valorCentavos: 0 });
    // O bacon perdeu a unidade: entra no dinheiro, não entra em kg.
    expect(unidade(t, null)).toMatchObject({ linhas: 1, valorCentavos: 10000 });
    expect(t.unidades.map((u) => u.unidade)).toEqual(['KG', 'L', 'UN', null]);
    expect(t.semBase).toEqual({ unidade: 1, valor: 1 });
    expect(t.notasComDesconto).toBe(0);
  });

  it('preço médio é PONDERADO (valor ÷ quantidade), não a média dos preços; só das linhas comparáveis', async () => {
    const r = await relatorioDaTela(a, DONA(), filtros({ insumo: ids.mucarela }), 'periodo');
    const kg = unidade(r.totais!, 'KG');
    expect(kg).toMatchObject({ quantidadeMilesimos: 26000, valorCentavos: 118600, freteCentavos: 500 });
    expect(kg.comparavel).toMatchObject({ linhas: 4, quantidadeMilesimos: 26000, valorCentavos: 118600 });
    expect(sp(formatarCusto(precoMedioPonderado(kg), 'KG'))).toBe('R$ 45,62/kg'); // 118.600 ÷ 26 kg
    expect(sp(formatarCusto(custoMedioEntregue(kg), 'KG'))).toBe('R$ 45,81/kg'); // (118.600 + 500) ÷ 26 kg
    // A média simples dos quatro preços (46, 47, 40, 50) seria R$ 45,75: o relatório não a usa.
    expect(sp(formatarCusto(precoMedioPonderado(kg), 'KG'))).not.toBe('R$ 45,75/kg');
    expect(r.umInsumo).toBe(true);
  });

  it('dois fornecedores com embalagens diferentes: cada um com o seu preço ponderado, e os dois somam o total', async () => {
    const r = await relatorioDaTela(a, DONA(), filtros({ insumo: ids.mucarela }), 'insumo');
    const porNome = Object.fromEntries(r.fornecedores!.grupos.map((g) => [g.rotulo, g]));
    expect(Object.keys(porNome).sort()).toEqual(['Frios do Zé', 'Laticínios Rio']);
    expect(porNome['Laticínios Rio'].total).toMatchObject({ unidade: 'KG', quantidadeMilesimos: 22000, valorCentavos: 98600, freteCentavos: 500 });
    expect(sp(formatarCusto(precoMedioPonderado(porNome['Laticínios Rio'].total), 'KG'))).toBe('R$ 44,82/kg');
    expect(porNome['Frios do Zé'].total).toMatchObject({ quantidadeMilesimos: 4000, valorCentavos: 20000 });
    expect(sp(formatarCusto(precoMedioPonderado(porNome['Frios do Zé'].total), 'KG'))).toBe('R$ 50,00/kg');
    expect(r.fornecedores!.grupos.reduce((s, g) => s + g.total.valorCentavos, 0)).toBe(unidade(r.totais!, 'KG').valorCentavos);
    // As compras: embalagem original, quantidade convertida e o que foi gravado no lançamento.
    const peca = r.linhas!.linhas.find((l) => l.rotuloDaNota === '102')!;
    expect(peca).toMatchObject({ embalagem: 'Peça 2 kg · 2 kg', embalagensMilesimos: 5000, conteudoMilesimos: 2000, quantidadeMilesimos: 10000, valorCentavos: 47000, freteCentavos: 500, totalCentavos: 47500, fornecedor: 'Laticínios Rio', loja: 'Centro' });
    const solto = r.linhas!.linhas.find((l) => l.rotuloDaNota === '4570-1')!;
    expect(solto).toMatchObject({ quantidadeMilesimos: 4000, valorCentavos: 20000, unidade: 'KG', motivoSemBase: null });
    expect(r.linhas!.total).toBe(4);
  });

  it('sem base: unidade que sumiu e valor zero ficam FORA do preço médio, DENTRO da contagem, e a tela abre as linhas', async () => {
    const todas = await relatorioDaTela(a, DONA(), filtros({ ver: 'linhas' }), 'periodo');
    const sem = todas.linhas!.linhas.filter((l) => l.motivoSemBase);
    expect(sem.map((l) => [l.insumo, l.motivoSemBase]).sort()).toEqual([['Bacon', 'unidade'], ['Leite integral', 'valor']]);
    const so = await relatorioDaTela(a, DONA(), filtros({ ver: 'linhas', so: 'sembase' }), 'periodo');
    expect(so.linhas!.total).toBe(2);
    expect(so.abertas).toMatchObject({ linhas: 2, valorCentavos: 10000 });
    const leite = unidade(todas.totais!, 'L');
    expect(precoMedioPonderado(leite)).toBeNull(); // valor zero: "sem base", nunca R$ 0,00/L
    expect(leite.comparavel.linhas).toBe(0);
  });

  // ---------------------------------------------------------- soma = resumo

  it('soma das linhas = soma dos grupos = resumo, nas 3 bases × 3 agrupamentos × lançadas e canceladas', async () => {
    const bases: BaseDeData[] = ['entrada', 'emissao', 'lancamento'];
    for (const base of bases) {
      for (const agrupar of ['insumo', 'fornecedor', 'dia'] as const) {
        for (const situacao of ['lancadas', 'canceladas'] as const) {
          const f = filtros({ de: '2026-09-01', ate: '2026-10-31', base, agrupar, situacao });
          const c = await relatorioCompleto(a, DONA(), f, 100_000);
          const rotulo = `${base}/${agrupar}/${situacao}`;
          const t = c.totais!;
          const linhas = c.linhas!.linhas;
          expect(linhas.length, rotulo).toBe(t.linhas);
          expect(linhas.reduce((s, l) => s + l.valorCentavos, 0), `${rotulo} valor das linhas`).toBe(t.valorCentavos);
          expect(linhas.reduce((s, l) => s + l.freteCentavos, 0), `${rotulo} frete das linhas`).toBe(t.freteCentavos);
          expect(c.grupos!.grupos.reduce((s, g) => s + g.total.valorCentavos, 0), `${rotulo} valor dos grupos`).toBe(t.valorCentavos);
          expect(c.grupos!.grupos.reduce((s, g) => s + g.total.freteCentavos, 0), `${rotulo} frete dos grupos`).toBe(t.freteCentavos);
          expect(c.grupos!.grupos.reduce((s, g) => s + g.total.linhas, 0), `${rotulo} linhas dos grupos`).toBe(t.linhas);
          for (const u of t.unidades) {
            const q = linhas.filter((l) => l.unidade === u.unidade).reduce((s, l) => s + l.quantidadeMilesimos, 0);
            expect(q, `${rotulo} quantidade ${u.unidade}`).toBe(u.quantidadeMilesimos);
            expect(c.grupos!.grupos.filter((g) => g.total.unidade === u.unidade).reduce((s, g) => s + g.total.quantidadeMilesimos, 0), `${rotulo} qtd grupos ${u.unidade}`).toBe(u.quantidadeMilesimos);
          }
          expect(t.totalCentavos).toBe(t.valorCentavos + t.freteCentavos);
          expect(new Set(linhas.map((l) => l.notaId)).size, `${rotulo} notas`).toBe(t.notas);
        }
      }
    }
  });

  it('o preço de uma linha usa o que foi gravado: renomear insumo e mexer na embalagem do cadastro NÃO reescreve a compra antiga', async () => {
    const antes = await relatorioDaTela(a, DONA(), filtros({ ver: 'linhas' }), 'periodo');
    await sql(`UPDATE "Insumo" SET "nome" = 'Muçarela de búfala' WHERE id = $1`, ids.mucarela);
    await sql(`UPDATE "InsumoVariante" SET "conteudoMilesimos" = 3000, "nome" = 'Peça 3 kg' WHERE id = $1`, ids.peca);
    try {
      const depois = await relatorioDaTela(a, DONA(), filtros({ ver: 'linhas' }), 'periodo');
      expect(depois.totais).toEqual(antes.totais);
      expect(depois.linhas!.linhas).toEqual(antes.linhas!.linhas);
      expect(depois.linhas!.linhas.find((l) => l.rotuloDaNota === '102')).toMatchObject({ insumo: 'Muçarela', embalagem: 'Peça 2 kg · 2 kg', quantidadeMilesimos: 10000 });
      // O nome de hoje só é o rótulo do grupo; a linha continua com o que a nota guardou.
      const porInsumo = await relatorioDaTela(a, DONA(), filtros({ agrupar: 'insumo' }), 'periodo');
      expect(porInsumo.grupos!.grupos.some((g) => g.rotulo === 'Muçarela de búfala')).toBe(true);
    } finally {
      await sql(`UPDATE "Insumo" SET "nome" = 'Muçarela' WHERE id = $1`, ids.mucarela);
      await sql(`UPDATE "InsumoVariante" SET "conteudoMilesimos" = 2000, "nome" = 'Peça 2 kg' WHERE id = $1`, ids.peca);
    }
  });

  // ------------------------------------------------------ período e a data

  it('mês inteiro e virada de mês: setembro e outubro não se misturam, e 30/09 + 01/10 pegam as duas pontas', async () => {
    const set = await relatorioDaTela(a, DONA(), filtros({ de: '2026-09-01', ate: '2026-09-30' }), 'periodo');
    // L1: 40.000 + frete 2.000. Z1: 15.000 + 6.000 + frete 1.000 (714 + 286).
    expect(set.totais).toMatchObject({ notas: 2, linhas: 3, valorCentavos: 61000, freteCentavos: 3000 });
    expect(unidade(set.totais!, 'KG')).toMatchObject({ quantidadeMilesimos: 13000, valorCentavos: 55000, freteCentavos: 2714 });
    expect(unidade(set.totais!, 'L')).toMatchObject({ quantidadeMilesimos: 12000, valorCentavos: 6000, freteCentavos: 286 });
    const ponta = await relatorioDaTela(a, DONA(), filtros({ de: '2026-09-30', ate: '2026-10-01' }), 'periodo');
    expect(ponta.totais).toMatchObject({ notas: 2, valorCentavos: 15000 + 6000 + 27600 });
    const dia = await relatorioDaTela(a, DONA(), filtros({ de: '2026-10-01', ate: '2026-10-01' }), 'periodo');
    expect(dia.totais).toMatchObject({ notas: 1, valorCentavos: 27600 });
    const vazio = await relatorioDaTela(a, DONA(), filtros({ de: '2026-08-01', ate: '2026-08-31' }), 'periodo');
    expect(vazio.totais).toMatchObject({ linhas: 0, notas: 0, valorCentavos: 0, unidades: [] });
  });

  it('data usada: entrada, emissão e lançamento (no relógio do Rio) dão recortes diferentes e a MESMA base vale em totais, grupos e linhas', async () => {
    const notasDe = async (params: Record<string, string>) => {
      const c = await relatorioCompleto(a, DONA(), filtros(params), 100_000);
      return Array.from(new Set(c.linhas!.linhas.map((l) => l.rotuloDaNota))).sort();
    };
    // Entrada: a L2 (entrada 01/10) está em outubro.
    expect(await notasDe({ de: '2026-10-01', ate: '2026-10-01' })).toEqual(['101']);
    // Emissão: a L2 foi emitida em 30/09, a L3 em 04/10 e a Z4 em 15/10; as digitadas sem emissão ficam de fora.
    expect(await notasDe({ base: 'emissao', de: '2026-10-01', ate: '2026-10-31' })).toEqual(['102', '4570-1']);
    expect(await notasDe({ base: 'emissao', de: '2026-09-30', ate: '2026-09-30' })).toEqual(['101']);
    // Lançamento: a L2 foi lançada às 02:30 UTC de 01/10 = 23:30 de 30/09 no Rio.
    expect(await notasDe({ base: 'lancamento', de: '2026-09-30', ate: '2026-09-30' }).then((l) => l.includes('101'))).toBe(true);
    expect(await notasDe({ base: 'lancamento', de: '2026-10-01', ate: '2026-10-01' })).toEqual([]);
    // O limite do dia: 02:59:59 UTC de 11/10 ainda é 10/10 no Rio; 03:00:00 UTC já é 11/10.
    expect(await notasDe({ base: 'lancamento', de: '2026-10-10', ate: '2026-10-10' })).toEqual(['103', '202']);
    expect(await notasDe({ base: 'lancamento', de: '2026-10-11', ate: '2026-10-11' })).toEqual(['201']);
    // Agrupar por dia usa a mesma base: a L2 cai em 30/09 pelo lançamento e em 01/10 pela entrada.
    const diaPorLancamento = (await relatorioCompleto(a, DONA(), filtros({ base: 'lancamento', agrupar: 'dia', de: '2026-09-30', ate: '2026-09-30' }), 100)).grupos!.grupos.map((g) => g.chave);
    expect(new Set(diaPorLancamento)).toEqual(new Set(['2026-09-30']));
    const diaPorEntrada = (await relatorioCompleto(a, DONA(), filtros({ base: 'entrada', agrupar: 'dia', de: '2026-10-01', ate: '2026-10-01' }), 100)).grupos!.grupos.map((g) => g.chave);
    expect(new Set(diaPorEntrada)).toEqual(new Set(['2026-10-01']));
    // Quantas notas a base "emissão" deixa de fora no mesmo recorte (entrada em outubro, sem emissão): L4, Z2 e Z3.
    const r = await relatorioDaTela(a, DONA(), filtros({ base: 'emissao' }), 'periodo');
    expect(r.semEmissao).toBe(3);
    expect((await relatorioDaTela(a, DONA(), filtros({ base: 'entrada' }), 'periodo')).semEmissao).toBeNull();
  });

  // ------------------------------------------- cancelada, repetida, documento

  it('nota cancelada fica fora de todo total, aparece separada e rotulada; a nota repetida (cancelada e lançada de novo) conta uma vez', async () => {
    const lancadas = await relatorioDaTela(a, DONA(), filtros({ ver: 'linhas' }), 'periodo');
    expect(lancadas.linhas!.linhas.filter((l) => l.rotuloDaNota === '103')).toHaveLength(1);
    expect(lancadas.linhas!.linhas.find((l) => l.rotuloDaNota === '103')).toMatchObject({ valorCentavos: 24000, cancelada: false });
    expect(lancadas.canceladas).toMatchObject({ linhas: 1, notas: 1, valorCentavos: 25000 });
    const canc = await relatorioDaTela(a, DONA(), filtros({ ver: 'linhas', situacao: 'canceladas' }), 'periodo');
    expect(canc.linhas!.linhas).toHaveLength(1);
    expect(canc.linhas!.linhas[0]).toMatchObject({ rotuloDaNota: '103', valorCentavos: 25000, cancelada: true, motivoCancelamento: 'Preço errado' });
    expect(canc.totais).toMatchObject({ notas: 1, valorCentavos: 25000 });
    expect(canc.canceladas).toBeNull();
  });

  it('documento fiscal que só aguarda conferência NÃO é compra; o ligado à nota aparece como link da linha', async () => {
    const antes = await relatorioDaTela(a, DONA(), filtros({ ver: 'linhas' }), 'periodo');
    expect(antes.aguardando).toBe(0);
    const recebido = await receberXml(a, DONA(), bytes(xmlDe([], '4570')), 'Marina');
    const outro = await receberXml(a, DONA(), bytes(xmlDe([], '4590')), 'Marina');
    if (!recebido.ok || !outro.ok) throw new Error(JSON.stringify([recebido, outro]));
    const meio = await relatorioDaTela(a, DONA(), filtros({ ver: 'linhas' }), 'periodo');
    expect(meio.aguardando).toBe(2);
    expect(meio.totais).toEqual(antes.totais);
    expect(meio.linhas!.linhas).toEqual(antes.linhas!.linhas);
    expect(meio.linhas!.linhas.every((l) => l.documentoId === null)).toBe(true);
    const d = (await obterDocumento(a, DONA(), (recebido as unknown as { id: string }).id))!;
    const ligou = await ligarDocumento(a, DONA(), d.id, notas.Z4, d.versao, { confirmouDiferenca: true }, 'Marina');
    expect(ligou.ok).toBe(true);
    const depois = await relatorioDaTela(a, DONA(), filtros({ ver: 'linhas' }), 'periodo');
    expect(depois.aguardando).toBe(1);
    expect(depois.totais).toEqual(antes.totais);
    const z4 = depois.linhas!.linhas.find((l) => l.notaId === notas.Z4)!;
    expect(z4.documentoId).toBe(d.id);
    expect(depois.linhas!.linhas.filter((l) => l.documentoId).length).toBe(1);
  });

  // ------------------------------------------------------------- filtros

  it('filtros: loja, fornecedor, insumo, categoria e a busca do insumo SEM acento; agrupar por insumo, fornecedor e dia', async () => {
    const t = async (params: Record<string, string | string[]>) => (await relatorioDaTela(a, DONA(), filtros(params), 'periodo')).totais!;
    expect((await t({ loja: ids.centro })).valorCentavos).toBe(47000);
    expect((await t({ loja: [ids.centro, ids.vp] })).notas).toBe(6);
    expect((await t({ fornecedor: ids.ze })).notas).toBe(3);
    expect((await t({ insumo: ids.guardanapo })).valorCentavos).toBe(8000);
    // A busca do nome ignora acento e caixa ("mucarela" acha "Muçarela"); a marca também vale.
    expect((await t({ q: 'MUCARELA' })).valorCentavos).toBe(118600);
    expect((await t({ q: 'nada disso' })).linhas).toBe(0);
    // O insumo escolhido vence a busca.
    expect((await t({ insumo: ids.guardanapo, q: 'mucarela' })).valorCentavos).toBe(8000);
    // Categoria (a de hoje no cadastro do insumo).
    const catMucarela = (await a.insumo.findUnique({ where: { id: ids.mucarela }, select: { categoriaId: true } }))!.categoriaId!;
    expect((await t({ categoria: catMucarela })).valorCentavos).toBeGreaterThanOrEqual(118600);
    expect((await t({ categoria: 'categoriainexistente' })).linhas).toBe(0);
    // Agrupamentos.
    const g = async (agrupar: 'insumo' | 'fornecedor' | 'dia') => (await relatorioDaTela(a, DONA(), filtros({ agrupar }), 'periodo')).grupos!;
    expect((await g('fornecedor')).grupos.map((x) => [x.rotulo, x.total.valorCentavos]).sort()).toEqual(expect.arrayContaining([['Frios do Zé', 20000]]));
    expect((await g('insumo')).grupos.map((x) => x.rotulo)).toEqual(expect.arrayContaining(['Muçarela', 'Guardanapo', 'Bacon', 'Leite integral']));
    expect((await g('dia')).grupos[0].chave).toBe('2026-10-15'); // o dia mais novo primeiro
    // Abrir um grupo mostra só as linhas dele, e o total delas confere com o grupo.
    const aberto = await relatorioDaTela(a, DONA(), filtros({ ver: 'linhas', agrupar: 'fornecedor', grupo: ids.ze }), 'periodo');
    expect(aberto.abertas).toMatchObject({ linhas: 4, notas: 3 });
    expect(aberto.linhas!.linhas.every((l) => l.fornecedorId === ids.ze)).toBe(true);
    const porUnidade = await relatorioDaTela(a, DONA(), filtros({ ver: 'linhas', unidade: 'sem' }), 'periodo');
    expect(porUnidade.linhas!.linhas.map((l) => l.insumo)).toEqual(['Bacon']);
  });

  // --------------------------------------------------------- permissões

  it('gerente de uma loja só enxerga a loja dele; pedir outra nunca amplia; operador e outro parceiro não veem nada', async () => {
    const gerenteVp = alcanceDe('GERENTE', [ids.vp]);
    const todos = await relatorioDaTela(a, gerenteVp, filtros(), 'periodo');
    expect(todos.lojasUsadas.map((l) => l.nome)).toEqual(['Vila da Penha']);
    expect(todos.opcoes.lojas.map((l) => l.nome)).toEqual(['Vila da Penha']);
    expect(todos.totais!.valorCentavos).toBe(136600 - 47000); // sem a L3, que é do Centro
    const foraDoAcesso = await relatorioDaTela(a, gerenteVp, filtros({ loja: ids.centro }), 'periodo');
    expect(foraDoAcesso.motivoVazio).toBe('sem-loja');
    expect(foraDoAcesso.totais).toBeNull();
    const misturado = await relatorioDaTela(a, gerenteVp, filtros({ loja: [ids.centro, ids.vp] }), 'periodo');
    expect(misturado.totais!.valorCentavos).toBe(136600 - 47000);
    const exportado = await relatorioCompleto(a, gerenteVp, filtros({ loja: ids.centro }), 1000);
    expect(exportado.linhas).toBeNull();
    // Operador: o perfil não tem "ver compras".
    const operador = await relatorioDaTela(a, alcanceDe('OPERADOR', [ids.vp]), filtros(), 'periodo');
    expect(operador).toMatchObject({ motivoVazio: 'sem-permissao', totais: null, linhas: null, grupos: null });
    expect(operador.opcoes.lojas).toEqual([]);
    expect(operador.opcoes.insumos).toEqual([]);
    expect((await relatorioCompleto(a, alcanceDe('OPERADOR', [ids.vp]), filtros(), 1000)).motivoVazio).toBe('sem-permissao');
    // O parceiro B só tem a nota dele; o id de loja ou de insumo de A não abre nada em B.
    const deB = await relatorioDaTela(b, alcanceDe('DONO', 'rede'), filtros(), 'periodo');
    expect(deB.totais).toMatchObject({ notas: 1, valorCentavos: 99900 });
    const cruzado = await relatorioDaTela(b, alcanceDe('DONO', 'rede'), filtros({ loja: ids.vp, insumo: ids.mucarela }), 'periodo');
    expect(cruzado.totais).toBeNull();
    const cruzado2 = await relatorioDaTela(b, alcanceDe('DONO', 'rede'), filtros({ insumo: ids.mucarela }), 'periodo');
    expect(cruzado2.totais!.linhas).toBe(0);
    expect(deB.opcoes.insumos.map((i) => i.nome)).toEqual(['Muçarela']);
    expect(deB.opcoes.fornecedores.map((f) => f.nome)).toEqual(['Fornecedor B']);
  });

  it('período torto vira frase e relatório vazio, nunca erro', async () => {
    const r = await relatorioDaTela(a, DONA(), filtros({ de: '2026-10-31', ate: '2026-10-01' }), 'periodo');
    expect(r.motivoVazio).toBe('periodo');
    expect(r.totais).toBeNull();
  });

  // ------------------------------------------------- paginação e teto

  it('paginação no banco: página, última página e página fora da faixa; o teto avisa em vez de cortar calado', async () => {
    const f = (params: Record<string, string>) => filtros({ ver: 'linhas', por: '10', ...params });
    const todas = await relatorioDaTela(a, DONA(), f({}), 'periodo');
    expect(todas.linhas!.total).toBe(7);
    expect(todas.paginas).toBe(1);
    const recorte = (await resolverRecorte(a, DONA(), f({})) ).recorte!;
    const p1 = await linhasDoRecorte(a, recorte, { numero: 1, porPagina: 3 });
    const p2 = await linhasDoRecorte(a, recorte, { numero: 2, porPagina: 3 });
    const p3 = await linhasDoRecorte(a, recorte, { numero: 3, porPagina: 3 });
    const p4 = await linhasDoRecorte(a, recorte, { numero: 4, porPagina: 3 });
    expect([p1.linhas.length, p2.linhas.length, p3.linhas.length, p4.linhas.length]).toEqual([3, 3, 1, 0]);
    const ids3 = [...p1.linhas, ...p2.linhas, ...p3.linhas].map((l) => l.itemId);
    expect(new Set(ids3).size).toBe(7); // nenhuma linha repete nem some entre as páginas
    // Página pedida além da última cai na última.
    const longe = await relatorioDaTela(a, DONA(), filtros({ ver: 'linhas', por: '10', pagina: '99' }), 'periodo');
    expect(longe.pagina).toBe(1);
    expect(longe.linhas!.linhas).toHaveLength(7);
    const teto = await linhasDoRecorte(a, recorte, null, 3);
    expect(teto.linhas).toHaveLength(3);
    expect(teto.passouDoTeto).toBe(true);
    expect((await linhasDoRecorte(a, recorte, null, 7)).passouDoTeto).toBe(false);
    const grupos = await gruposDoRecorte(a, recorte, { numero: 2, porPagina: 2 });
    expect(grupos.grupos).toHaveLength(2);
    expect(grupos.total).toBeGreaterThan(2);
  });

  it('o recorte de uma consulta só: a fotografia é a mesma para o resumo e as linhas (transação repetível)', async () => {
    const r = await relatorioDaTela(a, DONA(), filtros({ ver: 'linhas' }), 'periodo');
    expect(r.linhas!.total).toBe(r.totais!.linhas);
    const recorte = (await resolverRecorte(a, DONA(), filtros())).recorte!;
    const t = await totaisDoRecorte(a, recorte);
    expect(t.totalCentavos).toBe(r.totais!.totalCentavos);
  });

  // ------------------------------------------------------------- planilha

  /** Lê o CSV como uma planilha leria: `;`, aspas dobradas, linhas por CRLF (sem quebra de linha dentro de célula). */
  function lerCsv(corpo: string): string[][] {
    return corpo.replace(/^\uFEFF/, '').split('\r\n').filter((l, i, a) => !(i === a.length - 1 && l === '')).map((linha) => {
      const cel: string[] = [];
      let atual = '';
      let aspas = false;
      for (let i = 0; i < linha.length; i++) {
        const c = linha[i];
        if (aspas) {
          if (c === '"' && linha[i + 1] === '"') { atual += '"'; i++; } else if (c === '"') aspas = false; else atual += c;
        } else if (c === '"') aspas = true;
        else if (c === ';') { cel.push(atual); atual = ''; } else atual += c;
      }
      cel.push(atual);
      return cel;
    });
  }
  const reais = (c: number) => `${Math.trunc(c / 100)},${String(c % 100).padStart(2, '0')}`;

  it('a planilha das compras é igual à tela: mesmas linhas, mesmos totais, mesma data e período, em reais com vírgula', async () => {
    const f = filtros({ ver: 'linhas' });
    const tela = await relatorioDaTela(a, DONA(), f, 'periodo');
    const r = await planilhaDoRelatorio(a, DONA(), f, { titulo: 'Compras do período', parte: 'linhas' });
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.nome).toBe('compras-2026-10-01_a_2026-10-31.csv');
    expect(r.corpo.startsWith('\uFEFF')).toBe(true);
    const linhas = lerCsv(r.corpo);
    const cab = linhas.findIndex((l) => l[0] === COLUNAS_DAS_LINHAS[0]);
    expect(cab).toBeGreaterThan(0);
    const dados = linhas.slice(cab + 1, linhas.findIndex((l, i) => i > cab && l.length === 1 && l[0] === ''));
    expect(dados).toHaveLength(tela.totais!.linhas);
    const col = (nome: string) => COLUNAS_DAS_LINHAS.indexOf(nome as (typeof COLUNAS_DAS_LINHAS)[number]);
    const soma = (nome: string) => dados.reduce((s, l) => s + Number(l[col(nome)].replace(',', '.')) * 100, 0);
    expect(Math.round(soma('Valor dos itens (R$)'))).toBe(tela.totais!.valorCentavos);
    expect(Math.round(soma('Frete atribuído (R$)'))).toBe(tela.totais!.freteCentavos);
    expect(Math.round(soma('Total (R$)'))).toBe(tela.totais!.totalCentavos);
    // O cabeçalho repete o que a tela diz: data usada e período, e o rodapé tem os mesmos totais.
    const topo = Object.fromEntries(linhas.slice(0, cab).filter((l) => l.length >= 2).map((l) => [l[0], l[1]]));
    expect(topo['Período e data usada']).toBe('Data da entrada da nota, de 01/10/2026 a 31/10/2026');
    expect(topo['Lojas']).toContain('Vila da Penha');
    const rodape = Object.fromEntries(linhas.filter((l) => l.length === 2).map((l) => [l[0], l[1]]));
    expect(rodape['Total (R$)']).toBe(reais(tela.totais!.totalCentavos));
    expect(rodape['Valor dos itens (R$)']).toBe(reais(tela.totais!.valorCentavos));
    expect(rodape['Quantidade em kg']).toBe('26');
    expect(rodape['Quantidade em sem unidade']).toMatch(/não se soma/);
    expect(rodape['Canceladas no mesmo recorte (FORA dos totais)']).toMatch(/^1 nota/);
    // A linha sem base não tem preço unitário e diz o porquê; a de preço tem 4 casas.
    const bacon = dados.find((l) => l[col('Insumo')] === 'Bacon')!;
    expect(bacon[col('Preço unitário (R$/un base)')]).toBe('');
    expect(bacon[col('Sem base para o preço médio porque')]).toMatch(/unidade não foi gravada/);
    const l3 = dados.find((l) => l[col('Nota')] === '102')!;
    expect(l3[col('Preço unitário (R$/un base)')]).toBe('47,0000');
    expect(l3[col('Quantidade convertida')]).toBe('10');
  });

  it('o resumo em planilha confere com os grupos da tela, e o preço médio vem da mesma conta', async () => {
    const f = filtros({ agrupar: 'insumo' });
    const tela = await relatorioDaTela(a, DONA(), f, 'periodo');
    const r = await planilhaDoRelatorio(a, DONA(), f, { titulo: 'Compras do período', parte: 'resumo' });
    if (!r.ok) throw new Error(JSON.stringify(r));
    const linhas = lerCsv(r.corpo);
    const cab = linhas.findIndex((l) => l[0] === 'Grupo');
    const grupos = linhas.slice(cab + 1, linhas.findIndex((l, i) => i > cab && l.length === 1 && l[0] === ''));
    expect(grupos).toHaveLength(tela.grupos!.grupos.length);
    const muc = grupos.find((l) => l[0] === 'Muçarela')!;
    expect(muc.slice(1, 8)).toEqual(['kg', '26', '4', '4', '1186,00', '5,00', '1191,00']);
    expect(muc[8]).toBe('45,6154'); // 118.600 ÷ 26.000 g: o ponderado, com 4 casas
    expect(muc[9]).toBe('45,8077');
  });

  it('planilha segura: nome com fórmula (insumo, fornecedor, embalagem) sai com apóstrofo e NENHUMA célula de texto abre como fórmula', async () => {
    await sql(`UPDATE "Insumo" SET "nome" = $2 WHERE id = $1`, ids.guardanapo, '=HYPERLINK("http://x.test";"clique")');
    await sql(`UPDATE "NotaEntradaItem" SET "insumoNomeSnapshot" = $2 WHERE "notaId" = $1 AND "insumoId" = $3`, notas.Z2, '=HYPERLINK("http://x.test";"clique")', ids.guardanapo);
    await sql(`UPDATE "NotaEntrada" SET "fornecedorNomeSnapshot" = $2 WHERE id = $1`, notas.Z3, '+cmd|\'/C calc\'!A0');
    await sql(`UPDATE "NotaEntradaItem" SET "embalagemSnapshot" = $2 WHERE "notaId" = $1 AND "insumoId" = $3`, notas.Z2, '@SOMA(1+1)', ids.bacon);
    await sql(`UPDATE "Fornecedor" SET "nome" = $2 WHERE id = $1`, ids.ze, '-2+3 Frios');
    try {
      for (const [parte, agrupar] of [['linhas', 'fornecedor'], ['resumo', 'fornecedor'], ['resumo', 'insumo']] as const) {
        const r = await planilhaDoRelatorio(a, DONA(), filtros({ agrupar }), { titulo: 'Compras do período', parte });
        if (!r.ok) throw new Error(JSON.stringify(r));
        const celulas = lerCsv(r.corpo).flat();
        const rotulo = `${parte}/${agrupar}`;
        expect(celulas.filter(abreComoFormula), `${rotulo}: células que abrem como fórmula`).toEqual([]);
        // O texto original continua legível atrás do apóstrofo; cada parte leva o que mostra.
        if (parte === 'linhas') {
          expect(celulas, rotulo).toContain(`'=HYPERLINK("http://x.test";"clique")`);
          expect(celulas, rotulo).toContain(`'@SOMA(1+1)`);
          expect(celulas.some((c) => c.startsWith("'+cmd|")), rotulo).toBe(true);
        } else if (agrupar === 'fornecedor') {
          // O resumo rotula o grupo pelo nome de hoje.
          expect(celulas, rotulo).toContain(`'-2+3 Frios`);
        } else {
          expect(celulas, rotulo).toContain(`'=HYPERLINK("http://x.test";"clique")`);
        }
      }
    } finally {
      await sql(`UPDATE "Insumo" SET "nome" = 'Guardanapo' WHERE id = $1`, ids.guardanapo);
      await sql(`UPDATE "NotaEntradaItem" SET "insumoNomeSnapshot" = 'Guardanapo' WHERE "notaId" = $1 AND "insumoId" = $2`, notas.Z2, ids.guardanapo);
      await sql(`UPDATE "NotaEntrada" SET "fornecedorNomeSnapshot" = 'Frios do Zé' WHERE id = $1`, notas.Z3);
      await sql(`UPDATE "NotaEntradaItem" SET "embalagemSnapshot" = 'A granel (kg)' WHERE "notaId" = $1 AND "insumoId" = $2`, notas.Z2, ids.bacon);
      await sql(`UPDATE "Fornecedor" SET "nome" = 'Frios do Zé' WHERE id = $1`, ids.ze);
    }
  });

  it('a rota de download: 401 sem sessão, 403 sem "ver compras" ou sem loja do acesso, 413 acima do teto; cabeçalhos seguros; nada de A para B', async () => {
    const url = (q: string) => new Request(`http://x/erp/compras/relatorios/periodo/exportar?${q}`);
    const q = 'de=2026-10-01&ate=2026-10-31&parte=linhas';
    const sem = await responderPlanilha(null, null, url(q));
    expect(sem.status).toBe(401);
    expect(await sem.text()).not.toMatch(/Muçarela|\d+,\d{2}/);
    const op = await responderPlanilha(a, alcanceDe('OPERADOR', [ids.vp]), url(q));
    expect(op.status).toBe(403);
    expect(await op.text()).not.toMatch(/Muçarela|Laticínios/);
    const gerente = alcanceDe('GERENTE', [ids.vp]);
    const fora = await responderPlanilha(a, gerente, url(`${q}&loja=${ids.centro}`));
    expect(fora.status).toBe(403);
    const ok = await responderPlanilha(a, gerente, url(q));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(ok.headers.get('Content-Disposition')).toMatch(/^attachment; filename="compras-.*\.csv"$/);
    expect(ok.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(ok.headers.get('Cache-Control')).toBe('no-store');
    const corpo = await ok.text();
    expect(corpo).not.toContain('Centro'); // a loja que ele não tem nem aparece
    expect(corpo).not.toContain('999,00'); // nota de B
    // B baixando com o id de loja de A: nada.
    const b403 = await responderPlanilha(b, alcanceDe('DONO', 'rede'), url(`${q}&loja=${ids.vp}`));
    expect(b403.status).toBe(403);
    const bProprio = await responderPlanilha(b, alcanceDe('DONO', 'rede'), url(q));
    const t = await bProprio.text();
    expect(t).toContain('Fornecedor B');
    expect(t).not.toMatch(/Laticínios|Frios do Zé|Penha/);
    // Período torto: 400 em frase.
    expect((await responderPlanilha(a, DONA(), url('de=2026-10-31&ate=2026-10-01'))).status).toBe(400);
  });
});
