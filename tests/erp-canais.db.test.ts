/**
 * ERP 1.9 · Custo por canal no Postgres de verdade:
 * - camadas do "Burger cheddar" (loja · delivery · iFood) exatas, com o
 *   produto de venda da casa criado na 1ª gravação e o histórico na ficha;
 * - isolamento: B não lê nem grava na ficha de A; embalagem de outro parceiro
 *   recusada; taxa do iFood por parceiro (a de A não vale em B);
 * - permissões pela server action: operador não grava; gerente grava as
 *   embalagens e NÃO a taxa; a dona grava a taxa;
 * - concorrência: duas abas nas embalagens (impressão) e na taxa (versão), e
 *   a primeira configuração em corrida (único parceiro × canal);
 * - nota da caixa kraft mais cara (1.5) sobe o delivery e o iFood, não a loja;
 * - renomear a ficha leva o nome do produto de venda.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-canais.db.test.ts
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
import { cadastrarInsumoDeTeste as cadastrarInsumo, SEM_NOTA_FISCAL } from './erp-db-apoio';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { cadastrarFornecedor, lancarNota } from '@/lib/erp/compras';
import { cadastrarFicha, editarFicha, obterFicha } from '@/lib/erp/fichas';
import { importarFichas } from '@/lib/erp/ficha-importar';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { custoPorCanal, embalagensParaEscolher, obterTaxaDoIfood, salvarEmbalagens, salvarTaxaDoIfood } from '@/lib/erp/canais';
import { porQueIncompleto, totalEmTexto, type EmbalagemDigitada } from '@/lib/erp/canal-campos';
import { listarHistorico } from '@/lib/erp/historico';
import { compararFracoes, type Fracao } from '@/lib/erp/unidades';
import { resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import * as fichasDaSessao from '@/app/erp/fichas/actions';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const sp = (t: string) => t.replace(/\s/g, ' ');
const igual = (a: Fracao | null, num: bigint, den: bigint) => expect(a && compararFracoes(a, { num, den })).toBe(0);

describe.skipIf(!URL_TESTE)('ERP 1.9 · custo por canal (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `c${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string };
  let B: { id: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const ids: Record<string, string> = {};

  const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR'): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
  const ctxDe = (cliente: ClienteDoParceiro, parceiro: { id: string }, perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR', autorNome: string) => () => ({
    cliente,
    alcance: alcanceDe(perfilBase),
    parceiro,
    sessao: { userId: 'u', autorNome },
    bloqueio: null,
    pessoa: { setores: [] },
  });

  const camadas = async (cliente: ClienteDoParceiro, fichaId: string) => {
    const f = (await obterFicha(cliente, fichaId))!;
    return (await custoPorCanal(cliente, f))!;
  };
  const linha = (canal: string, insumoId: string, quantidade: string, unidade = 'un'): EmbalagemDigitada => ({ canal, insumoId, quantidade, unidade });
  const formDasEmbalagens = (impressao: string, linhas: EmbalagemDigitada[]) => {
    const f = new FormData();
    f.set('impressao', impressao);
    for (const l of linhas) {
      f.append('emb_canal', l.canal);
      f.append('emb_insumo', l.insumoId);
      f.append('emb_quantidade', l.quantidade);
      f.append('emb_unidade', l.unidade);
    }
    return f;
  };

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Canais A', slug: `canais-a-${sufixo}`, status: 'ATIVO' } });
    B = await db.parceiroFlow.create({ data: { nome: 'Canais B', slug: `canais-b-${sufixo}`, status: 'ATIVO' } });
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    for (const [chave, campos] of Object.entries({
      pao: { tipo: 'INGREDIENTE', nome: 'Pão brioche', unidade: 'UN', conteudo: '12', preco: '18,00' },
      blend: { tipo: 'INGREDIENTE', nome: 'Blend bovino', unidade: 'KG', conteudo: '5', preco: '94,90', conservacao: 'CONGELADO' },
      caixa: { tipo: 'EMBALAGEM', nome: 'Caixa kraft', unidade: 'UN', conteudo: '100', preco: '89,00' },
      guardanapo: { tipo: 'EMBALAGEM', nome: 'Guardanapo', unidade: 'UN', conteudo: '1000', preco: '4,00' },
      sacola: { tipo: 'EMBALAGEM', nome: 'Sacola', unidade: 'UN', conteudo: '100', preco: '25,00' },
    })) {
      const r = await cadastrarInsumo(a, { escala: 'base', ...campos });
      if (!r.ok) throw new Error(`${chave}: ${JSON.stringify(r)}`);
      ids[chave] = r.id;
    }
    const f = await cadastrarFicha(
      a,
      {
        nome: 'Burger cheddar',
        tipo: 'PRATO',
        rendimento: '1',
        itens: [
          { insumoId: ids.pao, quantidade: '1', unidade: 'un' },
          { insumoId: ids.blend, quantidade: '180', unidade: 'g' },
        ],
      },
      { tipo: 'manter' },
      'Marina',
    );
    if (!f.ok) throw new Error(JSON.stringify(f));
    ids.burger = f.id;
    const caixaB = await cadastrarInsumo(b, { escala: 'base', tipo: 'EMBALAGEM', nome: 'Caixa de B', unidade: 'UN', conteudo: '100', preco: '50,00' });
    if (!caixaB.ok) throw new Error('caixa B');
    ids.caixaB = caixaB.id;
    const fb = await cadastrarFicha(
      b,
      { nome: 'Burger de B', tipo: 'PRATO', rendimento: '1', itens: [{ insumoId: ids.caixaB, quantidade: '1', unidade: 'un' }] },
      { tipo: 'manter' },
      'Bia',
    );
    if (!fb.ok) throw new Error(JSON.stringify(fb));
    ids.burgerB = fb.id;
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
  });

  it('antes de configurar: loja = porção da ficha (R$ 4,92); delivery sem embalagem; iFood incompleto (taxa não configurada); nenhum produto criado', async () => {
    const c = await camadas(a, ids.burger);
    expect(c.produtoId).toBeNull();
    expect(c.impressao).toBe('');
    igual(c.canais[0].total, 49_164n, 100n);
    expect(c.canais.map((x) => x.canal)).toEqual(['LOJA', 'DELIVERY_PROPRIO', 'IFOOD']);
    expect(c.canais[2]).toMatchObject({ incompleto: true, taxa: { tipo: 'naoConfigurada' } });
    expect(porQueIncompleto(c.canais[2])).toBe('taxa do iFood não configurada');
    expect(await a.produtoVenda.count()).toBe(0);
    // Pré-preparo não se vende: sem camadas.
    expect(await custoPorCanal(a, { id: ids.burger, tipo: 'PRE_PREPARO', custo: (await obterFicha(a, ids.burger))!.custo })).toBeNull();
    // O seletor oferece só embalagens (o pão não).
    expect((await embalagensParaEscolher(a)).map((e) => e.nome)).toEqual(['Caixa kraft', 'Guardanapo', 'Sacola']);
  });

  it('permissões pela server action: operador não grava; gerente grava as embalagens; a taxa, só a dona', async () => {
    atual.ctx = ctxDe(a, A, 'OPERADOR', 'Caio');
    const r0 = await fichasDaSessao.acaoSalvarEmbalagens(ids.burger, null, formDasEmbalagens('', [linha('DELIVERY_PROPRIO', ids.caixa, '1')]));
    expect(r0).toMatchObject({ ok: false, erros: { geral: expect.any(String) } });
    expect(await a.produtoEmbalagem.count()).toBe(0);

    // A gerente monta a sacola do delivery e do iFood (o que vai no saco é operação).
    atual.ctx = ctxDe(a, A, 'GERENTE', 'Gil Gerente');
    const form = formDasEmbalagens('', [
      linha('DELIVERY_PROPRIO', ids.caixa, '1'),
      linha('DELIVERY_PROPRIO', ids.guardanapo, '2'),
      linha('IFOOD', ids.caixa, '1'),
      linha('IFOOD', ids.sacola, '1'),
      linha('IFOOD', ids.guardanapo, '2'),
    ]);
    await expect(fichasDaSessao.acaoSalvarEmbalagens(ids.burger, null, form)).rejects.toMatchObject({ url: `/erp/fichas/${ids.burger}?feito=embalagens` });
    expect(await a.produtoEmbalagem.count()).toBe(5);
    const taxaForm = new FormData();
    taxaForm.set('comissao', '23');
    taxaForm.set('pagamento', '3,2');
    taxaForm.set('versao', '');
    expect(await fichasDaSessao.acaoSalvarTaxaDoIfood(null, taxaForm)).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/preços/) } });
    expect(await a.canalConfig.count()).toBe(0);

    atual.ctx = ctxDe(a, A, 'DONO', 'Marina');
    await expect(fichasDaSessao.acaoSalvarTaxaDoIfood(null, taxaForm)).rejects.toMatchObject({ url: '/erp/fichas/canais?feito=taxa' });
    expect(await obterTaxaDoIfood(a)).toMatchObject({ taxa: { comissaoBp: 2300, pagamentoBp: 320 } });
  });

  it('camadas exatas: loja R$ 4,92 · delivery R$ 5,81 (caixa + 2 guardanapos) · iFood R$ 6,06 + 26,2% do preço; produto da casa e histórico na ficha', async () => {
    const c = await camadas(a, ids.burger);
    const [loja, delivery, ifood] = c.canais;
    igual(loja.total, 49_164n, 100n);
    igual(delivery.total, 58_144n, 100n);
    expect(delivery.embalagens.map((e) => e.nome)).toEqual(['Caixa kraft', 'Guardanapo']);
    igual(ifood.semTaxa, 60_644n, 100n);
    expect(ifood).toMatchObject({ incompleto: false, total: null, taxa: { tipo: 'sobrePreco', totalBp: 2620 } });
    expect(sp(totalEmTexto(ifood))).toBe('R$ 6,06 + 26,2% do preço');
    const produto = (await a.produtoVenda.findFirst({ where: { fichaId: ids.burger } }))!;
    expect(produto).toMatchObject({ nome: 'Burger cheddar', marcaId: null });
    const h = await listarHistorico(a, { de: [{ entidade: 'FichaTecnica', ids: [ids.burger] }], limite: 5, verPrecos: true });
    expect(h[0]).toMatchObject({ acao: 'ALTEROU', autorNome: 'Gil Gerente' });
    expect(h[0].mudancas).toEqual(
      expect.arrayContaining([
        // 1.10 (herança b da 1.9): de "Nenhuma" para a lista = só o que entrou.
        expect.objectContaining({ campo: 'embalagens do delivery · entrou', antes: null, depois: 'Caixa kraft 1 un · Guardanapo 2 un' }),
        expect.objectContaining({ campo: 'embalagens do iFood · entrou', antes: null, depois: 'Caixa kraft 1 un · Guardanapo 2 un · Sacola 1 un' }),
      ]),
    );
    const hc = await listarHistorico(a, { entidade: 'CanalConfig', limite: 5, verPrecos: true });
    expect(hc[0]).toMatchObject({ acao: 'CRIOU', autorNome: 'Marina' });
    expect(hc[0].mudancas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ campo: 'comissão', depois: '23%' }),
        expect.objectContaining({ campo: 'pagamento online', depois: '3,2%' }),
      ]),
    );
  });

  it('nota da caixa kraft mais cara (R$ 99,00 o cento) sobe o delivery e o iFood em 10 c; a loja não muda', async () => {
    const loja = await cadastrarLoja(a, { nome: 'Vila da Penha' }, 'Marina');
    const forn = await cadastrarFornecedor(a, { nome: 'Embalagens Rio', ...SEM_NOTA_FISCAL }, 'Marina');
    if (!loja.ok || !forn.ok) throw new Error('loja/fornecedor');
    const dona = alcanceDe('DONO');
    const n = await lancarNota(
      a,
      dona,
      {
        lojaId: loja.id,
        fornecedorId: forn.id,
        numero: '77',
        serie: '',
        data: hojeNoRio(),
        frete: '',
        total: '99,00',
        itens: [{ insumoId: ids.caixa, embalagem: 'padrao', quantidade: '1', valor: '99,00' }],
      },
      'Marina',
    );
    expect(n.ok).toBe(true);
    const [l, d, i] = (await camadas(a, ids.burger)).canais;
    igual(l.total, 49_164n, 100n);
    igual(d.total, 59_144n, 100n);
    igual(i.semTaxa, 61_644n, 100n);
    igual(d.embalagens[0].valor, 99n, 1n);
  });

  it('isolamento: B não lê nem grava na ficha de A; embalagem de B recusada em A; a taxa de A não vale em B', async () => {
    expect(await obterFicha(b, ids.burger)).toBeNull();
    expect(await salvarEmbalagens(b, ids.burger, { impressao: '', linhas: [linha('IFOOD', ids.caixaB, '1')] }, 'Bia')).toMatchObject({
      ok: false,
      naoEncontrado: true,
    });
    const c = await camadas(a, ids.burger);
    const comB = await salvarEmbalagens(a, ids.burger, { impressao: c.impressao, linhas: [linha('IFOOD', ids.caixaB, '1')] }, 'Marina');
    expect(comB).toMatchObject({ ok: false, erros: { 'emb-IFOOD-0': expect.stringMatching(/não encontrada/) } });
    // Embalagem de A em ficha de B: também não existe para B.
    expect(await salvarEmbalagens(b, ids.burgerB, { impressao: '', linhas: [linha('IFOOD', ids.caixa, '1')] }, 'Bia')).toMatchObject({
      ok: false,
      erros: { 'emb-IFOOD-0': expect.any(String) },
    });
    // B ainda não configurou: o iFood de B está incompleto, mesmo com A configurada.
    expect((await camadas(b, ids.burgerB)).canais[2]).toMatchObject({ incompleto: true, taxa: { tipo: 'naoConfigurada' } });
    expect(await salvarTaxaDoIfood(b, { comissao: '12', pagamento: '', versao: '' }, 'Bia')).toMatchObject({ ok: true });
    expect((await obterTaxaDoIfood(b)).taxa).toEqual({ comissaoBp: 1200, pagamentoBp: 0 });
    expect((await obterTaxaDoIfood(a)).taxa).toEqual({ comissaoBp: 2300, pagamentoBp: 320 });
    // O banco também: a FK composta recusa embalagem de B no produto de A.
    const produtoA = (await a.produtoVenda.findFirst({ where: { fichaId: ids.burger } }))!.id;
    await expect(
      a.produtoEmbalagem.create({ data: { parceiroId: A.id, produtoId: produtoA, canal: 'IFOOD', insumoId: ids.caixaB, quantidadeMilesimos: 1000 } }),
    ).rejects.toThrow();
  });

  it('concorrência: duas abas nas embalagens (uma grava, a outra recebe "alguém mudou"); taxa com versão velha recusada; primeira configuração em corrida', async () => {
    const c = await camadas(a, ids.burger);
    const so = (q: string) => [
      linha('DELIVERY_PROPRIO', ids.caixa, '1'),
      linha('DELIVERY_PROPRIO', ids.guardanapo, q),
      linha('IFOOD', ids.caixa, '1'),
      linha('IFOOD', ids.sacola, '1'),
      linha('IFOOD', ids.guardanapo, '2'),
    ];
    const [x, y] = await Promise.all([
      salvarEmbalagens(a, ids.burger, { impressao: c.impressao, linhas: so('3') }, 'Ana'),
      salvarEmbalagens(a, ids.burger, { impressao: c.impressao, linhas: so('4') }, 'Bia'),
    ]);
    expect([x, y].filter((r) => r.ok)).toHaveLength(1);
    expect([x, y].find((r) => !r.ok)).toMatchObject({ ok: false, conflito: true });
    expect(await a.produtoEmbalagem.count({ where: { canal: 'DELIVERY_PROPRIO' } })).toBe(2);
    // Mesma lista de novo = nada muda, sem histórico novo.
    const antes = await a.historicoAlteracao.count();
    const atual = await camadas(a, ids.burger);
    const q = atual.embalagens.find((e) => e.canal === 'DELIVERY_PROPRIO' && e.nome === 'Guardanapo')!.quantidadeMilesimos / 1000;
    expect(await salvarEmbalagens(a, ids.burger, { impressao: atual.impressao, linhas: so(String(q)) }, 'Ana')).toMatchObject({ ok: true, mudou: [] });
    expect(await a.historicoAlteracao.count()).toBe(antes);
    // Taxa: a tela velha (versão de antes) não sobrescreve.
    const t = await obterTaxaDoIfood(a);
    expect(await salvarTaxaDoIfood(a, { comissao: '12', pagamento: '3,2', versao: t.versao }, 'Marina')).toMatchObject({ ok: true });
    expect(await salvarTaxaDoIfood(a, { comissao: '25', pagamento: '3,2', versao: t.versao }, 'Marina')).toMatchObject({ ok: false, conflito: true });
    expect((await obterTaxaDoIfood(a)).taxa).toEqual({ comissaoBp: 1200, pagamentoBp: 320 });
    // Primeira configuração em corrida (parceiro novo): uma entra, a outra relê.
    const C = await db.parceiroFlow.create({ data: { nome: 'Canais C', slug: `canais-c-${sufixo}`, status: 'ATIVO' } });
    const cc = doParceiro(C.id, db);
    try {
      const [p, s] = await Promise.all([
        salvarTaxaDoIfood(cc, { comissao: '23', pagamento: '', versao: '' }, 'X'),
        salvarTaxaDoIfood(cc, { comissao: '12', pagamento: '', versao: '' }, 'Y'),
      ]);
      expect([p, s].filter((r) => r.ok)).toHaveLength(1);
      expect([p, s].find((r) => !r.ok)).toMatchObject({ conflito: true });
      expect(await cc.canalConfig.count()).toBe(1);
    } finally {
      await limparParceiros(db, perfil, [C.id]);
    }
  });

  it('regras: só embalagem; pré-preparo não tem canal; desativada sai do seletor mas fica se já estava; renomear a ficha leva o produto junto', async () => {
    const c = await camadas(a, ids.burger);
    expect(await salvarEmbalagens(a, ids.burger, { impressao: c.impressao, linhas: [linha('IFOOD', ids.pao, '1')] }, 'Marina')).toMatchObject({
      ok: false,
      erros: { 'emb-IFOOD-0': expect.stringMatching(/não é embalagem/) },
    });
    const molho = await cadastrarFicha(
      a,
      {
        nome: 'Molho da casa',
        tipo: 'PRE_PREPARO',
        rendimento: '1',
        rendimentoUnidade: 'kg',
        itens: [{ insumoId: ids.blend, quantidade: '100', unidade: 'g' }],
      },
      { tipo: 'manter' },
      'Marina',
    );
    expect(molho.ok).toBe(true);
    expect(await salvarEmbalagens(a, (molho as { id: string }).id, { impressao: '', linhas: [] }, 'Marina')).toMatchObject({
      ok: false,
      erros: { geral: expect.stringMatching(/Pré-preparo/) },
    });
    // A sacola desativada: some do seletor; segue no iFood (já estava) e o custo continua contando.
    await a.insumo.update({ where: { id: ids.sacola }, data: { ativo: false } });
    expect((await embalagensParaEscolher(a)).map((e) => e.nome)).not.toContain('Sacola');
    expect((await embalagensParaEscolher(a, [ids.sacola])).find((e) => e.nome === 'Sacola')).toMatchObject({ ativo: false });
    const linhasDe = (x: Awaited<ReturnType<typeof camadas>>) => x.embalagens.map((e) => linha(e.canal, e.insumoId, String(e.quantidadeMilesimos / 1000)));
    expect(await salvarEmbalagens(a, ids.burger, { impressao: c.impressao, linhas: linhasDe(c) }, 'Marina')).toMatchObject({ ok: true, mudou: [] });
    // Renomear a ficha: o produto de venda da casa acompanha.
    const f = (await obterFicha(a, ids.burger))!;
    const r = await editarFicha(
      a,
      ids.burger,
      {
        nome: 'Burger cheddar duplo',
        tipo: 'PRATO',
        rendimento: '1',
        itens: [
          { insumoId: ids.pao, quantidade: '1', unidade: 'un' },
          { insumoId: ids.blend, quantidade: '180', unidade: 'g' },
        ],
        versao: f.versao,
      },
      { tipo: 'manter' },
      'Marina',
    );
    expect(r.ok).toBe(true);
    expect((await a.produtoVenda.findFirst({ where: { fichaId: ids.burger } }))!.nome).toBe('Burger cheddar duplo');
  });
  it('1.10 (herança a da 1.9): prato com produto de venda não vira pré-preparo — nem pela edição, nem pela planilha', async () => {
    const f = (await obterFicha(a, ids.burger))!;
    const r = await editarFicha(
      a,
      ids.burger,
      {
        nome: f.nome,
        tipo: 'PRE_PREPARO',
        rendimento: '1',
        rendimentoUnidade: 'kg',
        itens: [
          { insumoId: ids.pao, quantidade: '1', unidade: 'un' },
          { insumoId: ids.blend, quantidade: '180', unidade: 'g' },
        ],
        versao: f.versao,
      },
      { tipo: 'manter' },
      'Marina',
    );
    expect(r).toMatchObject({ ok: false, erros: { tipo: expect.stringMatching(/não vira pré-preparo/) } });
    expect((await obterFicha(a, ids.burger))!.tipo).toBe('PRATO');
    const planilha = [
      'ficha;tipo;rende;unidade_rende;descricao;modo_de_preparo;insumo;quantidade;unidade',
      `${f.nome};pré-preparo;1;kg;;;Pão brioche;1;un`,
    ].join('\n');
    expect(await importarFichas(a, planilha, 'Marina')).toMatchObject({ ok: false, erro: expect.stringMatching(/não vira pré-preparo/) });
    expect((await obterFicha(a, ids.burger))!.tipo).toBe('PRATO');
    // Sem produto de venda (nunca teve embalagem nem preço), o prato ainda pode virar pré-preparo.
    const solto = await cadastrarFicha(a, { nome: 'Prato solto', tipo: 'PRATO', rendimento: '1', itens: [{ insumoId: ids.pao, quantidade: '1', unidade: 'un' }] }, { tipo: 'manter' }, 'Marina');
    if (!solto.ok) throw new Error(JSON.stringify(solto));
    const fs = (await obterFicha(a, solto.id))!;
    const virou = await editarFicha(
      a,
      solto.id,
      { nome: 'Prato solto', tipo: 'PRE_PREPARO', rendimento: '1', rendimentoUnidade: 'un', itens: [{ insumoId: ids.pao, quantidade: '1', unidade: 'un' }], versao: fs.versao },
      { tipo: 'manter' },
      'Marina',
    );
    expect(virou.ok).toBe(true);
  });
});
