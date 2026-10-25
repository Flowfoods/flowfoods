/**
 * ERP 3.1 · a produção nas telas (a página e a action de verdade, com banco): o que cada pessoa recebe no HTML e o que as
 * actions deixam passar.
 *  - o cozinheiro (Operador) planeja pela action (vai para o lote, "planejado"), vê o quadro e o lote, SEM R$: tem "ver insumos e
 *    custos" mas não vê compras na loja (decisão 460, a régua do estoque); o gerente da loja vê o R$;
 *  - o perfil de cozinha SEM custos produz, mas o HTML do lote e da conclusão não leva R$, custo por kg nem o histórico do custo;
 *  - o gerente da Delivery recebe 404 no quadro e no lote da Penha; outro parceiro, 404;
 *  - a conclusão antes da entrega mostra "Faltam sair…" e nenhum formulário; com tudo entregue, o formulário aparece;
 *  - quem só VÊ produção não planeja (a action recusa); estornar exige `estoque.ajustar` também na action;
 *  - o espelho do nível 1 abre o quadro e o lote do parceiro; loja de fora, 404;
 *  - a ficha do pré-preparo tem "Produzir" para quem registra produção, e só para ele;
 *  - a requisição do lote cita o lote, não oferece cancelar nem (depois de concluído) receber de volta.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-producao-telas.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const atual = vi.hoisted(() => ({ ctx: null as null | (() => unknown) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`REDIRECT ${url}`), { url });
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  usePathname: () => '/erp/producao',
}));
vi.mock('@/lib/erp/contexto', async () => {
  const { recusaDaAcao, exigirPermissao, pode } = await import('@/lib/erp/permissoes');
  return {
    exigirParceiroDaSessao: async () => atual.ctx!(),
    exigirParceiro: async () => atual.ctx!(),
    recusaDaAcao,
    exigirPermissao,
    pode,
    exigirPermissaoNaPagina: (ctx: { alcance: Alcance }, p: Parameters<typeof pode>[1], o?: { lojaId?: string }) => {
      if (!pode(ctx.alcance, p, o)) throw new Error('SEM_ACESSO');
    },
  };
});
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));
// `useFormState` é do React do Next; o do vitest não o tem. O formulário sai com o estado inicial, como na primeira renderização.
vi.mock('react-dom', async (orig) => ({ ...(await orig<typeof import('react-dom')>()), useFormState: (_acao: unknown, inicial: unknown) => [inicial, undefined], useFormStatus: () => ({ pending: false }) }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarInsumoDeTeste as cadastrarInsumo } from './erp-db-apoio';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { cadastrarFicha } from '@/lib/erp/fichas';
import { concluirAbertura, contarItem, iniciarAbertura, obterContagemDeAbertura } from '@/lib/erp/estoque';
import { atenderRequisicao, obterRequisicao } from '@/lib/erp/requisicao';
import { cancelarProducao, concluirProducao, listaDaProducao, obterOrdem, planejarProducao } from '@/lib/erp/producao';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance, type Permissao } from '@/lib/erp/permissoes';
import ErpProducaoPage from '@/app/erp/producao/page';
import ErpNovaProducaoLojaPage from '@/app/erp/producao/nova/page';
import ErpProducaoDaLojaPage from '@/app/erp/producao/[lojaId]/page';
import ErpNovaProducaoPage from '@/app/erp/producao/[lojaId]/nova/page';
import ErpLotePage from '@/app/erp/producao/[lojaId]/[ordemId]/page';
import ErpConcluirLotePage from '@/app/erp/producao/[lojaId]/[ordemId]/concluir/page';
import ErpRequisicaoPage from '@/app/erp/estoque/[lojaId]/requisicoes/[requisicaoId]/page';
import ErpFichaPage from '@/app/erp/fichas/[id]/page';
import ErpHistoricoPage from '@/app/erp/historico/page';
import ParceiroProducaoDaLojaPage from '@/app/rodolfo/(painel)/erp/[slug]/producao/[lojaId]/page';
import ParceiroLotePage from '@/app/rodolfo/(painel)/erp/[slug]/producao/[lojaId]/[ordemId]/page';
import * as daSessao from '@/app/erp/producao/actions';
import * as doNivel1 from '@/app/rodolfo/(painel)/erp/[slug]/producao/actions';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const DIA = 86_400_000;
const sp = (s: string | null | undefined) => (s ?? '').replace(/\u00a0/g, ' ');

describe.skipIf(!URL_TESTE)('ERP 3.1 · telas da produção (Postgres real)', { timeout: 180_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `t${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string; slug: string; nome: string; status: string };
  let B: { id: string; slug: string; nome: string; status: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const ids: Record<string, string> = {};

  const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR' | null, lojaIds: string[] | 'rede', proprio: Permissao[] | null = null): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: proprio, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const como = (alcance: Alcance, parceiro = A, cliente = a, autor = 'Caio Cozinha') => {
    atual.ctx = () => ({ parceiro, alcance, cliente, bloqueio: null, podeEscrever: true, sessao: { userId: 'u-caio', autorNome: autor }, pessoa: { setores: ['COZINHA'] } });
  };
  const OPERADOR = () => alcanceDe('OPERADOR', [ids.vp]);
  const GERENTE = () => alcanceDe('GERENTE', [ids.vp]);
  const GERENTE_DELIVERY = () => alcanceDe('GERENTE', [ids.delivery]);
  const COZINHA_SEM_CUSTO = () => alcanceDe(null, [ids.vp], ['producao.ver', 'producao.registrar', 'requisicao.pedir', 'estoque.ver', 'fichas.ver']);
  const SO_VE = () => alcanceDe(null, [ids.vp], ['producao.ver']);

  const rodar = async <T,>(fn: () => Promise<T>): Promise<T | { erro: string; url?: string }> => {
    try {
      return await fn();
    } catch (e) {
      return { erro: (e as Error).message, url: (e as { url?: string }).url };
    }
  };
  const pagina = async (el: Promise<unknown>) => sp(renderToStaticMarkup((await el) as ReactElement));
  const formDe = (campos: Record<string, string | string[]>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
    return f;
  };

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = (await db.parceiroFlow.create({ data: { nome: 'Telas Produção A', slug: `tprod-a-${sufixo}`, status: 'ATIVO' } })) as typeof A;
    B = (await db.parceiroFlow.create({ data: { nome: 'Telas Produção B', slug: `tprod-b-${sufixo}`, status: 'ATIVO' } })) as typeof B;
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
    })) {
      const r = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', ...campos });
      if (!r.ok) throw new Error(`${chave}: ${JSON.stringify(r)}`);
      ids[chave] = r.id;
    }
    const antes = new Date(Date.now() - 10 * DIA);
    const dona = alcanceDe('DONO', 'rede');
    expect((await iniciarAbertura(a, dona, ids.vp, 'Marina', antes)).ok).toBe(true);
    const ab = (await obterContagemDeAbertura(a, dona, ids.vp))!;
    const numeros: Record<string, string> = { 'Queijo cheddar': '20', Leite: '20', Cebola: '10' };
    for (const i of ab.itens) expect((await contarItem(a, dona, ids.vp, { itemId: i.id, embalagens: '', solto: numeros[i.nome], escala: 'base', versao: i.versao }, 'Marina', { agora: antes })).ok).toBe(true);
    const v = (await a.contagem.findFirst({ where: { lojaId: ids.vp, tipo: 'ABERTURA' }, select: { versao: true } }))!.versao;
    expect((await concluirAbertura(a, dona, ids.vp, { versao: v, confirmarNaoContados: false }, 'Marina', antes)).ok).toBe(true);
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
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
  });

  let LOTE: string;
  let REQ: string;

  it('o cozinheiro planeja pela action: vai para o lote ("planejado"); o quadro mostra o cartão com a situação dos insumos', async () => {
    como(OPERADOR());
    const lista = await listaDaProducao(a, OPERADOR(), ids.vp, ids.molho, '5');
    if (!lista.ok) throw new Error('lista');
    const form = formDe({ fichaId: ids.molho, quantidade_ficha: '5', paraDia: 'hoje', observacao: '', envio: 'env-tela-1234567', insumo: lista.linhas.map((l) => l.insumoId), quantidade: lista.linhas.map((l) => l.quantidade), escala: lista.linhas.map(() => 'base') });
    const r = await rodar(() => daSessao.acaoPlanejarProducao(ids.vp, null, form));
    expect(r).toMatchObject({ erro: expect.stringMatching(/^REDIRECT \/erp\/producao\/.+\/.+\?feito=planejado$/) });
    LOTE = (r as { url: string }).url.split('?')[0].split('/').pop()!;
    // Planejar o mesmo formulário de novo: o mesmo lote, sem criar outro.
    const de_novo = await rodar(() => daSessao.acaoPlanejarProducao(ids.vp, null, form));
    expect((de_novo as { url: string }).url.split('?')[0].split('/').pop()).toBe(LOTE);
    expect(await a.ordemProducao.count()).toBe(1);
    const h = await pagina(ErpProducaoDaLojaPage({ params: { lojaId: ids.vp }, searchParams: {} }));
    expect(h).toContain('Produção da Vila da Penha');
    expect(h).toContain('Molho cheddar');
    expect(h).toContain('Insumos: a entregar (requisição #1)');
    expect(h).toContain('Nova produção');
    expect(h).toContain('Nenhum lote nesta etapa');
    const o = (await obterOrdem(a, OPERADOR(), ids.vp, LOTE))!;
    REQ = o.requisicao!.id;
    expect(o.ordem.planejadaPorNome).toBe('Caio Cozinha');
  });

  it('a tela de planejar traz a lista da receita (bruta, 885 g de cebola) com a validade da ficha; a de lojas leva direto quando há uma só', async () => {
    como(OPERADOR());
    const h = await pagina(ErpNovaProducaoPage({ params: { lojaId: ids.vp }, searchParams: { ficha: ids.molho, quantas: '5' } }));
    expect(h).toContain('Molho cheddar');
    expect(h).toContain('0,885');
    expect(h).toContain('Validade da ficha: Refrigerado 3 dias · Congelado 30 dias');
    expect(h).toContain('Planejar o lote');
    // Só a ficha escolhida, sem quantidade: sem lista e sem erro vermelho.
    const sem = await pagina(ErpNovaProducaoPage({ params: { lojaId: ids.vp }, searchParams: { ficha: ids.molho } }));
    expect(sem).not.toContain('Planejar o lote');
    expect(sem).not.toContain('Quanto vai produzir: número');
    // Quantidade absurda: a frase do servidor, sem o formulário.
    const absurdo = await pagina(ErpNovaProducaoPage({ params: { lojaId: ids.vp }, searchParams: { ficha: ids.molho, quantas: '99999' } }));
    expect(absurdo).toContain('Quanto vai produzir');
    expect(absurdo).not.toContain('Planejar o lote');
    expect(await rodar(() => ErpProducaoPage())).toMatchObject({ url: `/erp/producao/${ids.vp}` });
    expect(await rodar(() => ErpNovaProducaoLojaPage({ searchParams: { ficha: ids.molho } }))).toMatchObject({ url: `/erp/producao/${ids.vp}/nova?ficha=${ids.molho}` });
  });

  it('concluir antes da entrega: a tela diz o que falta e não oferece o formulário; a requisição cita o lote e não oferece cancelar', async () => {
    como(OPERADOR());
    const h = await pagina(ErpConcluirLotePage({ params: { lojaId: ids.vp, ordemId: LOTE } }));
    expect(h).toMatch(/Faltam sair .*885 g de Cebola.* pela requisição #1: entregue ou encerre o resto\./);
    expect(h).not.toContain('Concluir e pôr no estoque');
    // A requisição de produção, vista pela dona: o aviso do lote e nenhum "Cancelar esta requisição".
    como(alcanceDe('DONO', 'rede'));
    const rq = await pagina(ErpRequisicaoPage({ params: { lojaId: ids.vp, requisicaoId: REQ }, searchParams: {} }));
    expect(rq).toMatch(/Requisição do lote \d{6}-01 \(Molho cheddar, 5 kg\)/);
    expect(rq).toContain('Abrir o lote');
    expect(rq).not.toContain('Cancelar esta requisição');
    expect(rq).toContain('Para cancelar, cancele o lote');
  });

  it('com os insumos entregues o formulário aparece (o R$ só para quem vê custos); concluir pela action grava e volta ao lote', async () => {
    const r = (await obterRequisicao(a, alcanceDe('DONO', 'rede'), ids.vp, REQ))!;
    expect(await atenderRequisicao(a, GERENTE(), ids.vp, REQ, { versao: r.requisicao.versao, linhas: r.itens.map((i) => ({ itemId: i.id, quantidade: String(i.faltaMilesimos / 1000).replace('.', ','), escala: 'base' })), encerrar: false, confirmarNegativo: false }, 'Edu')).toMatchObject({ ok: true });
    como(OPERADOR());
    const h = await pagina(ErpConcluirLotePage({ params: { lojaId: ids.vp, ordemId: LOTE } }));
    expect(h).toContain('Concluir e pôr no estoque');
    expect(h).toContain('Quanto saiu de verdade');
    expect(h).toContain('Refrigerado');
    expect(h).toContain('Congelado');
    // O operador conclui sem R$ (decisão 460): nada de custo no HTML nem no que vai para o formulário.
    for (const proibido of ['R$', 'Custo do lote', '117,81', '23,56']) expect(h, proibido).not.toContain(proibido);
    // E o dado que monta a tela já sai do servidor sem valor (o que vai para o formulário do navegador).
    const doOperador = (await obterOrdem(a, OPERADOR(), ids.vp, LOTE))!;
    expect(doOperador.custo).toBeNull();
    expect(doOperador.itensDoLote.length).toBe(3);
    expect(doOperador.itensDoLote.every((i) => i.valorCentavos === null)).toBe(true);
    expect((await obterOrdem(a, GERENTE(), ids.vp, LOTE))!.custo).toMatchObject({ totalCentavos: 11781 });
    // O gerente da loja (vê custos e compras) recebe o custo ao vivo.
    como(GERENTE());
    const ger = await pagina(ErpConcluirLotePage({ params: { lojaId: ids.vp, ordemId: LOTE } }));
    expect(ger).toContain('Custo do lote');
    expect(ger).toContain('R$ 117,81');
    // O perfil de cozinha sem "ver insumos e custos" conclui, mas não recebe o R$.
    como(COZINHA_SEM_CUSTO());
    const sem = await pagina(ErpConcluirLotePage({ params: { lojaId: ids.vp, ordemId: LOTE } }));
    expect(sem).toContain('Concluir e pôr no estoque');
    expect(sem).not.toContain('Custo do lote');
    expect(sem).not.toContain('117,81');
    expect(sem).not.toContain('23,56');
    // Concluir 4,6 kg pela action.
    como(OPERADOR());
    const o = (await obterOrdem(a, OPERADOR(), ids.vp, LOTE))!;
    const res = await rodar(() => daSessao.acaoConcluirProducao(ids.vp, LOTE, null, formDe({ versao: String(o.ordem.versao), produzido: '4,6', escala: 'base', motivo: '', conservacao: 'REFRIGERADO' })));
    expect(res).toMatchObject({ url: `/erp/producao/${ids.vp}/${LOTE}?feito=concluido` });
    // De novo (outra aba): o mesmo destino, "já concluído".
    const de_novo = await rodar(() => daSessao.acaoConcluirProducao(ids.vp, LOTE, null, formDe({ versao: String(o.ordem.versao), produzido: '4,6', escala: 'base', motivo: '', conservacao: 'REFRIGERADO' })));
    expect(de_novo).toMatchObject({ url: `/erp/producao/${ids.vp}/${LOTE}?feito=ja-concluido` });
    expect(await a.movimentoEstoque.count({ where: { tipo: 'PRODUCAO_ENTRADA' } })).toBe(1);
    // A tela de concluir de um lote concluído volta para o lote.
    expect(await rodar(() => ErpConcluirLotePage({ params: { lojaId: ids.vp, ordemId: LOTE } }))).toMatchObject({ url: `/erp/producao/${ids.vp}/${LOTE}` });
  });

  it('o lote concluído: R$ 25,61/kg, previsto R$ 23,56, 92%, diferença R$ 9,42 e a validade — para o gerente; o operador e a cozinha sem custos, sem R$', async () => {
    como(GERENTE());
    const h = await pagina(ErpLotePage({ params: { lojaId: ids.vp, ordemId: LOTE }, searchParams: {} }));
    expect(h).toContain('R$ 25,61/kg');
    expect(h).toContain('R$ 117,81 ÷ 4,6 kg');
    expect(h).toContain('R$ 23,56/kg');
    expect(h).toContain('92%');
    expect(h).toContain('faltaram 400 g');
    expect(h).toContain('R$ 9,42');
    expect(h).toMatch(/Refrigerado · 3 dias · vence \d\d\/\d\d às \d\d:\d\d/);
    expect(h).toContain('Molho cheddar na Vila da Penha agora: 4,6 kg');
    expect(h).toContain('Concluído');
    // O operador (decisão 460) e o perfil de cozinha sem custos: nada de R$ nem de custo por kg, nem no histórico do lote; a
    // quantidade, o rendimento e a validade continuam.
    for (const quem of [OPERADOR, COZINHA_SEM_CUSTO]) {
      como(quem());
      const sem = await pagina(ErpLotePage({ params: { lojaId: ids.vp, ordemId: LOTE }, searchParams: {} }));
      for (const proibido of ['R$', '117,81', '25,61', '23,56', '9,42', 'Custo do lote']) expect(sem, proibido).not.toContain(proibido);
      expect(sem).toContain('4,6 kg');
      expect(sem).toContain('92%');
      expect(sem).toMatch(/Refrigerado · 3 dias · vence/);
      const dado = (await obterOrdem(a, quem(), ids.vp, LOTE))!;
      expect(dado.custo).toBeNull();
      expect(dado.itensDoLote.every((i) => i.valorCentavos === null)).toBe(true);
      expect(dado.movimentos.length).toBe(1);
      expect(dado.movimentos.every((m) => m.valorCentavos === 0)).toBe(true);
      expect(dado.historico.some((h) => JSON.stringify(h).includes('117,81'))).toBe(false);
    }
    // E o operador não vê o botão de estornar (exige ajustar o saldo); a dona vê.
    como(OPERADOR());
    expect(await pagina(ErpLotePage({ params: { lojaId: ids.vp, ordemId: LOTE }, searchParams: {} }))).not.toContain('Estornar este lote');
    como(alcanceDe('DONO', 'rede'));
    expect(await pagina(ErpLotePage({ params: { lojaId: ids.vp, ordemId: LOTE }, searchParams: {} }))).toContain('Estornar este lote');
  });

  it('a requisição do lote concluído cita o lote e não oferece receber de volta nem cancelar', async () => {
    como(alcanceDe('DONO', 'rede'));
    const rq = await pagina(ErpRequisicaoPage({ params: { lojaId: ids.vp, requisicaoId: REQ }, searchParams: {} }));
    expect(rq).toContain('o custo dele está fechado e esta requisição não recebe mais entrega nem devolução');
    expect(rq).not.toContain('Receber de volta');
    expect(rq).not.toContain('Cancelar esta requisição');
    // A dona vê o valor de cada saída no livro (−R$ 100,00 do cheddar: 2,5 kg × R$ 40,00).
    expect(rq).toContain('−R$ 100,00');
    // O operador abre a requisição pelo lote ("Abrir a requisição"): só quantidades. A soma das saídas é o custo do lote, então
    // o valor delas também não sai do servidor (decisões 459 e 460, a régua do estoque: `compras.ver` na loja).
    como(OPERADOR());
    const doOperador = await pagina(ErpRequisicaoPage({ params: { lojaId: ids.vp, requisicaoId: REQ }, searchParams: {} }));
    expect(doOperador).toContain('o custo dele está fechado');
    for (const proibido of ['R$', '100,00', '117,81']) expect(doOperador, proibido).not.toContain(proibido);
    const dado = (await obterRequisicao(a, OPERADOR(), ids.vp, REQ))!;
    expect(dado.verValores).toBe(false);
    expect(dado.movimentos.length).toBe(3);
    expect(dado.movimentos.every((m) => m.valorCentavos === 0)).toBe(true);
    expect(dado.itens.every((i) => i.porUnidade === null)).toBe(true);
    const doGerente = (await obterRequisicao(a, GERENTE(), ids.vp, REQ))!;
    expect(doGerente.verValores).toBe(true);
    expect(doGerente.movimentos.reduce((s, m) => s + m.valorCentavos, 0)).toBe(-11781);
  });

  it('Histórico geral (filtro Produção): o custo do lote só para quem vê custos E compras (decisão 460)', async () => {
    como(alcanceDe('DONO', 'rede'));
    const dona = await pagina(ErpHistoricoPage({ searchParams: { entidade: 'OrdemProducao' } }));
    expect(dona).toContain('117,81');
    // Perfil próprio da rede com histórico, produção e custos, mas sem compras: vê o lote, não o R$.
    como(alcanceDe(null, 'rede', ['historico.ver', 'producao.ver', 'insumos.ver']));
    const semCompras = await pagina(ErpHistoricoPage({ searchParams: { entidade: 'OrdemProducao' } }));
    expect(semCompras).toContain('Molho cheddar');
    for (const proibido of ['117,81', '25,61', '9,42']) expect(semCompras, proibido).not.toContain(proibido);
  });

  it('alcance: o gerente da Delivery recebe 404 no quadro e no lote da Penha; o parceiro B não vê o lote de A', async () => {
    como(GERENTE_DELIVERY());
    expect(await rodar(() => ErpProducaoDaLojaPage({ params: { lojaId: ids.vp }, searchParams: {} }))).toEqual({ erro: 'NOT_FOUND' });
    expect(await rodar(() => ErpLotePage({ params: { lojaId: ids.vp, ordemId: LOTE }, searchParams: {} }))).toEqual({ erro: 'NOT_FOUND' });
    como(alcanceDe('DONO', 'rede'), B, b);
    expect(await rodar(() => ErpLotePage({ params: { lojaId: ids.lojaB, ordemId: LOTE }, searchParams: {} }))).toEqual({ erro: 'NOT_FOUND' });
    expect(await rodar(() => ErpLotePage({ params: { lojaId: ids.vp, ordemId: LOTE }, searchParams: {} }))).toEqual({ erro: 'NOT_FOUND' });
  });

  it('permissão nas actions: quem só vê produção não planeja nem conclui; estornar exige também ajustar o saldo', async () => {
    como(SO_VE());
    const lista = await listaDaProducao(a, OPERADOR(), ids.vp, ids.molho, '1');
    if (!lista.ok) throw new Error('lista');
    const form = formDe({ fichaId: ids.molho, quantidade_ficha: '1', paraDia: 'hoje', observacao: '', envio: 'env-so-ve-12345', insumo: lista.linhas.map((l) => l.insumoId), quantidade: lista.linhas.map((l) => l.quantidade), escala: lista.linhas.map(() => 'base') });
    const antes = await a.ordemProducao.count();
    const r = await daSessao.acaoPlanejarProducao(ids.vp, null, form);
    expect(r).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/Fale com quem cuida da equipe/) } });
    expect(await a.ordemProducao.count()).toBe(antes);
    expect(await daSessao.acaoConcluirProducao(ids.vp, LOTE, null, formDe({ versao: '1', produzido: '1' }))).toMatchObject({ ok: false });
    // O operador passa na action, mas a regra recusa o estorno (sem `estoque.ajustar`).
    como(OPERADOR());
    const e = await daSessao.acaoEstornarProducao(ids.vp, LOTE, null, formDe({ versao: '1', motivo: 'Contaminado' }));
    expect(e).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/mexe no saldo/) } });
    expect((await obterOrdem(a, OPERADOR(), ids.vp, LOTE))!.ordem.status).toBe('CONCLUIDA');
    // O gerente estorna.
    como(GERENTE(), A, a, 'Gil Gerente');
    const o = (await obterOrdem(a, GERENTE(), ids.vp, LOTE))!;
    expect(await rodar(() => daSessao.acaoEstornarProducao(ids.vp, LOTE, null, formDe({ versao: String(o.ordem.versao), motivo: 'Lote contaminado' })))).toMatchObject({ url: `/erp/producao/${ids.vp}/${LOTE}?feito=estornado` });
    const depois = await pagina(ErpLotePage({ params: { lojaId: ids.vp, ordemId: LOTE }, searchParams: { feito: 'estornado' } }));
    expect(depois).toContain('Estornado por Gil Gerente');
    expect(depois).toContain('Lote contaminado');
    expect(depois).toContain('Estornada');
  });

  it('a ficha do pré-preparo tem "Produzir" para quem registra produção, e só para ele', async () => {
    como(OPERADOR());
    expect(await pagina(ErpFichaPage({ params: { id: ids.molho }, searchParams: {} }))).toContain('Produzir este pré-preparo');
    como(alcanceDe(null, [ids.vp], ['fichas.ver', 'producao.ver']));
    expect(await pagina(ErpFichaPage({ params: { id: ids.molho }, searchParams: {} }))).not.toContain('Produzir este pré-preparo');
  });

  it('o espelho do nível 1 abre o quadro e o lote do parceiro e age pelo slug; loja de fora, 404', async () => {
    como(ALCANCE_FLOWFOODS);
    const q = await pagina(ParceiroProducaoDaLojaPage({ params: { slug: A.slug, lojaId: ids.vp }, searchParams: {} }));
    expect(q).toContain('Telas Produção A');
    expect(q).toContain('Molho cheddar');
    const l = await pagina(ParceiroLotePage({ params: { slug: A.slug, lojaId: ids.vp, ordemId: LOTE }, searchParams: {} }));
    expect(l).toContain('Estornada');
    expect(l).toContain(`/rodolfo/erp/${A.slug}/estoque/${ids.vp}/requisicoes/${REQ}`);
    expect(await rodar(() => ParceiroProducaoDaLojaPage({ params: { slug: A.slug, lojaId: ids.lojaB }, searchParams: {} }))).toEqual({ erro: 'NOT_FOUND' });
    // Planejar pelo nível 1 deixa o rastro no mesmo lugar (redirect para a base do parceiro).
    const lista = await listaDaProducao(a, ALCANCE_FLOWFOODS, ids.vp, ids.molho, '2');
    if (!lista.ok) throw new Error('lista');
    const form = formDe({ fichaId: ids.molho, quantidade_ficha: '2', paraDia: 'hoje', observacao: 'pelo nível 1', envio: 'env-nivel1-12345', insumo: lista.linhas.map((x) => x.insumoId), quantidade: lista.linhas.map((x) => x.quantidade), escala: lista.linhas.map(() => 'base') });
    const r = await rodar(() => doNivel1.acaoPlanejarProducao(A.slug, ids.vp, null, form));
    expect(r).toMatchObject({ erro: expect.stringMatching(new RegExp(`^REDIRECT /rodolfo/erp/${A.slug}/producao/${ids.vp}/.+\\?feito=planejado$`)) });
  });

  it('parceiro suspenso: a action recusa com o motivo e nada é gravado', async () => {
    como(OPERADOR());
    atual.ctx = () => ({ parceiro: A, alcance: OPERADOR(), cliente: a, bloqueio: 'Parceiro suspenso: insumos, fichas técnicas, lojas e marcas ficam bloqueados até reativar.', podeEscrever: false, sessao: { userId: 'u', autorNome: 'Caio' } });
    const antes = await a.ordemProducao.count();
    const r = await daSessao.acaoPlanejarProducao(ids.vp, null, formDe({ fichaId: ids.molho, quantidade_ficha: '1' }));
    expect(r).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/suspenso/) } });
    expect(await a.ordemProducao.count()).toBe(antes);
  });

  it('planejarProducao e concluirProducao não vazam entre parceiros: a lista da ficha de A não existe para B', async () => {
    expect(await listaDaProducao(b, alcanceDe('DONO', 'rede'), ids.lojaB, ids.molho, '1')).toMatchObject({ ok: false });
    expect(await planejarProducao(b, alcanceDe('DONO', 'rede'), ids.lojaB, { fichaId: ids.molho, quantidade: '1', paraDia: 'hoje', observacao: '', linhas: [], envio: 'env-b-1234567' }, { nome: 'Bia' })).toMatchObject({ ok: false });
    expect(await concluirProducao(b, alcanceDe('DONO', 'rede'), ids.lojaB, LOTE, { versao: 0, produzido: '1', escala: 'base', motivo: '', conservacao: '' }, { nome: 'Bia' })).toMatchObject({ ok: false });
  });

  it('E4 · lote fora de ±10%: o lote e o quadro escrevem "fora de ±10%"; a requisição encerrada com corte vira "Não saiu" no lote', async () => {
    const dona = alcanceDe('DONO', 'rede');
    como(dona);
    const lista = await listaDaProducao(a, dona, ids.vp, ids.molho, '2');
    if (!lista.ok) throw new Error('lista');
    const p = await planejarProducao(a, dona, ids.vp, { fichaId: ids.molho, quantidade: '2', paraDia: 'hoje', observacao: '', linhas: lista.linhas.map((l) => ({ insumoId: l.insumoId, quantidade: l.quantidade, escala: 'base' })), envio: 'env-fora-da-faixa-1' }, { nome: 'Marina' });
    if (!p.ok) throw new Error(JSON.stringify(p));
    const lote = p.id;
    const req = (await obterRequisicao(a, dona, ids.vp, (await obterOrdem(a, dona, ids.vp, lote))!.requisicao!.id))!;
    // Entrega tudo menos parte da cebola, e encerra o resto (como a gerência fez na jornada).
    const linhas = req.itens.map((i) => ({ itemId: i.id, quantidade: i.nome === 'Cebola' ? '0,2' : String(i.faltaMilesimos / 1000).replace('.', ','), escala: 'base' }));
    expect(await atenderRequisicao(a, GERENTE(), ids.vp, req.requisicao.id, { versao: req.requisicao.versao, linhas, encerrar: true, confirmarNegativo: true }, 'Edu')).toMatchObject({ ok: true });
    const o = (await obterOrdem(a, dona, ids.vp, lote))!;
    expect(await concluirProducao(a, dona, ids.vp, lote, { versao: o.ordem.versao, produzido: '1,6', escala: 'base', motivo: 'faltou cebola', conservacao: 'REFRIGERADO' }, { nome: 'Marina' })).toMatchObject({ ok: true });
    como(OPERADOR());
    const h = sp(await pagina(ErpLotePage({ params: { lojaId: ids.vp, ordemId: lote }, searchParams: {} })));
    expect(h).toContain('80%');
    expect(h).toContain('fora de ±10%');
    expect(h).toContain('Não saiu');
    expect(h).not.toContain('>Falta<');
    const q = await pagina(ErpProducaoDaLojaPage({ params: { lojaId: ids.vp }, searchParams: {} }));
    expect(q).toContain('fora de ±10%');
    // Lote cancelado (nada saiu): a requisição cancelada também mostra "Não saiu", sem o tom de alerta.
    const p2 = await planejarProducao(a, dona, ids.vp, { fichaId: ids.molho, quantidade: '2', paraDia: 'hoje', observacao: '', linhas: lista.linhas.map((l) => ({ insumoId: l.insumoId, quantidade: l.quantidade, escala: 'base' })), envio: 'env-cancelado-12345' }, { nome: 'Marina' });
    if (!p2.ok) throw new Error(JSON.stringify(p2));
    const o2 = (await obterOrdem(a, dona, ids.vp, p2.id))!;
    expect(await cancelarProducao(a, dona, ids.vp, p2.id, { versao: o2.ordem.versao, motivo: 'mudou o cardápio' }, { nome: 'Marina' })).toMatchObject({ ok: true });
    const hc = await pagina(ErpLotePage({ params: { lojaId: ids.vp, ordemId: p2.id }, searchParams: {} }));
    expect(hc).toContain('Não saiu');
    expect(hc).not.toMatch(/text-atencao[^>]*>[^<]*kg</);
    // O lote de 92% (dentro da faixa) não ganha a frase.
    expect(await pagina(ErpLotePage({ params: { lojaId: ids.vp, ordemId: LOTE }, searchParams: {} }))).not.toContain('fora de ±10%');
    // O quadro: para quem não planeja, a ação principal é Tarefas; para a dona, Nova produção.
    const botao = (html: string, href: string) => html.match(new RegExp(`<a[^>]*href="${href}"[^>]*>`))?.[0] ?? '';
    expect(botao(q, `/erp/producao/tarefas/${ids.vp}`)).toContain('bg-acao');
    expect(botao(q, `/erp/producao/${ids.vp}/nova`)).not.toContain('bg-acao');
    como(dona);
    const daDona = await pagina(ErpProducaoDaLojaPage({ params: { lojaId: ids.vp }, searchParams: {} }));
    expect(botao(daDona, `/erp/producao/${ids.vp}/nova`)).toContain('bg-acao');
    expect(botao(daDona, `/erp/producao/tarefas/${ids.vp}`)).not.toContain('bg-acao');
  });
});

