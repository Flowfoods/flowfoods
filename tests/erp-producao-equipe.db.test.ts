/**
 * ERP 3.3 · a cozinha pega a tarefa, no Postgres de verdade:
 * - pegar uma linha da lista de hoje = o lote dela nasce pela regra do "Gerar" (3.2/3.1, com a requisição; nada no livro) e já
 *   sai com quem pegou e a hora; duplo toque = o mesmo lote; duas pessoas na mesma linha (em paralelo) = um lote, uma pega e
 *   a outra lê "Caio Cozinha pegou às…"; a linha que a gerência mudou é conflito;
 * - pegar um lote planejado (Nova produção) = começar; duas pessoas juntas: uma só; o lote com outra pessoa não se pega;
 * - soltar: quem pegou ou a gerência, com motivo; passar: só a gerência, para quem registra produção na loja, com motivo;
 * - concluir e cancelar o lote de outra pessoa: só ela ou a gerência; quem pegou fica como "quem fez" (até se a gerência
 *   concluir); sem segunda baixa: pegar, soltar e passar não tocam no livro, e a entrega da requisição baixa uma vez;
 * - alcance e isolamento: gerente de outra loja, outro parceiro, quem só vê produção, o nível 1 (não pega; começa sem dono);
 * - histórico da produção (sem R$ para quem não vê custos) e indicadores por pessoa (só a gerência);
 * - o banco recusa (SQL cru, no contexto do parceiro): dono em lote planejado, dono sem pessoa, troca de dono no concluído;
 * - período fechado (mutante): pegar da lista ESPERA o fechamento e é recusado; o lote que já existe ainda se pega.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff npx vitest run tests/erp-producao-equipe.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarInsumo } from '@/lib/erp/insumos';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { cadastrarFicha } from '@/lib/erp/fichas';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { concluirAbertura, contarItem, iniciarAbertura, obterContagemDeAbertura } from '@/lib/erp/estoque';
import { atenderRequisicao, obterRequisicao } from '@/lib/erp/requisicao';
import { cancelarProducao, concluirProducao, estornarProducao, listaDaProducao, obterOrdem, passarProducao, pegarProducao, planejarProducao, quadroDaProducao, soltarProducao, NIVEL1_NAO_PEGA } from '@/lib/erp/producao';
import { obterListaDoDia, pegarDaLista, salvarListaDoDia } from '@/lib/erp/producao-lista';
import { historicoDaProducao, indicadoresDaProducao, lojasDaEquipe, tarefasDoDia } from '@/lib/erp/producao-equipe';
import { listarHistorico } from '@/lib/erp/historico';
import { travarParaFechar } from '@/lib/erp/periodo-trava';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance, type Permissao } from '@/lib/erp/permissoes';
import { criarPeriodoFechadoDeTeste, cru, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const DIA = 86_400_000;
const GIL = { nome: 'Gil Gerente', userId: 'u-gil' };
const CAIO = { nome: 'Caio Cozinha', userId: 'u-caio' };
const DUDA = { nome: 'Duda Lima', userId: 'u-duda' };
const RODOLFO = { nome: 'Rodolfo (FlowFoods)', userId: 'user-n1' };
const PESSOAS = [
  { usuarioId: 'u-caio', nome: 'Caio Cozinha' },
  { usuarioId: 'u-duda', nome: 'Duda Lima' },
  { usuarioId: 'u-gil', nome: 'Gil Gerente' },
];
/** Quem pode receber: a lista da tela e a releitura na gravação (aqui, a mesma lista; o teste da releitura troca). */
const RECEBEM = { pessoas: PESSOAS, aindaPode: async (id: string) => PESSOAS.some((p) => p.usuarioId === id) };
/** Os logins da equipe do parceiro (`idsDaEquipe`): o nível 1 (`user-n1`) não está. */
const EQUIPE: ReadonlySet<string> = new Set(PESSOAS.map((p) => p.usuarioId));

describe.skipIf(!URL_TESTE)('ERP 3.3 · a cozinha pega a tarefa (Postgres real)', { timeout: 240_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `e${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string };
  let B: { id: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const ids: Record<string, string> = {};
  const hoje = hojeNoRio();

  const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR' | null, lojaIds: string[] | 'rede', proprio: Permissao[] | null = null): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: proprio, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const DONA = () => alcanceDe('DONO', 'rede');
  const GERENTE = () => alcanceDe('GERENTE', [ids.vp]);
  const OPERADOR = () => alcanceDe('OPERADOR', [ids.vp]);
  const GERENTE_DELIVERY = () => alcanceDe('GERENTE', [ids.delivery]);
  // Cozinha sem custos (registra produção, não vê insumos nem custos).
  const COZINHA_SEM_CUSTO = () => alcanceDe(null, [ids.vp], ['producao.ver', 'producao.registrar']);
  // Só vê a produção (não registra).
  const SO_VE = () => alcanceDe(null, [ids.vp], ['producao.ver']);

  let envio = 0;
  const novoEnvio = () => `envio-${sufixo}-${++envio}`.padEnd(12, 'x');
  const planejar = async (fichaId: string, qtd: string) => {
    const lista = await listaDaProducao(a, GERENTE(), ids.vp, fichaId, qtd);
    if (!lista.ok) throw new Error(JSON.stringify(lista));
    const r = await planejarProducao(a, GERENTE(), ids.vp, { fichaId, quantidade: qtd, paraDia: 'hoje', observacao: '', linhas: lista.linhas, envio: novoEnvio() }, GIL);
    if (!r.ok) throw new Error(JSON.stringify(r));
    return r.id;
  };
  const lote = async (id: string, alcance: Alcance = DONA(), eu: string | null = null) => (await obterOrdem(a, alcance, ids.vp, id, new Date(), eu))!;
  const versao = async (id: string) => (await lote(id)).ordem.versao;
  const ordem = (id: string) => a.ordemProducao.findFirst({ where: { id }, select: { status: true, responsavelUsuarioId: true, responsavelNomeSnapshot: true, responsavelDesde: true, iniciadaPorNome: true, concluidaPorNome: true, versao: true } });
  const livro = () => a.movimentoEstoque.count({ where: { tipo: { notIn: ['ABERTURA'] } } });
  const entregarTudo = async (id: string) => {
    const l = await lote(id);
    const r = (await obterRequisicao(a, DONA(), ids.vp, l.requisicao!.id))!;
    return atenderRequisicao(
      a,
      GERENTE(),
      ids.vp,
      r.requisicao.id,
      { versao: r.requisicao.versao, linhas: r.itens.map((i) => ({ itemId: i.id, quantidade: String(i.faltaMilesimos / 1000).replace('.', ','), escala: 'base' })), encerrar: false, confirmarNegativo: true },
      'Edu Estoque',
    );
  };
  const concluir = async (id: string, alcance: Alcance, autor: typeof CAIO, produzido = '4,6', motivo = '') =>
    concluirProducao(a, alcance, ids.vp, id, { versao: await versao(id), produzido, escala: 'base', motivo, conservacao: '' }, autor);
  const linhaDe = async (nome: string) => {
    const l = (await obterListaDoDia(a, DONA(), ids.vp, hoje))!;
    return l.linhas.find((x) => x.nome === nome && x.estado === 'NA_LISTA')!;
  };
  const pegarLinha = async (nome: string, alcance: Alcance, autor: typeof CAIO) => {
    const l = await linhaDe(nome);
    return pegarDaLista(a, alcance, ids.vp, { linha: l.id, ficha: l.fichaId, quantidade: String(l.quantidadeMilesimos) }, autor);
  };

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Equipe A', slug: `equipe-a-${sufixo}`, status: 'ATIVO' } });
    B = await db.parceiroFlow.create({ data: { nome: 'Equipe B', slug: `equipe-b-${sufixo}`, status: 'ATIVO' } });
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    await a.regraDoPeriodo.create({ data: { parceiroId: A.id, vigenteDesde: new Date('2020-01-01T00:00:00Z'), tipo: 'MENSAL', diaInicio: 1, criadoPorNome: 'teste' } });
    for (const [chave, nome] of [['vp', 'Vila da Penha'], ['delivery', 'Delivery']] as const) {
      const r = await cadastrarLoja(a, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
    }
    const lb = await cadastrarLoja(b, { nome: 'Loja B' }, 'Bia');
    if (!lb.ok) throw new Error(JSON.stringify(lb));
    ids.lojaB = lb.id;
    for (const [chave, campos] of Object.entries({
      cheddar: { nome: 'Queijo cheddar', unidade: 'KG', conteudo: '1', preco: '40,00', conservacao: 'REFRIGERADO' },
      leite: { nome: 'Leite', unidade: 'L', conteudo: '1', preco: '5,00', conservacao: 'REFRIGERADO' },
      cebola: { nome: 'Cebola', unidade: 'KG', conteudo: '1', preco: '6,00', conservacao: 'SECO' },
      oleo: { nome: 'Óleo', unidade: 'L', conteudo: '1', preco: '9,00', conservacao: 'SECO' },
    })) {
      const r = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', ...campos });
      if (!r.ok) throw new Error(`${chave}: ${JSON.stringify(r)}`);
      ids[chave] = r.id;
    }
    // A Penha abriu o estoque há 10 dias com folga de tudo. A Delivery não abriu.
    const antes = new Date(Date.now() - 10 * DIA);
    expect((await iniciarAbertura(a, DONA(), ids.vp, 'Marina', antes)).ok).toBe(true);
    const ab = (await obterContagemDeAbertura(a, DONA(), ids.vp))!;
    for (const i of ab.itens) {
      const r = await contarItem(a, DONA(), ids.vp, { itemId: i.id, embalagens: '', solto: '100', escala: 'base', versao: i.versao }, 'Marina', { agora: antes });
      expect(r.ok).toBe(true);
    }
    const v = (await a.contagem.findFirst({ where: { lojaId: ids.vp, tipo: 'ABERTURA' }, select: { versao: true } }))!.versao;
    expect((await concluirAbertura(a, DONA(), ids.vp, { versao: v, confirmarNaoContados: false }, 'Marina', antes)).ok).toBe(true);
    const ficha = async (chave: string, entrada: Parameters<typeof cadastrarFicha>[1]) => {
      const f = await cadastrarFicha(a, entrada, { tipo: 'manter' }, 'Marina');
      if (!f.ok) throw new Error(`${chave}: ${JSON.stringify(f)}`);
      ids[chave] = f.id;
    };
    const validade = { principal: 'REFRIGERADO', linhas: { REFRIGERADO: { marcada: true, quantidade: '3', em: 'dias' } } };
    await ficha('molho', { nome: 'Molho cheddar', tipo: 'PRE_PREPARO', rendimento: '2', rendimentoUnidade: 'kg', itens: [{ insumoId: ids.cheddar, quantidade: '1', unidade: 'kg' }, { insumoId: ids.leite, quantidade: '1', unidade: 'L' }, { insumoId: ids.cebola, quantidade: '300', unidade: 'g', fator: '1,18' }], validade } as never);
    await ficha('base', { nome: 'Base de cebola', tipo: 'PRE_PREPARO', rendimento: '1', rendimentoUnidade: 'kg', itens: [{ insumoId: ids.cebola, quantidade: '1', unidade: 'kg', fator: '1,18' }, { insumoId: ids.oleo, quantidade: '100', unidade: 'ml' }], validade } as never);
    // A lista de hoje (a gerência): molho cheddar 5 kg e base de cebola 2 kg.
    expect(await salvarListaDoDia(a, GERENTE(), ids.vp, { dia: hoje, versao: '', linhaIds: ['', ''], fichaIds: [ids.molho, ids.base], quantidades: ['5', '2'] }, GIL)).toMatchObject({ ok: true });
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
  });

  it('a tela da cozinha: as duas linhas da lista de hoje para pegar; ninguém com nada; a lista ainda sem lote', async () => {
    const t = (await tarefasDoDia(a, OPERADOR(), ids.vp, CAIO.userId))!;
    expect(t.aberto).toBe(true);
    expect(t.periodoFechado).toBeNull();
    expect(t.paraPegar.map((x) => (x.tipo === 'LINHA' ? [x.tipo, x.nome, x.quantidadeMilesimos, x.disponivel] : [x.tipo, x.nome]))).toEqual([
      ['LINHA', 'Molho cheddar', 5000, true],
      ['LINHA', 'Base de cebola', 2000, true],
    ]);
    expect([t.comigo, t.comOutros, t.feitasHoje]).toEqual([[], [], []]);
    expect(t.pode).toEqual({ pegar: true, gerenciar: false });
    expect(t.naoGeraLinha).toBeNull();
    expect((await tarefasDoDia(a, GERENTE(), ids.vp, GIL.userId))!.pode).toEqual({ pegar: true, gerenciar: true });
    // Nível 1: vê, não pega.
    expect((await tarefasDoDia(a, ALCANCE_FLOWFOODS, ids.vp, null))!.pode).toEqual({ pegar: false, gerenciar: true });
    expect(await lojasDaEquipe(a, OPERADOR(), 'producao.registrar')).toEqual([{ id: ids.vp, nome: 'Vila da Penha', paraPegar: 2, emProducao: 0 }]);
  });

  it('pegar da lista: o lote nasce pela regra do Gerar (requisição junto, nada no livro) e já sai com Caio e a hora; duplo toque = o mesmo lote', async () => {
    const antes = await livro();
    const r = await pegarLinha('Molho cheddar', OPERADOR(), CAIO);
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    ids.loteMolho = r.id;
    const o = (await ordem(r.id))!;
    expect(o).toMatchObject({ status: 'EM_EXECUCAO', responsavelUsuarioId: 'u-caio', responsavelNomeSnapshot: 'Caio Cozinha', iniciadaPorNome: 'Caio Cozinha' });
    expect(Date.now() - o.responsavelDesde!.getTime()).toBeLessThan(60_000);
    const l = await lote(r.id, OPERADOR(), CAIO.userId);
    expect(l.requisicao).toMatchObject({ status: 'ABERTA' });
    expect(l.responsavel).toMatchObject({ nome: 'Caio Cozinha', comigo: true });
    expect((await lote(r.id, OPERADOR(), DUDA.userId)).responsavel!.comigo).toBe(false);
    expect(l.historico.map((h) => h.acao)).toEqual(['PEGOU', 'PLANEJOU']);
    expect(l.historico[0].mudancas).toEqual([
      { campo: 'quem faz', antes: 'ninguém', depois: 'Caio Cozinha' },
      { campo: 'situação', antes: 'Planejada', depois: 'Em produção' },
    ]);
    expect(await livro()).toBe(antes);
    // A linha da lista virou esse lote; o histórico da lista diz quem pegou.
    const lista = (await obterListaDoDia(a, DONA(), ids.vp, hoje))!;
    const linha = lista.linhas.find((x) => x.nome === 'Molho cheddar')!;
    expect(linha).toMatchObject({ estado: 'EM_LOTE', lote: { id: r.id, status: 'EM_EXECUCAO', responsavel: { nome: 'Caio Cozinha' } } });
    expect(lista.historico[0]).toMatchObject({ acao: 'GEROU_LOTES', autorNome: 'Caio Cozinha' });
    expect(lista.historico[0].mudancas).toEqual(expect.arrayContaining([{ campo: 'pego por', antes: null, depois: 'Caio Cozinha' }]));
    // Duplo toque (a tela ainda mostrava a linha): o mesmo lote, "já feito".
    expect(await pegarDaLista(a, OPERADOR(), ids.vp, { linha: linha.id, ficha: ids.molho, quantidade: '5000' }, CAIO)).toEqual({ ok: true, id: r.id, jaFeito: true });
    expect(await a.ordemProducao.count({ where: { fichaId: ids.molho } })).toBe(1);
    // Na tela da cozinha: o meu lote e a base para pegar.
    const t = (await tarefasDoDia(a, OPERADOR(), ids.vp, CAIO.userId))!;
    expect(t.comigo.map((x) => [x.nome, x.status, x.responsavel?.comigo])).toEqual([['Molho cheddar', 'EM_EXECUCAO', true]]);
    expect(t.paraPegar.map((x) => x.nome)).toEqual(['Base de cebola']);
    // Para a Duda, o molho está com outra pessoa.
    expect((await tarefasDoDia(a, OPERADOR(), ids.vp, DUDA.userId))!.comOutros.map((x) => [x.nome, x.responsavel?.nome, x.responsavel?.comigo])).toEqual([['Molho cheddar', 'Caio Cozinha', false]]);
    // O quadro de lotes mostra quem está fazendo.
    expect((await quadroDaProducao(a, OPERADOR(), ids.vp))!.colunas.EM_EXECUCAO.map((c) => c.responsavel?.nome)).toEqual(['Caio Cozinha']);
  });

  it('duas pessoas pegando a mesma linha ao mesmo tempo: um lote só, uma pega e a outra lê quem pegou', async () => {
    const l = await linhaDe('Base de cebola');
    const pegar = (autor: typeof CAIO) => pegarDaLista(a, OPERADOR(), ids.vp, { linha: l.id, ficha: l.fichaId, quantidade: String(l.quantidadeMilesimos) }, autor);
    const [x, y] = await Promise.all([pegar(CAIO), pegar(DUDA)]);
    const ganhou = [x, y].filter((r) => r.ok);
    const perdeu = [x, y].filter((r) => !r.ok);
    expect(ganhou).toHaveLength(1);
    expect(perdeu[0]).toMatchObject({ ok: false, conflito: true, erros: { geral: expect.stringMatching(/^Este lote está com (Caio Cozinha|Duda Lima) \(pegou às \d\d:\d\d\)\. Se for para você fazer, peça para a gerência passar o lote para você\.$/) } });
    expect(await a.ordemProducao.count({ where: { fichaId: ids.base } })).toBe(1);
    ids.loteBase = ganhou[0].ok ? ganhou[0].id : '';
    ids.donoBase = (await ordem(ids.loteBase))!.responsavelUsuarioId!;
  });

  it('a linha que a gerência mudou depois que a tela abriu é conflito (ninguém produz o que não viu)', async () => {
    // A gerência põe mais 1 kg de molho na lista (linha nova) e a muda para 3 kg antes de a cozinha pegar.
    let lista = (await obterListaDoDia(a, GERENTE(), ids.vp, hoje))!;
    expect(await salvarListaDoDia(a, GERENTE(), ids.vp, { dia: hoje, versao: String(lista.lista!.versao), linhaIds: [''], fichaIds: [ids.molho], quantidades: ['1'], vistas: '' }, GIL)).toMatchObject({ ok: true });
    const vista = await linhaDe('Molho cheddar');
    lista = (await obterListaDoDia(a, GERENTE(), ids.vp, hoje))!;
    expect(await salvarListaDoDia(a, GERENTE(), ids.vp, { dia: hoje, versao: String(lista.lista!.versao), linhaIds: [vista.id], fichaIds: [ids.molho], quantidades: ['3'], vistas: vista.id }, GIL)).toMatchObject({ ok: true });
    expect(await pegarDaLista(a, OPERADOR(), ids.vp, { linha: vista.id, ficha: ids.molho, quantidade: '1000' }, CAIO)).toMatchObject({ ok: false, conflito: true, erros: { geral: 'A gerência mudou Molho cheddar na lista agora há pouco. Confira as tarefas de novo; nada foi gravado.' } });
    expect(await pegarDaLista(a, OPERADOR(), ids.vp, { linha: 'naoexiste', ficha: ids.molho, quantidade: '3000' }, CAIO)).toMatchObject({ ok: false, conflito: true });
    // Com o que está na lista agora, pega.
    const r = await pegarDaLista(a, OPERADOR(), ids.vp, { linha: vista.id, ficha: ids.molho, quantidade: '3000' }, DUDA);
    expect(r).toMatchObject({ ok: true });
    ids.loteMolho2 = r.ok ? r.id : '';
  });

  it('pegar um lote planejado (Nova produção): duas pessoas juntas, uma só; o lote com outra pessoa não se pega; quem só vê não pega', async () => {
    ids.lotePlanejado = await planejar(ids.molho, '2');
    const v = await versao(ids.lotePlanejado);
    const [x, y] = await Promise.all([pegarProducao(a, OPERADOR(), ids.vp, ids.lotePlanejado, { versao: v }, CAIO), pegarProducao(a, OPERADOR(), ids.vp, ids.lotePlanejado, { versao: v }, DUDA)]);
    expect([x, y].filter((r) => r.ok && !r.jaFeito)).toHaveLength(1);
    const perdeu = [x, y].find((r) => !r.ok)!;
    expect(perdeu).toMatchObject({ ok: false, conflito: true });
    const dono = (await ordem(ids.lotePlanejado))!.responsavelUsuarioId;
    const outro = dono === 'u-caio' ? DUDA : CAIO;
    const mesmo = dono === 'u-caio' ? CAIO : DUDA;
    // O dono de novo: "já feito"; o outro, depois: "está com …".
    expect(await pegarProducao(a, OPERADOR(), ids.vp, ids.lotePlanejado, { versao: v }, mesmo)).toMatchObject({ ok: true, jaFeito: true });
    expect(await pegarProducao(a, OPERADOR(), ids.vp, ids.lotePlanejado, { versao: await versao(ids.lotePlanejado) }, outro)).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(new RegExp(`^Este lote está com ${mesmo.nome}`)) } });
    expect(await pegarProducao(a, SO_VE(), ids.vp, ids.lotePlanejado, { versao: v }, outro)).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/registrar produção/) } });
    ids.donoPlanejado = dono!;
  });

  it('soltar: só quem pegou ou a gerência, com motivo; o lote fica em produção, sem ninguém, e volta para pegar', async () => {
    const id = ids.loteMolho;
    const antes = await livro();
    expect(await soltarProducao(a, OPERADOR(), ids.vp, id, { versao: await versao(id), motivo: 'acabou meu turno' }, DUDA)).toMatchObject({ ok: false, erros: { geral: 'Este lote está com Caio Cozinha: só Caio Cozinha ou a gerência solta.' } });
    expect(await soltarProducao(a, OPERADOR(), ids.vp, id, { versao: await versao(id), motivo: '' }, CAIO)).toMatchObject({ ok: false, erros: { motivo: expect.stringMatching(/motivo/) } });
    expect(await soltarProducao(a, OPERADOR(), ids.vp, id, { versao: (await versao(id)) - 1, motivo: 'acabou meu turno' }, CAIO)).toMatchObject({ ok: false, conflito: true });
    expect(await soltarProducao(a, OPERADOR(), ids.vp, id, { versao: await versao(id), motivo: 'acabou meu turno' }, CAIO)).toMatchObject({ ok: true });
    expect(await ordem(id)).toMatchObject({ status: 'EM_EXECUCAO', responsavelUsuarioId: null, responsavelNomeSnapshot: null, responsavelDesde: null });
    expect(await soltarProducao(a, OPERADOR(), ids.vp, id, { versao: await versao(id), motivo: 'de novo' }, CAIO)).toMatchObject({ ok: true, jaFeito: true });
    const h = (await lote(id)).historico[0];
    expect(h).toMatchObject({ acao: 'SOLTOU', motivo: 'acabou meu turno', autorNome: 'Caio Cozinha' });
    expect(h.mudancas).toEqual([{ campo: 'quem faz', antes: 'Caio Cozinha', depois: 'ninguém (voltou para pegar)' }]);
    expect((await tarefasDoDia(a, OPERADOR(), ids.vp, DUDA.userId))!.paraPegar.some((x) => x.tipo === 'LOTE' && x.id === id)).toBe(true);
    // A gerência solta o de qualquer pessoa.
    expect(await soltarProducao(a, GERENTE(), ids.vp, ids.lotePlanejado, { versao: await versao(ids.lotePlanejado), motivo: 'vai para o salão' }, GIL)).toMatchObject({ ok: true });
    expect(await livro()).toBe(antes);
  });

  it('passar: só a gerência, para quem registra produção na loja, com motivo; o planejado não se passa; a hora de quem recebe começa agora', async () => {
    const id = ids.loteMolho;
    const v = await versao(id);
    expect(await passarProducao(a, OPERADOR(), ids.vp, id, { versao: v, motivo: 'troca', para: 'u-duda' }, RECEBEM, CAIO)).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/definir a lista do dia/) } });
    expect(await passarProducao(a, GERENTE(), ids.vp, id, { versao: v, motivo: 'troca', para: 'u-fora' }, RECEBEM, GIL)).toMatchObject({ ok: false, erros: { para: expect.stringMatching(/Escolha uma pessoa/) } });
    expect(await passarProducao(a, GERENTE(), ids.vp, id, { versao: v, motivo: '', para: 'u-duda' }, RECEBEM, GIL)).toMatchObject({ ok: false, erros: { motivo: expect.any(String) } });
    const antes = Date.now();
    expect(await passarProducao(a, GERENTE(), ids.vp, id, { versao: v, motivo: 'Caio foi para a chapa', para: 'u-duda' }, RECEBEM, GIL)).toMatchObject({ ok: true });
    const o = (await ordem(id))!;
    expect(o).toMatchObject({ status: 'EM_EXECUCAO', responsavelUsuarioId: 'u-duda', responsavelNomeSnapshot: 'Duda Lima' });
    expect(o.responsavelDesde!.getTime()).toBeGreaterThanOrEqual(antes - 5);
    expect(await passarProducao(a, GERENTE(), ids.vp, id, { versao: await versao(id), motivo: 'de novo', para: 'u-duda' }, RECEBEM, GIL)).toMatchObject({ ok: true, jaFeito: true });
    const h = (await lote(id)).historico[0];
    expect(h).toMatchObject({ acao: 'REATRIBUIU', motivo: 'Caio foi para a chapa', autorNome: 'Gil Gerente' });
    expect(h.mudancas).toEqual([{ campo: 'quem faz', antes: 'ninguém', depois: 'Duda Lima' }]);
    // O lote planejado ninguém pegou: não se passa.
    const novo = await planejar(ids.base, '1');
    expect(await passarProducao(a, GERENTE(), ids.vp, novo, { versao: await versao(novo), motivo: 'é seu', para: 'u-caio' }, RECEBEM, GIL)).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/ainda não começou: quem vai fazer pega pela tela da cozinha/) } });
    ids.loteParaCancelar = novo;
  });

  it('concluir e cancelar o lote de outra pessoa: só ela ou a gerência; quem pegou fica como quem fez; sem segunda baixa', async () => {
    const id = ids.loteMolho; // com a Duda
    expect((await entregarTudo(id)).ok).toBe(true);
    const baixas = await a.movimentoEstoque.count({ where: { tipo: 'REQUISICAO' } });
    expect(await concluir(id, OPERADOR(), CAIO)).toMatchObject({ ok: false, conflito: true, erros: { geral: expect.stringMatching(/^Este lote está com Duda Lima \(pegou às \d\d:\d\d\)\. Só Duda Lima ou a gerência conclui\./) } });
    expect(await cancelarProducao(a, OPERADOR(), ids.vp, id, { versao: await versao(id), motivo: 'não precisa' }, CAIO)).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/Só Duda Lima ou a gerência cancela/) } });
    // A gerência conclui por ela: a Duda fica como quem fez; quem concluiu é o Gil.
    expect(await concluir(id, GERENTE(), GIL)).toMatchObject({ ok: true });
    expect(await ordem(id)).toMatchObject({ status: 'CONCLUIDA', responsavelUsuarioId: 'u-duda', responsavelNomeSnapshot: 'Duda Lima', concluidaPorNome: 'Gil Gerente' });
    const l = await lote(id);
    expect(l.ordem.feitoPor).toBe('Duda Lima');
    expect(l.historico[0].mudancas).toEqual(expect.arrayContaining([{ campo: 'quem fez', antes: null, depois: 'Duda Lima' }]));
    // Uma entrada de lote, nenhuma baixa a mais (a entrega já tinha baixado).
    expect(await a.movimentoEstoque.count({ where: { tipo: 'REQUISICAO' } })).toBe(baixas);
    expect(await a.movimentoEstoque.count({ where: { tipo: 'PRODUCAO_ENTRADA', ordemProducaoId: id } })).toBe(1);
    // O concluído não troca de dono (regra e gatilho).
    expect(await soltarProducao(a, GERENTE(), ids.vp, id, { versao: await versao(id), motivo: 'teste' }, GIL)).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/já foi concluído/) } });
    // A base com quem pegou: a própria pessoa conclui (perdeu o lote: 0 com motivo).
    const base = ids.loteBase;
    const dono = ids.donoBase === 'u-caio' ? CAIO : DUDA;
    expect((await entregarTudo(base)).ok).toBe(true);
    expect(await concluir(base, OPERADOR(), dono, '0', 'caiu no chão')).toMatchObject({ ok: true });
    expect(await ordem(base)).toMatchObject({ responsavelUsuarioId: dono.userId, concluidaPorNome: dono.nome });
    // O lote que ninguém pegou, cancelado pela cozinha (sem dono, qualquer um que registra cancela).
    expect(await cancelarProducao(a, OPERADOR(), ids.vp, ids.loteParaCancelar, { versao: await versao(ids.loteParaCancelar), motivo: 'sobrou de ontem' }, CAIO)).toMatchObject({ ok: true });
  });

  it('o nível 1 não pega (nem da lista); começar um planejado fica sem dono, como na 3.1; concluir sem dono não deixa "quem fez"', async () => {
    const t = (await tarefasDoDia(a, ALCANCE_FLOWFOODS, ids.vp, null))!;
    const linha = t.paraPegar.find((x) => x.tipo === 'LINHA');
    expect(linha).toBeUndefined();
    expect(await pegarDaLista(a, ALCANCE_FLOWFOODS, ids.vp, { linha: 'x', ficha: ids.molho, quantidade: '1000' }, RODOLFO)).toMatchObject({ ok: false, erros: { geral: NIVEL1_NAO_PEGA } });
    const id = await planejar(ids.base, '1');
    expect(await pegarProducao(a, ALCANCE_FLOWFOODS, ids.vp, id, { versao: await versao(id) }, RODOLFO)).toMatchObject({ ok: true });
    expect(await ordem(id)).toMatchObject({ status: 'EM_EXECUCAO', responsavelUsuarioId: null, responsavelDesde: null, iniciadaPorNome: 'Rodolfo (FlowFoods)' });
    expect((await lote(id)).historico[0].acao).toBe('INICIOU');
    expect((await entregarTudo(id)).ok).toBe(true);
    expect(await concluir(id, ALCANCE_FLOWFOODS, RODOLFO, '1')).toMatchObject({ ok: true });
    expect(await ordem(id)).toMatchObject({ status: 'CONCLUIDA', responsavelUsuarioId: null, responsavelNomeSnapshot: null, concluidaPorNome: 'Rodolfo (FlowFoods)' });
    // E a pessoa que conclui sem pegar fica como quem fez (o caminho da 3.1).
    const id2 = await planejar(ids.base, '1');
    expect((await entregarTudo(id2)).ok).toBe(true);
    expect(await concluir(id2, OPERADOR(), CAIO, '1')).toMatchObject({ ok: true });
    expect(await ordem(id2)).toMatchObject({ responsavelUsuarioId: 'u-caio', responsavelNomeSnapshot: 'Caio Cozinha', responsavelDesde: null });
  });

  it('alcance e isolamento: gerente de outra loja e outro parceiro não enxergam; loja sem estoque não gera lote da lista', async () => {
    expect(await tarefasDoDia(a, GERENTE_DELIVERY(), ids.vp, GIL.userId)).toBeNull();
    expect(await pegarProducao(a, GERENTE_DELIVERY(), ids.vp, ids.lotePlanejado, { versao: 0 }, GIL)).toMatchObject({ ok: false, naoEncontrado: true });
    expect(await tarefasDoDia(b, DONA(), ids.vp, GIL.userId)).toBeNull();
    expect(await pegarProducao(b, DONA(), ids.vp, ids.lotePlanejado, { versao: 0 }, GIL)).toMatchObject({ ok: false, naoEncontrado: true });
    expect(await historicoDaProducao(b, DONA(), ids.vp, {}, EQUIPE)).toBeNull();
    expect(await indicadoresDaProducao(b, DONA(), ids.vp, {}, EQUIPE)).toBeNull();
    // Só vê: nem a tela da cozinha (é de quem registra).
    expect(await tarefasDoDia(a, SO_VE(), ids.vp, 'u-x')).toBeNull();
    // A Delivery (estoque não aberto) tem lista, mas a linha não vira lote.
    expect(await salvarListaDoDia(a, GERENTE_DELIVERY(), ids.delivery, { dia: hoje, versao: '', linhaIds: [''], fichaIds: [ids.molho], quantidades: ['2'] }, GIL)).toMatchObject({ ok: true });
    const t = (await tarefasDoDia(a, GERENTE_DELIVERY(), ids.delivery, GIL.userId))!;
    expect(t.naoGeraLinha).toMatch(/ainda não foi aberto/);
    const l = t.paraPegar[0];
    expect(l.tipo).toBe('LINHA');
    if (l.tipo === 'LINHA') expect(await pegarDaLista(a, GERENTE_DELIVERY(), ids.delivery, { linha: l.linhaId, ficha: l.fichaId, quantidade: String(l.quantidadeMilesimos) }, GIL)).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/ainda não foi aberto/) } });
    expect(await a.ordemProducao.count({ where: { lojaId: ids.delivery } })).toBe(0);
  });

  it('histórico da produção: o quê, quanto, por quem, quando; filtros de pessoa e ficha; R$ só para quem vê custos', async () => {
    const h = (await historicoDaProducao(a, DONA(), ids.vp, { periodo: 'hoje' }, EQUIPE))!;
    expect(h.periodo).toMatchObject({ de: hoje, ate: hoje, atalho: 'hoje' });
    expect(h.resumo).toMatchObject({ concluidos: 3, perdidos: 1, cancelados: 1, estornados: 0 });
    const molho = h.linhas.find((x) => x.id === ids.loteMolho)!;
    expect(molho).toMatchObject({ desfecho: 'CONCLUIDO', planejadoMilesimos: 5000, produzidoMilesimos: 4600, responsavel: { id: 'u-duda', nome: 'Duda Lima' }, concluidaPorNome: 'Gil Gerente', dia: hoje });
    expect(molho.tempoMin).not.toBeNull();
    expect(molho.custo).toMatchObject({ incompleto: false });
    expect(molho.custo!.totalCentavos).toBeGreaterThan(0);
    // Quem fez: Caio e Duda (o lote do nível 1 fica sem ninguém); as fichas do período.
    expect(h.pessoas.map((p) => p.nome)).toEqual(['Caio Cozinha', 'Duda Lima']);
    expect(h.fichas.map((f) => f.nome)).toEqual(['Base de cebola', 'Molho cheddar']);
    const daDuda = (await historicoDaProducao(a, DONA(), ids.vp, { periodo: 'hoje', pessoa: 'u-duda' }, EQUIPE))!;
    expect(daDuda.linhas.every((x) => x.responsavel?.id === 'u-duda')).toBe(true);
    const daBase = (await historicoDaProducao(a, DONA(), ids.vp, { periodo: 'hoje', ficha: ids.base }, EQUIPE))!;
    expect(daBase.linhas.every((x) => x.fichaId === ids.base)).toBe(true);
    expect(daBase.linhas.length).toBeGreaterThan(0);
    // Sem `insumos.ver`: nenhum custo sai do servidor (nem a chave).
    const semCusto = (await historicoDaProducao(a, COZINHA_SEM_CUSTO(), ids.vp, { periodo: 'hoje' }, EQUIPE))!;
    expect(semCusto.verCustos).toBe(false);
    expect(semCusto.linhas.every((x) => !('custo' in x))).toBe(true);
    expect(JSON.stringify(semCusto)).not.toMatch(/totalCentavos|custoTotal/);
    // A cozinha (producao.ver) lê o histórico; o dia sem lote é frase, não zero.
    expect(await historicoDaProducao(a, SO_VE(), ids.vp, { periodo: 'hoje' }, EQUIPE)).not.toBeNull();
    const ontem = (await historicoDaProducao(a, DONA(), ids.vp, { de: '2026-01-01', ate: '2026-01-01' }, EQUIPE))!;
    expect(ontem.resumo.total).toBe(0);
    // O histórico geral (filtro Produção) também mostra quem pegou, soltou e passou; sem custos para quem não vê.
    const geral = await listarHistorico(a, { entidades: ['OrdemProducao'], verPrecos: false, verCustos: false, limite: 200 });
    expect(new Set(geral.map((x) => x.acao))).toEqual(new Set(['PLANEJOU', 'PEGOU', 'SOLTOU', 'REATRIBUIU', 'CONCLUIU', 'CANCELOU', 'INICIOU']));
    expect(JSON.stringify(geral)).not.toMatch(/custo do lote/);
  });

  it('indicadores por pessoa: só a gerência; com amostra e sem R$', async () => {
    expect(await indicadoresDaProducao(a, OPERADOR(), ids.vp, { periodo: 'hoje' }, EQUIPE)).toBeNull();
    const ind = (await indicadoresDaProducao(a, GERENTE(), ids.vp, { periodo: 'hoje' }, EQUIPE))!;
    expect(ind.pessoas.map((p) => p.nome)).toEqual(['Caio Cozinha', 'Duda Lima']);
    const duda = ind.pessoas.find((p) => p.id === 'u-duda')!;
    expect(duda.porFicha.find((f) => f.nome === 'Molho cheddar')).toMatchObject({ produzidoMilesimos: 4600, planejadoMilesimos: 5000, rendimentoBp: 9200 });
    expect(duda.amostraPequena).toBe(true);
    expect(ind.semHoraDePegar).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(ind)).not.toMatch(/Centavos|R\$/);
  });

  it('o banco recusa (SQL cru, no contexto do parceiro): dono em lote planejado, dono sem pessoa, troca de dono no concluído', async () => {
    const planejado = await planejar(ids.molho, '1');
    await expect(cru(db, perfil, A.id, `UPDATE "OrdemProducao" SET "responsavelDesde" = now(), "responsavelUsuarioId" = 'u-x', "responsavelNomeSnapshot" = 'X' WHERE id = $1`, planejado)).rejects.toThrow(/OrdemProducao_responsavel_so_em_producao/);
    expect((await pegarProducao(a, OPERADOR(), ids.vp, planejado, { versao: await versao(planejado) }, CAIO)).ok).toBe(true);
    await expect(cru(db, perfil, A.id, `UPDATE "OrdemProducao" SET "responsavelUsuarioId" = NULL WHERE id = $1`, planejado)).rejects.toThrow(/OrdemProducao_responsavel_com_pessoa/);
    await expect(cru(db, perfil, A.id, `UPDATE "OrdemProducao" SET "responsavelUsuarioId" = 'u-caio', "responsavelNomeSnapshot" = 'Caio Cozinha' WHERE id = $1`, ids.loteMolho)).rejects.toThrow(/OrdemProducao_concluida_imutavel/);
    await expect(cru(db, perfil, A.id, `UPDATE "OrdemProducao" SET "responsavelNomeSnapshot" = repeat('x', 121) WHERE id = $1`, planejado)).rejects.toThrow(/OrdemProducao_responsavel_nome_curto/);
    ids.pegoParaPeriodo = planejado;
  });

  it('estornar o lote concluído guarda quem fez (o estorno não apaga o histórico da pessoa)', async () => {
    const id = ids.loteMolho2; // com a Duda (pegou da lista)
    expect((await entregarTudo(id)).ok).toBe(true);
    expect(await concluir(id, OPERADOR(), DUDA, '3')).toMatchObject({ ok: true });
    expect(await estornarProducao(a, GERENTE(), ids.vp, id, { versao: await versao(id), motivo: 'contaminado', confirmarNegativo: 'sim' }, GIL)).toMatchObject({ ok: true });
    expect(await ordem(id)).toMatchObject({ status: 'CANCELADA', responsavelUsuarioId: 'u-duda' });
    const ind = (await indicadoresDaProducao(a, GERENTE(), ids.vp, { periodo: 'hoje' }, EQUIPE))!;
    expect(ind.pessoas.find((p) => p.id === 'u-duda')!.estornados).toBe(1);
  });

  it('polimento (M2): passar relê, NA gravação e com o lote travado, se quem recebe ainda pode; quem recebeu aparece como "recebeu (passado por)"', async () => {
    const id = await planejar(ids.base, '1');
    expect((await pegarProducao(a, OPERADOR(), ids.vp, id, { versao: await versao(id) }, CAIO)).ok).toBe(true);
    const v = await versao(id);
    // A Duda saiu da equipe entre abrir a tela e tocar: a lista da tela ainda a mostra, a releitura não.
    let lidoComOLoteTravado: boolean | null = null;
    const saiu = {
      pessoas: PESSOAS,
      aindaPode: async () => {
        // Outra conexão tenta travar o lote: está travado (a releitura acontece dentro da gravação, não antes).
        lidoComOLoteTravado = await cru(db, perfil, A.id, `SELECT 1 FROM "OrdemProducao" WHERE id = $1 FOR UPDATE NOWAIT`, id).then(
          () => false,
          (e) => /lock|55P03/i.test(String(e)),
        );
        return false;
      },
    };
    expect(await passarProducao(a, GERENTE(), ids.vp, id, { versao: v, motivo: 'troca de turno', para: 'u-duda' }, saiu, GIL)).toMatchObject({ ok: false, conflito: true, erros: { para: 'Duda Lima não pode mais receber lote nesta loja: o acesso mudou agora há pouco. Escolha outra pessoa; nada foi gravado.' } });
    expect(lidoComOLoteTravado).toBe(true);
    expect(await ordem(id)).toMatchObject({ responsavelUsuarioId: 'u-caio', versao: v });
    // Com o acesso em dia, passa; quem recebeu aparece como "recebeu", com quem passou (tarefas, lote e quadro).
    expect(await passarProducao(a, GERENTE(), ids.vp, id, { versao: v, motivo: 'troca de turno', para: 'u-duda' }, RECEBEM, GIL)).toMatchObject({ ok: true });
    const t = (await tarefasDoDia(a, OPERADOR(), ids.vp, DUDA.userId))!;
    expect(t.comigo.find((x) => x.id === id)!.responsavel).toMatchObject({ nome: 'Duda Lima', comigo: true, passadoPor: 'Gil Gerente' });
    expect((await lote(id, DONA(), DUDA.userId)).responsavel).toMatchObject({ nome: 'Duda Lima', passadoPor: 'Gil Gerente' });
    const q = (await quadroDaProducao(a, DONA(), ids.vp))!;
    expect(q.colunas.EM_EXECUCAO.find((c) => c.id === id)!.responsavel).toMatchObject({ nome: 'Duda Lima', passadoPor: 'Gil Gerente' });
    // Soltou e pegou de novo: "pegou", sem "passado por".
    expect((await soltarProducao(a, OPERADOR(), ids.vp, id, { versao: await versao(id), motivo: 'acabou o turno' }, DUDA)).ok).toBe(true);
    expect((await pegarProducao(a, OPERADOR(), ids.vp, id, { versao: await versao(id) }, CAIO)).ok).toBe(true);
    expect((await lote(id, DONA(), CAIO.userId)).responsavel).toMatchObject({ nome: 'Caio Cozinha', passadoPor: null });
    // Fica com o Caio, cancelado por ele mesmo (para o próximo teste: "cancelou" é dele).
    expect(await cancelarProducao(a, OPERADOR(), ids.vp, id, { versao: await versao(id), motivo: 'faltou gás' }, CAIO)).toMatchObject({ ok: true });
    ids.canceladoPeloCaio = id;
  });

  it('polimento (M1): o lote da 3.1 concluído pelo nível 1 (com o login dele gravado) é da FlowFoods: fora das pessoas, do filtro e dos indicadores', async () => {
    const id = await planejar(ids.base, '1');
    expect((await pegarProducao(a, ALCANCE_FLOWFOODS, ids.vp, id, { versao: await versao(id) }, RODOLFO)).ok).toBe(true);
    expect((await entregarTudo(id)).ok).toBe(true);
    expect(await concluir(id, ALCANCE_FLOWFOODS, RODOLFO, '1')).toMatchObject({ ok: true });
    // O que a 3.1 gravava: o login do nível 1 como responsável. O gatilho do concluído não deixa mudar a linha, então o teste
    // monta o legado com o gatilho desligado só nesta transação (como dono da tabela).
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.parceiro_id', ${A.id}, true)`;
      await tx.$executeRawUnsafe('ALTER TABLE "OrdemProducao" DISABLE TRIGGER "OrdemProducao_concluida_imutavel"');
      await tx.$executeRawUnsafe(`UPDATE "OrdemProducao" SET "responsavelUsuarioId" = 'user-n1', "responsavelNomeSnapshot" = 'Rodolfo (FlowFoods)' WHERE id = $1`, id);
      await tx.$executeRawUnsafe('ALTER TABLE "OrdemProducao" ENABLE TRIGGER "OrdemProducao_concluida_imutavel"');
    });
    expect(await ordem(id)).toMatchObject({ status: 'CONCLUIDA', responsavelUsuarioId: 'user-n1', responsavelNomeSnapshot: 'Rodolfo (FlowFoods)' });
    const h = (await historicoDaProducao(a, DONA(), ids.vp, { periodo: 'hoje' }, EQUIPE))!;
    expect(h.linhas.find((x) => x.id === id)).toMatchObject({ responsavel: null, concluidaPorNome: 'Rodolfo (FlowFoods)' });
    expect(h.pessoas.map((p) => p.id)).not.toContain('user-n1');
    expect((await historicoDaProducao(a, DONA(), ids.vp, { periodo: 'hoje', pessoa: 'user-n1' }, EQUIPE))!.linhas).toEqual([]);
    const ind = (await indicadoresDaProducao(a, GERENTE(), ids.vp, { periodo: 'hoje' }, EQUIPE))!;
    expect(ind.pessoas.map((p) => p.id)).not.toContain('user-n1');
    expect(ind.daFlowFoods).toBeGreaterThanOrEqual(2); // este e o concluído pelo nível 1 na 3.3 (já sem login)
    // Sem a equipe (o erro que o Guardião achou): o nível 1 virava pessoa. O teste pega a regressão.
    const semFiltro = (await indicadoresDaProducao(a, GERENTE(), ids.vp, { periodo: 'hoje' }, new Set([...EQUIPE, 'user-n1'])))!;
    expect(semFiltro.pessoas.map((p) => p.id)).toContain('user-n1');
    // Cancelados (UX): o que o Caio cancelou conta para ele; o que a gerência cancelou com outra pessoa, à parte.
    const caio = ind.pessoas.find((p) => p.id === 'u-caio')!;
    expect(caio.cancelou).toBeGreaterThanOrEqual(1);
    const linhaDoCaio = h.linhas.find((x) => x.id === ids.canceladoPeloCaio)!;
    expect(linhaDoCaio).toMatchObject({ desfecho: 'CANCELADO', responsavel: { id: 'u-caio' }, canceladaPorNome: 'Caio Cozinha' });
  });

  it('período fechado (mutante): pegar da lista ESPERA o fechamento e é recusado com a frase; o lote que já existe ainda se pega (não mexe no livro)', async () => {
    // Uma linha nova na lista de hoje para a cozinha pegar.
    // (O molho de 3 kg voltou para a lista quando o lote dele foi estornado: a gerência mantém a linha e põe 1 kg de base.)
    const lista = (await obterListaDoDia(a, GERENTE(), ids.vp, hoje))!;
    const abertas = lista.linhas.filter((x) => x.estado === 'NA_LISTA');
    expect(abertas.map((x) => [x.nome, x.lote?.estornado])).toEqual([['Molho cheddar', true]]);
    expect(
      await salvarListaDoDia(
        a,
        GERENTE(),
        ids.vp,
        { dia: hoje, versao: String(lista.lista!.versao), linhaIds: [...abertas.map((x) => x.id), ''], fichaIds: [...abertas.map((x) => x.fichaId), ids.base], quantidades: [...abertas.map((x) => String(x.quantidadeMilesimos / 1000)), '1'], vistas: abertas.map((x) => x.id).join(',') },
        GIL,
      ),
    ).toMatchObject({ ok: true });
    const l = await linhaDe('Base de cebola');
    let terminou = false;
    let pegando!: Promise<unknown>;
    await a.transacao(async (tx) => {
      await travarParaFechar(tx);
      pegando = pegarDaLista(a, OPERADOR(), ids.vp, { linha: l.id, ficha: l.fichaId, quantidade: String(l.quantidadeMilesimos) }, CAIO).then((x) => ((terminou = true), x));
      await new Promise((r) => setTimeout(r, 900));
      expect(terminou, 'pegarDaLista terminou sem esperar o fechamento (falta a trava do período)').toBe(false);
      await criarPeriodoFechadoDeTeste(tx, { nome: 'Hoje de teste', inicio: hoje, fim: hoje });
    });
    expect(await pegando).toMatchObject({ ok: false, conflito: true, erros: { geral: expect.stringMatching(/Hoje de teste já foi fechado no DRE/) } });
    const t = (await tarefasDoDia(a, OPERADOR(), ids.vp, CAIO.userId))!;
    expect(t.periodoFechado).toBe('Hoje de teste');
    expect(t.naoGeraLinha).toMatch(/período fechado/);
    // O lote que já existe (com Caio): soltar e pegar não mexem no livro nem no DRE e valem (decisão 233); concluir é recusado.
    const id = ids.pegoParaPeriodo;
    expect(await soltarProducao(a, OPERADOR(), ids.vp, id, { versao: await versao(id), motivo: 'troca' }, CAIO)).toMatchObject({ ok: true });
    expect(await pegarProducao(a, OPERADOR(), ids.vp, id, { versao: await versao(id) }, DUDA)).toMatchObject({ ok: true });
    expect((await entregarTudo(id)).ok).toBe(false);
  });
});
