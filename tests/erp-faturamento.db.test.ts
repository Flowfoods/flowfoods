/**
 * ERP 2.1 · faturamento por canal no Postgres de verdade (as regras, com banco):
 * - o gerente lança o dia da Vila da Penha (LOJA, DELIVERY com clientes em
 *   branco, iFood "Não vendeu"): 3 linhas, chaves determinísticas, histórico
 *   CRIOU na mesma transação, quem lançou;
 * - regravar igual não cria linha nem histórico; mudar o iFood grava ALTEROU só
 *   dele, com antes e depois; duas abas: a segunda recebe o conflito;
 * - corrida: 10 criações paralelas = 1 linha (N−1 conflitos se os números
 *   diferem; todas "igual" se são o mesmo número);
 * - loja fora do alcance, loja de outro parceiro e id forjado: nada lido nem gravado;
 * - CHECKs do banco por SQL cru; data futura e antiga; período FECHADO recusa
 *   lançar, corrigir, remover e importar (e a trava compartilhada espera o fechamento);
 * - remover exige motivo e deixa o antes; o dia volta a "sem lançamento";
 * - a planilha: prévia, importar, reimportar (zero gravação), "vai mudar", erros
 *   por linha, linha repetida, malícia; dia digitado e depois importado = a mesma linha;
 * - leitura única: a integração semeada vence a digitação e a digitada vira conferência;
 * - mês: faltas, zero não é falta, loja só delivery não acusa a LOJA, ticket derivado;
 * - sem `faturamento.ver` o histórico não traz nada de faturamento.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-faturamento.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { chaveDeIntegracao, chaveHumana, type CanalVenda } from '@/lib/erp/faturamento-campos';
import {
  faturamentoDoGrao,
  faturamentoDosGraos,
  importarPlanilha,
  lancarDia,
  lojasDoFaturamento,
  obterDia,
  obterMes,
  previaDaImportacao,
  removerLancamento,
  salvarCanaisDaLoja,
  type EntradaDoCanal,
} from '@/lib/erp/faturamento';
import { CABECALHO_DO_MODELO } from '@/lib/erp/faturamento-planilha';
import { travarParaFechar } from '@/lib/erp/periodo-trava';
import { listarHistorico } from '@/lib/erp/historico';
import { resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import { cru, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const HOJE = '2026-10-17';
const D = '2026-10-14';
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const nbsp = (t: string) => t.replace(/ /g, ' ');

describe.skipIf(!URL_TESTE)('ERP 2.1 · faturamento por canal (Postgres real)', { timeout: 180_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `f${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string };
  let B: { id: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const ids: Record<string, string> = {};

  const alcance = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR', lojaIds: string[] | 'rede', removidas: string[] = [], extras: string[] = []): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: extras, permissoesRemovidas: removidas, redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const DONA = () => alcance('DONO', 'rede');
  const GERENTE_VP = () => alcance('GERENTE', [ids.vp]);
  const GERENTE_DELIVERY = () => alcance('GERENTE', [ids.dlv]);
  const OPERADOR = () => alcance('OPERADOR', 'rede');

  const canal = (c: string, valor: string, pedidos: string, clientes = '', extra: Partial<EntradaDoCanal> = {}): EntradaDoCanal => ({ canal: c, valor, pedidos, clientes, naoVendeu: false, versao: '', ...extra });
  const lancar = (al: Alcance, lojaId: string, data: string, canais: EntradaDoCanal[], autor = 'Gil Gerente') => lancarDia(a, al, { lojaId, data, canais }, autor, HOJE);
  const linhas = (lojaId: string, data: string) => a.faturamentoLancamento.findMany({ where: { parceiroId: A.id, lojaId, data: dia(data) }, orderBy: { canal: 'asc' } });
  const historicoDoDia = (lojaId: string, data: string) => listarHistorico(a, { faturamentoDoDia: { lojaId, dia: data }, verFaturamento: true, verPrecos: false, limite: 50 });
  const contaHistorico = () => a.historicoAlteracao.count({ where: { parceiroId: A.id, entidade: 'FaturamentoLancamento' } });
  const versaoDe = async (lojaId: string, data: string, c: string) => (await linhas(lojaId, data)).find((l) => l.canal === c)!.atualizadoEm.toISOString();

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Fat A', slug: `fat-a-${sufixo}`, status: 'ATIVO' } });
    B = await db.parceiroFlow.create({ data: { nome: 'Fat B', slug: `fat-b-${sufixo}`, status: 'ATIVO' } });
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    for (const [chave, nome] of [['vp', 'Vila da Penha'], ['dlv', 'Penha Delivery'], ['outra', 'Outra Casa']] as const) {
      const r = await cadastrarLoja(a, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
    }
    const rb = await cadastrarLoja(b, { nome: 'Loja do B' }, 'Beto');
    if (!rb.ok) throw new Error(JSON.stringify(rb));
    ids.lojaB = rb.id;
    // A unidade 100 % delivery desliga a LOJA.
    const s = await salvarCanaisDaLoja(a, ids.dlv, ['DELIVERY_PROPRIO', 'IFOOD'], ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'], 'Marina');
    expect(s).toEqual({ ok: true, mudou: true });
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
  });

  // ------------------------------------------------------------ 1. lançar o dia
  it('critério 1: o gerente lança o dia — 3 linhas, chave por canal, histórico na mesma transação, quem lançou', async () => {
    const r = await lancar(GERENTE_VP(), ids.vp, D, [
      canal('LOJA', '4.350,00', '62', '140'),
      canal('DELIVERY_PROPRIO', '1.200,00', '30', ''),
      canal('IFOOD', '', '', '', { naoVendeu: true }),
    ]);
    expect(r).toEqual({ ok: true, canais: { LOJA: 'criado', DELIVERY_PROPRIO: 'criado', IFOOD: 'criado' } });
    const ls = await linhas(ids.vp, D);
    expect(ls).toHaveLength(3);
    const por = Object.fromEntries(ls.map((l) => [l.canal, l]));
    expect(por.LOJA).toMatchObject({ valorCentavos: 435000, pedidos: 62, clientes: 140, origem: 'MANUAL', chaveIdempotencia: chaveHumana(ids.vp, 'LOJA', D), atualizadoPorNome: 'Gil Gerente', marcaId: null });
    expect(por.DELIVERY_PROPRIO).toMatchObject({ valorCentavos: 120000, pedidos: 30, clientes: 30 }); // clientes em branco = pedidos
    expect(por.IFOOD).toMatchObject({ valorCentavos: 0, pedidos: 0, clientes: 0, chaveIdempotencia: `manual:${ids.vp}:-:IFOOD:${D}` });
    const h = await historicoDoDia(ids.vp, D);
    expect(h).toHaveLength(3);
    expect(new Set(h.map((x) => x.acao))).toEqual(new Set(['CRIOU']));
    expect(h.every((x) => x.autorNome === 'Gil Gerente')).toBe(true);
    expect(h[0].alvo).toMatch(/^Vila da Penha · .+ · 14\/10\/2026$/);
  });

  it('critério 2: regravar igual não cria linha nem histórico; mudar o iFood grava ALTEROU só dele, com antes e depois', async () => {
    const antes = await contaHistorico();
    const igual = await lancar(GERENTE_VP(), ids.vp, D, [
      canal('LOJA', '4350,00', '62', '140', { versao: await versaoDe(ids.vp, D, 'LOJA') }),
      canal('DELIVERY_PROPRIO', '1.200,00', '30', '30', { versao: await versaoDe(ids.vp, D, 'DELIVERY_PROPRIO') }),
      canal('IFOOD', '0', '0', '', { versao: await versaoDe(ids.vp, D, 'IFOOD') }),
    ]);
    expect(igual).toEqual({ ok: true, canais: { LOJA: 'igual', DELIVERY_PROPRIO: 'igual', IFOOD: 'igual' } });
    expect(await linhas(ids.vp, D)).toHaveLength(3);
    expect(await contaHistorico()).toBe(antes);
    // Duplo clique: a versão da tela já está velha, mas o número é o mesmo — nada a fazer, nada de conflito.
    expect(await lancar(GERENTE_VP(), ids.vp, D, [canal('LOJA', '4.350,00', '62', '140')])).toMatchObject({ ok: true, canais: { LOJA: 'igual' } });

    const mudou = await lancar(
      GERENTE_VP(),
      ids.vp,
      D,
      [canal('LOJA', '4.350,00', '62', '140', { versao: await versaoDe(ids.vp, D, 'LOJA') }), canal('IFOOD', '3.210,00', '41', '', { versao: await versaoDe(ids.vp, D, 'IFOOD') })],
      'Ana Caixa',
    );
    expect(mudou).toEqual({ ok: true, canais: { LOJA: 'igual', IFOOD: 'alterado' } });
    expect(await contaHistorico()).toBe(antes + 1);
    const ifood = (await historicoDoDia(ids.vp, D)).find((x) => x.acao === 'ALTEROU')!;
    expect(ifood.autorNome).toBe('Ana Caixa');
    const f = ifood.mudancas.find((m) => m.campo === 'faturamento')!;
    expect([nbsp(f.antes!), nbsp(f.depois)]).toEqual(['R$ 0,00', 'R$ 3.210,00']);
    expect(ifood.mudancas.find((m) => m.campo === 'pedidos')).toMatchObject({ antes: '0', depois: '41' });
    expect(ifood.alvo).toContain('iFood');
    expect((await linhas(ids.vp, D)).find((l) => l.canal === 'IFOOD')).toMatchObject({ valorCentavos: 321000, pedidos: 41, clientes: 41, atualizadoPorNome: 'Ana Caixa' });
  });

  it('critério 3a: duas abas — a segunda recebe a frase de conflito e nada é sobrescrito', async () => {
    const lida = await versaoDe(ids.vp, D, 'IFOOD');
    expect(await lancar(GERENTE_VP(), ids.vp, D, [canal('IFOOD', '3.120,00', '40', '', { versao: lida })], 'Ana Caixa')).toMatchObject({ ok: true, canais: { IFOOD: 'alterado' } });
    const segunda = await lancar(GERENTE_VP(), ids.vp, D, [canal('IFOOD', '9.999,00', '99', '', { versao: lida })], 'Gil Gerente');
    expect(segunda).toMatchObject({ ok: false, conflito: true });
    if (!segunda.ok) expect(nbsp(segunda.erros.geral!)).toBe('Ana Caixa lançou o iFood deste dia agora: R$ 3.120,00 · 40 pedidos. Recarregue a página para ver; nada foi gravado.');
    expect((await linhas(ids.vp, D)).find((l) => l.canal === 'IFOOD')!.valorCentavos).toBe(312000);
    // Tudo ou nada: o conflito de um canal não deixa o outro entrar.
    const tudo = await lancar(GERENTE_VP(), ids.vp, D, [canal('LOJA', '5.000,00', '70', '', { versao: await versaoDe(ids.vp, D, 'LOJA') }), canal('IFOOD', '1,00', '1', '', { versao: lida })]);
    expect(tudo).toMatchObject({ ok: false, conflito: true });
    expect((await linhas(ids.vp, D)).find((l) => l.canal === 'LOJA')!.valorCentavos).toBe(435000);
    // Criar um canal que alguém já criou (versão vazia, número diferente) também é conflito, com o nome de quem lançou.
    const criar = await lancar(GERENTE_VP(), ids.vp, D, [canal('LOJA', '1.111,00', '9', '')]);
    expect(criar).toMatchObject({ ok: false, conflito: true });
  });

  it('critério 3b: 10 criações paralelas do mesmo dia = 1 linha; números diferentes = 9 conflitos', async () => {
    const dia1 = '2026-10-10';
    const dif = await Promise.all(Array.from({ length: 10 }, (_, i) => lancar(GERENTE_VP(), ids.vp, dia1, [canal('LOJA', `${1000 + i},00`, `${10 + i}`)], `Pessoa ${i}`)));
    expect(dif.filter((r) => r.ok)).toHaveLength(1);
    expect(dif.filter((r) => !r.ok && r.conflito)).toHaveLength(9);
    expect(await linhas(ids.vp, dia1)).toHaveLength(1);
    expect(await a.historicoAlteracao.count({ where: { parceiroId: A.id, entidade: 'FaturamentoLancamento', depois: { path: ['faturamentoDia'], equals: dia1 } } })).toBe(1);

    const dia2 = '2026-10-09';
    const igual = await Promise.all(Array.from({ length: 10 }, () => lancar(GERENTE_VP(), ids.vp, dia2, [canal('LOJA', '2.000,00', '20')])));
    expect(igual.every((r) => r.ok)).toBe(true);
    expect(igual.filter((r) => r.ok && r.canais.LOJA === 'criado')).toHaveLength(1);
    expect(await linhas(ids.vp, dia2)).toHaveLength(1);
    expect(await a.historicoAlteracao.count({ where: { parceiroId: A.id, entidade: 'FaturamentoLancamento', depois: { path: ['faturamentoDia'], equals: dia2 } } })).toBe(1);
  });

  // ------------------------------------------------------------ alcance e isolamento
  it('critério 9: loja fora do alcance, id forjado e loja de outro parceiro — nada lido, nada gravado', async () => {
    const antes = await a.faturamentoLancamento.count({ where: { parceiroId: A.id } });
    // Gerente da loja de delivery tenta a Vila da Penha.
    expect(await lancar(GERENTE_DELIVERY(), ids.vp, '2026-10-13', [canal('IFOOD', '10,00', '1')])).toMatchObject({ ok: false, naoEncontrado: true });
    expect(await obterDia(a, GERENTE_DELIVERY(), ids.vp, D)).toBeNull();
    // Id de loja de OUTRO parceiro, com o alcance da dona de A (rede inteira): o portão não a acha.
    expect(await lancar(DONA(), ids.lojaB, '2026-10-13', [canal('IFOOD', '10,00', '1')])).toMatchObject({ ok: false, naoEncontrado: true });
    expect(await obterDia(a, DONA(), ids.lojaB, D)).toBeNull();
    // Id inexistente = a mesma resposta.
    expect(await lancar(DONA(), 'cl0jainexistente0000000000', '2026-10-13', [canal('IFOOD', '10,00', '1')])).toMatchObject({ ok: false, naoEncontrado: true });
    expect(await a.faturamentoLancamento.count({ where: { parceiroId: A.id } })).toBe(antes);
    // O operador não tem faturamento: nem ver, nem lançar.
    expect(await lancar(OPERADOR(), ids.vp, '2026-10-13', [canal('LOJA', '10,00', '1')])).toMatchObject({ ok: false });
    expect(await obterDia(a, OPERADOR(), ids.vp, D)).toBeNull();
    expect((await obterMes(a, OPERADOR(), { mes: '2026-10' }, HOJE)).lojas).toEqual([]);
    // Gerente de uma loja só vê a dela no mês e na soma.
    const mes = await obterMes(a, GERENTE_DELIVERY(), { mes: '2026-10' }, HOJE);
    expect(mes.lojas.map((l) => l.loja.id)).toEqual([ids.dlv]);
    expect(mes.total.valorCentavos).toBe(0);
    const rede = await obterMes(a, DONA(), { mes: '2026-10' }, HOJE);
    expect(rede.lojas.map((l) => l.loja.nome).sort()).toEqual(['Outra Casa', 'Penha Delivery', 'Vila da Penha']);
    expect(rede.total.valorCentavos).toBeGreaterThan(0);
    // O parceiro B não vê nada de A, nem o pedido direto ao portão.
    expect(await b.faturamentoLancamento.count()).toBe(0);
    expect(await faturamentoDosGraos(b, alcance('DONO', 'rede'), { de: '2026-10-01', ate: '2026-10-31' })).toEqual([]);
  });

  it('o banco recusa loja de outro parceiro mesmo por SQL cru (FK composta)', async () => {
    await expect(
      cru(db, perfil, A.id, `INSERT INTO "FaturamentoLancamento"(id,"parceiroId","lojaId",canal,data,"valorCentavos",pedidos,clientes,origem,"chaveIdempotencia","atualizadoEm")
        VALUES ('x_${sufixo}','${A.id}','${ids.lojaB}','LOJA','2026-10-01',100,1,1,'MANUAL','manual:x:-:LOJA:2026-10-01',now())`),
    ).rejects.toThrow();
  });

  it('critério 12: os CHECKs recusam por SQL cru', async () => {
    const insere = (id: string, valor: number, pedidos: number, origem: string, chave: string, ref: string | null, data = '2026-09-01') =>
      cru(
        db,
        perfil,
        A.id,
        `INSERT INTO "FaturamentoLancamento"(id,"parceiroId","lojaId",canal,data,"valorCentavos",pedidos,clientes,origem,"chaveIdempotencia","origemRef","atualizadoEm")
         VALUES ('${id}_${sufixo}','${A.id}','${ids.outra}','LOJA','${data}',${valor},${pedidos},${pedidos},'${origem}','${chave}',${ref ? `'${ref}'` : 'NULL'},now())`,
      );
    await expect(insere('t1', 100_000_001, 5, 'MANUAL', 'manual:t1', null)).rejects.toThrow(/valor_teto/);
    await expect(insere('t2', 500, 0, 'MANUAL', 'manual:t2', null)).rejects.toThrow(/valor_tem_pedido/);
    await expect(insere('t3', 500, 1, 'MANUAL', 'sem-prefixo', null)).rejects.toThrow(/chave_do_espaco/);
    await expect(insere('t4', 500, 1, 'IMPORTACAO', 'ifood:pedido:1', 'x')).rejects.toThrow(/chave_do_espaco/);
    await expect(insere('t5', 500, 1, 'INTEGRACAO', 'ifood:pedido:2', null)).rejects.toThrow(/integracao_tem_ref/);
    await expect(insere('t6', 500, 1, 'INTEGRACAO', 'manual:t6', 'r')).rejects.toThrow(/chave_do_espaco/);
    await expect(insere('t7', 500, 1, 'MANUAL', 'manual:t7', null, '2019-12-31')).rejects.toThrow(/data_minima/);
    await expect(insere('t8', 500, 100_001, 'MANUAL', 'manual:t8', null)).rejects.toThrow(/clientes_teto|pedidos_teto/);
    await expect(cru(db, perfil, A.id, `UPDATE "Loja" SET "canaisDeVenda" = '{}' WHERE id = '${ids.outra}'`)).rejects.toThrow(/canais_ao_menos_um/);
    expect(await a.faturamentoLancamento.count({ where: { parceiroId: A.id, lojaId: ids.outra } })).toBe(0);
  });

  // ------------------------------------------------------------ data, canal desligado, loja desativada
  it('critério 7: data futura, anterior a 3 anos e impossível não gravam nada', async () => {
    const antes = await a.faturamentoLancamento.count({ where: { parceiroId: A.id } });
    for (const data of ['2026-10-18', '2023-10-17', '2019-12-31', '31/02/2026', '']) {
      const r = await lancar(GERENTE_VP(), ids.vp, data, [canal('LOJA', '10,00', '1')]);
      expect(r, data).toMatchObject({ ok: false });
      if (!r.ok) expect(r.erros.data, data).toBeTruthy();
    }
    expect(await a.faturamentoLancamento.count({ where: { parceiroId: A.id } })).toBe(antes);
    // O ano passado vale (comparar com ele é a dor do Valentin's).
    expect(await lancar(GERENTE_VP(), ids.vp, '2025-10-17', [canal('LOJA', '10,00', '1')])).toMatchObject({ ok: true });
  });

  it('canal desligado e loja desativada não recebem lançamento novo; o que já foi lançado continua', async () => {
    const r = await lancar(GERENTE_DELIVERY(), ids.dlv, D, [canal('LOJA', '10,00', '1')]);
    expect(r).toMatchObject({ ok: false, porCanal: { LOJA: { geral: expect.stringContaining('não vende por Loja') } } });
    expect(await linhas(ids.dlv, D)).toHaveLength(0);
    expect(await lancar(GERENTE_DELIVERY(), ids.dlv, D, [canal('IFOOD', '500,00', '12')])).toMatchObject({ ok: true });
    await a.loja.update({ where: { id: ids.outra }, data: { ativa: false } });
    const off = await lancar(DONA(), ids.outra, D, [canal('LOJA', '10,00', '1')]);
    expect(off).toMatchObject({ ok: false });
    if (!off.ok) expect(off.erros.geral).toContain('desativada');
    await a.loja.update({ where: { id: ids.outra }, data: { ativa: true } });
    // Desligar um canal que já tem lançamento não apaga o lançamento.
    await salvarCanaisDaLoja(a, ids.dlv, ['DELIVERY_PROPRIO'], ['DELIVERY_PROPRIO', 'IFOOD'], 'Marina');
    expect(await linhas(ids.dlv, D)).toHaveLength(1);
    const dia = await obterDia(a, GERENTE_DELIVERY(), ids.dlv, D);
    expect(dia!.canais.map((c) => [c.canal, c.ativo])).toEqual([['DELIVERY_PROPRIO', true], ['IFOOD', false]]);
    await salvarCanaisDaLoja(a, ids.dlv, ['DELIVERY_PROPRIO', 'IFOOD'], ['DELIVERY_PROPRIO'], 'Marina');
  });

  it('canais da loja: pelo menos um, condicional ao que foi lido, antes e depois no histórico', async () => {
    expect(await salvarCanaisDaLoja(a, ids.dlv, [], ['DELIVERY_PROPRIO', 'IFOOD'], 'M')).toMatchObject({ ok: false });
    expect(await salvarCanaisDaLoja(a, ids.dlv, ['LOJA', 'rappi'], ['DELIVERY_PROPRIO', 'IFOOD'], 'M')).toMatchObject({ ok: false });
    expect(await salvarCanaisDaLoja(a, ids.dlv, ['DELIVERY_PROPRIO', 'IFOOD'], ['DELIVERY_PROPRIO', 'IFOOD'], 'M')).toEqual({ ok: true, mudou: false });
    expect(await salvarCanaisDaLoja(a, ids.dlv, ['IFOOD'], ['LOJA'], 'M')).toMatchObject({ ok: false, erro: expect.stringContaining('Recarregue') });
    const h = await listarHistorico(a, { de: [{ entidade: 'Loja', ids: [ids.dlv] }], verPrecos: false });
    const canaisMudados = h.flatMap((x) => x.mudancas.filter((c) => c.campo === 'canais de venda'));
    expect(canaisMudados).toContainEqual(expect.objectContaining({ antes: 'Loja · Delivery · iFood', depois: 'Delivery · iFood' }));
  });

  // ------------------------------------------------------------ remover
  it('remover exige motivo, deixa o antes no histórico e o dia volta a "sem lançamento"', async () => {
    const dRem = '2026-10-08';
    await lancar(GERENTE_VP(), ids.vp, dRem, [canal('LOJA', '777,00', '7')]);
    const v = await versaoDe(ids.vp, dRem, 'LOJA');
    const entrada = { lojaId: ids.vp, data: dRem, canal: 'LOJA', versao: v };
    expect(await removerLancamento(a, GERENTE_VP(), { ...entrada, motivo: '' }, 'Gil')).toMatchObject({ ok: false });
    expect(await removerLancamento(a, GERENTE_VP(), { ...entrada, motivo: 'ab' }, 'Gil')).toMatchObject({ ok: false });
    expect(await linhas(ids.vp, dRem)).toHaveLength(1);
    // Versão velha: conflito.
    expect(await removerLancamento(a, GERENTE_VP(), { ...entrada, versao: '2020-01-01T00:00:00.000Z', motivo: 'Dia errado' }, 'Gil')).toMatchObject({ ok: false, conflito: true });
    // Outro gerente não remove.
    expect(await removerLancamento(a, GERENTE_DELIVERY(), { ...entrada, motivo: 'Dia errado' }, 'Zé')).toMatchObject({ ok: false, naoEncontrado: true });
    expect(await removerLancamento(a, GERENTE_VP(), { ...entrada, motivo: '  Lancei na loja errada  ' }, 'Gil')).toMatchObject({ ok: true });
    expect(await linhas(ids.vp, dRem)).toHaveLength(0);
    const h = await historicoDoDia(ids.vp, dRem);
    const ex = h.find((x) => x.acao === 'EXCLUIU')!;
    expect(ex.motivo).toBe('Lancei na loja errada');
    // Na remoção o "antes" é o lançamento inteiro e o "depois" é nada.
    const fat = ex.mudancas.find((m) => m.campo === 'faturamento')!;
    expect([nbsp(fat.antes!), fat.depois]).toEqual(['R$ 777,00', '—']);
    expect(h.map((x) => x.acao).sort()).toEqual(['CRIOU', 'EXCLUIU']);
    const dia2 = await obterDia(a, GERENTE_VP(), ids.vp, dRem);
    expect(dia2!.canais.find((c) => c.canal === 'LOJA')!.humano).toBeNull();
    // Depois de removido, lançar de novo é criar.
    expect(await lancar(GERENTE_VP(), ids.vp, dRem, [canal('LOJA', '700,00', '7')])).toMatchObject({ ok: true, canais: { LOJA: 'criado' } });
  });

  // ------------------------------------------------------------ período fechado
  it('critério 10: período FECHADO recusa lançar, corrigir, remover e importar naquele intervalo', async () => {
    const p = await a.periodoApuracao.create({ data: { parceiroId: A.id, nome: 'Setembro de 2026', inicio: dia('2026-09-01'), fim: dia('2026-09-30'), status: 'FECHADO', fechadoEm: new Date() } });
    const nada = async (r: Promise<{ ok: boolean }>) => {
      const x = await r;
      expect(x.ok).toBe(false);
      return x as { ok: false; erros: { geral?: string } };
    };
    const d = '2026-09-15';
    const r1 = await nada(lancar(GERENTE_VP(), ids.vp, d, [canal('LOJA', '100,00', '2')]));
    expect(r1.erros.geral).toContain('Setembro de 2026 já foi fechado no DRE');
    expect(await linhas(ids.vp, d)).toHaveLength(0);
    // Linha que existia antes do fechamento: corrigir e remover também recusam.
    await a.faturamentoLancamento.create({ data: { parceiroId: A.id, lojaId: ids.vp, canal: 'LOJA', data: dia(d), valorCentavos: 5000, pedidos: 1, clientes: 1, origem: 'MANUAL', chaveIdempotencia: chaveHumana(ids.vp, 'LOJA', d) } });
    const v = await versaoDe(ids.vp, d, 'LOJA');
    expect((await nada(lancar(GERENTE_VP(), ids.vp, d, [canal('LOJA', '9,00', '1', '', { versao: v })]))).erros.geral).toContain('fechado');
    expect((await nada(removerLancamento(a, GERENTE_VP(), { lojaId: ids.vp, data: d, canal: 'LOJA', versao: v, motivo: 'Teste de fechado' }, 'Gil'))).erros.geral).toContain('fechado');
    expect(await linhas(ids.vp, d)).toHaveLength(1);
    expect((await linhas(ids.vp, d))[0].valorCentavos).toBe(5000);
    // Importar: a linha do período fechado é erro; a de fora entra.
    const csv = `${CABECALHO_DO_MODELO}\n15/09/2026;Vila da Penha;ifood;100,00;2;2\n16/10/2026;Vila da Penha;ifood;100,00;2;2`;
    const pre = await previaDaImportacao(a, DONA(), csv, HOJE);
    expect(pre.linhas.map((l) => l.situacao)).toEqual(['erro', 'nova']);
    expect(pre.linhas[0].erro).toContain('fechado');
    // Fora do período, tudo normal.
    expect(await lancar(GERENTE_VP(), ids.vp, '2026-10-01', [canal('LOJA', '100,00', '2')])).toMatchObject({ ok: true });
    await a.periodoApuracao.update({ where: { id: p.id }, data: { status: 'ABERTO', fechadoEm: null } });
    expect(await lancar(GERENTE_VP(), ids.vp, '2026-09-16', [canal('LOJA', '100,00', '2')])).toMatchObject({ ok: true });
  });

  it('a trava compartilhada: lançar espera o fechamento em curso e, depois dele, é recusado', async () => {
    const dCorrida = '2026-08-12';
    const caixa: { lancado?: Promise<unknown> } = {};
    let terminouAntes = false;
    await a.transacao(async (tx) => {
      await travarParaFechar(tx); // a 2.2, fechando: trava exclusiva
      caixa.lancado = lancar(GERENTE_VP(), ids.vp, dCorrida, [canal('LOJA', '100,00', '2')]).then((r) => {
        terminouAntes = true;
        return r;
      });
      await new Promise((r) => setTimeout(r, 700));
      expect(terminouAntes).toBe(false); // esperando a trava
      await tx.periodoApuracao.create({ data: { parceiroId: tx.parceiroId, nome: 'Agosto de 2026', inicio: dia('2026-08-01'), fim: dia('2026-08-31'), status: 'FECHADO', fechadoEm: new Date() } });
    });
    const r = (await caixa.lancado) as { ok: boolean; erros: { geral?: string } };
    expect(r.ok).toBe(false);
    expect(r.erros.geral).toContain('Agosto de 2026');
    expect(await linhas(ids.vp, dCorrida)).toHaveLength(0);
  });

  // ------------------------------------------------------------ planilha
  it('critérios 4 e 5: a planilha — prévia, importar, reimportar sem gravar, vai mudar, erros por linha', async () => {
    const csv1 = [
      CABECALHO_DO_MODELO,
      '01/10/2026;Vila da Penha;loja;"4.350,00";62;140',
      '01/10/2026;Vila da Penha;ifood;"3.210,00";41;',
      '02/10/2026;vila da PENHÁ;Delivery;"1.200,00";30;30',
      '03/10/2026;Vila da Penha;loja;0;0;0',
    ].join('\n');
    const pre = await previaDaImportacao(a, GERENTE_VP(), csv1, HOJE);
    expect(pre.contagem).toMatchObject({ nova: 3, muda: 1, igual: 0, erro: 0 }); // 01/10 LOJA já foi digitada à mão
    expect(await a.faturamentoLancamento.count({ where: { parceiroId: A.id, origem: 'IMPORTACAO' } })).toBe(0); // prévia não grava
    // 01/10 LOJA já estava digitada à mão (R$ 100,00): a planilha vira correção da MESMA linha, não soma.
    const imp = await importarPlanilha(a, GERENTE_VP(), csv1, pre.impressao, 'outubro.csv', 'Gil Gerente', HOJE);
    expect(imp).toEqual({ ok: true, criadas: 3, alteradas: 1, iguais: 0, comErro: 0 });
    const importadas = await a.faturamentoLancamento.findMany({ where: { parceiroId: A.id, origem: 'IMPORTACAO' }, orderBy: [{ data: 'asc' }, { canal: 'asc' }] });
    expect(importadas).toHaveLength(4);
    expect(importadas.find((l) => l.origemRef === 'outubro.csv#4')).toMatchObject({ atualizadoPorNome: 'Gil Gerente', origem: 'IMPORTACAO' });
    const ref = await a.faturamentoLancamento.findFirst({ where: { parceiroId: A.id, lojaId: ids.vp, canal: 'LOJA', data: dia('2026-10-01') } });
    expect(ref).toMatchObject({ valorCentavos: 435000, origem: 'IMPORTACAO', chaveIdempotencia: chaveHumana(ids.vp, 'LOJA', '2026-10-01') });
    const hImp = await a.historicoAlteracao.findMany({ where: { parceiroId: A.id, entidadeId: ref!.id } });
    expect(hImp.filter((h) => h.acao === 'ALTEROU').map((h) => h.motivo)).toEqual(['Importado por planilha']);
    expect(hImp.map((h) => h.acao).sort()).toEqual(['ALTEROU', 'CRIOU']);

    // Reimportar a mesma planilha: tudo "igual", zero gravação.
    const antesHist = await contaHistorico();
    const antesLinhas = await a.faturamentoLancamento.count({ where: { parceiroId: A.id } });
    const pre2 = await previaDaImportacao(a, GERENTE_VP(), csv1, HOJE);
    expect(pre2.contagem).toMatchObject({ nova: 0, muda: 0, igual: 4, erro: 0 });
    expect(await importarPlanilha(a, GERENTE_VP(), csv1, pre2.impressao, 'outubro.csv', 'Gil', HOJE)).toMatchObject({ ok: true, criadas: 0, alteradas: 0, iguais: 4 });
    expect(await contaHistorico()).toBe(antesHist);
    expect(await a.faturamentoLancamento.count({ where: { parceiroId: A.id } })).toBe(antesLinhas);

    // Uma linha alterada: "vai mudar" com antes → depois; as outras ficam iguais.
    const csv2 = csv1.replace('"3.210,00";41;', '"3.100,00";40;');
    const pre3 = await previaDaImportacao(a, GERENTE_VP(), csv2, HOJE);
    expect(pre3.contagem).toMatchObject({ nova: 0, muda: 1, igual: 3 });
    const muda = pre3.linhas.find((l) => l.situacao === 'muda')!;
    expect(muda).toMatchObject({ linha: 3, antes: { valorCentavos: 321000, pedidos: 41 }, depois: { valorCentavos: 310000, pedidos: 40 } });
    expect(await importarPlanilha(a, GERENTE_VP(), csv2, pre3.impressao, 'outubro-v2.csv', 'Gil', HOJE)).toMatchObject({ ok: true, alteradas: 1, criadas: 0, iguais: 3 });
    const alt = await a.faturamentoLancamento.findFirst({ where: { parceiroId: A.id, lojaId: ids.vp, canal: 'IFOOD', data: dia('2026-10-01') } });
    expect(alt).toMatchObject({ valorCentavos: 310000, pedidos: 40, origemRef: 'outubro-v2.csv#3' });
    const hAlt = (await historicoDoDia(ids.vp, '2026-10-01')).filter((h) => h.acao === 'ALTEROU' && h.alvo?.includes('iFood'));
    expect(hAlt).toHaveLength(1);
    expect(nbsp(hAlt[0].mudancas.find((m) => m.campo === 'faturamento')!.antes!)).toBe('R$ 3.210,00');
    // O "antes" leva a origem REAL (planilha corrigindo planilha): não aparece uma troca falsa de "Digitado" para "Planilha".
    expect(hAlt[0].mudancas.some((m) => m.campo === 'origem')).toBe(false);
    // Já a digitada que a planilha corrige mostra a troca verdadeira.
    const hLoja = (await historicoDoDia(ids.vp, '2026-10-01')).filter((h) => h.acao === 'ALTEROU' && h.alvo?.includes('Loja'));
    expect(hLoja[0].mudancas.find((m) => m.campo === 'origem')).toMatchObject({ antes: 'Digitado', depois: 'Planilha' });
  });

  it('critério 4b: linha repetida, loja fora do alcance, canal desligado, data futura, negativo e fórmula = erro na linha; as válidas entram', async () => {
    const csv = [
      CABECALHO_DO_MODELO,
      '05/10/2026;Vila da Penha;loja;100,00;2;2',
      '05/10/2026;Vila da Penha;loja;200,00;3;3',
      '05/10/2026;Penha Delivery;ifood;50,00;1;1',
      '06/10/2026;Penha Delivery;loja;50,00;1;1',
      '18/10/2026;Vila da Penha;loja;50,00;1;1',
      '06/10/2026;Vila da Penha;loja;-5,00;1;1',
      '06/10/2026;Vila da Penha;ifood;=1+1;1;1',
      '06/10/2026;Loja do B;ifood;50,00;1;1',
      '06/10/2026;Vila da Penha;delivery;800,00;20;20',
    ].join('\n');
    const pre = await previaDaImportacao(a, GERENTE_VP(), csv, HOJE);
    const erro = (n: number) => pre.linhas.find((l) => l.linha === n)!;
    expect(erro(2)).toMatchObject({ situacao: 'erro', erro: expect.stringContaining('linha 3') });
    expect(erro(3)).toMatchObject({ situacao: 'erro', erro: expect.stringContaining('linha 2') });
    // O gerente da Vila da Penha não lança na Penha Delivery: a frase é a mesma de loja que não existe.
    expect(erro(4).erro).toBe('Loja “Penha Delivery” não encontrada no seu acesso.');
    expect(erro(10 - 1)).toMatchObject({ situacao: 'erro', erro: 'Loja “Loja do B” não encontrada no seu acesso.' });
    expect(erro(6).erro).toContain('ainda não chegou');
    expect(erro(7).erro).toContain('negativo');
    expect(erro(8).erro).toContain('fórmula');
    expect(erro(10)).toMatchObject({ situacao: 'nova' });
    expect(pre.contagem).toMatchObject({ nova: 1, erro: 8 });
    const imp = await importarPlanilha(a, GERENTE_VP(), csv, pre.impressao, 'misto.csv', 'Gil', HOJE);
    expect(imp).toMatchObject({ ok: true, criadas: 1, comErro: 8 });
    expect(await linhas(ids.vp, '2026-10-05')).toHaveLength(0);
    expect(await linhas(ids.vp, '2026-10-06')).toHaveLength(1);
    // A dona, com a rede, lança na Penha Delivery pela planilha (canal ligado) e não no canal desligado.
    const dona = await previaDaImportacao(a, DONA(), csv, HOJE);
    expect(dona.linhas.find((l) => l.linha === 4)).toMatchObject({ situacao: 'nova', lojaId: ids.dlv });
    expect(dona.linhas.find((l) => l.linha === 5)!.erro).toContain('não vende por Loja');
  });

  it('se o mundo mudou entre a prévia e a confirmação, a importação recusa tudo', async () => {
    const csv = `${CABECALHO_DO_MODELO}\n20/09/2026;Vila da Penha;loja;100,00;2;2\n21/09/2026;Vila da Penha;loja;100,00;2;2`;
    const pre = await previaDaImportacao(a, GERENTE_VP(), csv, HOJE);
    expect(pre.contagem.nova).toBe(2);
    // Alguém lança um dos dias no meio.
    await lancar(GERENTE_VP(), ids.vp, '2026-09-21', [canal('LOJA', '55,00', '1')]);
    const r = await importarPlanilha(a, GERENTE_VP(), csv, pre.impressao, 'x.csv', 'Gil', HOJE);
    expect(r).toMatchObject({ ok: false, mudou: true });
    expect(await linhas(ids.vp, '2026-09-20')).toHaveLength(0);
    expect((await linhas(ids.vp, '2026-09-21'))[0].valorCentavos).toBe(5500);
    // Impressão forjada também não passa.
    expect(await importarPlanilha(a, GERENTE_VP(), csv, 'forjada', 'x.csv', 'Gil', HOJE)).toMatchObject({ ok: false, mudou: true });
  });

  it('o operador (sem faturamento.lancar) e parceiro suspenso não importam', async () => {
    const csv = `${CABECALHO_DO_MODELO}\n22/09/2026;Vila da Penha;loja;100,00;2;2`;
    const pre = await previaDaImportacao(a, OPERADOR(), csv, HOJE);
    expect(pre.linhas[0].situacao).toBe('erro');
    expect(pre.linhas[0].erro).toContain('não encontrada no seu acesso');
    const suspenso = doParceiro(A.id, db, { somenteLeitura: true });
    await expect(lancarDia(suspenso, DONA(), { lojaId: ids.vp, data: '2026-09-22', canais: [canal('LOJA', '10,00', '1')] }, 'X', HOJE)).rejects.toThrow(/somente leitura/);
    expect(await linhas(ids.vp, '2026-09-22')).toHaveLength(0);
  });

  // ------------------------------------------------------------ leitura única
  it('critério 6: a integração semeada no grão vence a digitação e a digitada vira conferência', async () => {
    const dI = '2026-10-12';
    await lancar(GERENTE_VP(), ids.vp, dI, [canal('IFOOD', '1.000,00', '20')]);
    // Duas linhas de integração (um pedido por linha), plantadas como a integração futura as gravaria.
    for (const [id, valor] of [['p1', 60000], ['p2', 45000]] as const) {
      await a.faturamentoLancamento.create({
        data: { parceiroId: A.id, lojaId: ids.vp, canal: 'IFOOD', data: dia(dI), valorCentavos: valor, pedidos: 1, clientes: 1, origem: 'INTEGRACAO', chaveIdempotencia: chaveDeIntegracao('ifood', 'pedido', id)!, origemRef: id },
      });
    }
    const g = (await faturamentoDoGrao(a, DONA(), ids.vp, 'IFOOD', dI))!;
    expect(g).toMatchObject({ fonte: 'INTEGRACAO', valorCentavos: 105000, pedidos: 2 });
    expect(g.conferencia).toEqual({ valorCentavos: 100000, pedidos: 20, clientes: 20, diferencaCentavos: 5000 });
    // Outro canal do mesmo dia, sem integração, segue valendo a digitada.
    await lancar(GERENTE_VP(), ids.vp, dI, [canal('LOJA', '300,00', '5')]);
    expect(await faturamentoDoGrao(a, DONA(), ids.vp, 'LOJA', dI)).toMatchObject({ fonte: 'HUMANO', valorCentavos: 30000 });
    // O mês soma 1.050 + 300, não 1.000 + 1.050 + 300.
    const mes = await obterMes(a, DONA(), { mes: '2026-10', lojaId: ids.vp }, HOJE);
    const dia12 = mes.lojas[0].dias.find((x) => x.data === dI)!;
    expect(dia12.total!.valorCentavos).toBe(135000);
    expect(dia12.canais.IFOOD!.fonte).toBe('INTEGRACAO');
    expect(mes.temIntegracao).toBe(true);
    // A tela do dia mostra a integração valendo e a digitada à parte.
    const tela = (await obterDia(a, GERENTE_VP(), ids.vp, dI))!.canais.find((c) => c.canal === 'IFOOD')!;
    expect(tela.valendo!.fonte).toBe('INTEGRACAO');
    expect(tela.humano!.valorCentavos).toBe(100000);
    // Gerente de outra loja não lê a integração da Vila da Penha.
    expect(await faturamentoDoGrao(a, GERENTE_DELIVERY(), ids.vp, 'IFOOD', dI)).toBeNull();
  });

  // ------------------------------------------------------------ mês, faltas, ticket
  it('critérios 7 e 8: faltas só de canal ativo após o 1º lançamento, zero não é falta, ticket é Σ valor ÷ Σ pedidos', async () => {
    const mes = await obterMes(a, DONA(), { mes: '2026-10' }, HOJE);
    const vp = mes.lojas.find((l) => l.loja.id === ids.vp)!;
    expect(vp.primeiraData).toBe('2025-10-17'); // o lançamento do ano passado
    const d14 = vp.dias.find((x) => x.data === D)!;
    // LOJA e DELIVERY lançados, iFood lançado ("Não vendeu" virou número depois): nenhuma falta.
    expect(d14.faltam).toEqual([]);
    const d03 = vp.dias.find((x) => x.data === '2026-10-03')!;
    expect(d03.canais.LOJA).toMatchObject({ valorCentavos: 0 }); // zero lançado
    expect(d03.faltam).toEqual(['DELIVERY_PROPRIO', 'IFOOD']); // zero na LOJA não é falta; os outros dois canais, sim
    expect(vp.dias.find((x) => x.data === HOJE)!).toMatchObject({ emAberto: true, faltam: [] });
    expect(vp.dias.find((x) => x.data === '2026-10-18')!).toMatchObject({ futuro: true, faltam: [] });
    // Loja só delivery nunca acusa a LOJA; sem lançamento na loja ainda, nada acusa.
    const dl = mes.lojas.find((l) => l.loja.id === ids.dlv)!;
    expect(dl.faltasPorCanal.LOJA).toBe(0);
    expect(dl.dias.find((x) => x.data === '2026-10-13')!.faltam).toEqual([]); // 1º lançamento em 14/10: antes ninguém cobra
    expect(dl.dias.find((x) => x.data === '2026-10-15')!.faltam).toEqual(['DELIVERY_PROPRIO', 'IFOOD']);
    const outra = mes.lojas.find((l) => l.loja.id === ids.outra)!;
    expect(outra.faltas).toBe(0);
    // Ticket médio = Σ valor ÷ Σ pedidos do recorte (não gravado: a tabela nem tem a coluna).
    const somaLoja = vp.porCanal.LOJA;
    expect(somaLoja.ticketMedioCentavos).toBe(Math.floor((2 * somaLoja.valorCentavos + somaLoja.pedidos) / (2 * somaLoja.pedidos)));
    expect(vp.porCanal.DELIVERY_PROPRIO.pedidos).toBeGreaterThan(0);
    expect(vp.total.valorCentavos).toBe(vp.porCanal.LOJA.valorCentavos + vp.porCanal.DELIVERY_PROPRIO.valorCentavos + vp.porCanal.IFOOD.valorCentavos);
    expect((await db.$queryRaw<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_name = 'FaturamentoLancamento' AND column_name ILIKE '%ticket%'`)).toEqual([]);
    // A rede soma as lojas do alcance.
    expect(mes.total.valorCentavos).toBe(mes.lojas.reduce((s, l) => s + l.total.valorCentavos, 0));
    expect(mes.faltas).toBe(mes.lojas.reduce((s, l) => s + l.faltas, 0));
    // Loja desativada não cobra falta.
    const lojas = await lojasDoFaturamento(a, DONA());
    expect(lojas.find((l) => l.id === ids.vp)!.canais).toEqual(['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'] as CanalVenda[]);
  });

  // ------------------------------------------------------------ vazamento
  it('critério 11: sem faturamento.ver o histórico não traz nada de faturamento; com, traz', async () => {
    const todo = await listarHistorico(a, { limite: 500, verPrecos: true });
    expect(todo.some((h) => h.entidade === 'FaturamentoLancamento')).toBe(false); // verFaturamento ausente = fechado
    expect((await listarHistorico(a, { limite: 500, verPrecos: true, verFaturamento: false })).some((h) => h.entidade === 'FaturamentoLancamento')).toBe(false);
    const so = await listarHistorico(a, { entidade: 'FaturamentoLancamento', limite: 500, verPrecos: true });
    expect(so).toEqual([]);
    const por = await listarHistorico(a, { de: [{ entidade: 'FaturamentoLancamento', ids: (await a.faturamentoLancamento.findMany({ where: { parceiroId: A.id }, select: { id: true } })).map((x) => x.id) }], verPrecos: true });
    expect(por).toEqual([]);
    const dia = await listarHistorico(a, { faturamentoDoDia: { lojaId: ids.vp, dia: D }, verPrecos: true });
    expect(dia).toEqual([]);
    const com = await listarHistorico(a, { limite: 500, verPrecos: true, verFaturamento: true });
    expect(com.some((h) => h.entidade === 'FaturamentoLancamento')).toBe(true);
    expect(JSON.stringify(todo)).not.toMatch(/faturamento|pedidos|R\$ 4\.350/i);
  });
});
