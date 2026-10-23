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
 *   12/10 contagem do dia a dia: Cebola 55 kg (esperado 55,761) e Leite 6,5 L (esperado 6,5: bate, sem movimento)
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

import { PAPEL_DE_TENANT, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarFornecedor, cancelarNota, editarNota, lancarNota } from '@/lib/erp/compras';
import { cadastrarFicha } from '@/lib/erp/fichas';
import { concluirAbertura, contarItem, gravarMovimentos, iniciarAbertura, obterContagemDeAbertura } from '@/lib/erp/estoque';
import { concluirContagem, contarNaContagem, iniciarCiclo, obterContagem } from '@/lib/erp/contagem';
import { atenderRequisicao, criarRequisicao, devolverItem, obterRequisicao } from '@/lib/erp/requisicao';
import { concluirProducao, estornarProducao, listaDaProducao, obterOrdem, planejarProducao } from '@/lib/erp/producao';
import { receberXml } from '@/lib/erp/documentos-fiscais';
import { resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import { consumoCompleto, consumoDaTela, fonteDoConsumo, movimentosDaTela, resolverRecorteDoConsumo } from '@/lib/erp/consumo-estoque';
import { planilhaDoConsumo, responderPlanilhaDoConsumo } from '@/lib/erp/consumo-estoque-planilha';
import { RELATORIOS_SIMULTANEOS, VAGAS_DO_PROCESSO } from '@/lib/erp/vagas-de-relatorio';
import { LISTA_DE_BUCKETS, BUCKETS } from '@/lib/erp/consumo-estoque-campos';
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
  /** SQL cru de conferência, sempre do parceiro A; com dono não-superusuário e RLS forçada vai no contexto do parceiro. */
  const sql = async <T>(texto: string, ...v: unknown[]) => {
    if (perfil.superusuario || !perfil.rls) return db.$queryRawUnsafe<T[]>(texto, ...v);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.parceiro_id', ${A.id}, true), set_config('role', ${PAPEL_DE_TENANT}, true)`;
      return tx.$queryRawUnsafe<T[]>(texto, ...v);
    });
  };

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
      const numero = i.nome === 'Cebola' ? '55' : '6,5';
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

  it('o outro lado da conta, por SQL independente do motor: inicial, movimentos e final de todos os pares de outubro', async () => {
    const t = await tela(DONA());
    const linhas = t.pagina!.linhas;
    expect(linhas.map((l) => l.insumo).sort()).toEqual(['Alho', 'Cebola', 'Leite', 'Molho cheddar', 'Ovo', 'Pimenta', 'Queijo cheddar', 'Sal']);
    const direto = await sql<{ insumoId: string; antes: number; dentro: number; ate: number; total: number }>(
      `SELECT "insumoId",
         coalesce(sum("quantidadeMilesimos") FILTER (WHERE "ocorridoEm" < '2026-10-01T03:00:00Z'), 0)::int AS antes,
         coalesce(sum("quantidadeMilesimos") FILTER (WHERE "ocorridoEm" >= '2026-10-01T03:00:00Z' AND "ocorridoEm" < '2026-11-01T03:00:00Z'), 0)::int AS dentro,
         coalesce(sum("quantidadeMilesimos") FILTER (WHERE "ocorridoEm" < '2026-11-01T03:00:00Z'), 0)::int AS ate,
         coalesce(sum("quantidadeMilesimos"), 0)::int AS total
       FROM "MovimentoEstoque" WHERE "parceiroId" = $1 AND "lojaId" = $2 GROUP BY "insumoId"`,
      A.id,
      ids.vp,
    );
    for (const d of direto.filter((x) => linhas.some((l) => l.insumoId === x.insumoId))) {
      const l = linhas.find((x) => x.insumoId === d.insumoId)!;
      const somaDosBaldes = Object.values(l.somas).reduce((s, x) => s + (x?.q ?? 0), 0);
      expect([l.insumo, l.inicial.q, somaDosBaldes, l.final.q]).toEqual([l.insumo, d.antes, d.dentro, d.ate]);
      expect(l.inicial.q + somaDosBaldes).toBe(l.final.q);
      expect(l.confere).toBe(true);
    }
    // Até o fim de novembro o final de cada par é o saldo guardado.
    const novembro = await tela(DONA(), { de: '2026-11-01', ate: '2026-11-30' });
    for (const l of novembro.pagina!.linhas) expect(l.final.q).toBe(l.saldoGuardado);
  });

  it('Leite contado e igual ao livro (sem movimento de contagem) conta como contado; Queijo cheddar sem contagem no período é dito com a última data', async () => {
    const leite = await linha('leite');
    expect([leite.inicial.q, q(leite, 'uso_producao'), leite.final.q]).toEqual([10_000, -3_500, 6_500]);
    expect(q(leite, 'contagem_falta') + q(leite, 'contagem_sobra')).toBe(0);
    expect(leite.contadoNoPeriodo).toBe(true);
    expect(leite.lacunas).toEqual([]);
    const cheddar = await linha('cheddar');
    expect([cheddar.inicial.q, q(cheddar, 'uso_producao'), cheddar.final.q]).toEqual([20_000, -3_500, 16_500]);
    expect(cheddar.contadoNoPeriodo).toBe(false);
    expect(cheddar.ultimaContagemEm).toBe('2026-09-28');
    expect(cheddar.lacunas.map((x) => [x.chave, x.dura])).toEqual([['sem-contagem', false]]);
    expect(cheddar.lacunas[0].texto).toMatch(/A última contagem foi em 28\/09\/2026/);
  });

  it('o lote entra como produção (não é compra), o lote estornado sai em coluna própria e o insumo produzido não tem contagem', async () => {
    const molho = await linha('insumoMolho');
    expect([molho.inicial.q, q(molho, 'producao'), q(molho, 'lote_estornado'), molho.final.q]).toEqual([0, 6_600, -2_000, 4_600]);
    expect(q(molho, 'compra')).toBe(0);
    expect(molho.lacunas.map((x) => x.chave)).toEqual(['sem-contagem']);
    expect(molho.ultimaContagemEm).toBeNull();
  });

  it('saldo negativo no fim (Ovo), negativo no meio (Alho), sem origem e perda (Pimenta)', async () => {
    const ovo = await linha('ovo');
    expect([ovo.unidade, ovo.inicial.q, q(ovo, 'uso_setor'), ovo.final.q]).toEqual(['UN', 0, -10_000, -10_000]);
    expect(ovo.lacunas.map((x) => x.chave)).toEqual(['negativo-final', 'sem-contagem']);
    expect(ovo.lacunas[0].texto).toMatch(/termina o período com −10\u00A0un/);
    const alho = await linha('alho');
    expect([q(alho, 'uso_setor'), q(alho, 'compra'), alho.final.q, alho.minSaldo]).toEqual([-3_000, 10_000, 7_000, -3_000]);
    // Baixa de 3 kg valorada pelo custo do dia (R$ 25,00/kg = −R$ 75,00) e nota de 10 kg a R$ 50,00: sobram 7 kg com R$ −25,00. A tela explica.
    expect([alho.somas.uso_setor?.v, alho.somas.compra?.v, alho.final.v]).toEqual([-7_500, 5_000, -2_500]);
    expect(alho.lacunas.map((x) => x.chave)).toEqual(['negativo-no-meio', 'sem-contagem', 'valor-negativo']);
    expect(alho.lacunas[2]).toMatchObject({ rotulo: 'R$ negativo', dura: false });
    expect(alho.lacunas[2].texto).toMatch(/saldo tem 7\u00A0kg, mas o R\$ dele está negativo/);
    const pimenta = await linha('pimenta');
    expect([q(pimenta, 'ajuste'), q(pimenta, 'perda'), pimenta.final.q, pimenta.semOrigem]).toEqual([3_000, -500, 2_500, 1]);
    expect(pimenta.lacunas.map((x) => x.chave)).toEqual(['sem-origem', 'sem-contagem']);
    expect(pimenta.lacunas[0].dura).toBe(true);
    // A perda com motivo tem origem (o motivo escrito); o ajuste sem motivo não.
    expect(pimenta.somas.perda?.n).toBe(1);
  });

  it('o dia é o do Rio: 23:30 de 31/10 entra em outubro; 00:30 de 01/11 só em novembro', async () => {
    const out = await linha('sal');
    expect([out.inicial.q, q(out, 'ajuste'), out.final.q]).toEqual([0, 1_000, 1_000]);
    const nov = await tela(DONA(), { insumo: ids.sal, de: '2026-11-01', ate: '2026-11-30' });
    const l = nov.pagina!.linhas[0];
    expect([l.inicial.q, q(l, 'ajuste'), l.final.q]).toEqual([1_000, 4_000, 5_000]);
  });

  it('o resumo é o do recorte inteiro, por unidade (kg, L e un nunca se somam) e a ponte fecha em cada uma', async () => {
    const t = await tela(DONA(), { por: '10' });
    const r = t.resumo!;
    expect(r.linhas).toBe(8);
    expect(r.unidades.map((u) => [u.unidade, u.linhas, u.inicial.q, u.final.q, u.diferencaMilesimos])).toEqual([
      ['KG', 6, 40_000, 86_600, 0],
      ['L', 1, 10_000, 6_500, 0],
      ['UN', 1, 0, -10_000, 0],
    ]);
    const kg = r.unidades[0];
    const totalDosBaldes = Object.values(kg.somas).reduce((s, x) => s + (x?.q ?? 0), 0);
    expect(kg.inicial.q + totalDosBaldes).toBe(kg.final.q);
    expect(r.comLacunaDura).toBe(3);
    expect(r.semContagem).toBe(6);
    expect(r.movimentosSemOrigem).toBe(1);
    // A página não corta o resumo: com 3 por página o resumo continua o mesmo.
    const pequena = await tela(DONA(), { por: '10' });
    expect(pequena.resumo).toEqual(r);
  });

  it('os filtros: nome sem acento, só o que pede atenção, só sem contagem e loja fora do acesso', async () => {
    const nome = await tela(DONA(), { q: 'CEBOLA' });
    expect(nome.pagina!.linhas.map((l) => l.insumo)).toEqual(['Cebola']);
    const atencao = await tela(DONA(), { so: 'atencao' });
    expect(atencao.pagina!.linhas.map((l) => l.insumo)).toEqual(['Alho', 'Ovo', 'Pimenta']);
    expect(atencao.resumo!.linhas).toBe(3);
    const semContagem = await tela(DONA(), { so: 'semcontagem' });
    expect(semContagem.pagina!.linhas.map((l) => l.insumo)).toEqual(['Alho', 'Molho cheddar', 'Ovo', 'Pimenta', 'Queijo cheddar', 'Sal']);
    const centro = await tela(DONA(), { loja: ids.centro });
    expect(centro.pagina!.linhas).toHaveLength(0);
    expect(centro.lojasSemEstoque).toEqual(['Centro']);
    // O período torto vira frase; o longo demais também.
    expect((await tela(DONA(), { de: '2026-10-31', ate: '2026-10-01' })).motivoVazio).toBe('periodo');
    expect((await tela(DONA(), { de: '2024-01-01', ate: '2026-10-01' })).motivoVazio).toBe('periodo');
  });

  it('a nota fiscal que só aguarda conferência fica fora do livro e é avisada', async () => {
    const t = await tela(DONA());
    expect(t.aguardando).toBe(1);
    expect(await a.documentoFiscal.count({ where: { situacao: 'AGUARDANDO_CONFERENCIA' } })).toBe(1);
    // Nenhum movimento tem documento fiscal como origem: as compras do livro são só as notas lançadas.
    expect(await a.movimentoEstoque.count({ where: { tipo: 'ENTRADA_COMPRA', estornoDeId: null } })).toBe(5);
  });

  it('o relatório só lê: tela, planilha, impressão e movimentos não gravam nem dão baixa (conta de linhas antes e depois)', async () => {
    const contar = async () =>
      (
        await sql<Record<string, number>>(
          `SELECT
             (SELECT count(*) FROM "MovimentoEstoque" WHERE "parceiroId" = $1)::int AS mov,
             (SELECT coalesce(sum("versao"), 0) FROM "SaldoEstoque" WHERE "parceiroId" = $1)::int AS saldos,
             (SELECT coalesce(sum("quantidadeMilesimos"), 0) FROM "SaldoEstoque" WHERE "parceiroId" = $1)::int AS saldoq,
             (SELECT count(*) FROM "Requisicao" WHERE "parceiroId" = $1)::int AS req,
             (SELECT coalesce(sum("atendidoMilesimos"), 0) FROM "RequisicaoItem" WHERE "parceiroId" = $1)::int AS atendido,
             (SELECT count(*) FROM "NotaEntrada" WHERE "parceiroId" = $1)::int AS notas,
             (SELECT count(*) FROM "HistoricoAlteracao" WHERE "parceiroId" = $1)::int AS hist,
             (SELECT count(*) FROM "Contagem" WHERE "parceiroId" = $1)::int AS cont,
             (SELECT count(*) FROM "OrdemProducao" WHERE "parceiroId" = $1)::int AS ordens`,
          A.id,
        )
      )[0];
    const antes = await contar();
    await tela(DONA());
    await consumoCompleto(a, DONA(), filtros(), 50_000);
    await movimentosDaTela(a, DONA(), filtros({ col: 'uso', insumo: ids.cebola }));
    await movimentosDaTela(a, DONA(), filtros({ col: 'final' }));
    expect(await contar()).toEqual(antes);
  });

  it('os movimentos de cada número: o que forma o inicial, as compras, os estornos, as devoluções, o uso e o final', async () => {
    const mov = (col: string, params: Record<string, string> = {}) => movimentosDaTela(a, DONA(), filtros({ col, insumo: ids.cebola, ...params }));
    const compras = (await mov('compras')).lista!;
    expect([compras.total, compras.somaMilesimos]).toEqual([3, 80_000]);
    expect(compras.movimentos.every((m) => m.bucket === 'compra' && m.notaId !== null && !m.estorno)).toBe(true);
    // Do mais novo para o mais velho.
    expect(compras.movimentos.map((m) => m.quantidadeMilesimos)).toEqual([10_000, 20_000, 50_000]);
    const estornos = (await mov('estornos')).lista!;
    expect([estornos.total, estornos.somaMilesimos]).toEqual([3, -18_000]);
    expect(estornos.movimentos.map((m) => m.bucket).sort()).toEqual(['nota_cancelada', 'nota_corrigida', 'nota_corrigida']);
    const devolucoes = (await mov('devolucoes')).lista!;
    expect([devolucoes.total, devolucoes.somaMilesimos]).toEqual([2, 5_000]);
    expect(devolucoes.movimentos.map((m) => m.requisicaoNumero)).toEqual([1, 1]);
    const uso = (await mov('uso')).lista!;
    expect([uso.total, uso.somaMilesimos]).toEqual([3, -31_239]);
    expect(uso.movimentos.filter((m) => m.bucket === 'uso_producao').map((m) => m.codigoLote === null)).toEqual([false, false]);
    const ajustes = (await mov('ajustes')).lista!;
    expect([ajustes.total, ajustes.somaMilesimos]).toEqual([1, -761]);
    expect(ajustes.movimentos[0]).toMatchObject({ bucket: 'contagem_falta', contagemTipo: 'CICLICA', contagemTitulo: 'Ciclo da semana' });
    const inicial = (await mov('inicial')).lista!;
    expect([inicial.total, inicial.somaMilesimos, inicial.movimentos[0].bucket]).toEqual([1, 20_000, 'abertura']);
    expect(inicial.movimentos[0].contagemTipo).toBe('ABERTURA');
    const final = (await mov('final')).lista!;
    expect(final.somaMilesimos).toBe(55_000);
    // Paginação no banco: 2 por página, a última página vem inteira e a pedida além da última cai na última.
    const p2 = (await movimentosDaTela(a, DONA(), filtros({ col: 'final', insumo: ids.cebola, por: '10', pagina: '99' })));
    expect(p2.numeroDaPagina).toBe(p2.paginas);
  });

  it('a restrição de atenção vale também para os movimentos; a caixa isola uma linha do detalhe; a soma só vale com uma unidade', async () => {
    const atencao = (await movimentosDaTela(a, DONA(), filtros({ col: 'final', so: 'atencao' }))).lista!;
    const [direto] = await sql<{ n: number }>(`SELECT count(*)::int AS n FROM "MovimentoEstoque" WHERE "parceiroId" = $1 AND "insumoId" = ANY($2)`, A.id, [ids.alho, ids.ovo, ids.pimenta]);
    expect([atencao.total, direto.n]).toEqual([6, 6]);
    expect(new Set(atencao.movimentos.map((m) => m.insumo))).toEqual(new Set(['Alho', 'Ovo', 'Pimenta']));
    // Uma caixa só dentro da coluna (o linha a linha do detalhe) e uma caixa de outra coluna cai na coluna toda.
    const falta = (await movimentosDaTela(a, DONA(), filtros({ col: 'ajustes', bucket: 'contagem_falta', insumo: ids.cebola }))).lista!;
    expect([falta.total, falta.somaMilesimos]).toEqual([1, -761]);
    const so = (await movimentosDaTela(a, DONA(), filtros({ col: 'compras', bucket: 'perda', insumo: ids.cebola }))).lista!;
    expect(so.total).toBe(3);
    // A soma: kg de um insumo só tem unidade; o recorte inteiro mistura kg, L e un.
    expect((await movimentosDaTela(a, DONA(), filtros({ col: 'final', insumo: ids.cebola }))).lista!.unidadeUnica).toBe('KG');
    expect((await movimentosDaTela(a, DONA(), filtros({ col: 'final' }))).lista!.unidadeUnica).toBeNull();
  });

  it('o gerente vê só a loja dele (loja de fora = vazio), o outro parceiro não existe e o operador lê só quantidade (nenhum R$)', async () => {
    const g = await tela(GERENTE());
    expect(g.pagina!.linhas).toHaveLength(8);
    expect(g.verValores).toBe(true);
    const fora = await tela(GERENTE(), { loja: ids.centro });
    expect(fora.motivoVazio).toBe('sem-loja');
    expect(fora.pagina).toBeNull();
    const gc = await tela(GERENTE_CENTRO(), { loja: ids.vp });
    expect(gc.motivoVazio).toBe('sem-loja');
    // O parceiro B só vê o estoque dele; A não vê o de B.
    const deB = await consumoDaTela(b, DONA(), filtros());
    expect(deB.pagina!.linhas.map((l) => [l.insumo, l.final.q])).toEqual([['Cebola', 99_000]]);
    expect((await tela(DONA())).pagina!.linhas.some((l) => l.insumoId === ids.insB)).toBe(false);
    expect((await movimentosDaTela(b, DONA(), filtros({ col: 'final', insumo: ids.cebola }))).lista!.total).toBe(0);
    // Operador: estoque.ver sim, compras.ver não: nenhum valor sai do banco.
    const o = await tela(OPERADOR());
    expect(o.verValores).toBe(false);
    expect(o.pagina!.linhas).toHaveLength(8);
    for (const l of o.pagina!.linhas) {
      expect(l.inicial.v).toBe(0);
      expect(l.final.v).toBe(0);
      expect(Object.values(l.somas).every((s) => s!.v === 0)).toBe(true);
    }
    expect((await movimentosDaTela(a, OPERADOR(), filtros({ col: 'compras', insumo: ids.cebola }))).lista!.movimentos.every((m) => m.valorCentavos === 0)).toBe(true);
    // Sem estoque.ver em nenhuma loja: sem permissão.
    expect((await tela(alcanceDe(null, [ids.vp], ['insumos.ver']))).motivoVazio).toBe('sem-permissao');
  });

  it('o dinheiro é o do livro (centavos, como foi gravado) e fecha com o SQL: compras R$ 300,00 + 120,00 + 60,00 e o saldo em R$', async () => {
    const l = await linha('cebola');
    expect(l.somas.compra?.v).toBe(48_000);
    expect(l.somas.nota_cancelada?.v).toBe(-12_000);
    expect(l.somas.nota_corrigida?.v).toBe(1_200);
    const [direto] = await sql<{ antes: number; ate: number }>(
      `SELECT coalesce(sum("valorCentavos") FILTER (WHERE "ocorridoEm" < '2026-10-01T03:00:00Z'), 0)::int AS antes,
              coalesce(sum("valorCentavos") FILTER (WHERE "ocorridoEm" < '2026-11-01T03:00:00Z'), 0)::int AS ate
       FROM "MovimentoEstoque" WHERE "parceiroId" = $1 AND "lojaId" = $2 AND "insumoId" = $3`,
      A.id,
      ids.vp,
      ids.cebola,
    );
    expect([l.inicial.v, l.final.v]).toEqual([direto.antes, direto.ate]);
    expect(l.inicial.v).toBe(12_000);
  });

  it('teto: passou do teto de linhas a planilha não corta calada (avisa)', async () => {
    const c = await consumoCompleto(a, DONA(), filtros(), 3);
    expect(c.linhas!.passouDoTeto).toBe(true);
    expect(c.linhas!.linhas).toHaveLength(3);
    const inteiro = await consumoCompleto(a, DONA(), filtros(), 50_000);
    expect(inteiro.linhas!.passouDoTeto).toBe(false);
    expect(inteiro.linhas!.linhas).toHaveLength(8);
    // As somas por caixa de cada par vêm todas na leitura completa (não só da primeira página).
    expect(inteiro.linhas!.linhas.find((l) => l.insumo === 'Cebola')!.somas.compra?.q).toBe(80_000);
  });

  describe('a planilha (CSV) é a tela', () => {
    const csv = async (params: Record<string, string> = {}, alcance: Alcance = DONA(), parte: 'linhas' | 'movimentos' = 'linhas', teto?: number) => {
      const r = await planilhaDoConsumo(a, alcance, filtros(params), { parte, agora: new Date('2026-11-20T13:00:00Z'), teto });
      if (!r.ok) throw new Error(`${r.status}: ${r.frase}`);
      return r.corpo.replace(/^﻿/, '').split('\r\n');
    };
    const celulas = (l: string) => l.split(';');

    it('uma linha por insumo × loja com os MESMOS números da tela (inicial, cada caixa, final) e os totais por unidade do resumo', async () => {
      const t = await tela(DONA());
      const linhas = await csv();
      const cab = linhas.findIndex((l) => l.startsWith('Loja;Insumo;Unidade;'));
      expect(cab).toBeGreaterThan(0);
      const nomes = celulas(linhas[cab]);
      const col = (nome: string) => nomes.indexOf(nome);
      const doCsv = linhas.slice(cab + 1).filter((l) => l && !l.startsWith('TOTAIS')).slice(0, 8);
      expect(doCsv).toHaveLength(8);
      const virgula = (m: number) => {
        const abs = Math.abs(m);
        const t2 = `${Math.trunc(abs / 1000)}${abs % 1000 ? ',' + String(abs % 1000).padStart(3, '0').replace(/0+$/, '') : ''}`;
        return m < 0 ? `-${t2}` : t2;
      };
      for (const l of t.pagina!.linhas) {
        const c = celulas(doCsv.find((x) => celulas(x)[1] === l.insumo)!);
        expect(c[col('Saldo inicial (quantidade)')]).toBe(virgula(l.inicial.q));
        expect(c[col('Saldo final (quantidade)')]).toBe(virgula(l.final.q));
        for (const b of LISTA_DE_BUCKETS) expect(c[col(`${BUCKETS[b].rotulo} (quantidade)`)]).toBe(virgula(l.somas[b]?.q ?? 0));
        expect(c[col('Confere (inicial + movimentos = final)')]).toBe('Sim');
        expect(c[col('Lacunas')]).toBe(l.lacunas.map((x) => x.rotulo).join(' | '));
      }
      // Totais por unidade: os do resumo da tela.
      const totais = linhas.join('\n');
      for (const u of t.resumo!.unidades) {
        const un = { KG: 'kg', L: 'L', UN: 'un' }[u.unidade];
        expect(totais).toContain(`Saldo final (${un});${virgula(u.final.q)};`);
        expect(totais).toContain(`Saldo inicial (${un});${virgula(u.inicial.q)};`);
      }
      // O cabeçalho diz o período, a data, o que é o uso e os avisos da tela (a nota fiscal que aguarda).
      const cabecalho = linhas.slice(0, cab).join('\n');
      expect(cabecalho).toMatch(/Movimentos do livro do estoque de 01\/10\/2026 a 31\/10\/2026/);
      expect(cabecalho).toMatch(/Uso é a requisição registrada/);
      expect(cabecalho).toMatch(/Transferência entre lojas ainda não existe/);
      expect(cabecalho).toMatch(/Aviso;.*1 nota fiscal recebida \(XML\) aguarda conferência/);
    });

    it('bruto e líquido saem na planilha como na tela: compras lançadas, cancelamentos e correções, líquidas; requisitado, devolvido, líquido', async () => {
      const cebola = (await csv({ insumo: ids.cebola, loja: ids.vp })).join('\n');
      expect(cebola).toContain('Compras (kg): lançadas | cancelamentos e correções de nota | líquidas;80;-18;62');
      expect(cebola).toContain('Uso (kg): requisitados | devolvidos | líquidos;-31,239;5;-26,239');
    });

    it('o dinheiro só sai para quem vê: dona tem as colunas em R$, operador não tem nenhuma', async () => {
      const dona = (await csv()).join('\n');
      expect(dona).toContain('Saldo inicial (R$)');
      expect(dona).toMatch(/Vila da Penha;Cebola;kg;20;/);
      expect(dona).toContain('120,00');
      const operador = (await csv({}, OPERADOR())).join('\n');
      expect(operador).not.toContain('(R$)');
      expect(operador).not.toContain('Reais (R$)');
      expect(operador).toMatch(/Sem valores em reais/);
      // Nenhum número com cara de dinheiro (vírgula e duas casas) nas linhas do operador, fora quantidades de 2 casas que não existem aqui.
      expect(operador.split('\n').filter((l) => /;-?\d+,\d{2};/.test(l) && !l.startsWith('Valores')).length).toBe(0);
    });

    it('nome de insumo que parece fórmula ganha apóstrofo (= + - @) e as aspas dobram', async () => {
      const original = (await a.insumo.findUnique({ where: { id: ids.sal }, select: { nome: true } }))!.nome;
      for (const nome of ['=HYPERLINK("http://x";"y")', '+cmd|calc', '-1+1', '@SOMA(A1)']) {
        await a.insumo.update({ where: { id: ids.sal }, data: { nome } });
        const linhas = await csv({ insumo: ids.sal });
        const cab = linhas.findIndex((l) => l.startsWith('Loja;Insumo;'));
        const dado = linhas[cab + 1];
        expect(dado.startsWith('Vila da Penha;')).toBe(true);
        const celula = dado.slice('Vila da Penha;'.length).split(';')[0];
        expect(celula.startsWith("'") || celula.startsWith(`"'`)).toBe(true);
      }
      await a.insumo.update({ where: { id: ids.sal }, data: { nome: original } });
    });

    it('recusas em frase, sem dado: sem sessão 401, sem permissão 403, período torto 400, passou do teto 413 (nunca corta calada)', async () => {
      expect(await planilhaDoConsumo(null, null, filtros(), { parte: 'linhas' })).toMatchObject({ ok: false, status: 401 });
      expect(await planilhaDoConsumo(a, alcanceDe(null, [ids.vp], ['insumos.ver']), filtros(), { parte: 'linhas' })).toMatchObject({ ok: false, status: 403 });
      expect(await planilhaDoConsumo(a, DONA(), filtros({ de: '2026-10-31', ate: '2026-10-01' }), { parte: 'linhas' })).toMatchObject({ ok: false, status: 400 });
      expect(await planilhaDoConsumo(a, DONA(), filtros(), { parte: 'linhas', teto: 3 })).toMatchObject({ ok: false, status: 413, frase: expect.stringMatching(/não corta calada/) });
      expect(await planilhaDoConsumo(a, GERENTE_CENTRO(), filtros({ loja: ids.vp }), { parte: 'linhas' })).toMatchObject({ ok: false, status: 403 });
      // Outro parceiro: só o estoque dele.
      const deB = await planilhaDoConsumo(b, DONA(), filtros(), { parte: 'linhas' });
      expect(deB.ok && deB.corpo).toContain('Cebola');
      expect(deB.ok && deB.corpo).not.toContain('Alho');
      // A rota HTTP: o arquivo tem o nome do período, é CSV e não guarda em cache.
      const resp = await responderPlanilhaDoConsumo(a, DONA(), new Request('http://x/exportar?de=2026-10-01&ate=2026-10-31'));
      expect(resp.status).toBe(200);
      expect(resp.headers.get('content-disposition')).toBe('attachment; filename="consumo-estoque-2026-10-01_a_2026-10-31.csv"');
      expect(resp.headers.get('cache-control')).toBe('no-store');
    });

    it('os movimentos de um número também saem em planilha (e batem com a tela)', async () => {
      const linhas = await csv({ col: 'uso', insumo: ids.cebola }, DONA(), 'movimentos');
      const cab = linhas.findIndex((l) => l.startsWith('Quando entrou no livro'));
      const dados = linhas.slice(cab + 1).filter((l) => l && !l.startsWith('TOTAIS'));
      expect(dados.slice(0, 3)).toHaveLength(3);
      expect(linhas.join('\n')).toContain('Soma da quantidade;-31,239 kg');
      const lista = (await movimentosDaTela(a, DONA(), filtros({ col: 'uso', insumo: ids.cebola }))).lista!;
      expect(lista.total).toBe(3);
      expect(linhas.join('\n')).toMatch(/Requisição #1/);
      expect(await planilhaDoConsumo(a, DONA(), filtros(), { parte: 'movimentos' })).toMatchObject({ ok: false, status: 400 });
    });
  });

  it('duas devoluções seguidas da mesma requisição (o estorno do relançamento também é devolução): requisitado −4, devolvido +2, líquido −2', async () => {
    const far = await cadastrarInsumo(a, { nome: 'Farinha', tipo: 'INGREDIENTE', unidade: 'KG', escala: 'base', conteudo: '1', preco: '5,00', conservacao: 'SECO' });
    if (!far.ok) throw new Error('farinha');
    em('2026-10-21T09:00:00');
    const n = await lancarNota(a, DONA(), { lojaId: ids.vp, fornecedorId: ids.ze, numero: '77', serie: '', data: '2026-10-21', frete: '', total: '50,00', itens: [{ insumoId: far.id, embalagem: 'granel', quantidade: '10', valor: '50,00' }] }, 'Marina');
    if (!n.ok) throw new Error(JSON.stringify(n));
    em('2026-10-21T10:00:00');
    const p = await criarRequisicao(a, GERENTE(), ids.vp, { setor: 'COZINHA', paraDia: 'hoje', observacao: '', linhas: [{ insumoId: far.id, quantidade: '4', escala: 'base' }] }, 'Caio');
    if (!p.ok) throw new Error(JSON.stringify(p));
    let r = (await obterRequisicao(a, DONA(), ids.vp, p.id))!;
    expect((await atenderRequisicao(a, GERENTE(), ids.vp, p.id, { versao: r.requisicao.versao, linhas: [{ itemId: r.itens[0].id, quantidade: '4', escala: 'base' }], encerrar: false, confirmarNegativo: false }, 'Edu Estoque')).ok).toBe(true);
    for (const hora of ['11:00:00', '12:00:00']) {
      em(`2026-10-21T${hora}`);
      r = (await obterRequisicao(a, DONA(), ids.vp, p.id))!;
      const dev = await devolverItem(a, GERENTE(), ids.vp, p.id, { versao: r.requisicao.versao, itemId: r.itens[0].id, quantidade: '1', escala: 'base', motivo: 'sobrou' }, 'Edu Estoque');
      if (!dev.ok) throw new Error(JSON.stringify(dev));
    }
    em('2026-11-20T10:00:00');
    ids.farinha = far.id;
    const l = await linha('farinha');
    expect([l.inicial.q, q(l, 'compra'), q(l, 'uso_setor'), q(l, 'devolucao_setor'), l.final.q]).toEqual([0, 10_000, -4_000, 2_000, 8_000]);
    expect(l.somas.devolucao_setor?.n).toBe(4);
    expect(l.somas.uso_setor?.n).toBe(1);
    expect(l.confere).toBe(true);
    expect(l.saldoGuardado).toBe(8_000);
  });

  it('o R$ nem sai do banco para quem não vê custo: a própria consulta do livro zera o valor', async () => {
    em('2026-11-20T10:00:00');
    const maiorValor = (alcance: Alcance) =>
      a.transacao(async (tx) => {
        const { recorte } = await resolverRecorteDoConsumo(tx, alcance, filtros());
        const [x] = await tx.sql<{ maior: number; movimentos: number }>`WITH mov AS (${fonteDoConsumo(recorte!)}) SELECT COALESCE(max(abs("v")), 0)::float8 AS "maior", count(*) FILTER (WHERE "q" <> 0)::int AS "movimentos" FROM mov`;
        return { ...x, verValores: recorte!.verValores };
      });
    const dona = await maiorValor(DONA());
    expect(dona.verValores).toBe(true);
    expect(dona.maior).toBeGreaterThan(0);
    const operador = await maiorValor(OPERADOR());
    expect(operador.verValores).toBe(false);
    expect(operador.movimentos).toBeGreaterThan(0);
    expect(operador.maior).toBe(0);
  });

  it('a tela pelo servidor lê o livro numa transação de relatório (somente leitura e com teto), e não grava nada', async () => {
    em('2026-11-20T10:00:00');
    const antes = await sql<{ n: number }>(`SELECT count(*)::int AS n FROM "MovimentoEstoque" WHERE "parceiroId" = $1`, A.id);
    const t = await tela(DONA());
    expect(t.motivoVazio).toBeNull();
    expect(t.demorou).toBeNull();
    const depois = await sql<{ n: number }>(`SELECT count(*)::int AS n FROM "MovimentoEstoque" WHERE "parceiroId" = $1`, A.id);
    expect(depois[0].n).toBe(antes[0].n);
  });

  it('com as vagas de relatório todas ocupadas, a tela, os movimentos, a impressão e a planilha respondem com a frase, sem erro 500', { timeout: 60_000 }, async () => {
    em('2026-11-20T10:00:00');
    const soltar = await Promise.all(Array.from({ length: RELATORIOS_SIMULTANEOS }, () => VAGAS_DO_PROCESSO.pegar()));
    try {
      const [t, m, c, p, resp] = await Promise.all([
        tela(DONA()),
        movimentosDaTela(a, DONA(), filtros({ col: 'compras' })),
        consumoCompleto(a, DONA(), filtros(), 100),
        planilhaDoConsumo(a, DONA(), filtros(), { parte: 'linhas' }),
        responderPlanilhaDoConsumo(a, DONA(), new Request('http://x/exportar?de=2026-10-01&ate=2026-10-31')),
      ]);
      expect(t.motivoVazio).toBe('demorou');
      expect(t.demorou).toMatchObject({ motivo: 'ocupado', titulo: 'Há outro relatório grande rodando.', texto: 'Tente em instantes.' });
      // Os filtros continuam aparecendo (as lojas e os insumos do acesso), só os números ficam de fora.
      expect(t.opcoes.lojas.length).toBeGreaterThan(0);
      expect(t.resumo).toBeNull();
      expect(m.motivoVazio).toBe('demorou');
      expect(m.demorou?.titulo).toBe('Há outro relatório grande rodando.');
      expect(c.motivoVazio).toBe('demorou');
      expect(p).toEqual({ ok: false, status: 503, frase: 'Há outro relatório grande rodando. Tente em instantes.' });
      expect(resp.status).toBe(503);
      expect(await resp.text()).toBe('Há outro relatório grande rodando. Tente em instantes.');
    } finally {
      soltar.forEach((l) => l());
    }
    // Liberadas as vagas, tudo volta ao normal.
    expect((await tela(DONA())).motivoVazio).toBeNull();
  });
});
