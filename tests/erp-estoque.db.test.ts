/**
 * ERP 1.6 · Abertura do estoque no Postgres de verdade, pelas actions de verdade:
 * - a dona abre o estoque da Vila da Penha: a lista congela os insumos ativos
 *   (com a embalagem padrão); abrir de novo, ou duas pessoas juntas, dá a
 *   mesma contagem;
 * - conta em duas sessões/pessoas (operador e dona): o número volta como foi
 *   digitado; dois contadores no mesmo item = conflito com o número e o nome
 *   de quem contou; retentativa do mesmo número = ok; recontar deixa o
 *   antes/depois no histórico;
 * - conferir e concluir: não contado só com confirmação; versão conferida;
 *   ABERTURA por item contado acima de zero com o valor pelo custo de
 *   referência (um arredondamento por item; sem preço = pendente); saldo de
 *   todos; concluir de novo e concluir em corrida não duplicam; concluir
 *   enquanto alguém salva: um dos dois vence, nunca os dois pela metade;
 * - nota lançada na loja aberta entra no razão na MESMA transação (valor +
 *   frete); nota lançada durante a contagem e nota de data anterior à
 *   abertura não movimentam; editar estorna e relança só se o efeito mudou;
 *   cancelar estorna; mudar a nota de loja estorna na de antes;
 * - livro-razão: saldo antes + quantidade = depois; saldo = soma do razão;
 *   UPDATE recusado pelo trigger; estorno duplicado ou torto recusado no banco;
 * - permissões e alcance: operador conta mas não abre/conclui; gerente da
 *   Delivery não vê nem mexe na Penha; parceiro B não enxerga nada de A.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-estoque.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const atual = vi.hoisted(() => ({ ctx: null as null | (() => unknown) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`REDIRECT ${url}`), { url });
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('@/lib/erp/contexto', async () => {
  const { recusaDaAcao, exigirPermissao, pode } = await import('@/lib/erp/permissoes');
  return { exigirParceiroDaSessao: async () => atual.ctx!(), exigirParceiro: async () => atual.ctx!(), recusaDaAcao, exigirPermissao, pode };
});
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarInsumo, mudarSituacaoInsumo } from '@/lib/erp/insumos';
import { cadastrarFicha } from '@/lib/erp/fichas';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { cadastrarFornecedor, cancelarNota, editarNota, lancarNota, obterNota } from '@/lib/erp/compras';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import {
  concluirAbertura,
  conferenciaDaAbertura,
  contarItem,
  descartarAbertura,
  iniciarAbertura,
  obterContagemDeAbertura,
  obterEstoqueDaLoja,
  saldosDoInsumo,
  situacaoDoEstoque,
} from '@/lib/erp/estoque';
import { listarHistorico } from '@/lib/erp/historico';
import { resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import { modulosDoParceiro } from '@/lib/erp/modulos';
import * as estoqueDaSessao from '@/app/erp/estoque/actions';
import { cru, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;

describe.skipIf(!URL_TESTE)('ERP 1.6 · abertura do estoque (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `e${Date.now().toString(36)}`;
  let A: { id: string; slug: string; nome: string; status: string };
  let B: { id: string; slug: string; nome: string; status: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const ids: Record<string, string> = {};
  const hoje = hojeNoRio();
  const ontem = hojeNoRio(new Date(Date.now() - 86_400_000));

  const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR', lojaIds: string[] | 'rede'): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const ctxDe = (parceiro: typeof A, alcance: Alcance, autorNome: string) => ({
    parceiro,
    alcance,
    cliente: doParceiro(parceiro.id, db),
    bloqueio: null,
    podeEscrever: true,
    sessao: { userId: 'u', autorNome },
  });
  const DONA = () => alcanceDe('DONO', 'rede');
  const OPERADOR = () => alcanceDe('OPERADOR', [ids.vp]);
  const GERENTE_DELIVERY = () => alcanceDe('GERENTE', [ids.delivery]);
  const comoDona = () => (atual.ctx = () => ctxDe(A, DONA(), 'Marina Dona'));
  const comoOperador = () => (atual.ctx = () => ctxDe(A, OPERADOR(), 'Caio Estoque'));
  const comoGerenteDelivery = () => (atual.ctx = () => ctxDe(A, GERENTE_DELIVERY(), 'Gil Delivery'));
  const rodar = async <T,>(fn: () => Promise<T>): Promise<T | { redirect: string }> => {
    try {
      return await fn();
    } catch (e) {
      const url = (e as { url?: string }).url;
      if (url) return { redirect: url };
      throw e;
    }
  };

  /** Item da contagem da loja pelo nome do insumo. */
  const itemDe = async (lojaId: string, nome: string) => (await obterContagemDeAbertura(a, DONA(), lojaId))!.itens.find((i) => i.nome === nome)!;
  const contar = (alcance: Alcance, autor: string, lojaId: string, item: { id: string; versao: number }, embalagens: string, solto: string, escala = 'base') =>
    contarItem(a, alcance, lojaId, { itemId: item.id, embalagens, solto, escala, versao: item.versao }, autor);
  const saldo = async (lojaId: string, insumoId: string) =>
    (await a.saldoEstoque.findFirst({ where: { lojaId, insumoId }, select: { quantidadeMilesimos: true, valorCentavos: true } })) ?? null;
  const notaSimples = (numero: string, data: string, embalagens: string, valor: string, frete = '', lojaId = ids.vp) => ({
    lojaId,
    fornecedorId: ids.fornecedor,
    numero,
    serie: '',
    data,
    frete,
    total: (() => {
      const c = (t: string) => (t ? Number(t.replace(',', '.')) * 100 : 0);
      const tot = Math.round(c(valor) + c(frete));
      return `${Math.trunc(tot / 100)},${String(tot % 100).padStart(2, '0')}`;
    })(),
    itens: [{ insumoId: ids.cheddar, embalagem: 'padrao', quantidade: embalagens, valor }],
  });
  /** Saldo = soma do razão, e antes + quantidade = depois em cada movimento (conferido no banco). */
  const razaoCoerente = async () => {
    const [r] = await db.$queryRawUnsafe<{ divergentes: number; quebrados: number }[]>(
      `SELECT
         (SELECT count(*)::int FROM "SaldoEstoque" s WHERE s."parceiroId" = $1 AND (s."quantidadeMilesimos", s."valorCentavos") <>
            (SELECT coalesce(sum(m."quantidadeMilesimos"), 0)::int, coalesce(sum(m."valorCentavos"), 0)::int FROM "MovimentoEstoque" m
              WHERE m."parceiroId" = s."parceiroId" AND m."lojaId" = s."lojaId" AND m."insumoId" = s."insumoId")) AS divergentes,
         (SELECT count(*)::int FROM "MovimentoEstoque" m WHERE m."parceiroId" = $1 AND m."saldoAntesMilesimos" + m."quantidadeMilesimos" <> m."saldoDepoisMilesimos") AS quebrados`,
      A.id,
    );
    return r;
  };

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Estoque A', slug: `estoque-a-${sufixo}`, status: 'ATIVO' } });
    B = await db.parceiroFlow.create({ data: { nome: 'Estoque B', slug: `estoque-b-${sufixo}`, status: 'ATIVO' } });
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    for (const [chave, nome] of [['vp', 'Vila da Penha'], ['delivery', 'Delivery']] as const) {
      const r = await cadastrarLoja(a, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
    }
    for (const [chave, campos] of Object.entries({
      cheddar: { nome: 'Cheddar fatiado', unidade: 'KG', conteudo: '5', preco: '89,90', frete: '5,00', conservacao: 'REFRIGERADO' },
      pao: { nome: 'Pão brioche', unidade: 'UN', conteudo: '12', preco: '18,00' },
      carne: { nome: 'Carne moída', unidade: 'KG', conteudo: '1', preco: '42,00', conservacao: 'CONGELADO' },
      batata: { nome: 'Batata', unidade: 'KG', conteudo: '2', semPreco: 'on' },
      ketchup: { nome: 'Ketchup sachê', unidade: 'UN', conteudo: '100', preco: '20,00' },
      guardanapo: { nome: 'Guardanapo', unidade: 'UN', conteudo: '500', preco: '15,00', tipo: 'EMBALAGEM' },
      antigo: { nome: 'Insumo antigo', unidade: 'KG', conteudo: '1', preco: '1,00' },
    })) {
      const r = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', ...campos });
      if (!r.ok) throw new Error(`${chave}: ${JSON.stringify(r)}`);
      ids[chave] = r.id;
    }
    expect((await mudarSituacaoInsumo(a, ids.antigo, false, 'não usamos mais')).ok).toBe(true);
    const molho = await cadastrarFicha(a, { nome: 'Molho cheddar', tipo: 'PRE_PREPARO', rendimento: '2', rendimentoUnidade: 'kg', itens: [{ insumoId: ids.cheddar, quantidade: '1', unidade: 'kg' }] }, { tipo: 'manter' }, 'Marina');
    if (!molho.ok) throw new Error(JSON.stringify(molho));
    ids.molho = (await a.insumo.findFirst({ where: { tipo: 'PRE_PREPARO' }, select: { id: true } }))!.id;
    const f = await cadastrarFornecedor(a, { nome: 'Laticínios Rio' }, 'Marina');
    if (!f.ok) throw new Error('fornecedor');
    ids.fornecedor = f.id;
    const lb = await cadastrarLoja(b, { nome: 'Loja B' }, 'Bia');
    if (!lb.ok) throw new Error(JSON.stringify(lb));
    ids.lojaB = lb.id;
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
  });

  it('o módulo Estoque sai de "em breve": dona, gerente e operador veem (cada um as telas que pode)', () => {
    const doOperador = modulosDoParceiro(alcanceDe('OPERADOR', ['x']));
    const estoque = doOperador.find((m) => m.chave === 'estoque')!;
    expect(estoque.href).toBe('/erp/estoque');
    expect(estoque.fase).toBeUndefined();
  });

  it('sem estoque aberto, a nota não mexe no estoque (como na 1.5)', async () => {
    const r = await lancarNota(a, DONA(), notaSimples('10', ontem, '1', '90,00'), 'Marina');
    expect(r.ok).toBe(true);
    ids.notaAntes = (r as { id: string }).id;
    expect(await a.movimentoEstoque.count()).toBe(0);
    expect((await obterNota(a, DONA(), ids.notaAntes))!.estoque.frase).toMatch(/ainda não foi aberto/);
  });

  it('operador não abre o estoque (action recusada, nada gravado); gerente da Delivery não alcança a Penha', async () => {
    comoOperador();
    expect(await rodar(() => estoqueDaSessao.acaoIniciarAbertura(ids.vp, null))).toMatchObject({ erros: { geral: expect.stringMatching(/ajustar saldo/) } });
    comoGerenteDelivery();
    expect(await rodar(() => estoqueDaSessao.acaoIniciarAbertura(ids.vp, null))).toMatchObject({ erros: { geral: 'Essa loja não está no seu acesso.' } });
    // A regra confere de novo, sem a action.
    expect(await iniciarAbertura(a, GERENTE_DELIVERY(), ids.vp, 'Gil')).toMatchObject({ ok: false, naoEncontrado: true });
    expect(await a.contagem.count()).toBe(0);
    expect((await situacaoDoEstoque(a, GERENTE_DELIVERY())).map((l) => l.nome)).toEqual(['Delivery']);
  });

  it('a dona abre o estoque da Penha: lista congelada dos insumos ATIVOS, com a embalagem padrão; abrir de novo dá a mesma', async () => {
    comoDona();
    const r = await rodar(() => estoqueDaSessao.acaoIniciarAbertura(ids.vp, null));
    expect(r).toEqual({ redirect: `/erp/estoque/${ids.vp}/abertura?feito=iniciada` });
    const c = (await obterContagemDeAbertura(a, DONA(), ids.vp))!;
    ids.contagem = c.contagem!.id;
    expect(c.itens.map((i) => i.nome)).toEqual(['Batata', 'Carne moída', 'Cheddar fatiado', 'Guardanapo', 'Ketchup sachê', 'Molho cheddar', 'Pão brioche']);
    expect(c.itens.find((i) => i.nome === 'Cheddar fatiado')).toMatchObject({ conservacao: 'REFRIGERADO', embalagem: { nome: 'embalagem de 5 kg', conteudoMilesimos: 5000 }, contadoMilesimos: null, texto: 'Não contado' });
    expect(c.itens.find((i) => i.nome === 'Carne moída')!.embalagem).toBeNull();
    expect(c.itens.find((i) => i.nome === 'Molho cheddar')!.embalagem).toBeNull();
    expect((await iniciarAbertura(a, DONA(), ids.vp, 'Marina'))).toEqual({ ok: true, id: ids.contagem, jaFeito: true });
    expect(await a.contagem.count({ where: { lojaId: ids.vp } })).toBe(1);
    // Insumo criado depois de começar não entra na lista (congelada).
    const novo = await cadastrarInsumo(a, { nome: 'Picles', tipo: 'INGREDIENTE', unidade: 'KG', escala: 'base', conteudo: '1', preco: '10,00' });
    expect(novo.ok).toBe(true);
    expect((await obterContagemDeAbertura(a, DONA(), ids.vp))!.itens).toHaveLength(7);
    expect((await situacaoDoEstoque(a, DONA())).find((l) => l.id === ids.vp)).toMatchObject({ estado: 'EM_CONTAGEM', contagem: { contados: 0, total: 7 } });
  });

  it('duas pessoas clicam "Abrir estoque" ao mesmo tempo na Delivery: uma contagem só', async () => {
    const [x, y] = await Promise.all([iniciarAbertura(a, DONA(), ids.delivery, 'Marina'), iniciarAbertura(a, DONA(), ids.delivery, 'Gil')]);
    expect(x.ok && y.ok).toBe(true);
    expect((x as { id: string }).id).toBe((y as { id: string }).id);
    expect(await a.contagem.count({ where: { lojaId: ids.delivery } })).toBe(1);
  });

  it('nota lançada DURANTE a contagem não mexe no estoque (a contagem inclui o que já está na loja)', async () => {
    const r = await lancarNota(a, DONA(), notaSimples('11', hoje, '1', '95,00'), 'Marina');
    expect(r.ok).toBe(true);
    ids.notaDurante = (r as { id: string }).id;
    expect(await a.movimentoEstoque.count()).toBe(0);
  });

  it('contar em duas sessões: o operador (pela action) e a dona; o número volta como foi digitado', async () => {
    comoOperador();
    let ched = await itemDe(ids.vp, 'Cheddar fatiado');
    const r = await estoqueDaSessao.acaoContarItem(ids.vp, { itemId: ched.id, embalagens: '3', solto: '2,4', escala: 'base', versao: ched.versao });
    expect(r).toMatchObject({ ok: true, item: { contadoMilesimos: 17400, texto: '3 × embalagem de 5 kg + 2,4 kg = 17,4 kg', por: 'Caio Estoque' } });
    // Número inválido: frase no campo, nada salvo.
    ched = await itemDe(ids.vp, 'Cheddar fatiado');
    expect(await estoqueDaSessao.acaoContarItem(ids.vp, { itemId: ched.id, embalagens: 'três', solto: '', escala: 'base', versao: ched.versao })).toMatchObject({ ok: false, erros: { embalagens: expect.any(String) } });
    // Operador da Penha não conta na Delivery.
    const daDelivery = (await obterContagemDeAbertura(a, DONA(), ids.delivery))!.itens[0];
    expect(await estoqueDaSessao.acaoContarItem(ids.delivery, { itemId: daDelivery.id, embalagens: '', solto: '1', escala: 'base', versao: 0 })).toMatchObject({ ok: false, erros: { geral: 'Essa loja não está no seu acesso.' } });
    // Item de outra loja pela loja errada: não existe.
    expect(await contarItem(a, DONA(), ids.vp, { itemId: daDelivery.id, embalagens: '', solto: '1', escala: 'base', versao: 0 }, 'Marina')).toMatchObject({ ok: false });

    // Segunda sessão: a dona.
    const pao = await itemDe(ids.vp, 'Pão brioche');
    expect(await contar(DONA(), 'Marina Dona', ids.vp, pao, '2', '5')).toMatchObject({ ok: true, item: { contadoMilesimos: 29000 } });
    const molho = await itemDe(ids.vp, 'Molho cheddar');
    expect(await contar(DONA(), 'Marina Dona', ids.vp, molho, '', '800', 'menor')).toMatchObject({ ok: true, item: { contadoMilesimos: 800, campos: { solto: '800', escala: 'menor' } } });
    const batata = await itemDe(ids.vp, 'Batata');
    expect(await contar(DONA(), 'Marina Dona', ids.vp, batata, '2', '')).toMatchObject({ ok: true, item: { contadoMilesimos: 4000 } });
    const guard = await itemDe(ids.vp, 'Guardanapo');
    expect(await contar(DONA(), 'Marina Dona', ids.vp, guard, '', '0')).toMatchObject({ ok: true, item: { contadoMilesimos: 0, texto: '0 un' } });
    // Reaberta em outra sessão: os campos voltam como digitados.
    expect((await itemDe(ids.vp, 'Cheddar fatiado')).campos).toEqual({ embalagens: '3', solto: '2,4', escala: 'base' });
  });

  it('dois contadores no mesmo item: o segundo recebe o número e o nome do primeiro; retentativa do mesmo número é ok; recontar fica no histórico', async () => {
    const carne = await itemDe(ids.vp, 'Carne moída'); // versão 0 nas duas telas
    expect(await contar(OPERADOR(), 'Caio Estoque', ids.vp, carne, '', '3,5')).toMatchObject({ ok: true });
    const conflito = await contar(DONA(), 'Marina Dona', ids.vp, carne, '', '4');
    expect(conflito).toMatchObject({ ok: false, erros: { geral: 'Caio Estoque contou este item agora há pouco: 3,5 kg.' }, conflito: { item: { contadoMilesimos: 3500, por: 'Caio Estoque' } } });
    // A retentativa do operador (rede caiu depois de gravar): mesmo número, versão velha = ok.
    expect(await contar(OPERADOR(), 'Caio Estoque', ids.vp, carne, '', '3,5')).toMatchObject({ ok: true, item: { contadoMilesimos: 3500 } });
    // A dona escolhe "usar o meu" com a versão nova: grava e deixa o antes/depois.
    const nova = (conflito as { conflito: { item: { versao: number; id: string } } }).conflito.item;
    expect(await contar(DONA(), 'Marina Dona', ids.vp, nova, '', '4')).toMatchObject({ ok: true, item: { contadoMilesimos: 4000, por: 'Marina Dona' } });
    const [h] = await listarHistorico(a, { de: [{ entidade: 'ContagemItem', ids: [carne.id] }] });
    expect(h).toMatchObject({ acao: 'RECONTOU', autorNome: 'Marina Dona', alvo: 'Carne moída' });
    expect(h.mudancas).toEqual([{ campo: 'contado', antes: '3,5 kg (Caio Estoque)', depois: '4 kg' }]);
    // A volta para 3,5 kg (combinado: a dona errou).
    const agora = await itemDe(ids.vp, 'Carne moída');
    expect(await contar(DONA(), 'Marina Dona', ids.vp, agora, '', '3,5')).toMatchObject({ ok: true });
  });

  it('conferência: contados, zerados, não contados, valor pelo custo de referência e o que está sem preço', async () => {
    const c = (await conferenciaDaAbertura(a, DONA(), ids.vp))!;
    expect(c.resumo).toEqual({ total: 7, contados: 6, zerados: 1, naoContados: 1 });
    // Custo de referência = último preço pago (1.5): a nota lançada durante a contagem (R$ 95,00 por 5 kg).
    // Cheddar 17,4 kg a R$ 19,00/kg = R$ 330,60; pão 29 un a R$ 18,00/12 = R$ 43,50; carne 3,5 kg a
    // R$ 42,00 = R$ 147,00; molho 800 g a R$ 9,50/kg (1 kg de cheddar rende 2 kg) = R$ 7,60; batata sem preço (pendente).
    expect(c.valorCentavos).toBe(33060 + 4350 + 14700 + 760);
    expect(c.semCusto.map((l) => l.nome)).toEqual(['Batata']);
    expect(c.linhas.filter((l) => l.contadoMilesimos === null).map((l) => l.nome)).toEqual(['Ketchup sachê']);
    expect(c.notasDeHoje).toBe(1);
  });

  it('concluir: operador não pode; sem confirmar os não contados, recusa; versão velha, recusa', async () => {
    comoOperador();
    const c = (await conferenciaDaAbertura(a, DONA(), ids.vp))!;
    const form = new FormData();
    form.set('versao', String(c.contagem!.versao));
    form.set('confirmarNaoContados', 'sim');
    expect(await rodar(() => estoqueDaSessao.acaoConcluirAbertura(ids.vp, null, form))).toMatchObject({ erros: { geral: expect.stringMatching(/ajustar saldo/) } });
    comoDona();
    const semConfirmar = new FormData();
    semConfirmar.set('versao', String(c.contagem!.versao));
    expect(await rodar(() => estoqueDaSessao.acaoConcluirAbertura(ids.vp, null, semConfirmar))).toMatchObject({ erros: { confirmarNaoContados: '1 insumo não foi contado. Conte ou confirme que ele entra com zero.' } });
    const velha = new FormData();
    velha.set('versao', String(c.contagem!.versao - 1));
    velha.set('confirmarNaoContados', 'sim');
    expect(await rodar(() => estoqueDaSessao.acaoConcluirAbertura(ids.vp, null, velha))).toMatchObject({ conflito: true, erros: { geral: expect.stringMatching(/mudou depois que você conferiu/) } });
    expect(await a.movimentoEstoque.count()).toBe(0);
    expect((await a.contagem.findUnique({ where: { id: ids.contagem } }))!.status).toBe('ABERTA');
  });

  it('concluir em corrida (clique duplo): um movimento por item contado, saldo de todos, valor snapshot, histórico; de novo = já feito', async () => {
    comoDona();
    const c = (await conferenciaDaAbertura(a, DONA(), ids.vp))!;
    const form = () => {
      const f = new FormData();
      f.set('versao', String(c.contagem!.versao));
      f.set('confirmarNaoContados', 'sim');
      return f;
    };
    const [x, y] = await Promise.all([rodar(() => estoqueDaSessao.acaoConcluirAbertura(ids.vp, null, form())), rodar(() => estoqueDaSessao.acaoConcluirAbertura(ids.vp, null, form()))]);
    expect([x, y].map((r) => (r as { redirect: string }).redirect).sort()).toEqual([`/erp/estoque/${ids.vp}?feito=aberto`, `/erp/estoque/${ids.vp}?feito=ja-aberto`]);
    const movs = await a.movimentoEstoque.findMany({ where: { lojaId: ids.vp }, orderBy: { insumoNomeSnapshot: 'asc' } });
    expect(movs.map((m) => [m.tipo, m.insumoNomeSnapshot, m.quantidadeMilesimos, m.valorCentavos, m.saldoAntesMilesimos, m.saldoDepoisMilesimos])).toEqual([
      ['ABERTURA', 'Batata', 4000, 0, 0, 4000],
      ['ABERTURA', 'Carne moída', 3500, 14700, 0, 3500],
      ['ABERTURA', 'Cheddar fatiado', 17400, 33060, 0, 17400],
      ['ABERTURA', 'Molho cheddar', 800, 760, 0, 800],
      ['ABERTURA', 'Pão brioche', 29000, 4350, 0, 29000],
    ]);
    expect(movs.every((m) => m.contagemItemId && m.chaveIdempotencia?.startsWith('abertura:'))).toBe(true);
    expect(await a.saldoEstoque.count({ where: { lojaId: ids.vp } })).toBe(7);
    expect(await saldo(ids.vp, ids.ketchup)).toEqual({ quantidadeMilesimos: 0, valorCentavos: 0 });
    const fechada = (await a.contagem.findUnique({ where: { id: ids.contagem } }))!;
    expect(fechada).toMatchObject({ status: 'FECHADA', valorTotalCentavos: 52870, naoContadosNoFechamento: 1, fechadaPorNome: 'Marina Dona' });
    const [h] = await listarHistorico(a, { de: [{ entidade: 'Contagem', ids: [ids.contagem] }] });
    expect(h).toMatchObject({ acao: 'CONCLUIU', motivo: '1 não contados entraram com zero (confirmado).' });
    expect(await concluirAbertura(a, DONA(), ids.vp, { versao: 0, confirmarNaoContados: true }, 'Marina')).toEqual({ ok: true, id: ids.contagem, jaFeito: true });
    expect(await a.movimentoEstoque.count({ where: { lojaId: ids.vp } })).toBe(5);
    expect(await razaoCoerente()).toEqual({ divergentes: 0, quebrados: 0 });
  });

  it('depois de aberto: contar não entra mais; abrir de novo é recusado; descartar também', async () => {
    const ched = await itemDe(ids.vp, 'Cheddar fatiado');
    expect(await contar(DONA(), 'Marina Dona', ids.vp, ched, '9', '')).toMatchObject({ ok: false, fechada: true, erros: { geral: expect.stringMatching(/já foi concluída por Marina Dona/) } });
    expect(await iniciarAbertura(a, DONA(), ids.vp, 'Marina')).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/já está aberto/) } });
    expect(await descartarAbertura(a, DONA(), ids.vp, 'errei tudo', 'Marina')).toMatchObject({ ok: false });
  });

  it('a tela do saldo: quantidade e valor por insumo pelo custo de referência; total com o pendente à parte; razão recente', async () => {
    const e = (await obterEstoqueDaLoja(a, DONA(), ids.vp))!;
    expect(e.estado).toBe('ABERTO');
    expect(e.linhas.find((l) => l.nome === 'Cheddar fatiado')).toMatchObject({ quantidadeMilesimos: 17400, valorCentavos: 33060 });
    expect(e.linhas.find((l) => l.nome === 'Batata')).toMatchObject({ quantidadeMilesimos: 4000, valorCentavos: null });
    expect(e.total).toEqual({ centavos: 52870, pendentes: 1 });
    expect(e.movimentos).toHaveLength(5);
    expect((await obterEstoqueDaLoja(a, DONA(), ids.vp, { comSaldo: true }))!.linhas).toHaveLength(5);
    expect((await obterEstoqueDaLoja(a, DONA(), ids.vp, { q: 'ched' }))!.linhas.map((l) => l.nome)).toEqual(['Cheddar fatiado', 'Molho cheddar']);
    // Gerente da Delivery: a Penha não existe para ele, nem no detalhe do insumo.
    expect(await obterEstoqueDaLoja(a, GERENTE_DELIVERY(), ids.vp)).toBeNull();
    expect((await saldosDoInsumo(a, GERENTE_DELIVERY(), ids.cheddar)).map((s) => s.loja)).toEqual(['Delivery']);
    expect(await saldosDoInsumo(a, DONA(), ids.cheddar)).toEqual([
      { lojaId: ids.delivery, loja: 'Delivery', estado: 'EM_CONTAGEM', quantidadeMilesimos: null, valorCentavos: null },
      { lojaId: ids.vp, loja: 'Vila da Penha', estado: 'ABERTO', quantidadeMilesimos: 17400, valorCentavos: 33060 },
    ]);
    // Operador vê o estoque da loja dele.
    expect((await obterEstoqueDaLoja(a, OPERADOR(), ids.vp))!.estado).toBe('ABERTO');
  });

  it('nota lançada na Penha aberta entra no estoque na MESMA transação (valor + frete); o saldo sobe', async () => {
    const r = await lancarNota(a, DONA(), notaSimples('20', hoje, '2', '180,00', '4,00'), 'Marina');
    expect(r.ok).toBe(true);
    ids.notaDepois = (r as { id: string }).id;
    const movs = await a.movimentoEstoque.findMany({ where: { notaId: ids.notaDepois } });
    expect(movs.map((m) => [m.tipo, m.quantidadeMilesimos, m.valorCentavos, m.saldoAntesMilesimos, m.saldoDepoisMilesimos, m.motivo])).toEqual([
      ['ENTRADA_COMPRA', 10000, 18400, 17400, 27400, 'Nota 20 · Padrão · 5 kg'],
    ]);
    expect(await saldo(ids.vp, ids.cheddar)).toEqual({ quantidadeMilesimos: 27400, valorCentavos: 33060 + 18400 });
    const n = (await obterNota(a, DONA(), ids.notaDepois))!;
    expect(n.estoque.frase).toBe('Entrou no estoque da Vila da Penha.');
    expect(n.estoque.movimentos).toHaveLength(1);
    expect(await razaoCoerente()).toEqual({ divergentes: 0, quebrados: 0 });
  });

  it('nota com data anterior à abertura, digitada depois: não movimenta (já estava na contagem), e a nota diz isso', async () => {
    const r = await lancarNota(a, DONA(), notaSimples('21', ontem, '1', '90,00'), 'Marina');
    expect(r.ok).toBe(true);
    const id = (r as { id: string }).id;
    expect(await a.movimentoEstoque.count({ where: { notaId: id } })).toBe(0);
    expect((await obterNota(a, DONA(), id))!.estoque.frase).toMatch(/data da nota é anterior à abertura do estoque da Vila da Penha/);
    // E a lançada durante a contagem, mesmo editada depois, segue fora (a contagem já incluiu).
    const d = (await obterNota(a, DONA(), ids.notaDurante))!;
    expect(d.estoque.frase).toMatch(/lançada antes da abertura/);
    const e = await editarNota(a, DONA(), ids.notaDurante, { ...notaSimples('11', hoje, '2', '190,00'), versao: d.versao }, 'Marina');
    expect(e.ok).toBe(true);
    expect(await a.movimentoEstoque.count({ where: { notaId: ids.notaDurante } })).toBe(0);
  });

  it('editar a nota de loja aberta: estorna o que valia e entra o novo; mudar só o número não mexe no razão', async () => {
    let n = (await obterNota(a, DONA(), ids.notaDepois))!;
    const r = await editarNota(a, DONA(), ids.notaDepois, { ...notaSimples('20', hoje, '3', '270,00', '4,00'), versao: n.versao }, 'Marina');
    expect(r.ok).toBe(true);
    const movs = await a.movimentoEstoque.findMany({ where: { notaId: ids.notaDepois }, orderBy: [{ criadoEm: 'asc' }, { quantidadeMilesimos: 'asc' }] });
    expect(movs.map((m) => [m.quantidadeMilesimos, m.valorCentavos, !!m.estornoDeId])).toEqual([
      [10000, 18400, false],
      [-10000, -18400, true],
      [15000, 27400, false],
    ]);
    expect(movs[1].estornoDeId).toBe(movs[0].id);
    expect(movs[1].motivo).toBe('Nota 20 alterada');
    expect(await saldo(ids.vp, ids.cheddar)).toEqual({ quantidadeMilesimos: 32400, valorCentavos: 33060 + 27400 });
    n = (await obterNota(a, DONA(), ids.notaDepois))!;
    const s = await editarNota(a, DONA(), ids.notaDepois, { ...notaSimples('20B', hoje, '3', '270,00', '4,00'), versao: n.versao }, 'Marina');
    expect(s.ok).toBe(true);
    expect(await a.movimentoEstoque.count({ where: { notaId: ids.notaDepois } })).toBe(3);
    expect(await razaoCoerente()).toEqual({ divergentes: 0, quebrados: 0 });
  });

  it('cancelar a nota: estorno no razão, o saldo volta ao da abertura; o estorno aparece na nota e no estoque', async () => {
    const r = await cancelarNota(a, DONA(), ids.notaDepois, 'Devolvida ao fornecedor', 'Marina');
    expect(r.ok).toBe(true);
    expect(await saldo(ids.vp, ids.cheddar)).toEqual({ quantidadeMilesimos: 17400, valorCentavos: 33060 });
    const n = (await obterNota(a, DONA(), ids.notaDepois))!;
    expect(n.estoque.frase).toMatch(/foi estornado/);
    expect(n.estoque.movimentos.filter((m) => m.estorno)).toHaveLength(2);
    const ultimo = (await obterEstoqueDaLoja(a, DONA(), ids.vp))!.movimentos[0];
    expect(ultimo).toMatchObject({ tipo: 'ENTRADA_COMPRA', estorno: true, quantidadeMilesimos: -15000, antes: 32400, depois: 17400, motivo: 'Nota 20B cancelada: Devolvida ao fornecedor' });
    expect(await razaoCoerente()).toEqual({ divergentes: 0, quebrados: 0 });
  });

  it('mudar a nota de loja (Penha aberta → Delivery em contagem): estorna na Penha e não entra na Delivery', async () => {
    const r = await lancarNota(a, DONA(), notaSimples('30', hoje, '1', '95,00'), 'Marina');
    const id = (r as { id: string }).id;
    expect(await saldo(ids.vp, ids.cheddar)).toMatchObject({ quantidadeMilesimos: 22400 });
    const n = (await obterNota(a, DONA(), id))!;
    expect((await editarNota(a, DONA(), id, { ...notaSimples('30', hoje, '1', '95,00', '', ids.delivery), versao: n.versao }, 'Marina')).ok).toBe(true);
    expect(await saldo(ids.vp, ids.cheddar)).toMatchObject({ quantidadeMilesimos: 17400 });
    expect(await a.movimentoEstoque.count({ where: { lojaId: ids.delivery } })).toBe(0);
    expect(await razaoCoerente()).toEqual({ divergentes: 0, quebrados: 0 });
  });

  it('livro-razão no banco: UPDATE recusado; estorno duplicado e estorno torto recusados', async () => {
    await expect(cru(db, perfil, A.id, `UPDATE "MovimentoEstoque" SET "motivo" = 'mexido' WHERE "parceiroId" = $1`, A.id)).rejects.toThrow(/só aceita INSERT/);
    const original = (await a.movimentoEstoque.findFirst({ where: { tipo: 'ABERTURA', insumoNomeSnapshot: 'Carne moída' } }))!;
    const insere = (q: number, v: number, chave: string) =>
      cru(
        db,
        perfil,
        A.id,
        `INSERT INTO "MovimentoEstoque" ("id","parceiroId","lojaId","insumoId","tipo","quantidadeMilesimos","valorCentavos","saldoAntesMilesimos","saldoDepoisMilesimos","insumoNomeSnapshot","unidadeSnapshot","chaveIdempotencia","contagemItemId","estornoDeId")
         VALUES ($1,$2,$3,$4,'ABERTURA',$5,$6,3500,3500 + $5,'Carne moída','KG',$7,$8,$9)`,
        `t${chave}`,
        A.id,
        ids.vp,
        ids.carne,
        q,
        v,
        chave,
        original.contagemItemId,
        original.id,
      );
    await expect(insere(-1000, -14700, 'torto')).rejects.toThrow(/espelho exato/);
    // Abertura negativa sem ser estorno: o CHECK do sinal recusa.
    await expect(
      cru(db, perfil, A.id, `INSERT INTO "MovimentoEstoque" ("id","parceiroId","lojaId","insumoId","tipo","quantidadeMilesimos","valorCentavos","saldoAntesMilesimos","saldoDepoisMilesimos","insumoNomeSnapshot","unidadeSnapshot","contagemItemId") VALUES ('tsinal',$1,$2,$3,'ABERTURA',-1,0,1,0,'x','KG',$4)`, A.id, ids.vp, ids.carne, original.contagemItemId),
    ).rejects.toThrow(/MovimentoEstoque_sinal_do_tipo/);
    // ABERTURA sem o item da contagem: o CHECK do documento recusa.
    await expect(
      cru(db, perfil, A.id, `INSERT INTO "MovimentoEstoque" ("id","parceiroId","lojaId","insumoId","tipo","quantidadeMilesimos","valorCentavos","saldoAntesMilesimos","saldoDepoisMilesimos","insumoNomeSnapshot","unidadeSnapshot") VALUES ('tsemdoc',$1,$2,$3,'ABERTURA',1,0,0,1,'x','KG')`, A.id, ids.vp, ids.carne),
    ).rejects.toThrow(/MovimentoEstoque_documento_do_tipo/);
    // Estorno de verdade (espelho) entra uma vez; o segundo bate no índice único.
    const estornado = (await a.movimentoEstoque.findFirst({ where: { estornoDeId: { not: null } } }))!;
    await expect(
      cru(
        db,
        perfil,
        A.id,
        `INSERT INTO "MovimentoEstoque" ("id","parceiroId","lojaId","insumoId","tipo","quantidadeMilesimos","valorCentavos","saldoAntesMilesimos","saldoDepoisMilesimos","insumoNomeSnapshot","unidadeSnapshot","notaId","estornoDeId")
         SELECT 'tdup', "parceiroId", "lojaId", "insumoId", "tipo", "quantidadeMilesimos", "valorCentavos", 0, "quantidadeMilesimos", "insumoNomeSnapshot", "unidadeSnapshot", "notaId", "estornoDeId" FROM "MovimentoEstoque" WHERE "id" = $1`,
        estornado.id,
      ),
    ).rejects.toThrow(/estornoDeId|unique|duplicate/i);
  });

  it('concluir enquanto alguém salva (Delivery): um dos dois vence, nunca os dois pela metade', async () => {
    const c = (await obterContagemDeAbertura(a, DONA(), ids.delivery))!;
    const conf = (await conferenciaDaAbertura(a, DONA(), ids.delivery))!;
    const item = c.itens.find((i) => i.nome === 'Pão brioche')!;
    const [salvou, concluiu] = await Promise.all([
      contar(DONA(), 'Gil', ids.delivery, item, '', '12'),
      concluirAbertura(a, DONA(), ids.delivery, { versao: conf.contagem!.versao, confirmarNaoContados: true }, 'Marina'),
    ]);
    const fechada = (await a.contagem.findFirst({ where: { lojaId: ids.delivery, status: { not: 'CANCELADA' } } }))!;
    if (concluiu.ok) {
      // Concluiu primeiro: o número chegou depois e não entrou.
      expect(salvou).toMatchObject({ ok: false, fechada: true });
      expect(fechada.status).toBe('FECHADA');
      expect(await a.movimentoEstoque.count({ where: { lojaId: ids.delivery } })).toBe(0);
    } else {
      // Salvou primeiro: a conclusão viu a versão mudar e não gravou nada.
      expect(salvou).toMatchObject({ ok: true });
      expect(concluiu).toMatchObject({ conflito: true });
      expect(fechada.status).toBe('ABERTA');
    }
    expect(await razaoCoerente()).toEqual({ divergentes: 0, quebrados: 0 });
  });

  it('descartar a contagem em andamento (motivo obrigatório): nada no razão, dá para recomeçar', async () => {
    const ainda = await a.contagem.findFirst({ where: { lojaId: ids.delivery, status: 'ABERTA' } });
    if (!ainda) return; // a corrida acima concluiu: nada a descartar
    expect(await descartarAbertura(a, DONA(), ids.delivery, '', 'Marina')).toMatchObject({ ok: false, erros: { motivo: expect.any(String) } });
    expect(await descartarAbertura(a, DONA(), ids.delivery, 'Começamos errado', 'Marina')).toMatchObject({ ok: true });
    expect((await situacaoDoEstoque(a, DONA())).find((l) => l.id === ids.delivery)!.estado).toBe('NAO_ABERTO');
    const de = await iniciarAbertura(a, DONA(), ids.delivery, 'Marina');
    expect(de.ok && !('jaFeito' in de && de.jaFeito)).toBe(true);
  });

  it('isolamento: o parceiro B não enxerga a contagem, o saldo nem o razão de A (nem por SQL cru no contexto dele)', async () => {
    expect(await b.movimentoEstoque.count()).toBe(0);
    expect(await b.saldoEstoque.count()).toBe(0);
    expect(await b.contagem.count()).toBe(0);
    expect(await obterEstoqueDaLoja(b, DONA(), ids.vp)).toBeNull();
    expect(await iniciarAbertura(b, DONA(), ids.vp, 'Bia')).toMatchObject({ ok: false, naoEncontrado: true });
    const [r] = await b.sql<{ n: number }>`SELECT count(*)::int AS n FROM "MovimentoEstoque"`;
    if (perfil.rls) expect(r.n).toBe(0);
    expect((await situacaoDoEstoque(b, DONA())).map((l) => l.nome)).toEqual(['Loja B']);
  });
});
