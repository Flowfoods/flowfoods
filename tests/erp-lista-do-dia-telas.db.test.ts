/**
 * ERP 3.2 · a lista do dia nas telas (a página e a action de verdade, com banco): o que cada pessoa recebe no HTML e o que as
 * actions deixam passar.
 *  - a gerente monta o rascunho (3 fichas) e vê vai usar · tem · comprar, o R$ e o botão "Confirmar a lista (3)"; a prévia não grava;
 *  - o cozinheiro (Operador) vê a lista e as quantidades, sem rascunho nem "Confirmar"; o forjado na URL é ignorado;
 *  - sem `insumos.ver` o HTML não leva "R$"; sem `compras.ver` na loja da nota o fornecedor não sai; sem `estoque.ver` só a lista;
 *  - o formulário "Pôr na lista" (f e q) redireciona para o endereço limpo; `?dia=` lixo volta para hoje; dia passado é só leitura;
 *  - confirmar pela action (parceiro e nível 1) vai para a lista com o aviso; o duplo clique não duplica; o operador forjado é recusado;
 *  - a rota `lista` não cai em `[ordemId]`; loja de fora e outro parceiro: 404; o espelho do nível 1 mostra o mesmo;
 *  - o lote da lista: "Tirar da lista" só com `producao.planejar`;
 *  - herança da 3.1: com o período de hoje fechado, entregar a requisição, devolver, concluir e estornar mostram o aviso ANTES, a barra diz
 *    "Período fechado" e o botão fica desabilitado.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-lista-do-dia-telas.db.test.ts
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
import { cadastrarInsumo } from '@/lib/erp/insumos';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { cadastrarFicha } from '@/lib/erp/fichas';
import { cadastrarFornecedor, lancarNota } from '@/lib/erp/compras';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { somarDias } from '@/lib/erp/contagem-campos';
import { concluirAbertura, contarItem, iniciarAbertura, obterContagemDeAbertura } from '@/lib/erp/estoque';
import { atenderRequisicao, criarRequisicao, obterRequisicao } from '@/lib/erp/requisicao';
import { concluirProducao, obterOrdem } from '@/lib/erp/producao';
import { confirmarLista } from '@/lib/erp/lista-do-dia';
import { resolverAlcance, type Alcance, type Permissao } from '@/lib/erp/permissoes';
import ErpListaDoDiaPage from '@/app/erp/producao/[lojaId]/lista/page';
import ErpListaDoDiaLojaPage from '@/app/erp/producao/lista/page';
import ErpLotePage from '@/app/erp/producao/[lojaId]/[ordemId]/page';
import ErpConcluirLotePage from '@/app/erp/producao/[lojaId]/[ordemId]/concluir/page';
import ErpEntregarPage from '@/app/erp/estoque/[lojaId]/requisicoes/[requisicaoId]/atender/page';
import ErpRequisicaoPage from '@/app/erp/estoque/[lojaId]/requisicoes/[requisicaoId]/page';
import ParceiroListaDoDiaPage from '@/app/rodolfo/(painel)/erp/[slug]/producao/[lojaId]/lista/page';
import * as daSessao from '@/app/erp/producao/actions';
import * as doNivel1 from '@/app/rodolfo/(painel)/erp/[slug]/producao/actions';
import { criarPeriodoFechadoDeTeste, limparParceiros, perfilDoBanco, reabrirPeriodoDeTeste, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const DIA_MS = 86_400_000;
const sp = (s: string | null | undefined) => (s ?? '').replace(/ /g, ' ');

describe.skipIf(!URL_TESTE)('ERP 3.2 · telas da lista do dia (Postgres real)', { timeout: 240_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `m${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string; slug: string; nome: string; status: string };
  let B: { id: string; slug: string; nome: string; status: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const ids: Record<string, string> = {};
  const hoje = hojeNoRio();

  const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR' | null, lojaIds: string[] | 'rede', proprio: Permissao[] | null = null): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: proprio, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const como = (alcance: Alcance, parceiro = A, cliente = a, autor = 'Gil Gerente') => {
    atual.ctx = () => ({ parceiro, alcance, cliente, bloqueio: null, podeEscrever: true, sessao: { userId: 'u-gil', autorNome: autor }, pessoa: { setores: ['GERENCIA'] } });
  };
  const DONA = () => alcanceDe('DONO', 'rede');
  const GERENTE = () => alcanceDe('GERENTE', [ids.vp]);
  const OPERADOR = () => alcanceDe('OPERADOR', [ids.vp]);
  const GERENTE_DELIVERY = () => alcanceDe('GERENTE', [ids.delivery]);
  // Gerente que não vê custos nem compras: define a lista e vê o estoque.
  const SEM_CUSTO = () => alcanceDe(null, [ids.vp], ['producao.ver', 'producao.planejar', 'producao.registrar', 'estoque.ver', 'requisicao.pedir']);
  // Cozinha: produz, mas não vê estoque nem custos.
  const COZINHA = () => alcanceDe(null, [ids.vp], ['producao.ver', 'producao.registrar']);

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
  const lista = (sp: { dia?: string; l?: string | string[]; f?: string; q?: string; feito?: string } = {}, lojaId = () => ids.vp) => ErpListaDoDiaPage({ params: { lojaId: lojaId() }, searchParams: sp });
  const TRES = () => [`${ids.molho}~5`, `${ids.caramelo}~2`, `${ids.especial}~2`];
  const contagens = async () => ({ ordens: await a.ordemProducao.count(), reqs: await a.requisicao.count(), movs: await a.movimentoEstoque.count() });

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = (await db.parceiroFlow.create({ data: { nome: 'Telas Lista A', slug: `tlista-a-${sufixo}`, status: 'ATIVO' } })) as typeof A;
    B = (await db.parceiroFlow.create({ data: { nome: 'Telas Lista B', slug: `tlista-b-${sufixo}`, status: 'ATIVO' } })) as typeof B;
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
      cheddar: { nome: 'Queijo cheddar', unidade: 'KG', conteudo: '5', preco: '94,90', conservacao: 'REFRIGERADO' },
      leite: { nome: 'Leite', unidade: 'L', conteudo: '1', preco: '5,00', conservacao: 'REFRIGERADO' },
      cebola: { nome: 'Cebola', unidade: 'KG', conteudo: '3', preco: '15,00', conservacao: 'SECO' },
      maionese: { nome: 'Maionese', unidade: 'KG', conteudo: '3', preco: '21,00', conservacao: 'REFRIGERADO' },
    })) {
      const r = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', ...campos });
      if (!r.ok) throw new Error(`${chave}: ${JSON.stringify(r)}`);
      ids[chave] = r.id;
    }
    const molho = await cadastrarFicha(
      a,
      {
        nome: 'Molho cheddar',
        tipo: 'PRE_PREPARO',
        rendimento: '2',
        rendimentoUnidade: 'kg',
        itens: [{ insumoId: ids.cheddar, quantidade: '1', unidade: 'kg' }, { insumoId: ids.leite, quantidade: '1', unidade: 'L' }, { insumoId: ids.cebola, quantidade: '300', unidade: 'g', fator: '1,18' }],
        validade: { principal: 'REFRIGERADO', linhas: { REFRIGERADO: { marcada: true, quantidade: '3', em: 'dias' }, CONGELADO: { marcada: true, quantidade: '30', em: 'dias' } } },
      },
      { tipo: 'manter' },
      'Marina',
    );
    if (!molho.ok) throw new Error(JSON.stringify(molho));
    ids.molho = molho.id;
    const antes = new Date(Date.now() - 10 * DIA_MS);
    expect((await iniciarAbertura(a, DONA(), ids.vp, 'Marina', antes)).ok).toBe(true);
    const ab = (await obterContagemDeAbertura(a, DONA(), ids.vp))!;
    const numeros: Record<string, string> = { 'Queijo cheddar': '3', Leite: '4', Cebola: '1,2', Maionese: '3', 'Molho cheddar': '0,3' };
    for (const i of ab.itens) expect((await contarItem(a, DONA(), ids.vp, { itemId: i.id, embalagens: '', solto: numeros[i.nome] ?? '0', escala: 'base', versao: i.versao }, 'Marina', { agora: antes })).ok).toBe(true);
    const v = (await a.contagem.findFirst({ where: { lojaId: ids.vp, tipo: 'ABERTURA' }, select: { versao: true } }))!.versao;
    expect((await concluirAbertura(a, DONA(), ids.vp, { versao: v, confirmarNaoContados: false }, 'Marina', antes)).ok).toBe(true);
    const acucar = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', nome: 'Açúcar', unidade: 'KG', conteudo: '1', preco: '5,00', conservacao: 'SECO' });
    if (!acucar.ok) throw new Error(JSON.stringify(acucar));
    const caramelo = await cadastrarFicha(a, { nome: 'Cebola caramelizada', tipo: 'PRE_PREPARO', rendimento: '1', rendimentoUnidade: 'kg', itens: [{ insumoId: ids.cebola, quantidade: '1,5', unidade: 'kg', fator: '1,18' }, { insumoId: acucar.id, quantidade: '100', unidade: 'g' }] }, { tipo: 'manter' }, 'Marina');
    if (!caramelo.ok) throw new Error(JSON.stringify(caramelo));
    ids.caramelo = caramelo.id;
    const especial = await cadastrarFicha(a, { nome: 'Molho especial', tipo: 'PRE_PREPARO', rendimento: '1', rendimentoUnidade: 'kg', itens: [{ subfichaId: ids.molho, quantidade: '400', unidade: 'g' }, { insumoId: ids.maionese, quantidade: '600', unidade: 'g' }] }, { tipo: 'manter' }, 'Marina');
    if (!especial.ok) throw new Error(JSON.stringify(especial));
    ids.especial = especial.id;
    // O fornecedor da última compra de cheddar (nota de 12 dias atrás, antes da abertura: não mexe no saldo).
    const forn = await cadastrarFornecedor(a, { nome: 'Laticínios Serra' }, 'Marina');
    if (!forn.ok) throw new Error(JSON.stringify(forn));
    const n = await lancarNota(a, DONA(), { lojaId: ids.vp, fornecedorId: forn.id, numero: '5001', serie: '', data: somarDias(hoje, -12), frete: '', total: '94,90', itens: [{ insumoId: ids.cheddar, embalagem: 'padrao', quantidade: '1', valor: '94,90' }] }, 'Marina');
    if (!n.ok) throw new Error(JSON.stringify(n));
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
  });

  it('a gerente monta o rascunho: vai usar · tem · comprar, R$ 35,00, "Confirmar a lista (3)"; a prévia não grava nada', async () => {
    como(GERENTE());
    const antes = await contagens();
    const h = await pagina(lista({ l: TRES() }));
    expect(h).toContain('Lista do dia · Vila da Penha');
    expect(h).toContain('Rascunho da lista');
    expect(h).toContain('Confirmar a lista (3)');
    expect(h).toContain('2 × 3 kg (6 kg)');
    expect(h).toContain('1 kg'); // açúcar
    expect(h).toContain('R$ 35,00');
    expect(h).toContain('Compra estimada');
    expect(h).toContain('Lista do dia: Cebola caramelizada 3,54 kg · Molho cheddar 885 g');
    expect(h).toContain('Já tem o suficiente (3)');
    expect(h).toContain('Produza antes de Molho especial.');
    expect(h).toContain('Tirar');
    expect(h).toContain('Pôr na lista');
    expect(await contagens()).toEqual(antes);
  });

  it('o fornecedor da última nota aparece para quem tem compras.ver na loja da nota (a gerente da Penha), agrupando o "comprar"', async () => {
    como(GERENTE());
    await criarRequisicao(a, GERENTE(), ids.vp, { setor: 'SALAO', paraDia: 'hoje', observacao: '', linhas: [{ insumoId: ids.cheddar, quantidade: '6', escala: 'base' }] }, 'Gil');
    const h = await pagina(lista({ l: TRES() }));
    expect(h).toContain('Laticínios Serra');
    expect(h).toContain('última nota');
    expect(h).toContain('Outros pedidos: Salão #');
    expect(h).toContain('Sem fornecedor conhecido');
    // Quem não tem compras.ver (o operador) nunca recebe o nome.
    como(OPERADOR());
    expect(await pagina(lista({ l: TRES() }))).not.toContain('Laticínios');
    como(SEM_CUSTO());
    expect(await pagina(lista({ l: TRES() }))).not.toContain('Laticínios');
    for (const q of await a.requisicao.findMany({ where: { setor: 'SALAO' }, select: { id: true } })) await a.requisicao.update({ where: { id: q.id }, data: { status: 'CANCELADA', canceladaEm: new Date(), motivoCancelamento: 'limpeza' } });
  });

  it('sem insumos.ver o HTML não leva "R$" nenhum; comprar continua nas quantidades', async () => {
    como(SEM_CUSTO());
    const h = await pagina(lista({ l: TRES() }));
    expect(h).toContain('Confirmar a lista (3)');
    expect(h).toContain('2 × 3 kg (6 kg)');
    expect(h).not.toContain('R$');
    expect(h).not.toContain('Compra estimada');
    // O operador (que vê custos, como a 3.1 definiu) não é o caso: o perfil sem custos é este.
  });

  it('o operador vê a lista e as quantidades, sem rascunho nem "Confirmar"; o rascunho forjado na URL é ignorado', async () => {
    como(OPERADOR());
    const h = await pagina(lista({ l: TRES() }));
    expect(h).toContain('Lista do dia · Vila da Penha');
    expect(h).not.toContain('Confirmar a lista');
    expect(h).not.toContain('Rascunho da lista');
    expect(h).not.toContain('Pôr na lista');
    expect(h).toContain('Nenhum lote na lista ainda.');
    expect(h).toContain('Quem define a lista do dia ainda não confirmou nenhum lote.');
  });

  it('a cozinha sem estoque vê só os lotes do dia (nada de vai usar, tem e comprar)', async () => {
    como(COZINHA());
    const h = await pagina(lista({ l: TRES() }));
    expect(h).toContain('Lista do dia · Vila da Penha');
    expect(h).not.toContain('Comprar');
    expect(h).not.toContain('Vai usar');
    expect(h).toContain('Seu acesso não inclui ver o estoque');
  });

  it('"Pôr na lista" (f e q) redireciona para o endereço limpo; ?dia= lixo volta para hoje; a rota "lista" não é um lote', async () => {
    como(GERENTE());
    const r = await rodar(() => lista({ f: ids.molho, q: '0,5', l: [`${ids.caramelo}~2`] }));
    expect(r).toMatchObject({ url: expect.stringContaining(`/erp/producao/${ids.vp}/lista?l=${encodeURIComponent(`${ids.caramelo}~2`)}&l=${encodeURIComponent(`${ids.molho}~0,5`)}`) });
    const lixo = await pagina(lista({ dia: "lixo'; --" }));
    expect(lixo).toContain('hoje ·');
    // Mais de 14 dias à frente: hoje também.
    expect(await pagina(lista({ dia: somarDias(hoje, 15) }))).toContain('hoje ·');
    // A escolha da loja com uma só no acesso vai direto para a lista dela.
    expect(await rodar(() => ErpListaDoDiaLojaPage())).toMatchObject({ url: `/erp/producao/${ids.vp}/lista` });
  });

  it('confirmar pela action: vai para a lista com o aviso, 3 lotes; o duplo clique não duplica; o operador forjado é recusado', async () => {
    como(OPERADOR());
    const forjado = formDe({ dia: hoje, envio: 'env-forjado-123456', l: TRES() });
    const antes = await contagens();
    const bloqueada = await daSessao.acaoConfirmarLista(ids.vp, null, forjado);
    expect(bloqueada).toMatchObject({ ok: false, erros: { geral: expect.any(String) } });
    expect(await contagens()).toEqual(antes);
    como(GERENTE());
    const form = formDe({ dia: hoje, envio: 'env-lista-12345678', l: TRES() });
    const r = await rodar(() => daSessao.acaoConfirmarLista(ids.vp, null, form));
    expect(r).toMatchObject({ url: `/erp/producao/${ids.vp}/lista?dia=${hoje}&feito=lista-confirmada` });
    const de_novo = await rodar(() => daSessao.acaoConfirmarLista(ids.vp, null, form));
    expect(de_novo).toMatchObject({ url: `/erp/producao/${ids.vp}/lista?dia=${hoje}&feito=lista-ja-confirmada` });
    const depois = await contagens();
    expect(depois.ordens - antes.ordens).toBe(3);
    expect(depois.reqs - antes.reqs).toBe(3);
    expect(depois.movs).toBe(antes.movs);
    // 31 linhas na action: nada é cortado em silêncio e nada é gravado.
    const muitas = formDe({ dia: hoje, envio: 'env-muitas-1234567', l: Array.from({ length: 31 }, () => `${ids.molho}~1`) });
    expect(await daSessao.acaoConfirmarLista(ids.vp, null, muitas)).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/passa de 30 linhas/) } });
    expect(await contagens()).toEqual(depois);
    // A lista mostra os três lotes, da lista do dia, com o aviso de confirmada.
    const h = await pagina(lista({ feito: 'lista-confirmada' }));
    expect(h).toContain('Lista confirmada');
    expect(h).toMatch(/Lote <span[^>]*>\d{6}-01<\/span>/);
    expect(h).toContain('Molho especial');
    // A prévia sem rascunho, agora pelos lotes, dá a mesma conta.
    expect(h).toContain('2 × 3 kg (6 kg)');
    expect(h).not.toContain('fora da lista');
  });

  it('o nível 1 confirma pelo espelho (com o auditLog) e vê a mesma lista; loja de fora e outro parceiro: 404', async () => {
    como(DONA());
    const h = await pagina(ParceiroListaDoDiaPage({ params: { slug: A.slug, lojaId: ids.vp }, searchParams: {} }));
    expect(h).toContain('Lista do dia · Vila da Penha');
    expect(h).toContain(A.nome);
    const antes = await contagens();
    const r = await rodar(() => doNivel1.acaoConfirmarLista(A.slug, ids.vp, null, formDe({ dia: somarDias(hoje, 1), envio: 'env-n1-1234567890', l: [`${ids.caramelo}~1`] })));
    expect(r).toMatchObject({ url: `/rodolfo/erp/${A.slug}/producao/${ids.vp}/lista?dia=${somarDias(hoje, 1)}&feito=lista-confirmada` });
    expect((await contagens()).ordens - antes.ordens).toBe(1);
    como(GERENTE_DELIVERY());
    expect(await rodar(() => lista())).toMatchObject({ erro: 'NOT_FOUND' });
    como(alcanceDe('DONO', 'rede'), B, b);
    expect(await rodar(() => lista())).toMatchObject({ erro: 'NOT_FOUND' });
  });

  it('o dia passado é só leitura: sem rascunho, sem confirmar, sem tem/comprar; o de amanhã mostra o que segue aberto de hoje', async () => {
    como(GERENTE());
    const ontem = await pagina(lista({ dia: somarDias(hoje, -1) }));
    expect(ontem).toContain('só leitura');
    expect(ontem).toContain('Dia que já passou: só consulta.');
    expect(ontem).not.toContain('Rascunho da lista');
    expect(ontem).not.toContain('Confirmar a lista');
    expect(ontem).not.toContain('Comprar');
    const amanha = await pagina(lista({ dia: somarDias(hoje, 1) }));
    expect(amanha).toContain('amanhã ·');
    expect(amanha).toContain('Outros pedidos:'); // os lotes de hoje seguem abertos
    expect(amanha).toContain('Confirmar a lista (0)');
  });

  it('o lote da lista: a gerente vê "Tirar da lista"; o operador vê a nota e nenhum botão de cancelar', async () => {
    const lote = (await a.ordemProducao.findFirst({ where: { lojaId: ids.vp, daLista: true, status: 'PLANEJADA', fichaNomeSnapshot: 'Molho especial' } }))!;
    como(GERENTE());
    const g = await pagina(ErpLotePage({ params: { lojaId: ids.vp, ordemId: lote.id }, searchParams: {} }));
    expect(g).toContain('Da lista do dia');
    expect(g).toContain('Tirar da lista');
    como(OPERADOR());
    const o = await pagina(ErpLotePage({ params: { lojaId: ids.vp, ordemId: lote.id }, searchParams: {} }));
    expect(o).toContain('Este lote veio da lista do dia: só quem define a lista o tira dela.');
    expect(o).not.toContain('Tirar da lista');
    expect(o).not.toContain('Cancelar este lote');
    // A action do operador é recusada e o lote segue planejado.
    const r = await daSessao.acaoCancelarProducao(ids.vp, lote.id, null, formDe({ versao: String(lote.versao), motivo: 'não quero' }));
    expect(r).toMatchObject({ ok: false });
    expect((await a.ordemProducao.findUnique({ where: { id: lote.id } }))!.status).toBe('PLANEJADA');
    como(GERENTE());
    const t = await rodar(() => daSessao.acaoCancelarProducao(ids.vp, lote.id, null, formDe({ versao: String(lote.versao), motivo: 'sem maionese' })));
    expect(t).toMatchObject({ url: `/erp/producao/${ids.vp}/${lote.id}?feito=lote-cancelado` });
  });

  it('herança da 3.1 · período de hoje fechado: entregar, devolver, concluir e estornar avisam ANTES; a barra diz "Período fechado" e o botão fica desabilitado', async () => {
    // Um lote concluído (para estornar) e um pendente (para entregar e concluir), todos de hoje.
    const molhoLote = (await a.ordemProducao.findFirst({ where: { lojaId: ids.vp, daLista: true, status: 'PLANEJADA', fichaNomeSnapshot: 'Molho cheddar', dataPlanejada: new Date(`${hoje}T00:00:00.000Z`) } }))!;
    const req = (await obterRequisicao(a, DONA(), ids.vp, molhoLote.requisicaoId!))!;
    const entregarTudo = (r: NonNullable<typeof req>) => atenderRequisicao(a, GERENTE(), ids.vp, r.requisicao.id, { versao: r.requisicao.versao, linhas: r.itens.filter((i) => i.faltaMilesimos > 0).map((i) => ({ itemId: i.id, quantidade: String(i.faltaMilesimos / 1000).replace('.', ','), escala: 'base' })), encerrar: false, confirmarNegativo: true }, 'Edu');
    expect(await entregarTudo(req)).toMatchObject({ ok: true });
    const o = (await obterOrdem(a, DONA(), ids.vp, molhoLote.id))!;
    expect(await concluirProducao(a, GERENTE(), ids.vp, molhoLote.id, { versao: o.ordem.versao, produzido: '4,6', escala: 'base', motivo: '', conservacao: 'REFRIGERADO' }, { nome: 'Gil Gerente' })).toMatchObject({ ok: true });
    const pendente = (await a.ordemProducao.findFirst({ where: { lojaId: ids.vp, status: 'PLANEJADA', fichaNomeSnapshot: 'Cebola caramelizada', dataPlanejada: new Date(`${hoje}T00:00:00.000Z`) } }))!;
    const reqPendente = (await obterRequisicao(a, DONA(), ids.vp, pendente.requisicaoId!))!;
    const comoPendente = await entregarTudo(reqPendente);
    expect(comoPendente).toMatchObject({ ok: true });
    // Devolver precisa de um lote ainda aberto: a requisição do salão, entregue em parte.
    const salao = await criarRequisicao(a, GERENTE(), ids.vp, { setor: 'SALAO', paraDia: 'hoje', observacao: '', linhas: [{ insumoId: ids.leite, quantidade: '1', escala: 'base' }] }, 'Gil');
    if (!salao.ok) throw new Error(JSON.stringify(salao));
    expect(await entregarTudo((await obterRequisicao(a, DONA(), ids.vp, salao.id))!)).toMatchObject({ ok: true });
    const outroPendente = await criarRequisicao(a, GERENTE(), ids.vp, { setor: 'SALAO', paraDia: 'hoje', observacao: '', linhas: [{ insumoId: ids.leite, quantidade: '1', escala: 'base' }] }, 'Gil');
    if (!outroPendente.ok) throw new Error(JSON.stringify(outroPendente));

    const fim = somarDias(hoje, 20);
    const periodo = await a.transacao((tx) => criarPeriodoFechadoDeTeste(tx, { nome: `Teste ${sufixo}`, inicio: somarDias(hoje, -20), fim }));
    try {
      como(GERENTE());
      const AVISO = /O período Teste \w+ já foi fechado|período fechado|Período fechado/i;
      // Entregar: o aviso antes de preencher, a barra diz o motivo, o botão fica desabilitado.
      const entregar = await pagina(ErpEntregarPage({ params: { lojaId: ids.vp, requisicaoId: outroPendente.id } }));
      expect(entregar).toContain(`Teste ${sufixo}`);
      expect(entregar).toContain('A baixa entra no estoque com a data de hoje');
      expect(entregar).toContain('Período fechado');
      expect(entregar).not.toContain('nada saindo');
      expect(entregar).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*Entregar e dar baixa/);
      expect(entregar).toMatch(AVISO);
      // Devolver (na requisição atendida do salão): o aviso e o botão desabilitado.
      const dev = await pagina(ErpRequisicaoPage({ params: { lojaId: ids.vp, requisicaoId: salao.id }, searchParams: {} }));
      expect(dev).toContain('A devolução entra no estoque com a data de hoje');
      expect(dev).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*Receber de volta/);
      // Concluir: a barra diz "Período fechado", não "Falta dizer quanto saiu".
      como(OPERADOR());
      const concluir = await pagina(ErpConcluirLotePage({ params: { lojaId: ids.vp, ordemId: pendente.id } }));
      expect(concluir).toContain('Período fechado');
      expect(concluir).not.toContain('Falta dizer quanto saiu');
      expect(concluir).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*Concluir e pôr no estoque/);
      // Estornar (lote concluído, quem ajusta o saldo): o aviso antes do botão, que fica desabilitado.
      como(GERENTE());
      const est = await pagina(ErpLotePage({ params: { lojaId: ids.vp, ordemId: molhoLote.id }, searchParams: {} }));
      expect(est).toContain('O estorno entra no estoque com a data de hoje');
      expect(est).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*Estornar este lote/);
      // A lista do dia avisa que concluir e entregar serão recusados, mas planejar segue valendo.
      const lst = await pagina(lista());
      expect(lst).toContain('dá para planejar a lista, mas entregar os insumos e concluir o lote serão recusados');
      expect(lst).toContain('Confirmar a lista');
      // E confirmar a lista dentro do período fechado passa: planejar não escreve no livro.
      const r = await confirmarLista(a, GERENTE(), ids.vp, { dia: somarDias(hoje, 2), linhas: [{ fichaId: ids.caramelo, quantidade: '1' }], envio: 'env-fechado-123456' }, { nome: 'Gil' });
      expect(r).toMatchObject({ ok: true, lotes: 1 });
    } finally {
      await reabrirPeriodoDeTeste(a, periodo.id);
    }
    // Reaberto: sem aviso, e a barra volta ao normal.
    como(OPERADOR());
    const livre = await pagina(ErpConcluirLotePage({ params: { lojaId: ids.vp, ordemId: pendente.id } }));
    expect(livre).toContain('Falta dizer quanto saiu');
    expect(livre).not.toContain('Período fechado');
  });
});
