/**
 * ERP L.4 · consumo e conciliação de estoque no Postgres de verdade (`consumo-estoque.ts` + planilha).
 *
 * Os números esperados saem de conta feita à mão (NÃO do código testado), conferidos de novo por SQL independente sobre o livro.
 * O relógio é fixado (só o `Date`) para cada movimento cair no dia que a conta precisa; o fuso da operação é o do Rio (-03:00).
 *
 * Casa (Vila da Penha), outubro de 2026, em milésimos de kg:
 *   28/09 abertura: Cebola 20 kg, Leite 10 L, Cheddar 20 kg (Ovo, Alho, Pimenta e Sal contados em zero)
 *   02/10 nota 1: Cebola 50 kg R$ 300,00                         -> compra +50.000
 *   03/10 nota 2: Cebola 20 kg R$ 120,00, cancelada em 04/10      -> compra +20.000 e nota cancelada −20.000
 *   05/10 nota 3: Cebola 10 kg R$ 60,00, corrigida em 06/10 p/ 12 kg -> compra +10.000; estorno −10.000 e nova entrada +12.000 (corrigida +2.000)
 *   08/10 requisição #1 (Cozinha): Cebola 30 kg                   -> uso de setor −30.000
 *   09/10 lote 1 (Molho cheddar 5 kg): cheddar 2,5 kg, leite 2,5 L, cebola 885 g; concluído com 4,6 kg
 *   10/10 devolução de 5 kg da requisição #1                      -> estorno +30.000 e relança −25.000 (devolvido +5.000)
 *   11/10 lote 2 (Molho cheddar 2 kg): cheddar 1 kg, leite 1 L, cebola 354 g; concluído com 2 kg e estornado
 *   12/10 contagem do dia a dia: Cebola 55 kg (esperado 55,761) e Leite 7,5 L (esperado 7,5: bate, sem movimento)
 *   14/10 requisição de 10 ovos e de 3 kg de alho sem saldo (confirmada)   -> Ovo fica −10, Alho −3
 *   15/10 nota 4: Alho 10 kg                                       -> Alho volta a +7 ("ficou negativo")
 *   16/10 pimenta: ajuste +2 kg com motivo; 17/10 ajuste +1 kg SEM motivo (sem origem); 18/10 perda −0,5 kg
 *   31/10 23:30 (Rio) sal +1 kg; 01/11 00:30 (Rio) sal +4 kg (fora de outubro)
 *
 * Cebola em outubro: inicial 20.000 + compras 80.000 − estornos 18.000 (cancelada −20.000, corrigida +2.000) − uso 31.239 (setor 30.000,
 * lotes 885 + 354) + devolução 5.000 − falta na contagem 761 = final 55.000.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-consumo-estoque.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`REDIRECT ${url}`), { url });
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));

import { type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarFornecedor, cancelarNota, editarNota, lancarNota } from '@/lib/erp/compras';
import { cadastrarFicha } from '@/lib/erp/fichas';
import { concluirAbertura, contarItem, gravarMovimentos, iniciarAbertura, obterContagemDeAbertura } from '@/lib/erp/estoque';
import { concluirContagem, contarNaContagem, iniciarCiclo, obterContagem } from '@/lib/erp/contagem';
import { atenderRequisicao, criarRequisicao, devolverItem, obterRequisicao } from '@/lib/erp/requisicao';
import { concluirProducao, estornarProducao, listaDaProducao, obterOrdem, planejarProducao } from '@/lib/erp/producao';
import { receberXml } from '@/lib/erp/documentos-fiscais';
import { resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import { consumoCompleto, consumoDaTela, movimentosDaTela } from '@/lib/erp/consumo-estoque';
import { lerFiltrosDoConsumo, type FiltrosDoConsumo } from '@/lib/erp/consumo-estoque-campos';
import { cadastrarInsumoDeTeste as cadastrarInsumo, limparParceiros, perfilDoBanco, SEM_NOTA_FISCAL, type PerfilDoBanco } from './erp-db-apoio';
import { bytes, montarCenario, xmlDe } from './erp-documento-fiscal-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const AUTOR = { nome: 'Caio Cozinha', userId: 'u-caio' };

describe.skipIf(!URL_TESTE)('ERP L.4 · consumo e conciliação de estoque (Postgres real)', { timeout: 300_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `k${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string };
  let B: { id: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const ids: Record<string, string> = {};

  const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR' | null, lojaIds: string[] | 'rede', proprio: string[] | null = null): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: proprio, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const DONA = () => alcanceDe('DONO', 'rede');
  const GERENTE = () => alcanceDe('GERENTE', [ids.vp]);
  const GERENTE_CENTRO = () => alcanceDe('GERENTE', [ids.centro]);
  const OPERADOR = () => alcanceDe('OPERADOR', [ids.vp]);

  /** O relógio do teste, no horário do Rio ("2026-10-02T09:00:00"). */
  const em = (rio: string) => vi.setSystemTime(new Date(`${rio}-03:00`));
  const filtros = (params: Record<string, string | string[]> = {}): FiltrosDoConsumo => lerFiltrosDoConsumo({ de: '2026-10-01', ate: '2026-10-31', ...params }, '2026-11-20');
  const tela = (alcance: Alcance, params: Record<string, string | string[]> = {}, cliente = a) => consumoDaTela(cliente, alcance, filtros(params));
  const linha = async (insumo: string, params: Record<string, string | string[]> = {}, alcance: Alcance = DONA()) => {
    const t = await tela(alcance, { insumo: ids[insumo], ...params });
    const l = t.pagina?.linhas.find((x) => x.lojaId === (params.loja as string ?? ids.vp));
    if (!l) throw new Error(`sem linha de ${insumo}: ${JSON.stringify(t.motivoVazio)}`);
    return l;
  };
  const q = (l: { somas: Record<string, { q: number } | undefined> }, b: string) => l.somas[b]?.q ?? 0;
  const sql = async <T>(texto: string, ...v: unknown[]) => db.$queryRawUnsafe<T[]>(texto, ...v);

  let envio = 0;
  const novoEnvio = () => `envio-${sufixo}-${++envio}`.padEnd(12, 'x');

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
    em('2026-09-20T10:00:00');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    const c = await montarCenario(db, 'cons', sufixo);
    A = c.A;
    B = c.B;
    a = c.a;
    b = c.b;
    Object.assign(ids, c.ids);
    await a.regraDoPeriodo.create({ data: { parceiroId: A.id, vigenteDesde: new Date('2020-01-01T00:00:00Z'), tipo: 'MENSAL', diaInicio: 1, criadoPorNome: 'teste' } });
    for (const [chave, campos] of Object.entries({
      cebola: { nome: 'Cebola', unidade: 'KG', conteudo: '1', preco: '6,00', conservacao: 'SECO' },
      leite: { nome: 'Leite', unidade: 'L', conteudo: '1', preco: '5,00', conservacao: 'REFRIGERADO' },
      cheddar: { nome: 'Queijo cheddar', unidade: 'KG', conteudo: '1', preco: '40,00', conservacao: 'REFRIGERADO' },
      ovo: { nome: 'Ovo', unidade: 'UN', conteudo: '1', preco: '1,00' },
      alho: { nome: 'Alho', unidade: 'KG', conteudo: '1', preco: '25,00', conservacao: 'SECO' },
      pimenta: { nome: 'Pimenta', unidade: 'KG', conteudo: '1', preco: '50,00', conservacao: 'SECO' },
      sal: { nome: 'Sal', unidade: 'KG', conteudo: '1', preco: '2,00', conservacao: 'SECO' },
    })) {
      const r = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', ...campos });
      if (!r.ok) throw new Error(`${chave}: ${JSON.stringify(r)}`);
      ids[chave] = r.id;
    }
    const ze = await cadastrarFornecedor(a, { nome: 'Frios do Zé', ...SEM_NOTA_FISCAL }, 'Marina');
    if (!ze.ok) throw new Error('fornecedor');
    ids.ze = ze.id;
    const f = await cadastrarFicha(
      a,
      {
        nome: 'Molho cheddar',
        tipo: 'PRE_PREPARO',
        rendimento: '2',
        rendimentoUnidade: 'kg',
        itens: [
          { insumoId: ids.cheddar, quantidade: '1', unidade: 'kg' },
          { insumoId: ids.leite, quantidade: '1', unidade: 'L' },
          { insumoId: ids.cebola, quantidade: '300', unidade: 'g', fator: '1,18' },
        ],
        validade: { principal: 'REFRIGERADO', linhas: { REFRIGERADO: { marcada: true, quantidade: '3', em: 'dias' }, CONGELADO: { marcada: true, quantidade: '30', em: 'dias' } } },
      },
      { tipo: 'manter' },
      'Marina',
    );
    if (!f.ok) throw new Error(JSON.stringify(f));
    ids.molho = f.id;
    ids.insumoMolho = (await a.insumo.findFirst({ where: { nome: 'Molho cheddar' } }))!.id;

    // 28/09: abertura da Casa.
    const t0 = new Date('2026-09-28T10:00:00-03:00');
    em('2026-09-28T10:00:00');
    expect((await iniciarAbertura(a, DONA(), ids.vp, 'Marina', t0)).ok).toBe(true);
    const ab = (await obterContagemDeAbertura(a, DONA(), ids.vp))!;
    const abertura: Record<string, string> = { Cebola: '20', Leite: '10', 'Queijo cheddar': '20', Ovo: '0', Alho: '0', Pimenta: '0', Sal: '0' };
    for (const i of ab.itens) {
      if (abertura[i.nome] === undefined) continue;
      const r = await contarItem(a, DONA(), ids.vp, { itemId: i.id, embalagens: '', solto: abertura[i.nome], escala: 'base', versao: i.versao }, 'Marina', { agora: t0 });
      expect(r.ok).toBe(true);
    }
    const v = (await a.contagem.findFirst({ where: { lojaId: ids.vp, tipo: 'ABERTURA' }, select: { versao: true } }))!.versao;
    expect((await concluirAbertura(a, DONA(), ids.vp, { versao: v, confirmarNaoContados: true }, 'Marina', t0)).ok).toBe(true);

    const nota = async (chave: string, dia: string, numero: string, insumo: string, qtd: string, valor: string) => {
      em(`${dia}T09:00:00`);
      const r = await lancarNota(a, DONA(), { lojaId: ids.vp, fornecedorId: ids.ze, numero, serie: '', data: dia, frete: '', total: valor, itens: [{ insumoId: ids[insumo], embalagem: 'granel', quantidade: qtd, valor }] }, 'Marina');
      if (!r.ok) throw new Error(`${chave}: ${JSON.stringify(r)}`);
      ids[chave] = r.id;
    };
    await nota('n1', '2026-10-02', '1', 'cebola', '50', '300,00');
    await nota('n2', '2026-10-03', '2', 'cebola', '20', '120,00');
    em('2026-10-04T10:00:00');
    expect((await cancelarNota(a, DONA(), ids.n2, 'Lançada em dobro', 'Marina')).ok).toBe(true);
    await nota('n3', '2026-10-05', '3', 'cebola', '10', '60,00');
    em('2026-10-06T10:00:00');
    const n3 = (await a.notaEntrada.findUnique({ where: { id: ids.n3 }, select: { atualizadoEm: true } }))!;
    const ed = await editarNota(a, DONA(), ids.n3, { lojaId: ids.vp, fornecedorId: ids.ze, numero: '3', serie: '', data: '2026-10-05', frete: '', total: '72,00', itens: [{ insumoId: ids.cebola, embalagem: 'granel', quantidade: '12', valor: '72,00' }], versao: n3.atualizadoEm.toISOString() }, 'Marina');
    if (!ed.ok) throw new Error(`editar: ${JSON.stringify(ed)}`);

    // 08/10: requisição #1 da Cozinha, 30 kg de cebola.
    em('2026-10-08T10:00:00');
    const pedir = await criarRequisicao(a, GERENTE(), ids.vp, { setor: 'COZINHA', paraDia: 'hoje', observacao: '', linhas: [{ insumoId: ids.cebola, quantidade: '30', escala: 'base' }] }, 'Caio');
    if (!pedir.ok) throw new Error(JSON.stringify(pedir));
    ids.r1 = pedir.id;
    const entregarTudo = async (reqId: string, alcance = GERENTE()) => {
      const r = (await obterRequisicao(a, DONA(), ids.vp, reqId))!;
      const linhas = r.itens.map((i) => ({ itemId: i.id, quantidade: String(i.faltaMilesimos / 1000).replace('.', ','), escala: 'base' }));
      return atenderRequisicao(a, alcance, ids.vp, reqId, { versao: r.requisicao.versao, linhas, encerrar: false, confirmarNegativo: true }, 'Edu Estoque');
    };
    expect((await entregarTudo(ids.r1)).ok).toBe(true);

    // 09/10: lote 1 (5 kg de molho; sai 4,6 kg).
    const lote = async (dia: string, qtd: string, produzido: string, estornar: boolean) => {
      em(`${dia}T09:00:00`);
      const lista = await listaDaProducao(a, OPERADOR(), ids.vp, ids.molho, qtd);
      if (!lista.ok) throw new Error(JSON.stringify(lista));
      const p = await planejarProducao(a, OPERADOR(), ids.vp, { fichaId: ids.molho, quantidade: qtd, paraDia: 'hoje', observacao: '', linhas: lista.linhas, envio: novoEnvio() }, AUTOR);
      if (!p.ok) throw new Error(JSON.stringify(p));
      const l = (await obterOrdem(a, DONA(), ids.vp, p.id))!;
      expect((await entregarTudo(l.requisicao!.id)).ok).toBe(true);
      em(`${dia}T16:00:00`);
      const l2 = (await obterOrdem(a, DONA(), ids.vp, p.id))!;
      const c = await concluirProducao(a, OPERADOR(), ids.vp, p.id, { versao: l2.ordem.versao, produzido, escala: 'base', motivo: 'rendimento diferente', conservacao: '' }, AUTOR);
      if (!c.ok) throw new Error(`concluir: ${JSON.stringify(c)}`);
      if (estornar) {
        em(`${dia}T18:00:00`);
        const l3 = (await obterOrdem(a, DONA(), ids.vp, p.id))!;
        const e = await estornarProducao(a, GERENTE(), ids.vp, p.id, { versao: l3.ordem.versao, motivo: 'Lote contaminado', confirmarNegativo: false }, { nome: 'Gil Gerente', userId: 'u-gil' });
        if (!e.ok) throw new Error(`estornar: ${JSON.stringify(e)}`);
      }
      return p.id;
    };
    ids.lote1 = await lote('2026-10-09', '5', '4,6', false);

    // 10/10: voltaram 5 kg de cebola da requisição #1.
    em('2026-10-10T11:00:00');
    const r1 = (await obterRequisicao(a, DONA(), ids.vp, ids.r1))!;
    const dev = await devolverItem(a, GERENTE(), ids.vp, ids.r1, { versao: r1.requisicao.versao, itemId: r1.itens[0].id, quantidade: '5', escala: 'base', motivo: 'sobrou' }, 'Edu Estoque');
    if (!dev.ok) throw new Error(JSON.stringify(dev));

    // 11/10: lote 2 (2 kg), concluído e estornado.
    ids.lote2 = await lote('2026-10-11', '2', '2', true);

    // 12/10: contagem do dia a dia de cebola (55 kg, esperado 55,761) e leite (7,5 L, esperado 7,5).
    em('2026-10-12T15:00:00');
    const ciclo = await iniciarCiclo(a, GERENTE(), ids.vp, { insumoIds: [ids.cebola, ids.leite], titulo: 'Ciclo da semana' }, 'Gil Gerente');
    if (!ciclo.ok) throw new Error(JSON.stringify(ciclo));
    const cont = (await obterContagem(a, GERENTE(), ids.vp, ciclo.id))!;
    for (const i of cont.itens) {
      const numero = i.nome === 'Cebola' ? '55' : '7,5';
      const r = await contarNaContagem(a, OPERADOR(), ids.vp, ciclo.id, { itemId: i.id, embalagens: '', solto: numero, escala: 'base', versao: i.versao }, 'Caio');
      expect(r.ok).toBe(true);
    }
    const depois = (await a.contagem.findUnique({ where: { id: ciclo.id }, select: { status: true, versao: true } }))!;
    if (depois.status === 'ABERTA') {
      const fim = await concluirContagem(a, GERENTE(), ids.vp, ciclo.id, { versao: depois.versao, confirmarNaoContados: false }, 'Gil Gerente');
      if (!fim.ok) throw new Error(`concluir contagem: ${JSON.stringify(fim)}`);
    }

    // 14/10: ovo e alho saem sem saldo (confirmado); 15/10 entra a nota do alho.
    em('2026-10-14T10:00:00');
    for (const [insumo, qtd] of [['ovo', '10'], ['alho', '3']] as const) {
      const p = await criarRequisicao(a, GERENTE(), ids.vp, { setor: 'COZINHA', paraDia: 'hoje', observacao: '', linhas: [{ insumoId: ids[insumo], quantidade: qtd, escala: 'base' }] }, 'Caio');
      if (!p.ok) throw new Error(JSON.stringify(p));
      expect((await entregarTudo(p.id)).ok).toBe(true);
    }
    await nota('n4', '2026-10-15', '4', 'alho', '10', '50,00');

    // 16 a 18/10: pimenta (ajuste com motivo, ajuste sem motivo, perda) e o sal na virada do mês, direto no livro.
    const manual = (insumo: string, quantidadeMilesimos: number, valorCentavos: number, tipo: 'AJUSTE' | 'PERDA', motivo: string | null, quando: string, chave: string, nome: string) => {
      em(quando);
      return a.transacao((tx) =>
        gravarMovimentos(tx, [{ lojaId: ids.vp, insumoId: ids[insumo], tipo, quantidadeMilesimos, valorCentavos, insumoNome: nome, unidade: 'KG', motivo, chave }], { ocorridoEm: new Date(`${quando}-03:00`) }),
      );
    };
    await manual('pimenta', 2000, 10000, 'AJUSTE', 'Achei uma caixa no fundo', '2026-10-16T10:00:00', `k:${sufixo}:1`, 'Pimenta');
    await manual('pimenta', 1000, 5000, 'AJUSTE', null, '2026-10-17T10:00:00', `k:${sufixo}:2`, 'Pimenta');
    await manual('pimenta', -500, -2500, 'PERDA', 'Venceu', '2026-10-18T10:00:00', `k:${sufixo}:3`, 'Pimenta');
    await manual('sal', 1000, 200, 'AJUSTE', 'Entrou antes da meia-noite', '2026-10-31T23:30:00', `k:${sufixo}:4`, 'Sal');
    await manual('sal', 4000, 800, 'AJUSTE', 'Entrou depois da meia-noite', '2026-11-01T00:30:00', `k:${sufixo}:5`, 'Sal');

    // 22/10: uma nota fiscal recebida por XML que ainda aguarda conferência (fica FORA do livro).
    em('2026-10-22T10:00:00');
    const xml = await receberXml(a, DONA(), bytes(xmlDe([], '4570')), 'Marina');
    if (!xml.ok) throw new Error(JSON.stringify(xml));

    // O parceiro B tem estoque próprio (nada dele pode aparecer em A).
    em('2026-09-28T11:00:00');
    const insB = await cadastrarInsumo(b, { nome: 'Cebola', tipo: 'INGREDIENTE', unidade: 'KG', escala: 'base', conteudo: '1', preco: '6,00' });
    if (!insB.ok) throw new Error('insumo B');
    ids.insB = insB.id;
    const tB = new Date('2026-09-28T11:00:00-03:00');
    expect((await iniciarAbertura(b, DONA(), ids.lojaB, 'Bia', tB)).ok).toBe(true);
    const abB = (await obterContagemDeAbertura(b, DONA(), ids.lojaB))!;
    for (const i of abB.itens) await contarItem(b, DONA(), ids.lojaB, { itemId: i.id, embalagens: '', solto: '99', escala: 'base', versao: i.versao }, 'Bia', { agora: tB });
    const vB = (await b.contagem.findFirst({ where: { lojaId: ids.lojaB, tipo: 'ABERTURA' }, select: { versao: true } }))!.versao;
    expect((await concluirAbertura(b, DONA(), ids.lojaB, { versao: vB, confirmarNaoContados: true }, 'Bia', tB)).ok).toBe(true);
    em('2026-11-20T10:00:00');
  });

  afterAll(async () => {
    vi.useRealTimers();
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
  });

  it('o cenário nasceu como o cabeçalho conta (o livro tem os tipos e os estornos esperados)', async () => {
    const tipos = await sql<{ tipo: string; estorno: boolean; n: number }>(
      `SELECT "tipo"::text AS tipo, ("estornoDeId" IS NOT NULL) AS estorno, count(*)::int AS n FROM "MovimentoEstoque" WHERE "parceiroId" = $1 AND "insumoId" = $2 GROUP BY 1, 2 ORDER BY 1, 2`,
      A.id,
      ids.cebola,
    );
    expect(tipos.map((t) => `${t.tipo}${t.estorno ? '-estorno' : ''}:${t.n}`)).toEqual([
      'ABERTURA:1',
      'CONTAGEM:1',
      'ENTRADA_COMPRA:4',
      'ENTRADA_COMPRA-estorno:2',
      'REQUISICAO:4',
      'REQUISICAO-estorno:1',
    ]);
  });

  it('Cebola em outubro: inicial + compras − estornos − uso + devolução − falta na contagem = final (a conta à mão do cabeçalho)', async () => {
    const l = await linha('cebola');
    expect(l.inicial.q).toBe(20_000);
    expect(q(l, 'compra')).toBe(80_000);
    expect(q(l, 'nota_cancelada')).toBe(-20_000);
    expect(q(l, 'nota_corrigida')).toBe(2_000);
    expect(q(l, 'uso_setor')).toBe(-30_000);
    expect(q(l, 'uso_producao')).toBe(-1_239);
    expect(q(l, 'devolucao_setor')).toBe(5_000);
    expect(q(l, 'contagem_falta')).toBe(-761);
    expect(q(l, 'contagem_sobra')).toBe(0);
    expect(l.final.q).toBe(55_000);
    expect(l.confere).toBe(true);
    expect(l.diferencaMilesimos).toBe(0);
    // O saldo guardado (cópia de consulta) bate com o livro, e a contagem do período é dita.
    expect(l.saldoGuardado).toBe(55_000);
    expect(l.contadoNoPeriodo).toBe(true);
    expect(l.lacunas.map((x) => x.chave)).toEqual([]);
    // Compras e uso separados: a nota nunca é uso e a falta da contagem nunca é uso nem perda.
    expect(q(l, 'perda')).toBe(0);
    expect(l.somas.compra?.n).toBe(3);
  });
});
