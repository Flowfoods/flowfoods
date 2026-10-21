/**
 * ERP 3.2 · a lista do dia no Postgres de verdade:
 * - o gerente monta a lista (molho cheddar 5 kg, molho especial 4 kg) e a tela cruza com o estoque da loja: vai usar / tem /
 *   comprar (leite falta 500 ml, cebola falta 1,565 kg), e a base de cebola que o especial usa "falta produzir" 1 kg, com a
 *   receita dela em cascata na compra;
 * - criar duas vezes (duplo clique, duas abas, em paralelo) = uma lista; o mesmo conteúdo = "já feito"; versão velha = conflito;
 *   salvar vazia apaga; histórico com o antes e o depois;
 * - quem vê (cozinha) não monta; quem não vê produção não abre; gerente de outra loja e outro parceiro não enxergam; o custo
 *   estimado só para quem vê custos (o JSON de quem não vê não leva R$ nem o valor para o orçamento);
 * - gerar os lotes: cada linha vira um lote da 3.1 com a requisição dela; nada sai do estoque; gerar de novo (duplo clique, em
 *   paralelo) não duplica; entregar a requisição baixa UMA vez e o "comprar" não muda (sem segunda baixa na conta);
 * - a linha que virou lote não muda nem sai (regra e gatilho, até por SQL cru); cancelar o lote devolve a linha à lista, e ela
 *   vira outro lote; lote concluído sai da conta;
 * - "pôr na lista" o pré-preparo que falta (o segundo clique não soma de novo);
 * - período fechado: escrever na lista ESPERA o fechamento (trava mutante) e é recusado com a frase; loja sem estoque aberto:
 *   "tem" é frase e gerar é recusado; dia que passou e além de 14 dias são recusados; lote do dia fora da lista entra na conta;
 * - RLS: SQL cru no contexto de outro parceiro não toca a lista.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-producao-lista.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarInsumo } from '@/lib/erp/insumos';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { cadastrarFicha } from '@/lib/erp/fichas';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { somarDias } from '@/lib/erp/contagem-campos';
import { concluirAbertura, contarItem, iniciarAbertura, obterContagemDeAbertura } from '@/lib/erp/estoque';
import { atenderRequisicao, obterRequisicao } from '@/lib/erp/requisicao';
import { cancelarProducao, concluirProducao, estornarProducao, iniciarProducao, obterOrdem, planejarProducao, listaDaProducao } from '@/lib/erp/producao';
import { gerarLotesDaLista, lojasDaListaDoDia, obterListaDoDia, porNaListaDoDia, salvarListaDoDia } from '@/lib/erp/producao-lista';
import { listarHistorico } from '@/lib/erp/historico';
import { travarParaFechar } from '@/lib/erp/periodo-trava';
import { resolverAlcance, type Alcance, type Permissao } from '@/lib/erp/permissoes';
import { formatarFracao } from '@/lib/erp/unidades';
import { criarPeriodoFechadoDeTeste, cru, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const DIA = 86_400_000;
const reais = (f: Parameters<typeof formatarFracao>[0]) => formatarFracao(f).replace(/ /g, ' ');
const GIL = { nome: 'Gil Gerente', userId: 'u-gil' };
const CAIO = { nome: 'Caio Cozinha', userId: 'u-caio' };

describe.skipIf(!URL_TESTE)('ERP 3.2 · a lista do dia (Postgres real)', { timeout: 240_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `l${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string };
  let B: { id: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const ids: Record<string, string> = {};
  const hoje = hojeNoRio();
  const amanha = somarDias(hoje, 1);

  const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR' | null, lojaIds: string[] | 'rede', proprio: Permissao[] | null = null): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: proprio, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const DONA = () => alcanceDe('DONO', 'rede');
  const GERENTE = () => alcanceDe('GERENTE', [ids.vp]);
  const OPERADOR = () => alcanceDe('OPERADOR', [ids.vp]);
  const GERENTE_DELIVERY = () => alcanceDe('GERENTE', [ids.delivery]);
  // Gerente de cozinha sem custos: monta a lista e gera os lotes, mas não vê R$ (nem compra).
  const CHEFE_SEM_CUSTO = () => alcanceDe(null, [ids.vp], ['producao.ver', 'producao.planejar', 'producao.registrar']);
  // Comprador: vê a lista e as compras, não vê o DRE nem custos de insumo.
  const COMPRADOR = () => alcanceDe(null, [ids.vp], ['producao.ver', 'compras.ver', 'compras.lancar']);

  type Linha = [string, string, string];
  const salvar = (alcance: Alcance, dia: string, versao: number | '' | null, linhas: Linha[], autor = GIL) =>
    salvarListaDoDia(a, alcance, ids.vp, { dia, versao: versao === null ? '' : String(versao), linhaIds: linhas.map((l) => l[0]), fichaIds: linhas.map((l) => l[1]), quantidades: linhas.map((l) => l[2]) }, autor);
  const ver = async (alcance: Alcance = DONA(), dia: string = hoje, loja = ids.vp) => (await obterListaDoDia(a, alcance, loja, dia))!;
  const versao = async (dia = hoje) => (await ver(DONA(), dia)).lista?.versao ?? '';
  const gerar = async (alcance: Alcance, dia = hoje, v?: number | '') => gerarLotesDaLista(a, alcance, ids.vp, { dia, versao: String(v ?? (await versao(dia))) }, GIL);
  const linhaDe = (l: Awaited<ReturnType<typeof ver>>, insumo: string) => l.conta.materiaPrima.find((i) => i.insumoId === ids[insumo]);
  const comoNumeros = (l: Awaited<ReturnType<typeof ver>>) => l.conta.materiaPrima.map((i) => [i.nome, i.vaiUsarMilesimos, i.temMilesimos, i.comprarMilesimos]);
  const entregarTudo = async (requisicaoId: string) => {
    const r = (await obterRequisicao(a, DONA(), ids.vp, requisicaoId))!;
    return atenderRequisicao(
      a,
      GERENTE(),
      ids.vp,
      r.requisicao.id,
      { versao: r.requisicao.versao, linhas: r.itens.map((i) => ({ itemId: i.id, quantidade: String(i.faltaMilesimos / 1000).replace('.', ','), escala: 'base' })), encerrar: false, confirmarNegativo: true },
      'Edu Estoque',
    );
  };

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Lista A', slug: `lista-a-${sufixo}`, status: 'ATIVO' } });
    B = await db.parceiroFlow.create({ data: { nome: 'Lista B', slug: `lista-b-${sufixo}`, status: 'ATIVO' } });
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
      cheddar: { nome: 'Queijo cheddar', unidade: 'KG', conteudo: '5', preco: '200,00', conservacao: 'REFRIGERADO' },
      leite: { nome: 'Leite', unidade: 'L', conteudo: '1', preco: '5,00', conservacao: 'REFRIGERADO' },
      cebola: { nome: 'Cebola', unidade: 'KG', conteudo: '1', preco: '6,00', conservacao: 'SECO' },
      oleo: { nome: 'Óleo', unidade: 'L', conteudo: '0,9', preco: '9,00', conservacao: 'SECO' },
    })) {
      const r = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', ...campos });
      if (!r.ok) throw new Error(`${chave}: ${JSON.stringify(r)}`);
      ids[chave] = r.id;
    }
    // A Penha abriu o estoque há 10 dias: cheddar 20 kg, leite 2 L, cebola 500 g, óleo nenhum. A Delivery não abriu.
    const antes = new Date(Date.now() - 10 * DIA);
    expect((await iniciarAbertura(a, DONA(), ids.vp, 'Marina', antes)).ok).toBe(true);
    const ab = (await obterContagemDeAbertura(a, DONA(), ids.vp))!;
    const numeros: Record<string, string> = { 'Queijo cheddar': '20', Leite: '2', Cebola: '0,5', Óleo: '0' };
    for (const i of ab.itens) {
      const r = await contarItem(a, DONA(), ids.vp, { itemId: i.id, embalagens: '', solto: numeros[i.nome], escala: 'base', versao: i.versao }, 'Marina', { agora: antes });
      expect(r.ok).toBe(true);
    }
    const v = (await a.contagem.findFirst({ where: { lojaId: ids.vp, tipo: 'ABERTURA' }, select: { versao: true } }))!.versao;
    expect((await concluirAbertura(a, DONA(), ids.vp, { versao: v, confirmarNaoContados: false }, 'Marina', antes)).ok).toBe(true);
    const ficha = async (chave: string, entrada: Parameters<typeof cadastrarFicha>[1]) => {
      const f = await cadastrarFicha(a, entrada, { tipo: 'manter' }, 'Marina');
      if (!f.ok) throw new Error(`${chave}: ${JSON.stringify(f)}`);
      ids[chave] = f.id;
      ids[`i-${chave}`] = (await a.insumo.findFirst({ where: { nome: String(entrada.nome) } }))!.id;
    };
    const validade = { principal: 'REFRIGERADO', linhas: { REFRIGERADO: { marcada: true, quantidade: '3', em: 'dias' } } };
    // Molho cheddar: rende 2 kg (cheddar 1 kg, leite 1 L, cebola 300 g limpos com fator 1,18).
    await ficha('molho', { nome: 'Molho cheddar', tipo: 'PRE_PREPARO', rendimento: '2', rendimentoUnidade: 'kg', itens: [{ insumoId: ids.cheddar, quantidade: '1', unidade: 'kg' }, { insumoId: ids.leite, quantidade: '1', unidade: 'L' }, { insumoId: ids.cebola, quantidade: '300', unidade: 'g', fator: '1,18' }], validade } as never);
    // Base de cebola: rende 1 kg (cebola 1 kg limpo com fator 1,18 e óleo 100 ml).
    await ficha('base', { nome: 'Base de cebola', tipo: 'PRE_PREPARO', rendimento: '1', rendimentoUnidade: 'kg', itens: [{ insumoId: ids.cebola, quantidade: '1', unidade: 'kg', fator: '1,18' }, { insumoId: ids.oleo, quantidade: '100', unidade: 'ml' }], validade } as never);
    // Molho especial: rende 2 kg (cheddar 1 kg e 500 g da base: pré-preparo dentro do pré-preparo).
    await ficha('especial', { nome: 'Molho especial', tipo: 'PRE_PREPARO', rendimento: '2', rendimentoUnidade: 'kg', itens: [{ insumoId: ids.cheddar, quantidade: '1', unidade: 'kg' }, { subfichaId: ids.base, quantidade: '500', unidade: 'g' }], validade } as never);
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
  });

  it('o gerente monta a lista de hoje (molho cheddar 5 kg, molho especial 4 kg): vai usar / tem / comprar na unidade de cada insumo, e a base que falta produzir entra em cascata', async () => {
    expect(await salvar(GERENTE(), hoje, null, [['', ids.molho, '5'], ['', ids.especial, '4']])).toMatchObject({ ok: true });
    const l = await ver();
    expect(l.lista).toMatchObject({ versao: 1, criadaPorNome: 'Gil Gerente' });
    expect(l.linhas.map((x) => [x.nome, x.quantidadeMilesimos, x.unidade, x.estado, x.lote, x.emEstoqueMilesimos, x.fichaDisponivel])).toEqual([
      ['Molho cheddar', 5000, 'KG', 'NA_LISTA', null, 0, true],
      ['Molho especial', 4000, 'KG', 'NA_LISTA', null, 0, true],
    ]);
    expect(l.estoque).toBe('ABERTO');
    // Cheddar 2,5 + 2 kg; leite 2,5 L (tem 2 L: falta 500 ml); cebola 885 g do molho + 1,18 kg da base que falta (tem 500 g); óleo 100 ml.
    expect(comoNumeros(l)).toEqual([
      ['Cebola', 2065, 500, 1565],
      ['Leite', 2500, 2000, 500],
      ['Óleo', 100, 0, 100],
      ['Queijo cheddar', 4500, 20000, 0],
    ]);
    expect(linhaDe(l, 'cebola')!.deOnde).toEqual(['Base de cebola (o que falta)', 'Molho cheddar']);
    expect(linhaDe(l, 'oleo')!.embalagens).toEqual({ quantas: 1, conteudoMilesimos: 900 });
    expect(l.conta.preparos).toEqual([expect.objectContaining({ nome: 'Base de cebola', vaiUsarMilesimos: 1000, temMilesimos: 0, naListaMilesimos: 0, faltaProduzirMilesimos: 1000, fichaId: ids.base })]);
    expect(l.conta.resumo).toEqual({ faltaComprar: 3, da: 1, negativos: 0, faltaProduzir: 1 });
    expect(l.naoEdita).toBeNull();
    expect(l.naoGera).toBeNull();
    expect(l.semLote).toBe(2);
    expect(l.opcoes.map((o) => o.nome)).toEqual(['Base de cebola', 'Molho cheddar', 'Molho especial']);
    // O custo estimado do que falta (a dona vê custos): leite 500 ml × R$ 5,00/L + cebola 1,565 kg × R$ 6,00/kg + óleo 100 ml × R$ 10,00/L.
    expect(reais(l.custo!.total)).toBe('R$ 12,89');
    expect(reais(l.custo!.porInsumo.get(ids.cebola)!)).toBe('R$ 9,39');
    expect(l.custo!.semPreco).toEqual([]);
    // O histórico diz o que nasceu.
    expect(l.historico[0]).toMatchObject({ acao: 'CRIOU', autorNome: 'Gil Gerente', alvo: `Lista do dia ${hoje.slice(8, 10)}/${hoje.slice(5, 7)}/${hoje.slice(0, 4)} · Vila da Penha` });
    expect(l.historico[0].mudancas).toEqual(expect.arrayContaining([{ campo: 'o que produzir', antes: null, depois: 'Molho cheddar 5 kg · Molho especial 4 kg' }]));
    // Nada mexeu no estoque.
    expect(await a.movimentoEstoque.count({ where: { tipo: { notIn: ['ABERTURA'] } } })).toBe(0);
  });

  it('idempotência: o mesmo envio de novo (duplo clique) = "já feito"; duas abas criando a lista de amanhã juntas = UMA lista; conteúdo diferente com versão velha = conflito', async () => {
    const v = (await ver()).lista!.versao;
    expect(await salvar(GERENTE(), hoje, v, [['', ids.molho, '5'], ['', ids.especial, '4']])).toMatchObject({ ok: true, jaFeito: true });
    expect((await ver()).lista!.versao).toBe(v);
    // Duas abas, ao mesmo tempo, criando a de amanhã com o mesmo conteúdo: uma lista, uma linha.
    const [x, y] = await Promise.all([salvar(GERENTE(), amanha, null, [['', ids.molho, '2']]), salvar(GERENTE(), amanha, null, [['', ids.molho, '2']])]);
    expect([x.ok, y.ok]).toEqual([true, true]);
    expect([x, y].filter((r) => r.ok && r.jaFeito)).toHaveLength(1);
    expect(await a.listaProducao.count({ where: { lojaId: ids.vp, dia: new Date(`${amanha}T00:00:00Z`) } })).toBe(1);
    expect(await a.listaProducaoItem.count({ where: { lista: { dia: new Date(`${amanha}T00:00:00Z`) } } })).toBe(1);
    // Duas abas com conteúdos diferentes: uma vale, a outra recebe o conflito (nada gravado por ela).
    const [p, q] = await Promise.all([salvar(GERENTE(), amanha, 1, [['', ids.molho, '3']]), salvar(GERENTE(), amanha, 1, [['', ids.molho, '4']])]);
    const ganhou = [p, q].filter((r) => r.ok);
    const perdeu = [p, q].filter((r) => !r.ok);
    expect(ganhou).toHaveLength(1);
    expect(perdeu[0]).toMatchObject({ ok: false, conflito: true, erros: { geral: expect.stringMatching(/Alguém mudou esta lista agora há pouco/) } });
    const m = (await ver(DONA(), amanha)).linhas[0].quantidadeMilesimos;
    expect([3000, 4000]).toContain(m);
    // A criação de quem achou que a lista existia (versão) numa lista que sumiu: conflito, não cria por cima.
    expect(await salvar(GERENTE(), somarDias(hoje, 2), 5, [['', ids.molho, '1']])).toMatchObject({ ok: false, conflito: true, erros: { geral: expect.stringMatching(/apagada/) } });
    expect(await a.listaProducao.count({ where: { dia: new Date(`${somarDias(hoje, 2)}T00:00:00Z`) } })).toBe(0);
  });

  it('editar: muda a quantidade com a versão lida (antes e depois no histórico); a linha vazia some; salvar sem nenhuma linha apaga a lista', async () => {
    const l = await ver(DONA(), amanha);
    const linha = l.linhas[0];
    expect(await salvar(GERENTE(), amanha, l.lista!.versao, [[linha.id, ids.molho, '6'], ['', '', ''], ['', ids.base, '0,5']])).toMatchObject({ ok: true });
    const d = await ver(DONA(), amanha);
    expect(d.linhas.map((x) => [x.id === linha.id, x.nome, x.quantidadeMilesimos])).toEqual([
      [true, 'Molho cheddar', 6000],
      [false, 'Base de cebola', 500],
    ]);
    const h = d.historico[0];
    expect(h.acao).toBe('ALTEROU');
    expect(h.mudancas).toEqual(expect.arrayContaining([{ campo: 'entrou', antes: null, depois: 'Base de cebola 500 g' }, { campo: 'Molho cheddar', antes: expect.stringMatching(/kg$/), depois: '6 kg' }]));
    // A frase na linha certa (contando as vazias) e nada gravado.
    expect(await salvar(GERENTE(), amanha, d.lista!.versao, [['', ids.molho, '1'], ['', ids.molho, '2']])).toMatchObject({ ok: false, erros: { 'linha:1': expect.stringMatching(/já está na lista/) } });
    // Vazia: a lista fica sem linhas (apagada), e o histórico guarda o que ela tinha. A linha da lista no banco FICA, e a versão
    // continua (decisão 229): não recomeça em 1 quando alguém monta de novo.
    const listaId = d.lista!.id;
    const versaoAntesDeApagar = d.lista!.versao;
    expect(await salvar(GERENTE(), amanha, d.lista!.versao, [])).toMatchObject({ ok: true });
    const apagada = await ver(DONA(), amanha);
    expect(apagada.linhas).toEqual([]);
    expect(apagada.lista).toMatchObject({ id: listaId, versao: versaoAntesDeApagar + 1 });
    const ex = await listarHistorico(a, { de: [{ entidade: 'ListaProducao', ids: [listaId] }], limite: 1, verPrecos: false });
    expect(ex[0]).toMatchObject({ acao: 'EXCLUIU' });
    expect(ex[0].mudancas).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'o que produzir', antes: 'Molho cheddar 6 kg · Base de cebola 500 g' })]));
    // Salvar vazio de novo: nada a fazer.
    expect(await salvar(GERENTE(), amanha, apagada.lista!.versao, [])).toMatchObject({ ok: true, jaFeito: true });
    // Outra pessoa monta de novo (a tela dela não tinha lista: versão vazia) → "Montada", com a versão seguindo.
    expect(await salvar(GERENTE(), amanha, null, [['', ids.base, '3']])).toMatchObject({ ok: true });
    const remontada = await ver(DONA(), amanha);
    expect(remontada.lista).toMatchObject({ id: listaId, versao: versaoAntesDeApagar + 2 });
    expect(remontada.historico[0]).toMatchObject({ acao: 'CRIOU' });
    // A aba que leu a lista ANTES de apagar (a versão velha) não sobrescreve a montada de novo: conflito, nada gravado.
    expect(await salvar(GERENTE(), amanha, versaoAntesDeApagar, [[linha.id, ids.molho, '9']])).toMatchObject({ ok: false, conflito: true });
    expect(await salvar(GERENTE(), amanha, versaoAntesDeApagar, [['', ids.molho, '9']])).toMatchObject({ ok: false, conflito: true });
    // A aba da lista apagada (versão de apagada) que tenta montar depois que outra pessoa já montou: conflito ("apagada…").
    expect(await salvar(GERENTE(), amanha, apagada.lista!.versao, [['', ids.molho, '1']])).toMatchObject({ ok: false, conflito: true });
    // "Pôr na lista" com a versão velha também não soma; e gerar não acha nada numa lista apagada.
    expect(await porNaListaDoDia(a, GERENTE(), ids.vp, { dia: amanha, versao: String(versaoAntesDeApagar), fichaId: ids.molho, quantidade: '1000' }, GIL)).toMatchObject({ ok: false, conflito: true });
    expect((await ver(DONA(), amanha)).linhas.map((x) => [x.nome, x.quantidadeMilesimos])).toEqual([['Base de cebola', 3000]]);
    expect(await salvar(GERENTE(), amanha, remontada.lista!.versao, [])).toMatchObject({ ok: true });
    expect(await gerarLotesDaLista(a, GERENTE(), ids.vp, { dia: amanha, versao: String(remontada.lista!.versao + 1) }, GIL)).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/foi apagada/) } });
  });

  it('permissões e alcance: a cozinha VÊ a lista e não monta nem gera; quem não vê produção não abre; gerente de outra loja e outro parceiro não enxergam', async () => {
    const op = await ver(OPERADOR());
    expect(op.linhas).toHaveLength(2);
    expect(op.pode.planejar).toBe(false);
    expect(op.opcoes).toEqual([]);
    const negado = await salvar(OPERADOR(), hoje, op.lista!.versao, [['', ids.molho, '1']], CAIO);
    expect(negado).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/definir a lista do dia/) } });
    expect(await gerar(OPERADOR())).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/definir a lista do dia/) } });
    expect(await porNaListaDoDia(a, OPERADOR(), ids.vp, { dia: hoje, versao: String(op.lista!.versao), fichaId: ids.base, quantidade: '1000' }, CAIO)).toMatchObject({ ok: false });
    // Perfil sem "ver a produção": a tela não existe para ele.
    expect(await obterListaDoDia(a, alcanceDe(null, [ids.vp], ['compras.ver']), ids.vp, hoje)).toBeNull();
    // Gerente da Delivery: a Penha não existe para ele (nem para ver, nem para escrever).
    expect(await obterListaDoDia(a, GERENTE_DELIVERY(), ids.vp, hoje)).toBeNull();
    expect(await salvarListaDoDia(a, GERENTE_DELIVERY(), ids.vp, { dia: hoje, versao: '', linhaIds: [], fichaIds: [ids.molho], quantidades: ['1'] }, GIL)).toMatchObject({ ok: false, naoEncontrado: true });
    // Outro parceiro: pelo portão dele a loja e a ficha de A não existem.
    const donaB = alcanceDe('DONO', 'rede');
    expect(await obterListaDoDia(b, donaB, ids.vp, hoje)).toBeNull();
    expect(await salvarListaDoDia(b, donaB, ids.lojaB, { dia: hoje, versao: '', linhaIds: [], fichaIds: [ids.molho], quantidades: ['1'] }, GIL)).toMatchObject({ ok: false, erros: { 'linha:0': expect.stringMatching(/não está mais disponível/) } });
    expect(await b.listaProducao.count()).toBe(0);
    // A entrada da aba: as lojas do alcance, com a lista de hoje.
    expect(await lojasDaListaDoDia(a, OPERADOR())).toEqual([{ id: ids.vp, nome: 'Vila da Penha', naLista: 2, semLote: 2 }]);
    expect((await lojasDaListaDoDia(a, DONA())).map((x) => [x.nome, x.naLista])).toEqual([
      ['Delivery', 0],
      ['Vila da Penha', 2],
    ]);
  });

  it('custo: só quem vê custos recebe o estimado; o chefe sem custos monta a lista e o JSON dele não leva R$; o comprador vê o orçamento pela vista dele, partindo de zero (sem o valor que não vê)', async () => {
    const chefe = await ver(CHEFE_SEM_CUSTO());
    expect(chefe.custo).toBeNull();
    expect(chefe.orcamento).toBeNull();
    expect(chefe.pode).toMatchObject({ planejar: true, verCustos: false, lancarNota: false, verOrcamento: false });
    const json = JSON.stringify(chefe, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    expect(json).not.toMatch(/R\$|centavos|Centavos|valor/);
    // O comprador: vê o orçamento (a loja não tem meta: "sem número"), na vista de quem não vê o DRE.
    const comprador = await ver(COMPRADOR());
    expect(comprador.custo).toBeNull();
    expect(comprador.orcamento).toMatchObject({ tipo: 'sem', arredondado: true });
    expect(comprador.pode).toMatchObject({ planejar: false, verCustos: false, lancarNota: true, verOrcamento: true });
    // A dona: custo e orçamento com a conta dela.
    const dona = await ver(DONA());
    expect(dona.custo).not.toBeNull();
    expect(dona.orcamento).toMatchObject({ tipo: 'sem', arredondado: false });
  });

  let LOTE_MOLHO = '';
  let LOTE_ESPECIAL = '';

  it('gerar os lotes: cada linha vira um lote PLANEJADO da 3.1, com a requisição dos insumos pela ficha; nada sai do estoque; a conta não muda', async () => {
    const antes = await ver();
    const movs = await a.movimentoEstoque.count();
    const reqs = await a.requisicao.count();
    expect(await gerar(GERENTE())).toMatchObject({ ok: true });
    const l = await ver();
    expect(l.linhas.map((x) => [x.nome, x.estado, x.lote?.status])).toEqual([
      ['Molho cheddar', 'EM_LOTE', 'PLANEJADA'],
      ['Molho especial', 'EM_LOTE', 'PLANEJADA'],
    ]);
    const prefixo = `${hoje.slice(2, 4)}${hoje.slice(5, 7)}${hoje.slice(8, 10)}`;
    expect(l.linhas.map((x) => x.lote!.codigo)).toEqual([`${prefixo}-01`, `${prefixo}-02`]);
    LOTE_MOLHO = l.linhas[0].lote!.id;
    LOTE_ESPECIAL = l.linhas[1].lote!.id;
    const molho = (await obterOrdem(a, DONA(), ids.vp, LOTE_MOLHO))!;
    expect(molho.ordem).toMatchObject({ planejadoMilesimos: 5000, dataPlanejada: hoje, planejadaPorNome: 'Gil Gerente', fichaNome: 'Molho cheddar' });
    expect(molho.itensDoLote.map((i) => [i.nome, i.pedidoMilesimos]).sort()).toEqual([['Cebola', 885], ['Leite', 2500], ['Queijo cheddar', 2500]]);
    const especial = (await obterOrdem(a, DONA(), ids.vp, LOTE_ESPECIAL))!;
    // A requisição do especial pede a base pronta (o insumo que ela produz), não a receita da base: fazer a base é outro lote.
    expect(especial.itensDoLote.map((i) => [i.nome, i.pedidoMilesimos]).sort()).toEqual([['Base de cebola', 1000], ['Queijo cheddar', 2000]]);
    expect(await a.requisicao.count()).toBe(reqs + 2);
    expect(await a.movimentoEstoque.count()).toBe(movs);
    // A conta é a mesma: agora vem do que falta sair pelas requisições dos lotes.
    expect(comoNumeros(l)).toEqual(comoNumeros(antes));
    expect(l.conta.preparos).toEqual(antes.conta.preparos);
    expect(l.semLote).toBe(0);
    // Histórico: a lista diz os lotes; cada lote diz de qual lista veio.
    expect(l.historico[0]).toMatchObject({ acao: 'GEROU_LOTES' });
    expect(l.historico[0].mudancas).toEqual(expect.arrayContaining([{ campo: 'lotes gerados', antes: null, depois: `${prefixo}-01 Molho cheddar 5 kg · ${prefixo}-02 Molho especial 4 kg` }]));
    const hl = await listarHistorico(a, { de: [{ entidade: 'OrdemProducao', ids: [LOTE_MOLHO] }], limite: 1, verPrecos: false });
    expect(hl[0].mudancas).toEqual(expect.arrayContaining([{ campo: 'da lista', antes: null, depois: expect.stringMatching(/^Lista do dia .* · Vila da Penha$/) }]));
  });

  it('gerar de novo (duplo clique, a tela velha, ou duas abas juntas) não gera outro lote', async () => {
    const ordens = await a.ordemProducao.count();
    expect(await gerar(GERENTE(), hoje, 1)).toMatchObject({ ok: true, jaFeito: true });
    const v = await versao();
    const [x, y] = await Promise.all([gerar(GERENTE(), hoje, v as number), gerar(GERENTE(), hoje, v as number)]);
    expect([x.ok, y.ok]).toEqual([true, true]);
    expect(await a.ordemProducao.count()).toBe(ordens);
    // A lista de amanhã com duas abas gerando juntas: os lotes nascem uma vez.
    expect(await salvar(GERENTE(), amanha, null, [['', ids.molho, '2']])).toMatchObject({ ok: true });
    const va = (await ver(DONA(), amanha)).lista!.versao;
    const juntos = await Promise.all([gerar(GERENTE(), amanha, va), gerar(GERENTE(), amanha, va)]);
    expect(juntos.every((r) => r.ok)).toBe(true);
    expect(await a.ordemProducao.count({ where: { dataPlanejada: new Date(`${amanha}T00:00:00Z`) } })).toBe(1);
  });

  it('sem segunda baixa: entregar a requisição do molho baixa uma vez; o "tem" cai, o "vai usar" cai junto e o "comprar" não muda', async () => {
    const antes = await ver();
    const molho = (await obterOrdem(a, DONA(), ids.vp, LOTE_MOLHO))!;
    expect(await entregarTudo(molho.requisicao!.id)).toMatchObject({ ok: true });
    expect(await a.movimentoEstoque.count({ where: { tipo: 'REQUISICAO' } })).toBe(3);
    const depois = await ver();
    const cheddarAntes = antes.conta.materiaPrima.find((i) => i.nome === 'Queijo cheddar')!;
    const cheddar = depois.conta.materiaPrima.find((i) => i.nome === 'Queijo cheddar')!;
    expect([cheddar.vaiUsarMilesimos, cheddar.temMilesimos]).toEqual([cheddarAntes.vaiUsarMilesimos - 2500, cheddarAntes.temMilesimos! - 2500]);
    expect(depois.conta.materiaPrima.map((i) => [i.nome, i.comprarMilesimos])).toEqual(antes.conta.materiaPrima.map((i) => [i.nome, i.comprarMilesimos]));
    // A cebola e o leite ficaram abaixo de zero na entrega (o livro tinha menos): alarme, e o comprar continua o mesmo. O leite
    // não tem mais nada a sair (vai usar 0), mas a linha fica: o buraco do livro também se compra.
    expect(depois.conta.materiaPrima.find((i) => i.nome === 'Leite')).toMatchObject({ vaiUsarMilesimos: 0, temMilesimos: -500, negativo: true, comprarMilesimos: 500, deOnde: ['Molho cheddar'] });
    expect(depois.conta.resumo.negativos).toBe(2);
  });

  it('a linha que virou lote não muda nem sai da lista: a regra recusa e o banco também (gatilho, até por SQL cru)', async () => {
    const l = await ver();
    const linhaMolho = l.linhas[0];
    // Mandar a linha que virou lote no formulário (a tela velha): conflito com a frase do lote.
    expect(await salvar(GERENTE(), hoje, l.lista!.versao, [[linhaMolho.id, ids.molho, '9']])).toMatchObject({ ok: false, conflito: true, erros: { geral: expect.stringMatching(/virou o lote .* agora há pouco/) } });
    // Salvar sem ela não a apaga: as que viraram lote ficam (só as abertas mudam).
    expect(await salvar(GERENTE(), hoje, l.lista!.versao, [['', ids.base, '0,2']])).toMatchObject({ ok: true });
    expect((await ver()).linhas.map((x) => x.nome)).toEqual(['Molho cheddar', 'Molho especial', 'Base de cebola']);
    // O banco: mudar a quantidade, trocar o lote ou apagar a linha com lote vivo é recusado.
    const sqlErro = async (sql: string, ...v: unknown[]) => {
      try {
        await cru(db, perfil, A.id, sql, ...v);
        return null;
      } catch (e) {
        return String((e as Error).message);
      }
    };
    expect(await sqlErro(`UPDATE "ListaProducaoItem" SET "quantidadeMilesimos" = 1 WHERE "id" = $1`, linhaMolho.id)).toMatch(/ListaProducaoItem_com_lote/);
    expect(await sqlErro(`DELETE FROM "ListaProducaoItem" WHERE "id" = $1`, linhaMolho.id)).toMatch(/ListaProducaoItem_com_lote/);
    expect(await sqlErro(`UPDATE "ListaProducaoItem" SET "ordemProducaoId" = NULL WHERE "id" = $1`, linhaMolho.id)).toMatch(/ListaProducaoItem_com_lote/);
    // A linha nova (a base) não pode apontar o lote do especial (outra ficha), nem um lote de outro dia.
    const base = (await ver()).linhas[2];
    expect(await sqlErro(`UPDATE "ListaProducaoItem" SET "ordemProducaoId" = $1 WHERE "id" = $2`, LOTE_ESPECIAL, base.id)).toMatch(/ListaProducaoItem_lote_confere|ListaProducaoItem_parceiroId_ordemProducaoId_key|unique/);
    const loteAmanha = (await a.ordemProducao.findFirst({ where: { dataPlanejada: new Date(`${amanha}T00:00:00Z`) }, select: { id: true } }))!.id;
    expect(await sqlErro(`UPDATE "ListaProducaoItem" SET "ordemProducaoId" = $1 WHERE "id" = $2`, loteAmanha, base.id)).toMatch(/ListaProducaoItem_lote_confere|unique/);
    // A lista não muda de loja nem de dia.
    expect(await sqlErro(`UPDATE "ListaProducao" SET "dia" = "dia" + 1 WHERE "id" = $1`, l.lista!.id)).toMatch(/ListaProducao_loja_dia_imutaveis|unique/);
    // Tira a base de volta (fica a lista com os dois lotes).
    expect(await salvar(GERENTE(), hoje, (await ver()).lista!.versao, [])).toMatchObject({ ok: true });
    expect((await ver()).linhas).toHaveLength(2);
  });

  it('cancelar o lote devolve a linha à lista (editável, conta a receita inteira de novo) e ela vira outro lote; lote concluído sai da conta', async () => {
    const esp = (await obterOrdem(a, DONA(), ids.vp, LOTE_ESPECIAL))!;
    expect(await cancelarProducao(a, OPERADOR(), ids.vp, LOTE_ESPECIAL, { versao: esp.ordem.versao, motivo: 'faltou base' }, CAIO)).toMatchObject({ ok: true });
    let l = await ver();
    expect(l.linhas[1]).toMatchObject({ nome: 'Molho especial', estado: 'NA_LISTA', lote: { id: LOTE_ESPECIAL, status: 'CANCELADA' } });
    expect(l.semLote).toBe(1);
    // Volta a ser editável: 3 kg em vez de 4.
    expect(await salvar(GERENTE(), hoje, l.lista!.versao, [[l.linhas[1].id, ids.especial, '3']])).toMatchObject({ ok: true });
    expect(await gerar(GERENTE())).toMatchObject({ ok: true });
    l = await ver();
    expect(l.linhas[1]).toMatchObject({ estado: 'EM_LOTE', quantidadeMilesimos: 3000, lote: { status: 'PLANEJADA' } });
    expect(l.linhas[1].lote!.id).not.toBe(LOTE_ESPECIAL);
    LOTE_ESPECIAL = l.linhas[1].lote!.id;
    // O molho: concluído, sai da conta (o que saiu e o que entrou já estão no saldo).
    const molho = (await obterOrdem(a, DONA(), ids.vp, LOTE_MOLHO))!;
    expect(await concluirProducao(a, OPERADOR(), ids.vp, LOTE_MOLHO, { versao: molho.ordem.versao, produzido: '4,8', escala: 'base', motivo: '', conservacao: '' }, CAIO)).toMatchObject({ ok: true });
    l = await ver();
    expect(l.linhas[0]).toMatchObject({ estado: 'FEITA', lote: { status: 'CONCLUIDA' }, emEstoqueMilesimos: 4800 });
    // O especial de 3 kg usa 750 g da base (que falta: cebola 885 g e óleo 75 ml em cascata); o leite fica só pelo buraco do livro.
    expect(l.conta.materiaPrima.map((i) => [i.nome, i.vaiUsarMilesimos, i.temMilesimos, i.comprarMilesimos])).toEqual([
      ['Cebola', 885, -385, 1270],
      ['Leite', 0, -500, 500],
      ['Óleo', 75, 0, 75],
      ['Queijo cheddar', 1500, 17500, 0],
    ]);
  });

  it('"pôr na lista" o pré-preparo que falta: a base entra com o que falta; o segundo clique (a mesma versão) não soma de novo', async () => {
    const l = await ver();
    const base = l.conta.preparos.find((x) => x.nome === 'Base de cebola')!;
    expect(base).toMatchObject({ vaiUsarMilesimos: 750, faltaProduzirMilesimos: 750 });
    const pedido = { dia: hoje, versao: String(l.lista!.versao), fichaId: ids.base, quantidade: String(base.faltaProduzirMilesimos) };
    expect(await porNaListaDoDia(a, GERENTE(), ids.vp, pedido, GIL)).toMatchObject({ ok: true });
    expect(await porNaListaDoDia(a, GERENTE(), ids.vp, pedido, GIL)).toMatchObject({ ok: false, conflito: true, erros: { geral: expect.stringMatching(/nada foi somado/) } });
    const d = await ver();
    expect(d.linhas.map((x) => [x.nome, x.quantidadeMilesimos, x.estado])).toEqual([
      ['Molho cheddar', 5000, 'FEITA'],
      ['Molho especial', 3000, 'EM_LOTE'],
      ['Base de cebola', 750, 'NA_LISTA'],
    ]);
    expect(d.conta.preparos.find((x) => x.nome === 'Base de cebola')).toMatchObject({ naListaMilesimos: 750, faltaProduzirMilesimos: 0 });
    // A cebola é a mesma conta (agora pela linha da base, não pela cascata).
    expect(d.conta.materiaPrima.find((i) => i.nome === 'Cebola')).toMatchObject({ vaiUsarMilesimos: 885, deOnde: ['Base de cebola'] });
    // De novo, agora com a versão nova: soma na mesma linha.
    expect(await porNaListaDoDia(a, GERENTE(), ids.vp, { ...pedido, versao: String(d.lista!.versao), quantidade: '250' }, GIL)).toMatchObject({ ok: true });
    expect((await ver()).linhas[2].quantidadeMilesimos).toBe(1000);
  });

  it('lote do dia planejado FORA da lista (Nova produção) aparece e entra na conta (vai consumir e produzir)', async () => {
    const antes = await ver();
    const lista = await listaDaProducao(a, OPERADOR(), ids.vp, ids.molho, '1');
    if (!lista.ok) throw new Error('lista');
    expect(await planejarProducao(a, OPERADOR(), ids.vp, { fichaId: ids.molho, quantidade: '1', paraDia: 'hoje', observacao: '', linhas: lista.linhas, envio: `fora-${sufixo}-1` }, CAIO)).toMatchObject({ ok: true });
    const l = await ver();
    expect(l.foraDaLista.map((x) => [x.nome, x.quantidadeMilesimos, x.status])).toEqual([['Molho cheddar', 1000, 'PLANEJADA']]);
    expect(antes.conta.materiaPrima.find((i) => i.nome === 'Leite')).toMatchObject({ vaiUsarMilesimos: 0, comprarMilesimos: 500 });
    expect(l.conta.materiaPrima.find((i) => i.nome === 'Leite')).toMatchObject({ vaiUsarMilesimos: 500, comprarMilesimos: 1000, deOnde: ['Molho cheddar'] });
  });

  it('lote de FORA da lista com pré-preparo dentro (revisão B1): a cascata é a mesma de quando ele é linha, até o fundo (três níveis), e "Pôr na lista" aparece', async () => {
    // Molho da casa: rende 1 kg com 500 g do molho especial (que leva a base): três níveis de pré-preparo.
    const casa = await cadastrarFicha(a, { nome: 'Molho da casa', tipo: 'PRE_PREPARO', rendimento: '1', rendimentoUnidade: 'kg', itens: [{ subfichaId: ids.especial, quantidade: '500', unidade: 'g' }], validade: { principal: 'REFRIGERADO', linhas: { REFRIGERADO: { marcada: true, quantidade: '3', em: 'dias' } } } } as never, { tipo: 'manter' }, 'Marina');
    if (!casa.ok) throw new Error(JSON.stringify(casa));
    const comoLinha = async (dia: string, fichaId: string, q: string) => {
      expect(await salvar(GERENTE(), dia, null, [['', fichaId, q]])).toMatchObject({ ok: true });
      return ver(DONA(), dia);
    };
    const deFora = async (dia: string, fichaId: string, q: string) => {
      const l = await listaDaProducao(a, OPERADOR(), ids.vp, fichaId, q);
      if (!l.ok) throw new Error('lista');
      expect(await planejarProducao(a, OPERADOR(), ids.vp, { fichaId, quantidade: q, paraDia: dia, observacao: '', linhas: l.linhas, envio: `b1-${dia}-${sufixo}` }, CAIO)).toMatchObject({ ok: true });
      return ver(DONA(), dia);
    };
    // Dois níveis: o molho especial 4 kg (a base vai pela requisição do lote de fora).
    const linha2 = await comoLinha(somarDias(hoje, 3), ids.especial, '4');
    const fora2 = await deFora(somarDias(hoje, 4), ids.especial, '4');
    expect(fora2.linhas).toEqual([]);
    expect(fora2.foraDaLista.map((x) => x.nome)).toEqual(['Molho especial']);
    expect(comoNumeros(fora2)).toEqual(comoNumeros(linha2));
    expect(comoNumeros(fora2).map((x) => x[0])).toEqual(expect.arrayContaining(['Cebola', 'Óleo']));
    const base = fora2.conta.preparos.find((x) => x.nome === 'Base de cebola')!;
    expect(base).toMatchObject({ fichaId: ids.base, semFicha: false, faltaProduzirMilesimos: 1000 });
    expect(fora2.opcoes.map((o) => o.id)).toContain(ids.base);
    // Três níveis: o molho da casa 2 kg de fora → o especial que ele leva → a base que o especial leva.
    const linha3 = await comoLinha(somarDias(hoje, 5), casa.id, '2');
    const fora3 = await deFora(somarDias(hoje, 6), casa.id, '2');
    expect(comoNumeros(fora3)).toEqual(comoNumeros(linha3));
    expect(fora3.conta.preparos.map((x) => [x.nome, x.faltaProduzirMilesimos, x.semFicha])).toEqual([
      ['Base de cebola', 250, false],
      ['Molho especial', 1000, false],
    ]);
    expect(fora3.conta.avisos).toEqual([]);
  });

  it('cancelar ou estornar um lote da lista sobe a versão dela (revisão I1): a aba velha não apaga a linha que voltou nem gera de novo o lote cancelado; o Gerar só gera as linhas vistas', async () => {
    const dia = somarDias(hoje, 7);
    expect(await salvar(GERENTE(), dia, null, [['', ids.molho, '2'], ['', ids.base, '1']])).toMatchObject({ ok: true });
    let l = await ver(DONA(), dia);
    const [molho, base] = l.linhas;
    // Só a linha pedida vira lote (o formulário manda as que mostrou); a base fica na lista.
    expect(await gerarLotesDaLista(a, GERENTE(), ids.vp, { dia, versao: String(l.lista!.versao), linhas: [molho.id] }, GIL)).toMatchObject({ ok: true });
    const aba = await ver(DONA(), dia);
    expect(aba.linhas.map((x) => [x.nome, x.estado])).toEqual([['Molho cheddar', 'EM_LOTE'], ['Base de cebola', 'NA_LISTA']]);
    // Outra pessoa cancela o lote do molho pela tela do lote: a linha volta e a versão da lista sobe.
    const loteMolho = aba.linhas[0].lote!;
    const o = (await obterOrdem(a, DONA(), ids.vp, loteMolho.id))!;
    expect(await cancelarProducao(a, DONA(), ids.vp, loteMolho.id, { versao: o.ordem.versao, motivo: 'hoje não' }, GIL)).toMatchObject({ ok: true });
    l = await ver(DONA(), dia);
    expect(l.lista!.versao).toBe(aba.lista!.versao + 1);
    expect(l.linhas.map((x) => [x.nome, x.estado])).toEqual([['Molho cheddar', 'NA_LISTA'], ['Base de cebola', 'NA_LISTA']]);
    // A aba velha muda a base e salva: pelo formulário (com as linhas que ela viu) a frase diz o que voltou; sem elas, a versão barra.
    const daAbaVelha = { dia, versao: String(aba.lista!.versao), linhaIds: [base.id], fichaIds: [ids.base], quantidades: ['1,5'] };
    expect(await salvarListaDoDia(a, GERENTE(), ids.vp, { ...daAbaVelha, vistas: base.id }, GIL)).toMatchObject({
      ok: false,
      conflito: true,
      erros: { geral: `Molho cheddar voltou para a lista agora há pouco (o lote ${loteMolho.codigo} foi cancelado). Confira a lista de novo; nada foi gravado.` },
    });
    expect(await salvarListaDoDia(a, GERENTE(), ids.vp, daAbaVelha, GIL)).toMatchObject({ ok: false, conflito: true });
    // Mesmo com a versão de agora, a linha que a pessoa não viu não some em silêncio.
    expect(await salvarListaDoDia(a, GERENTE(), ids.vp, { ...daAbaVelha, versao: String(l.lista!.versao), vistas: base.id }, GIL)).toMatchObject({ ok: false, conflito: true });
    expect((await ver(DONA(), dia)).linhas.map((x) => [x.nome, x.quantidadeMilesimos])).toEqual([['Molho cheddar', 2000], ['Base de cebola', 1000]]);
    // O Gerar da aba velha não recria o lote cancelado (nem com as linhas dela, nem sem).
    const vivos = () => a.ordemProducao.count({ where: { dataPlanejada: new Date(`${dia}T00:00:00Z`), status: { not: 'CANCELADA' } } });
    expect(await gerarLotesDaLista(a, GERENTE(), ids.vp, { dia, versao: String(aba.lista!.versao), linhas: [base.id] }, GIL)).toMatchObject({ ok: false, conflito: true });
    expect(await gerarLotesDaLista(a, GERENTE(), ids.vp, { dia, versao: String(aba.lista!.versao) }, GIL)).toMatchObject({ ok: false, conflito: true });
    expect(await vivos()).toBe(0);
    // Linha pedida que não está na lista: conflito. Com a versão de agora e só a base pedida: só a base vira lote.
    expect(await gerarLotesDaLista(a, GERENTE(), ids.vp, { dia, versao: String(l.lista!.versao), linhas: [base.id, 'naoexiste1'] }, GIL)).toMatchObject({ ok: false, conflito: true });
    expect(await gerarLotesDaLista(a, GERENTE(), ids.vp, { dia, versao: String(l.lista!.versao), linhas: [base.id] }, GIL)).toMatchObject({ ok: true });
    l = await ver(DONA(), dia);
    expect(l.linhas.map((x) => [x.nome, x.estado])).toEqual([['Molho cheddar', 'NA_LISTA'], ['Base de cebola', 'EM_LOTE']]);
    expect(await vivos()).toBe(1);
    // Estornar o lote concluído também devolve a linha e sobe a versão.
    const loteBase = l.linhas[1].lote!;
    const ob = (await obterOrdem(a, DONA(), ids.vp, loteBase.id))!;
    expect(await entregarTudo(ob.requisicao!.id)).toMatchObject({ ok: true });
    const iniciar = (await obterOrdem(a, DONA(), ids.vp, loteBase.id))!;
    expect(await iniciarProducao(a, OPERADOR(), ids.vp, loteBase.id, { versao: iniciar.ordem.versao }, CAIO)).toMatchObject({ ok: true });
    const concluir = (await obterOrdem(a, DONA(), ids.vp, loteBase.id))!;
    expect(await concluirProducao(a, OPERADOR(), ids.vp, loteBase.id, { versao: concluir.ordem.versao, produzido: '1', escala: 'base', motivo: '', conservacao: '' }, CAIO)).toMatchObject({ ok: true });
    const antesDoEstorno = await ver(DONA(), dia);
    expect(antesDoEstorno.linhas[1].estado).toBe('FEITA');
    const oe = (await obterOrdem(a, DONA(), ids.vp, loteBase.id))!;
    expect(await estornarProducao(a, DONA(), ids.vp, loteBase.id, { versao: oe.ordem.versao, motivo: 'lote errado', confirmarNegativo: 'sim' }, GIL)).toMatchObject({ ok: true });
    const depois = await ver(DONA(), dia);
    expect(depois.lista!.versao).toBe(antesDoEstorno.lista!.versao + 1);
    expect(depois.linhas[1]).toMatchObject({ nome: 'Base de cebola', estado: 'NA_LISTA' });
    expect(await gerarLotesDaLista(a, GERENTE(), ids.vp, { dia, versao: String(antesDoEstorno.lista!.versao) }, GIL)).toMatchObject({ ok: false, conflito: true });
  });

  it('cancelar o lote e salvar a lista ao mesmo tempo: sem deadlock (a lista é travada antes do lote nos dois caminhos), e quem chega depois vê a versão nova', async () => {
    const dia = somarDias(hoje, 8);
    expect(await salvar(GERENTE(), dia, null, [['', ids.molho, '2'], ['', ids.base, '1']])).toMatchObject({ ok: true });
    let l = await ver(DONA(), dia);
    expect(await gerarLotesDaLista(a, GERENTE(), ids.vp, { dia, versao: String(l.lista!.versao), linhas: [l.linhas[0].id] }, GIL)).toMatchObject({ ok: true });
    l = await ver(DONA(), dia);
    const lote = l.linhas[0].lote!;
    const o = (await obterOrdem(a, DONA(), ids.vp, lote.id))!;
    const base = l.linhas[1];
    const [c, s2] = await Promise.all([
      cancelarProducao(a, DONA(), ids.vp, lote.id, { versao: o.ordem.versao, motivo: 'juntos' }, GIL),
      salvarListaDoDia(a, GERENTE(), ids.vp, { dia, versao: String(l.lista!.versao), linhaIds: [base.id], fichaIds: [ids.base], quantidades: ['2'], vistas: base.id }, GIL),
    ]);
    expect(c).toMatchObject({ ok: true });
    // O salvar ou passou antes do cancelamento (a base vira 2 kg) ou chegou depois e foi barrado — nunca apaga o molho que voltou.
    const fim = await ver(DONA(), dia);
    expect(fim.linhas.map((x) => x.nome)).toEqual(['Molho cheddar', 'Base de cebola']);
    if (s2.ok) expect(fim.linhas[1].quantidadeMilesimos).toBe(2000);
    else expect(s2).toMatchObject({ conflito: true });
  });

  it('loja sem estoque aberto (Delivery): a lista se monta, o "tem" é a frase (nunca 0) e gerar os lotes é recusado com o motivo', async () => {
    const gd = GERENTE_DELIVERY();
    expect(await salvarListaDoDia(a, gd, ids.delivery, { dia: hoje, versao: '', linhaIds: [''], fichaIds: [ids.molho], quantidades: ['2'] }, GIL)).toMatchObject({ ok: true });
    const l = (await obterListaDoDia(a, gd, ids.delivery, hoje))!;
    expect(l.estoque).toBe('NAO_ABERTO');
    expect(l.conta.apurado).toBe(false);
    expect(l.conta.motivoSemSaldo).toMatch(/O estoque da Delivery ainda não foi aberto: não há saldo para cruzar/);
    expect(l.conta.materiaPrima.every((i) => i.temMilesimos === null && i.comprarMilesimos === null)).toBe(true);
    expect(l.linhas[0].emEstoqueMilesimos).toBeNull();
    expect(l.naoGera).toMatch(/ainda não foi aberto/);
    expect(await gerarLotesDaLista(a, gd, ids.delivery, { dia: hoje, versao: String(l.lista!.versao) }, GIL)).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/ainda não foi aberto/) } });
    expect(await a.ordemProducao.count({ where: { lojaId: ids.delivery } })).toBe(0);
  });

  it('dia que passou e além de 14 dias: recusados (a lista de ontem fica para consulta)', async () => {
    expect(await salvar(GERENTE(), somarDias(hoje, -1), null, [['', ids.molho, '1']])).toMatchObject({ ok: false, erros: { geral: 'Dia que já passou: a lista fica para consulta.' } });
    expect(await salvar(GERENTE(), somarDias(hoje, 15), null, [['', ids.molho, '1']])).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/até 14 dias/) } });
    expect(await salvar(GERENTE(), 'amanha', null, [['', ids.molho, '1']])).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/Dia inválido/) } });
    const ontem = await ver(GERENTE(), somarDias(hoje, -1));
    expect(ontem.lista).toBeNull();
    expect(ontem.naoEdita).toBe('Dia que já passou: a lista fica para consulta.');
  });

  it('RLS: SQL cru no contexto de OUTRO parceiro não lê, não muda e não apaga a lista de A', async (ctx) => {
    if (!perfil.rls) return ctx.skip();
    // Debaixo do papel do tenant, no contexto de B (vale também para o superusuário: o papel não fura a RLS).
    const comoB = <T,>(fn: (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>) =>
      db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.parceiro_id', ${B.id}, true), set_config('role', 'erp_tenant', true)`;
        return fn(tx);
      });
    const antes = await a.listaProducaoItem.count();
    expect((await comoB((tx) => tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "ListaProducao"`)))[0].n).toBe(0);
    expect((await comoB((tx) => tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "ListaProducaoItem"`)))[0].n).toBe(0);
    expect(await comoB((tx) => tx.$executeRawUnsafe(`UPDATE "ListaProducaoItem" SET "quantidadeMilesimos" = 1`))).toBe(0);
    expect(await comoB((tx) => tx.$executeRawUnsafe(`DELETE FROM "ListaProducao"`))).toBe(0);
    // Inserir uma linha de B apontando a lista de A: a FK composta (parceiro, lista) não encontra a lista de A para B.
    const lista = (await a.listaProducao.findFirst({ select: { id: true } }))!;
    await expect(
      comoB((tx) => tx.$executeRawUnsafe(`INSERT INTO "ListaProducaoItem"(id,"parceiroId","listaId","fichaId","fichaNomeSnapshot","unidadeSnapshot","quantidadeMilesimos") VALUES ('x-${sufixo}', $1, $2, $3, 'x', 'KG', 1000)`, B.id, lista.id, ids.molho)),
    ).rejects.toThrow();
    expect(await a.listaProducaoItem.count()).toBe(antes);
    expect(await a.listaProducao.count()).toBeGreaterThan(0);
  });

  it('período fechado (mutante): salvar e gerar ESPERAM o fechamento do período e são recusados com a frase; o aviso aparece antes, na tela', async () => {
    const dia = somarDias(hoje, 10);
    expect(await salvar(GERENTE(), dia, null, [['', ids.molho, '1']])).toMatchObject({ ok: true });
    const v = (await ver(DONA(), dia)).lista!.versao;
    let terminou = false;
    let salvando!: Promise<unknown>;
    await a.transacao(async (tx) => {
      await travarParaFechar(tx);
      salvando = salvar(GERENTE(), dia, v, [['', ids.molho, '2']]).then((x) => ((terminou = true), x));
      await new Promise((r) => setTimeout(r, 900));
      expect(terminou, 'salvarListaDoDia terminou sem esperar o fechamento (falta travarParaEscrever)').toBe(false);
      await criarPeriodoFechadoDeTeste(tx, { nome: 'Dia de teste', inicio: dia, fim: dia });
    });
    expect(await salvando).toMatchObject({ ok: false, conflito: true, erros: { geral: expect.stringMatching(/Dia de teste já foi fechado no DRE/) } });
    expect(await gerar(GERENTE(), dia, v)).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/já foi fechado no DRE/) } });
    expect(await porNaListaDoDia(a, GERENTE(), ids.vp, { dia, versao: String(v), fichaId: ids.base, quantidade: '100' }, GIL)).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/já foi fechado no DRE/) } });
    const l = await ver(GERENTE(), dia);
    expect(l.periodoFechado).toBe('Dia de teste');
    expect(l.naoEdita).toMatch(/já foi fechado no DRE/);
    expect(l.linhas[0].quantidadeMilesimos).toBe(1000);
  });
});
