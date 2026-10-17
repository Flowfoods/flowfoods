/**
 * ERP 2.2b · metas e fechamento do período (Postgres real).
 *
 * Os dois parceiros A (o DRE: faturamento de agosto e setembro, despesas, notas) e E (o estoque:
 * contagem de fechamento) são do teste; o B só serve de isolamento. Setembro fecha limpo; agosto fecha com
 * ressalvas. Cobre os critérios 1 a 18 da análise:
 *   1-4  metas com vigência, sem meta, texto lido no servidor, linha que não aceita meta;
 *   5-6  realizado × meta (a palavra, o desvio, a meta em R$) na rede e na loja;
 *   7    receita contra o ano passado;
 *   8-9  condições duras e ressalvas;   10  corrida (cada teste espera a trava);
 *   11-12 notas e estoque obedecem o período fechado;
 *   13-14 o fechado lido da fotografia e bate centavo a centavo com o ao vivo;
 *   15   SQL cru recusado;   16 reabrir só pelo nível 1, versão 2, histórico;
 *   18   a recorrente que sobrevive a um mês sem lançamento.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-dre-fechamento.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { lancarDia, salvarCanaisDaLoja, type EntradaDoCanal } from '@/lib/erp/faturamento';
import { cadastrarInsumo } from '@/lib/erp/insumos';
import { cadastrarFornecedor, cancelarNota, editarNota, lancarNota } from '@/lib/erp/compras';
import { concluirAbertura, contarItem, iniciarAbertura, obterContagemDeAbertura } from '@/lib/erp/estoque';
import { concluirContagem, descartarContagem, iniciarFechamento } from '@/lib/erp/contagem';
import { lancarDespesa, lancarDoMesPassado, pagarDespesa, pararDeRepetir, recorrentesEmFalta, obterDespesa } from '@/lib/erp/despesas';
import type { TextosDaDespesa } from '@/lib/erp/despesa-campos';
import { dreDoPeriodo, type DreDoPeriodo } from '@/lib/erp/dre';
import { fecharPeriodo, reabrirPeriodo, situacaoDoFechamento } from '@/lib/erp/dre-fechamento';
import { gravarFotografia } from '@/lib/erp/dre-fotografia';
import { metasDoPeriodo, salvarMetas, situacaoDasMetas } from '@/lib/erp/dre-metas';
import { travarParaEscrever, travarParaFechar } from '@/lib/erp/periodo-trava';
import { planoDoParceiro, garantirPlano, renomearLinha, ocultarLinha } from '@/lib/erp/plano';
import { listarHistorico } from '@/lib/erp/historico';
import { salvarTaxaDoIfood } from '@/lib/erp/canais';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import { criarPeriodoFechadoDeTeste, cru, limparParceiros, perfilDoBanco, reabrirPeriodoDeTeste, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
/** "Hoje" do teste: o relógio do ambiente dos testes de DRE. Outubro está em curso; setembro e agosto terminaram. */
const HOJE = '2026-10-17';
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe.skipIf(!URL_TESTE)('ERP 2.2b · metas e fechamento (Postgres real)', { timeout: 300_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `f${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string };
  let B: { id: string };
  let E: { id: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  let e: ClienteDoParceiro;
  const ids: Record<string, string> = {};
  const criados: string[] = [];

  const alcance = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR', lojaIds: string[] | 'rede'): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const propria = (permissoes: string[], lojaIds: string[] | 'rede'): Alcance =>
    resolverAlcance({ perfilBase: null, perfilProprio: permissoes, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const DONA = () => alcance('DONO', 'rede');
  const GERENTE_VP = () => alcance('GERENTE', [ids.vp]);
  const GERENTE_REDE = () => alcance('GERENTE', 'rede');
  const OPERADOR = () => alcance('OPERADOR', [ids.vp]);
  const SO_HISTORICO = () => propria(['historico.ver', 'lojas.ver'], 'rede');
  const N1 = () => ALCANCE_FLOWFOODS;

  // ------------------------------------------------------------ ajudas
  const canal = (c: string, valor: string, pedidos = '1', naoVendeu = false, versao = ''): EntradaDoCanal => ({ canal: c, valor, pedidos, clientes: '', naoVendeu, versao });
  const lancarDiaDe = (cliente: ClienteDoParceiro, lojaId: string, data: string, canais: EntradaDoCanal[]) => lancarDia(cliente, DONA(), { lojaId, data, canais }, 'Marina', HOJE);
  const diasDe = (mes: string) => Array.from({ length: new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5)), 0)).getUTCDate() }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`);
  const envio = () => globalThis.crypto.randomUUID().replace(/-/g, '');
  const textos = (p: Partial<TextosDaDespesa> = {}): TextosDaDespesa => ({ envio: envio(), lojaId: '', linha: 'aluguel', descricao: 'Aluguel', valor: '3.100,00', tipo: 'mes', dia: '', mes: '2026-09', de: '', ate: '', recorrente: false, vencimento: '', ...p });
  const despesa = async (p: Partial<TextosDaDespesa>, cliente = a) => {
    const r = await lancarDespesa(cliente, DONA(), textos(p), 'Marina', HOJE);
    if (!r.ok) throw new Error(JSON.stringify(r));
    return r.id;
  };
  const dre = (al: Alcance, escopo: { tipo: 'rede' } | { tipo: 'loja'; lojaId: string }, data: string, cliente = a): Promise<DreDoPeriodo | null> => dreDoPeriodo(cliente, al, escopo, data, HOJE);
  const linha = (d: DreDoPeriodo, chave: string) => d.resultado.linhas.find((l) => l.chave === chave)!;
  const versaoDasMetas = async (cliente = a, al = DONA(), hoje = HOJE) => (await situacaoDasMetas(cliente, al, hoje))!.versao;
  const metas = async (valores: Record<string, string>, hoje = HOJE, al = DONA(), cliente = a) => salvarMetas(cliente, al, { valores, versao: await versaoDasMetas(cliente, al, hoje) }, 'Marina', hoje);
  const metasDe = (inicio: string) => a.transacao(async (tx) => metasDoPeriodo(tx, await planoDoParceiro(tx), inicio));
  const fechar = (inicio: string, extra: { ressalvas?: string[]; justificativa?: string; impressao?: string } = {}, al = N1(), cliente = a) =>
    fecharPeriodo(cliente, al, { inicio, ressalvas: extra.ressalvas ?? [], justificativa: extra.justificativa ?? '', impressao: extra.impressao }, 'Ana Dona', HOJE);
  const situacao = (inicio: string, al = N1(), cliente = a) => situacaoDoFechamento(cliente, al, inicio, HOJE);
  const periodo = (inicio: string, cliente = a) => cliente.periodoApuracao.findFirst({ where: { inicio: dia(inicio) } });
  const historicoDe = (entidade: string, cliente = a) => listarHistorico(cliente, { entidade, verPrecos: false, verDre: true, limite: 50 });

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Fecha A', slug: `fecha-a-${sufixo}`, status: 'ATIVO' } });
    B = await db.parceiroFlow.create({ data: { nome: 'Fecha B', slug: `fecha-b-${sufixo}`, status: 'ATIVO' } });
    E = await db.parceiroFlow.create({ data: { nome: 'Fecha Estoque', slug: `fecha-e-${sufixo}`, status: 'ATIVO' } });
    criados.push(A.id, B.id, E.id);
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    e = doParceiro(E.id, db);
    for (const [cliente, chave, nome] of [
      [a, 'vp', 'Vila da Penha'],
      [a, 'dlv', 'Penha Delivery'],
      [a, 'nova', 'Loja Nova'],
      [b, 'lojaB', 'Loja do B'],
      [e, 'est', 'Loja do Estoque'],
    ] as const) {
      const r = await cadastrarLoja(cliente, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
      // As lojas "nasceram" no começo do ano: o relógio do teste não é o do cadastro.
      await cliente.loja.update({ where: { id: r.id }, data: { criadoEm: new Date('2026-01-10T12:00:00Z') } });
    }
    expect(await salvarCanaisDaLoja(a, ids.dlv, ['DELIVERY_PROPRIO'], ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'], 'Marina')).toEqual({ ok: true, mudou: true });
    expect(await salvarCanaisDaLoja(a, ids.nova, ['LOJA'], ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'], 'Marina')).toEqual({ ok: true, mudou: true });

    // ---- faturamento de setembro (completo): vp 200 + 100 por dia, iFood "não vendeu"; dlv 1.000 no dia 1. Total R$ 10.000,00.
    for (const d of diasDe('2026-09')) {
      const r1 = await lancarDiaDe(a, ids.vp, d, [canal('LOJA', '200,00', '5'), canal('DELIVERY_PROPRIO', '100,00', '3'), canal('IFOOD', '', '', true)]);
      expect(r1.ok, d).toBe(true);
      const r2 = await lancarDiaDe(a, ids.dlv, d, [d.endsWith('-01') ? canal('DELIVERY_PROPRIO', '1.000,00', '10') : canal('DELIVERY_PROPRIO', '', '', true)]);
      expect(r2.ok, d).toBe(true);
    }
    // ---- agosto: a Penha lançou tudo, menos a LOJA do dia 20 (1 falta); a Delivery lançou tudo.
    for (const d of diasDe('2026-08')) {
      const canais = [canal('DELIVERY_PROPRIO', '50,00', '2'), canal('IFOOD', '', '', true)];
      if (d !== '2026-08-20') canais.unshift(canal('LOJA', '150,00', '4'));
      expect((await lancarDiaDe(a, ids.vp, d, canais)).ok, d).toBe(true);
      expect((await lancarDiaDe(a, ids.dlv, d, [canal('DELIVERY_PROPRIO', '', '', true)])).ok, d).toBe(true);
    }
    // ---- o ano passado: setembro de 2025, só 12 dias lançados na Penha (cobertura parcial)
    for (const d of diasDe('2025-09').slice(0, 12)) expect((await lancarDiaDe(a, ids.vp, d, [canal('LOJA', '100,00', '3'), canal('DELIVERY_PROPRIO', '50,00', '1'), canal('IFOOD', '', '', true)])).ok).toBe(true);
    // Salário de setembro: R$ 2.600,00 (26,0 % de R$ 10.000,00).
    await despesa({ linha: 'salarios', descricao: 'Folha de setembro', valor: '2.600,00', mes: '2026-09' });
    ids.plano = 'ok';
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, criados);
    await db?.$disconnect();
  });

  // ================================================================ 1. metas
  describe('metas', () => {
    it('critérios 1 e 2: vigência no início do período; salvar de novo atualiza a MESMA linha; apagar grava "sem meta"; setembro não muda', async () => {
      // Em setembro (hoje = 05/09) a meta de CMV é 20 % e a de Pessoal, 25 %.
      expect(await metas({ cmv: '20', 'grupo:PESSOAL': '25', 'resultado-do-periodo': '10' }, '2026-09-05')).toMatchObject({ ok: true, mudou: 3, valeDesde: '2026-09-01' });
      // Gravada em 20/10: vale para outubro inteiro (do dia 01), não para setembro.
      expect(await metas({ cmv: '30' }, '2026-10-20')).toMatchObject({ ok: true, mudou: 1, valeDesde: '2026-10-01' });
      expect((await metasDe('2026-10-01')).get('cmv')).toBe(3000);
      expect((await metasDe('2026-09-01')).get('cmv')).toBe(2000);
      expect((await metasDe('2026-10-31')).get('cmv')).toBe(3000);
      // 32 % no mesmo outubro: atualiza a mesma linha.
      expect(await metas({ cmv: '32' }, '2026-10-20')).toMatchObject({ ok: true, mudou: 1 });
      const linhaCmv = (await planoDoParceiro(a)).find((l) => l.codigo === 'cmv')!.id!;
      const linhas = await a.dreMeta.findMany({ where: { linhaId: linhaCmv }, orderBy: { vigenteDesde: 'asc' } });
      expect(linhas.map((l) => [l.vigenteDesde.toISOString().slice(0, 10), l.percentualBp, l.semMeta, l.canal])).toEqual([
        ['2026-09-01', 2000, false, null],
        ['2026-10-01', 3200, false, null],
      ]);
      const h = (await historicoDe('DreMeta')).filter((x) => x.alvo === 'CMV');
      expect(h.map((x) => [x.acao, x.mudancas.map((m) => `${m.campo}: ${m.antes ?? '—'} → ${m.depois}`).join(' | ')])).toEqual(
        expect.arrayContaining([
          ['ALTEROU', expect.stringContaining('meta: 30,0 % → 32,0 %')],
          ['ALTEROU', expect.stringContaining('meta: 20,0 % → 30,0 %')],
          ['CRIOU', expect.stringContaining('20,0 %')],
        ]),
      );
      // Regravar igual: nada muda, nada no histórico.
      const antes = (await historicoDe('DreMeta')).length;
      expect(await metas({ cmv: '32', 'grupo:PESSOAL': '25' }, '2026-10-20')).toMatchObject({ ok: true, mudou: 0 });
      expect((await historicoDe('DreMeta')).length).toBe(antes);
      // Apagar: outubro deixa de ter meta (uma linha semMeta), setembro segue.
      expect(await metas({ cmv: '' }, '2026-10-20')).toMatchObject({ ok: true, mudou: 1 });
      const depois = await a.dreMeta.findMany({ where: { linhaId: linhaCmv }, orderBy: { vigenteDesde: 'asc' } });
      expect(depois.map((l) => [l.percentualBp, l.semMeta])).toEqual([[2000, false], [0, true]]);
      expect((await metasDe('2026-10-01')).has('cmv')).toBe(false);
      expect((await metasDe('2026-09-01')).get('cmv')).toBe(2000);
      // Volta a ter meta no mesmo outubro: a mesma linha.
      expect(await metas({ cmv: '0' }, '2026-10-20')).toMatchObject({ ok: true, mudou: 1 }); // "0" é meta, não é "sem meta"
      expect((await metasDe('2026-10-01')).get('cmv')).toBe(0);
      expect(await a.dreMeta.count({ where: { linhaId: linhaCmv } })).toBe(2);
    });

    it('critério 3: texto lido no servidor — "12,5", "12,55 %" valem; "100,01", "12,555", "-1", "1e3", "abc" recusam sem gravar nada', async () => {
      const total = () => a.dreMeta.count();
      const antes = await total();
      expect(await metas({ salarios: '12,5' }, '2026-10-20')).toMatchObject({ ok: true, mudou: 1 });
      expect(await metas({ energia: '12,55 %' }, '2026-10-20')).toMatchObject({ ok: true, mudou: 1 });
      const leitura = async (chave: string) => (await metasDe('2026-10-01')).get(chave);
      expect(await leitura('salarios')).toBe(1250);
      expect(await leitura('energia')).toBe(1255);
      const depoisBoas = await total();
      expect(depoisBoas).toBe(antes + 2);
      for (const ruim of ['100,01', '12,555', '-1', '1e3', 'abc', '10 20']) {
        const r = await metas({ aluguel: ruim, agua: '5' }, '2026-10-20');
        expect(r, ruim).toMatchObject({ ok: false, erros: { aluguel: expect.any(String), geral: expect.stringContaining('nada foi gravado') } });
        expect(await total()).toBe(depoisBoas);
        expect(await leitura('agua')).toBeUndefined(); // tudo ou nada: o campo bom do mesmo envio também ficou de fora
      }
    });

    it('critério 4: receita bruta e receita por canal não aceitam meta, nem por campo forjado; CMV aceita; linha de outro parceiro ou inexistente é frase', async () => {
      const total = await a.dreMeta.count();
      for (const chave of ['grupo:RECEITA', 'receita-loja', 'receita-delivery', 'receita-ifood']) {
        const r = await metas({ [chave]: '10' }, '2026-10-20');
        expect(r, chave).toMatchObject({ ok: false, erros: { geral: expect.stringContaining('não tem meta') } });
      }
      // Linha de outro parceiro (id forjado) e linha que não existe: frase, não erro de servidor.
      await b.transacao((tx) => garantirPlano(tx));
      const linhaDeB = (await planoDoParceiro(b)).find((l) => l.codigo === 'aluguel')!.id!;
      expect(await metas({ [`id:${linhaDeB}`]: '10' }, '2026-10-20')).toMatchObject({ ok: false, erros: { geral: expect.stringContaining('não existe') } });
      expect(await metas({ 'id:inexistente': '10' }, '2026-10-20')).toMatchObject({ ok: false });
      expect(await metas({ '../etc': '10' }, '2026-10-20')).toMatchObject({ ok: false });
      expect(await a.dreMeta.count()).toBe(total);
      // CMV aceita (a linha mostra a meta com o realizado "—").
      const o = await dre(DONA(), { tipo: 'rede' }, '2026-10-05');
      expect(o!.metas.cmv).toMatchObject({ metaBp: 0, desvioBp: null, semComparacao: 'sem faturamento', metaCentavos: null }); // outubro ainda não tem faturamento
      const d = await dre(DONA(), { tipo: 'rede' }, '2026-09-10');
      expect(d!.metas.cmv).toMatchObject({ metaBp: 2000, metaCentavos: 200_000, desvioBp: null, desvioTexto: null, palavra: null, semComparacao: 'sem valor apurado' });
      expect(linha(d!, 'cmv').valorCentavos).toBeNull();
    });

    it('duas abas: a segunda recebe conflito e nada é gravado; gerente (mesmo da rede) e operador não gravam; parceiro B não vê as metas de A', async () => {
      const v = await versaoDasMetas();
      expect(await salvarMetas(a, DONA(), { valores: { gas: '4' }, versao: v }, 'Marina', HOJE)).toMatchObject({ ok: true, mudou: 1 });
      const velha = await salvarMetas(a, DONA(), { valores: { gas: '5' }, versao: v }, 'Marina', HOJE);
      expect(velha).toMatchObject({ ok: false, conflito: true });
      expect((await metasDe('2026-10-01')).get('gas')).toBe(400);
      for (const al of [GERENTE_REDE(), GERENTE_VP(), OPERADOR()]) expect(await salvarMetas(a, al, { valores: { gas: '9' }, versao: await versaoDasMetas() }, 'x', HOJE)).toMatchObject({ ok: false });
      expect(await situacaoDasMetas(a, GERENTE_REDE(), HOJE)).toBeNull();
      expect((await metasDe('2026-10-01')).get('gas')).toBe(400);
      expect(await b.dreMeta.count()).toBe(0);
    });

    it('vazamento: quem tem historico.ver sem dre.ver não recebe as metas no Histórico; quem tem dre.ver recebe', async () => {
      const so = await listarHistorico(a, { verPrecos: false, limite: 200 });
      expect(so.some((x) => x.entidade === 'DreMeta')).toBe(false);
      const com = await listarHistorico(a, { verPrecos: false, verDre: true, limite: 200 });
      expect(com.some((x) => x.entidade === 'DreMeta')).toBe(true);
      void SO_HISTORICO;
    });
  });

  // ================================================================ 2. realizado × meta e ano passado
  describe('realizado × meta e ano passado (setembro, ao vivo)', () => {
    it('critério 5: Pessoal R$ 2.600,00 sobre R$ 10.000,00 com meta 25 % = 26,0 %, +1,0 pp, "pior que a meta", meta R$ 2.500,00', async () => {
      const d = (await dre(DONA(), { tipo: 'rede' }, '2026-09-10'))!;
      expect(d.status).toBeNull();
      expect(d.resultado.receitaBrutaCentavos).toBe(1_000_000);
      expect(linha(d, 'grupo:PESSOAL').percentualBp).toBe(2600);
      expect(d.metas['grupo:PESSOAL']).toMatchObject({ metaBp: 2500, metaCentavos: 250_000, desvioBp: 100, desvioTexto: '+1,0 pp', palavra: 'pior que a meta' });
      // Resultado do período tem meta de 10 % em setembro: o realizado está em outro patamar, a palavra segue o sentido (maior é melhor).
      expect(d.metas['resultado-do-periodo']).toMatchObject({ metaBp: 1000 });
      expect(d.metas['resultado-do-periodo'].palavra).toBe(linha(d, 'resultado-do-periodo').percentualBp! > 1000 ? 'melhor que a meta' : 'pior que a meta');
      // Setembro NÃO pega a meta de CMV de outubro (nem a de salários: foi gravada em outubro).
      expect(d.metas.cmv).toMatchObject({ metaBp: 2000, semComparacao: 'sem valor apurado' });
      expect(d.metas.salarios).toBeUndefined();
      // Receita não tem meta.
      expect(d.metas['receita-loja']).toBeUndefined();
    });

    it('critério 6: na visão da loja a linha mostra a meta da rede, mas os dois "Resultado" não mostram meta', async () => {
      const d = (await dre(DONA(), { tipo: 'loja', lojaId: ids.vp }, '2026-09-10'))!;
      expect(d.metas['grupo:PESSOAL']).toMatchObject({ metaBp: 2500 });
      expect(d.metas['resultado-do-periodo']).toBeUndefined();
      expect(d.metas['resultado-operacional']).toBeUndefined();
      const g = (await dre(GERENTE_VP(), { tipo: 'loja', lojaId: ids.vp }, '2026-09-10'))!;
      expect(g.metas['grupo:PESSOAL']).toMatchObject({ metaBp: 2500 });
      expect(g.porLoja).toBeNull();
    });

    it('critério 7: receita contra o ano passado — mesmas datas, cobertura parcial (12 de 30 dias) sem variação, e período em curso compara até ontem', async () => {
      const d = (await dre(DONA(), { tipo: 'rede' }, '2026-09-10'))!;
      expect(d.anoPassado).toMatchObject({ de: '2025-09-01', ate: '2025-09-30', diasComLancamento: 12, diasDoRecorte: 30 });
      expect(d.anoPassado!.semVariacaoPorque).toContain('12 de 30 dias');
      const loja = d.anoPassado!.linhas.find((l) => l.chave === 'LOJA')!;
      expect(loja).toMatchObject({ atualCentavos: 600_000, anteriorCentavos: 120_000, variacaoBp: null });
      expect(d.anoPassado!.linhas.find((l) => l.chave === 'IFOOD')).toMatchObject({ anteriorCentavos: 0 }); // "não vendeu" lançado: zero de verdade
      // Outubro em curso (hoje 17/10): até ontem (16/10) contra 01 a 16/10 de 2025, que não tem lançamento nenhum.
      const o = (await dre(DONA(), { tipo: 'rede' }, '2026-10-10'))!;
      expect(o.anoPassado).toMatchObject({ de: '2025-10-01', ate: '2025-10-16', diasComLancamento: 0, diasDoRecorte: 16 });
      expect(o.anoPassado!.linhas.every((l) => l.anteriorCentavos === null && l.variacaoBp === null)).toBe(true);
      // O gerente da Penha só compara a loja dele.
      const g = (await dre(GERENTE_VP(), { tipo: 'loja', lojaId: ids.vp }, '2026-09-10'))!;
      expect(g.anoPassado!.linhas.find((l) => l.chave === 'LOJA')).toMatchObject({ atualCentavos: 600_000, anteriorCentavos: 120_000 });
    });

    it('critério 7: ano passado com cobertura total e período atual sem falta mostra a variação %', async () => {
      // Completa o ano passado da Penha: 18 dias que faltavam.
      for (const d of diasDe('2025-09').slice(12)) expect((await lancarDiaDe(a, ids.vp, d, [canal('LOJA', '100,00', '3'), canal('DELIVERY_PROPRIO', '50,00', '1'), canal('IFOOD', '', '', true)])).ok).toBe(true);
      // A Delivery também (o escopo da rede soma as duas lojas).
      for (const d of diasDe('2025-09')) expect((await lancarDiaDe(a, ids.dlv, d, [canal('DELIVERY_PROPRIO', '', '', true)])).ok).toBe(true);
      const d = (await dre(DONA(), { tipo: 'rede' }, '2026-09-10'))!;
      expect(d.anoPassado).toMatchObject({ diasComLancamento: 30, diasDoRecorte: 30, semVariacaoPorque: null });
      // LOJA: 6.000,00 contra 3.000,00 = +100,0 %; bruta: 10.000,00 contra 4.500,00.
      expect(d.anoPassado!.linhas.find((l) => l.chave === 'LOJA')).toMatchObject({ anteriorCentavos: 300_000, variacaoBp: 10_000 });
      expect(d.anoPassado!.linhas.find((l) => l.chave === 'bruta')).toMatchObject({ anteriorCentavos: 450_000, variacaoBp: 12_222 });
      expect(d.anoPassado!.linhas.find((l) => l.chave === 'IFOOD')).toMatchObject({ anteriorCentavos: 0, variacaoBp: null }); // base zero: sem variação
    });
  });

  // ================================================================ 3. fechar: condições
  describe('fechar: as condições (agosto)', () => {
    it('critério 8: período em curso não fecha, sem registrar nada', async () => {
      const r = await fechar('2026-10-01');
      expect(r).toMatchObject({ ok: false, erro: expect.stringContaining('ainda não terminou'), duras: [{ codigo: 'EM_CURSO' }] });
      expect(await periodo('2026-10-01')).toBeNull();
    });

    it('critério 8: início que não é início de período, futuro ou antes de 2020 = frase, não erro', async () => {
      for (const inicio of ['2026-08-15', '2027-01-01', '2019-12-01', 'abc', '', '2026-13-01', '2026-02-30']) {
        const r = await fechar(inicio);
        expect(r, inicio).toMatchObject({ ok: false, erro: expect.any(String) });
        expect(JSON.stringify(r), inicio).not.toMatch(/Unhandled|prisma|SELECT/i);
      }
      expect(await situacao('2026-08-15')).toBeNull();
      expect(await situacao('2027-01-01')).toBeNull();
    });

    it('critério 8: uma falta de faturamento trava, com o número, e nenhuma justificativa a contorna', async () => {
      const s = (await situacao('2026-08-01'))!;
      expect(s.condicoes!.duras.map((d) => d.codigo)).toEqual(['FALTA_FATURAMENTO']);
      const r = await fechar('2026-08-01', { ressalvas: s.condicoes!.ressalvas.map((x) => x.id), justificativa: 'Fecha assim mesmo, por favor, é urgente.', impressao: s.condicoes!.impressao });
      expect(r).toMatchObject({ ok: false, erro: expect.stringMatching(/1 lançamento de faturamento está faltando/), duras: [{ codigo: 'FALTA_FATURAMENTO', detalhe: expect.stringContaining('Vila da Penha (1)') }] });
      expect(await periodo('2026-08-01')).toBeNull(); // nada ficou registrado
      expect(await a.dreFotografia.count()).toBe(0);
    });

    it('critério 8: venda no iFood sem a taxa configurada trava; configurada, passa', async () => {
      const faltante = await lancarDiaDe(a, ids.vp, '2026-08-20', [canal('LOJA', '150,00', '4')]);
      expect(faltante.ok).toBe(true); // a falta foi suprida
      const iv = (await a.faturamentoLancamento.findFirst({ where: { lojaId: ids.vp, canal: 'IFOOD', data: dia('2026-08-03') } }))!;
      expect((await lancarDiaDe(a, ids.vp, '2026-08-03', [canal('IFOOD', '500,00', '12', false, iv.atualizadoEm.toISOString())])).ok).toBe(true);
      const r = await fechar('2026-08-01');
      expect(r).toMatchObject({ ok: false, duras: [{ codigo: 'SEM_TAXA_IFOOD' }] });
      expect(await salvarTaxaDoIfood(a, { comissao: '12', pagamento: '3,2', versao: '' }, 'Marina')).toMatchObject({ ok: true });
      const s = (await situacao('2026-08-01'))!;
      expect(s.condicoes!.duras).toEqual([]);
    });

    it('critério 8: rede sem nenhum lançamento = "nada a fechar" (julho, vazio)', async () => {
      const r = await fechar('2026-07-01');
      expect(r).toMatchObject({ ok: false, duras: [{ codigo: 'REDE_SEM_LANCAMENTO' }] });
      expect(await periodo('2026-07-01')).toBeNull();
    });

    it('critério 9: recorrente sem o mês lançado, e loja sem nenhum lançamento, são ressalvas — sem marcar, recusa; com cada uma + justificativa, fecha', async () => {
      // A luz de julho repete todo mês e ninguém lançou a de agosto.
      const luz = await despesa({ linha: 'energia', descricao: 'Luz', valor: '800,00', mes: '2026-07', recorrente: true, lojaId: ids.vp });
      ids.luz = luz;
      const s = (await situacao('2026-08-01'))!;
      expect(s.condicoes!.duras).toEqual([]);
      const ids2 = s.condicoes!.ressalvas.map((x) => x.id).sort();
      expect(ids2).toEqual([`recorrente:${luz}`, `sem-lancamento:${ids.nova}`].sort());
      expect(s.condicoes!.ressalvas.find((x) => x.tipo === 'RECORRENTE')).toMatchObject({ lojaNome: 'Vila da Penha', valorCentavos: 80_000, mesAlvo: '2026-08' });
      // Sem marcar nada: recusa, nada fechado.
      expect(await fechar('2026-08-01', { impressao: s.condicoes!.impressao })).toMatchObject({ ok: false, erro: expect.stringContaining('Marque cada uma') });
      // Marcando só uma: recusa.
      expect(await fechar('2026-08-01', { ressalvas: [`recorrente:${luz}`], justificativa: 'A luz chega no mês seguinte.', impressao: s.condicoes!.impressao })).toMatchObject({ ok: false, erro: expect.stringContaining('faltam 1') });
      // Marcando todas, sem justificativa ou com menos de 10 letras: recusa.
      for (const j of ['', 'curta', '         ']) {
        expect(await fechar('2026-08-01', { ressalvas: s.condicoes!.ressalvas.map((x) => x.id), justificativa: j, impressao: s.condicoes!.impressao }), j).toMatchObject({ ok: false, erros: { justificativa: expect.any(String) } });
      }
      expect(await fechar('2026-08-01', { ressalvas: s.condicoes!.ressalvas.map((x) => x.id), justificativa: 'x'.repeat(301), impressao: s.condicoes!.impressao })).toMatchObject({ ok: false });
      // Ressalva enviada que não existe mais: conflito ("algo mudou").
      expect(await fechar('2026-08-01', { ressalvas: [...s.condicoes!.ressalvas.map((x) => x.id), 'recorrente:nao-existe'], justificativa: 'Ressalva fantasma no envio.', impressao: s.condicoes!.impressao })).toMatchObject({ ok: false, mudou: true, erro: expect.stringContaining('Algo mudou') });
      // Impressão velha: conflito.
      expect(await fechar('2026-08-01', { ressalvas: s.condicoes!.ressalvas.map((x) => x.id), justificativa: 'Impressão que já passou.', impressao: 'velha' })).toMatchObject({ ok: false, mudou: true });
      expect(await periodo('2026-08-01')).toBeNull();
      expect(await a.dreFotografia.count()).toBe(0);
    });
  });

  // ================================================================ 4. notas de compra e o período fechado (antes de fechar agosto)
  describe('notas de compra', () => {
    const nota = (numero: string, data: string, valor = '100,00') => ({ lojaId: ids.vp, fornecedorId: ids.fornecedor, numero, serie: '', data, frete: '', total: valor, itens: [{ insumoId: ids.cheddar, embalagem: 'padrao', quantidade: '1', valor }] });

    it('prepara: fornecedor, insumo, uma nota de agosto e uma de outubro', async () => {
      const f = await cadastrarFornecedor(a, { nome: 'Laticínios Rio' }, 'Marina');
      if (!f.ok) throw new Error('fornecedor');
      ids.fornecedor = f.id;
      const i = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', nome: 'Cheddar fatiado', unidade: 'KG', conteudo: '5', preco: '89,90', frete: '5,00', conservacao: 'REFRIGERADO' });
      if (!i.ok) throw new Error('insumo');
      ids.cheddar = i.id;
      const n1 = await lancarNota(a, DONA(), nota('A-1', '2026-08-12'), 'Marina');
      const n2 = await lancarNota(a, DONA(), nota('O-1', '2026-10-05'), 'Marina');
      if (!n1.ok || !n2.ok) throw new Error(JSON.stringify([n1, n2]));
      ids.nAgosto = n1.id;
      ids.nOutubro = n2.id;
    });
  });

  // ================================================================ 5. fechar agosto (com ressalvas), setembro (limpo)
  describe('fechar e a fotografia', () => {
    it('critério 9: agosto fecha com as duas ressalvas marcadas + justificativa; a fotografia guarda lista, justificativa, taxa e metas da época', async () => {
      const s = (await situacao('2026-08-01'))!;
      const r = await fechar('2026-08-01', { ressalvas: s.condicoes!.ressalvas.map((x) => x.id), justificativa: 'A luz chega só no mês seguinte e a Loja Nova ainda não abriu.', impressao: s.condicoes!.impressao });
      expect(r).toEqual({ ok: true, versao: 1, jaFechado: false, ressalvas: 2 });
      const p = (await periodo('2026-08-01'))!;
      expect(p).toMatchObject({ status: 'FECHADO', fechadoPorNome: 'Ana Dona' });
      expect(p.fechadoEm).not.toBeNull();
      const f = (await a.dreFotografia.findMany({ where: { periodoId: p.id } }))[0];
      expect(f).toMatchObject({ versao: 1, versaoDaConta: 2, taxaComissaoBp: 1200, taxaPagamentoBp: 320, fechadoPorNome: 'Ana Dona', substituidaEm: null, nomeDoPeriodo: 'Agosto de 2026' });
      expect((f.ressalvas as { id: string }[]).map((x) => x.id).sort()).toEqual([`recorrente:${ids.luz}`, `sem-lancamento:${ids.nova}`].sort());
      expect(f.justificativa).toBe('A luz chega só no mês seguinte e a Loja Nova ainda não abriu.');
      // A entrada agregada (a base do CMV da 2.3) guarda a receita, a despesa e o plano da época.
      const entrada = f.entrada as { receitas: unknown[]; plano: unknown[]; taxaIfood: unknown };
      expect(entrada.receitas.length).toBeGreaterThan(0);
      expect(entrada.plano.length).toBeGreaterThan(30);
      expect(entrada.taxaIfood).toEqual({ comissaoBp: 1200, pagamentoBp: 320 });
      // O DRE de agosto lê da fotografia: "Fechado com ressalvas" com a lista.
      const d = (await dre(DONA(), { tipo: 'rede' }, '2026-08-10'))!;
      expect(d).toMatchObject({ status: 'FECHADO', encerrado: true, emCurso: false });
      expect(d.fechamento).toMatchObject({ versao: 1, fechadoPorNome: 'Ana Dona', justificativa: expect.stringContaining('A luz chega'), totalDeRessalvas: 2 });
      expect(d.fechamento!.ressalvas).toHaveLength(2);
      // A taxa do iFood congelada: 500,00 × (12 + 3,2) % = 76,00.
      expect(linha(d, 'taxas-ifood').valorCentavos).toBe(7600);
      // Histórico: FECHOU com receita, resultado, versão, ressalvas e a justificativa como motivo.
      const h = (await historicoDe('PeriodoApuracao')).find((x) => x.acao === 'FECHOU')!;
      expect(h.motivo).toContain('A luz chega');
      expect(h.mudancas.map((m) => m.campo)).toEqual(expect.arrayContaining(['situação', 'versão do fechamento', 'receita bruta', 'resultado', 'ressalvas']));
    });

    it('critério 8 (idempotente): fechar de novo diz "já fechado", não duplica e não cria versão', async () => {
      const r = await fechar('2026-08-01');
      expect(r).toMatchObject({ ok: true, jaFechado: true, versao: 1 });
      expect(await a.dreFotografia.count()).toBe(1);
    });

    it('critério 18: a recorrente de julho sem filha em agosto segue em "falta lançar" de setembro e de outubro, e "Lançar as do mês passado" a encadeia', async () => {
      const em = async (mes: string) => (await a.transacao((tx) => recorrentesEmFalta(tx, DONA(), mes))).map((f) => f.origemId);
      expect(await em('2026-09')).toContain(ids.luz);
      expect(await em('2026-10')).toContain(ids.luz);
      expect(await em('2026-08')).toContain(ids.luz);
      const d = (await dre(DONA(), { tipo: 'rede' }, '2026-10-10'))!;
      expect(d.faltaLancar.map((f) => f.origemId)).toContain(ids.luz);
      // Setembro (ainda aberto) também a cobra, como ressalva.
      const s = (await situacao('2026-09-01'))!;
      expect(s.condicoes!.ressalvas.map((x) => x.id)).toContain(`recorrente:${ids.luz}`);
      // Lançar as de outubro a partir do elo de julho: encadeia (a filha aponta o elo de julho).
      const r = await lancarDoMesPassado(a, DONA(), { envio: envio(), mes: '2026-10', itens: [{ origemId: ids.luz, valor: '812,00' }] }, 'Marina', HOJE);
      expect(r).toEqual({ ok: true, criadas: 1, jaLancadas: 0 });
      const filha = (await a.despesa.findFirst({ where: { repeteDeId: ids.luz } }))!;
      expect(filha).toMatchObject({ valorCentavos: 81_200, recorrente: true });
      expect(await em('2026-10')).not.toContain(ids.luz);
      expect(await em('2026-11')).toContain(filha.id);
      // "Não repete mais" a tira de vez.
      const dd = (await obterDespesa(a, DONA(), filha.id, HOJE))!;
      expect((await pararDeRepetir(a, DONA(), filha.id, dd.despesa.versao, 'Marina')).ok).toBe(true);
      expect(await em('2026-11')).not.toContain(filha.id);
      // Setembro não cobra mais a de julho (já tem filha); fecha limpo, abaixo.
      const s2 = (await situacao('2026-09-01'))!;
      expect(s2.condicoes!.ressalvas.map((x) => x.id)).not.toContain(`recorrente:${ids.luz}`);
    });

    it('critério 9: fecha setembro limpo — e o fechado BATE centavo a centavo com o ao vivo de um minuto antes, na rede e em cada loja (critério 14)', async () => {
      // A Loja Nova (que nunca lançou) deixa de ser cobrada: foi desativada.
      await a.loja.update({ where: { id: ids.nova }, data: { ativa: false } });
      const s = (await situacao('2026-09-01'))!;
      expect(s.condicoes).toMatchObject({ duras: [], ressalvas: [] });
      const antes = {
        rede: (await dre(DONA(), { tipo: 'rede' }, '2026-09-10'))!,
        vp: (await dre(DONA(), { tipo: 'loja', lojaId: ids.vp }, '2026-09-10'))!,
        dlv: (await dre(DONA(), { tipo: 'loja', lojaId: ids.dlv }, '2026-09-10'))!,
        gerente: (await dre(GERENTE_VP(), { tipo: 'loja', lojaId: ids.vp }, '2026-09-10'))!,
      };
      expect(antes.rede.status).toBeNull();
      const r = await fechar('2026-09-01', { impressao: s.condicoes!.impressao });
      expect(r).toEqual({ ok: true, versao: 1, jaFechado: false, ressalvas: 0 });
      const depois = {
        rede: (await dre(DONA(), { tipo: 'rede' }, '2026-09-10'))!,
        vp: (await dre(DONA(), { tipo: 'loja', lojaId: ids.vp }, '2026-09-10'))!,
        dlv: (await dre(DONA(), { tipo: 'loja', lojaId: ids.dlv }, '2026-09-10'))!,
        gerente: (await dre(GERENTE_VP(), { tipo: 'loja', lojaId: ids.vp }, '2026-09-10'))!,
      };
      expect(depois.rede.status).toBe('FECHADO');
      for (const k of ['rede', 'vp', 'dlv', 'gerente'] as const) {
        expect(depois[k].resultado, k).toEqual(antes[k].resultado);
        expect(depois[k].metas, k).toEqual(antes[k].metas);
      }
      expect(depois.rede.porLoja!.map((l) => [l.loja.id, l.receitaBrutaCentavos, l.resultadoCentavos]).sort()).toEqual(antes.rede.porLoja!.map((l) => [l.loja.id, l.receitaBrutaCentavos, l.resultadoCentavos]).sort());
      expect(depois.rede.resultado.receitaBrutaCentavos).toBe(1_000_000);
      expect(depois.rede.fechamento).toMatchObject({ versao: 1, totalDeRessalvas: 0, ressalvas: [] });
      // A fotografia tem uma linha por escopo (a Loja Nova, desativada e sem nada, fica de fora, como ao vivo).
      const f = (await a.dreFotografia.findFirst({ where: { periodoId: (await periodo('2026-09-01'))!.id } }))!;
      const escopos = (await a.dreFotografiaLinha.findMany({ where: { fotografiaId: f.id }, select: { lojaId: true }, distinct: ['lojaId'] })).map((x) => x.lojaId);
      expect(escopos.sort()).toEqual([null, ids.dlv, ids.vp].sort());
    });

    it('critério 13: depois de fechado nada muda o fechado — taxa do iFood, nome e visibilidade de linha, meta, despesa paga, despesa nova em outubro', async () => {
      const foto = async () => JSON.stringify({ r: (await dre(DONA(), { tipo: 'rede' }, '2026-09-10'))!.resultado, m: (await dre(DONA(), { tipo: 'rede' }, '2026-09-10'))!.metas, v: (await dre(DONA(), { tipo: 'loja', lojaId: ids.vp }, '2026-09-10'))!.resultado });
      const antes = await foto();
      const ta = (await a.canalConfig.findFirst({ where: { canal: 'IFOOD' } }))!;
      expect(await salvarTaxaDoIfood(a, { comissao: '25', pagamento: '5', versao: ta.atualizadoEm.toISOString() }, 'Marina')).toMatchObject({ ok: true });
      const plano = await planoDoParceiro(a);
      const aluguel = plano.find((l) => l.codigo === 'aluguel')!;
      expect(await renomearLinha(a, DONA(), { linha: 'aluguel', nome: 'Aluguel renomeado', versao: aluguel.versao }, 'Marina')).toMatchObject({ ok: true });
      const salarios = (await planoDoParceiro(a)).find((l) => l.codigo === 'salarios')!;
      expect(await ocultarLinha(a, DONA(), { linha: 'salarios', ocultar: true, versao: salarios.versao }, 'Marina')).toMatchObject({ ok: true });
      expect(await metas({ 'grupo:PESSOAL': '10' }, HOJE)).toMatchObject({ ok: true });
      // Mesmo que a meta de setembro mude por baixo (outra linha gravada à mão), o fechado lê a que foi fotografada.
      await a.dreMeta.updateMany({ where: { vigenteDesde: dia('2026-09-01') }, data: { percentualBp: 1000 } });
      const folha = await a.despesa.findFirst({ where: { descricao: 'Folha de setembro' } });
      const df = (await obterDespesa(a, DONA(), folha!.id, HOJE))!;
      expect(await pagarDespesa(a, DONA(), folha!.id, { data: '', versao: df.despesa.versao }, 'Marina', HOJE)).toMatchObject({ ok: true });
      await despesa({ linha: 'diversas', descricao: 'Diversas de outubro', valor: '99,00', mes: '2026-10' });
      expect(await foto()).toBe(antes);
      // O nome da linha na fotografia é o da época.
      const d = (await dre(DONA(), { tipo: 'rede' }, '2026-09-10'))!;
      expect(linha(d, 'aluguel').nome).toBe('Aluguel');
      expect(d.metas['grupo:PESSOAL']).toMatchObject({ metaBp: 2500 });
      expect(linha(d, 'salarios').oculta).toBe(false);
    });

    it('critério 10: dois fechamentos simultâneos — um fecha, o outro recebe "já fechado"; só uma fotografia', async () => {
      // Julho recebe um lançamento só para poder ser fechado.
      for (const d of diasDe('2026-07')) {
        expect((await lancarDiaDe(a, ids.vp, d, [canal('LOJA', '10,00', '1'), canal('DELIVERY_PROPRIO', '', '', true), canal('IFOOD', '', '', true)])).ok).toBe(true);
        expect((await lancarDiaDe(a, ids.dlv, d, [canal('DELIVERY_PROPRIO', '', '', true)])).ok).toBe(true);
      }
      const s = (await situacao('2026-07-01'))!;
      expect(s.condicoes).toMatchObject({ duras: [], ressalvas: [] });
      const rs = await Promise.all([1, 2, 3].map(() => fechar('2026-07-01')));
      expect(rs.filter((x) => x.ok && !('jaFechado' in x && x.jaFechado))).toHaveLength(1);
      expect(rs.filter((x) => x.ok && 'jaFechado' in x && x.jaFechado)).toHaveLength(2);
      const p = (await periodo('2026-07-01'))!;
      expect(await a.dreFotografia.count({ where: { periodoId: p.id } })).toBe(1);
    });

    it('critério 10: lançar faturamento, despesa e nota ESPERAM o fechamento (trava exclusiva) e depois são recusados — nenhuma entra no período fechado', async () => {
      // Simula o fechamento de junho: a trava exclusiva é pega ANTES, e o período vira FECHADO no fim.
      const esperas: Record<string, Promise<unknown>> = {};
      const terminou: Record<string, boolean> = {};
      const comoEspera = (nome: string, p: Promise<unknown>) => (esperas[nome] = p.then((r) => ((terminou[nome] = true), r)));
      await a.transacao(async (tx) => {
        await travarParaFechar(tx);
        comoEspera('faturamento', lancarDiaDe(a, ids.vp, '2026-06-12', [canal('LOJA', '10,00', '1')]));
        comoEspera('despesa', lancarDespesa(a, DONA(), textos({ tipo: 'dia', dia: '12/06/2026', linha: 'diversas', descricao: 'Corrida', valor: '5,00' }), 'Marina', HOJE));
        comoEspera('nota', lancarNota(a, DONA(), { lojaId: ids.vp, fornecedorId: ids.fornecedor, numero: 'J-1', serie: '', data: '2026-06-12', frete: '', total: '100,00', itens: [{ insumoId: ids.cheddar, embalagem: 'padrao', quantidade: '1', valor: '100,00' }] }, 'Marina'));
        await new Promise((r) => setTimeout(r, 900));
        // Sem a trava compartilhada, estas três já teriam terminado (e gravado) antes do fechamento.
        expect(terminou).toEqual({});
        await criarPeriodoFechadoDeTeste(tx, { nome: 'Junho de 2026', inicio: '2026-06-01', fim: '2026-06-30' });
      });
      const [f, d, n] = (await Promise.all([esperas.faturamento, esperas.despesa, esperas.nota])) as [{ ok: boolean; erros?: { geral?: string } }, { ok: boolean }, { ok: boolean; erros?: Record<string, string> }];
      expect(f.ok).toBe(false);
      expect(f.erros?.geral).toContain('Junho de 2026');
      expect(d.ok).toBe(false);
      expect(JSON.stringify(d)).toContain('Junho de 2026');
      expect(n.ok).toBe(false);
      expect(JSON.stringify(n)).toContain('Junho de 2026');
      expect(await a.faturamentoLancamento.count({ where: { data: dia('2026-06-12') } })).toBe(0);
      expect(await a.despesa.count({ where: { descricao: 'Corrida' } })).toBe(0);
      expect(await a.notaEntrada.count({ where: { numero: 'J-1' } })).toBe(0);
    });

    it('critério 10 (determinístico): fecharPeriodo ESPERA a escrita em curso e a fotografia tem a despesa que ela gravou; reabrir também espera — sem a trava dentro deles estes testes caem', async () => {
      // Abril completo e fechável sem ressalva.
      for (const d of diasDe('2026-04')) {
        expect((await lancarDiaDe(a, ids.vp, d, [canal('LOJA', '10,00', '1'), canal('DELIVERY_PROPRIO', '', '', true), canal('IFOOD', '', '', true)])).ok).toBe(true);
        expect((await lancarDiaDe(a, ids.dlv, d, [canal('DELIVERY_PROPRIO', '', '', true)])).ok).toBe(true);
        await lancarDiaDe(a, ids.nova, d, [canal('LOJA', '1,00', '1')]); // se a Loja Nova está ativa, não vira ressalva
      }
      const s0 = (await situacao('2026-04-01'))!.condicoes!;
      expect(s0.duras).toEqual([]);
      const fecharAbril = () => fechar('2026-04-01', { ressalvas: s0.ressalvas.map((x) => x.id), justificativa: 'Abril fechado só para provar a trava.' });

      // 1) Uma transação segura a trava de escrever; o fechamento começa em paralelo e NÃO pode terminar enquanto ela não confirmar.
      let terminou = false;
      let fechamento!: ReturnType<typeof fecharAbril>;
      await a.transacao(async (tx) => {
        await travarParaEscrever(tx);
        fechamento = fecharAbril().then((r) => ((terminou = true), r));
        await new Promise((r) => setTimeout(r, 900));
        expect(terminou, 'fecharPeriodo terminou sem esperar a escrita em curso (falta travarParaFechar)').toBe(false);
        // A despesa nasce nesta transação, depois de o fechamento já ter começado.
        expect(await lancarDespesa(tx, DONA(), textos({ tipo: 'dia', dia: '20/04/2026', linha: 'diversas', descricao: 'Entrou antes de fechar', valor: '123,00' }), 'Marina', HOJE)).toMatchObject({ ok: true });
      });
      expect(await fechamento).toMatchObject({ ok: true, versao: 1, jaFechado: false });
      const p = (await periodo('2026-04-01'))!;
      const f = (await a.dreFotografia.findFirst({ where: { periodoId: p.id } }))!;
      const naFoto = (f.entrada as { despesas: { centavos: number }[] }).despesas.map((x) => x.centavos);
      expect(naFoto, 'a fotografia ficou sem a despesa gravada durante o fechamento').toContain(12300);
      const noBanco = (await a.despesa.findMany({ where: { competencia: { lte: dia('2026-04-30') }, competenciaFim: { gte: dia('2026-04-01') } } })).reduce((x, d) => x + d.valorCentavos, 0);
      expect(naFoto.reduce((x, c) => x + c, 0)).toBe(noBanco);

      // 2) Reabrir também pega a trava exclusiva: com uma escrita em curso ele espera, e a escrita ainda é recusada (o período segue fechado).
      let reabriu = false;
      let reabertura!: ReturnType<typeof reabrirPeriodo>;
      await a.transacao(async (tx) => {
        await travarParaEscrever(tx);
        reabertura = reabrirPeriodo(a, N1(), { inicio: '2026-04-01', motivo: 'Conferir abril', fotografia: f.id }, 'Rodolfo').then((r) => ((reabriu = true), r));
        await new Promise((r) => setTimeout(r, 900));
        expect(reabriu, 'reabrirPeriodo terminou sem esperar a escrita em curso (falta travarParaFechar)').toBe(false);
        expect(await lancarDespesa(tx, DONA(), textos({ tipo: 'dia', dia: '21/04/2026', linha: 'diversas', descricao: 'Tarde demais', valor: '5,00' }), 'Marina', HOJE)).toMatchObject({ ok: false });
      });
      expect(await reabertura).toMatchObject({ ok: true });
      expect(await a.despesa.count({ where: { descricao: 'Tarde demais' } })).toBe(0);
      expect((await periodo('2026-04-01'))!.status).toBe('ABERTO');
    });

    it('critério 10: fechar de verdade × lançar despesa ao mesmo tempo — ou a despesa entra no fechamento, ou é recusada; nunca fica de fora calada', async () => {
      // Maio: faturamento completo e uma despesa pronta para brigar com o fechamento.
      for (const d of diasDe('2026-05')) {
        expect((await lancarDiaDe(a, ids.vp, d, [canal('LOJA', '10,00', '1'), canal('DELIVERY_PROPRIO', '', '', true), canal('IFOOD', '', '', true)])).ok).toBe(true);
        expect((await lancarDiaDe(a, ids.dlv, d, [canal('DELIVERY_PROPRIO', '', '', true)])).ok).toBe(true);
      }
      const s = (await situacao('2026-05-01'))!;
      expect(s.condicoes!.duras).toEqual([]);
      const marcadas = s.condicoes!.ressalvas.map((x) => x.id);
      const [rf, rd] = await Promise.all([
        fechar('2026-05-01', { ressalvas: marcadas, justificativa: 'Fechamento de maio com disputa.' }),
        lancarDespesa(a, DONA(), textos({ tipo: 'dia', dia: '20/05/2026', linha: 'diversas', descricao: 'Disputa', valor: '77,00' }), 'Marina', HOJE),
      ]);
      expect(rf.ok).toBe(true);
      const p = (await periodo('2026-05-01'))!;
      const f = (await a.dreFotografia.findFirst({ where: { periodoId: p.id } }))!;
      const entrada = f.entrada as { despesas: { centavos: number }[] };
      const naFoto = entrada.despesas.reduce((x, d) => x + d.centavos, 0);
      const noBanco = (await a.despesa.findMany({ where: { competencia: { lte: dia('2026-05-31') }, competenciaFim: { gte: dia('2026-05-01') } } })).reduce((x, d) => x + d.valorCentavos, 0);
      if (rd.ok) expect(naFoto).toBe(noBanco); // entrou no fechamento: a fotografia tem o centavo dela
      else {
        expect(JSON.stringify(rd)).toContain('Maio de 2026');
        expect(await a.despesa.count({ where: { descricao: 'Disputa' } })).toBe(0);
      }
      expect(naFoto).toBe(noBanco);
    });
  });

  // ================================================================ 6. notas de compra e período fechado (critério 11)
  describe('critério 11: notas de compra obedecem o período fechado', () => {
    const entradaDaNota = (numero: string, data: string, valor = '100,00') => ({ lojaId: ids.vp, fornecedorId: ids.fornecedor, numero, serie: '', data, frete: '', total: valor, itens: [{ insumoId: ids.cheddar, embalagem: 'padrao', quantidade: '1', valor }] });
    const versaoDa = async (id: string) => (await a.notaEntrada.findUnique({ where: { id } }))!.atualizadoEm.toISOString();
    const frase = /Agosto de 2026 já foi fechado no DRE/;

    it('lançar nota com data em período fechado é recusado com a frase do DRE; em período aberto passa', async () => {
      const r = await lancarNota(a, DONA(), entradaDaNota('N-AGO', '2026-08-20'), 'Marina');
      expect(r).toMatchObject({ ok: false });
      expect(JSON.stringify(r)).toMatch(frase);
      expect(await a.notaEntrada.count({ where: { numero: 'N-AGO' } })).toBe(0);
      const ok = await lancarNota(a, DONA(), entradaDaNota('N-OUT', '2026-10-06'), 'Marina');
      expect(ok).toMatchObject({ ok: true });
    });

    it('editar: nota que cai no fechado não muda; mover uma nota de fora PARA DENTRO e uma de dentro PARA FORA também são recusados; mudar uma de fora passa', async () => {
      const noFechado = await editarNota(a, DONA(), ids.nAgosto, { ...entradaDaNota('A-1', '2026-08-12', '120,00'), versao: await versaoDa(ids.nAgosto) }, 'Marina');
      expect(noFechado).toMatchObject({ ok: false });
      expect(JSON.stringify(noFechado)).toMatch(frase);
      // Sem nenhuma mudança também recusa: o período está fechado.
      expect(await editarNota(a, DONA(), ids.nAgosto, { ...entradaDaNota('A-1', '2026-08-12'), versao: await versaoDa(ids.nAgosto) }, 'Marina')).toMatchObject({ ok: false });
      // Para fora (de agosto para outubro): recusado, a de antes está fechada.
      const praFora = await editarNota(a, DONA(), ids.nAgosto, { ...entradaDaNota('A-1', '2026-10-02'), versao: await versaoDa(ids.nAgosto) }, 'Marina');
      expect(praFora).toMatchObject({ ok: false });
      expect(JSON.stringify(praFora)).toMatch(frase);
      // Para dentro (de outubro para agosto): recusado, a de depois está fechada.
      const praDentro = await editarNota(a, DONA(), ids.nOutubro, { ...entradaDaNota('O-1', '2026-08-31'), versao: await versaoDa(ids.nOutubro) }, 'Marina');
      expect(praDentro).toMatchObject({ ok: false });
      expect(JSON.stringify(praDentro)).toMatch(frase);
      expect((await a.notaEntrada.findUnique({ where: { id: ids.nOutubro } }))!.entradaEm.toISOString().slice(0, 10)).toBe('2026-10-05');
      expect((await a.notaEntrada.findUnique({ where: { id: ids.nAgosto } }))!.entradaEm.toISOString().slice(0, 10)).toBe('2026-08-12');
      // Uma de outubro que continua em outubro: passa.
      expect(await editarNota(a, DONA(), ids.nOutubro, { ...entradaDaNota('O-1', '2026-10-07', '130,00'), versao: await versaoDa(ids.nOutubro) }, 'Marina')).toMatchObject({ ok: true });
    });

    it('cancelar: a de agosto é recusada; a de outubro passa', async () => {
      const r = await cancelarNota(a, DONA(), ids.nAgosto, 'Digitada em dobro', 'Marina');
      expect(r).toMatchObject({ ok: false });
      expect(JSON.stringify(r)).toMatch(frase);
      expect((await a.notaEntrada.findUnique({ where: { id: ids.nAgosto } }))!.status).toBe('LANCADA');
      expect(await cancelarNota(a, DONA(), ids.nOutubro, 'Digitada em dobro', 'Marina')).toMatchObject({ ok: true });
    });

    it('depois de reabrir o período, a nota volta a poder ser editada; fecha de novo e volta a recusar (junho/maio simulados já provaram a espera)', async () => {
      // Usa um período só para isso: março, com uma nota.
      const n = await lancarNota(a, DONA(), entradaDaNota('N-MAR', '2026-03-10'), 'Marina');
      if (!n.ok) throw new Error(JSON.stringify(n));
      await a.transacao((tx) => criarPeriodoFechadoDeTeste(tx, { nome: 'Março de 2026', inicio: '2026-03-01', fim: '2026-03-31' }));
      expect(await cancelarNota(a, DONA(), n.id, 'Teste de março', 'Marina')).toMatchObject({ ok: false });
      const reaberto = await reabrirPeriodo(a, N1(), { inicio: '2026-03-01', motivo: 'Corrigir uma nota de março', fotografia: (await a.dreFotografia.findFirst({ where: { nomeDoPeriodo: 'Março de 2026' } }))!.id }, 'Rodolfo');
      expect(reaberto).toMatchObject({ ok: true });
      expect(await cancelarNota(a, DONA(), n.id, 'Teste de março', 'Marina')).toMatchObject({ ok: true });
    });

    const cadaUma: [string, () => Promise<unknown>][] = [];
    it('critério 10: editar e cancelar nota ESPERAM o fechamento (trava exclusiva) e, depois dele, são recusados', async () => {
      // Duas notas de fevereiro, que vai fechar "agora".
      const n1 = await lancarNota(a, DONA(), entradaDaNota('N-FEV1', '2026-02-10'), 'Marina');
      const n2 = await lancarNota(a, DONA(), entradaDaNota('N-FEV2', '2026-02-11'), 'Marina');
      if (!n1.ok || !n2.ok) throw new Error('notas de fevereiro');
      const terminou: Record<string, boolean> = {};
      const espera = (nome: string, p: Promise<unknown>) => p.then((r) => ((terminou[nome] = true), r));
      let editar!: Promise<unknown>;
      let cancelar!: Promise<unknown>;
      await a.transacao(async (tx) => {
        await travarParaFechar(tx);
        editar = espera('editar', editarNota(a, DONA(), n1.id, { ...entradaDaNota('N-FEV1', '2026-02-10', '140,00'), versao: (await a.notaEntrada.findUnique({ where: { id: n1.id } }))!.atualizadoEm.toISOString() }, 'Marina'));
        cancelar = espera('cancelar', cancelarNota(a, DONA(), n2.id, 'Digitada em dobro', 'Marina'));
        await new Promise((r) => setTimeout(r, 900));
        expect(terminou).toEqual({}); // sem a trava compartilhada já teriam terminado (e gravado)
        await criarPeriodoFechadoDeTeste(tx, { nome: 'Fevereiro de 2026', inicio: '2026-02-01', fim: '2026-02-28' });
      });
      expect(await editar).toMatchObject({ ok: false });
      expect(await cancelar).toMatchObject({ ok: false });
      expect(JSON.stringify(await editar)).toContain('Fevereiro de 2026');
      expect((await a.notaEntrada.findUnique({ where: { id: n2.id } }))!.status).toBe('LANCADA');
      expect((await a.notaEntrada.findUnique({ where: { id: n1.id } }))!.totalCentavos).toBe(10000);
      void cadaUma;
    });
  });

  // ================================================================ 7. SQL cru (critério 15)
  describe('critério 15: SQL cru não mexe na fotografia', () => {
    let foto: string;
    let periodoSet: string;
    it('prepara: a fotografia de setembro e um período aberto de abril', async () => {
      periodoSet = (await periodo('2026-09-01'))!.id;
      foto = (await a.dreFotografia.findFirst({ where: { periodoId: periodoSet } }))!.id;
      // Abril: um período aberto, sem fotografia (registrado pelo único caminho).
      const { registrarPeriodo, periodoDe } = await import('@/lib/erp/periodos');
      await a.transacao(async (tx) => {
        const r = await registrarPeriodo(tx, await periodoDe(tx, '2026-04-10'));
        expect(r.ok).toBe(true);
      });
    });
    const recusa = async (sql: string, ...valores: unknown[]) => {
      await expect(cru(db, perfil, A.id, sql, ...valores), sql).rejects.toThrow();
    };

    it('UPDATE de valor, DELETE e INSERT de linha numa fotografia de OUTRA transação são recusados', async () => {
      await recusa(`UPDATE "DreFotografiaLinha" SET "valorCentavos" = 1 WHERE "fotografiaId" = $1`, foto);
      await recusa(`UPDATE "DreFotografiaLinha" SET "nome" = 'x' WHERE "fotografiaId" = $1`, foto);
      await recusa(`DELETE FROM "DreFotografiaLinha" WHERE "fotografiaId" = $1`, foto);
      await recusa(
        `INSERT INTO "DreFotografiaLinha" ("id","parceiroId","fotografiaId","lojaId","lojaNome","ordem","chave","codigo","nome","grupo","tipo","nivel","sentido","valorCentavos","semContar")
         VALUES ('x1', $1, $2, NULL, NULL, 999, 'extra', NULL, 'Linha extra', 'OUTRAS', 'linha', 1, 'MENOR_MELHOR', 500, '{}')`,
        A.id,
        foto,
      );
      // Inclusive duplicando uma chave que já existe.
      await recusa(
        `INSERT INTO "DreFotografiaLinha" ("id","parceiroId","fotografiaId","lojaId","lojaNome","ordem","chave","codigo","nome","grupo","tipo","nivel","sentido","valorCentavos","semContar")
         VALUES ('x2', $1, $2, NULL, NULL, 0, 'receita-loja', 'receita-loja', 'Loja', 'RECEITA', 'receita', 1, 'MAIOR_MELHOR', 1, '{}')`,
        A.id,
        foto,
      );
      // Nada mudou.
      const v = await a.dreFotografiaLinha.findFirst({ where: { fotografiaId: foto, lojaId: null, chave: 'grupo:RECEITA' } });
      expect(v!.valorCentavos).toBe(1_000_000n);
    });

    it('a fotografia não se apaga, não muda e só se marca como substituída junto com a reabertura', async () => {
      await recusa(`DELETE FROM "DreFotografia" WHERE "id" = $1`, foto);
      await recusa(`UPDATE "DreFotografia" SET "fechadoPorNome" = 'Outra pessoa' WHERE "id" = $1`, foto);
      await recusa(`UPDATE "DreFotografia" SET "entrada" = '{}'::jsonb WHERE "id" = $1`, foto);
      await recusa(`UPDATE "DreFotografia" SET "versao" = 9 WHERE "id" = $1`, foto);
      await recusa(`UPDATE "DreFotografia" SET "ressalvas" = '[]'::jsonb, "justificativa" = 'x' WHERE "id" = $1`, foto);
      await recusa(`UPDATE "DreFotografia" SET "parceiroId" = $2 WHERE "id" = $1`, foto, B.id);
      // Marcar como substituída com o período ainda FECHADO deixaria o fechado sem fotografia vigente: recusado.
      await recusa(`UPDATE "DreFotografia" SET "substituidaEm" = now(), "reabertaPorNome" = 'x', "motivoReabertura" = 'abc' WHERE "id" = $1`, foto);
      expect((await a.dreFotografia.findUnique({ where: { id: foto } }))!.substituidaEm).toBeNull();
    });

    it('UPDATE do período para FECHADO sem fotografia é recusado; mudar datas de período FECHADO também; apagar período com fotografia também', async () => {
      await recusa(`UPDATE "PeriodoApuracao" SET "status" = 'FECHADO', "fechadoEm" = now() WHERE "inicio" = '2026-04-01' AND "parceiroId" = $1`, A.id);
      await recusa(`UPDATE "PeriodoApuracao" SET "inicio" = '2026-09-02' WHERE "id" = $1`, periodoSet);
      await recusa(`UPDATE "PeriodoApuracao" SET "fim" = '2026-10-02' WHERE "id" = $1`, periodoSet);
      await recusa(`UPDATE "PeriodoApuracao" SET "nome" = 'Setembro editado' WHERE "id" = $1`, periodoSet);
      await recusa(`DELETE FROM "PeriodoApuracao" WHERE "id" = $1`, periodoSet);
      // FECHADO sem a data de fechamento também não existe.
      await recusa(`UPDATE "PeriodoApuracao" SET "status" = 'FECHADO', "fechadoEm" = NULL WHERE "inicio" = '2026-04-01' AND "parceiroId" = $1`, A.id);
      expect((await periodo('2026-04-01'))!.status).toBe('ABERTO');
      expect((await periodo('2026-09-01'))!.status).toBe('FECHADO');
    });

    it('duas fotografias vigentes do mesmo período não existem (índice único parcial), nem a mesma versão duas vezes', async () => {
      await expect(
        a.transacao(async (tx) => {
          await gravarFotografia(tx, { periodoId: periodoSet, inicio: '2026-09-01', fim: '2026-09-30', nomeDoPeriodo: 'Setembro de 2026', fechadoPorNome: 'X', taxa: null, entrada: {}, ressalvas: [], justificativa: null, linhas: [] }, 2);
        }),
      ).rejects.toThrow();
      await expect(
        a.transacao(async (tx) => {
          await gravarFotografia(tx, { periodoId: periodoSet, inicio: '2026-09-01', fim: '2026-09-30', nomeDoPeriodo: 'Setembro de 2026', fechadoPorNome: 'X', taxa: null, entrada: {}, ressalvas: [], justificativa: null, linhas: [] }, 1);
        }),
      ).rejects.toThrow();
      expect(await a.dreFotografia.count({ where: { periodoId: periodoSet } })).toBe(1);
    });

    it('o ataque da v999: marcar a vigente como substituída e inserir uma fotografia falsa vigente, como o papel do tenant, deixando o período FECHADO — é recusado, e o DRE segue lendo a verdadeira', async () => {
      // Várias instruções na MESMA transação (os gatilhos adiados só olham no commit), como o papel do tenant quando a RLS existe.
      const emTransacao = (passos: [string, ...unknown[]][]) =>
        db.$transaction(async (tx) => {
          if (perfil.rls) await tx.$queryRaw`SELECT set_config('app.parceiro_id', ${A.id}, true), set_config('role', 'erp_tenant', true)`;
          for (const [sql, ...valores] of passos) await tx.$executeRawUnsafe(sql, ...valores);
        });
      const marcar: [string, ...unknown[]] = [`UPDATE "DreFotografia" SET "substituidaEm" = now(), "reabertaPorNome" = 'x', "motivoReabertura" = 'abc' WHERE "id" = $1`, foto];
      const inserir = (versao: number): [string, ...unknown[]] => [
        `INSERT INTO "DreFotografia" ("id","parceiroId","periodoId","versao","inicio","fim","nomeDoPeriodo","fechadoPorNome","versaoDaConta","entrada","ressalvas")
         VALUES ('falsa-${versao}', $1, $2, ${versao}, '2026-09-01', '2026-09-30', 'Setembro de 2026', 'Falsa', 1, '{}'::jsonb, '[]'::jsonb)`,
        A.id,
        periodoSet,
      ];
      // v999 vigente e a seguinte (v2), as duas com o período FECHADO: o gatilho do INSERT recusa.
      for (const v of [999, 2]) await expect(emTransacao([marcar, inserir(v)]), `v${v}`).rejects.toThrow(/só nasce com o período ABERTO/);
      // Inserir sem marcar nada, também (a vigente já existe, o período está FECHADO).
      await expect(emTransacao([inserir(2)])).rejects.toThrow();
      // Reabrir "na mão" (marcar + período ABERTO) e inserir uma versão que pula números: recusado pela versão.
      await expect(
        emTransacao([marcar, [`UPDATE "PeriodoApuracao" SET "status" = 'ABERTO', "fechadoEm" = NULL, "fechadoPorNome" = NULL WHERE "id" = $1`, periodoSet], inserir(999)]),
      ).rejects.toThrow(/versão da fotografia é a seguinte/);
      // Nasce vigente.
      await expect(
        emTransacao([marcar, [`UPDATE "PeriodoApuracao" SET "status" = 'ABERTO', "fechadoEm" = NULL, "fechadoPorNome" = NULL WHERE "id" = $1`, periodoSet], [`INSERT INTO "DreFotografia" ("id","parceiroId","periodoId","versao","inicio","fim","nomeDoPeriodo","fechadoPorNome","versaoDaConta","entrada","ressalvas","substituidaEm") VALUES ('falsa-s', $1, $2, 2, '2026-09-01', '2026-09-30', 'Setembro de 2026', 'Falsa', 1, '{}'::jsonb, '[]'::jsonb, now())`, A.id, periodoSet]]),
      ).rejects.toThrow(/nasce vigente/);
      // Nada mudou: a verdadeira segue vigente, o período FECHADO, e o DRE lê a verdadeira.
      expect((await a.dreFotografia.findUnique({ where: { id: foto } }))!.substituidaEm).toBeNull();
      expect(await a.dreFotografia.count({ where: { periodoId: periodoSet } })).toBe(1);
      expect((await periodo('2026-09-01'))!.status).toBe('FECHADO');
      expect((await dre(DONA(), { tipo: 'rede' }, '2026-09-10'))!.status).toBe('FECHADO');
    });

    it('o UPDATE solto FECHADO → ABERTO (sem marcar a fotografia como substituída) e a fotografia vigente num período que não fechou são recusados no commit; reabrir pelo sistema continua passando', async () => {
      const emTransacao = (passos: [string, ...unknown[]][]) =>
        db.$transaction(async (tx) => {
          if (perfil.rls) await tx.$queryRaw`SELECT set_config('app.parceiro_id', ${A.id}, true), set_config('role', 'erp_tenant', true)`;
          for (const [sql, ...valores] of passos) await tx.$executeRawUnsafe(sql, ...valores);
        });
      // Como o papel do tenant: só mudar o status. A fotografia segue vigente, o período ficaria ABERTO: recusado.
      await expect(emTransacao([[`UPDATE "PeriodoApuracao" SET "status" = 'ABERTO', "fechadoEm" = NULL, "fechadoPorNome" = NULL WHERE "id" = $1`, periodoSet]])).rejects.toThrow(/período ABERTO com fotografia vigente/);
      expect((await periodo('2026-09-01'))!.status).toBe('FECHADO');
      expect(await a.historicoAlteracao.count({ where: { entidade: 'PeriodoApuracao', entidadeId: periodoSet, acao: 'REABRIU' } })).toBe(0);
      // A fotografia vigente que nasce num período que não vira FECHADO na mesma transação (abril foi reaberto): recusada no commit.
      const abril = (await periodo('2026-04-01'))!;
      expect(abril.status).toBe('ABERTO');
      await expect(a.transacao((tx) => gravarFotografia(tx, { periodoId: abril.id, inicio: '2026-04-01', fim: '2026-04-30', nomeDoPeriodo: 'Abril de 2026', fechadoPorNome: 'X', taxa: null, entrada: {}, ressalvas: [], justificativa: null, linhas: [] }, 2))).rejects.toThrow(/período ABERTO com fotografia vigente/);
      expect(await a.dreFotografia.count({ where: { periodoId: abril.id, versao: 2 } })).toBe(0);
      // O caminho legítimo segue: fechar (fotografia + FECHADO) e reabrir (substituída + ABERTO) na mesma transação.
      const dez = await a.transacao((tx) => criarPeriodoFechadoDeTeste(tx, { nome: 'Dezembro de 2025', inicio: '2025-12-01', fim: '2025-12-31' }));
      expect(dez.status).toBe('FECHADO');
      await reabrirPeriodoDeTeste(a, dez.id);
      expect((await a.periodoApuracao.findUnique({ where: { id: dez.id } }))!.status).toBe('ABERTO');
    });

    it('a fotografia e as linhas não se esvaziam por TRUNCATE (dono da tabela ou superusuário)', async () => {
      await expect(db.$executeRawUnsafe(`TRUNCATE "DreFotografiaLinha"`)).rejects.toThrow(/não se esvazia/);
      await expect(db.$executeRawUnsafe(`TRUNCATE "DreFotografia", "DreFotografiaLinha"`)).rejects.toThrow(/não se esvazia/);
      expect(await a.dreFotografiaLinha.count({ where: { fotografiaId: foto } })).toBeGreaterThan(0);
    });

    it('um parceiro não grava fotografia de período do outro (a FK composta recusa), nem a lê', async () => {
      await expect(
        b.transacao(async (tx) => {
          await gravarFotografia(tx, { periodoId: periodoSet, inicio: '2026-09-01', fim: '2026-09-30', nomeDoPeriodo: 'Setembro de 2026', fechadoPorNome: 'X', taxa: null, entrada: {}, ressalvas: [], justificativa: null, linhas: [] }, 7);
        }),
      ).rejects.toThrow();
      expect(await b.dreFotografia.count()).toBe(0);
      expect(await b.dreFotografiaLinha.count()).toBe(0);
      // Setembro do B não tem nada: nenhuma fotografia, nenhuma versão, e fechar é "nada a fechar".
      expect(await situacao('2026-09-01', N1(), b)).toMatchObject({ registro: null, fotografia: null, versoes: [] });
      expect(await fechar('2026-09-01', {}, N1(), b)).toMatchObject({ ok: false, duras: [{ codigo: 'REDE_SEM_LANCAMENTO' }] });
    });
  });

  // ================================================================ 8. reabrir (critério 16)
  describe('critério 16: reabrir só pelo nível 1, com motivo; fechar de novo é a versão 2', () => {
    it('a dona (rede, todas as permissões), o gerente e o operador recebem recusa; o período segue fechado', async () => {
      const foto = (await a.dreFotografia.findFirst({ where: { nomeDoPeriodo: 'Setembro de 2026', substituidaEm: null } }))!.id;
      for (const al of [DONA(), GERENTE_REDE(), GERENTE_VP(), OPERADOR()]) {
        const r = await reabrirPeriodo(a, al, { inicio: '2026-09-01', motivo: 'Preciso lançar uma nota', fotografia: foto }, 'Ana Dona');
        expect(r, al.nivel).toMatchObject({ ok: false, erro: expect.stringContaining('Só a FlowFoods reabre') });
      }
      expect((await periodo('2026-09-01'))!.status).toBe('FECHADO');
      expect(await a.dreFotografia.count({ where: { nomeDoPeriodo: 'Setembro de 2026', substituidaEm: { not: null } } })).toBe(0);
      // A tela do fechamento diz que só a FlowFoods reabre.
      expect((await situacao('2026-09-01', DONA()))!.podeReabrir).toBe(false);
      expect((await situacao('2026-09-01', N1()))!.podeReabrir).toBe(true);
    });

    it('a dona fecha (tem metas.editar e dre.ver na rede); o gerente e o operador não fecham nem abrem a tela', async () => {
      expect(await situacao('2026-09-01', DONA())).not.toBeNull();
      for (const al of [GERENTE_REDE(), GERENTE_VP(), OPERADOR(), propria(['metas.editar', 'lojas.ver'], 'rede'), propria(['dre.ver', 'lojas.ver'], 'rede')]) {
        expect(await situacao('2026-09-01', al)).toBeNull();
        expect(await fecharPeriodo(a, al, { inicio: '2026-04-01', ressalvas: [], justificativa: '' }, 'x', HOJE)).toMatchObject({ ok: false });
      }
      expect((await periodo('2026-04-01'))!.status).toBe('ABERTO');
    });

    it('motivo curto, fotografia que não é a vigente, período aberto e período que não existe são recusados', async () => {
      const foto = (await a.dreFotografia.findFirst({ where: { nomeDoPeriodo: 'Setembro de 2026', substituidaEm: null } }))!.id;
      expect(await reabrirPeriodo(a, N1(), { inicio: '2026-09-01', motivo: 'ab', fotografia: foto }, 'Rodolfo')).toMatchObject({ ok: false, erro: expect.stringContaining('3 letras') });
      expect(await reabrirPeriodo(a, N1(), { inicio: '2026-09-01', motivo: 'x'.repeat(201), fotografia: foto }, 'Rodolfo')).toMatchObject({ ok: false });
      expect(await reabrirPeriodo(a, N1(), { inicio: '2026-09-01', motivo: 'Motivo bom', fotografia: 'outra' }, 'Rodolfo')).toMatchObject({ ok: false, mudou: true });
      expect(await reabrirPeriodo(a, N1(), { inicio: '2026-04-01', motivo: 'Motivo bom', fotografia: foto }, 'Rodolfo')).toMatchObject({ ok: false, erro: expect.stringContaining('não está fechado') });
      expect(await reabrirPeriodo(a, N1(), { inicio: '2026-01-01', motivo: 'Motivo bom', fotografia: foto }, 'Rodolfo')).toMatchObject({ ok: false });
      expect(await reabrirPeriodo(a, N1(), { inicio: 'lixo', motivo: 'Motivo bom', fotografia: foto }, 'Rodolfo')).toMatchObject({ ok: false });
      expect((await periodo('2026-09-01'))!.status).toBe('FECHADO');
    });

    it('o nível 1 reabre com motivo: a despesa volta a poder ser lançada no período; fechar de novo grava a versão 2 e a 1 segue legível', async () => {
      const foto = (await a.dreFotografia.findFirst({ where: { nomeDoPeriodo: 'Setembro de 2026', substituidaEm: null } }))!.id;
      // Setembro fechado: despesa nele é recusada.
      const recusada = await lancarDespesa(a, DONA(), textos({ tipo: 'dia', dia: '15/09/2026', linha: 'diversas', descricao: 'Esquecida', valor: '50,00' }), 'Marina', HOJE);
      expect(recusada.ok).toBe(false);
      const v1 = (await dre(DONA(), { tipo: 'rede' }, '2026-09-10'))!;
      const r = await reabrirPeriodo(a, N1(), { inicio: '2026-09-01', motivo: 'Faltou lançar a despesa diversa de setembro', fotografia: foto }, 'Rodolfo Cavalcante');
      expect(r).toEqual({ ok: true, versao: 1 });
      const p = (await periodo('2026-09-01'))!;
      expect(p).toMatchObject({ status: 'ABERTO', fechadoEm: null, fechadoPorNome: null });
      const antiga = (await a.dreFotografia.findUnique({ where: { id: foto } }))!;
      expect(antiga).toMatchObject({ reabertaPorNome: 'Rodolfo Cavalcante', motivoReabertura: 'Faltou lançar a despesa diversa de setembro' });
      expect(antiga.substituidaEm).not.toBeNull();
      // Aberto: o DRE volta a ser ao vivo e a despesa entra.
      expect((await dre(DONA(), { tipo: 'rede' }, '2026-09-10'))!.status).toBe('ABERTO');
      const ok = await lancarDespesa(a, DONA(), textos({ tipo: 'dia', dia: '15/09/2026', linha: 'diversas', descricao: 'Esquecida', valor: '50,00' }), 'Marina', HOJE);
      expect(ok.ok).toBe(true);
      // Reabrir de novo (já está aberto): recusa.
      expect(await reabrirPeriodo(a, N1(), { inicio: '2026-09-01', motivo: 'Motivo bom', fotografia: foto }, 'Rodolfo')).toMatchObject({ ok: false });
      // Fecha de novo: versão 2, com a despesa nova.
      const f2 = await fechar('2026-09-01');
      expect(f2).toEqual({ ok: true, versao: 2, jaFechado: false, ressalvas: 0 });
      const v2 = (await dre(DONA(), { tipo: 'rede' }, '2026-09-10'))!;
      expect(v2.fechamento!.versao).toBe(2);
      expect(linha(v2, 'diversas').valorCentavos).toBe(5000);
      expect(linha(v1, 'diversas').valorCentavos).toBe(0);
      expect(v2.resultado.receitaBrutaCentavos).toBe(v1.resultado.receitaBrutaCentavos);
      // As duas versões ficam legíveis, a vigente é a 2.
      const s = (await situacao('2026-09-01'))!;
      expect(s.versoes.map((x) => [x.versao, x.substituidaEm !== null])).toEqual([[2, false], [1, true]]);
      expect(s.versoes[1].linhas.find((l) => l.lojaId === null && l.chave === 'diversas')!.valorCentavos).toBe(0);
      expect(s.versoes[1]).toMatchObject({ reabertaPorNome: 'Rodolfo Cavalcante', motivoReabertura: 'Faltou lançar a despesa diversa de setembro' });
      // Histórico: REABRIU (antes Fechado v1 com receita e resultado; depois Aberto, com o motivo) e FECHOU (antes v1, depois v2).
      const h = await historicoDe('PeriodoApuracao');
      const reabriu = h.find((x) => x.acao === 'REABRIU')!;
      expect(reabriu.motivo).toBe('Faltou lançar a despesa diversa de setembro');
      expect(reabriu.mudancas.map((m) => `${m.campo}: ${m.antes ?? '—'} → ${m.depois}`)).toEqual(expect.arrayContaining([expect.stringContaining('situação: Fechado → Aberto')]));
      const fechou2 = h.find((x) => x.acao === 'FECHOU' && x.mudancas.some((m) => m.campo === 'versão do fechamento' && m.depois === '2'))!;
      expect(fechou2.mudancas.find((m) => m.campo === 'versão do fechamento')).toMatchObject({ antes: '1', depois: '2' });
    });

    it('reabrir × reabrir e fechar × reabrir em paralelo: um vence, o outro recebe recusa', async () => {
      const foto = (await a.dreFotografia.findFirst({ where: { nomeDoPeriodo: 'Setembro de 2026', substituidaEm: null } }))!.id;
      const rs = await Promise.all([1, 2].map(() => reabrirPeriodo(a, N1(), { inicio: '2026-09-01', motivo: 'Dois reabrindo juntos', fotografia: foto }, 'Rodolfo')));
      expect(rs.filter((x) => x.ok)).toHaveLength(1);
      expect(rs.filter((x) => !x.ok)).toHaveLength(1);
      // Fecha de novo (versão 3) para deixar setembro fechado para os outros testes.
      expect(await fechar('2026-09-01')).toMatchObject({ ok: true, versao: 3 });
    });

    it('o histórico do fechamento e das metas não vaza para quem não tem dre.ver', async () => {
      const so = await listarHistorico(a, { verPrecos: false, limite: 200 });
      expect(so.filter((x) => ['PeriodoApuracao', 'DreFotografia', 'DreMeta'].includes(x.entidade))).toEqual([]);
      void SO_HISTORICO;
    });
  });

  // ================================================================ 9. estoque: o fechamento de estoque × o DRE (critérios 8, 9, 10, 12)
  describe('estoque: o fechamento do estoque e o período fechado', () => {
    const agoraAbertura = new Date('2026-08-20T15:00:00Z');
    let setembroDeE: string;

    it('prepara: estoque aberto em 20/08, faturamento de setembro completo', async () => {
      const i = await cadastrarInsumo(e, { tipo: 'INGREDIENTE', escala: 'base', nome: 'Presunto', unidade: 'KG', conteudo: '1', preco: '30,00', conservacao: 'REFRIGERADO' });
      if (!i.ok) throw new Error(JSON.stringify(i));
      expect((await iniciarAbertura(e, DONA(), ids.est, 'Marina', agoraAbertura)).ok).toBe(true);
      const ab = (await obterContagemDeAbertura(e, DONA(), ids.est))!;
      for (const item of ab.itens) expect((await contarItem(e, DONA(), ids.est, { itemId: item.id, embalagens: '', solto: '4', escala: 'base', versao: item.versao }, 'Marina', { agora: agoraAbertura })).ok).toBe(true);
      const v = (await e.contagem.findFirst({ where: { lojaId: ids.est, tipo: 'ABERTURA' }, select: { versao: true } }))!.versao;
      expect((await concluirAbertura(e, DONA(), ids.est, { versao: v, confirmarNaoContados: false }, 'Marina', agoraAbertura)).ok).toBe(true);
      await e.loja.update({ where: { id: ids.est }, data: { canaisDeVenda: ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'] } });
      for (const d of diasDe('2026-09')) expect((await lancarDiaDe(e, ids.est, d, [canal('LOJA', '100,00', '2'), canal('DELIVERY_PROPRIO', '', '', true), canal('IFOOD', '', '', true)])).ok, d).toBe(true);
    });

    it('critério 9: loja com estoque aberto e sem o fechamento aplicado é ressalva, não trava; sem marcar, recusa', async () => {
      const s = (await situacao('2026-09-01', N1(), e))!;
      expect(s.condicoes!.duras).toEqual([]);
      expect(s.condicoes!.ressalvas).toMatchObject([{ id: `estoque:${ids.est}`, tipo: 'ESTOQUE', lojaNome: 'Loja do Estoque', detalhe: expect.stringContaining('“não apurado”') }]);
      expect(await fechar('2026-09-01', { impressao: s.condicoes!.impressao }, N1(), e)).toMatchObject({ ok: false, erro: expect.stringContaining('Marque cada uma') });
      expect(await e.periodoApuracao.count()).toBe(0);
    });

    it('critério 8: fechamento de estoque EM ANDAMENTO trava (sem justificativa que valha); descartado, só sobra a ressalva', async () => {
      const ini = await iniciarFechamento(e, DONA(), ids.est, { inicio: '2026-09-01' }, 'Marina');
      if (!ini.ok) throw new Error(JSON.stringify(ini));
      const s = (await situacao('2026-09-01', N1(), e))!;
      expect(s.condicoes!.duras).toMatchObject([{ codigo: 'ESTOQUE_EM_ANDAMENTO', detalhe: expect.stringContaining('Loja do Estoque') }]);
      const r = await fechar('2026-09-01', { ressalvas: [`estoque:${ids.est}`], justificativa: 'Fecha assim mesmo, sem contar o estoque.' }, N1(), e);
      expect(r).toMatchObject({ ok: false, duras: [{ codigo: 'ESTOQUE_EM_ANDAMENTO' }] });
      expect((await e.periodoApuracao.findFirst({ where: { inicio: dia('2026-09-01') } }))!.status).toBe('ABERTO'); // ficou registrado pela contagem, nunca fechado
      expect(await descartarContagem(e, DONA(), ids.est, ini.id, 'Contamos o lugar errado', 'Marina')).toMatchObject({ ok: true });
      const depois = (await situacao('2026-09-01', N1(), e))!;
      expect(depois.condicoes!.duras).toEqual([]);
      expect(depois.condicoes!.ressalvas.map((x) => x.tipo)).toEqual(['ESTOQUE']);
    });

    it('fecha com a ressalva do estoque + justificativa; a lista fica na fotografia', async () => {
      const s = (await situacao('2026-09-01', N1(), e))!;
      const r = await fechar('2026-09-01', { ressalvas: [`estoque:${ids.est}`], justificativa: 'Faltou contar o estoque de setembro; a casa assume.', impressao: s.condicoes!.impressao }, N1(), e);
      expect(r).toEqual({ ok: true, versao: 1, jaFechado: false, ressalvas: 1 });
      setembroDeE = (await e.periodoApuracao.findFirst({ where: { inicio: dia('2026-09-01') } }))!.id;
      const d = (await dre(DONA(), { tipo: 'rede' }, '2026-09-10', e))!;
      expect(d.fechamento!.ressalvas.map((x) => x.id)).toEqual([`estoque:${ids.est}`]);
      expect(d.resultado.receitaBrutaCentavos).toBe(300_000);
    });

    it('critério 12: começar o fechamento do estoque de período fechado é recusado; aplicar também; descartar continua possível', async () => {
      expect(await iniciarFechamento(e, DONA(), ids.est, { inicio: '2026-09-01' }, 'Marina')).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/Setembro de 2026 já foi fechado no DRE/) } });
      // Uma contagem de fechamento que sobrou aberta (por exemplo, de antes do fechamento do DRE): não se aplica mais.
      const sobrou = await e.contagem.create({
        data: { parceiroId: E.id, lojaId: ids.est, periodoId: setembroDeE, tipo: 'FECHAMENTO', status: 'ABERTA', referenciaEm: dia('2026-09-30'), iniciadaPorNome: 'Marina', titulo: 'Fechamento · Setembro de 2026' },
      });
      const r = await concluirContagem(e, DONA(), ids.est, sobrou.id, { versao: 0, confirmarNaoContados: true }, 'Marina');
      expect(r).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/já foi fechado no DRE/) } });
      expect((await e.contagem.findUnique({ where: { id: sobrou.id } }))!.status).toBe('ABERTA');
      expect(await descartarContagem(e, DONA(), ids.est, sobrou.id, 'Sobrou de antes do fechamento', 'Marina')).toMatchObject({ ok: true });
      expect((await e.contagem.findUnique({ where: { id: sobrou.id } }))!.status).toBe('CANCELADA');
    });

    it('critério 10: começar o fechamento do estoque ESPERA o fechamento do DRE (trava exclusiva) e, depois dele, é recusado', async () => {
      const agora = new Date('2026-10-30T15:00:00Z');
      let terminou = false;
      let iniciar!: Promise<unknown>;
      await e.transacao(async (tx) => {
        await travarParaFechar(tx);
        iniciar = iniciarFechamento(e, DONA(), ids.est, { inicio: '2026-10-01' }, 'Marina', agora).then((x) => ((terminou = true), x));
        await new Promise((r) => setTimeout(r, 900));
        expect(terminou).toBe(false); // sem a trava compartilhada já teria criado a contagem de fechamento
        await criarPeriodoFechadoDeTeste(tx, { nome: 'Outubro de 2026', inicio: '2026-10-01', fim: '2026-10-31' });
      });
      expect(await iniciar).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/Outubro de 2026 já foi fechado no DRE/) } });
      expect(await e.contagem.count({ where: { tipo: 'FECHAMENTO', status: 'ABERTA' } })).toBe(0);
    });

    it('critério 10: aplicar o fechamento do estoque ESPERA o fechamento do DRE e, depois dele, é recusado (descartar ainda passa)', async () => {
      const agora = new Date('2026-09-03T15:00:00Z'); // atual: setembro; o anterior (agosto) ainda pode fechar o estoque
      const ini = await iniciarFechamento(e, DONA(), ids.est, { inicio: '2026-08-01' }, 'Marina', agora);
      if (!ini.ok) throw new Error(JSON.stringify(ini));
      const agosto = (await e.periodoApuracao.findFirst({ where: { inicio: dia('2026-08-01') } }))!;
      const versao = (await e.contagem.findUnique({ where: { id: ini.id } }))!.versao;
      let terminou = false;
      let concluir!: Promise<unknown>;
      await e.transacao(async (tx) => {
        await travarParaFechar(tx);
        concluir = concluirContagem(e, DONA(), ids.est, ini.id, { versao, confirmarNaoContados: true }, 'Marina', agora).then((x) => ((terminou = true), x));
        await new Promise((r) => setTimeout(r, 900));
        expect(terminou).toBe(false); // sem a trava, o fechamento do estoque teria sido aplicado antes do DRE fechar
        await gravarFotografia(tx, { periodoId: agosto.id, inicio: '2026-08-01', fim: '2026-08-31', nomeDoPeriodo: 'Agosto de 2026', fechadoPorNome: 'Teste', taxa: null, entrada: {}, ressalvas: [], justificativa: null, linhas: [] }, 1);
        await tx.periodoApuracao.update({ where: { id: agosto.id }, data: { status: 'FECHADO', fechadoEm: new Date(), fechadoPorNome: 'Teste' } });
      });
      expect(await concluir).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/Agosto de 2026 já foi fechado no DRE/) } });
      expect((await e.contagem.findUnique({ where: { id: ini.id } }))!.status).toBe('ABERTA');
      expect(await e.movimentoEstoque.count({ where: { contagemItem: { contagemId: ini.id } } })).toBe(0);
      expect(await descartarContagem(e, DONA(), ids.est, ini.id, 'Período já fechado no DRE', 'Marina')).toMatchObject({ ok: true });
    });

    it('a cíclica NÃO pega a trava (não cai em período): inicia e aplica enquanto o DRE fecha', async () => {
      let terminou = false;
      let ciclo!: Promise<unknown>;
      const { iniciarCiclo } = await import('@/lib/erp/contagem');
      const insumo = (await e.insumo.findFirst({ where: { nome: 'Presunto' } }))!.id;
      await e.transacao(async (tx) => {
        await travarParaFechar(tx);
        ciclo = iniciarCiclo(e, DONA(), ids.est, { insumoIds: [insumo], titulo: 'Ciclo durante o fechamento' }, 'Marina').then((x) => ((terminou = true), x));
        await new Promise((r) => setTimeout(r, 600));
      });
      expect(terminou).toBe(true); // não esperou
      const rc = await ciclo; expect(rc, JSON.stringify(rc)).toMatchObject({ ok: true });
    });
  });
});
